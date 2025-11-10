/*
 * Created with @iobroker/create-adapter v2.1.1
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from "@iobroker/adapter-core";
import type { Period } from "./models/periods";
import type { TempTarget } from "./models/tempTarget";
import type { RoomsEnumResult } from "./models/roomEnum";
import { TimeUtils } from "./services/TimeUtils";
import { AITemperatureController, type AITemperatureControllerConfig } from "./services/AITemperatureController";
import { PeriodService } from "./services/PeriodService";
import { RoomManager } from "./services/RoomManager";
import { WeatherService } from "./services/WeatherService";
import { WeatherBasedController, type WeatherBasedControllerConfig } from "./services/WeatherBasedController";
import type { HeatingHistoryData } from "./models/heatingHistory";

class Heizungssteuerung extends utils.Adapter {
	roomNames: string[];
	rooms: RoomsEnumResult;
	tempSensorMap!: Map<string, string>;
	humSensorMap!: Map<string, string>;
	engineMap!: Map<string, string>;
	interval!: ioBroker.Interval | undefined;
	roomManager!: RoomManager;
	temperatureController!: AITemperatureController;
	periodService!: PeriodService;
	weatherService!: WeatherService;
	weatherBasedController!: WeatherBasedController;

	public constructor(options: Partial<utils.AdapterOptions> = {}) {
		super({
			...options,
			name: "heizungssteuerung",
		});
		this.on("ready", this.onReady.bind(this));
		this.on("unload", this.onUnload.bind(this));
		this.roomNames = [];
		this.rooms = { result: {} };
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady(): Promise<void> {
		this.rooms = (await this.getEnumAsync("rooms")) as RoomsEnumResult;
		this.roomManager = new RoomManager(this.rooms);
		this.roomNames = this.roomManager.buildRoomNames();

		const tempControllerConfig: AITemperatureControllerConfig = {
			isHeatingMode: this.config.isHeatingMode,
			defaultTemperature: this.config.defaultTemperature,
			startStopDifference: this.config.startStopDifference,
			stopCoolingIfHumIsHigherThan: this.config.stopCoolingIfHumIsHigherThan,
			enableAI: this.config.enableAI || false,
			aiModelPath: this.config.aiModelPath || `${this.namespace}.ai-models`,
			aiConfidenceThreshold: this.config.aiConfidenceThreshold || 0.6,
			aiMinTrainingData: this.config.aiMinTrainingData || 20,
			aiTrainingEpochs: this.config.aiTrainingEpochs || 50,
			aiLearningRate: this.config.aiLearningRate || 0.001,
			aiAutoRetrain: this.config.aiAutoRetrain !== false,
			aiRetrainInterval: this.config.aiRetrainInterval || 24,
		};
		this.temperatureController = new AITemperatureController(
			tempControllerConfig,
			(level, message) => {
				switch (level) {
					case "debug":
						this.log.debug(message);
						break;
					case "info":
						this.log.info(message);
						break;
					case "warn":
						this.log.warn(message);
						break;
					case "error":
						this.log.error(message);
						break;
				}
			},
			async (data: HeatingHistoryData) => {
				await this.setStateAsync("AI.history", JSON.stringify(data), true);
			},
		);
		this.periodService = new PeriodService(
			this.config.periods as Period[],
			this.temperatureController,
			this.config.isHeatingMode,
		);

		this.weatherService = new WeatherService(this);
		const weatherControllerConfig: WeatherBasedControllerConfig = {
			enableWeatherControl: this.config.enableWeatherControl || false,
			weatherStatePath: this.config.weatherStatePath || "",
			isHeatingMode: this.config.isHeatingMode,
			heatingOutsideTemperatureThreshold: this.config.heatingOutsideTemperatureThreshold || 15,
			coolingOutsideTemperatureThreshold: this.config.coolingOutsideTemperatureThreshold || 24,
		};
		this.weatherBasedController = new WeatherBasedController(weatherControllerConfig);

		this.tempSensorMap = await this.buildFunctionToRoomMap("enum.functions.temperature", "Temperature");
		this.humSensorMap = await this.buildFunctionToRoomMap("enum.functions.humidity", "Humidity");
		this.engineMap = await this.buildFunctionToRoomMap("enum.functions.engine", "Engine");
		this.log.debug(`tempSensorMap created: ${JSON.stringify(this.tempSensorMap)}`);
		this.log.debug(`humSensorMap created: ${JSON.stringify(this.humSensorMap)}`);
		this.log.debug(`engineMap created: ${JSON.stringify(this.engineMap)}`);

		this.initGeneralStates();
		this.initRoomStates();
		this.initAIStates();
		if (this.config.resetTemperaturesOnStart) {
			this.writeInitialTemperaturesIntoState();
		}

		// Load AI history and models (async initialization)
		await this.loadAIHistory();
		if (this.temperatureController.isAIEnabled()) {
			await this.temperatureController.loadModels(this.roomNames);
		}

		if (this.interval != undefined) {
			this.clearInterval(this.interval);
		}
		this.interval = this.setInterval(this.check.bind(this), this.config.updateIntervall * 1000);
	}

	private async check(): Promise<void> {
		const now = TimeUtils.getCurrentTimeString();
		const nowAsDate = TimeUtils.getCurrentDateTimeString();
		this.log.debug(`current time is ${now}`);

		//-------------------------------------------------
		// check weather conditions
		//-------------------------------------------------
		let outsideTemperature: number | null = null;
		if (this.weatherBasedController && this.config.enableWeatherControl) {
			outsideTemperature = await this.weatherService.getOutsideTemperature(this.config.weatherStatePath);
			const weatherAllowed = this.weatherBasedController.shouldAllowOperation(outsideTemperature);

			if (weatherAllowed === false) {
				this.log.info(
					`Weather control: Operation blocked. Outside temp: ${outsideTemperature}°C, ` +
						`${this.weatherBasedController.getControlDescription()}`,
				);
				// Deactivate all engines due to weather conditions
				for (const roomName of this.roomNames) {
					const engineId = this.engineMap.get(roomName);
					if (engineId) {
						await this.setForeignStateAsync(engineId, false);
					}
				}
				return; // Skip all other heating/cooling logic
			} else if (weatherAllowed === true) {
				this.log.debug(
					`Weather control: Operation allowed. Outside temp: ${outsideTemperature}°C, ` +
						`${this.weatherBasedController.getControlDescription()}`,
				);
			}
		}

		const boostedRooms = await this.buildSpecialRoomsList("boost", this.config.boostIntervall);
		const pausedRooms = await this.buildSpecialRoomsList("pause", this.config.pauseIntervall);
		const roomTempMap = await this.buildDefaultRoomTempMap(now);

		//-------------------------------------------------
		// check pause all
		//-------------------------------------------------
		const pauseAll = await this.getStateAsync("Actions.pauseAll");
		const absenceUntil = await this.getStateAsync("Actions.absenceUntil");
		if (pauseAll != undefined && pauseAll.val == true) {
			if (pauseAll.ts > TimeUtils.getTimestampMinusInterval(this.config.pauseIntervall)) {
				this.log.info("State pauseAll is active so all engines will be deactivated");
				this.roomNames.forEach(value => pausedRooms.push(value));
			} else {
				await this.setStateAsync("Actions.pauseAll", false);
				this.log.info("State pauseAll was deactivated");
			}
		}

		//-------------------------------------------------
		// check absence
		//-------------------------------------------------
		const absenceActive = !(absenceUntil == null || absenceUntil.val == null) && absenceUntil.val > nowAsDate;

		//-------------------------------------------------
		// check boost all
		//-------------------------------------------------
		const boostAll = await this.getStateAsync("Actions.boostAll");
		if (boostAll != undefined && boostAll.val == true) {
			if (boostAll.ts > TimeUtils.getTimestampMinusInterval(this.config.boostIntervall)) {
				this.log.info("State boostAll is active so all engines will be deactivated");
				this.roomNames.forEach(value => boostedRooms.push(value));
			} else {
				await this.setStateAsync("Actions.boostAll", false);
				this.log.info("State boostAll was deactivated");
			}
		}

		this.roomNames.forEach(currentRoom => {
			const currentTempTarget = roomTempMap.get(currentRoom);
			if (currentTempTarget) {
				const updatedTarget = this.periodService.calculateTemperatureForRoom(
					currentRoom,
					now,
					pausedRooms.includes(currentRoom),
					boostedRooms.includes(currentRoom),
					absenceActive,
					currentTempTarget,
				);
				roomTempMap.set(currentRoom, updatedTarget);
			}
		});

		this.log.debug(`Temperatures will be set like: ${JSON.stringify(roomTempMap)}`);

		for (let i = 0; i < this.roomNames.length; i++) {
			await this.setTemperatureForRoom(
				this.roomNames[i],
				roomTempMap.get(this.roomNames[i]),
				outsideTemperature || undefined,
			);
		}

		// Check if AI models need retraining
		await this.temperatureController.checkAndRetrain();
	}

	/**
	 * Get all periods configured for a specific room
	 *
	 * @param roomName name of the room
	 * @returns Array of periods for the specified room
	 */

	/**
	 * Build a map of target temperatures for all rooms based on current state
	 *
	 * @param now current time as string formatted as "HH:MM"
	 * @returns Map of room names to target temperature configurations
	 */
	async buildDefaultRoomTempMap(now: string): Promise<Map<string, TempTarget>> {
		const roomTempMap = new Map<string, TempTarget>();
		for (let i = 0; i < this.roomNames.length; i++) {
			const room = this.roomNames[i];
			const targetTemperatureFromState = await this.getStateAsync(`Temperatures.${room}.target`);
			const targetTemperatureUntilFromState = await this.getStateAsync(`Temperatures.${room}.targetUntil`);
			if (targetTemperatureFromState == undefined || targetTemperatureUntilFromState == undefined) {
				roomTempMap.set(room, this.temperatureController.createDefaultTempTarget());
			} else {
				this.log.debug(`Target until from state is ${JSON.stringify(targetTemperatureUntilFromState)}`);
				if (
					this.temperatureController.shouldUseDefaultTemperature(
						Number(targetTemperatureFromState.val),
						String(targetTemperatureUntilFromState.val),
						now,
					)
				) {
					this.log.debug("Target until was set to 24:00");
					roomTempMap.set(room, this.temperatureController.createDefaultTempTarget());
				} else {
					roomTempMap.set(room, {
						temp: Number(targetTemperatureFromState.val),
						until: String(targetTemperatureUntilFromState.val),
					});
				}
			}
		}
		return roomTempMap;
	}

	/**
	 * Build a map of function members to room names
	 *
	 * @param functionId id of the function
	 * @param functionName name of the function
	 * @returns Map of room names to function member IDs
	 */
	private async buildFunctionToRoomMap(functionId: string, functionName: string): Promise<Map<string, string>> {
		this.setForeignObjectNotExists(functionId, {
			type: "enum",
			common: { name: functionName, members: [] },
			native: {},
			_id: functionId,
		});
		const functionToRoomMap = new Map<string, string>();
		const funcTemp = await this.getForeignObjectAsync(functionId);

		if (funcTemp == undefined) {
			return functionToRoomMap;
		}

		for (const tempMember of funcTemp.common.members) {
			for (const roomName of this.roomNames) {
				for (const roomMember of this.rooms.result[`enum.rooms.${roomName}`].common.members) {
					if (roomMember === tempMember) {
						functionToRoomMap.set(roomName, tempMember);
					}
				}
			}
		}
		return functionToRoomMap;
	}

	/**
	 * Set the target temperature for a specific room and control the engine accordingly
	 *
	 * @param room current room name
	 * @param targetTemperature target temperature configuration
	 * @param outsideTemp outside temperature for AI context
	 */
	async setTemperatureForRoom(
		room: string,
		targetTemperature: TempTarget | undefined,
		outsideTemp?: number,
	): Promise<void> {
		const engine = this.engineMap.get(room);
		if (!engine || !targetTemperature) {
			return;
		}
		if (this.tempSensorMap.get(room) == undefined) {
			this.log.info(`Temperature sensor for room ${room} not found`);
			return;
		}
		const tempSensorName = this.tempSensorMap.get(room);
		if (!tempSensorName) {
			return;
		}
		const tempState = await this.getForeignStateAsync(tempSensorName);
		if (tempState == undefined) {
			return;
		}
		const temp = Number(tempState.val);
		this.log.debug(`In ${room} it is ${temp} and should be ${targetTemperature.temp}`);

		if (temp == null) {
			this.log.warn(`Temperature for room ${room} is not defined`);
			return;
		}
		const humiditySensor = this.humSensorMap.get(room);
		const humidity = humiditySensor ? await this.getForeignStateAsync(humiditySensor) : undefined;

		this.writeTemperaturesIntoState(room, temp, humidity, targetTemperature);

		const humidityValue = humidity?.val ? Number(humidity.val) : undefined;

		// Get current engine state for AI context
		const engineState = await this.getForeignStateAsync(engine);
		const lastEngineState = engineState?.val === true;

		// Create AI context
		const aiContext = this.temperatureController.getAIContext(room, outsideTemp);
		aiContext.lastEngineState = lastEngineState;

		const shouldActivate = this.temperatureController.shouldActivateEngine(
			temp,
			targetTemperature.temp,
			humidityValue,
			aiContext,
		);

		if (shouldActivate === true) {
			this.log.debug(`set ${engine} to true`);
			await this.setForeignStateAsync(engine, true);
		} else if (shouldActivate === false) {
			this.log.debug(`set ${engine} to false`);
			await this.setForeignStateAsync(engine, false);
		}
	}

	/**
	 * Build a list of rooms with special state (boost or pause)
	 *
	 * @param actionName name of the current action
	 * @param validIntervall time until action is not valid in minutes
	 * @returns Array of room names with the specified action active
	 */
	private async buildSpecialRoomsList(actionName: string, validIntervall: number): Promise<Array<string>> {
		const boostedRooms = new Array<string>();
		const boostValidUntil = TimeUtils.getTimestampMinusInterval(validIntervall);
		this.log.debug(`validIntervall: ${validIntervall}`);
		for (let i = 0; i < this.roomNames.length; i++) {
			const boost = await this.getStateAsync(`Actions.${this.roomNames[i]}.${actionName}`);
			if (boost != undefined && boost.val == true) {
				if (boost.ts > boostValidUntil) {
					boostedRooms.push(this.roomNames[i]);
				} else {
					await this.setStateAsync(`Actions.${this.roomNames[i]}.${actionName}`, false);
					void this.setState(`Temperatures.${this.roomNames[i]}.targetUntil`, "00:00", true);
				}
			}
		}
		return boostedRooms;
	}

	initRoomStates(): void {
		for (let i = 0; i < this.roomNames.length; i++) {
			const roomName = this.roomNames[i];
			void this.setObjectNotExists(`Actions.${roomName}.boost`, {
				type: "state",
				_id: `Actions.${roomName}.boost`,
				native: {},
				common: {
					type: "boolean",
					name: "Activate boost for this room",
					read: true,
					write: true,
					role: "switch",
					def: false,
				},
			});
			void this.setObjectNotExists(`Actions.${roomName}.pause`, {
				type: "state",
				_id: `Actions.${roomName}.pause`,
				native: {},
				common: {
					type: "boolean",
					name: "Activate pause for this room",
					read: true,
					write: true,
					role: "switch",
					def: false,
				},
			});
		}
	}

	initGeneralStates(): void {
		void this.setObjectNotExists("Actions.pauseAll", {
			type: "state",
			_id: "Actions.pauseAll",
			native: {},
			common: {
				type: "boolean",
				name: "Activate pause for any room",
				read: true,
				write: true,
				role: "switch",
				def: false,
			},
		});
		void this.setObjectNotExists("Actions.boostAll", {
			type: "state",
			_id: "Actions.boostAll",
			native: {},
			common: {
				type: "boolean",
				name: "Activate boost for any room",
				read: true,
				write: true,
				role: "switch",
				def: false,
			},
		});
		void this.setObjectNotExists("Actions.absenceUntil", {
			type: "state",
			_id: "Actions.absenceUntil",
			native: {},
			common: {
				type: "string",
				// prettier-ignore
				name: "Date and time until absence mode should be active (Format-Examlpe: \"01.01.2025, 15:30\")",
				read: true,
				write: true,
				role: "date",
				def: "01.01.2025, 15:30",
			},
		});
	}

	/**
	 * Write temperature and humidity values to the state
	 *
	 * @param room name of the room
	 * @param temp temperature to set
	 * @param humidity State including current humidity
	 * @param targetTemperature target temperature configuration
	 */
	writeTemperaturesIntoState(
		room: string,
		temp: number,
		humidity: ioBroker.State | null | undefined,
		targetTemperature: TempTarget,
	): void {
		void this.setStateAsync(`Temperatures.${room}.current`, Number(temp), true);
		if (humidity != undefined && humidity.val != undefined) {
			void this.setStateAsync(`Temperatures.${room}.currentHumidity`, Number(humidity.val), true);
		}
		void this.setStateAsync(`Temperatures.${room}.target`, targetTemperature.temp, true);
		void this.setStateAsync(`Temperatures.${room}.targetUntil`, targetTemperature.until, true);
	}

	writeInitialTemperaturesIntoState(): void {
		this.roomNames.forEach(room => {
			void this.setObjectNotExists(`Temperatures.${room}.current`, {
				type: "state",
				_id: `Temperatures.${room}.current`,
				native: {},
				common: {
					type: "number",
					name: "Current temperature",
					read: true,
					write: false,
					role: "value.temperature",
				},
			});
			void this.setObjectNotExists(`Temperatures.${room}.currentHumidity`, {
				type: "state",
				_id: `Temperatures.${room}.currentHumidity`,
				native: {},
				common: { type: "number", name: "Current humidity", read: true, write: false, role: "value.humidity" },
			});
			void this.setObjectNotExists(`Temperatures.${room}.target`, {
				type: "state",
				_id: `Temperatures.${room}.target`,
				native: {},
				common: {
					type: "number",
					name: "Target temperature",
					read: true,
					write: true,
					role: "level.temperature",
				},
			});
			void this.setObjectNotExists(`Temperatures.${room}.targetUntil`, {
				type: "state",
				_id: `Temperatures.${room}.target`,
				native: {},
				common: { type: "string", name: "Target temperature until", read: true, write: true, role: "date" },
			});
		});
		this.roomNames.forEach(room => {
			void this.setStateAsync(`Temperatures.${room}.target`, this.config.defaultTemperature, true);
			void this.setStateAsync(`Temperatures.${room}.targetUntil`, "24:00", true);
		});
	}

	/**
	 * Initialize AI-related states
	 */
	initAIStates(): void {
		void this.setObjectNotExists("AI.enabled", {
			type: "state",
			_id: "AI.enabled",
			native: {},
			common: {
				type: "boolean",
				name: "AI control enabled",
				read: true,
				write: true,
				role: "switch",
				def: this.config.enableAI || false,
			},
		});

		void this.setObjectNotExists("AI.history", {
			type: "state",
			_id: "AI.history",
			native: {},
			common: {
				type: "string",
				name: "AI learning history (JSON)",
				read: true,
				write: false,
				role: "json",
			},
		});

		void this.setObjectNotExists("AI.status", {
			type: "state",
			_id: "AI.status",
			native: {},
			common: {
				type: "string",
				name: "AI status information (JSON)",
				read: true,
				write: false,
				role: "json",
			},
		});

		// Subscribe to AI enabled state changes
		this.subscribeStates("AI.enabled");
		this.on("stateChange", async (id, state) => {
			if (id === `${this.namespace}.AI.enabled` && state && !state.ack) {
				this.log.info(`AI control ${state.val ? "enabled" : "disabled"} by user`);
				this.temperatureController.setAIEnabled(state.val === true);
				await this.setStateAsync("AI.enabled", state.val, true);
			}
		});

		// Update AI status periodically
		setInterval(async () => {
			const status = this.temperatureController.getAIStatus();
			await this.setStateAsync("AI.status", JSON.stringify(status, null, 2), true);
		}, 60000); // Every minute
	}

	/**
	 * Load AI history from state
	 */
	async loadAIHistory(): Promise<void> {
		try {
			const historyState = await this.getStateAsync("AI.history");
			if (historyState && historyState.val) {
				const historyData = JSON.parse(historyState.val as string) as HeatingHistoryData;
				this.temperatureController.loadHistory(historyData);
				this.log.info(`[AI] Loaded history for ${Object.keys(historyData.rooms || {}).length} rooms`);
			} else {
				this.log.info("[AI] No previous history found, starting fresh");
			}
		} catch (error) {
			this.log.error(`[AI] Failed to load history: ${String(error)}`);
		}
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 *
	 * @param callback callback function to be called when cleanup is done
	 */
	onUnload(callback: () => void): void {
		try {
			// Here you must clear all timeouts or intervals that may still be active
			// clearTimeout(timeout1);
			// clearTimeout(timeout2);
			// ...
			if (this.interval != undefined) {
				this.clearInterval(this.interval);
			}

			// Cleanup AI resources
			if (this.temperatureController) {
				this.temperatureController.dispose();
				this.log.info("[AI] Resources cleaned up");
			}

			this.connected = false;
			callback();
		} catch {
			// Fixed: removed unused variable 'e'
			callback();
		}
	}
}

if (require.main !== module) {
	// Export the constructor in compact mode
	module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new Heizungssteuerung(options);
} else {
	// otherwise start the instance directly
	(() => new Heizungssteuerung())();
}
