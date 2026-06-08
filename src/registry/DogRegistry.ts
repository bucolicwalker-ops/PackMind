/**
 * Dog Registry — Runtime identity store.
 *
 * Pattern borrowed from cat-coffee's CatRegistry:
 * - Global singleton Map<string, DogRegistryEntry>
 * - Registered at startup from loaded config
 * - Used by prompt builders, routing, MCP tools
 *
 * Key difference from cat-coffee: we store flat DogConfig (no Variant layer).
 * When we add multi-model variants later, this will need to expand
 * to match CatRegistry's breedId-based structure.
 */

import { DogId, createDogId } from '../types/ids.js';
import { DogConfig } from '../types/dog-breed.js';

export interface DogRegistryEntry {
  config: DogConfig;
}

class DogRegistryClass {
  private map = new Map<string, DogRegistryEntry>();

  /** Register a dog identity. Throws on duplicate dogId. */
  register(id: DogId, config: DogConfig): void {
    const key = id as string;
    if (this.map.has(key)) {
      throw new Error(`Duplicate dogId "${key}" — each dog must have a unique identity`);
    }
    this.map.set(key, { config });
  }

  /** Boundary-layer access — throws if dogId not found. */
  getOrThrow(id: DogId | string): DogRegistryEntry {
    const key = (typeof id === 'string' ? id : id) as string;
    const entry = this.map.get(key);
    if (!entry) {
      throw new Error(`Unknown dogId "${key}" — not registered in DogRegistry`);
    }
    return entry;
  }

  /** Safe access — returns undefined if dogId not found. */
  tryGet(id: DogId | string): DogRegistryEntry | undefined {
    return this.map.get((typeof id === 'string' ? id : id) as string);
  }

  /** Get all registered dog configs as a flat Record. */
  getAllConfigs(): Record<string, DogConfig> {
    const result: Record<string, DogConfig> = {};
    for (const [key, entry] of this.map) {
      result[key] = entry.config;
    }
    return result;
  }

  /** Get all registered dog IDs. */
  getAllIds(): DogId[] {
    return Array.from(this.map.keys()).map(id => createDogId(id));
  }

  /** Assert that a dogId is known — runtime validation at system boundaries. */
  assertKnownDogId(id: string): DogId {
    if (!this.map.has(id)) {
      throw new Error(`Unknown dogId "${id}" — valid IDs: ${Array.from(this.map.keys()).join(', ')}`);
    }
    return createDogId(id);
  }

  /** Resolve a text mention to a dogId. Longest-match-first to prevent prefix collisions. */
  resolveMention(text: string): DogId | undefined {
    let bestMatch: DogId | undefined;
    let bestLength = 0;

    for (const [key, entry] of this.map) {
      for (const pattern of entry.config.mentionPatterns) {
        if (text.includes(pattern) && pattern.length > bestLength) {
          bestMatch = createDogId(key);
          bestLength = pattern.length;
        }
      }
    }
    return bestMatch;
  }

  /** Reset registry — for testing only. */
  reset(): void {
    this.map.clear();
  }
}

/** Global singleton — same pattern as cat-coffee's catRegistry */
export const dogRegistry = new DogRegistryClass();