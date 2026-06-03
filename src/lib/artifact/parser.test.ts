/**
 * @file Artifact 解析器属性测试
 * @description 使用 fast-check 进行属性测试，验证解析器的正确性、流式一致性和往返一致性
 * @module lib/artifact/parser.test
 * @requirements 2.1, 2.2, 2.3, 2.4, 2.6, 2.7
 */

import { describe, test, expect } from "vitest";
import * as fc from "fast-check";
import { fastCheckRuns } from "../../test/fastCheckRuns";
import {
  ArtifactParser,
  serializeArtifact,
  artifactContentEqual,
  artifactsEqual,
} from "./parser";
import type { Artifact } from "./types";
import { ALL_ARTIFACT_TYPES, LIGHTWEIGHT_ARTIFACT_TYPES } from "./types";

// ============================================================================
// 自定义生成器 (Arbitraries)
// ============================================================================

const SAFE_CHARS =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 _-";

const artifactTypeArb = fc.constantFrom(...LIGHTWEIGHT_ARTIFACT_TYPES);

const languageArb = fc.constantFrom(
  "typescript",
  "javascript",
  "python",
  "rust",
  "go",
  "java",
  "html",
  "css",
  "",
);

const safeTitleArb = fc
  .array(fc.constantFrom(...SAFE_CHARS.split("")), {
    minLength: 1,
    maxLength: 20,
  })
  .map((chars) => chars.join(""));

const safeContentArb = fc
  .string({ minLength: 0, maxLength: 100 })
  .map((s) => s.replace(/```/g, "---").replace(/\r/g, ""));

const artifactArb = fc
  .record({
    type: artifactTypeArb,
    title: safeTitleArb,
    content: safeContentArb,
    language: languageArb,
  })
  .map(
    ({ type, title, content, language }): Artifact => ({
      id: crypto.randomUUID(),
      type,
      title,
      content,
      status: "complete",
      meta: language ? { language } : {},
      position: { start: 0, end: 0 },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );

const artifactFenceArb = fc
  .record({
    type: artifactTypeArb,
    title: safeTitleArb,
    content: safeContentArb,
    language: languageArb,
  })
  .map(({ type, title, content, language }) => {
    const attrs = [`type="${type}"`];
    if (language) attrs.push(`language="${language}"`);
    if (title) attrs.push(`title="${title}"`);
    return `\`\`\`artifact ${attrs.join(" ")}\n${content}\n\`\`\``;
  });

const codeFenceArb = fc
  .record({ language: languageArb, content: safeContentArb })
  .map(({ language, content }) => `\`\`\`${language}\n${content}\n\`\`\``);

const mixedTextArb = fc
  .array(
    fc.oneof(
      fc
        .string({ minLength: 1, maxLength: 30 })
        .map((s) => s.replace(/```/g, "---").replace(/\r/g, "")),
      artifactFenceArb,
      codeFenceArb,
    ),
    { minLength: 1, maxLength: 3 },
  )
  .map((parts) => parts.join("\n\n"));

const splitPointsArb = fc.array(fc.integer({ min: 1, max: 10 }), {
  minLength: 1,
  maxLength: 20,
});

// ============================================================================
// Property 2: 解析器正确性
// **Validates: Requirements 2.1, 2.2, 2.4, 2.6**
// ============================================================================

describe("Property 2: 解析器正确性", () => {
  /**
   * **Validates: Requirements 2.1, 2.4**
   * 对于任何包含有效 artifact fence 的文本，解析器应正确提取属性
   */
  test("应正确解析 artifact fence 并提取属性", () => {
    fc.assert(
      fc.property(
        artifactTypeArb,
        safeTitleArb,
        safeContentArb,
        languageArb,
        (type, title, content, language) => {
          const attrs = [`type="${type}"`];
          if (language) attrs.push(`language="${language}"`);
          if (title) attrs.push(`title="${title}"`);
          const fenceText = `\`\`\`artifact ${attrs.join(" ")}\n${content}\n\`\`\``;

          const result = ArtifactParser.parse(fenceText);

          expect(result.artifacts.length).toBe(1);
          expect(result.artifacts[0].type).toBe(type);
          expect(result.artifacts[0].content).toBe(content);
          if (language) {
            expect(result.artifacts[0].meta.language).toBe(language);
          }
          expect(result.artifacts[0].status).toBe("complete");
        },
      ),
      { numRuns: fastCheckRuns(100) },
    );
  });

  /**
   * **Validates: Requirements 2.2**
   * 标准 code fence 应被识别为 code artifact
   */
  test("应正确解析标准 code fence", () => {
    fc.assert(
      fc.property(languageArb, safeContentArb, (language, content) => {
        const fenceText = `\`\`\`${language}\n${content}\n\`\`\``;
        const result = ArtifactParser.parse(fenceText);

        expect(result.artifacts.length).toBe(1);
        expect(ALL_ARTIFACT_TYPES).toContain(result.artifacts[0].type);
        expect(result.artifacts[0].content).toBe(content);
      }),
      { numRuns: fastCheckRuns(100) },
    );
  });

  /**
   * **Validates: Requirements 2.6**
   * 解析器应正确记录每个 artifact 在原始文本中的位置
   */
  test("应正确记录 artifact 位置信息", () => {
    fc.assert(
      fc.property(artifactFenceArb, (text) => {
        const result = ArtifactParser.parse(text);

        // 单个 artifact 的位置验证
        expect(result.artifacts.length).toBe(1);
        const artifact = result.artifacts[0];
        expect(artifact.position.start).toBeGreaterThanOrEqual(0);
        expect(artifact.position.end).toBeGreaterThan(artifact.position.start);
        expect(artifact.position.end).toBeLessThanOrEqual(text.length + 1);
      }),
      { numRuns: fastCheckRuns(100) },
    );
  });
});

// ============================================================================
// Property 3: 流式解析一致性
// **Validates: Requirements 2.3**
// ============================================================================

describe("Property 3: 流式解析一致性", () => {
  /**
   * **Validates: Requirements 2.3**
   * 将文本分割成任意大小的块进行流式解析，结果应与一次性解析一致
   */
  test("流式解析结果应与一次性解析一致", () => {
    fc.assert(
      fc.property(artifactFenceArb, splitPointsArb, (text, splits) => {
        const fullResult = ArtifactParser.parse(text);

        const parser = new ArtifactParser();
        let pos = 0;
        for (const size of splits) {
          if (pos >= text.length) break;
          parser.append(text.slice(pos, pos + size));
          pos += size;
        }
        if (pos < text.length) {
          parser.append(text.slice(pos));
        }
        const streamResult = parser.finalize();

        expect(streamResult.artifacts.length).toBe(fullResult.artifacts.length);
        if (fullResult.artifacts.length > 0) {
          expect(
            artifactsEqual(fullResult.artifacts, streamResult.artifacts),
          ).toBe(true);
        }
      }),
      { numRuns: fastCheckRuns(100) },
    );
  });

  /**
   * **Validates: Requirements 2.3**
   * 流式解析混合文本应与一次性解析一致
   */
  test("流式解析混合文本应与一次性解析一致", () => {
    fc.assert(
      fc.property(mixedTextArb, splitPointsArb, (text, splits) => {
        const fullResult = ArtifactParser.parse(text);

        const parser = new ArtifactParser();
        let pos = 0;
        for (const size of splits) {
          if (pos >= text.length) break;
          parser.append(text.slice(pos, pos + size));
          pos += size;
        }
        if (pos < text.length) {
          parser.append(text.slice(pos));
        }
        const streamResult = parser.finalize();

        expect(streamResult.artifacts.length).toBe(fullResult.artifacts.length);
        expect(
          artifactsEqual(fullResult.artifacts, streamResult.artifacts),
        ).toBe(true);
      }),
      { numRuns: fastCheckRuns(100) },
    );
  });

  /**
   * **Validates: Requirements 2.3**
   * 单字符流式解析应与一次性解析一致（极端情况）
   */
  test("单字符流式解析应与一次性解析一致", () => {
    fc.assert(
      fc.property(artifactFenceArb, (text) => {
        const fullResult = ArtifactParser.parse(text);

        const parser = new ArtifactParser();
        for (const char of text) {
          parser.append(char);
        }
        const streamResult = parser.finalize();

        expect(streamResult.artifacts.length).toBe(fullResult.artifacts.length);
        expect(
          artifactsEqual(fullResult.artifacts, streamResult.artifacts),
        ).toBe(true);
      }),
      { numRuns: fastCheckRuns(50) },
    );
  });
});

// ============================================================================
// Property 4: 解析器往返一致性
// **Validates: Requirements 2.7**
// ============================================================================

describe("Property 4: 解析器往返一致性", () => {
  /**
   * **Validates: Requirements 2.7**
   * 对于任何有效的 Artifact 对象，序列化后再解析应得到等价结果
   */
  test("解析后序列化再解析应得到等价结果", () => {
    fc.assert(
      fc.property(artifactArb, (artifact) => {
        const serialized = serializeArtifact(artifact);
        const parsed = ArtifactParser.parse(serialized);

        expect(parsed.artifacts.length).toBe(1);
        expect(artifactContentEqual(artifact, parsed.artifacts[0])).toBe(true);
      }),
      { numRuns: fastCheckRuns(100) },
    );
  });

  /**
   * **Validates: Requirements 2.7**
   * 双重往返：序列化 -> 解析 -> 序列化 -> 解析 应保持一致
   */
  test("双重往返应保持一致", () => {
    fc.assert(
      fc.property(artifactArb, (artifact) => {
        const serialized1 = serializeArtifact(artifact);
        const parsed1 = ArtifactParser.parse(serialized1);
        if (parsed1.artifacts.length !== 1) return true;

        const serialized2 = serializeArtifact(parsed1.artifacts[0]);
        const parsed2 = ArtifactParser.parse(serialized2);

        expect(parsed2.artifacts.length).toBe(1);
        expect(
          artifactContentEqual(parsed1.artifacts[0], parsed2.artifacts[0]),
        ).toBe(true);
      }),
      { numRuns: fastCheckRuns(100) },
    );
  });

  /**
   * **Validates: Requirements 2.7**
   * 序列化应保留 artifact 类型
   */
  test("序列化应保留 artifact 类型", () => {
    fc.assert(
      fc.property(artifactTypeArb, safeContentArb, (type, content) => {
        const artifact: Artifact = {
          id: crypto.randomUUID(),
          type,
          title: "Test",
          content,
          status: "complete",
          meta: {},
          position: { start: 0, end: 0 },
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        const serialized = serializeArtifact(artifact);
        const parsed = ArtifactParser.parse(serialized);

        expect(parsed.artifacts.length).toBe(1);
        expect(parsed.artifacts[0].type).toBe(type);
      }),
      { numRuns: fastCheckRuns(100) },
    );
  });

  /**
   * **Validates: Requirements 2.7**
   * 序列化应保留语言元数据
   */
  test("序列化应保留语言元数据", () => {
    fc.assert(
      fc.property(
        languageArb.filter((l) => l.length > 0),
        safeContentArb,
        (language, content) => {
          const artifact: Artifact = {
            id: crypto.randomUUID(),
            type: "code",
            title: "Test",
            content,
            status: "complete",
            meta: { language },
            position: { start: 0, end: 0 },
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };

          const serialized = serializeArtifact(artifact);
          const parsed = ArtifactParser.parse(serialized);

          expect(parsed.artifacts.length).toBe(1);
          expect(parsed.artifacts[0].meta.language).toBe(language);
        },
      ),
      { numRuns: fastCheckRuns(100) },
    );
  });
});
