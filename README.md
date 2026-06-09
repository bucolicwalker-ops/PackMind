# PackMind 🐕

> 一个最小内核的**多 Agent 协作系统** —— 三只狗狗（边牧 / 柯基 / 德牧）在同一个对话线程里读懂上下文、自主决策、互相传球，把"三个孤立的聊天机器人"变成"一个会协作的团队"。

PackMind 受 [Cat-Coffee / Clowder AI](https://github.com/) 多猫协作架构启发，用最小代码量复刻其灵魂机制：**球权追踪（Ball-Passing）** + **L0 身份注入** + **链式 Agent 协作**。

---

## ✨ 核心特性

| 能力 | 说明 |
|------|------|
| 🧠 **真实 AI 驱动** | 每只狗狗调用真实大模型（兼容 OpenAI / Anthropic 两种 API 格式），读懂对话后自主回复——不是硬编码模板 |
| 🎾 **球权追踪** | 同一线程同一时刻只有一只狗狗"持球"，做完任务后传给下一只，杜绝多 Agent 同时抢话 |
| 🔗 **链式协作** | 狗狗回复中 `@另一只狗` → 系统自动唤醒它接力，形成协作链（带深度限制防无限递归） |
| 🆔 **L0 身份注入** | 每只狗狗有独立的身份、性格、专长 system prompt，编译期注入，不被上下文压缩冲淡 |
| 💾 **数据持久化** | 线程 / 消息原子写入 JSON 文件（temp + rename 防损坏），重启不丢数据 |
| 🛡️ **请求校验** | 所有 REST 入参经 Zod schema 校验，拒绝非法输入 |
| 🎨 **可视化前端** | 温暖咖啡色系 Web 界面：狗狗名片 + 球权指示器 + 聊天 + 快捷唤醒 |

---

## 🐶 认识三只狗狗

| 狗狗 | 角色 | 性格 |
|------|------|------|
| **牧哥**（边牧 / collie） | 主架构师 | 温暖可靠，深入分析，老大哥气质 |
| **短腿**（柯基 / corgi） | 设计师 | 活泼灵动，审美直觉强，腿短但视野高 |
| **铁铁**（德牧 / gsd） | 纪律守护 | 严肃执行力强，代码审查 + 质量保障 |

三只狗狗遵循**跨品种 review 铁律**：德牧 review 边牧、边牧 review 柯基，禁止 self-merge。

---

## 🏗️ 架构概览

```
┌─────────────────────────────────────────────┐
│              REST API (Fastify)              │
│  /api/threads  /api/messages  /api/a2a/*     │
└───────────────┬─────────────────────────────┘
                │
    ┌───────────┼───────────┬──────────────┐
    ▼           ▼           ▼              ▼
┌────────┐ ┌─────────┐ ┌──────────┐ ┌────────────┐
│ Stores │ │  Ball   │ │   Dog    │ │ DogResponder│
│(持久化)│ │ Tracker │ │ Registry │ │  (模型调用) │
└────────┘ └─────────┘ └──────────┘ └─────┬──────┘
                                          │
                              ┌───────────┴───────────┐
                              ▼                       ▼
                    ┌──────────────────┐  ┌──────────────────┐
                    │ OpenAI-compatible│  │   Anthropic-     │
                    │   client         │  │   compatible     │
                    └──────────────────┘  └──────────────────┘
```

**关键模块：**
- `src/registry/DogRegistry.ts` — 狗狗身份注册表
- `src/a2a/BallTracker.ts` — 球权追踪（谁持球 / 为什么 / 何时）
- `src/responder/DogResponder.ts` — 模型调用 + 响应解析（@提及 / 球权动作）
- `src/prompt/compile-l0.ts` — L0 身份 system prompt 编译器
- `src/stores/` — ThreadStore / MessageStore（JSON 持久化）

---

## 🚀 部署流程

### 前置要求
- **Node.js >= 22**
- **pnpm**（推荐）或 npm

### 1. 安装依赖

```bash
git clone https://github.com/bucolicwalker-ops/PackMind.git
cd PackMind
pnpm install
```

### 2. 配置模型 API

复制配置模板，填入你的 API key：

```bash
cp model-config.example.json model-config.json
```

编辑 `model-config.json`：

```json
{
  "providers": {
    "dashscope": {
      "endpoint": "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
      "apiKey": "你的-API-KEY",
      "defaultModel": "qwen3.7-plus",
      "maxTokens": 1024,
      "temperature": 0.7
    }
  },
  "fallbackToDemo": true,
  "maxInvokeChainDepth": 3
}
```

> ⚠️ `model-config.json` 已被 `.gitignore` 排除，**绝不会**被提交到 Git。
> 💡 不配 API key 也能跑——系统会自动降级到 **demo 模式**（预设回复），方便先体验协作流程。

支持任何 **OpenAI 兼容**（`/chat/completions`）或 **Anthropic 兼容**（`/anthropic`）的 API，例如：
DashScope（通义千问）、智谱 GLM、DeepSeek、Moonshot、OpenAI 等。

### 3. 构建 + 启动

```bash
pnpm build          # 编译 TypeScript
pnpm start          # 启动服务（默认 http://localhost:3100）
```

打开浏览器访问 **http://localhost:3100** 即可看到前台界面。

### 4. 自定义端口（可选）

```bash
PORT=8080 pnpm start
```

---

## 🧪 开发

```bash
pnpm build          # tsc 编译
pnpm test           # 运行单元测试（node --test）
pnpm check          # Biome lint 检查
pnpm check:fix      # Biome 自动修复
```

测试覆盖：BallTracker / DogRegistry / ThreadStore / Schemas / Redact —— **50 个测试用例**。

---

## 📡 API 速览

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/health` | GET | 健康检查 |
| `/api/threads` | POST | 创建线程 |
| `/api/messages` | POST | 发送消息（自动解析 @提及） |
| `/api/messages?threadId=...` | GET | 读取线程消息 |
| `/api/a2a/invoke` | POST | 唤醒狗狗回复（含自动链式协作） |
| `/api/a2a/ball-state/:threadId` | GET | 查询当前球权状态 |

### 示例：唤醒牧哥

```bash
# 1. 创建线程
TID=$(curl -s -X POST http://localhost:3100/api/threads \
  -H 'Content-Type: application/json' \
  -d '{"title":"架构讨论"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")

# 2. 唤醒牧哥
curl -s -X POST http://localhost:3100/api/a2a/invoke \
  -H 'Content-Type: application/json' \
  -d "{\"threadId\":\"$TID\",\"dogId\":\"collie\",\"content\":\"牧哥，帮我设计一个日志系统\"}"
```

---

## 🛡️ 安全说明

- **API key 隔离**：密钥存于 `model-config.json`（git-ignored），与狗狗身份配置 `dog-config.json` 分离
- **错误日志脱敏**：API 错误信息经 `redactSecrets()` 脱敏，防止 key 片段泄漏到日志
- **前端 XSS 防护**：所有模型输出 / 用户输入经 `escapeHtml()` 转义后再渲染
- **请求校验**：Zod schema 拦截所有非法 API 入参

---

## 📜 开发历史

PackMind 由 **Clowder AI 多 Agent 团队**协作开发——人类作为 CVO（首席愿景官）定方向，三只猫（布偶猫 / 缅因猫 / 暹罗猫）分别负责架构、审查、设计，遵循"开发 → 跨个体 review → 修复 → 愿景守护"的协作流程。

每个 commit 都记录了真实的协作链路：谁写、谁 review、为什么这么改。

---

## 📄 License

Apache License 2.0 — 详见 [LICENSE](./LICENSE)
