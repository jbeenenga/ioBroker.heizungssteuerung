import * as Sentry from "@sentry/node";

/**
 * Sentry configuration and utilities for ioBroker Heizungssteuerung adapter
 */
export class SentryUtils {
	private static initialized = false;

	/**
	 * Initialize Sentry with the given configuration
	 * @param dsn Sentry DSN
	 * @param adapterVersion Version of the adapter
	 * @param adapterNamespace Namespace of the adapter instance
	 */
	public static init(dsn: string, adapterVersion: string, adapterNamespace?: string): void {
		if (this.initialized) {
			return;
		}

		Sentry.init({
			dsn: dsn,
			environment: process.env.NODE_ENV === "development" ? "development" : "production",
			release: `iobroker.heizungssteuerung@${adapterVersion}`,
			sampleRate: 0.1, // Only send 10% of events to save quota
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
						}
					});
				}

				// Filter breadcrumbs for sensitive data
				if (event.breadcrumbs) {
					event.breadcrumbs = event.breadcrumbs.map(breadcrumb => {
						if (breadcrumb.message) {
							breadcrumb.message = breadcrumb.message.replace(/password[=:]\s*\w+/gi, "password=***");
							breadcrumb.message = breadcrumb.message.replace(/api[_-]?key[=:]\s*\w+/gi, "apiKey=***");
						}
						return breadcrumb;
					});
				}

				return event;
			},
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

		this.initialized = true;
	}

	/**
	 * Capture an exception with Sentry
	 * @param error The error to capture
	 * @param context Additional context information
	 */
	public static captureException(error: Error, context?: Record<string, any>): void {
		if (!this.initialized) {
			return;
		}

		if (context) {
			Sentry.withScope(scope => {
				Object.keys(context).forEach(key => {
					scope.setContext(key, context[key]);
				});
				Sentry.captureException(error);
			});
		} else {
			Sentry.captureException(error);
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
		level: "info" | "warning" | "error" | "debug" = "info",
		context?: Record<string, any>,
	): void {
		if (!this.initialized) {
			return;
		}

		if (context) {
			Sentry.withScope(scope => {
				Object.keys(context).forEach(key => {
					scope.setContext(key, context[key]);
				});
				Sentry.captureMessage(message, level);
			});
		} else {
			Sentry.captureMessage(message, level);
		}
	}

	/**
	 * Add a breadcrumb for better error context
	 * @param message The breadcrumb message
	 * @param category The category of the breadcrumb
	 * @param level The level of the breadcrumb
	 */
	public static addBreadcrumb(
		message: string,
		category = "adapter",
		level: "info" | "warning" | "error" | "debug" = "info",
	): void {
		if (!this.initialized) {
			return;
		}

		Sentry.addBreadcrumb({
			message,
			category,
			level,
			timestamp: Date.now() / 1000,
		});
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

		Sentry.setContext(key, value);
	}

	/**
	 * Close Sentry and flush all pending events
	 * @param timeout Timeout in milliseconds
	 */
	public static async close(timeout = 2000): Promise<boolean> {
		if (!this.initialized) {
			return true;
		}

		return await Sentry.close(timeout);
	}

	/**
	 * Check if Sentry is initialized
	 */
	public static isInitialized(): boolean {
		return this.initialized;
	}
}
