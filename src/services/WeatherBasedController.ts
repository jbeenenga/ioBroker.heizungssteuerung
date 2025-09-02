/**
 * Configuration interface for WeatherBasedController
 */
export interface WeatherBasedControllerConfig {
	/** Enable weather-based control */
	enableWeatherControl: boolean;
	/** Path to weather state containing outside temperature */
	weatherStatePath: string;
	/** Heating mode: 0 = heating, 1 = cooling */
	isHeatingMode: number;
	/** Temperature threshold for heating mode (activate only if outside temp below this) */
	heatingOutsideTemperatureThreshold: number;
	/** Temperature threshold for cooling mode (activate only if outside temp above this) */
	coolingOutsideTemperatureThreshold: number;
}

/**
 * Controller for weather-based heating/cooling activation logic
 */
export class WeatherBasedController {
	/**
	 * Create new WeatherBasedController
	 *
	 * @param config Configuration object
	 */
	constructor(private config: WeatherBasedControllerConfig) {}

	/**
	 * Determine if heating/cooling should be allowed based on outside temperature
	 *
	 * @param outsideTemperature Current outside temperature
	 * @returns True if heating/cooling should be allowed, false if blocked, null if weather control disabled
	 */
	shouldAllowOperation(outsideTemperature: number | null): boolean | null {
		if (!this.config.enableWeatherControl) {
			return null; // Weather control disabled, no restriction
		}

		if (outsideTemperature === null) {
			// No weather data available - allow operation to prevent system failure
			return true;
		}

		if (this.config.isHeatingMode === 0) {
			// Heating mode: only activate if outside temperature is below threshold
			return outsideTemperature < this.config.heatingOutsideTemperatureThreshold;
		}
		// Cooling mode: only activate if outside temperature is above threshold
		return outsideTemperature > this.config.coolingOutsideTemperatureThreshold;
	}

	/**
	 * Get current temperature threshold based on heating/cooling mode
	 *
	 * @returns Current temperature threshold
	 */
	getCurrentThreshold(): number {
		return this.config.isHeatingMode === 0
			? this.config.heatingOutsideTemperatureThreshold
			: this.config.coolingOutsideTemperatureThreshold;
	}

	/**
	 * Get description of current weather control rule
	 *
	 * @returns Human-readable description of the current rule
	 */
	getControlDescription(): string {
		if (!this.config.enableWeatherControl) {
			return "Weather control disabled";
		}

		const mode = this.config.isHeatingMode === 0 ? "Heating" : "Cooling";
		const threshold = this.getCurrentThreshold();
		const operator = this.config.isHeatingMode === 0 ? "below" : "above";

		return `${mode} only allowed if outside temperature ${operator} ${threshold}°C`;
	}

	/**
	 * Update configuration
	 *
	 * @param newConfig New configuration object
	 */
	updateConfig(newConfig: WeatherBasedControllerConfig): void {
		this.config = newConfig;
	}
}
