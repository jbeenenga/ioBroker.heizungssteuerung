import type * as utils from "@iobroker/adapter-core";

/**
 * Service for retrieving weather data from ioBroker states
 */
export class WeatherService {
	/**
	 * Create new WeatherService
	 *
	 * @param adapter The ioBroker adapter instance
	 */
	constructor(private adapter: utils.AdapterInstance) {}

	/**
	 * Get current outside temperature from configured weather state
	 *
	 * @param weatherStatePath Path to weather temperature state
	 * @returns Current outside temperature or null if unavailable
	 */
	async getOutsideTemperature(weatherStatePath: string): Promise<number | null> {
		if (!weatherStatePath) {
			this.adapter.log.debug("No weather state path configured");
			return null;
		}

		try {
			const weatherState = await this.adapter.getForeignStateAsync(weatherStatePath);
			if (!weatherState || weatherState.val === null || weatherState.val === undefined) {
				this.adapter.log.warn(`Weather state ${weatherStatePath} is not available or has no value`);
				return null;
			}

			const temperature = Number(weatherState.val);
			if (isNaN(temperature)) {
				this.adapter.log.warn(
					`Weather state ${weatherStatePath} contains invalid temperature value: ${weatherState.val}`,
				);
				return null;
			}

			this.adapter.log.debug(`Current outside temperature: ${temperature}°C`);
			return temperature;
		} catch (error) {
			this.adapter.log.error(`Error reading weather state ${weatherStatePath}: ${String(error)}`);
			return null;
		}
	}

	/**
	 * Check if weather state path is valid and accessible
	 *
	 * @param weatherStatePath Path to weather temperature state
	 * @returns True if state exists and is readable
	 */
	async isWeatherStateValid(weatherStatePath: string): Promise<boolean> {
		if (!weatherStatePath) {
			return false;
		}

		try {
			const weatherState = await this.adapter.getForeignStateAsync(weatherStatePath);
			return weatherState !== null && weatherState !== undefined;
		} catch (error) {
			this.adapter.log.error(`Error validating weather state ${weatherStatePath}: ${String(error)}`);
			return false;
		}
	}
}
