/**
 * AI-enhanced temperature controller
 * Extends TemperatureController with ML-based predictive control
 * Can switch between classic hysteresis and AI-based control
 */

import { TemperatureController, type TemperatureControllerConfig } from "./TemperatureController";
import { AITemperaturePredictor } from "./AITemperaturePredictor";
import { HeatingHistoryService } from "./HeatingHistoryService";
import type { HeatingHistoryData } from "../models/heatingHistory";

export interface AITemperatureControllerConfig extends TemperatureControllerConfig {
	/** Enable AI-based control */
	enableAI: boolean;
	/** Path to save ML models */
	aiModelPath: string;
	/** Minimum confidence to use AI predictions (0-1) */
	aiConfidenceThreshold: number;
	/** Minimum training data points before using AI */
	aiMinTrainingData: number;
	/** Training epochs for ML model */
	aiTrainingEpochs: number;
	/** Learning rate for ML model */
	aiLearningRate: number;
	/** Auto-retrain models periodically */
	aiAutoRetrain: boolean;
	/** Retrain interval in hours */
	aiRetrainInterval: number;
}

/**
 * Context for AI decision making
 */
export interface AIContext {
	/**
	 *
	 */
	room: string;
	/**
	 *
	 */
	heatingDuration: number; // How long has heating been active (minutes)
	/**
	 *
	 */
	recentHeatingRate: number; // Recent temperature change rate (°C/hour)
	/**
	 *
	 */
	outsideTemp?: number;
	/**
	 *
	 */
	lastEngineState: boolean; // Previous engine state
}

export class AITemperatureController extends TemperatureController {
	private aiPredictor?: AITemperaturePredictor;
	private historyService?: HeatingHistoryService;
	private currentEngineStates: Map<string, boolean> = new Map();
	private heatingStartTimes: Map<string, number> = new Map();
	private recentTemperatures: Map<
		string,
		Array<{
			temp: number;
			time: number;
		}>
	> = new Map();
	private lastRetrainCheck = Date.now();
	private predictionCache: Map<
		string,
		{
			prediction: any;
			timestamp: number;
		}
	> = new Map();
	private readonly predictionCacheMaxAge = 5000; // 5 seconds cache

	/**
	 *
	 */
	constructor(
		private aiConfig: AITemperatureControllerConfig,
		private logCallback: (level: "debug" | "info" | "warn" | "error", message: string) => void,
		private saveHistoryCallback: (data: HeatingHistoryData) => Promise<void>,
	) {
		super(aiConfig);

		if (aiConfig.enableAI) {
			this.initializeAI();
		} else {
			this.logCallback("info", "[AIController] AI control disabled, using classic hysteresis control");
		}
	}

	/**
	 * Initialize AI components
	 */
	private initializeAI(): void {
		this.logCallback("info", "[AIController] Initializing AI components...");

		// Create AI predictor
		this.aiPredictor = new AITemperaturePredictor(
			{
				modelSavePath: this.aiConfig.aiModelPath,
				minTrainingData: this.aiConfig.aiMinTrainingData,
				trainingEpochs: this.aiConfig.aiTrainingEpochs,
				learningRate: this.aiConfig.aiLearningRate,
				confidenceThreshold: this.aiConfig.aiConfidenceThreshold,
			},
			this.logCallback,
		);

		// Create history service
		this.historyService = new HeatingHistoryService(this.saveHistoryCallback, this.logCallback);

		this.logCallback("info", "[AIController] AI components initialized");
	}

	/**
	 * Enable or disable AI control at runtime
	 *
	 * @param enabled
	 */
	public setAIEnabled(enabled: boolean): void {
		if (enabled && !this.aiPredictor) {
			this.logCallback("info", "[AIController] Enabling AI control...");
			this.aiConfig.enableAI = true;
			this.initializeAI();
		} else if (!enabled && this.aiPredictor) {
			this.logCallback("info", "[AIController] Disabling AI control, switching to classic mode");
			this.aiConfig.enableAI = false;
			this.aiPredictor.dispose();
			this.aiPredictor = undefined;
		}
	}

	/**
	 * Check if AI is enabled and ready
	 */
	public isAIEnabled(): boolean {
		return this.aiConfig.enableAI && this.aiPredictor !== undefined;
	}

	/**
	 * Determine if engine should be activated (AI-enhanced version)
	 * Overrides parent method with AI logic when enabled
	 *
	 * @param currentTemp
	 * @param targetTemp
	 * @param humidity
	 * @param context
	 */
	public shouldActivateEngine(
		currentTemp: number,
		targetTemp: number,
		humidity?: number,
		context?: AIContext,
	): boolean | null {
		// Record temperature measurement for learning
		if (this.historyService && context) {
			this.recordMeasurement(
				context.room,
				currentTemp,
				targetTemp,
				context.lastEngineState,
				humidity,
				context.outsideTemp,
			);
		}

		// If AI is disabled, use classic control
		if (!this.aiConfig.enableAI || !this.aiPredictor || !this.historyService || !context) {
			return super.shouldActivateEngine(currentTemp, targetTemp, humidity);
		}

		// Get room thermal profile
		const profile = this.historyService.getRoomProfile(context.room);

		// If not enough data or low confidence, fall back to classic control
		if (!profile || profile.confidence < this.aiConfig.aiConfidenceThreshold) {
			this.logCallback(
				"debug",
				`[AIController] ${context.room}: Insufficient data/confidence, using classic control ` +
					`(confidence: ${profile?.confidence.toFixed(2) || "N/A"})`,
			);
			return super.shouldActivateEngine(currentTemp, targetTemp, humidity);
		}

		// Check if model is ready
		if (!this.aiPredictor.isModelReady(context.room)) {
			this.logCallback("debug", `[AIController] ${context.room}: Model not ready, using classic control`);
			return super.shouldActivateEngine(currentTemp, targetTemp, humidity);
		}

		// Update prediction cache in background (non-blocking)
		this.updatePredictionCache(
			context.room,
			currentTemp,
			targetTemp,
			context.heatingDuration,
			context.recentHeatingRate,
			profile,
			context.outsideTemp,
		);

		// Use AI prediction from cache
		return this.shouldActivateEngineAI(currentTemp, targetTemp, humidity, context, profile);
	}

	/**
	 * Update prediction cache in background
	 *
	 * @param room
	 * @param currentTemp
	 * @param targetTemp
	 * @param heatingDuration
	 * @param recentHeatingRate
	 * @param profile
	 * @param outsideTemp
	 */
	private updatePredictionCache(
		room: string,
		currentTemp: number,
		targetTemp: number,
		heatingDuration: number,
		recentHeatingRate: number,
		profile: any,
		outsideTemp?: number,
	): void {
		// Check if cache is still fresh
		const cached = this.predictionCache.get(room);
		if (cached && Date.now() - cached.timestamp < this.predictionCacheMaxAge) {
			return; // Cache is still fresh
		}

		// Update cache in background
		this.aiPredictor!.predict(
			room,
			currentTemp,
			targetTemp,
			heatingDuration,
			recentHeatingRate,
			profile,
			outsideTemp,
		)
			.then(prediction => {
				if (prediction) {
					this.predictionCache.set(room, { prediction, timestamp: Date.now() });
				}
			})
			.catch(err => {
				this.logCallback("error", `[AIController] ${room}: Prediction update failed: ${err}`);
			});
	}

	/**
	 * AI-based engine activation decision (synchronous, uses cached prediction)
	 *
	 * @param currentTemp
	 * @param targetTemp
	 * @param humidity
	 * @param context
	 * @param profile
	 */
	private shouldActivateEngineAI(
		currentTemp: number,
		targetTemp: number,
		humidity: number | undefined,
		context: AIContext,
		profile: any,
	): boolean | null {
		// For cooling mode with high humidity, always respect humidity limit (safety override)
		if (
			this.aiConfig.isHeatingMode === 1 &&
			humidity !== undefined &&
			humidity > this.aiConfig.stopCoolingIfHumIsHigherThan
		) {
			return false;
		}

		// Get cached prediction
		const cached = this.predictionCache.get(context.room);
		if (!cached) {
			// No cached prediction yet, use classic control
			this.logCallback("debug", `[AIController] ${context.room}: No cached prediction, using classic control`);
			return super.shouldActivateEngine(currentTemp, targetTemp, humidity);
		}

		const prediction = cached.prediction;

		// Check confidence
		if (prediction.confidence < this.aiConfig.aiConfidenceThreshold) {
			this.logCallback(
				"debug",
				`[AIController] ${context.room}: Low prediction confidence ${prediction.confidence.toFixed(2)}, using classic control`,
			);
			return super.shouldActivateEngine(currentTemp, targetTemp, humidity);
		}

		// Make decision based on prediction
		if (this.aiConfig.isHeatingMode === 0) {
			// Heating mode
			const tempDiff = targetTemp - currentTemp;

			if (tempDiff < 0) {
				// Already above target
				return false;
			}

			if (prediction.shouldStopHeating) {
				// AI recommends stopping
				this.logCallback(
					"debug",
					`[AIController] ${context.room}: AI recommends stopping heating ` +
						`(current: ${currentTemp.toFixed(2)}°C, target: ${targetTemp.toFixed(2)}°C, ` +
						`predicted +30min: ${prediction.predictedTempIn30Min.toFixed(2)}°C)`,
				);
				return false;
			}

			if (tempDiff > this.aiConfig.startStopDifference * 2) {
				// Far from target, definitely heat
				return true;
			}

			// Within decision zone - use AI recommendation
			if (tempDiff <= prediction.stopOffset) {
				// Close enough to target considering thermal inertia
				return false;
			}

			return true;
		}
		// Cooling mode
		const tempDiff = currentTemp - targetTemp;

		if (tempDiff < 0) {
			// Already below target
			return false;
		}

		if (prediction.shouldStopHeating) {
			// AI recommends stopping (in cooling mode, "heating" means "cooling")
			return false;
		}

		if (tempDiff > this.aiConfig.startStopDifference * 2) {
			// Far from target, definitely cool
			return true;
		}

		if (tempDiff <= prediction.stopOffset) {
			return false;
		}

		return true;
	}

	/**
	 * Record temperature measurement for learning
	 *
	 * @param room
	 * @param currentTemp
	 * @param targetTemp
	 * @param engineState
	 * @param humidity
	 * @param outsideTemp
	 */
	private recordMeasurement(
		room: string,
		currentTemp: number,
		targetTemp: number,
		engineState: boolean,
		humidity?: number,
		outsideTemp?: number,
	): void {
		if (!this.historyService) {
			return;
		}

		this.historyService.recordMeasurement(room, currentTemp, targetTemp, engineState, humidity, outsideTemp);

		// Update tracking for context calculation
		this.currentEngineStates.set(room, engineState);

		if (engineState && !this.heatingStartTimes.has(room)) {
			this.heatingStartTimes.set(room, Date.now());
		} else if (!engineState) {
			this.heatingStartTimes.delete(room);
		}

		// Track recent temperatures for rate calculation
		if (!this.recentTemperatures.has(room)) {
			this.recentTemperatures.set(room, []);
		}
		const recent = this.recentTemperatures.get(room)!;
		recent.push({ temp: currentTemp, time: Date.now() });

		// Keep only last 15 minutes
		const cutoff = Date.now() - 15 * 60 * 1000;
		this.recentTemperatures.set(
			room,
			recent.filter(r => r.time > cutoff),
		);
	}

	/**
	 * Calculate context for AI decision making
	 *
	 * @param room
	 * @param outsideTemp
	 */
	public getAIContext(room: string, outsideTemp?: number): AIContext {
		const heatingStartTime = this.heatingStartTimes.get(room);
		const heatingDuration = heatingStartTime ? (Date.now() - heatingStartTime) / 1000 / 60 : 0;

		// Calculate recent heating rate
		const recent = this.recentTemperatures.get(room) || [];
		let recentHeatingRate = 0;
		if (recent.length >= 2) {
			const first = recent[0];
			const last = recent[recent.length - 1];
			const duration = (last.time - first.time) / 1000 / 3600; // hours
			const tempChange = last.temp - first.temp;
			recentHeatingRate = duration > 0 ? tempChange / duration : 0;
		}

		return {
			room,
			heatingDuration,
			recentHeatingRate,
			outsideTemp,
			lastEngineState: this.currentEngineStates.get(room) || false,
		};
	}

	/**
	 * Train or retrain model for a room
	 *
	 * @param room
	 */
	public async trainModel(room: string): Promise<boolean> {
		if (!this.aiPredictor || !this.historyService) {
			this.logCallback("warn", "[AIController] Cannot train: AI components not initialized");
			return false;
		}

		const trainingData = this.historyService.generateTrainingData(room);
		if (trainingData.length === 0) {
			this.logCallback("debug", `[AIController] No training data available for ${room}`);
			return false;
		}

		return await this.aiPredictor.trainModel(room, trainingData);
	}

	/**
	 * Auto-retrain models if needed
	 */
	public async checkAndRetrain(): Promise<void> {
		if (!this.aiConfig.enableAI || !this.aiConfig.aiAutoRetrain) {
			return;
		}

		const now = Date.now();
		const retrainInterval = this.aiConfig.aiRetrainInterval * 60 * 60 * 1000;

		if (now - this.lastRetrainCheck < retrainInterval) {
			return;
		}

		this.lastRetrainCheck = now;
		this.logCallback("info", "[AIController] Starting auto-retrain check...");

		// Get all rooms that have history
		if (!this.historyService) {
			return;
		}

		const historyData = this.historyService.exportHistory();
		for (const room of Object.keys(historyData.rooms)) {
			const stats = this.historyService.getRoomStatistics(room);
			if (stats && stats.cycleCount >= this.aiConfig.aiMinTrainingData) {
				this.logCallback("info", `[AIController] Auto-retraining model for ${room}...`);
				await this.trainModel(room);
			}
		}
	}

	/**
	 * Load history data
	 *
	 * @param data
	 */
	public loadHistory(data: HeatingHistoryData): void {
		if (this.historyService) {
			this.historyService.loadHistory(data);
		}
	}

	/**
	 * Load models from disk
	 *
	 * @param rooms
	 */
	public async loadModels(rooms: string[]): Promise<void> {
		if (!this.aiPredictor) {
			return;
		}

		for (const room of rooms) {
			await this.aiPredictor.loadModel(room);
		}
	}

	/**
	 * Get statistics for a room
	 *
	 * @param room
	 */
	public getRoomStatistics(room: string): any {
		if (!this.historyService) {
			return null;
		}
		return this.historyService.getRoomStatistics(room);
	}

	/**
	 * Get AI status
	 */
	public getAIStatus(): {
		enabled: boolean;
		modelsReady: { [room: string]: boolean };
		statistics: { [room: string]: any };
		} {
		const status = {
			enabled: this.aiConfig.enableAI,
			modelsReady: {} as { [room: string]: boolean },
			statistics: {} as { [room: string]: any },
		};

		if (!this.historyService) {
			return status;
		}

		const historyData = this.historyService.exportHistory();
		for (const room of Object.keys(historyData.rooms)) {
			status.modelsReady[room] = this.aiPredictor?.isModelReady(room) || false;
			status.statistics[room] = this.historyService.getRoomStatistics(room);
		}

		return status;
	}

	/**
	 * Cleanup resources
	 */
	public dispose(): void {
		if (this.aiPredictor) {
			this.aiPredictor.dispose();
		}
		this.currentEngineStates.clear();
		this.heatingStartTimes.clear();
		this.recentTemperatures.clear();
	}
}
