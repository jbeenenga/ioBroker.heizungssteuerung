import { expect } from "chai";
import { SentryUtils } from "../lib/sentry";

describe("Sentry Integration", () => {
    beforeEach(() => {
        // Reset Sentry state before each test
        // Note: In a real environment, you might want to use a test DSN
    });

    it("should initialize Sentry without throwing", () => {
        expect(() => {
            SentryUtils.init(
                "https://test@sentry.io/123456",
                "1.0.0",
                "test.0"
            );
        }).to.not.throw();
    });

    it("should not initialize Sentry twice", () => {
        SentryUtils.init("https://test@sentry.io/123456", "1.0.0", "test.0");
        expect(SentryUtils.isInitialized()).to.be.true;
        
        // Second initialization should be ignored
        SentryUtils.init("https://test@sentry.io/123456", "1.0.0", "test.0");
        expect(SentryUtils.isInitialized()).to.be.true;
    });

    it("should handle captureException gracefully when not initialized", () => {
        expect(() => {
            SentryUtils.captureException(new Error("Test error"));
        }).to.not.throw();
    });

    it("should handle captureMessage gracefully when not initialized", () => {
        expect(() => {
            SentryUtils.captureMessage("Test message");
        }).to.not.throw();
    });

    it("should handle addBreadcrumb gracefully when not initialized", () => {
        expect(() => {
            SentryUtils.addBreadcrumb("Test breadcrumb");
        }).to.not.throw();
    });

    it("should handle setContext gracefully when not initialized", () => {
        expect(() => {
            SentryUtils.setContext("test", { key: "value" });
        }).to.not.throw();
    });

    it("should handle close gracefully when not initialized", async () => {
        const result = await SentryUtils.close();
        expect(result).to.be.true;
    });

    describe("When initialized", () => {
        beforeEach(() => {
            SentryUtils.init("https://test@sentry.io/123456", "1.0.0", "test.0");
        });

        it("should capture exceptions with context", () => {
            expect(() => {
                SentryUtils.captureException(new Error("Test error"), {
                    testContext: "value"
                });
            }).to.not.throw();
        });

        it("should capture messages with different levels", () => {
            expect(() => {
                SentryUtils.captureMessage("Info message", "info");
                SentryUtils.captureMessage("Warning message", "warning");
                SentryUtils.captureMessage("Error message", "error");
                SentryUtils.captureMessage("Debug message", "debug");
            }).to.not.throw();
        });

        it("should add breadcrumbs with different categories", () => {
            expect(() => {
                SentryUtils.addBreadcrumb("Test breadcrumb", "test");
                SentryUtils.addBreadcrumb("Adapter breadcrumb", "adapter");
                SentryUtils.addBreadcrumb("Lifecycle breadcrumb", "lifecycle");
            }).to.not.throw();
        });

        it("should set context", () => {
            expect(() => {
                SentryUtils.setContext("adapter_config", {
                    version: "1.0.0",
                    environment: "test"
                });
            }).to.not.throw();
        });
    });
});
