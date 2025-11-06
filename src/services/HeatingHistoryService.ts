/**
 * Service for collecting and managing heating history data
 * Used for ML model training and analysis
 */

import type {
    TemperatureMeasurement,
    HeatingCycle,
    RoomThermalProfile,
    HeatingHistoryData,
    TrainingDataPoint
} from '../models/heatingHistory';

export class HeatingHistoryService {
    private currentCycles: Map<string, {
        measurements: TemperatureMeasurement[];
        engineState: boolean;
        startTime: number;
    }> = new Map();

    private completedCycles: Map<string, HeatingCycle[]> = new Map();
    private roomProfiles: Map<string, RoomThermalProfile> = new Map();

    private readonly maxCyclesPerRoom = 100; // Keep last 100 cycles per room
    private readonly minMeasurementsForCycle = 5; // Minimum measurements to consider a cycle valid

    constructor(
        private readonly saveCallback: (data: HeatingHistoryData) => Promise<void>,
        private readonly logCallback: (level: 'debug' | 'info' | 'warn' | 'error', message: string) => void
    ) {}

    /**
     * Record a new temperature measurement
     */
    public recordMeasurement(
        room: string,
        temperature: number,
        targetTemperature: number,
        engineState: boolean,
        humidity?: number,
        outsideTemperature?: number
    ): void {
        const measurement: TemperatureMeasurement = {
            timestamp: Date.now(),
            temperature,
            targetTemperature,
            engineState,
            humidity,
            outsideTemperature
        };

        // Initialize room cycle if not exists
        if (!this.currentCycles.has(room)) {
            this.currentCycles.set(room, {
                measurements: [],
                engineState: false,
                startTime: Date.now()
            });
        }

        const cycle = this.currentCycles.get(room)!;

        // Detect heating cycle transitions
        if (!cycle.engineState && engineState) {
            // Heating started - begin new cycle
            this.logCallback('debug', `[HeatingHistory] Heating cycle started for room: ${room}`);
            cycle.startTime = Date.now();
            cycle.measurements = [measurement];
            cycle.engineState = true;
        } else if (cycle.engineState && !engineState) {
            // Heating stopped - continue tracking for overshoot detection
            this.logCallback('debug', `[HeatingHistory] Heating stopped for room: ${room}, tracking overshoot...`);
            cycle.measurements.push(measurement);
            cycle.engineState = false;

            // Schedule cycle completion check after 30 minutes
            setTimeout(() => this.completeCycle(room), 30 * 60 * 1000);
        } else if (cycle.engineState || cycle.measurements.length > 0) {
            // Continue adding measurements to active or cooling cycle
            cycle.measurements.push(measurement);
        }
    }

    /**
     * Complete a heating cycle and analyze it
     */
    private completeCycle(room: string): void {
        const cycle = this.currentCycles.get(room);
        if (!cycle || cycle.measurements.length < this.minMeasurementsForCycle) {
            this.logCallback('debug', `[HeatingHistory] Cycle for ${room} has insufficient data, discarding`);
            this.currentCycles.delete(room);
            return;
        }

        // Analyze cycle
        const heatingCycle = this.analyzeCycle(room, cycle.measurements, cycle.startTime);

        if (heatingCycle) {
            // Store cycle
            if (!this.completedCycles.has(room)) {
                this.completedCycles.set(room, []);
            }

            const cycles = this.completedCycles.get(room)!;
            cycles.push(heatingCycle);

            // Keep only recent cycles
            if (cycles.length > this.maxCyclesPerRoom) {
                cycles.shift();
            }

            this.logCallback('info',
                `[HeatingHistory] Cycle completed for ${room}: ` +
                `${heatingCycle.duration.toFixed(1)}min, ` +
                `${heatingCycle.startTemp.toFixed(1)}°C → ${heatingCycle.maxTemp.toFixed(1)}°C, ` +
                `overshoot: ${heatingCycle.overshoot.toFixed(2)}°C`
            );

            // Update room thermal profile
            this.updateRoomProfile(room);

            // Persist data
            this.persistData().catch(err =>
                this.logCallback('error', `[HeatingHistory] Failed to persist data: ${err}`)
            );
        }

        // Clear current cycle
        this.currentCycles.delete(room);
    }

    /**
     * Analyze a heating cycle and compute metrics
     */
    private analyzeCycle(room: string, measurements: TemperatureMeasurement[], startTime: number): HeatingCycle | null {
        if (measurements.length === 0) return null;

        const heatingMeasurements = measurements.filter(m => m.engineState);
        const coolingMeasurements = measurements.filter(m => !m.engineState);

        if (heatingMeasurements.length === 0) return null;

        const startTemp = heatingMeasurements[0].temperature;
        const targetTemp = heatingMeasurements[0].targetTemperature;
        const endTime = measurements[measurements.length - 1].timestamp;
        const duration = (endTime - startTime) / 1000 / 60; // minutes

        // Find engine stop point
        const engineStopIndex = measurements.findIndex(m => !m.engineState);
        const endTemp = engineStopIndex > 0 ? measurements[engineStopIndex - 1].temperature : measurements[measurements.length - 1].temperature;

        // Find maximum temperature (overshoot)
        const maxTemp = Math.max(...measurements.map(m => m.temperature));
        const overshoot = Math.max(0, maxTemp - targetTemp);

        // Calculate heating rate (°C per hour)
        let heatingRate = 0;
        if (heatingMeasurements.length >= 2) {
            const heatingDuration = (heatingMeasurements[heatingMeasurements.length - 1].timestamp - heatingMeasurements[0].timestamp) / 1000 / 3600; // hours
            const tempChange = heatingMeasurements[heatingMeasurements.length - 1].temperature - heatingMeasurements[0].temperature;
            heatingRate = heatingDuration > 0 ? tempChange / heatingDuration : 0;
        }

        // Calculate cooldown rate (°C per hour after heating stops)
        let cooldownRate = 0;
        if (coolingMeasurements.length >= 2) {
            const cooldownDuration = (coolingMeasurements[coolingMeasurements.length - 1].timestamp - coolingMeasurements[0].timestamp) / 1000 / 3600; // hours
            const tempChange = coolingMeasurements[coolingMeasurements.length - 1].temperature - coolingMeasurements[0].temperature;
            cooldownRate = cooldownDuration > 0 ? tempChange / cooldownDuration : 0;
        }

        // Average outside temperature
        const outsideTemps = measurements.filter(m => m.outsideTemperature !== undefined).map(m => m.outsideTemperature!);
        const avgOutsideTemp = outsideTemps.length > 0 ? outsideTemps.reduce((a, b) => a + b, 0) / outsideTemps.length : undefined;

        return {
            room,
            startTime,
            endTime,
            measurements,
            duration,
            startTemp,
            endTemp,
            targetTemp,
            maxTemp,
            overshoot,
            heatingRate,
            cooldownRate,
            avgOutsideTemp
        };
    }

    /**
     * Update room thermal profile based on completed cycles
     */
    private updateRoomProfile(room: string): void {
        const cycles = this.completedCycles.get(room);
        if (!cycles || cycles.length === 0) return;

        // Calculate averages from recent cycles
        const recentCycles = cycles.slice(-20); // Use last 20 cycles

        const avgHeatingRate = recentCycles.reduce((sum, c) => sum + c.heatingRate, 0) / recentCycles.length;
        const avgCooldownRate = Math.abs(recentCycles.reduce((sum, c) => sum + c.cooldownRate, 0) / recentCycles.length);
        const typicalOvershoot = recentCycles.reduce((sum, c) => sum + c.overshoot, 0) / recentCycles.length;

        // Estimate thermal inertia (time constant)
        // Time to reach 63% of temperature difference
        const avgDuration = recentCycles.reduce((sum, c) => sum + c.duration, 0) / recentCycles.length;
        const thermalInertia = avgDuration * 0.63;

        // Calculate confidence based on data quality
        const confidence = Math.min(1.0, cycles.length / 20); // Full confidence after 20 cycles

        const profile: RoomThermalProfile = {
            room,
            lastUpdated: Date.now(),
            avgHeatingRate,
            avgCooldownRate,
            thermalInertia,
            typicalOvershoot,
            cycleCount: cycles.length,
            confidence
        };

        this.roomProfiles.set(room, profile);

        this.logCallback('info',
            `[HeatingHistory] Updated profile for ${room}: ` +
            `heating rate: ${avgHeatingRate.toFixed(2)}°C/h, ` +
            `cooldown: ${avgCooldownRate.toFixed(2)}°C/h, ` +
            `overshoot: ${typicalOvershoot.toFixed(2)}°C, ` +
            `confidence: ${(confidence * 100).toFixed(0)}%`
        );
    }

    /**
     * Get room thermal profile
     */
    public getRoomProfile(room: string): RoomThermalProfile | undefined {
        return this.roomProfiles.get(room);
    }

    /**
     * Generate training data for ML model
     */
    public generateTrainingData(room: string): TrainingDataPoint[] {
        const cycles = this.completedCycles.get(room);
        if (!cycles || cycles.length === 0) return [];

        const trainingData: TrainingDataPoint[] = [];

        for (const cycle of cycles) {
            // Generate multiple training points from each cycle
            const heatingMeasurements = cycle.measurements.filter(m => m.engineState);

            for (let i = 0; i < heatingMeasurements.length - 1; i++) {
                const current = heatingMeasurements[i];
                const future = cycle.measurements.find(m => m.timestamp >= current.timestamp + 30 * 60 * 1000); // 30 min later

                if (!future) continue;

                // Calculate recent heating rate
                const recentStart = Math.max(0, i - 3); // Look back 3 measurements
                const recentMeasurements = heatingMeasurements.slice(recentStart, i + 1);
                let recentHeatingRate = 0;
                if (recentMeasurements.length >= 2) {
                    const duration = (recentMeasurements[recentMeasurements.length - 1].timestamp - recentMeasurements[0].timestamp) / 1000 / 3600;
                    const tempChange = recentMeasurements[recentMeasurements.length - 1].temperature - recentMeasurements[0].temperature;
                    recentHeatingRate = duration > 0 ? tempChange / duration : 0;
                }

                const heatingDuration = (current.timestamp - cycle.startTime) / 1000 / 60; // minutes
                const tempDifference = current.targetTemperature - current.temperature;
                const futureTempChange = future.temperature - current.temperature;
                const willOvershoot = cycle.overshoot > 0.1;

                // Calculate optimal stop offset based on actual overshoot
                const optimalStopOffset = cycle.overshoot > 0 ? cycle.overshoot : 0;

                const date = new Date(current.timestamp);

                trainingData.push({
                    currentTemp: current.temperature,
                    targetTemp: current.targetTemperature,
                    tempDifference,
                    heatingDuration,
                    recentHeatingRate,
                    outsideTemp: current.outsideTemperature,
                    timeOfDay: date.getHours(),
                    dayOfWeek: date.getDay(),
                    futureTempChange,
                    willOvershoot,
                    optimalStopOffset
                });
            }
        }

        this.logCallback('debug', `[HeatingHistory] Generated ${trainingData.length} training points for ${room}`);
        return trainingData;
    }

    /**
     * Load history from persistent storage
     */
    public loadHistory(data: HeatingHistoryData): void {
        for (const [roomName, roomData] of Object.entries(data.rooms)) {
            if (roomData.cycles) {
                this.completedCycles.set(roomName, roomData.cycles);
            }
            if (roomData.profile) {
                this.roomProfiles.set(roomName, roomData.profile);
            }
        }
        this.logCallback('info', `[HeatingHistory] Loaded history for ${Object.keys(data.rooms).length} rooms`);
    }

    /**
     * Export history data
     */
    public exportHistory(): HeatingHistoryData {
        const rooms: HeatingHistoryData['rooms'] = {};

        for (const [room, cycles] of this.completedCycles.entries()) {
            rooms[room] = {
                cycles,
                profile: this.roomProfiles.get(room)!
            };
        }

        return {
            version: '1.0.0',
            rooms
        };
    }

    /**
     * Persist data to storage
     */
    private async persistData(): Promise<void> {
        const data = this.exportHistory();
        await this.saveCallback(data);
    }

    /**
     * Get statistics for a room
     */
    public getRoomStatistics(room: string): {
        cycleCount: number;
        avgOvershoot: number;
        avgHeatingRate: number;
        confidence: number;
    } | null {
        const cycles = this.completedCycles.get(room);
        const profile = this.roomProfiles.get(room);

        if (!cycles || cycles.length === 0) return null;

        return {
            cycleCount: cycles.length,
            avgOvershoot: profile?.typicalOvershoot || 0,
            avgHeatingRate: profile?.avgHeatingRate || 0,
            confidence: profile?.confidence || 0
        };
    }

    /**
     * Clear all history data
     */
    public clearHistory(): void {
        this.currentCycles.clear();
        this.completedCycles.clear();
        this.roomProfiles.clear();
        this.logCallback('info', '[HeatingHistory] All history data cleared');
    }
}
