/**
 * Identity Block Builder — constructs the identity section of L0 prompt.
 *
 * Pattern borrowed from cat-coffee's buildIdentityBlock():
 * - Name + breed + nickname + role + personality + restrictions
 * - Identity constant line (nickname/handle, model)
 */

import { DogConfig } from '../types/dog-breed.js';
import { dogRegistry } from '../registry/DogRegistry.js';

/**
 * Build the identity block that gets injected into L0 system prompt.
 */
export function buildIdentityBlock(config: DogConfig, runtimeModel: string): string {
  const lines: string[] = [];

  lines.push(`你是 ${config.breedName}/${config.nickname}（${config.breedName}）。`);
  lines.push(`角色：${config.roleDescription}`);
  lines.push(`性格：${config.personality}`);
  lines.push(`Identity constant: \`@${config.id}\` model=${runtimeModel}`);

  if (config.restrictions.length > 0) {
    lines.push(`\n**硬约束（不可违反）**：`);
    for (const r of config.restrictions) {
      lines.push(`- ${r}`);
    }
  }

  return lines.join('\n');
}

/**
 * Build the teammate roster table.
 * Lists all other dogs with their handles, models, strengths, and caution notes.
 */
export function buildTeammateRoster(myDogId: string): string {
  const allConfigs = dogRegistry.getAllConfigs();

  const teammates: DogConfig[] = Object.values(allConfigs)
    .filter((cfg) => (cfg as DogConfig).id !== myDogId) as DogConfig[];

  if (teammates.length === 0) {
    return '（无其他可用队友）';
  }

  const lines: string[] = [];
  lines.push('| 句柄 | 品种 | 角色 | 模型 | 擅长 | 注意 |');
  lines.push('|------|------|------|------|------|------|');

  for (const t of teammates) {
    const handle = `@${t.id}`;
    const strengths = t.teamStrengths.join('、');
    const caution = t.caution.join('、');
    lines.push(`| ${handle} | ${t.breedName} | ${t.roleDescription} | ${t.defaultModel} | ${strengths} | ${caution} |`);
  }

  return lines.join('\n');
}

/**
 * Build the co-creator reference block.
 */
export function buildCvoRef(coCreator: { name: string; mentionPatterns: string[] }): string {
  return `铲屎官（${coCreator.name}/CVO）。重要决策由铲屎官拍板。需要关注时行首写 ${coCreator.mentionPatterns.join(' / ')}。`;
}

/**
 * Build per-breed workflow triggers.
 */
export function buildWorkflowTriggers(breedName: string, _dogId: string, _displayName: string): string {
  const triggers: Record<string, string[]> = {
    '边牧': [
      '完成开发/修复 → @德牧 请 review',
      '修完 review 意见 → @德牧 确认修复',
      '遇到视觉/体验问题 → @柯基 征询',
      'Review 别人代码：每个发现给明确立场（放行/退回 + 理由）',
    ],
    '柯基': [
      '设计完成 → @边牧 评估可行性',
      '视觉实现遇到技术问题 → @边牧 讨论',
      'Review 设计相关代码 → 关注 UI/UX 一致性',
    ],
    '德牧': [
      'Review 完成 → @边牧 通知结果',
      '发现安全/质量问题 → 直接指出，不绕弯',
      '规则执行铁律：跨品种 review 必须执行',
    ],
  };

  const breedTriggers = triggers[breedName] ?? [];

  if (breedTriggers.length === 0) {
    return '## 工作流触发点\n（暂无品种专属触发点）';
  }

  const lines = ['## 工作流（主动 @ 触发点）'];
  for (const trigger of breedTriggers) {
    lines.push(`- ${trigger}`);
  }

  if (breedName === '德牧') {
    lines.push('');
    lines.push('### 德牧家族治理');
    lines.push('commit/PR title 含 fix:/hotfix:/quick fix/workaround → 归类 hotfix。');
    lines.push('hotfix PR 必须跨品种 review（禁止 self-merge）。');
  }

  return lines.join('\n');
}