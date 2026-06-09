/**
 * Branded DogId type — prevents accidental mixing with other ID types.
 * Inspired by cat-coffee's CatId branded type pattern.
 *
 * Usage: const id = createDogId('collie');
 * Type system ensures DogId can't be passed where ThreadId or MessageId is expected.
 */

export type DogId = Brand<string, "DogId">;

type Brand<T, B> = T & { __brand: B };

/**
 * Create a DogId from a raw string.
 * Lightweight syntax check — non-empty string required.
 * Does NOT validate against the registry (that's assertKnownDogId's job).
 */
export function createDogId(id: string): DogId {
	if (!id || id.trim().length === 0) {
		throw new Error(`DogId must be a non-empty string, got: "${id}"`);
	}
	return id as DogId;
}

/**
 * Unbrand a DogId back to a plain string for serialization/logging.
 */
export function toRawDogId(id: DogId): string {
	return id as string;
}
