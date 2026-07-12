# Skills 集成 E2E 测试指南

本文档指导如何手动进行 Skills 集成功能的端到端测试。

## 架构说明

Lime 的 Skills 集成基于 agent-rust 框架的 `SkillTool`：

```
用户消息 → AI Agent → SkillTool → global_registry → 执行 Skill
                                        ↑
                                        |
                    load_lime_skills() 加载 ~/.lime/skills/
```

关键组件：
- `AgentState::load_lime_skills()` - 启动时加载 Skills
- `AgentState::reload_lime_skills()` - 安装/卸载后刷新
- `agent::skills::global_registry()` - 全局 Skill 注册表
- `agent::skills::SkillTool` - AI 调用 Skills 的工具

## 前置条件

1. Lime 应用已构建并可运行
2. 至少配置了一个可用的 AI Provider（如 OpenAI API Key）
3. 终端可以访问 `~/.lime/skills/` 目录

## 测试场景

### 场景 1：Skills 自动加载

**目的**：验证 Agent 初始化时能正确加载 Skills

**步骤**：

1. 创建测试 Skill：
```bash
mkdir -p ~/.lime/skills/test-greeting
cat > ~/.lime/skills/test-greeting/SKILL.md << 'EOF'
---
name: test-greeting
description: 一个简单的问候技能，用于测试 Skills 集成
---

# 问候技能

当用户请求问候时，使用以下格式回复：

"测试问候技能已执行。"

请始终使用中文回复。
EOF
```

2. 启动 Electron current 应用：
```bash
cd lime && npm run dev
```

3. 打开开发者工具（Cmd+Option+I），查看控制台日志

4. **预期结果**：
   - 日志中应显示 `[Agent] 成功加载 1 个 Lime Skills 到 global_registry`
   - 日志中应显示 `[Agent] 已注册 Skill: user:test-greeting`

### 场景 2：AI 自动调用 Skill

**目的**：验证 AI 能根据用户意图自动调用 Skill

**步骤**：

1. 确保测试 Skill 已创建（见场景 1）

2. 在 Lime 聊天界面发送消息：
   ```
   请用问候技能跟我打个招呼
   ```

3. **预期结果**：
   - AI 应该识别到 `test-greeting` Skill
   - AI 应该调用 Skill 并返回问候语
   - 响应中应包含 "测试问候技能已执行"

### 场景 3：通过斜杠命令调用 Skill

**目的**：验证用户可以通过 `/skill-name` 显式调用 Skill

**步骤**：

1. 在聊天界面发送：
   ```
   /test-greeting
   ```

2. **预期结果**：
   - AI 应该直接执行 `test-greeting` Skill
   - 返回问候语

### 场景 4：安装新 Skill 后动态刷新

**目的**：验证安装新 Skill 后 AI 能立即发现

**步骤**：

1. 在 Lime 运行时，创建新 Skill：
```bash
mkdir -p ~/.lime/skills/test-calculator
cat > ~/.lime/skills/test-calculator/SKILL.md << 'EOF'
---
name: test-calculator
description: 一个简单的计算器技能
---

# 计算器技能

当用户请求计算时，执行数学运算并返回结果。

支持：加法、减法、乘法、除法
EOF
```

2. 在 Lime Skills 页面点击刷新（或重新进入页面）

3. 发送消息：
   ```
   请用计算器技能帮我算 123 + 456
   ```

4. **预期结果**：
   - AI 应该能发现新安装的 `test-calculator` Skill
   - AI 应该调用该 Skill 并返回计算结果

### 场景 5：卸载 Skill 后不再可用

**目的**：验证卸载 Skill 后 AI 不再能调用

**步骤**：

1. 删除测试 Skill：
```bash
rm -rf ~/.lime/skills/test-greeting
```

2. 在 Lime Skills 页面点击刷新

3. 发送消息：
   ```
   /test-greeting
   ```

4. **预期结果**：
   - AI 应该提示找不到该 Skill
   - 或者 AI 应该说明该 Skill 不可用

## 清理测试数据

测试完成后，清理测试 Skills：

```bash
rm -rf ~/.lime/skills/test-greeting
rm -rf ~/.lime/skills/test-calculator
```

## 常见问题排查

### Skills 没有被加载

1. 检查目录是否存在：`ls -la ~/.lime/skills/`
2. 检查 SKILL.md 文件格式是否正确
3. 查看应用日志中是否有错误信息

### AI 没有调用 Skill

1. 确认 Skill 已被加载（查看启动日志）
2. 尝试使用更明确的指令，如 "使用 xxx 技能"
3. 检查 Skill 的 `description` 是否清晰描述了用途

### 动态刷新不生效

1. 确认调用了 `reload_lime_skills()`
2. 检查日志中是否有刷新相关的输出
3. 尝试重启应用

## 自动化测试（未来计划）

自动化 E2E 分两层：

1. Gate A 证明 renderer / browser projection 在可控环境下稳定。它可以用普通 Chrome CDP、DOM evaluate、screenshot、显式测试路由或 stream replay，但只能声明“投影没坏”，不能证明真实 Electron 产品链路可交付。
2. Gate B 证明真实产品入口和运行时边界能工作。本地续测优先复用真实 Electron CDP 会话：先确认 `http://127.0.0.1:9223/json/version` 的 `User-Agent` 包含 `Electron/Lime`，再通过 Playwright `chromium.connectOverCDP("http://127.0.0.1:9223")` 接入已有 Lime 页签。可重复回归优先使用仓库已有 Electron fixture：通过 Playwright `_electron.launch(...)` 启动隔离 Desktop Host、走 GUI 输入框、`app_server_handle_json_lines` 与 App Server JSON-RPC。

CDP 只是观察 / 操作通道，不自动等于 Gate B。普通 Chrome 打开的 `127.0.0.1:1420` 是 Gate A；只有同时证明 Electron 壳、IPC、App Server method、read model 和用户可见状态，才可作为 Gate B。不要照搬外部项目的命令、目录或证据包名。

所有 Skills / Soul / Claw 主链验收都必须证明 current 链路，而不是普通浏览器镜像：

- `window.__LIME_ELECTRON__ === true`
- `window.electronAPI.invoke` 存在
- trace 中包含 `transport: "electron-ipc"`
- trace 中包含 `command: "app_server_handle_json_lines"`
- JSON-RPC method 至少包含 `agentSession/turn/start`

Soul Style Pack 不是 Agent Skill，不放入 `~/.lime/skills` 或 `SKILL.md`。验证 Soul 风格时使用 `claw-chat-current-fixture-smoke.mjs --scenario soul-style` 或 `lime-playwright-e2e` CDP 真实 Claw 输入框；验证 Agent Skill 时才创建测试 `SKILL.md`。

当前 Soul 风格回归入口：

```bash
node scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs \
  --scenario soul-style \
  --timeout-ms 180000 \
  --prefix soul-style-smoke
```

该入口只在 GUI evidence 中保存配置、链路、read model 和 summary-only trace；完整 system prompt / `memory_soul_prompt_context.v2` 正文由 Rust 单测覆盖，不落入 GUI evidence。`APP_SERVER_BACKEND_MODE=external` 只能证明 GUI / read model / current JSON-RPC 主链，不能证明 Soul 最终 prompt；需要证明最终模型请求时，使用 Rust prompt 单测或 `APP_SERVER_BACKEND_MODE=runtime` + 本地 provider fixture，并只保存 `hasInteractionSoul`、`hasMemorySoulSchema`、`profileId`、`stylePackId`、`intensity` 等 marker booleans。

后续可以继续扩展 Playwright、Electron smoke 或 App Server contract：

```typescript
// 示例：Playwright E2E 测试
test('AI should auto-invoke skill based on intent', async ({ page }) => {
  // 1. 创建测试 Skill
  await createTestSkill('test-greeting');
  
  // 2. 启动应用
  await launchLime();
  
  // 3. 发送消息
  await page.fill('[data-testid="chat-input"]', '请用问候技能跟我打招呼');
  await page.click('[data-testid="send-button"]');
  
  // 4. 验证响应
  await expect(page.locator('[data-testid="chat-message"]'))
    .toContainText('测试问候技能已执行');
});
```
