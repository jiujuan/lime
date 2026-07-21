/**
 * @file Provider 图标映射测试
 * @description 验证现役图标映射、资源列表与组件注册一致
 * @module icons/providers/providers-icons.test
 */

import { describe, expect } from "vitest";
import { test } from "@fast-check/vitest";
import { providerTypeToIcon, availableIcons } from "./utils";
import { iconComponents } from "./index";

describe("Provider 图标系统", () => {
  describe("图标映射一致性", () => {
    test("所有可用图标应有对应的组件", () => {
      for (const iconName of availableIcons) {
        const IconComponent = iconComponents[iconName];
        expect(IconComponent).toBeDefined();
        expect(typeof IconComponent).toBe("function");
      }
    });

    test("图标组件映射应包含所有可用图标", () => {
      const componentKeys = Object.keys(iconComponents);
      for (const iconName of availableIcons) {
        expect(componentKeys).toContain(iconName);
      }
    });

    test("Provider 类型映射的值应都在可用图标列表中", () => {
      const mappedIcons = Object.values(providerTypeToIcon);
      for (const iconName of mappedIcons) {
        expect((availableIcons as readonly string[]).includes(iconName)).toBe(
          true,
        );
      }
    });
  });

  describe("图标数量验证", () => {
    test("可用图标数量应至少为 60", () => {
      expect(availableIcons.length).toBeGreaterThanOrEqual(60);
    });

    test("图标组件数量应与可用图标数量一致", () => {
      const componentCount = Object.keys(iconComponents).length;
      expect(componentCount).toBe(availableIcons.length);
    });
  });
});
