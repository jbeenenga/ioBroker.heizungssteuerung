// This file extends the AdapterConfig type from "@types/iobroker"
// using the actual properties present in io-package.json
// in order to provide typings for adapter.config properties

import type { native } from "../../io-package.json";

type _AdapterConfig = typeof native;

// Augment the globally declared type ioBroker.AdapterConfig
declare global {
	namespace ioBroker {
		interface AdapterConfig extends _AdapterConfig {
			// Do not enter anything here!
		}
	}
}

// this is required so the above AdapterConfig is found by TypeScript / type checking
export {};
