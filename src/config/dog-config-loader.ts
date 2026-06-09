/**
 * Dog Config Loader — reads dog-config.json and populates the registry.
 *
 * Pattern borrowed from cat-coffee's cat-config-loader.ts:
 * - Read config file → validate → project to flat map → register each entry
 *
 * Simplified from cat-coffee:
 * - No template+overlay merge (single file is truth source)
 * - No Zod validation (minimal version uses manual checks)
 * - No breed+variant projection (flat DogConfigEntry → DogConfig)
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dogRegistry } from "../registry/DogRegistry.js";
import type {
	DogCafeConfig,
	DogConfig,
	DogConfigEntry,
} from "../types/dog-breed.js";
import { createDogId } from "../types/ids.js";

// ESM-compatible __dirname
const __dirname = dirname(fileURLToPath(import.meta.url));

/** Default config path — relative to project root */
const DEFAULT_CONFIG_PATH = resolve(__dirname, "../../dog-config.json");

/**
 * Load and validate dog-config.json.
 * Returns the parsed config object.
 */
export function loadDogConfig(filePath?: string): DogCafeConfig {
	const resolvedPath = filePath
		? resolve(__dirname, filePath)
		: DEFAULT_CONFIG_PATH;

	const raw = readFileSync(resolvedPath, "utf-8");
	const config: DogCafeConfig = JSON.parse(raw);

	// Minimal validation — check required fields exist
	if (!config.dogs || config.dogs.length === 0) {
		throw new Error("dog-config.json must have at least one dog entry");
	}

	for (const dog of config.dogs) {
		if (!dog.id || !dog.breedName || !dog.nickname || !dog.roleDescription) {
			throw new Error(
				`Dog entry missing required fields: ${JSON.stringify(dog)}`,
			);
		}
	}

	return config;
}

/**
 * Project DogConfigEntry to flat DogConfig.
 * In minimal version: identity fields come directly from the entry.
 */
export function projectDogConfig(entry: DogConfigEntry): DogConfig {
	return {
		id: createDogId(entry.id),
		breedName: entry.breedName,
		displayName: entry.displayName,
		nickname: entry.nickname,
		roleDescription: entry.roleDescription,
		personality: entry.personality,
		avatar: entry.avatar,
		color: entry.color,
		mentionPatterns: entry.mentionPatterns,
		defaultModel: entry.defaultModel,
		clientId: entry.clientId,
		teamStrengths: entry.teamStrengths,
		caution: entry.caution,
		restrictions: entry.restrictions,
	};
}

/**
 * Load config and register all dogs into the registry.
 * This is the main entry point called at startup.
 */
export function initDogRegistry(filePath?: string): DogCafeConfig {
	const config = loadDogConfig(filePath);

	for (const entry of config.dogs) {
		const dogConfig = projectDogConfig(entry);
		dogRegistry.register(dogConfig.id, dogConfig);
	}

	return config;
}

/**
 * Find a dog by mention text.
 * Uses longest-match-first to handle prefix collisions.
 */
export function findDogByMention(
	config: DogCafeConfig,
	text: string,
): { dogId: string; entry: DogConfigEntry } | undefined {
	let bestMatch: DogConfigEntry | undefined;
	let bestLength = 0;

	for (const dog of config.dogs) {
		for (const pattern of dog.mentionPatterns) {
			if (text.includes(pattern) && pattern.length > bestLength) {
				bestMatch = dog;
				bestLength = pattern.length;
			}
		}
	}

	return bestMatch ? { dogId: bestMatch.id, entry: bestMatch } : undefined;
}
