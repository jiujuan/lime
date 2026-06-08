import { describe, expect, it } from "vitest";

import { knowledgeMocks } from "./knowledgeMocks";

describe("knowledgeMocks", () => {
  it("知识包编译不再注册伪成功默认 mock", () => {
    expect(knowledgeMocks).not.toHaveProperty("knowledge_compile_pack");
  });

  it("保留仍被显式测试夹具依赖的 Knowledge mock", () => {
    expect(knowledgeMocks).toHaveProperty("knowledge_list_packs");
    expect(knowledgeMocks).toHaveProperty("knowledge_get_pack");
    expect(knowledgeMocks).toHaveProperty("knowledge_import_source");
    expect(knowledgeMocks).toHaveProperty("knowledge_set_default_pack");
    expect(knowledgeMocks).toHaveProperty("knowledge_update_pack_status");
    expect(knowledgeMocks).toHaveProperty("knowledge_resolve_context");
    expect(knowledgeMocks).toHaveProperty("knowledge_validate_context_run");
  });
});
