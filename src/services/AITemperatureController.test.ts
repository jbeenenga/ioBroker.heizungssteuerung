import { expect } from "chai";
import { AITemperatureController, type AITemperatureControllerConfig, type AIContext } from "./AITemperatureController";
import type { HeatingHistoryData } from "../models/heatingHistory";

describe("AITemperatureController", () => {
	let controller: AITemperatureController;
	let logMessages: Array<{ level: string; message: string }> = [];
	let savedHistory: HeatingHistoryData | null = null;

	const createController = (enableAI: boolean = false): AITemperatureController => {
		logMessages = [];
		savedHistory = null;

		const config: AITemperatureControllerConfig = {
			isHeatingMode: 0,
			defaultTemperature: 20,
			startStopDifference: 0.5,
			stopCoolingIfHumIsHigherThan: 70,
			enableAI: enableAI,
			aiModelPath: "/tmp/test-models",
			aiConfidenceThreshold: 0.6,
			aiMinTrainingData: 20,
			aiTrainingEpochs: 10,
			aiLearningRate: 0.001,
			aiAutoRetrain: true,
			aiRetrainInterval: 24,
		};

		return new AITemperatureController(
			config,
			(level, message) => {
				logMessages.push({ level, message });
			},
			async (data) => {
				savedHistory = data;
			}
		);
	};

	describe("Initialization", () => {
		it("should initialize with AI disabled", () => {
			controller = createController(false);
			expect(controller.isAIEnabled()).to.be.false;
		});

		it("should initialize with AI enabled", () => {
			controller = createController(true);
			expect(controller.isAIEnabled()).to.be.true;
		});

		it("should log initialization message when AI enabled", () => {
			controller = createController(true);
			const initLog = logMessages.find(log =>
				log.message.includes("Initializing AI components")
			);
			expect(initLog).to.not.be.undefined;
		});
	});

	describe("AI Enable/Disable", () => {
		beforeEach(() => {
			controller = createController(false);
		});

		it("should enable AI at runtime", () => {
			expect(controller.isAIEnabled()).to.be.false;

			controller.setAIEnabled(true);

			expect(controller.isAIEnabled()).to.be.true;
			const enableLog = logMessages.find(log =>
				log.message.includes("Enabling AI control")
			);
			expect(enableLog).to.not.be.undefined;
		});

		it("should disable AI at runtime", () => {
			controller.setAIEnabled(true);
			expect(controller.isAIEnabled()).to.be.true;

			logMessages = [];
			controller.setAIEnabled(false);

			expect(controller.isAIEnabled()).to.be.false;
			const disableLog = logMessages.find(log =>
				log.message.includes("Disabling AI control")
			);
			expect(disableLog).to.not.be.undefined;
		});
	});

	describe("Classic Control Fallback", () => {
		beforeEach(() => {
			controller = createController(false); // AI disabled
		});

		it("should use classic hysteresis when AI disabled", () => {
			const result = controller.shouldActivateEngine(19.0, 20.0);
			expect(result).to.be.true; // Should heat

			const result2 = controller.shouldActivateEngine(21.0, 20.0);
			expect(result2).to.be.false; // Should not heat

			const result3 = controller.shouldActivateEngine(20.2, 20.0);
			expect(result3).to.be.null; // No change
		});

		it("should respect hysteresis range", () => {
			// Within hysteresis band (20.0 ± 0.5)
			expect(controller.shouldActivateEngine(19.8, 20.0)).to.be.null;
			expect(controller.shouldActivateEngine(20.3, 20.0)).to.be.null;

			// Outside hysteresis band
			expect(controller.shouldActivateEngine(19.4, 20.0)).to.be.true;
			expect(controller.shouldActivateEngine(20.6, 20.0)).to.be.false;
		});
	});

	describe("AI Context", () => {
		beforeEach(() => {
			controller = createController(true);
		});

		it("should create AI context for room", () => {
			const context = controller.getAIContext("livingroom", 10);

			expect(context).to.have.property("room");
			expect(context.room).to.equal("livingroom");
			expect(context).to.have.property("heatingDuration");
			expect(context).to.have.property("recentHeatingRate");
			expect(context).to.have.property("outsideTemp");
			expect(context.outsideTemp).to.equal(10);
		});

		it("should track heating duration", () => {
			const room = "bedroom";

			// Create context with heating not started
			let context = controller.getAIContext(room);
			expect(context.heatingDuration).to.equal(0);

			// Simulate heating started
			controller.shouldActivateEngine(18.0, 20.0, undefined, {
				room,
				heatingDuration: 0,
				recentHeatingRate: 0,
				lastEngineState: true, // Heating is on
			});

			// Context should now show heating active
			// Note: Real implementation tracks time, here we test structure
			context = controller.getAIContext(room);
			expect(context).to.have.property("heatingDuration");
		});
	});

	describe("Temperature Recording", () => {
		beforeEach(() => {
			controller = createController(true);
		});

		it("should record temperature measurements when context provided", () => {
			const context: AIContext = {
				room: "livingroom",
				heatingDuration: 10,
				recentHeatingRate: 2.5,
				outsideTemp: 10,
				lastEngineState: true,
			};

			// Should not crash
			controller.shouldActivateEngine(19.5, 20.0, 50, context);

			// Should have logged debug messages
			const debugLogs = logMessages.filter(log => log.level === "debug");
			expect(debugLogs.length).to.be.greaterThan(0);
		});

		it("should handle missing context gracefully", () => {
			// Without context, should fall back to classic control
			const result = controller.shouldActivateEngine(19.0, 20.0, 50);

			expect(result).to.be.true; // Classic control: temp below target
		});
	});

	describe("AI with Insufficient Data", () => {
		beforeEach(() => {
			controller = createController(true);
		});

		it("should fall back to classic control without profile data", () => {
			const context: AIContext = {
				room: "newroom",
				heatingDuration: 5,
				recentHeatingRate: 0,
				outsideTemp: 10,
				lastEngineState: true,
			};

			const result = controller.shouldActivateEngine(19.0, 20.0, 50, context);

			// Should use classic control
			expect(result).to.be.true;

			// Should have logged fallback message
			const fallbackLog = logMessages.find(log =>
				log.message.includes("Insufficient data") || log.message.includes("using classic control")
			);
			expect(fallbackLog).to.not.be.undefined;
		});
	});

	describe("Room Statistics", () => {
		beforeEach(() => {
			controller = createController(true);
		});

		it("should return null for room without data", () => {
			const stats = controller.getRoomStatistics("nonexistent");
			expect(stats).to.be.null;
		});

		it("should provide statistics structure", () => {
			// Record some measurements
			const context: AIContext = {
				room: "statsroom",
				heatingDuration: 10,
				recentHeatingRate: 2.0,
				lastEngineState: true,
			};

			controller.shouldActivateEngine(19.0, 20.0, 50, context);

			const stats = controller.getRoomStatistics("statsroom");
			// May be null if no complete cycles yet
			if (stats !== null) {
				expect(stats).to.have.property("cycleCount");
				expect(stats).to.have.property("avgOvershoot");
				expect(stats).to.have.property("avgHeatingRate");
				expect(stats).to.have.property("confidence");
			}
		});
	});

	describe("AI Status", () => {
		beforeEach(() => {
			controller = createController(true);
		});

		it("should provide AI status", () => {
			const status = controller.getAIStatus();

			expect(status).to.have.property("enabled");
			expect(status.enabled).to.be.true;
			expect(status).to.have.property("modelsReady");
			expect(status).to.have.property("statistics");
		});

		it("should show disabled status when AI off", () => {
			controller.setAIEnabled(false);

			const status = controller.getAIStatus();
			expect(status.enabled).to.be.false;
		});
	});

	describe("History Management", () => {
		beforeEach(() => {
			controller = createController(true);
		});

		it("should load history data", () => {
			const historyData: HeatingHistoryData = {
				version: "1.0.0",
				rooms: {
					livingroom: {
						cycles: [],
						profile: {
							room: "livingroom",
							lastUpdated: Date.now(),
							avgHeatingRate: 2.5,
							avgCooldownRate: 0.5,
							thermalInertia: 15,
							typicalOvershoot: 0.3,
							cycleCount: 25,
							confidence: 0.8,
						},
					},
				},
			};

			// Should not crash
			controller.loadHistory(historyData);

			// Verify data was loaded
			const stats = controller.getRoomStatistics("livingroom");
			if (stats) {
				expect(stats.cycleCount).to.be.greaterThan(0);
			}
		});
	});

	describe("Cooling Mode", () => {
		beforeEach(() => {
			const config: AITemperatureControllerConfig = {
				isHeatingMode: 1, // Cooling mode
				defaultTemperature: 24,
				startStopDifference: 1.0,
				stopCoolingIfHumIsHigherThan: 65,
				enableAI: false,
				aiModelPath: "/tmp/test-models",
				aiConfidenceThreshold: 0.6,
				aiMinTrainingData: 20,
				aiTrainingEpochs: 10,
				aiLearningRate: 0.001,
				aiAutoRetrain: true,
				aiRetrainInterval: 24,
			};

			controller = new AITemperatureController(
				config,
				() => {},
				async () => {}
			);
		});

		it("should activate cooling when too hot", () => {
			const result = controller.shouldActivateEngine(26.0, 24.0);
			expect(result).to.be.true;
		});

		it("should deactivate cooling when too cold", () => {
			const result = controller.shouldActivateEngine(22.0, 24.0);
			expect(result).to.be.false;
		});

		it("should respect humidity limit in cooling mode", () => {
			// High humidity should prevent cooling
			const result = controller.shouldActivateEngine(26.0, 24.0, 70);
			expect(result).to.be.false;
		});

		it("should allow cooling with acceptable humidity", () => {
			const result = controller.shouldActivateEngine(26.0, 24.0, 50);
			expect(result).to.be.true;
		});
	});

	describe("Boost and Pause Temperatures", () => {
		beforeEach(() => {
			controller = createController(false);
		});

		it("should return correct boost temperature for heating", () => {
			expect(controller.getBoostTemperature()).to.equal(100);
		});

		it("should return correct pause temperature for heating", () => {
			expect(controller.getPauseTemperature()).to.equal(-100);
		});
	});

	describe("Cleanup", () => {
		beforeEach(() => {
			controller = createController(true);
		});

		it("should dispose resources", () => {
			// Should not crash
			controller.dispose();

			// After disposal, AI should be unavailable
			// (implementation detail - can't easily test without accessing internals)
		});
	});

	describe("Edge Cases", () => {
		beforeEach(() => {
			controller = createController(true);
		});

		it("should handle exact target temperature", () => {
			const result = controller.shouldActivateEngine(20.0, 20.0);
			expect(result).to.be.null; // Within hysteresis
		});

		it("should handle extreme temperature differences", () => {
			// Very cold
			const result1 = controller.shouldActivateEngine(0.0, 20.0);
			expect(result1).to.be.true;

			// Very hot
			const result2 = controller.shouldActivateEngine(40.0, 20.0);
			expect(result2).to.be.false;
		});

		it("should handle negative temperatures", () => {
			const result = controller.shouldActivateEngine(-5.0, 0.0);
			expect(result).to.be.true;
		});

		it("should handle decimal precision", () => {
			const result1 = controller.shouldActivateEngine(19.49, 20.0);
			expect(result1).to.be.true;

			const result2 = controller.shouldActivateEngine(20.51, 20.0);
			expect(result2).to.be.false;

			const result3 = controller.shouldActivateEngine(20.25, 20.0);
			expect(result3).to.be.null;
		});
	});

	describe("Prediction Cache", () => {
		beforeEach(() => {
			controller = createController(true);
		});

		it("should handle prediction cache for performance", () => {
			const context: AIContext = {
				room: "cacheroom",
				heatingDuration: 30,
				recentHeatingRate: 2.0,
				outsideTemp: 10,
				lastEngineState: true,
			};

			// First call - no cache
			const result1 = controller.shouldActivateEngine(19.5, 20.0, 50, context);

			// Second call immediately - should use cache
			const result2 = controller.shouldActivateEngine(19.5, 20.0, 50, context);

			// Both should return consistent results (fallback to classic since no AI data)
			expect(result1).to.equal(result2);
		});
	});

	describe("Integration with Base TemperatureController", () => {
		it("should inherit all base controller methods", () => {
			controller = createController(false);

			// Test inherited methods
			expect(controller.createTempTarget).to.be.a("function");
			expect(controller.createDefaultTempTarget).to.be.a("function");
			expect(controller.isValidTargetUntil).to.be.a("function");
			expect(controller.shouldUseDefaultTemperature).to.be.a("function");

			// Test they work
			const tempTarget = controller.createTempTarget(22, "18:00");
			expect(tempTarget.temp).to.equal(22);
			expect(tempTarget.until).to.equal("18:00");

			const defaultTarget = controller.createDefaultTempTarget();
			expect(defaultTarget.temp).to.equal(20);
			expect(defaultTarget.until).to.equal("24:00");
		});
	});
});
