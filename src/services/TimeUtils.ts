import type { Period } from "../models/periods";

/**
 * Utility class for time-related operations and validations
 */
export class TimeUtils {
	private static readonly TIME_REGEX = /^(?:0?[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/;

	/**
	 * Get current time as HH:MM string
	 *
	 * @returns Current time in HH:MM format
	 */
	static getCurrentTimeString(): string {
		return new Date().toLocaleTimeString([], { hourCycle: "h23", hour: "2-digit", minute: "2-digit" });
	}

	/**
	 * Get current date and time in German format
	 *
	 * @returns Current date and time as DD.MM.YYYY, HH:MM string
	 */
	static getCurrentDateTimeString(): string {
		return new Date().toLocaleString("de-DE", {
			day: "2-digit",
			month: "2-digit",
			year: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
	}

	/**
	 * Get current weekday (0=Monday, 6=Sunday)
	 *
	 * @returns Weekday number (0-6)
	 */
	static getCurrentWeekday(): number {
		const day = new Date().getDay() - 1;
		return day < 0 ? 6 : day;
	}

	/**
	 * Check if a period has valid time format
	 *
	 * @param period The period to validate
	 * @param autoCorrect Whether to auto-correct invalid times
	 * @returns True if period is valid
	 */
	static isPeriodValid(period: Period, autoCorrect: boolean = false): boolean {
		if (!this.TIME_REGEX.test(period.from) || !this.TIME_REGEX.test(period.until)) {
			if (autoCorrect) {
				period.from = this.correctTime(period.from);
				period.until = this.correctTime(period.until);
				return this.isPeriodValid(period, false);
			}
			return false;
		}
		return true;
	}

	/**
	 * Correct time format by padding with zeros
	 *
	 * @param time Time string to correct
	 * @returns Corrected time string in HH:MM format
	 */
	static correctTime(time: string): string {
		const timeParts = time.split(":");
		if (timeParts.length === 2) {
			while (timeParts[0].length < 2) {
				timeParts[0] = `0${timeParts[0]}`;
			}
			while (timeParts[1].length < 2) {
				timeParts[1] = `0${timeParts[1]}`;
			}
			return `${timeParts[0]}:${timeParts[1]}`;
		}
		return time;
	}

	/**
	 * Check if a period is currently active
	 *
	 * @param period The period to check
	 * @param currentTime Optional current time, uses now if not provided
	 * @returns True if period is currently active
	 */
	static isCurrentPeriod(period: Period, currentTime?: string): boolean {
		const now = currentTime || this.getCurrentTimeString();
		const day = this.getCurrentWeekday();

		if (!this.isPeriodValid(period, true)) {
			return false;
		}

		if (!this.isPeriodActiveOnDay(period, day)) {
			return false;
		}

		if (now < period.from || now > period.until) {
			return false;
		}

		return true;
	}

	/**
	 * Check if period is active on specific weekday
	 *
	 * @param period The period to check
	 * @param day Weekday number (0=Monday, 6=Sunday)
	 * @returns True if period is active on given day
	 */
	static isPeriodActiveOnDay(period: Period, day: number): boolean {
		switch (day) {
			case 0:
				return period[0];
			case 1:
				return period[1];
			case 2:
				return period[2];
			case 3:
				return period[3];
			case 4:
				return period[4];
			case 5:
				return period[5];
			case 6:
				return period[6];
			default:
				return false;
		}
	}

	/**
	 * Compare two time strings
	 *
	 * @param time1 First time string
	 * @param time2 Second time string
	 * @returns True if time1 is before time2
	 */
	static isTimeBefore(time1: string, time2: string): boolean {
		return time1 < time2;
	}

	/**
	 * Validate time string format
	 *
	 * @param time Time string to validate
	 * @returns True if time string is valid
	 */
	static isValidTimeString(time: string): boolean {
		return this.TIME_REGEX.test(time);
	}

	/**
	 * Calculate timestamp minus given interval in minutes
	 *
	 * @param intervalMinutes The interval to subtract in minutes
	 * @returns Timestamp minus the interval
	 */
	static getTimestampMinusInterval(intervalMinutes: number): number {
		return new Date().getTime() - intervalMinutes * 60000;
	}
}
