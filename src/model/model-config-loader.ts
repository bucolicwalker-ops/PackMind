/**
 * Model Config Loader — reads model-config.json and validates.
 *
 * Separated from dog-config.json because:
 * - API keys are secrets, shouldn't be in the identity config
 * - Providers are infrastructure, not personality
 * - Different change cadence (keys rotate, breeds don't)
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ModelConfig, ProviderConfig } from "../types/model-config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PATH = resolve(__dirname, "../../model-config.json");

/** Cache loaded config for reuse */
let cachedConfig: ModelConfig | null = null;

export function loadModelConfig(filePath?: string): ModelConfig {
	if (cachedConfig) return cachedConfig;

	const resolvedPath = filePath ? resolve(__dirname, filePath) : DEFAULT_PATH;
	const raw = readFileSync(resolvedPath, "utf-8");
	const config: ModelConfig = JSON.parse(raw);

	// Minimal validation — providers must exist
	if (!config.providers || Object.keys(config.providers).length === 0) {
		throw new Error("model-config.json must have at least one provider");
	}

	for (const [key, provider] of Object.entries(config.providers)) {
		if (!provider.endpoint) {
			throw new Error(`Provider "${key}" missing endpoint`);
		}
	}

	cachedConfig = config;
	return config;
}

/** Get provider config by clientId (matches dog-config.json) */
export function getProvider(clientId: string): ProviderConfig | undefined {
	const config = loadModelConfig();
	return config.providers[clientId];
}

/** Check if a provider has an API key configured (not empty) */
export function hasApiKey(clientId: string): boolean {
	const provider = getProvider(clientId);
	return !!provider?.apiKey && provider.apiKey.trim().length > 0;
}

/** Reset cache — for testing */
export function resetModelConfigCache(): void {
	cachedConfig = null;
}
