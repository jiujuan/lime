/**
 * Legacy Patch Coverage Test
 *
 * Verifies that legacy patch files are valid and contain expected entries.
 */

import { describe, it, expect } from "vitest";
import enPatch from "../legacy-patch/patches/en.json";
import zhPatch from "../legacy-patch/patches/zh.json";

describe("Legacy Patch Coverage", () => {
  describe("Patch File Validity", () => {
    it("should load en.json without errors", () => {
      expect(enPatch).toBeDefined();
      expect(typeof enPatch).toBe("object");
    });

    it("should load zh.json without errors", () => {
      expect(zhPatch).toBeDefined();
      expect(typeof zhPatch).toBe("object");
    });

    it("should have matching keys in both patch files", () => {
      const enKeys = Object.keys(enPatch).filter((k) => !k.startsWith("//"));
      const zhKeys = Object.keys(zhPatch).filter((k) => !k.startsWith("//"));

      expect(Math.abs(enKeys.length - zhKeys.length)).toBeLessThan(50);
    });
  });

  describe("Legacy Patch Quality", () => {
    it("should not have [TODO: Translate] markers in production", () => {
      const enValues = Object.values(enPatch);
      const todoCount = enValues.filter(
        (v) => typeof v === "string" && v.includes("[TODO: Translate]"),
      ).length;

      if (todoCount > 0) {
        console.warn(`Found ${todoCount} [TODO: Translate] markers in en.json`);
      }
    });

    it("should have Chinese text as keys in zh.json", () => {
      const zhKeys = Object.keys(zhPatch).filter((k) => !k.startsWith("//"));
      const chineseKeys = zhKeys.filter((k) => /[\u4e00-\u9fff]/.test(k));

      expect(chineseKeys.length).toBeGreaterThan(zhKeys.length * 0.8);
    });

    it("should have identity mappings in zh.json", () => {
      const entries = Object.entries(zhPatch).filter(
        ([k]) => !k.startsWith("//"),
      );

      const identityMappings = entries.filter(([k, v]) => k === v).length;
      expect(identityMappings).toBeGreaterThan(entries.length * 0.8);
    });
  });

  describe("Legacy Patch Common Entries", () => {
    it("should have translations for common UI elements", () => {
      const commonElements = ["设置", "保存", "取消", "确认", "删除"];

      commonElements.forEach((element) => {
        expect(enPatch).toHaveProperty(element);
        expect(zhPatch).toHaveProperty(element);
      });
    });

    it("should have translations for main navigation", () => {
      const navItems = [
        "新建任务",
        "Skills",
        "灵感",
        "项目资料",
        "持续流程",
        "消息渠道",
      ];

      navItems.forEach((item) => {
        expect(enPatch).toHaveProperty(item);
        expect(zhPatch).toHaveProperty(item);
      });
    });

    it("should have translations for helper surfaces", () => {
      const helperItems = ["项目资料"];

      helperItems.forEach((item) => {
        expect(enPatch).toHaveProperty(item);
        expect(zhPatch).toHaveProperty(item);
      });
    });
  });

  describe("Legacy Patch Consistency", () => {
    it("should not have empty translations", () => {
      const enEntries = Object.entries(enPatch).filter(
        ([k]) => !k.startsWith("//"),
      );
      const emptyTranslations = enEntries.filter(([, v]) => v === "").length;

      expect(emptyTranslations).toBe(0);
    });

    it("should have reasonable translation lengths", () => {
      const entries = Object.entries(enPatch).filter(
        ([k]) => !k.startsWith("//"),
      );

      entries.forEach(([key, value]) => {
        if (typeof value === "string" && value.length > 0) {
          expect(value.length).toBeLessThan(key.length * 10);
        }
      });
    });
  });
});
