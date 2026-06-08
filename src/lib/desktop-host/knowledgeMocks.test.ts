import { describe, expect, it } from "vitest";

import { knowledgeMocks } from "./knowledgeMocks";

describe("knowledgeMocks", () => {
  it("Knowledge legacy 默认 mock 已全部退场", () => {
    for (const command of [
      "knowledge_list_packs",
      "knowledge_get_pack",
      "knowledge_import_source",
      "knowledge_compile_pack",
      "knowledge_set_default_pack",
      "knowledge_update_pack_status",
      "knowledge_resolve_context",
      "knowledge_validate_context_run",
    ]) {
      expect(knowledgeMocks).not.toHaveProperty(command);
    }
  });
});
