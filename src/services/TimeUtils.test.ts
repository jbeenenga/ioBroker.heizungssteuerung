import { expect } from "chai";
import { TimeUtils } from "./TimeUtils";
import type { Period } from "../models/periods";

describe("TimeUtils", () => {
	describe("getCurrentTimeString", () => {
		it("should return time in HH:MM format", () => {
			const result = TimeUtils.getCurrentTimeString();
			expect(result).to.match(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/);
		});
	});

	describe("getCurrentDateTimeString", () => {
		it("should return date time in German format", () => {
			const result = TimeUtils.getCurrentDateTimeString();
			expect(result).to.match(/^\d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}$/);
		});
	});

	describe("getCurrentWeekday", () => {
		it("should return weekday between 0 and 6", () => {
			const result = TimeUtils.getCurrentWeekday();
			expect(result).to.be.at.least(0);
			expect(result).to.be.at.most(6);
		});
	});

	describe("correctTime", () => {
		it("should pad single digit hours and minutes", () => {
			expect(TimeUtils.correctTime("1:5")).to.equal("01:05");
			expect(TimeUtils.correctTime("9:30")).to.equal("09:30");
			expect(TimeUtils.correctTime("10:5")).to.equal("10:05");
		});

		it("should leave properly formatted time unchanged", () => {
			expect(TimeUtils.correctTime("12:30")).to.equal("12:30");
			expect(TimeUtils.correctTime("00:00")).to.equal("00:00");
			expect(TimeUtils.correctTime("23:59")).to.equal("23:59");
		});

		it("should return invalid time unchanged", () => {
			expect(TimeUtils.correctTime("invalid")).to.equal("invalid");
			expect(TimeUtils.correctTime("25:70")).to.equal("25:70");
		});
	});

	describe("isPeriodValid", () => {
		it("should validate correct time format", () => {
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
				5: false,
				6: false,
			};

			expect(TimeUtils.isPeriodValid(validPeriod)).to.be.true;
		});

		it("should reject invalid time format", () => {
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
				5: false,
				6: false,
			};

			expect(TimeUtils.isPeriodValid(invalidPeriod)).to.be.false;
		});

		it("should auto-correct invalid format when enabled", () => {
			const period: Period = {
				room: "enum.rooms.test",
				from: "8:5",
				until: "18:30",
				heating: true,
				temp: 21,
				0: true,
				1: true,
				2: true,
				3: true,
				4: true,
				5: false,
				6: false,
			};

			const result = TimeUtils.isPeriodValid(period, true);
			expect(result).to.be.true;
			expect(period.from).to.equal("08:05");
		});
	});

	describe("isPeriodActiveOnDay", () => {
		const period: Period = {
			room: "enum.rooms.test",
			from: "08:00",
			until: "18:00",
			heating: true,
			temp: 21,
			0: true,
			1: false,
			2: true,
			3: false,
			4: true,
			5: false,
			6: true,
		};

		it("should return correct values for each day", () => {
			expect(TimeUtils.isPeriodActiveOnDay(period, 0)).to.be.true;
			expect(TimeUtils.isPeriodActiveOnDay(period, 1)).to.be.false;
			expect(TimeUtils.isPeriodActiveOnDay(period, 2)).to.be.true;
			expect(TimeUtils.isPeriodActiveOnDay(period, 3)).to.be.false;
			expect(TimeUtils.isPeriodActiveOnDay(period, 4)).to.be.true;
			expect(TimeUtils.isPeriodActiveOnDay(period, 5)).to.be.false;
			expect(TimeUtils.isPeriodActiveOnDay(period, 6)).to.be.true;
		});

		it("should return false for invalid day", () => {
			expect(TimeUtils.isPeriodActiveOnDay(period, -1)).to.be.false;
			expect(TimeUtils.isPeriodActiveOnDay(period, 7)).to.be.false;
		});
	});

	describe("isCurrentPeriod", () => {
		const activePeriod: Period = {
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

		it("should return true when time is within period", () => {
			const result = TimeUtils.isCurrentPeriod(activePeriod, "12:00");
			expect(result).to.be.true;
		});

		it("should return false when time is before period", () => {
			const result = TimeUtils.isCurrentPeriod(activePeriod, "07:00");
			expect(result).to.be.false;
		});

		it("should return false when time is after period", () => {
			const result = TimeUtils.isCurrentPeriod(activePeriod, "19:00");
			expect(result).to.be.false;
		});

		it("should return false when period is invalid", () => {
			const invalidPeriod: Period = {
				...activePeriod,
				from: "25:00",
			};
			const result = TimeUtils.isCurrentPeriod(invalidPeriod, "12:00");
			expect(result).to.be.false;
		});
	});

	describe("isTimeBefore", () => {
		it("should compare times correctly", () => {
			expect(TimeUtils.isTimeBefore("08:00", "09:00")).to.be.true;
			expect(TimeUtils.isTimeBefore("12:30", "12:31")).to.be.true;
			expect(TimeUtils.isTimeBefore("18:00", "08:00")).to.be.false;
			expect(TimeUtils.isTimeBefore("12:00", "12:00")).to.be.false;
		});
	});

	describe("isValidTimeString", () => {
		it("should validate correct time formats", () => {
			expect(TimeUtils.isValidTimeString("00:00")).to.be.true;
			expect(TimeUtils.isValidTimeString("12:30")).to.be.true;
			expect(TimeUtils.isValidTimeString("23:59")).to.be.true;
			expect(TimeUtils.isValidTimeString("9:05")).to.be.true;
		});

		it("should reject invalid time formats", () => {
			expect(TimeUtils.isValidTimeString("25:00")).to.be.false;
			expect(TimeUtils.isValidTimeString("12:60")).to.be.false;
			expect(TimeUtils.isValidTimeString("invalid")).to.be.false;
			expect(TimeUtils.isValidTimeString("")).to.be.false;
		});
	});

	describe("getTimestampMinusInterval", () => {
		it("should calculate timestamp minus interval correctly", () => {
			const before = Date.now();
			const result = TimeUtils.getTimestampMinusInterval(60);
			const expectedResult = before - 60 * 60000;

			expect(result).to.be.lessThan(before);
			expect(result).to.be.at.most(expectedResult + 100);
			expect(result).to.be.at.least(expectedResult - 100);
		});
	});
});
