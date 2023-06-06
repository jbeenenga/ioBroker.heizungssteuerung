"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var utils = __toESM(require("@iobroker/adapter-core"));
class Heizungssteuerung extends utils.Adapter {
  constructor(options = {}) {
    super({
      ...options,
      name: "heizungssteuerung"
    });
    this.on("ready", this.onReady.bind(this));
    this.on("unload", this.onUnload.bind(this));
    this.roomNames = [];
    this.rooms = {};
  }
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
    if (this.interval != void 0) {
      this.clearInterval(this.interval);
    }
    this.interval = this.setInterval(this.check.bind(this), this.config.updateIntervall * 1e3);
  }
  async check() {
    const now = new Date().toLocaleTimeString([], { hourCycle: "h23", hour: "2-digit", minute: "2-digit" });
    this.log.debug("current time is " + now);
    const boostedRooms = await this.buildSpecialRoomsList("boost", this.config.boostIntervall);
    const pausedRooms = await this.buildSpecialRoomsList("pause", this.config.pauseIntervall);
    const roomTempMap = await this.buildDefaultRoomTempMap(now);
    const pauseAll = await this.getStateAsync("Actions.pauseAll");
    if (pauseAll != void 0 && pauseAll.val == true) {
      if (pauseAll.ts > new Date().getTime() - this.config.pauseIntervall * 6e4) {
        this.log.info("State pauseAll is active so all engines will be deactivated");
        this.roomNames.forEach((value) => pausedRooms.push(value));
      } else {
        this.setStateAsync("Actions.pauseAll", false);
        this.log.info("State pauseAll was deactivated");
      }
    }
    const boostAll = await this.getStateAsync("Actions.boostAll");
    if (boostAll != void 0 && boostAll.val == true) {
      if (boostAll.ts > new Date().getTime() - this.config.boostIntervall * 6e4) {
        this.log.info("State boostAll is active so all engines will be deactivated");
        this.roomNames.forEach((value) => boostedRooms.push(value));
      } else {
        this.setStateAsync("Actions.boostAll", false);
        this.log.info("State boostAll was deactivated");
      }
    }
    this.roomNames.forEach((currentRoom) => this.fillRommTemperatures(currentRoom, pausedRooms, boostedRooms, roomTempMap, now));
    this.log.debug("Temperatures will be set like: " + JSON.stringify(roomTempMap));
    for (let i = 0; i < this.roomNames.length; i++) {
      this.setTemperatureForRoom(this.roomNames[i], roomTempMap.get(this.roomNames[i]));
    }
  }
  fillRommTemperatures(currentRoom, pausedRooms, boostedRooms, roomTempMap, now) {
    this.log.debug("start check for " + currentRoom);
    if (pausedRooms.includes(currentRoom)) {
      this.log.debug(currentRoom + " is paused");
      roomTempMap.set(currentRoom, { "temp": -100, "until": "pause" });
      return;
    }
    if (boostedRooms.includes(currentRoom)) {
      this.log.debug(currentRoom + " is boosed");
      roomTempMap.set(currentRoom, { "temp": 100, "until": "boost" });
      return;
    }
    const periodsForRoom = this.getPeriodsForRoom(currentRoom);
    this.log.debug("found following periods for room " + currentRoom + ": " + JSON.stringify(periodsForRoom));
    periodsForRoom.forEach((period) => {
      if (period.from > now && period.from < roomTempMap.get(currentRoom).until) {
        this.log.debug("targetUntil for room " + currentRoom + " will be set to " + period.from);
        roomTempMap.get(currentRoom).until = period.from;
      }
      if (roomTempMap.get(currentRoom).until > now && roomTempMap.get(currentRoom).until != "24:00") {
        return;
      }
      if (this.config.isHeatingMode == 0 == period.heating && this.isCurrentPeriod(period, now)) {
        this.log.debug("The period is matching " + JSON.stringify(period));
        roomTempMap.set(currentRoom, { "temp": period["temp"], "until": period["until"] });
      } else {
        this.log.debug("The period is not matching " + JSON.stringify(period));
      }
    });
  }
  getPeriodsForRoom(roomName) {
    const periods = new Array();
    this.config.periods.forEach((period) => {
      if (period.room == "enum.rooms." + roomName) {
        periods.push(period);
      }
    });
    return periods;
  }
  async buildDefaultRoomTempMap(now) {
    const roomTempMap = /* @__PURE__ */ new Map();
    for (let i = 0; i < this.roomNames.length; i++) {
      const room = this.roomNames[i];
      const targetTemperatureFromState = await this.getStateAsync("Temperatures." + room + ".target");
      const targetTemperatureUntilFromState = await this.getStateAsync("Temperatures." + room + ".targetUntil");
      if (targetTemperatureFromState == void 0 || targetTemperatureUntilFromState == void 0) {
        roomTempMap.set(room, { "temp": this.config.defaultTemperature, "until": "24:00" });
      } else {
        this.log.debug("Target until from state is " + JSON.stringify(targetTemperatureUntilFromState));
        if (targetTemperatureUntilFromState.val < now || targetTemperatureUntilFromState.val == "boost" || targetTemperatureUntilFromState.val == "pause") {
          this.log.debug("Target until was set to 24:00");
          roomTempMap.set(room, { "temp": this.config.defaultTemperature, "until": "24:00" });
        } else {
          roomTempMap.set(room, { "temp": Number(targetTemperatureFromState.val), "until": String(targetTemperatureUntilFromState.val) });
        }
      }
    }
    return roomTempMap;
  }
  async buildFunctionToRoomMap(functionId, functionName) {
    this.setForeignObjectNotExists(functionId, { "type": "enum", "common": { "name": functionName, "members": [] }, "native": {}, "_id": functionId });
    const functionToRoomMap = /* @__PURE__ */ new Map();
    const funcTemp = await this.getForeignObjectAsync(functionId);
    if (funcTemp == void 0) {
      return functionToRoomMap;
    }
    for (let i = 0; i < funcTemp.common["members"].length; i++) {
      for (let j = 0; j < this.roomNames.length; j++) {
        for (let k = 0; k < this.rooms.result["enum.rooms." + this.roomNames[j]]["common"]["members"].length; k++) {
          if (this.rooms.result["enum.rooms." + this.roomNames[j]]["common"]["members"][k] == funcTemp["common"]["members"][i]) {
            functionToRoomMap.set(this.roomNames[j], funcTemp["common"]["members"][i]);
          }
        }
      }
    }
    return functionToRoomMap;
  }
  async setTemperatureForRoom(room, targetTemperature) {
    if (this.tempSensorMap.get(room) == void 0) {
      this.log.info("Temperature sensor for room " + room + " not found");
      return;
    }
    if (this.engineMap.get(room) == void 0) {
      this.log.info("Engine for room " + room + " not found");
      return;
    }
    const tempState = await this.getForeignStateAsync(this.tempSensorMap.get(room));
    if (tempState == void 0) {
      return;
    }
    const temp = Number(tempState.val);
    this.log.debug("In " + room + " it is " + temp + " and should be " + targetTemperature.temp);
    if (temp == null) {
      this.log.warn("Temperature for room " + room + " is not defined");
      return;
    }
    let humidity = await this.getForeignStateAsync(this.humSensorMap.get(room));
    this.writeTemperaturesIntoState(room, temp, humidity, targetTemperature);
    if (this.config.isHeatingMode == 0) {
      if (temp < targetTemperature.temp - this.config.startStopDifference) {
        this.log.debug("set " + this.engineMap.get(room) + " to true");
        this.setForeignStateAsync(this.engineMap.get(room), true);
      }
      if (temp > targetTemperature.temp + this.config.startStopDifference) {
        this.log.debug("set " + this.engineMap.get(room) + " to false");
        this.setForeignStateAsync(this.engineMap.get(room), false);
      }
    } else {
      if (humidity != void 0 && humidity.val != void 0 && this.config.stopCoolingIfHumIsHigherThan < Number(humidity.val)) {
        this.log.info("Deactivate engine for " + room + " because humidity maximum reached");
        this.setForeignStateAsync(this.engineMap.get(room), false);
        return;
      }
      if (temp < targetTemperature.temp - this.config.startStopDifference) {
        this.log.debug("set " + this.engineMap.get(room) + " to false");
        this.setForeignStateAsync(this.engineMap.get(room), false);
      }
      if (temp > targetTemperature.temp + this.config.startStopDifference) {
        this.log.debug("set " + this.engineMap.get(room) + " to true");
        this.setForeignStateAsync(this.engineMap.get(room), true);
      }
    }
  }
  async buildSpecialRoomsList(actionName, validIntervall) {
    const boostedRooms = new Array();
    const boostValidUntil = new Date().getTime() - validIntervall * 6e4;
    this.log.debug("validIntervall: " + validIntervall);
    for (let i = 0; i < this.roomNames.length; i++) {
      const boost = await this.getStateAsync("Actions." + this.roomNames[i] + "." + actionName);
      if (boost != void 0 && boost.val == true) {
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
  writeTemperaturesIntoState(room, temp, humidity, targetTemperature) {
    this.setStateAsync("Temperatures." + room + ".current", Number(temp), true);
    if (humidity != void 0 && humidity.val != void 0) {
      this.setStateAsync("Temperatures." + room + ".currentHumidity", Number(humidity.val), true);
    }
    this.setStateAsync("Temperatures." + room + ".target", targetTemperature.temp, true);
    this.setStateAsync("Temperatures." + room + ".targetUntil", targetTemperature.temp, true);
  }
  writeInitialTemperaturesIntoState() {
    this.roomNames.forEach((room) => {
      this.setObjectNotExists("Temperatures." + room + ".current", { type: "state", _id: "Temperatures." + room + ".current", native: {}, common: { type: "number", name: "Current temperature", read: true, write: false, role: "admin" } });
      this.setObjectNotExists("Temperatures." + room + ".currentHumidity", { type: "state", _id: "Temperatures." + room + ".currentHumidity", native: {}, common: { type: "number", name: "Current humidity", read: true, write: false, role: "admin" } });
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
    if (!this.isPeriodActiveToday(period, day)) {
      return false;
    }
    if (now < period.from || now > period.until) {
      return false;
    }
    return true;
  }
  isPeriodActiveToday(period, day) {
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
  onUnload(callback) {
    try {
      if (this.interval != void 0) {
        this.clearInterval(this.interval);
      }
      this.connected = false;
      callback();
    } catch (e) {
      callback();
    }
  }
}
if (require.main !== module) {
  module.exports = (options) => new Heizungssteuerung(options);
} else {
  (() => new Heizungssteuerung())();
}
//# sourceMappingURL=main.js.map
