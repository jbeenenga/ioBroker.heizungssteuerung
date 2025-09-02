import { expect } from "chai";
import { WeatherBasedController, type WeatherBasedControllerConfig } from "./WeatherBasedController";

describe("WeatherBasedController", () => {
	describe("Heating Mode", () => {
		let controller: WeatherBasedController;

		beforeEach(() => {
			const config: WeatherBasedControllerConfig = {
				enableWeatherControl: true,
				weatherStatePath: "weather.temperature",
				isHeatingMode: 0,
				heatingOutsideTemperatureThreshold: 15,
				coolingOutsideTemperatureThreshold: 24,
			};
			controller = new WeatherBasedController(config);
		});

		describe("shouldAllowOperation", () => {
			it("should allow heating when outside temperature is below threshold", () => {
				const result = controller.shouldAllowOperation(10);
				expect(result).to.be.true;
			});

			it("should block heating when outside temperature is above threshold", () => {
				const result = controller.shouldAllowOperation(20);
				expect(result).to.be.false;
			});

			it("should block heating when outside temperature equals threshold", () => {
				const result = controller.shouldAllowOperation(15);
				expect(result).to.be.false;
			});

			it("should allow operation when temperature is null", () => {
				const result = controller.shouldAllowOperation(null);
				expect(result).to.be.true;
			});
		});

		describe("getCurrentThreshold", () => {
			it("should return heating threshold for heating mode", () => {
				const result = controller.getCurrentThreshold();
				expect(result).to.equal(15);
			});
		});

		describe("getControlDescription", () => {
			it("should return correct description for heating mode", () => {
				const result = controller.getControlDescription();
				expect(result).to.equal("Heating only allowed if outside temperature below 15°C");
			});
		});
	});

	describe("Cooling Mode", () => {
		let controller: WeatherBasedController;

		beforeEach(() => {
			const config: WeatherBasedControllerConfig = {
				enableWeatherControl: true,
				weatherStatePath: "weather.temperature",
				isHeatingMode: 1,
				heatingOutsideTemperatureThreshold: 15,
				coolingOutsideTemperatureThreshold: 24,
			};
			controller = new WeatherBasedController(config);
		});

		describe("shouldAllowOperation", () => {
			it("should allow cooling when outside temperature is above threshold", () => {
				const result = controller.shouldAllowOperation(30);
				expect(result).to.be.true;
			});

			it("should block cooling when outside temperature is below threshold", () => {
				const result = controller.shouldAllowOperation(20);
				expect(result).to.be.false;
			});

			it("should block cooling when outside temperature equals threshold", () => {
				const result = controller.shouldAllowOperation(24);
				expect(result).to.be.false;
			});

			it("should allow operation when temperature is null", () => {
				const result = controller.shouldAllowOperation(null);
				expect(result).to.be.true;
			});
		});

		describe("getCurrentThreshold", () => {
			it("should return cooling threshold for cooling mode", () => {
				const result = controller.getCurrentThreshold();
				expect(result).to.equal(24);
			});
		});

		describe("getControlDescription", () => {
			it("should return correct description for cooling mode", () => {
				const result = controller.getControlDescription();
				expect(result).to.equal("Cooling only allowed if outside temperature above 24°C");
			});
		});
	});

	describe("Weather Control Disabled", () => {
		let controller: WeatherBasedController;

		beforeEach(() => {
			const config: WeatherBasedControllerConfig = {
				enableWeatherControl: false,
				weatherStatePath: "weather.temperature",
				isHeatingMode: 0,
				heatingOutsideTemperatureThreshold: 15,
				coolingOutsideTemperatureThreshold: 24,
			};
			controller = new WeatherBasedController(config);
		});

		describe("shouldAllowOperation", () => {
			it("should return null when weather control is disabled", () => {
				const result = controller.shouldAllowOperation(10);
				expect(result).to.be.null;
			});
		});

		describe("getControlDescription", () => {
			it("should return disabled description", () => {
				const result = controller.getControlDescription();
				expect(result).to.equal("Weather control disabled");
			});
		});
	});

	describe("updateConfig", () => {
		let controller: WeatherBasedController;

		beforeEach(() => {
			const config: WeatherBasedControllerConfig = {
				enableWeatherControl: true,
				weatherStatePath: "weather.temperature",
				isHeatingMode: 0,
				heatingOutsideTemperatureThreshold: 15,
				coolingOutsideTemperatureThreshold: 24,
			};
			controller = new WeatherBasedController(config);
		});

		it("should update configuration correctly", () => {
			const newConfig: WeatherBasedControllerConfig = {
				enableWeatherControl: false,
				weatherStatePath: "new.weather.path",
				isHeatingMode: 1,
				heatingOutsideTemperatureThreshold: 10,
				coolingOutsideTemperatureThreshold: 30,
			};

			controller.updateConfig(newConfig);

			expect(controller.shouldAllowOperation(20)).to.be.null;
			expect(controller.getCurrentThreshold()).to.equal(30);
			expect(controller.getControlDescription()).to.equal("Weather control disabled");
		});
	});
});
