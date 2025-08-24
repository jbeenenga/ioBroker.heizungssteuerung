import { expect } from "chai";
import { TemperatureController, type TemperatureControllerConfig } from "./TemperatureController";

describe("TemperatureController", () => {
	describe("Heating Mode", () => {
		let controller: TemperatureController;

		beforeEach(() => {
			const config: TemperatureControllerConfig = {
				isHeatingMode: 0,
				defaultTemperature: 20,
				startStopDifference: 0.5,
				stopCoolingIfHumIsHigherThan: 70,
			};
			controller = new TemperatureController(config);
		});

		describe("getBoostTemperature", () => {
			it("should return 100 for heating mode", () => {
				expect(controller.getBoostTemperature()).to.equal(100);
			});
		});

		describe("getPauseTemperature", () => {
			it("should return -100 for heating mode", () => {
				expect(controller.getPauseTemperature()).to.equal(-100);
			});
		});

		describe("shouldActivateEngine", () => {
			it("should return true when temperature is too low", () => {
				const result = controller.shouldActivateEngine(19, 20);
				expect(result).to.be.true;
			});

			it("should return false when temperature is too high", () => {
				const result = controller.shouldActivateEngine(21, 20);
				expect(result).to.be.false;
			});

			it("should return null when temperature is within range", () => {
				const result = controller.shouldActivateEngine(20.2, 20);
				expect(result).to.be.null;
			});
		});
	});

	describe("Cooling Mode", () => {
		let controller: TemperatureController;

		beforeEach(() => {
			const config: TemperatureControllerConfig = {
				isHeatingMode: 1,
				defaultTemperature: 24,
				startStopDifference: 1.0,
				stopCoolingIfHumIsHigherThan: 70,
			};
			controller = new TemperatureController(config);
		});

		describe("getBoostTemperature", () => {
			it("should return -100 for cooling mode", () => {
				expect(controller.getBoostTemperature()).to.equal(-100);
			});
		});

		describe("getPauseTemperature", () => {
			it("should return 100 for cooling mode", () => {
				expect(controller.getPauseTemperature()).to.equal(100);
			});
		});

		describe("shouldActivateEngine", () => {
			it("should return false when temperature is too low", () => {
				const result = controller.shouldActivateEngine(22, 24);
				expect(result).to.be.false;
			});

			it("should return true when temperature is too high", () => {
				const result = controller.shouldActivateEngine(26, 24);
				expect(result).to.be.true;
			});

			it("should return null when temperature is within range", () => {
				const result = controller.shouldActivateEngine(24.5, 24);
				expect(result).to.be.null;
			});

			it("should return false when humidity is too high", () => {
				const result = controller.shouldActivateEngine(26, 24, 80);
				expect(result).to.be.false;
			});

			it("should activate when humidity is acceptable", () => {
				const result = controller.shouldActivateEngine(26, 24, 60);
				expect(result).to.be.true;
			});
		});
	});

	describe("createTempTarget", () => {
		let controller: TemperatureController;

		beforeEach(() => {
			const config: TemperatureControllerConfig = {
				isHeatingMode: 0,
				defaultTemperature: 20,
				startStopDifference: 0.5,
				stopCoolingIfHumIsHigherThan: 70,
			};
			controller = new TemperatureController(config);
		});

		it("should create a temperature target object", () => {
			const target = controller.createTempTarget(22, "18:00");
			expect(target.temp).to.equal(22);
			expect(target.until).to.equal("18:00");
		});
	});

	describe("createDefaultTempTarget", () => {
		let controller: TemperatureController;

		beforeEach(() => {
			const config: TemperatureControllerConfig = {
				isHeatingMode: 0,
				defaultTemperature: 21,
				startStopDifference: 0.5,
				stopCoolingIfHumIsHigherThan: 70,
			};
			controller = new TemperatureController(config);
		});

		it("should create default temperature target", () => {
			const target = controller.createDefaultTempTarget();
			expect(target.temp).to.equal(21);
			expect(target.until).to.equal("24:00");
		});
	});

	describe("isValidTargetUntil", () => {
		let controller: TemperatureController;

		beforeEach(() => {
			const config: TemperatureControllerConfig = {
				isHeatingMode: 0,
				defaultTemperature: 20,
				startStopDifference: 0.5,
				stopCoolingIfHumIsHigherThan: 70,
			};
			controller = new TemperatureController(config);
		});

		it("should return false for null or undefined", () => {
			expect(controller.isValidTargetUntil(null, "12:00")).to.be.false;
			expect(controller.isValidTargetUntil(undefined, "12:00")).to.be.false;
		});

		it("should return false for boost or pause", () => {
			expect(controller.isValidTargetUntil("boost", "12:00")).to.be.false;
			expect(controller.isValidTargetUntil("pause", "12:00")).to.be.false;
		});

		it("should return false when target time has passed", () => {
			expect(controller.isValidTargetUntil("10:00", "12:00")).to.be.false;
		});

		it("should return true when target time is in future", () => {
			expect(controller.isValidTargetUntil("15:00", "12:00")).to.be.true;
		});
	});

	describe("shouldUseDefaultTemperature", () => {
		let controller: TemperatureController;

		beforeEach(() => {
			const config: TemperatureControllerConfig = {
				isHeatingMode: 0,
				defaultTemperature: 20,
				startStopDifference: 0.5,
				stopCoolingIfHumIsHigherThan: 70,
			};
			controller = new TemperatureController(config);
		});

		it("should return true when target temperature is null", () => {
			expect(controller.shouldUseDefaultTemperature(null, "15:00", "12:00")).to.be.true;
		});

		it("should return true when target temperature is undefined", () => {
			expect(controller.shouldUseDefaultTemperature(undefined, "15:00", "12:00")).to.be.true;
		});

		it("should return true when target until is invalid", () => {
			expect(controller.shouldUseDefaultTemperature(22, "boost", "12:00")).to.be.true;
			expect(controller.shouldUseDefaultTemperature(22, "10:00", "12:00")).to.be.true;
		});

		it("should return false when both values are valid", () => {
			expect(controller.shouldUseDefaultTemperature(22, "15:00", "12:00")).to.be.false;
		});
	});
});
