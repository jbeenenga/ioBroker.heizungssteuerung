import { expect } from "chai";
import { RoomManager } from "./RoomManager";
import type { RoomsEnumResult } from "../models/roomEnum";

describe("RoomManager", () => {
	let roomManager: RoomManager;
	let testRooms: RoomsEnumResult;

	beforeEach(() => {
		testRooms = {
			result: {
				"enum.rooms.livingroom": {
					type: "enum",
					common: {
						name: "Living Room",
						members: ["sensor1", "actuator1"],
					},
					native: {},
					_id: "enum.rooms.livingroom",
				},
				"enum.rooms.bedroom": {
					type: "enum",
					common: {
						name: "Bedroom",
						members: ["sensor2", "actuator2"],
					},
					native: {},
					_id: "enum.rooms.bedroom",
				},
				"enum.rooms.kitchen": {
					type: "enum",
					common: {
						name: "Kitchen",
						members: ["sensor3"],
					},
					native: {},
					_id: "enum.rooms.kitchen",
				},
			},
		};

		roomManager = new RoomManager(testRooms);
	});

	describe("convertToShortRoomName", () => {
		it("should extract short name from full room identifier", () => {
			expect(roomManager.convertToShortRoomName("enum.rooms.livingroom")).to.equal("livingroom");
			expect(roomManager.convertToShortRoomName("enum.rooms.bedroom")).to.equal("bedroom");
			expect(roomManager.convertToShortRoomName("enum.rooms.master.bedroom")).to.equal("bedroom");
		});

		it("should handle single word identifiers", () => {
			expect(roomManager.convertToShortRoomName("livingroom")).to.equal("livingroom");
			expect(roomManager.convertToShortRoomName("test")).to.equal("test");
		});

		it("should handle empty string", () => {
			expect(roomManager.convertToShortRoomName("")).to.equal("");
		});
	});

	describe("buildRoomNames", () => {
		it("should return array of short room names", () => {
			const roomNames = roomManager.buildRoomNames();
			expect(roomNames).to.have.length(3);
			expect(roomNames).to.include("livingroom");
			expect(roomNames).to.include("bedroom");
			expect(roomNames).to.include("kitchen");
		});

		it("should return empty array for empty rooms", () => {
			const emptyRooms: RoomsEnumResult = { result: {} };
			const emptyRoomManager = new RoomManager(emptyRooms);
			const roomNames = emptyRoomManager.buildRoomNames();
			expect(roomNames).to.have.length(0);
		});
	});

	describe("getAllRoomIds", () => {
		it("should return array of full room identifiers", () => {
			const roomIds = roomManager.getAllRoomIds();
			expect(roomIds).to.have.length(3);
			expect(roomIds).to.include("enum.rooms.livingroom");
			expect(roomIds).to.include("enum.rooms.bedroom");
			expect(roomIds).to.include("enum.rooms.kitchen");
		});
	});

	describe("roomExists", () => {
		it("should return true for existing rooms", () => {
			expect(roomManager.roomExists("livingroom")).to.be.true;
			expect(roomManager.roomExists("bedroom")).to.be.true;
			expect(roomManager.roomExists("kitchen")).to.be.true;
		});

		it("should return false for non-existing rooms", () => {
			expect(roomManager.roomExists("bathroom")).to.be.false;
			expect(roomManager.roomExists("garage")).to.be.false;
			expect(roomManager.roomExists("")).to.be.false;
		});
	});

	describe("getRoomById", () => {
		it("should return room object for existing room", () => {
			const livingRoom = roomManager.getRoomById("livingroom");
			expect(livingRoom).to.not.be.undefined;
			expect(livingRoom?.common.name).to.equal("Living Room");
			expect(livingRoom?.common.members).to.deep.equal(["sensor1", "actuator1"]);
		});

		it("should return undefined for non-existing room", () => {
			const nonExistentRoom = roomManager.getRoomById("bathroom");
			expect(nonExistentRoom).to.be.undefined;
		});
	});

	describe("updateRooms", () => {
		it("should update rooms data", () => {
			const newRooms: RoomsEnumResult = {
				result: {
					"enum.rooms.bathroom": {
						type: "enum",
						common: {
							name: "Bathroom",
							members: ["sensor4"],
						},
						native: {},
						_id: "enum.rooms.bathroom",
					},
				},
			};

			roomManager.updateRooms(newRooms);

			expect(roomManager.roomExists("bathroom")).to.be.true;
			expect(roomManager.roomExists("livingroom")).to.be.false;

			const roomNames = roomManager.buildRoomNames();
			expect(roomNames).to.have.length(1);
			expect(roomNames[0]).to.equal("bathroom");
		});
	});

	describe("integration scenarios", () => {
		it("should handle rooms with complex naming", () => {
			const complexRooms: RoomsEnumResult = {
				result: {
					"enum.rooms.master.bedroom.suite": {
						type: "enum",
						common: {
							name: "Master Bedroom Suite",
							members: [],
						},
						native: {},
						_id: "enum.rooms.master.bedroom.suite",
					},
					"enum.rooms.guest.bathroom.1": {
						type: "enum",
						common: {
							name: "Guest Bathroom 1",
							members: [],
						},
						native: {},
						_id: "enum.rooms.guest.bathroom.1",
					},
				},
			};

			const complexRoomManager = new RoomManager(complexRooms);
			const roomNames = complexRoomManager.buildRoomNames();

			expect(roomNames).to.include("suite");
			expect(roomNames).to.include("1");
		});

		it("should preserve object references correctly", () => {
			const originalRoom = testRooms.result["enum.rooms.livingroom"];
			const retrievedRoom = roomManager.getRoomById("livingroom");

			expect(retrievedRoom).to.equal(originalRoom);
		});
	});
});
