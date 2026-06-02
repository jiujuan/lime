# Lime 单元测试指南

> 针对独立模块的确定性测试

## 概述

单元测试是测试金字塔的基础，覆盖最小的可测试单元。Lime 的单元测试主要针对：
- 协议转换器
- Provider 模块
- 工具函数
- 数据结构

## Rust 单元测试

### 运行命令

```bash
# 运行所有测试
cd src-tauri && cargo test

# 运行特定模块测试
cargo test converter::
cargo test provider::

# 显示详细输出
cargo test -- --nocapture
```

### 测试文件位置

```
src-tauri/src/
├── converter/
│   ├── mod.rs
│   └── tests.rs          # 转换器测试
├── providers/
│   └── tests.rs          # API Key Provider / 协议适配测试
└── services/
    └── tests.rs          # 服务层测试
```

### 测试模板

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_conversion() {
        let input = OpenAIMessage {
            role: "user".to_string(),
            content: "Hello".to_string(),
        };
        
        let result = convert_to_claude(&input);
        
        assert_eq!(result.role, "user");
        assert!(result.content.contains("Hello"));
    }

    #[test]
    fn test_edge_case_empty_content() {
        let input = OpenAIMessage {
            role: "user".to_string(),
            content: "".to_string(),
        };
        
        let result = convert_to_claude(&input);
        
        // 空内容应该被正确处理
        assert!(result.content.is_empty());
    }
}
```

## 前端单元测试

### 运行命令

```bash
# TDD 默认快速单元入口
npm run test:unit

# 列出当前被归为单元层的测试
npm run test:unit -- --list

# 运行特定文件
npm run test:unit -- src/lib/utils.test.ts

# 查看前端 Vitest 分层治理统计
npm run test:layers:stats

# 前端全量兼容入口，交付前或 CI 使用
npm run test:frontend:all
```

`npm test` / `npm run test:frontend:all` 仍保留为前端全量 Vitest 入口，不作为本地 TDD 默认第一轮信号。

### 测试文件位置

```
src/
├── lib/
│   ├── utils.ts
│   └── utils.test.ts     # 工具函数测试
├── hooks/
│   ├── useConfiguredProviders.ts
│   └── useConfiguredProviders.test.ts
└── components/
    └── __tests__/        # 组件测试
```

新增或迁移测试时优先使用显式后缀：

```
*.unit.test.ts        # 纯单元：View Model / projection / selector / parser / formatter
*.component.test.tsx  # React/jsdom 组件接线
*.contract.test.ts    # DevBridge / Tauri mock / command catalog 契约
*.integration.test.ts # 文件系统、子进程、本地 server、多模块流程
*.e2e.test.ts         # Vitest 内显式 E2E / smoke 测试
*.live.test.ts        # 真实 Provider / 真实联网，默认跳过
```

`*.live.test.ts` 归入 E2E 层，但默认不运行。确需运行时必须显式设置 `LIME_ALLOW_LIVE_PROVIDER_SMOKE=1` 或 `LIME_REAL_API_TEST=1`。

显式后缀不能降低风险层级。`*.unit.test.*` 只有在测试不触碰 React/jsdom、DevBridge/Tauri、文件系统、子进程、网络、Playwright 等外部边界时才会进入 `test:unit`；一旦出现这些边界，分类器会自动提升到 component / contract / integration / e2e。

`npm run test:layers:stats` 还会输出 `Component unit-migration candidates`，用于提示哪些 component 测试因用例过多、文件过大或出现筛选 / 分组 / formatter / request builder / runtime metadata / reducer / selector 等信号，适合后续继续抽 VM。该统计是治理提示，不是失败门禁。

复杂前端页面不要把业务状态机压进组件测试。应先把可纯化逻辑抽到 View Model / projection / selector，再由 `test:unit` 覆盖；组件测试只验证 VM 输出被正确渲染、关键事件能触发正确 action。

新增前端代码时默认按这个顺序落测试：

1. 先识别筛选、分组、格式化、运行时参数拼装、状态机、reducer、request builder 等可纯化逻辑，并抽到 VM / projection / selector / helper。
2. 给这些纯逻辑补 `*.unit.test.ts`，不要依赖 React render、jsdom、真实 timer、DevBridge/Tauri、文件系统或网络。
3. 组件测试只覆盖关键文案/状态是否渲染、用户事件是否触发正确 action、VM 输出是否接上 UI。
4. 核心用户流程和 GUI 壳 / Workspace 主路径交给 `verify:gui-smoke` 或 E2E，不在重组件测试里重复铺满所有业务分支。
5. 如果某个分支暂时不能抽纯测试，必须在对应路线图或执行计划记录原因、风险层级和后续迁移条件，避免后续新增代码继续沿用临时组件测试模式。

### 测试模板

```typescript
import { describe, it, expect } from 'vitest';
import { formatProviderLabel, validateApiKey } from './utils';

describe('formatProviderLabel', () => {
  it('should format configured provider name', () => {
    const result = formatProviderLabel('openai', 'Work OpenAI');
    expect(result).toBe('Work OpenAI');
  });

  it('should fall back to provider type', () => {
    const result = formatProviderLabel('openai', '');
    expect(result).toBe('OpenAI');
  });
});

describe('validateApiKey', () => {
  it('should accept valid OpenAI key', () => {
    expect(validateApiKey('sk-1234567890abcdef')).toBe(true);
  });

  it('should reject invalid key', () => {
    expect(validateApiKey('invalid')).toBe(false);
  });
});
```

## 测试原则

### 1. 单一职责

每个测试只验证一个行为：

```rust
// ✅ 好：单一职责
#[test]
fn test_token_refresh_updates_expiry() {
    // 只测试过期时间更新
}

#[test]
fn test_token_refresh_preserves_scope() {
    // 只测试 scope 保留
}

// ❌ 差：多个职责
#[test]
fn test_token_refresh() {
    // 测试过期时间、scope、错误处理...
}
```

### 2. 独立性

测试之间不应该有依赖：

```rust
// ✅ 好：每个测试独立
#[test]
fn test_a() {
    let state = TestState::new();
    // ...
}

#[test]
fn test_b() {
    let state = TestState::new();
    // ...
}

// ❌ 差：共享状态
static mut SHARED_STATE: Option<TestState> = None;
```

### 3. 可读性

测试名称应该描述行为：

```rust
// ✅ 好：描述性名称
#[test]
fn test_expired_token_triggers_refresh()

#[test]
fn test_invalid_credentials_returns_error()

// ❌ 差：模糊名称
#[test]
fn test_token()

#[test]
fn test_error()
```

## 覆盖率目标

| 模块 | 目标覆盖率 | 说明 |
|------|-----------|------|
| converter | 90%+ | 核心转换逻辑 |
| providers | 80%+ | API Key Provider 与协议适配 |
| services | 70%+ | 业务逻辑 |
| utils | 95%+ | 工具函数 |

## 下一步

- [集成测试指南](integration-tests.md)
- [测试用例：转换器](test-cases/converter-tests.md)
- [测试用例：Provider](test-cases/provider-tests.md)
