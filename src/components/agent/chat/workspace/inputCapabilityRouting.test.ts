import { describe, expect, it } from "vitest";
import { resolveInputCapabilityDispatchContext } from "./inputCapabilityRouting";

describe("inputCapabilityRouting", () => {
  it("已带 @配图 前缀的 builtin command route 不应重复拼接命令", () => {
    const context = resolveInputCapabilityDispatchContext({
      sourceText: "@配图 生成 一张春日咖啡馆插画",
      displayContent: "@配图 生成 一张春日咖啡馆插画",
      capabilityRoute: {
        kind: "builtin_command",
        commandKey: "image_generate",
        commandPrefix: "@配图",
      },
    });

    expect(context.sourceText).toBe("@配图 生成 一张春日咖啡馆插画");
    expect(context.capabilityRoute).toMatchObject({
      kind: "builtin_command",
      commandKey: "image_generate",
      commandPrefix: "@配图",
    });
    expect(context.completedSlashUsage).toBeNull();
  });

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
