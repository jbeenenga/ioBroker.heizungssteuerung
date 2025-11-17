/**
 * Models for heating history data collection and ML training
 */

/**
 * Single temperature measurement point
 */
export interface TemperatureMeasurement {
	/** Unix timestamp in ms */
	timestamp: number;
	/** Current temperature in °C */
	temperature: number;
	/** Target temperature in °C */
	targetTemperature: number;
	/** Humidity in % */
	humidity?: number;
	/** Outside temperature in °C */
	outsideTemperature?: number;
	/** true = heating/cooling active */
	engineState: boolean;
}

/**
 * Complete heating/cooling cycle data
 */
export interface HeatingCycle {
	/** Room identifier */
	room: string;
	/** Cycle start timestamp */
	startTime: number;
	/** Cycle end timestamp */
	endTime: number;
	/** Array of temperature measurements during cycle */
	measurements: TemperatureMeasurement[];

	/** Duration in minutes */
	duration: number;
	/** Temperature at start */
	startTemp: number;
	/** Temperature at engine stop */
	endTemp: number;
	/** Target temperature */
	targetTemp: number;
	/** Maximum reached temperature (overshoot) */
	maxTemp: number;
	/** maxTemp - targetTemp */
	overshoot: number;
	/** °C per hour while heating */
	heatingRate: number;
	/** °C per hour after heating stops */
	cooldownRate: number;
	/** Average outside temperature during cycle */
	avgOutsideTemp?: number;
}

/**
 * Room thermal characteristics learned from history
 */
export interface RoomThermalProfile {
	/** Room identifier */
	room: string;
	/** Last update timestamp */
	lastUpdated: number;

	/** Average °C per hour */
	avgHeatingRate: number;
	/** Average °C per hour after heating stops */
	avgCooldownRate: number;
	/** Time constant (how long to reach 63% of target) */
	thermalInertia: number;
	/** Typical overshoot in °C */
	typicalOvershoot: number;

	/** Number of cycles used for learning */
	cycleCount: number;
	/** 0-1, based on data quality and quantity */
	confidence: number;
}

/**
 * ML model training data point
 */
export interface TrainingDataPoint {
	/** Current temperature */
	currentTemp: number;
	/** Target temperature */
	targetTemp: number;
	/** target - current */
	tempDifference: number;
	/** How long has heating been active (minutes) */
	heatingDuration: number;
	/** °C per hour in last 15 minutes */
	recentHeatingRate: number;
	/** Outside temperature */
	outsideTemp?: number;
	/** Hour of day 0-23 */
	timeOfDay: number;
	/** Day of week 0-6 */
	dayOfWeek: number;

	/** Temperature change in next 30 minutes */
	futureTempChange: number;
	/** Will temperature overshoot target? */
	willOvershoot: boolean;
	/** Optimal °C before target to stop heating */
	optimalStopOffset: number;
}

/**
 * ML model prediction result
 */
export interface HeatingPrediction {
	/** Predicted temperature in 30 minutes */
	predictedTempIn30Min: number;
	/** Predicted temperature in 60 minutes */
	predictedTempIn60Min: number;
	/** Recommendation to stop heating */
	shouldStopHeating: boolean;
	/** Recommended offset (°C before target to stop) */
	stopOffset: number;
	/** Prediction confidence 0-1 */
	confidence: number;
}

/**
 * Persistent history storage structure
 */
export interface HeatingHistoryData {
	/** Data format version */
	version: string;
	/** Room-specific data */
	rooms: {
		[roomName: string]: {
			/** Completed heating cycles */
			cycles: HeatingCycle[];
			/** Learned thermal profile */
			profile: RoomThermalProfile;
			/** Timestamp of last model training */
			modelLastTrained?: number;
		};
	};
}
