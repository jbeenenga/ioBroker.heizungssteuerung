import { expect } from "chai";
import { PeriodService } from "./PeriodService";
import { TemperatureController, type TemperatureControllerConfig } from "./TemperatureController";
import type { Period } from "../models/periods";
import type { TempTarget } from "../models/tempTarget";

describe("PeriodService", () => {
	let temperatureController: TemperatureController;
	let periodService: PeriodService;
	let testPeriods: Period[];

	beforeEach(() => {
		const config: TemperatureControllerConfig = {
			isHeatingMode: 0,
			defaultTemperature: 20,
			startStopDifference: 0.5,
			stopCoolingIfHumIsHigherThan: 70,
		};
		temperatureController = new TemperatureController(config);

		testPeriods = [
			{
				room: "enum.rooms.livingroom",
				from: "08:00",
				until: "18:00",
				heating: true,
				temp: 22,
				0: true,
				1: true,
				2: true,
				3: true,
				4: true,
				5: true,
				6: true,
			},
			{
				room: "enum.rooms.bedroom",
				from: "22:00",
				until: "06:00",
				heating: true,
				temp: 18,
				0: true,
				1: true,
				2: true,
				3: true,
				4: true,
				5: true,
				6: true,
			},
			{
				room: "enum.rooms.livingroom",
				from: "18:30",
				until: "22:00",
				heating: true,
				temp: 24,
				0: true,
				1: true,
				2: true,
				3: true,
				4: true,
				5: true,
				6: true,
			},
		];

		periodService = new PeriodService(testPeriods, temperatureController, 0);
	});

	describe("getPeriodsForRoom", () => {
		it("should return periods for specific room", () => {
			const livingRoomPeriods = periodService.getPeriodsForRoom("livingroom");
			expect(livingRoomPeriods).to.have.length(2);
			expect(livingRoomPeriods[0].temp).to.equal(22);
			expect(livingRoomPeriods[1].temp).to.equal(24);
		});

		it("should return periods for bedroom", () => {
			const bedroomPeriods = periodService.getPeriodsForRoom("bedroom");
			expect(bedroomPeriods).to.have.length(1);
			expect(bedroomPeriods[0].temp).to.equal(18);
		});

		it("should return empty array for non-existent room", () => {
			const periods = periodService.getPeriodsForRoom("kitchen");
			expect(periods).to.have.length(0);
		});
	});

	describe("calculateTemperatureForRoom", () => {
		const defaultTarget: TempTarget = { temp: 20, until: "24:00" };

		it("should return pause temperature when room is paused", () => {
			const result = periodService.calculateTemperatureForRoom(
				"livingroom",
				"12:00",
				true,
				false,
				false,
				defaultTarget,
			);

			expect(result.temp).to.equal(-100);
			expect(result.until).to.equal("pause");
		});

		it("should return boost temperature when room is boosted", () => {
			const result = periodService.calculateTemperatureForRoom(
				"livingroom",
				"12:00",
				false,
				true,
				false,
				defaultTarget,
			);

			expect(result.temp).to.equal(100);
			expect(result.until).to.equal("boost");
		});

		it("should return current target when absence is active", () => {
			const result = periodService.calculateTemperatureForRoom(
				"livingroom",
				"12:00",
				false,
				false,
				true,
				defaultTarget,
			);

			expect(result).to.deep.equal(defaultTarget);
		});

		it("should calculate period-based temperature", () => {
			const result = periodService.calculateTemperatureForRoom(
				"livingroom",
				"12:00",
				false,
				false,
				false,
				defaultTarget,
			);

			expect(result.temp).to.equal(22);
			expect(result.until).to.equal("18:00");
		});

		it("should handle priority: pause > boost > absence > periods", () => {
			const pauseResult = periodService.calculateTemperatureForRoom(
				"livingroom",
				"12:00",
				true,
				true,
				true,
				defaultTarget,
			);
			expect(pauseResult.until).to.equal("pause");
		});
	});

	describe("updatePeriods", () => {
		it("should update periods array", () => {
			const newPeriods: Period[] = [
				{
					room: "enum.rooms.kitchen",
					from: "09:00",
					until: "17:00",
					heating: true,
					temp: 19,
					0: true,
					1: true,
					2: true,
					3: true,
					4: true,
					5: true,
					6: true,
				},
			];

			periodService.updatePeriods(newPeriods);
			const kitchenPeriods = periodService.getPeriodsForRoom("kitchen");
			expect(kitchenPeriods).to.have.length(1);
			expect(kitchenPeriods[0].temp).to.equal(19);

			const livingRoomPeriods = periodService.getPeriodsForRoom("livingroom");
			expect(livingRoomPeriods).to.have.length(0);
		});
	});

	describe("getAllPeriods", () => {
		it("should return copy of all periods", () => {
			const periods = periodService.getAllPeriods();
			expect(periods).to.have.length(3);

			periods.push({
				room: "enum.rooms.test",
				from: "10:00",
				until: "16:00",
				heating: true,
				temp: 25,
				0: true,
				1: true,
				2: true,
				3: true,
				4: true,
				5: true,
				6: true,
			});

			expect(periodService.getAllPeriods()).to.have.length(3);
		});
	});

	describe("validatePeriod", () => {
		it("should validate correct period", () => {
			const validPeriod: Period = {
				room: "enum.rooms.test",
				from: "08:00",
				until: "18:00",
				heating: true,
				temp: 21,
				0: true,
				1: true,
				2: true,
				3: true,
				4: true,
				5: true,
				6: true,
			};

			expect(periodService.validatePeriod(validPeriod)).to.be.true;
		});

		it("should reject invalid period", () => {
			const invalidPeriod: Period = {
				room: "enum.rooms.test",
				from: "25:00",
				until: "18:00",
				heating: true,
				temp: 21,
				0: true,
				1: true,
				2: true,
				3: true,
				4: true,
				5: true,
				6: true,
			};

			expect(periodService.validatePeriod(invalidPeriod)).to.be.false;
		});
	});

	describe("correctPeriod", () => {
		it("should correct period time format", () => {
			const period: Period = {
				room: "enum.rooms.test",
				from: "8:5",
				until: "18:0",
				heating: true,
				temp: 21,
				0: true,
				1: true,
				2: true,
				3: true,
				4: true,
				5: true,
				6: true,
			};

			periodService.correctPeriod(period);
			expect(period.from).to.equal("08:05");
			expect(period.until).to.equal("18:00");
		});
	});

	describe("cooling mode", () => {
		beforeEach(() => {
			const config: TemperatureControllerConfig = {
				isHeatingMode: 1,
				defaultTemperature: 24,
				startStopDifference: 1.0,
				stopCoolingIfHumIsHigherThan: 70,
			};
			temperatureController = new TemperatureController(config);

			const coolingPeriods: Period[] = [
				{
					room: "enum.rooms.livingroom",
					from: "08:00",
					until: "18:00",
					heating: false,
					temp: 22,
					0: true,
					1: true,
					2: true,
					3: true,
					4: true,
					5: true,
					6: true,
				},
			];

			periodService = new PeriodService(coolingPeriods, temperatureController, 1);
		});

		it("should return correct temperatures for cooling mode", () => {
			const defaultTarget: TempTarget = { temp: 24, until: "24:00" };

			const pauseResult = periodService.calculateTemperatureForRoom(
				"livingroom",
				"12:00",
				true,
				false,
				false,
				defaultTarget,
			);
			expect(pauseResult.temp).to.equal(100);

			const boostResult = periodService.calculateTemperatureForRoom(
				"livingroom",
				"12:00",
				false,
				true,
				false,
				defaultTarget,
			);
			expect(boostResult.temp).to.equal(-100);
		});
	});
});
