/**
 * @file System Provider 配置属性测试
 * @description 测试 System Provider 配置完整性
 * @module lib/config/providers.test
 *
 * **Feature: provider-ui-refactor, Property 4: System Provider 配置完整性**
 * **Validates: Requirements 3.1-3.6**
 */

import { describe, expect } from "vitest";
import { test } from "@fast-check/vitest";
import * as fc from "fast-check";
import { fastCheckRuns } from "../../test/fastCheckRuns";
import {
  SYSTEM_PROVIDERS,
  PROVIDER_GROUPS,
  getSystemProviderIds,
  getProvidersByGroup,
  getProvidersGrouped,
  isSystemProviderId,
  getSystemProvider,
  getSystemProviderCount,
} from "./providers";
import type { SystemProviderId, ProviderGroup } from "../types/provider";

describe("System Provider 配置", () => {
  /**
   * Property 4: System Provider 配置完整性
   *
   * *对于任意* System Provider ID，应存在对应的预设配置，
   * 包含 id、name、type、apiHost、group
   *
   * **Validates: Requirements 3.1-3.6**
   */
  describe("Property 4: System Provider 配置完整性", () => {
    // 获取所有 System Provider ID
    const systemProviderIds = getSystemProviderIds();

    test.prop([fc.constantFrom(...systemProviderIds)], {
      numRuns: fastCheckRuns(100),
    })(
      "每个 System Provider 应包含完整的必填字段",
      (providerId: SystemProviderId) => {
        const config = SYSTEM_PROVIDERS[providerId];

        // 验证必填字段存在且类型正确
        expect(config).toBeDefined();
        expect(config.id).toBe(providerId);
        expect(typeof config.name).toBe("string");
        expect(config.name.length).toBeGreaterThan(0);
        expect(typeof config.type).toBe("string");
        expect(config.type.length).toBeGreaterThan(0);
        expect(typeof config.apiHost).toBe("string");
        expect(typeof config.group).toBe("string");
        expect(config.group.length).toBeGreaterThan(0);
        expect(typeof config.isSystem).toBe("boolean");
        expect(config.isSystem).toBe(true);
        expect(typeof config.enabled).toBe("boolean");
        expect(typeof config.sortOrder).toBe("number");
      },
    );

    test.prop([fc.constantFrom(...systemProviderIds)], {
      numRuns: fastCheckRuns(100),
    })(
      "每个 System Provider 的 group 应为有效的分组类型",
      (providerId: SystemProviderId) => {
        const config = SYSTEM_PROVIDERS[providerId];
        const validGroups: ProviderGroup[] = [
          "mainstream",
          "chinese",
          "cloud",
          "aggregator",
          "local",
          "specialized",
          "custom",
        ];

        expect(validGroups).toContain(config.group);
      },
    );

    test.prop([fc.constantFrom(...systemProviderIds)], {
      numRuns: fastCheckRuns(100),
    })(
      "每个 System Provider 的 type 应为有效的 API 类型",
      (providerId: SystemProviderId) => {
        const config = SYSTEM_PROVIDERS[providerId];
        const validTypes = [
          "openai",
          "openai-response",
          "anthropic",
          "gemini",
          "azure-openai",
          "vertexai",
          "aws-bedrock",
          "ollama",
          "new-api",
          "gateway",
        ];

        expect(validTypes).toContain(config.type);
      },
    );

    test.prop([fc.constantFrom(...systemProviderIds)], {
      numRuns: fastCheckRuns(100),
    })(
      "getSystemProvider 应返回与 SYSTEM_PROVIDERS 相同的配置",
      (providerId: SystemProviderId) => {
        const directConfig = SYSTEM_PROVIDERS[providerId];
        const functionConfig = getSystemProvider(providerId);

        expect(functionConfig).toEqual(directConfig);
      },
    );

    test.prop([fc.constantFrom(...systemProviderIds)], {
      numRuns: fastCheckRuns(100),
    })(
      "isSystemProviderId 应对所有 System Provider ID 返回 true",
      (providerId: SystemProviderId) => {
        expect(isSystemProviderId(providerId)).toBe(true);
      },
    );
  });

  describe("Provider 分组配置", () => {
    const validGroups: ProviderGroup[] = [
      "mainstream",
      "chinese",
      "cloud",
      "aggregator",
      "local",
      "specialized",
      "custom",
    ];

    test.prop([fc.constantFrom(...validGroups)], {
      numRuns: fastCheckRuns(100),
    })("每个分组应有对应的配置", (group: ProviderGroup) => {
      const groupConfig = PROVIDER_GROUPS[group];

      expect(groupConfig).toBeDefined();
      expect(typeof groupConfig.label).toBe("string");
      expect(groupConfig.label.length).toBeGreaterThan(0);
      expect(typeof groupConfig.order).toBe("number");
      expect(groupConfig.order).toBeGreaterThan(0);
    });

    test.prop([fc.constantFrom(...validGroups)], {
      numRuns: fastCheckRuns(100),
    })(
      "getProvidersByGroup 应返回该分组的所有 Provider",
      (group: ProviderGroup) => {
        const providers = getProvidersByGroup(group);

        // 验证返回的所有 Provider 都属于该分组
        for (const provider of providers) {
          expect(provider.group).toBe(group);
        }
      },
    );
  });

  describe("Provider 数量验证", () => {
    test("System Provider 总数应至少为 60", () => {
      const count = getSystemProviderCount();
      expect(count).toBeGreaterThanOrEqual(60);
    });

    test("主流 AI 分组应有 10 个 Provider", () => {
      const providers = getProvidersByGroup("mainstream");
      expect(providers.length).toBe(10);
    });

    test("国内 AI 分组应有 15 个 Provider", () => {
      const providers = getProvidersByGroup("chinese");
      expect(providers.length).toBe(15);
    });

    test("云服务分组应有 5 个 Provider", () => {
      const providers = getProvidersByGroup("cloud");
      expect(providers.length).toBe(5);
    });

    test("API 聚合分组应有 25 个 Provider", () => {
      const providers = getProvidersByGroup("aggregator");
      expect(providers.length).toBe(25);
    });

    test("本地服务分组应有 5 个 Provider", () => {
      const providers = getProvidersByGroup("local");
      expect(providers.length).toBe(5);
    });

    test("专用服务分组应有 3 个 Provider", () => {
      const providers = getProvidersByGroup("specialized");
      expect(providers.length).toBe(3);
    });
  });

  describe("辅助函数", () => {
    test("getProvidersGrouped 应返回按分组组织的 Provider", () => {
      const grouped = getProvidersGrouped();

      // 验证所有分组都存在
      expect(grouped.mainstream).toBeDefined();
      expect(grouped.chinese).toBeDefined();
      expect(grouped.cloud).toBeDefined();
      expect(grouped.aggregator).toBeDefined();
      expect(grouped.local).toBeDefined();
      expect(grouped.specialized).toBeDefined();
      expect(grouped.custom).toBeDefined();

      // 验证每个分组内的 Provider 按 sortOrder 排序
      for (const group of Object.keys(grouped) as ProviderGroup[]) {
        const providers = grouped[group];
        for (let i = 1; i < providers.length; i++) {
          expect(providers[i].sortOrder).toBeGreaterThanOrEqual(
            providers[i - 1].sortOrder,
          );
        }
      }
    });

    test("isSystemProviderId 应对无效 ID 返回 false", () => {
      expect(isSystemProviderId("invalid-provider")).toBe(false);
      expect(isSystemProviderId("")).toBe(false);
      expect(isSystemProviderId("random-string-123")).toBe(false);
    });

    test("getSystemProviderIds 应返回所有 Provider ID", () => {
      const ids = getSystemProviderIds();
      const directIds = Object.keys(SYSTEM_PROVIDERS);

      expect(ids.length).toBe(directIds.length);
      for (const id of ids) {
        expect(directIds).toContain(id);
      }
    });
  });
});
