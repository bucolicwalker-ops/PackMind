/**
 * Dog Responder — generates a dog's response to a conversation context.
 *
 * TWO MODES:
 * - Demo mode (default): Mock responses based on personality.
 *   This closes the collaboration loop for demonstration purposes.
 *   Each dog's mock response reflects its personality and follows
 *   the A2A three-choice protocol.
 *
 * - Real mode (future): Calls glm-5.1 API with L0 prompt + context.
 *   Extension point clearly defined — just implement callModel().
 *
 * Pattern borrowed from cat-coffee's invocation flow:
 * - Compile L0 prompt → build context → call model → parse response
 * - In cat-coffee, this happens via Claude CLI / Codex CLI / Gemini CLI
 * - In dog-coffee minimal, we demo the loop first, then add real model
 */

import { DogConfig } from '../types/dog-breed.js';
import { Message } from '../types/thread.js';
import { DogId } from '../types/ids.js';

export interface ResponderInput {
  dogConfig: DogConfig;
  l0Prompt: string;
  recentMessages: Message[];
  triggerContent: string;  // what triggered this invocation
}

export interface ResponderOutput {
  content: string;
  mentions: DogId[];       // dogs mentioned in the response
  ballAction: 'pass' | 'hold' | 'return_to_creator';  // A2A three-choice
  nextTarget?: DogId;      // who to pass the ball to
  holdReason?: string;
  holdNextStep?: string;
  holdWakeAfterMs?: number;
}

/**
 * Demo mode responder — generates personality-appropriate mock responses.
 * Each dog's response reflects its breed personality and follows
 * the A2A protocol (ends with a three-choice action).
 */
export function generateDemoResponse(input: ResponderInput): ResponderOutput {
  const { dogConfig, recentMessages, triggerContent } = input;
  const dogId = dogConfig.id as string;
  const nickname = dogConfig.nickname;

  // Build a context summary from recent messages
  const contextSummary = recentMessages
    .slice(-3)
    .map(m => `${m.dogId ? `[${m.dogId}]` : '[铲屎官]'} ${m.content}`)
    .join('\n');

  // Personality-based response templates
  const responses: Record<string, (ctx: string, trigger: string) => ResponderOutput> = {
    // 边牧/牧哥 — 主架构师，温柔但有主见
    collie: (ctx, trigger) => ({
      content: `收到！我来分析一下这个问题。\n\n${trigger}——从架构角度看，我的建议是：先做最小能跑的版本，不要一开始就追求完整。\n\n做完后我会请铁铁 review 一下，确保质量没问题。\n\n[牧哥/glm-5.1🐾]`,
      mentions: [createDogId('gsd')],
      ballAction: 'pass',
      nextTarget: createDogId('gsd'),
    }),

    // 柯基/短腿 — 设计师，活泼灵动
    corgi: (ctx, trigger) => ({
      content: `嘿！短腿来啦！腿短但视野高 😄\n\n关于${trigger}——从设计角度看，我觉得用户体验是关键！功能再强大，如果看起来不好用，那也是白搭。\n\n我可以先画个简单的交互流程，然后让牧哥评估技术可行性。\n\n[短腿/glm-5.1🐾]`,
      mentions: [createDogId('collie')],
      ballAction: 'pass',
      nextTarget: createDogId('collie'),
    }),

    // 德牧/铁铁 — 纪律守护，严肃
    gsd: (ctx, trigger) => ({
      content: `铁铁 review 完毕。\n\n${trigger}——从质量角度看：\n1. 代码结构清晰 ✅\n2. 需要补充边界条件处理 ⚠️\n3. 建议加类型检查 ⚠️\n\n结论：放行，但建议牧哥补完上面两个 ⚠️ 点。\n\n[铁铁/glm-5.1🐾]`,
      mentions: [createDogId('collie')],
      ballAction: 'pass',
      nextTarget: createDogId('collie'),
    }),
  };

  const responder = responses[dogId];
  if (!responder) {
    // Generic fallback for any future dog
    return {
      content: `${nickname} 收到了。我来看看这个问题。\n\n[${nickname}/glm-5.1🐾]`,
      mentions: [],
      ballAction: 'return_to_creator',
    };
  }

  return responder(contextSummary, triggerContent);
}

/**
 * Real mode responder — calls glm-5.1 API.
 * EXTENSION POINT: implement this when you have API access.
 *
 * Expected flow:
 * 1. Build full prompt = L0 prompt + conversation context
 * 2. Call glm-5.1 API with the prompt
 * 3. Parse response to extract:
 *    - Content (the dog's actual response)
 *    - @mentions (line-start @句柄 patterns)
 *    - Ball action (pass/hold/return_to_creator)
 */
export async function callModelResponder(input: ResponderInput): Promise<ResponderOutput> {
  // TODO: implement real model integration
  // For now, fall back to demo mode
  console.log('[DogResponder] Real model mode not yet implemented, using demo mode');
  return generateDemoResponse(input);
}

import { createDogId } from '../types/ids.js';