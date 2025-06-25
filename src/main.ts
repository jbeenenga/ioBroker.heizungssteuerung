/*
 * Created with @iobroker/create-adapter v2.1.1
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from "@iobroker/adapter-core";
import type { Period } from "./models/periods";
import type { TempTarget } from "./models/tempTarget";
import type { RoomsEnumResult } from "./models/roomEnum";
import { SentryUtils } from "./lib/sentry";

class Heizungssteuerung extends utils.Adapter {
	roomNames: string[];
	rooms: RoomsEnumResult;
	tempSensorMap!: Map<string, string>;
	humSensorMap!: Map<string, string>;
	engineMap!: Map<string, string>;
	interval!: ioBroker.Interval | undefined;

	public constructor(options: Partial<utils.AdapterOptions> = {}) {
		super({
			...options,
			name: "heizungssteuerung",
		});
		this.on("ready", this.onReady.bind(this));
		this.on("unload", this.onUnload.bind(this));
		this.roomNames = [];
		this.rooms = { result: {} };

		// Initialize Sentry
		this.initializeSentry();
	}

	/**
	 * Initialize Sentry for error monitoring
	 */
	private initializeSentry(): void {
		try {
			// Initialize Sentry with the provided DSN
			SentryUtils.init(
				"https://39a9163479a6c2799e454f8ecbfcf8b1@o4509558033547264.ingest.de.sentry.io/4509558051438672",
				this.version || "unknown",
				this.namespace
			);

			SentryUtils.captureMessage("Heizungssteuerung adapter started", "info", {
				namespace: this.namespace,
				version: this.version
			});

			this.log.debug("Sentry initialized successfully");
		} catch (error) {
			this.log.warn(`Failed to initialize Sentry: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady(): Promise<void> {
		try {
			SentryUtils.addBreadcrumb("Adapter onReady started", "lifecycle");

			this.rooms = (await this.getEnumAsync("rooms")) as RoomsEnumResult;
			this.roomNames = this.buildRoomNames();
			this.tempSensorMap = await this.buildFunctionToRoomMap("enum.functions.temperature", "Temperature");
			this.humSensorMap = await this.buildFunctionToRoomMap("enum.functions.humidity", "Humidity");
			this.engineMap = await this.buildFunctionToRoomMap("enum.functions.engine", "Engine");
			this.log.debug(`tempSensorMap created: ${JSON.stringify(this.tempSensorMap)}`);
			this.log.debug(`humSensorMap created: ${JSON.stringify(this.humSensorMap)}`);
			this.log.debug(`engineMap created: ${JSON.stringify(this.engineMap)}`);

			this.initGeneralStates();
			this.initRoomStates();
			if (this.config.resetTemperaturesOnStart) {
				this.writeInitialTemperaturesIntoState();
			}

			if (this.interval != undefined) {
				this.clearInterval(this.interval);
			}
			this.interval = this.setInterval(this.check.bind(this), this.config.updateIntervall * 1000);

			SentryUtils.addBreadcrumb("Adapter initialization completed", "lifecycle");
			SentryUtils.setContext("adapter_config", {
				updateInterval: this.config.updateIntervall,
				roomCount: this.roomNames.length,
				isHeatingMode: this.config.isHeatingMode
			});
		} catch (error) {
			this.log.error(`Error during adapter initialization: ${error instanceof Error ? error.message : String(error)}`);
			SentryUtils.captureException(error instanceof Error ? error : new Error(String(error)), {
				phase: "initialization",
				config: this.config
			});
			throw error;
		}
	}

	private async check(): Promise<void> {
		try {
			const now = new Date().toLocaleTimeString([], { hourCycle: "h23", hour: "2-digit", minute: "2-digit" });
			const nowAsDate = new Date().toLocaleString("de-DE", {
				day: "2-digit",
				month: "2-digit",
				year: "numeric",
				hour: "2-digit",
				minute: "2-digit",
			});
			this.log.debug(`current time is ${now}`);
			const boostedRooms = await this.buildSpecialRoomsList("boost", this.config.boostIntervall);
			const pausedRooms = await this.buildSpecialRoomsList("pause", this.config.pauseIntervall);
			const roomTempMap = await this.buildDefaultRoomTempMap(now);

			//-------------------------------------------------
			// check pause all
			//-------------------------------------------------
			const pauseAll = await this.getStateAsync("Actions.pauseAll");
			const absenceUntil = await this.getStateAsync("Actions.absenceUntil");
			if (pauseAll != undefined && pauseAll.val == true) {
				if (pauseAll.ts > new Date().getTime() - this.config.pauseIntervall * 60000) {
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
			const absenceActive = absenceUntil == null || absenceUntil.val == null || absenceUntil.val > nowAsDate;

			//-------------------------------------------------
			// check boost all
			//-------------------------------------------------
			const boostAll = await this.getStateAsync("Actions.boostAll");
			if (boostAll != undefined && boostAll.val == true) {
				if (boostAll.ts > new Date().getTime() - this.config.boostIntervall * 60000) {
					this.log.info("State boostAll is active so all engines will be activated");
					this.roomNames.forEach(value => boostedRooms.push(value));
				} else {
					await this.setStateAsync("Actions.boostAll", false);
					this.log.info("State boostAll was deactivated");
				}
			}

			this.roomNames.forEach(currentRoom =>
				this.fillRommTemperatures(currentRoom, pausedRooms, boostedRooms, roomTempMap, absenceActive, now),
			);

			this.log.debug(`Temperatures will be set like: ${JSON.stringify(roomTempMap)}`);

			for (let i = 0; i < this.roomNames.length; i++) {
				await this.setTemperatureForRoom(this.roomNames[i], roomTempMap.get(this.roomNames[i]));
			}
		} catch (error) {
			this.log.error(`Error during check cycle: ${error instanceof Error ? error.message : String(error)}`);
			SentryUtils.captureException(error instanceof Error ? error : new Error(String(error)), {
				phase: "check_cycle",
				roomCount: this.roomNames?.length
			});
		}
	}

	private fillRommTemperatures(
		currentRoom: string,
		pausedRooms: Array<string>,
		boostedRooms: Array<string>,
		roomTempMap: Map<string, TempTarget>,
		absenceActive: boolean,
		now: string,
	): void {
		this.log.debug(`start check for ${currentRoom}`);

		if (pausedRooms.includes(currentRoom)) {
			this.log.debug(`${currentRoom} is paused`);
			roomTempMap.set(currentRoom, { temp: this.getPauseTemperature(), until: "pause" });
			return;
		}
		if (boostedRooms.includes(currentRoom)) {
			this.log.debug(`${currentRoom} is boosted`);
			roomTempMap.set(currentRoom, { temp: this.getBoostTemperature(), until: "boost" });
			return;
		}
		if (absenceActive) {
			this.log.debug(`absence is active, so ${currentRoom} will be set to default temperature.`);
			return;
		}

		const periodsForRoom = this.getPeriodsForRoom(currentRoom);
		this.log.debug(`found following periods for room ${currentRoom}: ${JSON.stringify(periodsForRoom)}`);
		periodsForRoom.forEach(period => {
			const roomTemp = roomTempMap.get(currentRoom);
			if (!roomTemp) {
				return;
			}
			if (period.from > now && period.from < roomTemp.until) {
				this.log.debug(`targetUntil for room ${currentRoom} will be set to ${period.from}`);
				roomTemp.until = period.from;
			}
			if (roomTemp.until > now && roomTemp.until !== "24:00") {
				return;
			}
			if ((this.config.isHeatingMode == 0) == period.heating && this.isCurrentPeriod(period, now)) {
				this.log.debug(`The period is matching ${JSON.stringify(period)}`);
				roomTempMap.set(currentRoom, { temp: period.temp, until: period.until });
			} else {
				this.log.debug(`The period is not matching ${JSON.stringify(period)}`);
			}
		});
	}

	private isPeriodValid(period: Period, autoCorrect: boolean): boolean {
		if (
			!period.from.match("^(?:0?[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$") ||
			!period.until.match("^(?:0?[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$")
		) {
			if (autoCorrect) {
				this.tryToCorrectPeriod(period);
			}
			if (!this.isPeriodValid(period, false)) {
				this.log.warn(`The given period is not valid and will be ignored: ${JSON.stringify(period)}`);
				return false;
			}
		}
		return true;
	}

	private tryToCorrectPeriod(period: Period): void {
		period.from = this.correctTime(period.from);
		period.until = this.correctTime(period.until);
	}

	private correctTime(time: string): string {
		const timeParts = time.split(":");
		if (timeParts.length == 2) {
			while (timeParts[0].length < 2) {
				timeParts[0] = `0${timeParts[0]}`;
			}
			while (timeParts[1].length < 2) {
				timeParts[1] = `0${timeParts[1]}`;
			}
			return `${timeParts[0]}:${timeParts[1]}`;
		}
		return time;
	}

	private getBoostTemperature(): number {
		return this.config.isHeatingMode == 0 ? 100 : -100;
	}

	private getPauseTemperature(): number {
		return this.config.isHeatingMode == 0 ? -100 : 100;
	}

	/**
	 * Get all periods configured for a specific room
	 *
	 * @param roomName name of the room
	 * @returns Array of periods for the specified room
	 */
	private getPeriodsForRoom(roomName: string): Array<Period> {
		const periods = new Array<Period>();
		(this.config.periods as Period[]).forEach(period => {
			if (period.room == `enum.rooms.${roomName}`) {
				periods.push(period);
			}
		});
		return periods;
	}

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
				roomTempMap.set(room, { temp: this.config.defaultTemperature, until: "24:00" });
			} else {
				this.log.debug(`Target until from state is ${JSON.stringify(targetTemperatureUntilFromState)}`);
				if (
					targetTemperatureUntilFromState.val == null ||
					targetTemperatureUntilFromState.val < now ||
					targetTemperatureUntilFromState?.val == "boost" ||
					targetTemperatureUntilFromState?.val == "pause"
				) {
					this.log.debug("Target until was set to 24:00");
					roomTempMap.set(room, { temp: this.config.defaultTemperature, until: "24:00" });
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
		try {
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
		} catch (error) {
			this.log.error(`Error building function to room map for ${functionId}: ${error instanceof Error ? error.message : String(error)}`);
			SentryUtils.captureException(error instanceof Error ? error : new Error(String(error)), {
				functionId,
				functionName
			});
			return new Map<string, string>();
		}
	}

	/**
	 * Set the target temperature for a specific room and control the engine accordingly
	 *
	 * @param room current room name
	 * @param targetTemperature target temperature configuration
	 */
	async setTemperatureForRoom(room: string, targetTemperature: TempTarget | undefined): Promise<void> {
		try {
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

			if (this.config.isHeatingMode == 0) {
				if (temp < targetTemperature.temp - this.config.startStopDifference) {
					this.log.debug(`set ${engine} to true`);
					await this.setForeignStateAsync(engine, true);
				}
				if (temp > targetTemperature.temp + this.config.startStopDifference) {
					this.log.debug(`set ${engine} to false`);
					await this.setForeignStateAsync(engine, false);
				}
			} else {
				if (
					humidity != undefined &&
					humidity.val != undefined &&
					this.config.stopCoolingIfHumIsHigherThan < Number(humidity.val)
				) {
					this.log.info(`Deactivate engine for ${room} because humidity maximum reached`);
					await this.setForeignStateAsync(engine, false);
					return;
				}

				if (temp < targetTemperature.temp - this.config.startStopDifference) {
					this.log.debug(`set ${engine} to false`);
					await this.setForeignStateAsync(engine, false);
				}
				if (temp > targetTemperature.temp + this.config.startStopDifference) {
					this.log.debug(`set ${engine} to true`);
					await this.setForeignStateAsync(engine, true);
				}
			}
		} catch (error) {
			this.log.error(`Error setting temperature for room ${room}: ${error instanceof Error ? error.message : String(error)}`);
			SentryUtils.captureException(error instanceof Error ? error : new Error(String(error)), {
				room,
				targetTemperature
			});
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
		try {
			const boostedRooms = new Array<string>();
			const boostValidUntil = new Date().getTime() - validIntervall * 60000;
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
		} catch (error) {
			this.log.error(`Error building special rooms list for ${actionName}: ${error instanceof Error ? error.message : String(error)}`);
			SentryUtils.captureException(error instanceof Error ? error : new Error(String(error)), {
				actionName,
				validIntervall
			});
			return [];
		}
	}

	initRoomStates(): void {
		try {
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
						role: "state",
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
						role: "state",
						def: false,
					},
				});
			}
		} catch (error) {
			this.log.error(`Error initializing room states: ${error instanceof Error ? error.message : String(error)}`);
			SentryUtils.captureException(error instanceof Error ? error : new Error(String(error)), {
				phase: "room_states_init"
			});
		}
	}

	initGeneralStates(): void {
		try {
			void this.setObjectNotExists("Actions.pauseAll", {
				type: "state",
				_id: "Actions.pauseAll",
				native: {},
				common: {
					type: "boolean",
					name: "Activate pause for any room",
					read: true,
					write: true,
					role: "state",
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
					role: "state",
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
					name: "Date and time until absence mode should be active (Format-Examlpe: \"2024-01-01 14:00\")",
					read: true,
					write: true,
					role: "state",
					def: "2024-01-01 14:00",
				},
			});
		} catch (error) {
			this.log.error(`Error initializing general states: ${error instanceof Error ? error.message : String(error)}`);
			SentryUtils.captureException(error instanceof Error ? error : new Error(String(error)), {
				phase: "general_states_init"
			});
		}
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
		try {
			this.roomNames.forEach(room => {
				void this.setObjectNotExists(`Temperatures.${room}.current`, {
					type: "state",
					_id: `Temperatures.${room}.current`,
					native: {},
					common: { type: "number", name: "Current temperature", read: true, write: false, role: "state" },
				});
				void this.setObjectNotExists(`Temperatures.${room}.currentHumidity`, {
					type: "state",
					_id: `Temperatures.${room}.currentHumidity`,
					native: {},
					common: { type: "number", name: "Current humidity", read: true, write: false, role: "state" },
				});
				void this.setObjectNotExists(`Temperatures.${room}.target`, {
					type: "state",
					_id: `Temperatures.${room}.target`,
					native: {},
					common: { type: "number", name: "Target temperature", read: true, write: true, role: "state" },
				});
				void this.setObjectNotExists(`Temperatures.${room}.targetUntil`, {
					type: "state",
					_id: `Temperatures.${room}.targetUntil`,
					native: {},
					common: { type: "string", name: "Target temperature until", read: true, write: true, role: "state" },
				});
			});
			this.roomNames.forEach(room => {
				void this.setStateAsync(`Temperatures.${room}.target`, this.config.defaultTemperature, true);
				void this.setStateAsync(`Temperatures.${room}.targetUntil`, "24:00", true);
			});
		} catch (error) {
			this.log.error(`Error initializing temperature states: ${error instanceof Error ? error.message : String(error)}`);
			SentryUtils.captureException(error instanceof Error ? error : new Error(String(error)), {
				phase: "temperature_states_init"
			});
		}
	}

	/**
	 * Convert long room name to short room name
	 *
	 * @param room name of the room
	 * @returns short room name
	 */
	convertToShortRoomName(room: string): string {
		const shortRoomNameParts = room.split(".");
		return shortRoomNameParts[shortRoomNameParts.length - 1];
	}

	buildRoomNames(): string[] {
		const longRoomNames = Object.keys(this.rooms.result);

		const shortRoomNames = [];
		for (let i = 0; i < longRoomNames.length; i++) {
			shortRoomNames.push(this.convertToShortRoomName(longRoomNames[i]));
		}
		return shortRoomNames;
	}

	/**
	 * Check if a period is currently active
	 *
	 * @param period period definition to check
	 * @param now current time as string formatted as "HH:MM"
	 * @returns true if the period is currently active
	 */
	isCurrentPeriod(period: Period, now: string): boolean {
		let day = new Date().getDay() - 1;
		day = day < 0 ? 6 : day;
		if (!this.isPeriodValid(period, true)) {
			return false;
		}

		if (!this.isPeriodActiveToday(period, day)) {
			return false;
		}

		if (now < period.from || now > period.until) {
			return false;
		}
		return true;
	}

	private isPeriodActiveToday(period: Period, day: number): boolean {
		switch (day) {
			case 0: {
				return period[0];
			}
			case 1: {
				return period[1];
			}
			case 2: {
				return period[2];
			}
			case 3: {
				return period[3];
			}
			case 4: {
				return period[4];
			}
			case 5: {
				return period[5];
			}
			case 6: {
				return period[6];
			}
		}
		return false;
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 *
	 * @param callback callback function to be called when cleanup is done
	 */
	async onUnload(callback: () => void): Promise<void> {
		try {
			SentryUtils.addBreadcrumb("Adapter shutdown started", "lifecycle");
			
			// Here you must clear all timeouts or intervals that may still be active
			if (this.interval != undefined) {
				this.clearInterval(this.interval);
			}
			
			this.connected = false;
			
			// Close Sentry and wait for pending events to be sent
			await SentryUtils.close(2000);
			
			SentryUtils.captureMessage("Heizungssteuerung adapter stopped", "info");
			
			callback();
		} catch (error) {
			// Even if Sentry fails, we must call the callback
			this.log.error(`Error during shutdown: ${error instanceof Error ? error.message : String(error)}`);
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
