/**
 * L0 System Prompt Compiler — the compression-immune identity injection.
 *
 * Template variables:
 * - {{IDENTITY_BLOCK}}    → dog's identity statement
 * - {{TEAMMATE_ROSTER}}   → teammates table
 * - {{WORKFLOW_TRIGGERS}} → per-breed collaboration triggers
 * - {{CVO_REF}}           → co-creator reference
 * - {{GOVERNANCE_L0}}     → governance rules digest
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDogRegistry, loadDogConfig } from '../config/dog-config-loader.js';
import { dogRegistry } from '../registry/DogRegistry.js';
import {
  buildIdentityBlock,
  buildTeammateRoster,
  buildCvoRef,
  buildWorkflowTriggers,
} from './identity-block.js';

// ESM-compatible __dirname
const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = resolve(__dirname, '../../assets/system-prompt-l0.md');

/**
 * Compile L0 system prompt for a specific dog.
 */
export function compileL0(options: { dogId: string; runtimeModel?: string; configPath?: string }): string {
  // Initialize registry if not already done
  if (dogRegistry.getAllIds().length === 0) {
    initDogRegistry(options.configPath);
  }

  const entry = dogRegistry.getOrThrow(options.dogId);
  const config = entry.config;
  const runtimeModel = options.runtimeModel ?? config.defaultModel;

  // Read template
  const template = readFileSync(TEMPLATE_PATH, 'utf-8');

  // Build each block
  const identityBlock = buildIdentityBlock(config, runtimeModel);
  const teammateRoster = buildTeammateRoster(options.dogId);
  const workflowTriggers = buildWorkflowTriggers(config.breedName, config.id as string, config.displayName);

  // Load coCreator from config
  const cafeConfig = loadDogConfig(options.configPath);
  const cvoRef = buildCvoRef(cafeConfig.coCreator);

  // Governance L0 — placeholder
  const governanceL0 = '（狗咖治理细则待补充——Phase 8 跑通后迭代）';

  // Substitute template variables
  let result = template;
  result = result.replace('{{IDENTITY_BLOCK}}', identityBlock);
  result = result.replace('{{TEAMMATE_ROSTER}}', teammateRoster);
  result = result.replace('{{WORKFLOW_TRIGGERS}}', workflowTriggers);
  result = result.replace('{{CVO_REF}}', cvoRef);
  result = result.replace('{{GOVERNANCE_L0}}', governanceL0);

  return result;
}

/**
 * Compile L0 for all registered dogs.
 */
export function compileAllL0(configPath?: string): Record<string, string> {
  if (dogRegistry.getAllIds().length === 0) {
    initDogRegistry(configPath);
  }

  const results: Record<string, string> = {};
  for (const dogId of dogRegistry.getAllIds()) {
    const entry = dogRegistry.getOrThrow(dogId);
    results[dogId as string] = compileL0({
      dogId: dogId as string,
      runtimeModel: entry.config.defaultModel,
      configPath,
    });
  }
  return results;
}