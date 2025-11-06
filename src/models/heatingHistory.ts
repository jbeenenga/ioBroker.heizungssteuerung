/**
 * Models for heating history data collection and ML training
 */

/**
 * Single temperature measurement point
 */
export interface TemperatureMeasurement {
    timestamp: number;           // Unix timestamp in ms
    temperature: number;         // Current temperature in °C
    targetTemperature: number;   // Target temperature in °C
    humidity?: number;           // Humidity in %
    outsideTemperature?: number; // Outside temperature in °C
    engineState: boolean;        // true = heating/cooling active
}

/**
 * Complete heating/cooling cycle data
 */
export interface HeatingCycle {
    room: string;
    startTime: number;           // Cycle start timestamp
    endTime: number;             // Cycle end timestamp
    measurements: TemperatureMeasurement[];

    // Computed metrics
    duration: number;            // Duration in minutes
    startTemp: number;           // Temperature at start
    endTemp: number;             // Temperature at engine stop
    targetTemp: number;          // Target temperature
    maxTemp: number;             // Maximum reached temperature (overshoot)
    overshoot: number;           // maxTemp - targetTemp
    heatingRate: number;         // °C per hour while heating
    cooldownRate: number;        // °C per hour after heating stops
    avgOutsideTemp?: number;     // Average outside temperature during cycle
}

/**
 * Room thermal characteristics learned from history
 */
export interface RoomThermalProfile {
    room: string;
    lastUpdated: number;

    // Learned characteristics
    avgHeatingRate: number;          // Average °C per hour
    avgCooldownRate: number;         // Average °C per hour after heating stops
    thermalInertia: number;          // Time constant (how long to reach 63% of target)
    typicalOvershoot: number;        // Typical overshoot in °C

    // Statistics
    cycleCount: number;              // Number of cycles used for learning
    confidence: number;              // 0-1, based on data quality and quantity
}

/**
 * ML model training data point
 */
export interface TrainingDataPoint {
    // Input features
    currentTemp: number;
    targetTemp: number;
    tempDifference: number;          // target - current
    heatingDuration: number;         // How long has heating been active (minutes)
    recentHeatingRate: number;       // °C per hour in last 15 minutes
    outsideTemp?: number;
    timeOfDay: number;               // 0-23
    dayOfWeek: number;               // 0-6

    // Output labels
    futureTempChange: number;        // Temperature change in next 30 minutes
    willOvershoot: boolean;          // Will temperature overshoot target?
    optimalStopOffset: number;       // Optimal °C before target to stop heating
}

/**
 * ML model prediction result
 */
export interface HeatingPrediction {
    predictedTempIn30Min: number;    // Predicted temperature in 30 minutes
    predictedTempIn60Min: number;    // Predicted temperature in 60 minutes
    shouldStopHeating: boolean;      // Recommendation to stop heating
    stopOffset: number;              // Recommended offset (°C before target to stop)
    confidence: number;              // Prediction confidence 0-1
}

/**
 * Persistent history storage structure
 */
export interface HeatingHistoryData {
    version: string;
    rooms: {
        [roomName: string]: {
            cycles: HeatingCycle[];
            profile: RoomThermalProfile;
            modelLastTrained?: number;
        };
    };
}
