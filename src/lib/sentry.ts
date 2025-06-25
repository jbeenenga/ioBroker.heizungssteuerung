import * as Sentry from "@sentry/node";

/**
 * Sentry configuration and utilities for ioBroker Heizungssteuerung adapter
 * Based on official Sentry Node.js documentation with tracing support (without profiling for compatibility)
 */
export class SentryUtils {
	private static initialized = false;

	/**
	 * Initialize Sentry with the given configuration including tracing
	 * @param adapterVersion Version of the adapter
	 * @param adapterNamespace Namespace of the adapter instance
	 */
	public static init(adapterVersion: string, adapterNamespace?: string): void {
		if (this.initialized) {
			return;
		}

		try {
			const isProduction = process.env.NODE_ENV === "production";

			Sentry.init({
				dsn: "https://39a9163479a6c2799e454f8ecbfcf8b1@o4509558033547264.ingest.de.sentry.io/4509558051438672",
				environment: isProduction ? "production" : "development",
				release: `iobroker.heizungssteuerung@${adapterVersion}`,
				
				// Basic settings
				sendDefaultPii: false, // Don't send PII for privacy
				
				// Sampling rates for production vs development
				sampleRate: isProduction ? 0.1 : 1.0, // 10% in production, 100% in development
				
				// Tracing configuration
				tracesSampleRate: isProduction ? 0.1 : 1.0, // 10% tracing in production
				
				// Basic integrations (no profiling for compatibility)
				integrations: [
					// Http integration for automatic HTTP request tracing
					Sentry.httpIntegration(),
					// Console integration for console.log capture
					Sentry.consoleIntegration(),
				],
				
				beforeSend(event) {
					// Filter out sensitive data
					if (event.exception) {
						event.exception.values?.forEach(exception => {
							if (exception.value) {
								// Remove passwords, API keys, and personal data
								exception.value = exception.value.replace(/password[=:]\s*\w+/gi, "password=***");
								exception.value = exception.value.replace(/api[_-]?key[=:]\s*\w+/gi, "apiKey=***");
								exception.value = exception.value.replace(/token[=:]\s*\w+/gi, "token=***");
								exception.value = exception.value.replace(/secret[=:]\s*\w+/gi, "secret=***");
								// Remove IP addresses
								exception.value = exception.value.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, "xxx.xxx.xxx.xxx");
							}
						});
					}

					// Filter breadcrumbs for sensitive data
					if (event.breadcrumbs) {
						event.breadcrumbs = event.breadcrumbs.map(breadcrumb => {
							if (breadcrumb.message) {
								breadcrumb.message = breadcrumb.message.replace(/password[=:]\s*\w+/gi, "password=***");
								breadcrumb.message = breadcrumb.message.replace(/api[_-]?key[=:]\s*\w+/gi, "apiKey=***");
								breadcrumb.message = breadcrumb.message.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, "xxx.xxx.xxx.xxx");
							}
							return breadcrumb;
						});
					}

					return event;
				},
				
				beforeSendTransaction(event) {
					// Filter transaction data
					if (event.transaction) {
						// Remove sensitive data from transaction names
						event.transaction = event.transaction.replace(/password[=:]\s*\w+/gi, "password=***");
						event.transaction = event.transaction.replace(/api[_-]?key[=:]\s*\w+/gi, "apiKey=***");
					}
					return event;
				}
			});

			// Set user context
			if (adapterNamespace) {
				Sentry.setUser({
					id: adapterNamespace,
				});
			}

			// Set tags
			Sentry.setTag("adapter", "heizungssteuerung");
			Sentry.setTag("version", adapterVersion);
			Sentry.setTag("platform", "iobroker");
			Sentry.setTag("node_version", process.version);

			this.initialized = true;
		} catch (error) {
			// If Sentry initialization fails, log it but don't crash the adapter
			console.warn("Failed to initialize Sentry:", error);
		}
	}

	/**
	 * Start a new performance span for tracing
	 * @param name Name of the operation
	 * @param op Operation type (e.g., 'adapter.check', 'adapter.init')
	 * @param callback Function to execute within the span
	 * @param description Optional description
	 */
	public static startSpan<T>(
		name: string, 
		op: string, 
		callback: (span?: Sentry.Span) => T,
		description?: string
	): T {
		if (!this.initialized) {
			return callback();
		}

		try {
			return Sentry.startSpan(
				{
					name,
					op,
					description
				},
				(span) => {
					try {
						return callback(span);
					} catch (error) {
						span?.setStatus("internal_error");
						span?.setTag("error", true);
						throw error;
					}
				}
			);
		} catch (error) {
			// Fallback if span creation fails
			return callback();
		}
	}

	/**
	 * Start an async performance span for tracing
	 * @param name Name of the operation
	 * @param op Operation type
	 * @param callback Async function to execute within the span
	 * @param description Optional description
	 */
	public static async startSpanAsync<T>(
		name: string, 
		op: string, 
		callback: (span?: Sentry.Span) => Promise<T>,
		description?: string
	): Promise<T> {
		if (!this.initialized) {
			return await callback();
		}

		try {
			return await Sentry.startSpan(
				{
					name,
					op,
					description
				},
				async (span) => {
					try {
						const result = await callback(span);
						span?.setStatus("ok");
						return result;
					} catch (error) {
						span?.setStatus("internal_error");
						span?.setTag("error", true);
						throw error;
					}
				}
			);
		} catch (error) {
			// Fallback if span creation fails
			return await callback();
		}
	}

	/**
	 * Create a checkpoint for measuring time between operations
	 * @param name Checkpoint name
	 * @param op Operation type
	 */
	public static createCheckpoint(name: string, op: string = "checkpoint"): void {
		if (!this.initialized) {
			return;
		}

		try {
			Sentry.addBreadcrumb({
				message: `Checkpoint: ${name}`,
				category: op,
				level: "info",
				timestamp: Date.now() / 1000,
			});
		} catch (error) {
			// Silently ignore breadcrumb errors
		}
	}

	/**
	 * Capture an exception with Sentry
	 * @param error The error to capture
	 * @param context Additional context information
	 * @param level Error level
	 */
	public static captureException(
		error: Error, 
		context?: Record<string, any>,
		level: Sentry.SeverityLevel = "error"
	): void {
		if (!this.initialized) {
			return;
		}

		try {
			if (context) {
				Sentry.withScope(scope => {
					scope.setLevel(level);
					Object.keys(context).forEach(key => {
						scope.setContext(key, context[key]);
					});
					Sentry.captureException(error);
				});
			} else {
				Sentry.withScope(scope => {
					scope.setLevel(level);
					Sentry.captureException(error);
				});
			}
		} catch (sentryError) {
			// Silently ignore Sentry errors
		}
	}

	/**
	 * Capture a message with Sentry
	 * @param message The message to capture
	 * @param level The severity level
	 * @param context Additional context information
	 */
	public static captureMessage(
		message: string,
		level: Sentry.SeverityLevel = "info",
		context?: Record<string, any>,
	): void {
		if (!this.initialized) {
			return;
		}

		try {
			if (context) {
				Sentry.withScope(scope => {
					scope.setLevel(level);
					Object.keys(context).forEach(key => {
						scope.setContext(key, context[key]);
					});
					Sentry.captureMessage(message);
				});
			} else {
				Sentry.withScope(scope => {
					scope.setLevel(level);
					Sentry.captureMessage(message);
				});
			}
		} catch (error) {
			// Silently ignore Sentry errors
		}
	}

	/**
	 * Add a breadcrumb for better error context
	 * @param message The breadcrumb message
	 * @param category The category of the breadcrumb
	 * @param level The level of the breadcrumb
	 * @param data Additional data
	 */
	public static addBreadcrumb(
		message: string,
		category = "adapter",
		level: Sentry.SeverityLevel = "info",
		data?: Record<string, any>
	): void {
		if (!this.initialized) {
			return;
		}

		try {
			Sentry.addBreadcrumb({
				message,
				category,
				level,
				timestamp: Date.now() / 1000,
				data: data || {}
			});
		} catch (error) {
			// Silently ignore breadcrumb errors
		}
	}

	/**
	 * Set additional context for the current scope
	 * @param key The context key
	 * @param value The context value
	 */
	public static setContext(key: string, value: any): void {
		if (!this.initialized) {
			return;
		}

		try {
			Sentry.setContext(key, value);
		} catch (error) {
			// Silently ignore context errors
		}
	}

	/**
	 * Set a tag for all subsequent events
	 * @param key Tag key
	 * @param value Tag value
	 */
	public static setTag(key: string, value: string): void {
		if (!this.initialized) {
			return;
		}

		try {
			Sentry.setTag(key, value);
		} catch (error) {
			// Silently ignore tag errors
		}
	}

	/**
	 * Set multiple tags at once
	 * @param tags Object with key-value pairs
	 */
	public static setTags(tags: Record<string, string>): void {
		if (!this.initialized) {
			return;
		}

		try {
			Sentry.setTags(tags);
		} catch (error) {
			// Silently ignore tags errors
		}
	}

	/**
	 * Get the current active span
	 */
	public static getActiveSpan(): Sentry.Span | undefined {
		if (!this.initialized) {
			return undefined;
		}

		try {
			return Sentry.getActiveSpan();
		} catch (error) {
			return undefined;
		}
	}

	/**
	 * Close Sentry and flush all pending events
	 * @param timeout Timeout in milliseconds
	 */
	public static async close(timeout = 2000): Promise<boolean> {
		if (!this.initialized) {
			return true;
		}

		try {
			return await Sentry.close(timeout);
		} catch (error) {
			return true;
		}
	}

	/**
	 * Flush all pending events
	 * @param timeout Timeout in milliseconds
	 */
	public static async flush(timeout = 2000): Promise<boolean> {
		if (!this.initialized) {
			return true;
		}

		try {
			return await Sentry.flush(timeout);
		} catch (error) {
			return true;
		}
	}

	/**
	 * Check if Sentry is initialized
	 */
	public static isInitialized(): boolean {
		return this.initialized;
	}

	/**
	 * Get the current Sentry client
	 */
	public static getClient(): Sentry.Client | undefined {
		if (!this.initialized) {
			return undefined;
		}

		try {
			return Sentry.getClient();
		} catch (error) {
			return undefined;
		}
	}
}
