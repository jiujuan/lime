/* global process */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();

function readRepoFile(path: string): string {
  return readFileSync(join(REPO_ROOT, path), "utf8");
}

describe("knowledge current boundary", () => {
  it("Knowledge detail 前端网关必须走 App Server knowledgePack/read", () => {
    const source = readRepoFile("src/lib/api/knowledge.ts");
    const getKnowledgePackStart = source.indexOf("export async function getKnowledgePack(");
    const importKnowledgeSourceStart = source.indexOf(
      "export async function importKnowledgeSource(",
    );

    expect(getKnowledgePackStart).toBeGreaterThanOrEqual(0);
    expect(importKnowledgeSourceStart).toBeGreaterThan(getKnowledgePackStart);

    const getKnowledgePackSource = source.slice(
      getKnowledgePackStart,
      importKnowledgeSourceStart,
    );

    expect(getKnowledgePackSource).toContain("METHOD_KNOWLEDGE_PACK_READ");
    expect(getKnowledgePackSource).toContain("requestKnowledgeAppServer");
    expect(getKnowledgePackSource).not.toContain("invokeKnowledgeCommand");
    expect(getKnowledgePackSource).not.toContain("knowledge_get_pack");
    expect(getKnowledgePackSource).not.toContain("safeInvoke");
  });

  it("Knowledge 前端网关必须全量走 App Server current method", () => {
    const source = readRepoFile("src/lib/api/knowledge.ts");

    for (const method of [
      "METHOD_KNOWLEDGE_PACK_LIST",
      "METHOD_KNOWLEDGE_PACK_READ",
      "METHOD_KNOWLEDGE_SOURCE_IMPORT",
      "METHOD_KNOWLEDGE_PACK_COMPILE",
      "METHOD_KNOWLEDGE_PACK_DEFAULT_SET",
      "METHOD_KNOWLEDGE_PACK_STATUS_UPDATE",
      "METHOD_KNOWLEDGE_CONTEXT_RESOLVE",
      "METHOD_KNOWLEDGE_CONTEXT_RUN_VALIDATE",
    ]) {
      expect(source).toContain(method);
    }
    for (const legacyCommand of [
      "knowledge_list_packs",
      "knowledge_get_pack",
      "knowledge_import_source",
      "knowledge_compile_pack",
      "knowledge_set_default_pack",
      "knowledge_update_pack_status",
      "knowledge_resolve_context",
      "knowledge_validate_context_run",
    ]) {
      expect(source).not.toContain(legacyCommand);
    }
    expect(source).not.toContain("safeInvoke");
    expect(source).not.toContain("invokeKnowledgeCommand");
  });

  it("Knowledge UI 只能通过 API 网关读取详情，不能直接 gate legacy command", () => {
    const source = readRepoFile("src/features/knowledge/KnowledgePage.tsx");

    expect(source).toContain("getKnowledgePack(");
    expect(source).not.toContain('supportsCommand("knowledge_get_pack")');
    expect(source).not.toContain("safeInvoke");
    expect(source).not.toContain("knowledge_get_pack");
  });

  it("production command 边界守卫不应继续允许 Knowledge legacy gate", () => {
    const source = readRepoFile(
      "src/components/production-command-current-boundary.test.ts",
    );

    expect(source).not.toContain("src/features/knowledge/KnowledgePage.tsx");
    expect(source).not.toContain('"knowledge_get_pack"');
  });
});
