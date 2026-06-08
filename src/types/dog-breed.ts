/**
 * Dog-Coffee Identity Type Definitions.
 *
 * Simplified from cat-coffee's Breed+Variant two-layer model.
 * In the minimal soul version, each dog has exactly one variant,
 * so we flatten Breed+Variant into a single DogConfig.
 *
 * Learning note: cat-coffee has CatBreed (identity layer) + CatVariant (execution layer).
 * We'll add the variant layer later when we need multi-model support per breed.
 */

import { DogId } from './ids.js';

// ─── Config-level types (what dog-config.json contains) ───

export interface DogConfigEntry {
  /** Unique dog identity handle, e.g. "collie" */
  id: string;
  /** Breed name in Chinese, e.g. "边牧" */
  breedName: string;
  /** Full display name, e.g. "边牧/牧哥" */
  displayName: string;
  /** Short nickname, e.g. "牧哥" */
  nickname: string;
  /** Role description, e.g. "主架构师和核心开发者" */
  roleDescription: string;
  /** Personality description, e.g. "温暖可靠，耐心解释，老大哥气质" */
  personality: string;
  /** Avatar filename */
  avatar: string;
  /** Theme color for UI rendering */
  color: string;
  /** Text patterns that route to this dog, e.g. ["@牧哥", "@边牧"] */
  mentionPatterns: string[];
  /** Which AI model to use, e.g. "glm-5.1" */
  defaultModel: string;
  /** Which CLI client to invoke, e.g. "glm" */
  clientId: string;
  /** What this dog excels at */
  teamStrengths: string[];
  /** Caution notes — things to watch out for */
  caution: string[];
  /** Hard task bans (empty in minimal version) */
  restrictions: string[];
}

export interface CoCreatorConfig {
  /** Human owner's display name */
  name: string;
  aliases: string[];
  mentionPatterns: string[];
  avatar: string;
  color: string;
}

export interface ReviewPolicy {
  /** Whether cross-breed review is required */
  crossBreedRequired: boolean;
  /** Whether self-merge is forbidden */
  selfMergeForbidden: boolean;
  /** Human-readable description */
  description: string;
}

export interface DogCafeConfig {
  version: number;
  dogs: DogConfigEntry[];
  coCreator: CoCreatorConfig;
  reviewPolicy: ReviewPolicy;
}

// ─── Runtime types (what DogRegistry stores) ───

/**
 * Flattened runtime representation of a dog's identity.
 * Projected from DogConfigEntry — all fields available in one flat object.
 * This is what the prompt builder reads.
 */
export interface DogConfig {
  id: DogId;
  breedName: string;
  displayName: string;
  nickname: string;
  roleDescription: string;
  personality: string;
  avatar: string;
  color: string;
  mentionPatterns: string[];
  defaultModel: string;
  clientId: string;
  teamStrengths: string[];
  caution: string[];
  restrictions: string[];
}