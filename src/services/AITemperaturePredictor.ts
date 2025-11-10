/**
 * AI-based temperature prediction using TensorFlow.js
 * Learns room-specific thermal characteristics and predicts optimal heating control
 */

import * as tf from "@tensorflow/tfjs-node";
import type { HeatingPrediction, TrainingDataPoint, RoomThermalProfile } from "../models/heatingHistory";

/**
 * Configuration for AI temperature predictor
 */
export interface AIPredictorConfig {
	/** Path to save/load models */
	modelSavePath: string;
	/** Minimum training samples before using AI */
	minTrainingData: number;
	/** Number of training epochs */
	trainingEpochs: number;
	/** Learning rate for optimizer */
	learningRate: number;
	/** Minimum confidence to trust predictions */
	confidenceThreshold: number;
}

/**
 * AI-based temperature prediction service
 */
export class AITemperaturePredictor {
	private models: Map<string, tf.LayersModel> = new Map();
	private isTraining: Map<string, boolean> = new Map();
	private lastTrainingTime: Map<string, number> = new Map();
	private readonly minRetrainingInterval = 60 * 60 * 1000; // 1 hour

	/**
	 * Create AI temperature predictor
	 *
	 * @param config - Predictor configuration
	 * @param logCallback - Logging callback function
	 */
	constructor(
		private readonly config: AIPredictorConfig,
		private readonly logCallback: (level: "debug" | "info" | "warn" | "error", message: string) => void,
	) {}

	/**
	 * Create a neural network model for a room
	 */
	private createModel(): any {
		const model = tf.sequential();

		// Input layer: 8 features
		// [currentTemp, targetTemp, tempDiff, heatingDuration, heatingRate, outsideTemp, timeOfDay, dayOfWeek]
		model.add(
			tf.layers.dense({
				inputShape: [8],
				units: 32,
				activation: "relu",
				kernelInitializer: "heNormal",
			}),
		);

		// Hidden layer 1
		model.add(tf.layers.dropout({ rate: 0.2 }));
		model.add(
			tf.layers.dense({
				units: 24,
				activation: "relu",
				kernelInitializer: "heNormal",
			}),
		);

		// Hidden layer 2
		model.add(tf.layers.dropout({ rate: 0.2 }));
		model.add(
			tf.layers.dense({
				units: 16,
				activation: "relu",
				kernelInitializer: "heNormal",
			}),
		);

		// Output layer: 3 outputs
		// [tempChangeIn30Min, tempChangeIn60Min, optimalStopOffset]
		model.add(
			tf.layers.dense({
				units: 3,
				activation: "linear",
			}),
		);

		// Compile model
		model.compile({
			optimizer: tf.train.adam(this.config.learningRate),
			loss: "meanSquaredError",
			metrics: ["mae"],
		});

		return model;
	}

	/**
	 * Normalize input features
	 *
	 * @param dataPoints
	 */
	private normalizeInputs(dataPoints: TrainingDataPoint[]): {
		/**
		 *
		 */
		inputs: number[][];
		/**
		 *
		 */
		outputs: number[][];
		/**
		 *
		 */
		stats: {
			/**
			 *
			 */
			mean: number[];
			/**
			 *
			 */
			std: number[];
		};
	} {
		const inputs: number[][] = [];
		const outputs: number[][] = [];

		for (const point of dataPoints) {
			inputs.push([
				point.currentTemp,
				point.targetTemp,
				point.tempDifference,
				point.heatingDuration,
				point.recentHeatingRate,
				point.outsideTemp || 15, // Default outside temp if not available
				point.timeOfDay / 24, // Normalize to 0-1
				point.dayOfWeek / 7, // Normalize to 0-1
			]);

			// We'll predict temperature change in 30min and optimal stop offset
			// For 60min prediction, we can extrapolate from 30min
			outputs.push([
				point.futureTempChange,
				point.futureTempChange * 2, // Rough estimate for 60min
				point.optimalStopOffset,
			]);
		}

		// Calculate mean and std for normalization
		const mean = new Array(8).fill(0);
		const std = new Array(8).fill(1);

		if (inputs.length > 0) {
			for (let i = 0; i < 8; i++) {
				const values = inputs.map(input => input[i]);
				mean[i] = values.reduce((a, b) => a + b, 0) / values.length;
				const variance = values.reduce((sum, val) => sum + Math.pow(val - mean[i], 2), 0) / values.length;
				std[i] = Math.sqrt(variance) || 1;
			}
		}

		// Normalize inputs
		const normalizedInputs = inputs.map(input => input.map((val, i) => (val - mean[i]) / std[i]));

		return { inputs: normalizedInputs, outputs, stats: { mean, std } };
	}

	/**
	 * Train model for a specific room
	 *
	 * @param room
	 * @param trainingData
	 */
	public async trainModel(room: string, trainingData: TrainingDataPoint[]): Promise<boolean> {
		if (trainingData.length < this.config.minTrainingData) {
			this.logCallback(
				"debug",
				`[AIPredictor] Insufficient training data for ${room}: ${trainingData.length}/${this.config.minTrainingData}`,
			);
			return false;
		}

		// Check if already training
		if (this.isTraining.get(room)) {
			this.logCallback("debug", `[AIPredictor] Model for ${room} is already training`);
			return false;
		}

		// Check retraining interval
		const lastTraining = this.lastTrainingTime.get(room) || 0;
		if (Date.now() - lastTraining < this.minRetrainingInterval) {
			this.logCallback("debug", `[AIPredictor] Too soon to retrain ${room}`);
			return false;
		}

		this.isTraining.set(room, true);

		try {
			this.logCallback("info", `[AIPredictor] Training model for ${room} with ${trainingData.length} samples`);

			// Normalize data
			const { inputs, outputs, stats } = this.normalizeInputs(trainingData);

			// Create or get model
			let model = this.models.get(room);
			if (!model) {
				model = this.createModel();
				this.models.set(room, model as any);
			}

			// TypeScript safety check
			if (!model) {
				throw new Error(`Failed to create model for room ${room}`);
			}

			// Convert to tensors
			const xs = (tf as any).tensor2d(inputs);
			const ys = (tf as any).tensor2d(outputs);

			// Train model
			const history = await model.fit(xs, ys, {
				epochs: this.config.trainingEpochs,
				batchSize: 32,
				validationSplit: 0.2,
				shuffle: true,
				verbose: 0,
				callbacks: {
					onEpochEnd: (epoch: number, logs?: tf.Logs) => {
						if (epoch % 10 === 0) {
							this.logCallback(
								"debug",
								`[AIPredictor] ${room} - Epoch ${epoch}: ` +
									`loss=${logs?.loss.toFixed(4)}, mae=${logs?.mae.toFixed(4)}`,
							);
						}
					},
				},
			});

			// Cleanup tensors
			xs.dispose();
			ys.dispose();

			const finalLoss = history.history.loss[history.history.loss.length - 1] as number;
			const finalMae = history.history.mae[history.history.mae.length - 1] as number;

			this.logCallback(
				"info",
				`[AIPredictor] Training completed for ${room}: ` +
					`loss=${finalLoss.toFixed(4)}, mae=${finalMae.toFixed(4)}`,
			);

			// Save model
			await this.saveModel(room, model, stats);

			this.lastTrainingTime.set(room, Date.now());

			return true;
		} catch (error) {
			this.logCallback("error", `[AIPredictor] Training failed for ${room}: ${String(error)}`);
			return false;
		} finally {
			this.isTraining.set(room, false);
		}
	}

	/**
	 * Predict heating behavior
	 *
	 * @param room
	 * @param currentTemp
	 * @param targetTemp
	 * @param heatingDuration
	 * @param recentHeatingRate
	 * @param profile
	 * @param outsideTemp
	 */
	public async predict(
		room: string,
		currentTemp: number,
		targetTemp: number,
		heatingDuration: number,
		recentHeatingRate: number,
		profile?: RoomThermalProfile,
		outsideTemp?: number,
	): Promise<HeatingPrediction | null> {
		const model = this.models.get(room);
		if (!model) {
			this.logCallback("debug", `[AIPredictor] No model available for ${room}`);
			return null;
		}

		try {
			const now = new Date();
			const tempDifference = targetTemp - currentTemp;

			// Prepare input features (same as training)
			const input = [
				currentTemp,
				targetTemp,
				tempDifference,
				heatingDuration,
				recentHeatingRate,
				outsideTemp || 15,
				now.getHours() / 24,
				now.getDay() / 7,
			];

			// TODO: Load normalization stats and apply them
			// For now, we'll use the raw input
			const inputTensor = (tf as any).tensor2d([input]);

			// Make prediction
			const prediction = model.predict(inputTensor) as any;
			const predictionData = await prediction.data();

			// Cleanup
			inputTensor.dispose();
			prediction.dispose();

			const [tempChangeIn30Min, tempChangeIn60Min, optimalStopOffset] = predictionData;

			// Calculate predicted temperatures
			const predictedTempIn30Min = currentTemp + tempChangeIn30Min;
			const predictedTempIn60Min = currentTemp + tempChangeIn60Min;

			// Determine if we should stop heating
			// Stop if we're within the optimal offset from target
			const shouldStopHeating = tempDifference <= optimalStopOffset && tempDifference > 0;

			// Calculate confidence based on profile
			const confidence = profile?.confidence || 0.5;

			this.logCallback(
				"debug",
				`[AIPredictor] ${room} prediction: ` +
					`current=${currentTemp.toFixed(2)}°C, ` +
					`target=${targetTemp.toFixed(2)}°C, ` +
					`+30min=${predictedTempIn30Min.toFixed(2)}°C, ` +
					`stopOffset=${optimalStopOffset.toFixed(2)}°C, ` +
					`shouldStop=${shouldStopHeating}`,
			);

			return {
				predictedTempIn30Min,
				predictedTempIn60Min,
				shouldStopHeating,
				stopOffset: optimalStopOffset,
				confidence,
			};
		} catch (error) {
			this.logCallback("error", `[AIPredictor] Prediction failed for ${room}: ${String(error)}`);
			return null;
		}
	}

	/**
	 * Save model to disk
	 *
	 * @param room
	 * @param model
	 * @param stats
	 * @param stats.mean
	 * @param stats.std
	 */
	private async saveModel(
		room: string,
		model: any,
		stats: {
			/**
			 *
			 */
			mean: number[];
			/**
			 *
			 */
			std: number[];
		},
	): Promise<void> {
		try {
			const modelPath = `file://${this.config.modelSavePath}/${room}`;
			await model.save(modelPath);

			// Save normalization stats as JSON
			const fs = await import("fs");
			const path = await import("path");
			const statsPath = path.join(this.config.modelSavePath, `${room}_stats.json`);
			fs.writeFileSync(statsPath, JSON.stringify(stats));

			this.logCallback("debug", `[AIPredictor] Model saved for ${room}`);
		} catch (error) {
			this.logCallback("error", `[AIPredictor] Failed to save model for ${room}: ${String(error)}`);
		}
	}

	/**
	 * Load model from disk
	 *
	 * @param room
	 */
	public async loadModel(room: string): Promise<boolean> {
		try {
			const modelPath = `file://${this.config.modelSavePath}/${room}/model.json`;
			const model = await (tf as any).loadLayersModel(modelPath);
			this.models.set(room, model);

			this.logCallback("info", `[AIPredictor] Model loaded for ${room}`);
			return true;
		} catch {
			this.logCallback("debug", `[AIPredictor] No saved model found for ${room}, will train new model`);
			return false;
		}
	}

	/**
	 * Check if model is ready for a room
	 *
	 * @param room
	 */
	public isModelReady(room: string): boolean {
		return this.models.has(room) && !this.isTraining.get(room);
	}

	/**
	 * Get model info
	 *
	 * @param room
	 */
	public getModelInfo(room: string): {
		/** Whether model is ready for use */
		ready: boolean;
		/** Whether model is currently training */
		training: boolean;
		/** Timestamp of last training */
		lastTrained?: number;
	} {
		return {
			ready: this.models.has(room),
			training: this.isTraining.get(room) || false,
			lastTrained: this.lastTrainingTime.get(room),
		};
	}

	/**
	 * Dispose all models and free memory
	 */
	public dispose(): void {
		for (const [room, model] of Array.from(this.models.entries())) {
			model.dispose();
			this.logCallback("debug", `[AIPredictor] Model disposed for ${room}`);
		}
		this.models.clear();
		this.isTraining.clear();
		this.lastTrainingTime.clear();
	}
}
