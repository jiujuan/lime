import { describe, it, expect } from "vitest";
import { mergeIncrementalTextWithOverlap } from "./contentPartTimeline";

describe("mergeIncrementalTextWithOverlap - 修复后", () => {
  it("应该处理空字符串", () => {
    expect(mergeIncrementalTextWithOverlap("", "hello")).toBe("hello");
    expect(mergeIncrementalTextWithOverlap("hello", "")).toBe("hello");
    expect(mergeIncrementalTextWithOverlap("", "")).toBe("");
  });

  it("应该检测并移除尾部重叠", () => {
    // 有 10 字符重叠
    expect(mergeIncrementalTextWithOverlap(
      "Hello World!",
      "World! How are you?"
    )).toBe("Hello World! How are you?");

    // 有 15 字符重叠
    expect(mergeIncrementalTextWithOverlap(
      "This is a test message",
      "test message for you"
    )).toBe("This is a test message for you");
  });

  it("应该检测小重叠", () => {
    // 有 2 字符重叠
    expect(mergeIncrementalTextWithOverlap(
      "Hello",
      "lo World"
    )).toBe("Hello World");
  });

  it("不应该因为包含关系而替换整个 base（修复前的问题）", () => {
    // 修复前：chunk.startsWith(base) 会返回 chunk，导致视觉刷新
    // 修复后：检测到完整的 5 字符重叠，正确处理
    const base = "Hello";
    const chunk = "Hello World";
    const result = mergeIncrementalTextWithOverlap(base, chunk);

    // 应该检测到 "Hello" 重叠并正确合并
    expect(result).toBe("Hello World");
  });

  it("应该限制重叠检测的最大长度为 100 字符", () => {
    const longBase = "A".repeat(200) + "B".repeat(50);
    const longChunk = "B".repeat(50) + "C".repeat(100);

    // 只检测最多 100 字符的重叠
    const result = mergeIncrementalTextWithOverlap(longBase, longChunk);
    expect(result).toBe(longBase + "C".repeat(100));
  });

  it("应该处理流式文本增量累积场景", () => {
    let accumulated = "";

    // 模拟流式接收
    accumulated = mergeIncrementalTextWithOverlap(accumulated, "Hello ");
    expect(accumulated).toBe("Hello ");

    accumulated = mergeIncrementalTextWithOverlap(accumulated, "llo World");
    expect(accumulated).toBe("Hello World");

    accumulated = mergeIncrementalTextWithOverlap(accumulated, "orld! How");
    expect(accumulated).toBe("Hello World! How");

    accumulated = mergeIncrementalTextWithOverlap(accumulated, "! How are you?");
    expect(accumulated).toBe("Hello World! How are you?");
  });

  it("应该处理没有重叠的情况", () => {
    expect(mergeIncrementalTextWithOverlap(
      "First sentence.",
      " Second sentence."
    )).toBe("First sentence. Second sentence.");
  });

  it("应该处理中文文本", () => {
    let accumulated = "";
    accumulated = mergeIncrementalTextWithOverlap(accumulated, "你好，世界！");
    expect(accumulated).toBe("你好，世界！");

    accumulated = mergeIncrementalTextWithOverlap(accumulated, "界！这是一个测试");
    expect(accumulated).toBe("你好，世界！这是一个测试");
  });
});
