"use strict";

// @ts-ignore
const { adapter, Adapter } = require("@iobroker/adapter-core");
/*
 * Created with @iobroker/create-adapter v2.1.1
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");
// @ts-ignore
//const { createLoggerMock } = require("@iobroker/testing/build/tests/unit/mocks/mockLogger");


// Load your modules here, e.g.:
// const fs = require("fs");

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
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		this.tempSensorMap = await this.buildFunctionToRoomMap("enum.functions.temperature", "Temperature");
		this.humSensorMap = await this.buildFunctionToRoomMap("enum.functions.humidity", "Humidity");
		this.engineMap = await this.buildFunctionToRoomMap("enum.functions.engine", "Engine");
		this.log.debug("tempSensorMap created: " + JSON.stringify(this.tempSensorMap));
		this.log.debug("humSensorMap created: " + JSON.stringify(this.humSensorMap));
		this.log.debug("engineMap created: " + JSON.stringify(this.engineMap));
		if (this.interval1 != undefined) {
			this.clearInterval(this.interval1);
		}
		this.interval1 = this.setInterval(this.check.bind(this), 5000);
	}

	async check() {
		const handledRooms = [];
		for (let i = 0; i < this.config.periods.length; i++) {
			if ((this.config.isHeatingMode == 0) == this.config.periods[i]["heating"] && this.isCurrentPeriod(this.config.periods[i])) {
				this.log.debug("The period is matching " + JSON.stringify(this.config.periods[i]));
				this.setTemperatureForRoom(this.config.periods[i]["room"], this.config.periods[i]["temp"]);
				handledRooms.push(this.config.periods[i]["room"]);
			} else {
				this.log.debug("The period is not matching " + JSON.stringify(this.config.periods[i]));
			}
		}

		await this.deactivateUnhandledRooms(handledRooms);
	}

	async deactivateUnhandledRooms(handledRooms) {
		const rooms = await this.getEnumAsync("rooms");
		const roomNames = Object.keys(rooms.result);
		for (let i = 0; i < roomNames.length; i++) {
			if (!handledRooms.includes(roomNames[i]) && this.engineMap != undefined && this.engineMap[roomNames[i]] != undefined) {
				this.setForeignStateAsync(this.engineMap[roomNames[i]], 0);
			}
		}
	}

	async buildFunctionToRoomMap(functionId, functionName) {
		this.setForeignObjectNotExists(functionId, { "type": "enum", "common": { "name": functionName, "members": [] }, "native": {}, "_id": functionId });
		const functionToRoomMap = {};

		const funcTemp = await this.getForeignObjectAsync(functionId);
		const rooms = await this.getEnumAsync("rooms");

		if (funcTemp == undefined) {
			return functionToRoomMap;
		}

		for (let i = 0; i < funcTemp.common["members"].length; i++) {
			const roomNames = Object.keys(rooms.result);
			for (let j = 0; j < roomNames.length; j++) {
				for (let k = 0; k < rooms["result"][roomNames[j]]["common"]["members"].length; k++) {
					if (rooms["result"][roomNames[j]]["common"]["members"][k] == funcTemp["common"]["members"][i]) {
						functionToRoomMap[roomNames[j]] = funcTemp["common"]["members"][i];
					}
				}
			}
		}
		return functionToRoomMap;
	}

	async setTemperatureForRoom(room, goalTemperature) {
		if (this.tempSensorMap == undefined || this.tempSensorMap[room] == undefined) {
			this.log.warn("tempSensorMap was not filled correctly");
			return;
		}
		if (this.engineMap == undefined || this.engineMap[room] == undefined) {
			this.log.warn("engineMap was not filled correctly");
			return;
		}
		const tempState = await this.getForeignStateAsync(this.tempSensorMap[room]);
		if (tempState == undefined) {
			return;
		}
		const temp = tempState.val;
		this.log.info("Es sind " + temp + " und es sollen sein " + goalTemperature + "ss");

		if (temp == null) {
			this.log.warn("Temperature for room " + room + " is not defined");
			return;
		}

		if (this.config.isHeatingMode == 0) {
			if (temp < (Number(goalTemperature) - 1 / 2)) {
				this.log.debug("set " + this.engineMap[room] + " to 1");
				this.setForeignStateAsync(this.engineMap[room], true);
			}
			if (temp > (Number(goalTemperature) + 1 / 2)) {
				this.log.debug("set " + this.engineMap[room] + " to 0");
				this.setForeignStateAsync(this.engineMap[room], 0);
			}
		} else {
			if (this.humSensorMap != undefined && this.humSensorMap[room] != undefined) {
				const humidity = await this.getForeignStateAsync(this.humSensorMap[room]);
				if (humidity != undefined && humidity.val != undefined && this.humSensorMap[room] < humidity.val) {
					this.setForeignStateAsync(this.engineMap[room], false);
					return;
				}

			}
			if (temp < (Number(goalTemperature) - 1 / 2)) {
				this.log.warn("set " + this.engineMap[room] + " to 0");
				this.setForeignStateAsync(this.engineMap[room], 0);
			}
			if (temp > (Number(goalTemperature) + 1 / 2)) {
				this.log.warn("set " + this.engineMap[room] + " to 1");

				this.setForeignStateAsync(this.engineMap[room], 1);
			}
		}

	}



	isCurrentPeriod(period) {
		let day = new Date().getDay() - 1;
		day = day < 0 ? 6 : day;
		this.log.info("tag ist " + day);
		if (!period[day]) {
			return false;
		}
		const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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