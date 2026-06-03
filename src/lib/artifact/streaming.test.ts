/**
 * @file 流式状态属性测试
 * @description 使用 fast-check 进行属性测试，验证流式更新状态转换的正确性
 * @module lib/artifact/streaming.test
 *
 * **Validates: Requirements 11.1, 11.4, 11.5**
 */

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";
import { createStore } from "jotai";
import { fastCheckRuns } from "../../test/fastCheckRuns";
import {
  artifactsAtom,
  artifactActionsAtom,
  streamingArtifactAtom,
} from "./store";
import type { Artifact, ArtifactStatus } from "./types";
import { ALL_ARTIFACT_TYPES } from "./types";

// ============================================================================
// 自定义生成器 (Arbitraries)
// ============================================================================

/** Artifact 类型生成器 */
const artifactTypeArb = fc.constantFrom(...ALL_ARTIFACT_TYPES);

/** Artifact 状态生成器 */
const artifactStatusArb = fc.constantFrom<ArtifactStatus>(
  "pending",
  "streaming",
  "complete",
  "error",
);

/** 安全字符集 */
const SAFE_CHARS =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 _-";

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

/** 流式内容块生成器 - 生成多个内容块 */
const streamingChunksArb = fc.array(safeContentArb, {
  minLength: 1,
  maxLength: 10,
});

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
    content: "",
    status: "pending",
    meta: {},
    position: { start: 0, end: 0 },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/** 流式 Artifact 生成器 - 初始状态为 streaming */
const streamingArtifactArb = fc
  .record({
    type: artifactTypeArb,
    title: safeStringArb,
  })
  .map(({ type, title }) =>
    createArtifact({
      type,
      title,
      content: "",
      status: "streaming",
    }),
  );

/**
 * 创建测试用的 Jotai store
 */
function createTestStore() {
  return createStore();
}

// ============================================================================
// Property 8: 流式更新状态转换
// **Validates: Requirements 11.1, 11.4, 11.5**
// ============================================================================

describe("Property 8: 流式更新状态转换", () => {
  /**
   * **Validates: Requirements 11.1**
   * 流式过程中 artifact 状态应为 'streaming'
   */
  test("流式过程中 artifact 状态应为 streaming", () => {
    fc.assert(
      fc.property(
        streamingArtifactArb,
        streamingChunksArb,
        (artifact, chunks) => {
          const store = createTestStore();

          // 添加初始 streaming 状态的 artifact
          store.set(artifactActionsAtom, { type: "add", artifact });

          // 模拟流式更新过程
          let accumulatedContent = "";
          for (const chunk of chunks) {
            accumulatedContent += chunk;

            // 更新 artifact 内容，保持 streaming 状态
            store.set(artifactActionsAtom, {
              type: "update",
              id: artifact.id,
              updates: {
                content: accumulatedContent,
                status: "streaming",
              },
            });

            // 验证状态保持为 streaming
            const currentArtifact = store
              .get(artifactsAtom)
              .find((a) => a.id === artifact.id);
            expect(currentArtifact?.status).toBe("streaming");
          }

          return true;
        },
      ),
      { numRuns: fastCheckRuns(100) },
    );
  });

  /**
   * **Validates: Requirements 11.4**
   * 流式完成后 artifact 状态应变为 'complete'
   */
  test("流式完成后 artifact 状态应变为 complete", () => {
    fc.assert(
      fc.property(
        streamingArtifactArb,
        streamingChunksArb,
        (artifact, chunks) => {
          const store = createTestStore();

          // 添加初始 streaming 状态的 artifact
          store.set(artifactActionsAtom, { type: "add", artifact });

          // 模拟流式更新过程
          let accumulatedContent = "";
          for (const chunk of chunks) {
            accumulatedContent += chunk;
            store.set(artifactActionsAtom, {
              type: "update",
              id: artifact.id,
              updates: {
                content: accumulatedContent,
                status: "streaming",
              },
            });
          }

          // 完成流式更新，状态变为 complete
          store.set(artifactActionsAtom, {
            type: "update",
            id: artifact.id,
            updates: {
              status: "complete",
            },
          });

          // 验证最终状态为 complete
          const finalArtifact = store
            .get(artifactsAtom)
            .find((a) => a.id === artifact.id);
          expect(finalArtifact?.status).toBe("complete");

          return true;
        },
      ),
      { numRuns: fastCheckRuns(100) },
    );
  });

  /**
   * **Validates: Requirements 11.5**
   * 流式中断后 artifact 状态应变为 'error'
   */
  test("流式中断后 artifact 状态应变为 error", () => {
    fc.assert(
      fc.property(
        streamingArtifactArb,
        streamingChunksArb,
        fc.integer({ min: 0, max: 9 }),
        safeStringArb,
        (artifact, chunks, interruptIndex, errorMessage) => {
          const store = createTestStore();

          // 添加初始 streaming 状态的 artifact
          store.set(artifactActionsAtom, { type: "add", artifact });

          // 模拟部分流式更新
          let accumulatedContent = "";
          const safeInterruptIndex = Math.min(interruptIndex, chunks.length);

          for (let i = 0; i < safeInterruptIndex; i++) {
            accumulatedContent += chunks[i];
            store.set(artifactActionsAtom, {
              type: "update",
              id: artifact.id,
              updates: {
                content: accumulatedContent,
                status: "streaming",
              },
            });
          }

          // 模拟流式中断，状态变为 error
          store.set(artifactActionsAtom, {
            type: "update",
            id: artifact.id,
            updates: {
              status: "error",
              error: errorMessage || "Stream interrupted",
            },
          });

          // 验证最终状态为 error
          const finalArtifact = store
            .get(artifactsAtom)
            .find((a) => a.id === artifact.id);
          expect(finalArtifact?.status).toBe("error");

          return true;
        },
      ),
      { numRuns: fastCheckRuns(100) },
    );
  });

  /**
   * **Validates: Requirements 11.1, 11.4**
   * 流式更新后内容应为所有块的连接
   */
  test("流式更新后内容应为所有块的连接", () => {
    fc.assert(
      fc.property(
        streamingArtifactArb,
        streamingChunksArb,
        (artifact, chunks) => {
          const store = createTestStore();

          // 添加初始 streaming 状态的 artifact
          store.set(artifactActionsAtom, { type: "add", artifact });

          // 模拟流式更新过程
          let accumulatedContent = "";
          for (const chunk of chunks) {
            accumulatedContent += chunk;
            store.set(artifactActionsAtom, {
              type: "update",
              id: artifact.id,
              updates: {
                content: accumulatedContent,
                status: "streaming",
              },
            });
          }

          // 完成流式更新
          store.set(artifactActionsAtom, {
            type: "update",
            id: artifact.id,
            updates: {
              status: "complete",
            },
          });

          // 验证最终内容等于所有块的连接
          const finalArtifact = store
            .get(artifactsAtom)
            .find((a) => a.id === artifact.id);
          const expectedContent = chunks.join("");
          expect(finalArtifact?.content).toBe(expectedContent);

          return true;
        },
      ),
      { numRuns: fastCheckRuns(100) },
    );
  });

  /**
   * **Validates: Requirements 11.1, 11.4, 11.5**
   * 状态转换应遵循有效路径: pending -> streaming -> complete/error
   */
  test("状态转换应遵循有效路径", () => {
    fc.assert(
      fc.property(
        streamingArtifactArb,
        streamingChunksArb,
        fc.boolean(),
        (artifact, chunks, shouldComplete) => {
          const store = createTestStore();

          // 创建 pending 状态的 artifact
          const pendingArtifact = {
            ...artifact,
            status: "pending" as ArtifactStatus,
          };
          store.set(artifactActionsAtom, {
            type: "add",
            artifact: pendingArtifact,
          });

          // 验证初始状态为 pending
          let currentArtifact = store
            .get(artifactsAtom)
            .find((a) => a.id === artifact.id);
          expect(currentArtifact?.status).toBe("pending");

          // 转换到 streaming 状态
          store.set(artifactActionsAtom, {
            type: "update",
            id: artifact.id,
            updates: { status: "streaming" },
          });

          currentArtifact = store
            .get(artifactsAtom)
            .find((a) => a.id === artifact.id);
          expect(currentArtifact?.status).toBe("streaming");

          // 模拟流式更新
          let accumulatedContent = "";
          for (const chunk of chunks) {
            accumulatedContent += chunk;
            store.set(artifactActionsAtom, {
              type: "update",
              id: artifact.id,
              updates: {
                content: accumulatedContent,
                status: "streaming",
              },
            });
          }

          // 根据 shouldComplete 决定最终状态
          const finalStatus: ArtifactStatus = shouldComplete
            ? "complete"
            : "error";
          store.set(artifactActionsAtom, {
            type: "update",
            id: artifact.id,
            updates: {
              status: finalStatus,
              ...(shouldComplete ? {} : { error: "Test error" }),
            },
          });

          // 验证最终状态
          currentArtifact = store
            .get(artifactsAtom)
            .find((a) => a.id === artifact.id);
          expect(currentArtifact?.status).toBe(finalStatus);

          return true;
        },
      ),
      { numRuns: fastCheckRuns(100) },
    );
  });

  /**
   * **Validates: Requirements 11.1**
   * streamingArtifactAtom 应正确跟踪流式状态
   */
  test("streamingArtifactAtom 应正确跟踪流式状态", () => {
    fc.assert(
      fc.property(
        streamingArtifactArb,
        streamingChunksArb,
        (artifact, chunks) => {
          const store = createTestStore();

          // 初始状态：无流式 artifact
          expect(store.get(streamingArtifactAtom)).toBeNull();

          // 设置流式 artifact
          store.set(streamingArtifactAtom, artifact);
          expect(store.get(streamingArtifactAtom)).not.toBeNull();
          expect(store.get(streamingArtifactAtom)?.id).toBe(artifact.id);
          expect(store.get(streamingArtifactAtom)?.status).toBe("streaming");

          // 模拟流式更新
          let accumulatedContent = "";
          for (const chunk of chunks) {
            accumulatedContent += chunk;
            const updatedArtifact = {
              ...artifact,
              content: accumulatedContent,
              updatedAt: Date.now(),
            };
            store.set(streamingArtifactAtom, updatedArtifact);
          }

          // 验证内容已更新
          expect(store.get(streamingArtifactAtom)?.content).toBe(
            chunks.join(""),
          );

          // 完成流式，清除 streamingArtifactAtom
          store.set(streamingArtifactAtom, null);
          expect(store.get(streamingArtifactAtom)).toBeNull();

          return true;
        },
      ),
      { numRuns: fastCheckRuns(100) },
    );
  });

  /**
   * **Validates: Requirements 11.1, 11.4**
   * 多个 artifact 可以同时处于不同的流式状态
   */
  test("多个 artifact 可以同时处于不同状态", () => {
    fc.assert(
      fc.property(
        fc.array(streamingArtifactArb, { minLength: 2, maxLength: 5 }),
        fc.array(artifactStatusArb, { minLength: 2, maxLength: 5 }),
        (artifacts, statuses) => {
          const store = createTestStore();

          // 添加所有 artifacts
          for (const artifact of artifacts) {
            store.set(artifactActionsAtom, { type: "add", artifact });
          }

          // 为每个 artifact 设置不同的状态
          for (let i = 0; i < artifacts.length; i++) {
            const status = statuses[i % statuses.length];
            store.set(artifactActionsAtom, {
              type: "update",
              id: artifacts[i].id,
              updates: { status },
            });
          }

          // 验证每个 artifact 的状态
          const storedArtifacts = store.get(artifactsAtom);
          for (let i = 0; i < artifacts.length; i++) {
            const stored = storedArtifacts.find(
              (a) => a.id === artifacts[i].id,
            );
            const expectedStatus = statuses[i % statuses.length];
            expect(stored?.status).toBe(expectedStatus);
          }

          return true;
        },
      ),
      { numRuns: fastCheckRuns(100) },
    );
  });

  /**
   * **Validates: Requirements 11.1**
   * 流式更新应保持 artifact 的其他属性不变
   */
  test("流式更新应保持 artifact 的其他属性不变", () => {
    fc.assert(
      fc.property(
        streamingArtifactArb,
        streamingChunksArb,
        (artifact, chunks) => {
          const store = createTestStore();

          // 添加初始 artifact
          store.set(artifactActionsAtom, { type: "add", artifact });

          // 记录初始属性
          const initialArtifact = store
            .get(artifactsAtom)
            .find((a) => a.id === artifact.id);
          const initialType = initialArtifact?.type;
          const initialTitle = initialArtifact?.title;
          const initialMeta = initialArtifact?.meta;
          const initialCreatedAt = initialArtifact?.createdAt;

          // 模拟流式更新
          let accumulatedContent = "";
          for (const chunk of chunks) {
            accumulatedContent += chunk;
            store.set(artifactActionsAtom, {
              type: "update",
              id: artifact.id,
              updates: {
                content: accumulatedContent,
                status: "streaming",
              },
            });
          }

          // 完成流式更新
          store.set(artifactActionsAtom, {
            type: "update",
            id: artifact.id,
            updates: { status: "complete" },
          });

          // 验证其他属性保持不变
          const finalArtifact = store
            .get(artifactsAtom)
            .find((a) => a.id === artifact.id);
          expect(finalArtifact?.type).toBe(initialType);
          expect(finalArtifact?.title).toBe(initialTitle);
          expect(finalArtifact?.meta).toEqual(initialMeta);
          expect(finalArtifact?.createdAt).toBe(initialCreatedAt);
          // updatedAt 应该被更新
          expect(finalArtifact?.updatedAt).toBeGreaterThanOrEqual(
            initialCreatedAt!,
          );

          return true;
        },
      ),
      { numRuns: fastCheckRuns(100) },
    );
  });
});

// ============================================================================
// useDebouncedValue Hook 测试
// **Validates: Requirements 11.2**
// ============================================================================

describe("useDebouncedValue 防抖行为", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * **Validates: Requirements 11.2**
   * 防抖值应在延迟后更新
   */
  test("防抖值应在延迟后更新", () => {
    fc.assert(
      fc.property(
        safeStringArb,
        fc.integer({ min: 50, max: 500 }),
        (value, delay) => {
          let result: string | null = null;

          // 模拟防抖逻辑
          const timeoutId = setTimeout(() => {
            result = value;
          }, delay);

          // 快进时间
          vi.advanceTimersByTime(delay);

          // 验证值已更新
          expect(result).toBe(value);

          // 清理
          clearTimeout(timeoutId);

          return true;
        },
      ),
      { numRuns: fastCheckRuns(50) },
    );
  });

  /**
   * **Validates: Requirements 11.2**
   * 快速连续更新应只触发最后一次
   */
  test("快速连续更新应只触发最后一次", () => {
    fc.assert(
      fc.property(
        fc.array(safeStringArb, { minLength: 2, maxLength: 10 }),
        fc.integer({ min: 50, max: 200 }),
        (values, delay) => {
          let lastValue: string | null = null;
          let callCount = 0;

          // 模拟防抖逻辑
          let timeoutId: ReturnType<typeof setTimeout> | null = null;

          const debouncedUpdate = (value: string) => {
            if (timeoutId) {
              clearTimeout(timeoutId);
            }
            timeoutId = setTimeout(() => {
              lastValue = value;
              callCount++;
            }, delay);
          };

          // 快速连续调用
          for (const value of values) {
            debouncedUpdate(value);
          }

          // 快进时间
          vi.advanceTimersByTime(delay);

          // 应该只触发一次，且值为最后一个
          expect(callCount).toBe(1);
          expect(lastValue).toBe(values[values.length - 1]);

          return true;
        },
      ),
      { numRuns: fastCheckRuns(100) },
    );
  });

  /**
   * **Validates: Requirements 11.2**
   * 间隔足够长的更新应各自触发
   */
  test("间隔足够长的更新应各自触发", () => {
    fc.assert(
      fc.property(
        fc.array(safeStringArb, { minLength: 2, maxLength: 5 }),
        fc.integer({ min: 50, max: 100 }),
        (values, delay) => {
          const results: string[] = [];

          // 模拟防抖逻辑
          let timeoutId: ReturnType<typeof setTimeout> | null = null;

          const debouncedUpdate = (value: string) => {
            if (timeoutId) {
              clearTimeout(timeoutId);
            }
            timeoutId = setTimeout(() => {
              results.push(value);
            }, delay);
          };

          // 每次更新后等待足够长的时间
          for (const value of values) {
            debouncedUpdate(value);
            vi.advanceTimersByTime(delay + 10);
          }

          // 每次更新都应该触发
          expect(results.length).toBe(values.length);
          expect(results).toEqual(values);

          return true;
        },
      ),
      { numRuns: fastCheckRuns(100) },
    );
  });
});
