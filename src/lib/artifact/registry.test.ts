/**
 * @file Artifact 渲染器注册表属性测试
 * @description 使用 fast-check 进行属性测试，验证注册表操作的正确性
 * @module lib/artifact/registry.test
 * @requirements 3.2, 3.3, 3.6
 */

import { describe, test, expect } from "vitest";
import * as fc from "fast-check";
import React, { lazy } from "react";
import { fastCheckRuns } from "../../test/fastCheckRuns";
import { ArtifactRegistry } from "./registry";
import type {
  ArtifactType,
  RendererEntry,
  ArtifactRendererProps,
} from "./types";
import {
  ALL_ARTIFACT_TYPES,
  LIGHTWEIGHT_ARTIFACT_TYPES,
  CANVAS_ARTIFACT_TYPES,
} from "./types";

// ============================================================================
// 自定义生成器 (Arbitraries)
// ============================================================================

/** Artifact 类型生成器 */
const artifactTypeArb = fc.constantFrom(...ALL_ARTIFACT_TYPES);

/** 轻量类型生成器 */
const lightweightTypeArb = fc.constantFrom(...LIGHTWEIGHT_ARTIFACT_TYPES);

/** Canvas 类型生成器 */
const canvasTypeArb = fc.constantFrom(...CANVAS_ARTIFACT_TYPES);

/** 安全字符串生成器（用于显示名称和图标） */
const safeStringArb = fc
  .array(
    fc.constantFrom(
      ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 _-".split(
        "",
      ),
    ),
    {
      minLength: 1,
      maxLength: 20,
    },
  )
  .map((chars) => chars.join(""));

/** 文件扩展名生成器 */
const fileExtensionArb = fc.constantFrom(
  "ts",
  "js",
  "py",
  "rs",
  "html",
  "svg",
  "jsx",
  "mmd",
  "json",
  "txt",
);

/** 创建模拟渲染器组件 */
const createMockComponent = () =>
  lazy(() =>
    Promise.resolve({
      default: (() => null) as React.FC<ArtifactRendererProps>,
    }),
  );

/** 渲染器注册项生成器 */
const rendererEntryArb = (type: ArtifactType) =>
  fc
    .record({
      displayName: safeStringArb,
      icon: safeStringArb,
      canEdit: fc.boolean(),
      fileExtension: fc.option(fileExtensionArb, { nil: undefined }),
    })
    .map(
      ({ displayName, icon, canEdit, fileExtension }): RendererEntry => ({
        type,
        displayName,
        icon,
        component: createMockComponent(),
        canEdit,
        fileExtension,
      }),
    );

/** 随机类型的渲染器注册项生成器 */
const randomRendererEntryArb = artifactTypeArb.chain((type) =>
  rendererEntryArb(type),
);

/** 注册操作序列生成器 */
const registrationSequenceArb = fc.array(randomRendererEntryArb, {
  minLength: 1,
  maxLength: 20,
});

/** 唯一类型的注册操作序列生成器 */
const uniqueTypeRegistrationSequenceArb = fc
  .shuffledSubarray(ALL_ARTIFACT_TYPES, { minLength: 1 })
  .chain((types) => fc.tuple(...types.map((type) => rendererEntryArb(type))));

// ============================================================================
// Property 5: 注册表操作正确性
// **Validates: Requirements 3.2, 3.3, 3.6**
// ============================================================================

describe("Property 5: 注册表操作正确性", () => {
  /**
   * **Validates: Requirements 3.3**
   * 注册后 `has(type)` 应返回 true
   */
  test("注册后 has(type) 应返回 true", () => {
    fc.assert(
      fc.property(randomRendererEntryArb, (entry) => {
        // 每次测试使用新的注册表实例
        const registry = new ArtifactRegistry();

        // 注册前应返回 false
        expect(registry.has(entry.type)).toBe(false);

        // 注册渲染器
        registry.register(entry);

        // 注册后应返回 true
        expect(registry.has(entry.type)).toBe(true);
      }),
      { numRuns: fastCheckRuns(100) },
    );
  });

  /**
   * **Validates: Requirements 3.2**
   * 注册后 `get(type)` 应返回正确的渲染器
   */
  test("注册后 get(type) 应返回正确的渲染器", () => {
    fc.assert(
      fc.property(randomRendererEntryArb, (entry) => {
        // 每次测试使用新的注册表实例
        const registry = new ArtifactRegistry();

        // 注册前应返回 undefined
        expect(registry.get(entry.type)).toBeUndefined();

        // 注册渲染器
        registry.register(entry);

        // 注册后应返回正确的渲染器
        const retrieved = registry.get(entry.type);
        expect(retrieved).toBeDefined();
        expect(retrieved?.type).toBe(entry.type);
        expect(retrieved?.displayName).toBe(entry.displayName);
        expect(retrieved?.icon).toBe(entry.icon);
        expect(retrieved?.canEdit).toBe(entry.canEdit);
        expect(retrieved?.fileExtension).toBe(entry.fileExtension);
      }),
      { numRuns: fastCheckRuns(100) },
    );
  });

  /**
   * **Validates: Requirements 3.6**
   * `getAll()` 应返回所有已注册的渲染器
   */
  test("getAll() 应返回所有已注册的渲染器", () => {
    fc.assert(
      fc.property(uniqueTypeRegistrationSequenceArb, (entries) => {
        // 每次测试使用新的注册表实例
        const registry = new ArtifactRegistry();

        // 初始状态应为空
        expect(registry.getAll()).toHaveLength(0);

        // 注册所有渲染器
        for (const entry of entries) {
          registry.register(entry);
        }

        // getAll() 应返回所有已注册的渲染器
        const allEntries = registry.getAll();
        expect(allEntries).toHaveLength(entries.length);

        // 验证每个注册的类型都在结果中
        const registeredTypes = new Set(allEntries.map((e) => e.type));
        for (const entry of entries) {
          expect(registeredTypes.has(entry.type)).toBe(true);
        }
      }),
      { numRuns: fastCheckRuns(100) },
    );
  });

  /**
   * **Validates: Requirements 3.2, 3.3**
   * 对于任意注册操作序列，最后注册的渲染器应覆盖之前的
   */
  test("重复注册同一类型应覆盖之前的渲染器", () => {
    fc.assert(
      fc.property(
        artifactTypeArb,
        rendererEntryArb(ALL_ARTIFACT_TYPES[0]).chain((e1) =>
          rendererEntryArb(ALL_ARTIFACT_TYPES[0]).map(
            (e2) => [e1, e2] as const,
          ),
        ),
        (type, [entry1Template, entry2Template]) => {
          // 每次测试使用新的注册表实例
          const registry = new ArtifactRegistry();

          // 创建两个相同类型但不同属性的注册项
          const entry1: RendererEntry = { ...entry1Template, type };
          const entry2: RendererEntry = {
            ...entry2Template,
            type,
            displayName: entry2Template.displayName + "_v2",
          };

          // 注册第一个
          registry.register(entry1);
          expect(registry.get(type)?.displayName).toBe(entry1.displayName);

          // 注册第二个（覆盖）
          registry.register(entry2);
          expect(registry.get(type)?.displayName).toBe(entry2.displayName);

          // has 仍然返回 true
          expect(registry.has(type)).toBe(true);

          // getAll 只包含一个该类型的条目
          const allEntries = registry.getAll();
          const entriesOfType = allEntries.filter((e) => e.type === type);
          expect(entriesOfType).toHaveLength(1);
        },
      ),
      { numRuns: fastCheckRuns(100) },
    );
  });

  /**
   * **Validates: Requirements 3.2, 3.3, 3.6**
   * 对于任意注册操作序列，所有操作应保持一致性
   */
  test("任意注册操作序列应保持一致性", () => {
    fc.assert(
      fc.property(registrationSequenceArb, (entries) => {
        // 每次测试使用新的注册表实例
        const registry = new ArtifactRegistry();

        // 跟踪每个类型最后注册的渲染器
        const lastRegistered = new Map<ArtifactType, RendererEntry>();

        for (const entry of entries) {
          registry.register(entry);
          lastRegistered.set(entry.type, entry);
        }

        // 验证 has() 对所有已注册类型返回 true
        for (const type of lastRegistered.keys()) {
          expect(registry.has(type)).toBe(true);
        }

        // 验证 get() 返回最后注册的渲染器
        for (const [type, expectedEntry] of lastRegistered) {
          const retrieved = registry.get(type);
          expect(retrieved?.displayName).toBe(expectedEntry.displayName);
          expect(retrieved?.icon).toBe(expectedEntry.icon);
        }

        // 验证 getAll() 返回正确数量的渲染器
        const allEntries = registry.getAll();
        expect(allEntries).toHaveLength(lastRegistered.size);
      }),
      { numRuns: fastCheckRuns(100) },
    );
  });

  /**
   * **Validates: Requirements 3.2, 3.3**
   * 未注册的类型应返回正确的结果
   */
  test("未注册的类型 has() 应返回 false，get() 应返回 undefined", () => {
    fc.assert(
      fc.property(
        fc.shuffledSubarray(ALL_ARTIFACT_TYPES, { minLength: 1, maxLength: 5 }),
        fc.shuffledSubarray(ALL_ARTIFACT_TYPES, { minLength: 1, maxLength: 5 }),
        (registeredTypes, queryTypes) => {
          // 每次测试使用新的注册表实例
          const registry = new ArtifactRegistry();

          // 注册部分类型
          for (const type of registeredTypes) {
            registry.register({
              type,
              displayName: `Renderer for ${type}`,
              icon: "icon",
              component: createMockComponent(),
            });
          }

          // 验证查询结果
          for (const type of queryTypes) {
            const isRegistered = registeredTypes.includes(type);
            expect(registry.has(type)).toBe(isRegistered);
            if (isRegistered) {
              expect(registry.get(type)).toBeDefined();
            } else {
              expect(registry.get(type)).toBeUndefined();
            }
          }
        },
      ),
      { numRuns: fastCheckRuns(100) },
    );
  });

  /**
   * **Validates: Requirements 3.6**
   * getAll() 返回的数组应包含所有唯一类型的渲染器
   */
  test("getAll() 返回的数组应包含所有唯一类型的渲染器", () => {
    fc.assert(
      fc.property(uniqueTypeRegistrationSequenceArb, (entries) => {
        // 每次测试使用新的注册表实例
        const registry = new ArtifactRegistry();

        // 注册所有渲染器
        for (const entry of entries) {
          registry.register(entry);
        }

        const allEntries = registry.getAll();

        // 验证返回的类型都是唯一的
        const types = allEntries.map((e) => e.type);
        const uniqueTypes = new Set(types);
        expect(uniqueTypes.size).toBe(types.length);

        // 验证每个返回的条目都可以通过 get() 获取
        for (const entry of allEntries) {
          const retrieved = registry.get(entry.type);
          expect(retrieved).toBe(entry);
        }
      }),
      { numRuns: fastCheckRuns(100) },
    );
  });
});

// ============================================================================
// 辅助属性测试：isCanvasType 和 getFileExtension
// ============================================================================

describe("注册表辅助方法", () => {
  /**
   * isCanvasType 应正确识别 Canvas 类型
   */
  test("isCanvasType 应正确识别 Canvas 类型", () => {
    fc.assert(
      fc.property(canvasTypeArb, (type) => {
        const registry = new ArtifactRegistry();
        expect(registry.isCanvasType(type)).toBe(true);
      }),
      { numRuns: fastCheckRuns(50) },
    );
  });

  /**
   * isCanvasType 应正确识别非 Canvas 类型
   */
  test("isCanvasType 应正确识别非 Canvas 类型", () => {
    fc.assert(
      fc.property(lightweightTypeArb, (type) => {
        const registry = new ArtifactRegistry();
        expect(registry.isCanvasType(type)).toBe(false);
      }),
      { numRuns: fastCheckRuns(50) },
    );
  });

  /**
   * getFileExtension 应返回注册的扩展名或默认值
   */
  test("getFileExtension 应返回注册的扩展名或默认值", () => {
    fc.assert(
      fc.property(
        artifactTypeArb,
        fileExtensionArb,
        (type, customExtension) => {
          const registry = new ArtifactRegistry();

          // 未注册时应返回默认扩展名
          const defaultExt = registry.getFileExtension(type);
          expect(typeof defaultExt).toBe("string");
          expect(defaultExt.length).toBeGreaterThan(0);

          // 注册带自定义扩展名的渲染器
          registry.register({
            type,
            displayName: "Test",
            icon: "icon",
            component: createMockComponent(),
            fileExtension: customExtension,
          });

          // 应返回自定义扩展名
          expect(registry.getFileExtension(type)).toBe(customExtension);
        },
      ),
      { numRuns: fastCheckRuns(100) },
    );
  });

  /**
   * getFileExtension 未指定扩展名时应返回默认值
   */
  test("getFileExtension 未指定扩展名时应返回默认值", () => {
    fc.assert(
      fc.property(artifactTypeArb, (type) => {
        const registry = new ArtifactRegistry();

        // 注册不带扩展名的渲染器
        registry.register({
          type,
          displayName: "Test",
          icon: "icon",
          component: createMockComponent(),
          // 不指定 fileExtension
        });

        // 应返回默认扩展名
        const ext = registry.getFileExtension(type);
        expect(typeof ext).toBe("string");
        expect(ext.length).toBeGreaterThan(0);
      }),
      { numRuns: fastCheckRuns(100) },
    );
  });
});
