"use strict";

/*
 * Created with @iobroker/create-adapter v2.1.1
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");

class Heizungssteuerung extends utils.Adapter {


	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		super({
			...options,
			name: "heizungssteuerung",
		});
		this.on("ready", this.onReady.bind(this));
		this.on("unload", this.onUnload.bind(this));
		this.roomNames = [];
		this.rooms = {};
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		this.rooms = await this.getEnumAsync("rooms");
		this.roomNames = this.buildRoomNames();
		this.tempSensorMap = await this.buildFunctionToRoomMap("enum.functions.temperature", "Temperature");
		this.humSensorMap = await this.buildFunctionToRoomMap("enum.functions.humidity", "Humidity");
		this.engineMap = await this.buildFunctionToRoomMap("enum.functions.engine", "Engine");
		this.log.debug("tempSensorMap created: " + JSON.stringify(this.tempSensorMap));
		this.log.debug("humSensorMap created: " + JSON.stringify(this.humSensorMap));
		this.log.debug("engineMap created: " + JSON.stringify(this.engineMap));

		this.initGeneralStates();
		this.initRoomStates();
		if (this.config.resetTemperaturesOnStart) {
			this.writeInitialTemperaturesIntoState();
		}

		if (this.interval1 != undefined) {
			this.clearInterval(this.interval1);
		}
		this.interval1 = this.setInterval(this.check.bind(this), this.config.updateIntervall * 1000);
	}

	async check() {
		const now = new Date().toLocaleTimeString([], { hourCycle: "h23", hour: "2-digit", minute: "2-digit" });
		this.log.debug("current time is " + now);
		const boostedRooms = await this.buildSpecialRoomsList("boost", this.config.boostIntervall);
		const pausedRooms = await this.buildSpecialRoomsList("pause", this.config.pauseIntervall);
		const roomTempMap = await this.buildDefaultRoomTempMap(now);

		//-------------------------------------------------
		// check pause all
		//-------------------------------------------------
		const pauseAll = await this.getStateAsync("Actions.pauseAll");
		if (pauseAll != undefined && pauseAll.val == true) {
			if (pauseAll.ts > new Date().getTime() - (this.config.pauseIntervall * 60000)) {
				this.log.info("State pauseAll is active so all engines will be deactivated");
				this.roomNames.forEach((value) => pausedRooms.push(value));
			} else {
				this.setStateAsync("Actions.pauseAll", false);
				this.log.info("State pauseAll was deactivated");
			}
		}

		//-------------------------------------------------
		// check boost all
		//-------------------------------------------------
		const boostAll = await this.getStateAsync("Actions.boostAll");
		if (boostAll != undefined && boostAll.val == true) {
			if (boostAll.ts > new Date().getTime() - (this.config.boostIntervall * 60000)) {
				this.log.info("State boostAll is active so all engines will be deactivated");
				this.roomNames.forEach((value) => boostedRooms.push(value));
			} else {
				this.setStateAsync("Actions.boostAll", false);
				this.log.info("State boostAll was deactivated");
			}
		}


		for (let i = 0; i < this.roomNames.length; i++) {
			const currentRoom = this.roomNames[i];
			this.log.debug("start check for " + currentRoom);

			if (pausedRooms.includes(currentRoom)) {
				this.log.debug(this.roomNames + " is paused");
				roomTempMap[currentRoom]["target"] = -100;
				roomTempMap[currentRoom]["targetUntil"] = "pause";

				continue;
			}
			if (boostedRooms.includes(currentRoom)) {
				this.log.debug(this.roomNames + " is boosed");
				roomTempMap[currentRoom]["target"] = 100;
				roomTempMap[currentRoom]["targetUntil"] = "boost";

				continue;
			}

			const periodsForRoom = this.getPeriodsForRoom(currentRoom);
			this.log.debug("found following periods for room " + currentRoom + ": " + JSON.stringify(periodsForRoom));
			periodsForRoom.forEach((period) => {
				if (period["from"] > now && (period["from"] < roomTempMap[currentRoom]["targetUntil"])) {
					this.log.debug("targetUntil for room " + currentRoom + " will be set to " + period["from"]);
					roomTempMap[currentRoom]["targetUntil"] = period["from"];
				}
				if (roomTempMap[currentRoom]["targetUntil"] > now && roomTempMap[currentRoom]["targetUntil"] != "24:00") {
					return;
				}
				if ((this.config.isHeatingMode == 0) == period["heating"] && this.isCurrentPeriod(period,now)) {
					this.log.debug("The period is matching " + JSON.stringify(period));
					roomTempMap[currentRoom]["target"] = period["temp"];
					roomTempMap[currentRoom]["targetUntil"] = period["until"];
				} else {
					this.log.debug("The period is not matching " + JSON.stringify(this.config.periods[i]));
				}
			});
		}

		this.log.debug("Temperatures will be set like: " + JSON.stringify(roomTempMap));

		for (let i = 0; i < this.roomNames.length; i++) {
			this.setTemperatureForRoom(this.roomNames[i], roomTempMap[this.roomNames[i]]);
		}
	}

	getPeriodsForRoom(roomName) {
		const periods = [];
		this.config.periods.forEach((period) => {
			if (period["room"] == ("enum.rooms." + roomName)) {
				periods.push(period);
			}
		});
		return periods;
	}

	async buildDefaultRoomTempMap(now) {
		const roomTempMap = {};
		for (let i = 0; i < this.roomNames.length; i++) {
			const room = this.roomNames[i];
			const targetTemperatureFromState = await this.getStateAsync("Temperatures." + room + ".target");
			const targetTemperatureUntilFromState = await this.getStateAsync("Temperatures." + room + ".targetUntil");
			if (targetTemperatureFromState == undefined || targetTemperatureUntilFromState == undefined) {
				roomTempMap[room] = { "target": this.config.defaultTemperature, "targetUntil": "24:00" };
			} else {
				// @ts-ignore
				if (targetTemperatureUntilFromState.val < now || targetTemperatureFromState.val == "boost" || targetTemperatureFromState.val == "pause") {
					this.log.debug("Target until was set to 24:00");
					roomTempMap[room] = { "target": this.config.defaultTemperature, "targetUntil": "24:00" };
				} else {
					roomTempMap[room] = { "target": targetTemperatureFromState.val, "targetUntil": targetTemperatureUntilFromState.val };
				}

			}
		}
		return roomTempMap;
	}

	async buildFunctionToRoomMap(functionId, functionName) {
		this.setForeignObjectNotExists(functionId, { "type": "enum", "common": { "name": functionName, "members": [] }, "native": {}, "_id": functionId });
		const functionToRoomMap = {};
		const funcTemp = await this.getForeignObjectAsync(functionId);

		if (funcTemp == undefined) {
			return functionToRoomMap;
		}

		for (let i = 0; i < funcTemp.common["members"].length; i++) {
			for (let j = 0; j < this.roomNames.length; j++) {
				for (let k = 0; k < this.rooms.result["enum.rooms." + this.roomNames[j]]["common"]["members"].length; k++) {
					if (this.rooms.result["enum.rooms." + this.roomNames[j]]["common"]["members"][k] == funcTemp["common"]["members"][i]) {
						functionToRoomMap[this.roomNames[j]] = funcTemp["common"]["members"][i];
					}
				}
			}
		}
		return functionToRoomMap;
	}

	async setTemperatureForRoom(room, targetTemperature) {
		if (this.tempSensorMap == undefined || this.tempSensorMap[room] == undefined) {
			this.log.info("Temperature sensor for room " + room + " not found");
			return;
		}
		if (this.engineMap == undefined || this.engineMap[room] == undefined) {
			this.log.info("Engine for room " + room + " not found");
			return;
		}
		const tempState = await this.getForeignStateAsync(this.tempSensorMap[room]);
		if (tempState == undefined) {
			return;
		}
		const temp = tempState.val;
		this.log.debug("In " + room + " it is " + temp + " and should be " + JSON.stringify(targetTemperature["target"]));

		if (temp == null) {
			this.log.warn("Temperature for room " + room + " is not defined");
			return;
		}

		this.writeTemperaturesIntoState(room, temp, targetTemperature);

		if (this.config.isHeatingMode == 0) {
			if (temp < (Number(targetTemperature["target"]) - this.config.startStopDifference)) {
				this.log.debug("set " + this.engineMap[room] + " to true");
				this.setForeignStateAsync(this.engineMap[room], true);
			}
			if (temp > (Number(targetTemperature["target"]) + this.config.startStopDifference)) {
				this.log.debug("set " + this.engineMap[room] + " to false");
				this.setForeignStateAsync(this.engineMap[room], false);
			}
		} else {
			if (this.humSensorMap != undefined && this.humSensorMap[room] != undefined) {
				const humidity = await this.getForeignStateAsync(this.humSensorMap[room]);
				if (humidity != undefined && humidity.val != undefined && this.humSensorMap[room] < humidity.val) {
					this.log.info("Deactivate engine for " + room + " because humidity maximum reached");
					this.setForeignStateAsync(this.engineMap[room], false);
					return;
				}

			}
			if (temp < (Number(targetTemperature["target"]) - this.config.startStopDifference)) {
				this.log.debug("set " + this.engineMap[room] + " to false");
				this.setForeignStateAsync(this.engineMap[room], false);
			}
			if (temp > (Number(targetTemperature["target"]) + this.config.startStopDifference)) {
				this.log.debug("set " + this.engineMap[room] + " to true");
				this.setForeignStateAsync(this.engineMap[room], true);
			}
		}

	}

	/**
	 * @param {string} actionName
	 */
	async buildSpecialRoomsList(actionName, validIntervall) {
		const boostedRooms = [];
		const boostValidUntil = new Date().getTime() - validIntervall * 60000;
		this.log.debug("validIntervall: " + validIntervall);
		for (let i = 0; i < this.roomNames.length; i++) {
			const boost = await this.getStateAsync("Actions." + this.roomNames[i] + "." + actionName);
			if (boost != undefined && boost.val == true) {
				if (boost.ts > boostValidUntil) {
					boostedRooms.push(this.roomNames[i]);
				} else {
					this.setStateAsync("Actions." + this.roomNames[i] + "." + actionName, false);
					this.setState("Temperatures." + this.roomNames[i] + ".targetUntil", "00:00", true);
				}
			}
		}
		return boostedRooms;
	}

	initRoomStates() {
		for (let i = 0; i < this.roomNames.length; i++) {
			const roomName = this.roomNames[i];
			this.setObjectNotExists("Actions." + roomName + ".boost", { type: "state", _id: "Actions." + roomName + ".boost", native: {}, common: { type: "boolean", name: "Activate boost for this room", read: true, write: true, role: "admin", def: false } });
			this.setObjectNotExists("Actions." + roomName + ".pause", { type: "state", _id: "Actions." + roomName + ".pause", native: {}, common: { type: "boolean", name: "Activate pause for this room", read: true, write: true, role: "admin", def: false } });
		}
	}

	initGeneralStates() {
		this.setObjectNotExists("Actions.pauseAll", { type: "state", _id: "Actions.pauseAll", native: {}, common: { type: "boolean", name: "Activate boost for any room", read: true, write: true, role: "admin", def: false } });
		this.setObjectNotExists("Actions.boostAll", { type: "state", _id: "Actions.boostAll", native: {}, common: { type: "boolean", name: "Activate boost for any room", read: true, write: true, role: "admin", def: false } });
	}

	writeTemperaturesIntoState(room, temp, targetTemperature) {
		this.setStateAsync("Temperatures." + room + ".current", Number(temp), true);
		this.setStateAsync("Temperatures." + room + ".target", Number(targetTemperature["target"]), true);
		this.setStateAsync("Temperatures." + room + ".targetUntil", targetTemperature["targetUntil"], true);
	}

	writeInitialTemperaturesIntoState() {
		this.roomNames.forEach((room) => {
			this.setObjectNotExists("Temperatures." + room + ".current", { type: "state", _id: "Temperatures." + room + ".current", native: {}, common: { type: "number", name: "Current temperature", read: true, write: false, role: "admin" } });
			this.setObjectNotExists("Temperatures." + room + ".target", { type: "state", _id: "Temperatures." + room + ".target", native: {}, common: { type: "number", name: "Target temperature", read: true, write: true, role: "admin" } });
			this.setObjectNotExists("Temperatures." + room + ".targetUntil", { type: "state", _id: "Temperatures." + room + ".target", native: {}, common: { type: "string", name: "Target temperature until", read: true, write: true, role: "admin" } });
		});
		this.roomNames.forEach((room) => {
			this.setStateAsync("Temperatures." + room + ".target", this.config.defaultTemperature, true);
			this.setStateAsync("Temperatures." + room + ".targetUntil", "24:00", true);
		});
	}

	convertToShortRoomName(room) {
		const shortRoomNameParts = room.split(".");
		return shortRoomNameParts[shortRoomNameParts.length - 1];
	}

	buildRoomNames() {
		const longRoomNames = Object.keys(this.rooms.result);
		const shortRoomNames = [];
		for (let i = 0; i < longRoomNames.length; i++) {
			shortRoomNames.push(this.convertToShortRoomName(longRoomNames[i]));
		}
		return shortRoomNames;

	}

	isCurrentPeriod(period, now) {
		let day = new Date().getDay() - 1;
		day = day < 0 ? 6 : day;
		if (!period[day]) {
			return false;
		}

		if (now < period["from"] || now > period["until"]) {
			return false;
		}
		return true;
	}



	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			// Here you must clear all timeouts or intervals that may still be active
			// clearTimeout(timeout1);
			// clearTimeout(timeout2);
			// ...
			if (this.interval1 != undefined) {
				this.clearInterval(this.interval1);
			}
			this.connected = false;
			callback();
		} catch (e) {
			callback();
		}
	}
}

if (require.main !== module) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	module.exports = (options) => new Heizungssteuerung(options);
} else {
	// otherwise start the instance directly
	new Heizungssteuerung();
}