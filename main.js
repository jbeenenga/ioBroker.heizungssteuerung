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
		this.roomNames =[];
		this.rooms = {};
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		this.rooms = await this.getEnumAsync("rooms");
		this.roomNames = Object.keys(this.rooms.result);
		this.tempSensorMap = await this.buildFunctionToRoomMap("enum.functions.temperature", "Temperature");
		this.humSensorMap = await this.buildFunctionToRoomMap("enum.functions.humidity", "Humidity");
		this.engineMap = await this.buildFunctionToRoomMap("enum.functions.engine", "Engine");
		this.log.debug("tempSensorMap created: " + JSON.stringify(this.tempSensorMap));
		this.log.debug("humSensorMap created: " + JSON.stringify(this.humSensorMap));
		this.log.debug("engineMap created: " + JSON.stringify(this.engineMap));
		if (this.interval1 != undefined) {
			this.clearInterval(this.interval1);
		}
		this.interval1 = this.setInterval(this.check.bind(this), this.config.updateIntervall * 1000);
	}

	async check() {
		const roomTempMap = await this.buildDefaultRoomTempMap();
		for (let i = 0; i < this.config.periods.length; i++) {
			if ((this.config.isHeatingMode == 0) == this.config.periods[i]["heating"] && this.isCurrentPeriod(this.config.periods[i])) {
				this.log.debug("The period is matching " + JSON.stringify(this.config.periods[i]));
				roomTempMap[this.config.periods[i]["room"]] = this.config.periods[i]["temp"];
			} else {
				this.log.debug("The period is not matching " + JSON.stringify(this.config.periods[i]));
			}
		}

		this.log.debug("Temperatures will be set like: "+ JSON.stringify(roomTempMap));

		for (let i = 0; i < this.roomNames.length; i++) {
			this.setTemperatureForRoom(this.roomNames[i], roomTempMap[this.roomNames[i]]);
		}
	}

	async buildDefaultRoomTempMap() {
		const roomTempMap = {};
		for (let i = 0; i < this.roomNames.length; i++) {
			roomTempMap[this.roomNames[i]] = this.config.defaultTemperature;
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
				for (let k = 0; k < this.rooms.result[this.roomNames[j]]["common"]["members"].length; k++) {
					if (this.rooms.result[this.roomNames[j]]["common"]["members"][k] == funcTemp["common"]["members"][i]) {
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
		this.log.debug("In " + room + " it is " + temp + " and should be " + targetTemperature);

		if (temp == null) {
			this.log.warn("Temperature for room " + room + " is not defined");
			return;
		}

		if (this.config.isHeatingMode == 0) {
			if (temp < (Number(targetTemperature) - 1 / 2)) {
				this.log.debug("set " + this.engineMap[room] + " to true");
				this.setForeignStateAsync(this.engineMap[room], true);
			}
			if (temp > (Number(targetTemperature) + 1 / 2)) {
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
			if (temp < (Number(targetTemperature) - 1 / 2)) {
				this.log.debug("set " + this.engineMap[room] + " to false");
				this.setForeignStateAsync(this.engineMap[room], false);
			}
			if (temp > (Number(targetTemperature) + 1 / 2)) {
				this.log.debug("set " + this.engineMap[room] + " to true");
				this.setForeignStateAsync(this.engineMap[room], true);
			}
		}
		this.writeTemperaturesIntoState(room, temp, targetTemperature);

	}

	writeTemperaturesIntoState(room, temp, targetTemperature){
		const shortRoomNameParts = room.split(".");
		const shortRoomName = shortRoomNameParts[shortRoomNameParts.length -1];
		this.setObjectNotExists("Temperatures."+shortRoomName+".current", {type: "state",_id:"Temperatures."+shortRoomName+".current",native:{}, common:{type:"string",  name:"Current temperature", read:true, write:false,role:"admin"}});
		this.setObjectNotExists("Temperatures."+shortRoomName+".target",{type: "state",_id:"Temperatures."+shortRoomName+".target",native:{}, common:{type:"string", name:"Target temperature", read:true, write:false,role:"admin"}});
		this.setStateAsync("Temperatures."+shortRoomName+".current", temp, true);
		this.setStateAsync("Temperatures."+shortRoomName+".target", targetTemperature, true);
	}

	isCurrentPeriod(period) {
		let day = new Date().getDay() - 1;
		day = day < 0 ? 6 : day;
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