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
		this.on("stateChange", this.onStateChange.bind(this));
		this.on("objectChange", this.onObjectChange.bind(this));
		// this.on("message", this.onMessage.bind(this));
		this.on("unload", this.onUnload.bind(this));
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		this.tempSensorMap = await this.buildFunctionToRoomMap("enum.functions.temperature", "Temperature");
		this.humSensorMap = await this.buildFunctionToRoomMap("enum.functions.humidity", "Humidity");
		this.engineMap = await this.buildFunctionToRoomMap("enum.functions.engine", "Engine");

		this.log.warn(JSON.stringify(this.tempSensorMap));
		this.log.warn(JSON.stringify(this.humSensorMap));

		this.log.info(this.config.sensors.length.toString());
		this.log.info("Ab geht die Post heute ist " + new Date().getDay());
		this.log.info(JSON.stringify(this.config.periods));

		this.interval1 = await this.setInterval(this.check.bind(this), 5000);
	}

	async check() {
		for (let i = 0; i < this.config.periods.length; i++) {
			if (this.config.isHeatingMode == this.config.periods[i]["heating"] && this.isCurrentPeriod(this.config.periods[i])) {
				this.log.warn("Die Periode ist aktuell " + JSON.stringify(this.config.periods[i]));

				this.setTemperatureForRoom(this.config.periods[i]["room"], this.config.periods[i]["temp"]);
			} else {
				this.log.info("Die Periode ist nicht aktuell " + JSON.stringify(this.config.periods[i]));
			}
		}

	}

	async buildFunctionToRoomMap(functionId, functionName) {
		this.setForeignObjectNotExists(functionId, { "type": "enum", "common": { "name": functionName, "members": [] }, "native": {}, "_id": "enum.functions.temperature" });
		const functionToRoomMap = {};

		const funcTemp = await this.getForeignObjectAsync(functionId);
		const rooms = await this.getEnumAsync("rooms");

		// @ts-ignore
		for (let i = 0; i < funcTemp["common"]["members"].length; i++) {
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

	// @ts-ignore
	async setTemperatureForRoom(room, temperature) {
		// @ts-ignore
		const temp = (await this.getForeignStateAsync(this.tempSensorMap[room])).val;

		this.log.info("Es sind " + temp + " und es sollen sein " + temperature + "ss");

		if (temp == null) {
			this.log.warn("Temperature for room " + room + " is not defined");
			return;
		}

		if (this.config.isHeatingMode == 0) {
			if (temp < (Number(temperature) - 1/2)) {
				this.log.warn("steuere " + this.engineMap[room] + "mit 1");
				this.setForeignStateAsync(this.engineMap[room], 1);
			}
			if (temp > (Number(temperature) + 1/2)) {
				this.log.warn("steuere " + this.engineMap[room] + "mit 0");

				this.setForeignStateAsync(this.engineMap[room], 0);
			}
		} else {
			this.log.warn("kühlen"+(Number(temperature) - 1/2));
			if (temp < (Number(temperature) - 1/2)) {
				this.log.warn("steuere " + this.engineMap[room] + "mit 0");

				this.setForeignStateAsync(this.engineMap[room], 0);
			}
			if (temp > (Number(temperature) + 1/2)) {
				this.log.warn("steuere " + this.engineMap[room] + "mit 1");

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
			callback();
		} catch (e) {
			callback();
		}
	}

	// If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
	// You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
	// /**
	//  * Is called if a subscribed object changes
	//  * @param {string} id
	//  * @param {ioBroker.Object | null | undefined} obj
	//  */
	onObjectChange(id, obj) {
		if (obj) {
			// The object was changed
			this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
		} else {
			// The object was deleted
			this.log.info(`object ${id} deleted`);
		}
	}

	/**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	onStateChange(id, state) {
		if (state) {
			// The state was changed
			this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
		} else {
			// The state was deleted
			this.log.info(`state ${id} deleted`);
		}
	}

	// If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
	// /**
	//  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
	//  * Using this method requires "common.messagebox" property to be set to true in io-package.json
	//  * @param {ioBroker.Message} obj
	//  */
	// onMessage(obj) {
	// 	if (typeof obj === "object" && obj.message) {
	// 		if (obj.command === "send") {
	// 			// e.g. send email or pushover or whatever
	// 			this.log.info("send command");

	// 			// Send response in callback if required
	// 			if (obj.callback) this.sendTo(obj.from, obj.command, "Message received", obj.callback);
	// 		}
	// 	}
	// }

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