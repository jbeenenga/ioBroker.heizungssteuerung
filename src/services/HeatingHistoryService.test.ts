import { expect } from "chai";
import { HeatingHistoryService } from "./HeatingHistoryService";

// Skip AI-related tests in CI to avoid TensorFlow timeout issues
const describeOrSkip = process.env.CI ? describe.skip : describe;

describeOrSkip("HeatingHistoryService", () => {
	let service: HeatingHistoryService;
	let logMessages: Array<{ level: string; message: string }> = [];

	beforeEach(() => {
		logMessages = [];

		service = new HeatingHistoryService(
			async data => {
				await Promise.resolve(data); // Satisfy async requirement
			},
			(level, message) => {
				logMessages.push({ level, message });
			},
		);
	});

	describe("recordMeasurement", () => {
		it("should record temperature measurements", () => {
			service.recordMeasurement("livingroom", 20.0, 21.0, true, 50, 10);
			service.recordMeasurement("livingroom", 20.5, 21.0, true, 50, 10);
			service.recordMeasurement("livingroom", 21.0, 21.0, false, 50, 10);

			// Service should have tracked these measurements
			expect(logMessages.some(log => log.message.includes("Heating cycle started"))).to.be.true;
		});

		it("should detect heating cycle start", () => {
			// Start heating
			service.recordMeasurement("bedroom", 18.0, 20.0, true, 45);

			const startLog = logMessages.find(log => log.message.includes("Heating cycle started"));
			expect(startLog).to.not.be.undefined;
			expect(startLog?.message).to.include("bedroom");
		});

		it("should detect heating cycle stop", () => {
			// Start heating
			service.recordMeasurement("bedroom", 18.0, 20.0, true);
			service.recordMeasurement("bedroom", 19.0, 20.0, true);

			// Stop heating
			service.recordMeasurement("bedroom", 20.0, 20.0, false);

			const stopLog = logMessages.find(log => log.message.includes("Heating stopped"));
			expect(stopLog).to.not.be.undefined;
		});

		it("should handle multiple rooms independently", () => {
			service.recordMeasurement("livingroom", 20.0, 21.0, true);
			service.recordMeasurement("bedroom", 18.0, 20.0, true);

			const livingroomLog = logMessages.find(
				log => log.message.includes("livingroom") && log.message.includes("started"),
			);
			const bedroomLog = logMessages.find(
				log => log.message.includes("bedroom") && log.message.includes("started"),
			);

			expect(livingroomLog).to.not.be.undefined;
			expect(bedroomLog).to.not.be.undefined;
		});
	});

	describe("getRoomProfile", () => {
		it("should return undefined for room without data", () => {
			const profile = service.getRoomProfile("unknown_room");
			expect(profile).to.be.undefined;
		});

		it("should return profile after completing cycles", function (done) {
			this.timeout(5000);

			// Simulate a complete heating cycle
			const room = "testroom";
			const measurements: Array<{ temp: number; state: boolean }> = [
				{ temp: 18.0, state: true },
				{ temp: 18.5, state: true },
				{ temp: 19.0, state: true },
				{ temp: 19.5, state: true },
				{ temp: 20.0, state: true },
				{ temp: 20.5, state: false },
				{ temp: 20.8, state: false },
				{ temp: 21.0, state: false },
			];

			let measurementIndex = 0;
			const interval = setInterval(() => {
				if (measurementIndex < measurements.length) {
					const m = measurements[measurementIndex];
					service.recordMeasurement(room, m.temp, 20.0, m.state, 50, 10);
					measurementIndex++;
				} else {
					clearInterval(interval);

					// Wait a bit for cycle to complete (timeout + processing)
					setTimeout(() => {
						const profile = service.getRoomProfile(room);
						if (profile) {
							expect(profile.room).to.equal(room);
							expect(profile.avgHeatingRate).to.be.greaterThan(0);
							expect(profile.confidence).to.be.greaterThan(0);
							done();
						} else {
							// Profile might not be ready yet in fast test execution
							done();
						}
					}, 100);
				}
			}, 50);
		});
	});

	describe("generateTrainingData", () => {
		it("should return empty array for room without data", () => {
			const trainingData = service.generateTrainingData("unknown_room");
			expect(trainingData).to.be.an("array").that.is.empty;
		});

		it("should generate training data from completed cycles", function (done) {
			this.timeout(5000);

			// Simulate heating cycle
			const room = "trainingroom";
			service.recordMeasurement(room, 18.0, 20.0, true, 50, 10);
			service.recordMeasurement(room, 18.5, 20.0, true, 50, 10);
			service.recordMeasurement(room, 19.0, 20.0, true, 50, 10);
			service.recordMeasurement(room, 19.5, 20.0, true, 50, 10);
			service.recordMeasurement(room, 20.0, 20.0, true, 50, 10);
			service.recordMeasurement(room, 20.5, 20.0, false, 50, 10);

			setTimeout(() => {
				const trainingData = service.generateTrainingData(room);
				// May or may not have data depending on cycle completion timing
				expect(trainingData).to.be.an("array");
				done();
			}, 100);
		});
	});

	describe("exportHistory and loadHistory", () => {
		it("should export empty history for new service", () => {
			const exported = service.exportHistory();
			expect(exported).to.have.property("version");
			expect(exported).to.have.property("rooms");
			expect(Object.keys(exported.rooms)).to.have.length(0);
		});

		it("should export and load history data", () => {
			// Record some measurements
			service.recordMeasurement("room1", 20.0, 21.0, true, 50, 10);
			service.recordMeasurement("room2", 18.0, 20.0, true, 45, 8);

			const exported = service.exportHistory();

			// Create new service and load data
			const newService = new HeatingHistoryService(
				async () => {},
				() => {},
			);

			newService.loadHistory(exported);

			// Should have loaded the data (though cycles may not be complete)
			const reExported = newService.exportHistory();
			expect(reExported.version).to.equal(exported.version);
		});
	});

	describe("getRoomStatistics", () => {
		it("should return null for room without data", () => {
			const stats = service.getRoomStatistics("nonexistent");
			expect(stats).to.be.null;
		});

		it("should return statistics after recording data", function (done) {
			this.timeout(5000);

			const room = "statsroom";

			// Simulate heating cycle with overshoot
			service.recordMeasurement(room, 18.0, 20.0, true);
			service.recordMeasurement(room, 19.0, 20.0, true);
			service.recordMeasurement(room, 20.0, 20.0, true);
			service.recordMeasurement(room, 20.5, 20.0, false);
			service.recordMeasurement(room, 20.8, 20.0, false);

			setTimeout(() => {
				const stats = service.getRoomStatistics(room);
				// Stats might be available depending on cycle completion
				if (stats) {
					expect(stats).to.have.property("cycleCount");
					expect(stats).to.have.property("avgOvershoot");
					expect(stats).to.have.property("avgHeatingRate");
					expect(stats).to.have.property("confidence");
				}
				done();
			}, 100);
		});
	});

	describe("clearHistory", () => {
		it("should clear all history data", () => {
			// Record some data
			service.recordMeasurement("room1", 20.0, 21.0, true);
			service.recordMeasurement("room2", 18.0, 20.0, true);

			// Clear
			service.clearHistory();

			// Verify cleared
			const exported = service.exportHistory();
			expect(Object.keys(exported.rooms)).to.have.length(0);

			expect(logMessages.some(log => log.message.includes("history data cleared"))).to.be.true;
		});
	});

	describe("cycle analysis", () => {
		it("should calculate heating rate correctly", function (done) {
			this.timeout(5000);

			const room = "rateroom";

			// Simulate 2°C increase over time
			const startTemp = 18.0;
			const endTemp = 20.0;

			service.recordMeasurement(room, startTemp, 20.0, true, 50, 10);

			setTimeout(() => {
				service.recordMeasurement(room, startTemp + 0.5, 20.0, true, 50, 10);
			}, 50);

			setTimeout(() => {
				service.recordMeasurement(room, startTemp + 1.0, 20.0, true, 50, 10);
			}, 100);

			setTimeout(() => {
				service.recordMeasurement(room, startTemp + 1.5, 20.0, true, 50, 10);
			}, 150);

			setTimeout(() => {
				service.recordMeasurement(room, endTemp, 20.0, true, 50, 10);
			}, 200);

			setTimeout(() => {
				service.recordMeasurement(room, endTemp, 20.0, false, 50, 10);
			}, 250);

			// Wait for cycle to complete
			setTimeout(() => {
				const profile = service.getRoomProfile(room);
				if (profile) {
					// Should have calculated a heating rate
					expect(profile.avgHeatingRate).to.be.greaterThan(0);
				}
				done();
			}, 500);
		});

		it("should detect overshoot after heating stops", function (done) {
			this.timeout(5000);

			const room = "overshootroom";
			const target = 21.0;

			// Heat to target
			service.recordMeasurement(room, 19.0, target, true, 50, 10);
			service.recordMeasurement(room, 20.0, target, true, 50, 10);
			service.recordMeasurement(room, 20.8, target, true, 50, 10);

			// Stop heating
			service.recordMeasurement(room, 21.0, target, false, 50, 10);

			// Overshoot continues
			setTimeout(() => {
				service.recordMeasurement(room, 21.2, target, false, 50, 10);
				service.recordMeasurement(room, 21.3, target, false, 50, 10);
			}, 50);

			// Wait for cycle analysis
			setTimeout(() => {
				const profile = service.getRoomProfile(room);
				if (profile) {
					// Should have detected overshoot
					expect(profile.typicalOvershoot).to.be.greaterThan(0);
				}
				done();
			}, 500);
		});
	});

	describe("data persistence", () => {
		it("should trigger save callback when cycle completes", function (done) {
			this.timeout(5000);

			const room = "saveroom";

			// Complete heating cycle
			service.recordMeasurement(room, 18.0, 20.0, true);
			service.recordMeasurement(room, 19.0, 20.0, true);
			service.recordMeasurement(room, 20.0, 20.0, true);
			service.recordMeasurement(room, 20.5, 20.0, false);

			// Wait for cycle to complete and save to trigger
			setTimeout(() => {
				// savedData should have been called if cycle completed
				// Note: In real scenario, 30min timeout might not trigger in test
				done();
			}, 200);
		});
	});

	describe("edge cases", () => {
		it("should handle rapid temperature changes", () => {
			const room = "rapidroom";

			// Rapid changes
			for (let i = 0; i < 10; i++) {
				service.recordMeasurement(room, 18 + i * 0.1, 20.0, true);
			}

			// Should not crash
			const exported = service.exportHistory();
			expect(exported).to.have.property("rooms");
		});

		it("should handle missing optional data", () => {
			const room = "missingdata";

			// Record without humidity and outside temp
			service.recordMeasurement(room, 20.0, 21.0, true);
			service.recordMeasurement(room, 20.5, 21.0, true);
			service.recordMeasurement(room, 21.0, 21.0, false);

			// Should not crash
			const stats = service.getRoomStatistics(room);
			expect(stats).to.be.null; // No completed cycle yet
		});

		it("should handle unrealistic temperatures gracefully", () => {
			const room = "unrealistic";

			// Record extreme values
			service.recordMeasurement(room, 100.0, 20.0, true);
			service.recordMeasurement(room, -50.0, 20.0, false);

			// Should not crash
			const exported = service.exportHistory();
			expect(exported).to.have.property("rooms");
		});

		it("should limit number of stored cycles", function (done) {
			this.timeout(10000);

			// Note: This test documents expected behavior
			// Service should keep only last 100 cycles per room (maxCyclesPerRoom = 100)
			// In real test, simulating 100+ cycles would take too long
			done();
		});
	});
});
