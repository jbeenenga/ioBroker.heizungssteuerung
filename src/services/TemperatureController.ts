import type { TempTarget } from "../models/tempTarget";

/**
 * Configuration interface for TemperatureController
 */
export interface TemperatureControllerConfig {
	/** Heating mode: 0 = heating, 1 = cooling */
	isHeatingMode: number;
	/** Default temperature setting */
	defaultTemperature: number;
	/** Temperature difference for start/stop decisions */
	startStopDifference: number;
	/** Stop cooling when humidity exceeds this value */
	stopCoolingIfHumIsHigherThan: number;
}

/**
 * Controller for temperature-related logic and decisions
 */
export class TemperatureController {
	/**
	 * Create new TemperatureController
	 *
	 * @param config Configuration object
	 */
	constructor(private config: TemperatureControllerConfig) {}

	/**
	 * Get boost temperature based on heating/cooling mode
	 *
	 * @returns Boost temperature value
	 */
	getBoostTemperature(): number {
		return this.config.isHeatingMode === 0 ? 100 : -100;
	}

	/**
	 * Get pause temperature based on heating/cooling mode
	 *
	 * @returns Pause temperature value
	 */
	getPauseTemperature(): number {
		return this.config.isHeatingMode === 0 ? -100 : 100;
	}

	/**
	 * Determine if engine should be activated based on temperature and humidity
	 *
	 * @param currentTemp Current temperature
	 * @param targetTemp Target temperature
	 * @param humidity Optional humidity value
	 * @returns True to activate, false to deactivate, null for no change
	 */
	shouldActivateEngine(currentTemp: number, targetTemp: number, humidity?: number): boolean | null {
		if (this.config.isHeatingMode === 0) {
			return this.shouldActivateHeating(currentTemp, targetTemp);
		}
		return this.shouldActivateCooling(currentTemp, targetTemp, humidity);
	}

	/**
	 * Determine heating activation based on temperature difference
	 *
	 * @param currentTemp Current temperature
	 * @param targetTemp Target temperature
	 * @returns True to activate, false to deactivate, null for no change
	 */
	private shouldActivateHeating(currentTemp: number, targetTemp: number): boolean | null {
		if (currentTemp < targetTemp - this.config.startStopDifference) {
			return true;
		}
		if (currentTemp > targetTemp + this.config.startStopDifference) {
			return false;
		}
		return null;
	}

	/**
	 * Determine cooling activation based on temperature and humidity
	 *
	 * @param currentTemp Current temperature
	 * @param targetTemp Target temperature
	 * @param humidity Optional humidity value
	 * @returns True to activate, false to deactivate, null for no change
	 */
	private shouldActivateCooling(currentTemp: number, targetTemp: number, humidity?: number): boolean | null {
		if (humidity !== undefined && humidity > this.config.stopCoolingIfHumIsHigherThan) {
			return false;
		}

		if (currentTemp < targetTemp - this.config.startStopDifference) {
			return false;
		}
		if (currentTemp > targetTemp + this.config.startStopDifference) {
			return true;
		}
		return null;
	}

	/**
	 * Create temperature target configuration
	 *
	 * @param temp Target temperature
	 * @param until Time until when this temperature is valid
	 * @returns Temperature target configuration
	 */
	createTempTarget(temp: number, until: string): TempTarget {
		return { temp, until };
	}

	/**
	 * Create default temperature target
	 *
	 * @returns Default temperature target configuration
	 */
	createDefaultTempTarget(): TempTarget {
		return this.createTempTarget(this.config.defaultTemperature, "24:00");
	}

	/**
	 * Check if target until time is valid
	 *
	 * @param targetUntil Target until time string
	 * @param currentTime Current time string
	 * @returns True if target until time is valid
	 */
	isValidTargetUntil(targetUntil: string | null | undefined, currentTime: string): boolean {
		if (!targetUntil) {
			return false;
		}

		if (targetUntil === "boost" || targetUntil === "pause") {
			return false;
		}

		if (targetUntil < currentTime) {
			return false;
		}

		return true;
	}

	/**
	 * Determine if default temperature should be used
	 *
	 * @param targetTemp Target temperature value
	 * @param targetUntil Target until time string
	 * @param currentTime Current time string
	 * @returns True if default temperature should be used
	 */
	shouldUseDefaultTemperature(
		targetTemp: number | null | undefined,
		targetUntil: string | null | undefined,
		currentTime: string,
	): boolean {
		if (targetTemp === null || targetTemp === undefined) {
			return true;
		}

		if (!this.isValidTargetUntil(targetUntil, currentTime)) {
			return true;
		}

		return false;
	}
}
