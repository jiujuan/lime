/**
 * @file Artifact 状态管理属性测试
 * @description 使用 fast-check 进行属性测试，验证 Artifact ID 唯一性和状态管理操作正确性
 * @module lib/artifact/store.test
 * @requirements 1.3, 9.4
 */

import { describe, test, expect } from "vitest";
import * as fc from "fast-check";
import { createStore } from "jotai";
import { fastCheckRuns } from "../../test/fastCheckRuns";
import {
  artifactsAtom,
  selectedArtifactIdAtom,
  selectedArtifactAtom,
  artifactActionsAtom,
  type ArtifactAction,
} from "./store";
import type { Artifact, ArtifactStatus } from "./types";
import { ALL_ARTIFACT_TYPES } from "./types";

// ============================================================================
// 自定义生成器 (Arbitraries)
// ============================================================================

/** 安全字符集 */
const SAFE_CHARS =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 _-";

/** Artifact 类型生成器 */
const artifactTypeArb = fc.constantFrom(...ALL_ARTIFACT_TYPES);

/** Artifact 状态生成器 */
const artifactStatusArb = fc.constantFrom<ArtifactStatus>(
  "pending",
  "streaming",
  "complete",
  "error",
);

/** 安全字符串生成器 */
const safeStringArb = fc
  .array(fc.constantFrom(...SAFE_CHARS.split("")), {
    minLength: 1,
    maxLength: 20,
  })
  .map((chars) => chars.join(""));

/** 安全内容生成器 */
const safeContentArb = fc
  .string({ minLength: 0, maxLength: 100 })
  .map((s) => s.replace(/```/g, "---").replace(/\r/g, ""));

/**
 * 创建 Artifact 对象
 * @param overrides - 覆盖默认值的属性
 * @returns 新的 Artifact 对象
 */
function createArtifact(overrides: Partial<Artifact> = {}): Artifact {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    type: "code",
    title: "Test Artifact",
    content: "test content",
    status: "complete",
    meta: {},
    position: { start: 0, end: 0 },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/** Artifact 生成器 */
const artifactArb = fc
  .record({
    type: artifactTypeArb,
    title: safeStringArb,
    content: safeContentArb,
    status: artifactStatusArb,
  })
  .map(({ type, title, content, status }) =>
    createArtifact({ type, title, content, status }),
  );

/** Artifact 操作生成器 - 基于现有 artifacts 生成有效操作 */
const artifactActionArb = (
  existingIds: string[],
): fc.Arbitrary<ArtifactAction> => {
  const addAction = artifactArb.map(
    (artifact): ArtifactAction => ({
      type: "add",
      artifact,
    }),
  );

  const clearAction = fc.constant<ArtifactAction>({ type: "clear" });

  if (existingIds.length === 0) {
    // 没有现有 artifact 时，只能 add 或 clear
    return fc.oneof(addAction, clearAction);
  }

  const existingIdArb = fc.constantFrom(...existingIds);

  const updateAction = fc
    .record({
      id: existingIdArb,
      updates: fc.record({
        title: fc.option(safeStringArb, { nil: undefined }),
        content: fc.option(safeContentArb, { nil: undefined }),
        status: fc.option(artifactStatusArb, { nil: undefined }),
      }),
    })
    .map(
      ({ id, updates }): ArtifactAction => ({
        type: "update",
        id,
        updates: Object.fromEntries(
          Object.entries(updates).filter(([, v]) => v !== undefined),
        ),
      }),
    );

  const removeAction = existingIdArb.map(
    (id): ArtifactAction => ({
      type: "remove",
      id,
    }),
  );

  const selectAction = fc.oneof(existingIdArb, fc.constant(null)).map(
    (id): ArtifactAction => ({
      type: "select",
      id,
    }),
  );

  return fc.oneof(
    addAction,
    updateAction,
    removeAction,
    selectAction,
    clearAction,
  );
};

/**
 * 创建测试用的 Jotai store
 */
function createTestStore() {
  return createStore();
}

/**
 * 验证操作效果
 * @param action - 执行的操作
 * @param prevArtifacts - 操作前的 artifacts 列表
 * @param nextArtifacts - 操作后的 artifacts 列表
 * @param prevSelectedId - 操作前选中的 ID
 * @param nextSelectedId - 操作后选中的 ID
 * @returns 操作效果是否正确
 */
function verifyActionEffect(
  action: ArtifactAction,
  prevArtifacts: Artifact[],
  nextArtifacts: Artifact[],
  prevSelectedId: string | null,
  nextSelectedId: string | null,
): boolean {
  switch (action.type) {
    case "add": {
      // 检查是否已存在相同 ID
      const existingIndex = prevArtifacts.findIndex(
        (a) => a.id === action.artifact.id,
      );
      if (existingIndex >= 0) {
        // 更新现有的
        return (
          nextArtifacts.length === prevArtifacts.length &&
          nextArtifacts.some((a) => a.id === action.artifact.id)
        );
      }
      // 添加新的
      return (
        nextArtifacts.length === prevArtifacts.length + 1 &&
        nextArtifacts.some((a) => a.id === action.artifact.id)
      );
    }

    case "update": {
      const prevArtifact = prevArtifacts.find((a) => a.id === action.id);
      if (!prevArtifact) {
        // 不存在的 artifact，列表应保持不变
        return nextArtifacts.length === prevArtifacts.length;
      }
      const nextArtifact = nextArtifacts.find((a) => a.id === action.id);
      if (!nextArtifact) return false;
      // 验证更新的字段
      for (const [key, value] of Object.entries(action.updates)) {
        if (
          key !== "updatedAt" &&
          nextArtifact[key as keyof Artifact] !== value
        ) {
          return false;
        }
      }
      return nextArtifacts.length === prevArtifacts.length;
    }

    case "remove": {
      const existed = prevArtifacts.some((a) => a.id === action.id);
      if (!existed) {
        return nextArtifacts.length === prevArtifacts.length;
      }
      // 删除后列表长度减 1，且不再包含该 ID
      const removed = !nextArtifacts.some((a) => a.id === action.id);
      const lengthCorrect = nextArtifacts.length === prevArtifacts.length - 1;
      // 如果删除的是选中的，选中状态应清除
      if (prevSelectedId === action.id) {
        return removed && lengthCorrect && nextSelectedId === null;
      }
      return removed && lengthCorrect;
    }

    case "select": {
      return nextSelectedId === action.id;
    }

    case "clear": {
      return nextArtifacts.length === 0 && nextSelectedId === null;
    }

    default:
      return false;
  }
}

// ============================================================================
// Property 1: Artifact ID 唯一性
// **Validates: Requirements 1.3**
// ============================================================================

describe("Property 1: Artifact ID 唯一性", () => {
  /**
   * **Validates: Requirements 1.3**
   * 所有通过 createArtifact 创建的 Artifact 应有唯一 ID
   */
  test("所有创建的 Artifact 应有唯一 ID", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100 }), (count) => {
        const artifacts = Array.from({ length: count }, () =>
          createArtifact({ type: "code", content: "test" }),
        );
        const ids = artifacts.map((a) => a.id);
        const uniqueIds = new Set(ids);
        return uniqueIds.size === ids.length;
      }),
      { numRuns: fastCheckRuns(100) },
    );
  });

  /**
   * **Validates: Requirements 1.3**
   * 使用 artifactArb 生成的 Artifact 也应有唯一 ID
   */
  test("生成器创建的 Artifact 应有唯一 ID", () => {
    fc.assert(
      fc.property(
        fc.array(artifactArb, { minLength: 2, maxLength: 50 }),
        (artifacts) => {
          const ids = artifacts.map((a) => a.id);
          const uniqueIds = new Set(ids);
          return uniqueIds.size === ids.length;
        },
      ),
      { numRuns: fastCheckRuns(100) },
    );
  });

  /**
   * **Validates: Requirements 1.3**
   * 添加到 store 的 Artifact 应保持 ID 唯一性
   */
  test("添加到 store 的 Artifact 应保持 ID 唯一性", () => {
    fc.assert(
      fc.property(
        fc.array(artifactArb, { minLength: 1, maxLength: 20 }),
        (artifacts) => {
          const store = createTestStore();

          // 添加所有 artifacts
          for (const artifact of artifacts) {
            store.set(artifactActionsAtom, { type: "add", artifact });
          }

          const storedArtifacts = store.get(artifactsAtom);
          const ids = storedArtifacts.map((a) => a.id);
          const uniqueIds = new Set(ids);

          // 所有存储的 ID 应唯一
          return uniqueIds.size === ids.length;
        },
      ),
      { numRuns: fastCheckRuns(100) },
    );
  });
});

// ============================================================================
// Property 6: 状态管理操作正确性
// **Validates: Requirements 9.4**
// ============================================================================

describe("Property 6: 状态管理操作正确性", () => {
  /**
   * **Validates: Requirements 9.4**
   * addArtifact 后列表长度应增加 1（新 ID）或保持不变（已存在 ID）
   */
  test("addArtifact 应正确添加或更新 artifact", () => {
    fc.assert(
      fc.property(artifactArb, (artifact) => {
        const store = createTestStore();

        // 初始状态
        expect(store.get(artifactsAtom)).toHaveLength(0);

        // 添加 artifact
        store.set(artifactActionsAtom, { type: "add", artifact });

        const artifacts = store.get(artifactsAtom);
        expect(artifacts).toHaveLength(1);
        expect(artifacts[0].id).toBe(artifact.id);
        expect(artifacts[0].content).toBe(artifact.content);

        return true;
      }),
      { numRuns: fastCheckRuns(100) },
    );
  });

  /**
   * **Validates: Requirements 9.4**
   * updateArtifact 后对应 artifact 的字段应被更新
   */
  test("updateArtifact 应正确更新 artifact 字段", () => {
    fc.assert(
      fc.property(
        artifactArb,
        safeStringArb,
        safeContentArb,
        (artifact, newTitle, newContent) => {
          const store = createTestStore();

          // 添加 artifact
          store.set(artifactActionsAtom, { type: "add", artifact });

          // 更新 artifact
          store.set(artifactActionsAtom, {
            type: "update",
            id: artifact.id,
            updates: { title: newTitle, content: newContent },
          });

          const artifacts = store.get(artifactsAtom);
          expect(artifacts).toHaveLength(1);
          expect(artifacts[0].title).toBe(newTitle);
          expect(artifacts[0].content).toBe(newContent);
          // updatedAt 应被更新
          expect(artifacts[0].updatedAt).toBeGreaterThanOrEqual(
            artifact.updatedAt,
          );

          return true;
        },
      ),
      { numRuns: fastCheckRuns(100) },
    );
  });

  /**
   * **Validates: Requirements 9.4**
   * removeArtifact 后列表不再包含该 artifact
   */
  test("removeArtifact 应正确移除 artifact", () => {
    fc.assert(
      fc.property(
        fc.array(artifactArb, { minLength: 1, maxLength: 10 }),
        fc.integer({ min: 0, max: 9 }),
        (artifacts, removeIndex) => {
          const store = createTestStore();

          // 添加所有 artifacts
          for (const artifact of artifacts) {
            store.set(artifactActionsAtom, { type: "add", artifact });
          }

          const initialLength = store.get(artifactsAtom).length;
          const safeIndex = removeIndex % artifacts.length;
          const idToRemove = artifacts[safeIndex].id;

          // 移除指定 artifact
          store.set(artifactActionsAtom, { type: "remove", id: idToRemove });

          const remaining = store.get(artifactsAtom);
          expect(remaining).toHaveLength(initialLength - 1);
          expect(remaining.some((a) => a.id === idToRemove)).toBe(false);

          return true;
        },
      ),
      { numRuns: fastCheckRuns(100) },
    );
  });

  /**
   * **Validates: Requirements 9.4**
   * selectArtifact 后 selectedArtifact 应返回正确的 artifact
   */
  test("selectArtifact 应正确设置选中状态", () => {
    fc.assert(
      fc.property(
        fc.array(artifactArb, { minLength: 1, maxLength: 10 }),
        fc.integer({ min: 0, max: 9 }),
        (artifacts, selectIndex) => {
          const store = createTestStore();

          // 添加所有 artifacts
          for (const artifact of artifacts) {
            store.set(artifactActionsAtom, { type: "add", artifact });
          }

          const safeIndex = selectIndex % artifacts.length;
          const idToSelect = artifacts[safeIndex].id;

          // 选择指定 artifact
          store.set(artifactActionsAtom, { type: "select", id: idToSelect });

          expect(store.get(selectedArtifactIdAtom)).toBe(idToSelect);
          const selected = store.get(selectedArtifactAtom);
          expect(selected).not.toBeNull();
          expect(selected?.id).toBe(idToSelect);

          return true;
        },
      ),
      { numRuns: fastCheckRuns(100) },
    );
  });

  /**
   * **Validates: Requirements 9.4**
   * 删除选中的 artifact 后，选中状态应清除
   */
  test("删除选中的 artifact 后选中状态应清除", () => {
    fc.assert(
      fc.property(artifactArb, (artifact) => {
        const store = createTestStore();

        // 添加并选中 artifact
        store.set(artifactActionsAtom, { type: "add", artifact });
        store.set(artifactActionsAtom, { type: "select", id: artifact.id });

        expect(store.get(selectedArtifactIdAtom)).toBe(artifact.id);

        // 删除选中的 artifact
        store.set(artifactActionsAtom, { type: "remove", id: artifact.id });

        expect(store.get(selectedArtifactIdAtom)).toBeNull();
        expect(store.get(selectedArtifactAtom)).toBeNull();

        return true;
      }),
      { numRuns: fastCheckRuns(100) },
    );
  });

  /**
   * **Validates: Requirements 9.4**
   * clear 操作应清空所有状态
   */
  test("clear 应清空所有 artifacts 和选中状态", () => {
    fc.assert(
      fc.property(
        fc.array(artifactArb, { minLength: 1, maxLength: 10 }),
        (artifacts) => {
          const store = createTestStore();

          // 添加所有 artifacts
          for (const artifact of artifacts) {
            store.set(artifactActionsAtom, { type: "add", artifact });
          }

          // 选中第一个
          store.set(artifactActionsAtom, {
            type: "select",
            id: artifacts[0].id,
          });

          expect(store.get(artifactsAtom).length).toBeGreaterThan(0);
          expect(store.get(selectedArtifactIdAtom)).not.toBeNull();

          // 清空
          store.set(artifactActionsAtom, { type: "clear" });

          expect(store.get(artifactsAtom)).toHaveLength(0);
          expect(store.get(selectedArtifactIdAtom)).toBeNull();

          return true;
        },
      ),
      { numRuns: fastCheckRuns(100) },
    );
  });

  /**
   * **Validates: Requirements 9.4**
   * 任意操作序列应正确更新状态
   */
  test("任意操作序列应正确更新状态", () => {
    fc.assert(
      fc.property(fc.integer({ min: 5, max: 20 }), (actionCount) => {
        const store = createTestStore();
        let currentIds: string[] = [];

        for (let i = 0; i < actionCount; i++) {
          // 获取操作前状态
          const prevArtifacts = [...store.get(artifactsAtom)];
          const prevSelectedId = store.get(selectedArtifactIdAtom);

          // 生成并执行操作
          const action = fc.sample(artifactActionArb(currentIds), 1)[0];
          store.set(artifactActionsAtom, action);

          // 获取操作后状态
          const nextArtifacts = store.get(artifactsAtom);
          const nextSelectedId = store.get(selectedArtifactIdAtom);

          // 验证操作效果
          const isValid = verifyActionEffect(
            action,
            prevArtifacts,
            nextArtifacts,
            prevSelectedId,
            nextSelectedId,
          );

          if (!isValid) {
            return false;
          }

          // 更新当前 ID 列表
          currentIds = nextArtifacts.map((a) => a.id);
        }

        return true;
      }),
      { numRuns: fastCheckRuns(50) },
    );
  });

  /**
   * **Validates: Requirements 9.4**
   * 更新不存在的 artifact 应保持状态不变
   */
  test("更新不存在的 artifact 应保持状态不变", () => {
    fc.assert(
      fc.property(artifactArb, safeStringArb, (artifact, newTitle) => {
        const store = createTestStore();

        // 添加 artifact
        store.set(artifactActionsAtom, { type: "add", artifact });
        const beforeUpdate = [...store.get(artifactsAtom)];

        // 尝试更新不存在的 ID
        const nonExistentId = crypto.randomUUID();
        store.set(artifactActionsAtom, {
          type: "update",
          id: nonExistentId,
          updates: { title: newTitle },
        });

        const afterUpdate = store.get(artifactsAtom);

        // 状态应保持不变
        expect(afterUpdate).toHaveLength(beforeUpdate.length);
        expect(afterUpdate[0].title).toBe(beforeUpdate[0].title);

        return true;
      }),
      { numRuns: fastCheckRuns(100) },
    );
  });

  /**
   * **Validates: Requirements 9.4**
   * 删除不存在的 artifact 应保持状态不变
   */
  test("删除不存在的 artifact 应保持状态不变", () => {
    fc.assert(
      fc.property(artifactArb, (artifact) => {
        const store = createTestStore();

        // 添加 artifact
        store.set(artifactActionsAtom, { type: "add", artifact });
        const beforeRemove = store.get(artifactsAtom).length;

        // 尝试删除不存在的 ID
        const nonExistentId = crypto.randomUUID();
        store.set(artifactActionsAtom, { type: "remove", id: nonExistentId });

        const afterRemove = store.get(artifactsAtom).length;

        // 长度应保持不变
        expect(afterRemove).toBe(beforeRemove);

        return true;
      }),
      { numRuns: fastCheckRuns(100) },
    );
  });
});
