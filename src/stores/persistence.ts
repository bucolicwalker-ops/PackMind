/**
 * JSON File Persistence — read/write JSON data to disk.
 *
 * Minimal persistence layer for Dog-Coffee stores.
 * Data survives server restarts; stored under data/ directory.
 *
 * Strategy:
 * - Load from file at startup (or return empty if file missing)
 * - Save to file on every write (simple but safe for low-volume demo)
 * - Atomic write: write to temp file, then rename (prevents corruption)
 *
 * Future: add debounced batch writes for higher throughput.
 */

import {
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";

const DATA_DIR = resolve(process.env.DOG_COFFEE_DATA_DIR ?? "data");

/** Ensure data directory exists */
export function ensureDataDir(): void {
	if (!existsSync(DATA_DIR)) {
		mkdirSync(DATA_DIR, { recursive: true });
	}
}

/** Load JSON data from a file. Returns null if file doesn't exist or is corrupt. */
export function loadJson<T>(filename: string): T | null {
	const filePath = resolve(DATA_DIR, filename);
	if (!existsSync(filePath)) {
		return null;
	}
	try {
		const raw = readFileSync(filePath, "utf-8");
		return JSON.parse(raw) as T;
	} catch {
		// Corrupt file — treat as empty, will be overwritten on next save
		console.error(
			`[persistence] Failed to load ${filename}, treating as empty`,
		);
		return null;
	}
}

/**
 * Save JSON data to a file atomically.
 * Writes to a temp file first, then renames — prevents partial-write corruption.
 */
export function saveJson<T>(filename: string, data: T): void {
	ensureDataDir();
	const filePath = resolve(DATA_DIR, filename);
	const tempPath = filePath + ".tmp";

	const json = JSON.stringify(data, null, 2);
	writeFileSync(tempPath, json, "utf-8");
	renameSync(tempPath, filePath);
}
