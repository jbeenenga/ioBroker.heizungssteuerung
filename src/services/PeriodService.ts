import type { Period } from "../models/periods";
import type { TempTarget } from "../models/tempTarget";
import { TimeUtils } from "./TimeUtils";
import type { TemperatureController } from "./TemperatureController";

/**
 * Service for managing heating/cooling periods and temperature calculations
 */
export class PeriodService {
	/**
	 * Create new PeriodService
	 *
	 * @param periods Array of configured periods
	 * @param temperatureController Temperature controller instance
	 * @param isHeatingMode Heating mode (0 = heating, 1 = cooling)
	 */
	constructor(
		private periods: Period[],
		private temperatureController: TemperatureController,
		private isHeatingMode: number,
	) {}

	/**
	 * Get all periods configured for a specific room
	 *
	 * @param roomName Name of the room
	 * @returns Array of periods for the specified room
	 */
	getPeriodsForRoom(roomName: string): Period[] {
		const periods: Period[] = [];
		this.periods.forEach(period => {
			if (period.room === `enum.rooms.${roomName}`) {
				periods.push(period);
			}
		});
		return periods;
	}

	/**
	 * Calculate temperature target for a room based on various conditions
	 *
	 * @param roomName Name of the room
	 * @param currentTime Current time string
	 * @param isPaused Whether the room is in pause mode
	 * @param isBoosted Whether the room is in boost mode
	 * @param isAbsenceActive Whether absence mode is active
	 * @param currentTempTarget Current temperature target
	 * @returns Updated temperature target
	 */
	calculateTemperatureForRoom(
		roomName: string,
		currentTime: string,
		isPaused: boolean,
		isBoosted: boolean,
		isAbsenceActive: boolean,
		currentTempTarget: TempTarget,
	): TempTarget {
		if (isPaused) {
			return this.temperatureController.createTempTarget(
				this.temperatureController.getPauseTemperature(),
				"pause",
			);
		}

		if (isBoosted) {
			return this.temperatureController.createTempTarget(
				this.temperatureController.getBoostTemperature(),
				"boost",
			);
		}

		if (isAbsenceActive) {
			return currentTempTarget;
		}

		return this.calculatePeriodBasedTemperature(roomName, currentTime, currentTempTarget);
	}

	private calculatePeriodBasedTemperature(
		roomName: string,
		currentTime: string,
		currentTempTarget: TempTarget,
	): TempTarget {
		const periodsForRoom = this.getPeriodsForRoom(roomName);
		let updatedTarget = { ...currentTempTarget };

		periodsForRoom.forEach(period => {
			if (!this.isPeriodModeMatching(period)) {
				return;
			}

			if (this.shouldUpdateTargetUntil(period, currentTime, updatedTarget)) {
				updatedTarget.until = period.from;
			}

			if (this.shouldUpdateTemperature(period, currentTime, updatedTarget)) {
				updatedTarget = this.temperatureController.createTempTarget(period.temp, period.until);
			}
		});

		return updatedTarget;
	}

	private isPeriodModeMatching(period: Period): boolean {
		return (this.isHeatingMode === 0) === period.heating;
	}

	private shouldUpdateTargetUntil(period: Period, currentTime: string, currentTarget: TempTarget): boolean {
		return period.from > currentTime && period.from < currentTarget.until;
	}

	private shouldUpdateTemperature(period: Period, currentTime: string, currentTarget: TempTarget): boolean {
		if (currentTarget.until > currentTime && currentTarget.until !== "24:00") {
			return false;
		}
		return TimeUtils.isCurrentPeriod(period, currentTime);
	}

	/**
	 * Update the periods array with new periods
	 *
	 * @param newPeriods New array of periods
	 */
	updatePeriods(newPeriods: Period[]): void {
		this.periods = newPeriods;
	}

	/**
	 * Get copy of all configured periods
	 *
	 * @returns Copy of all periods
	 */
	getAllPeriods(): Period[] {
		return [...this.periods];
	}

	/**
	 * Validate a period configuration
	 *
	 * @param period Period to validate
	 * @returns True if period is valid
	 */
	validatePeriod(period: Period): boolean {
		return TimeUtils.isPeriodValid(period, false);
	}

	/**
	 * Correct period time formatting
	 *
	 * @param period Period to correct (modified in place)
	 */
	correctPeriod(period: Period): void {
		period.from = TimeUtils.correctTime(period.from);
		period.until = TimeUtils.correctTime(period.until);
	}
}
