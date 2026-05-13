import { describe, expect, it } from "vitest";
import { resolveInputCapabilityDispatchContext } from "./inputCapabilityRouting";

describe("inputCapabilityRouting", () => {
  it("本地 installed skill route 不应生成 /local:* slash 命令", () => {
    const context = resolveInputCapabilityDispatchContext({
      sourceText: "帮我写一篇关于三国的故事",
      displayContent: "帮我写一篇关于三国的故事",
      capabilityRoute: {
        kind: "installed_skill",
        skillKey: "local:brand-product-knowledge-builder",
        skillName: "brand-product-knowledge-builder",
      },
    });

    expect(context.sourceText).toBe(
      "/brand-product-knowledge-builder 帮我写一篇关于三国的故事",
    );
    expect(context.capabilityRoute).toMatchObject({
      kind: "installed_skill",
      skillKey: "brand-product-knowledge-builder",
      skillName: "brand-product-knowledge-builder",
    });
    expect(context.completedSlashUsage).toMatchObject({
      kind: "skill",
      entryId: "brand-product-knowledge-builder",
      replayText: "帮我写一篇关于三国的故事",
    });
  });
});
