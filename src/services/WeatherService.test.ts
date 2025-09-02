import { expect } from "chai";
import { WeatherService } from "./WeatherService";
import type * as utils from "@iobroker/adapter-core";

// Mock adapter for testing
class MockAdapter {
	log = {
		debug: () => {},
		warn: () => {},
		error: () => {},
	};

	getForeignStateAsync(id: string) {
		// Mock implementation based on test scenarios
		if (id === "weather.valid.temperature") {
			return { val: 22.5, ts: Date.now() };
		}
		if (id === "weather.invalid.temperature") {
			return { val: "invalid", ts: Date.now() };
		}
		if (id === "weather.null.temperature") {
			return { val: null, ts: Date.now() };
		}
		if (id === "weather.nonexistent") {
			return null;
		}
		return null;
	}
}

describe("WeatherService", () => {
	let weatherService: WeatherService;
	let mockAdapter: MockAdapter;

	beforeEach(() => {
		mockAdapter = new MockAdapter();
		weatherService = new WeatherService(mockAdapter as unknown as utils.AdapterInstance);
	});

	describe("getOutsideTemperature", () => {
		it("should return temperature for valid weather state", async () => {
			const result = await weatherService.getOutsideTemperature("weather.valid.temperature");
			expect(result).to.equal(22.5);
		});

		it("should return null for invalid temperature value", async () => {
			const result = await weatherService.getOutsideTemperature("weather.invalid.temperature");
			expect(result).to.be.null;
		});

		it("should return null for null temperature value", async () => {
			const result = await weatherService.getOutsideTemperature("weather.null.temperature");
			expect(result).to.be.null;
		});

		it("should return null for nonexistent weather state", async () => {
			const result = await weatherService.getOutsideTemperature("weather.nonexistent");
			expect(result).to.be.null;
		});

		it("should return null for empty weather state path", async () => {
			const result = await weatherService.getOutsideTemperature("");
			expect(result).to.be.null;
		});
	});

	describe("isWeatherStateValid", () => {
		it("should return true for existing weather state", async () => {
			const result = await weatherService.isWeatherStateValid("weather.valid.temperature");
			expect(result).to.be.true;
		});

		it("should return false for nonexistent weather state", async () => {
			const result = await weatherService.isWeatherStateValid("weather.nonexistent");
			expect(result).to.be.false;
		});

		it("should return false for empty weather state path", async () => {
			const result = await weatherService.isWeatherStateValid("");
			expect(result).to.be.false;
		});
	});
});
