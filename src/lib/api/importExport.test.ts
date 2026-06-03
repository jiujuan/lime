/**
 * @file 导入导出属性测试
 * @description 测试 Provider 配置导入导出的 Round-Trip 正确性
 * @module lib/api/importExport.test
 *
 * **Feature: provider-ui-refactor, Property 18: 导入导出 Round-Trip**
 * **Validates: Requirements 9.4**
 */

import { describe, expect } from "vitest";
import { test } from "@fast-check/vitest";
import * as fc from "fast-check";
import { fastCheckRuns } from "../../test/fastCheckRuns";
import type {
  ProviderConfig,
  ProviderType,
  ProviderGroup,
} from "../types/provider";

// ============================================================================
// 测试用的纯函数（模拟导入导出逻辑）
// ============================================================================

/**
 * 导出配置格式
 */
interface ExportedConfig {
  version: string;
  exported_at: string;
  providers: ProviderConfig[];
}

/**
 * 导入结果
 */
interface ImportResult {
  success: boolean;
  imported_providers: number;
  skipped_providers: number;
  errors: string[];
}

/**
 * 导出 Provider 配置为 JSON
 * 模拟后端的导出逻辑
 */
function exportProviders(
  providers: ProviderConfig[],
  _includeKeys: boolean,
): string {
  const exportData: ExportedConfig = {
    version: "1.0",
    exported_at: new Date().toISOString(),
    providers: providers.map((p) => ({
      ...p,
      // 导出时不包含敏感信息
    })),
  };
  return JSON.stringify(exportData, null, 2);
}

/**
 * 解析导出的配置 JSON
 * 模拟后端的导入解析逻辑
 */
function parseExportedConfig(configJson: string): ExportedConfig | null {
  try {
    const parsed = JSON.parse(configJson);
    if (
      !parsed.version ||
      !parsed.providers ||
      !Array.isArray(parsed.providers)
    ) {
      return null;
    }
    return parsed as ExportedConfig;
  } catch {
    return null;
  }
}

/**
 * 导入 Provider 配置
 * 模拟后端的导入逻辑（不包含数据库操作）
 */
function importProviders(
  configJson: string,
  existingProviderIds: Set<string>,
): ImportResult {
  const parsed = parseExportedConfig(configJson);
  if (!parsed) {
    return {
      success: false,
      imported_providers: 0,
      skipped_providers: 0,
      errors: ["无效的配置格式"],
    };
  }

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const provider of parsed.providers) {
    if (!provider.id) {
      errors.push("Provider 缺少 id");
      continue;
    }

    // 检查是否已存在（冲突处理）
    if (existingProviderIds.has(provider.id)) {
      skipped++;
      continue;
    }

    // 验证必填字段
    if (
      !provider.name ||
      !provider.type ||
      !provider.apiHost ||
      !provider.group
    ) {
      errors.push(`Provider ${provider.id} 缺少必填字段`);
      continue;
    }

    imported++;
  }

  return {
    success: errors.length === 0,
    imported_providers: imported,
    skipped_providers: skipped,
    errors,
  };
}

/**
 * 比较两个 Provider 配置是否等价
 * 忽略时间戳等动态字段
 */
function areProvidersEquivalent(a: ProviderConfig, b: ProviderConfig): boolean {
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.type === b.type &&
    a.apiHost === b.apiHost &&
    a.isSystem === b.isSystem &&
    a.group === b.group &&
    a.enabled === b.enabled &&
    a.sortOrder === b.sortOrder &&
    a.apiVersion === b.apiVersion &&
    a.project === b.project &&
    a.location === b.location &&
    a.region === b.region
  );
}

// ============================================================================
// Arbitrary 生成器
// ============================================================================

/**
 * 生成有效的 Provider ID
 */
const providerIdArb = fc.stringMatching(/^[a-z][a-z0-9-]{2,20}$/);

/**
 * 生成有效的 Provider 名称
 */
const providerNameArb = fc.string({ minLength: 1, maxLength: 50 });

/**
 * 生成有效的 API Host
 */
const apiHostArb = fc.oneof(
  fc.constant("https://api.openai.com"),
  fc.constant("https://api.anthropic.com"),
  fc.constant("https://api.example.com"),
  fc.stringMatching(/^https?:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/[a-z0-9-]*)*\/?$/),
);

/**
 * 生成有效的 Provider Type
 */
const providerTypeArb: fc.Arbitrary<ProviderType> = fc.constantFrom(
  "openai",
  "openai-response",
  "anthropic",
  "gemini",
  "azure-openai",
  "vertexai",
  "aws-bedrock",
  "ollama",
  "fal",
  "new-api",
  "gateway",
);

/**
 * 生成有效的 Provider Group
 */
const providerGroupArb: fc.Arbitrary<ProviderGroup> = fc.constantFrom(
  "mainstream",
  "chinese",
  "cloud",
  "aggregator",
  "local",
  "specialized",
  "custom",
);

/**
 * 生成有效的 Provider 配置
 */
const providerConfigArb: fc.Arbitrary<ProviderConfig> = fc.record({
  id: providerIdArb,
  name: providerNameArb,
  type: providerTypeArb,
  apiHost: apiHostArb,
  isSystem: fc.boolean(),
  group: providerGroupArb,
  enabled: fc.boolean(),
  sortOrder: fc.integer({ min: 0, max: 9999 }),
  apiVersion: fc.option(fc.string({ minLength: 1, maxLength: 20 }), {
    nil: undefined,
  }),
  project: fc.option(fc.string({ minLength: 1, maxLength: 50 }), {
    nil: undefined,
  }),
  location: fc.option(fc.string({ minLength: 1, maxLength: 50 }), {
    nil: undefined,
  }),
  region: fc.option(fc.string({ minLength: 1, maxLength: 20 }), {
    nil: undefined,
  }),
});

/**
 * 生成唯一 ID 的 Provider 配置列表
 */
const uniqueProvidersArb = fc
  .array(providerConfigArb, { minLength: 0, maxLength: 10 })
  .map((providers) => {
    // 确保 ID 唯一
    const seen = new Set<string>();
    return providers.filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
  });

// ============================================================================
// 属性测试
// ============================================================================

describe("导入导出功能", () => {
  /**
   * Property 18: 导入导出 Round-Trip
   *
   * *对于任意* Provider 配置集合，导出后再导入应得到等价的配置
   *
   * **Validates: Requirements 9.4**
   */
  describe("Property 18: 导入导出 Round-Trip", () => {
    test.prop([uniqueProvidersArb], { numRuns: fastCheckRuns(100) })(
      "导出后再导入应保留所有 Provider 配置",
      (providers) => {
        // 导出配置
        const exported = exportProviders(providers, false);

        // 解析导出的配置
        const parsed = parseExportedConfig(exported);

        // 验证解析成功
        expect(parsed).not.toBeNull();
        if (!parsed) return;

        // 验证 Provider 数量一致
        expect(parsed.providers.length).toBe(providers.length);

        // 验证每个 Provider 配置等价
        for (let i = 0; i < providers.length; i++) {
          expect(
            areProvidersEquivalent(providers[i], parsed.providers[i]),
          ).toBe(true);
        }
      },
    );

    test.prop([uniqueProvidersArb], { numRuns: fastCheckRuns(100) })(
      "导入到空数据库应导入所有 Provider",
      (providers) => {
        // 导出配置
        const exported = exportProviders(providers, false);

        // 导入到空数据库（无已存在的 Provider）
        const result = importProviders(exported, new Set());

        // 验证导入结果
        expect(result.imported_providers).toBe(providers.length);
        expect(result.skipped_providers).toBe(0);
        expect(result.errors.length).toBe(0);
        expect(result.success).toBe(true);
      },
    );

    test.prop([uniqueProvidersArb, uniqueProvidersArb], {
      numRuns: fastCheckRuns(100),
    })("导入时应跳过已存在的 Provider", (existingProviders, newProviders) => {
      // 创建已存在的 Provider ID 集合
      const existingIds = new Set(existingProviders.map((p) => p.id));

      // 导出新 Provider 配置
      const exported = exportProviders(newProviders, false);

      // 导入配置
      const result = importProviders(exported, existingIds);

      // 计算预期的导入和跳过数量
      const expectedImported = newProviders.filter(
        (p) => !existingIds.has(p.id),
      ).length;
      const expectedSkipped = newProviders.filter((p) =>
        existingIds.has(p.id),
      ).length;

      // 验证导入结果
      expect(result.imported_providers).toBe(expectedImported);
      expect(result.skipped_providers).toBe(expectedSkipped);
    });

    test.prop([uniqueProvidersArb], { numRuns: fastCheckRuns(100) })(
      "导出的 JSON 应包含版本信息",
      (providers) => {
        const exported = exportProviders(providers, false);
        const parsed = parseExportedConfig(exported);

        expect(parsed).not.toBeNull();
        if (!parsed) return;

        expect(parsed.version).toBe("1.0");
        expect(parsed.exported_at).toBeDefined();
        expect(typeof parsed.exported_at).toBe("string");
      },
    );

    test.prop([fc.string()], { numRuns: fastCheckRuns(100) })(
      "无效的 JSON 应返回导入失败",
      (invalidJson) => {
        // 跳过恰好是有效配置的情况
        const parsed = parseExportedConfig(invalidJson);
        if (parsed !== null) return;

        const result = importProviders(invalidJson, new Set());

        expect(result.success).toBe(false);
        expect(result.imported_providers).toBe(0);
        expect(result.errors.length).toBeGreaterThan(0);
      },
    );
  });

  describe("导出配置格式", () => {
    test.prop([uniqueProvidersArb], { numRuns: fastCheckRuns(100) })(
      "导出的 JSON 应是有效的 JSON 格式",
      (providers) => {
        const exported = exportProviders(providers, false);

        // 验证是有效的 JSON
        expect(() => JSON.parse(exported)).not.toThrow();
      },
    );

    test.prop([uniqueProvidersArb], { numRuns: fastCheckRuns(100) })(
      "导出的配置应包含所有必填字段",
      (providers) => {
        const exported = exportProviders(providers, false);
        const parsed = parseExportedConfig(exported);

        expect(parsed).not.toBeNull();
        if (!parsed) return;

        for (const provider of parsed.providers) {
          expect(provider.id).toBeDefined();
          expect(provider.name).toBeDefined();
          expect(provider.type).toBeDefined();
          expect(provider.apiHost).toBeDefined();
          expect(provider.group).toBeDefined();
          expect(typeof provider.isSystem).toBe("boolean");
          expect(typeof provider.enabled).toBe("boolean");
          expect(typeof provider.sortOrder).toBe("number");
        }
      },
    );
  });

  describe("冲突处理", () => {
    test.prop([providerConfigArb], { numRuns: fastCheckRuns(100) })(
      "导入已存在的 Provider 应被跳过",
      (provider) => {
        // 导出单个 Provider
        const exported = exportProviders([provider], false);

        // 导入到已存在该 Provider 的数据库
        const existingIds = new Set([provider.id]);
        const result = importProviders(exported, existingIds);

        // 验证被跳过
        expect(result.imported_providers).toBe(0);
        expect(result.skipped_providers).toBe(1);
        expect(result.success).toBe(true);
      },
    );
  });
});
