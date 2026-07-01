import { describe, expect, it } from "vitest";
import type { InputbarPluginCapability } from "../components/Inputbar/pluginInputCapability";
import { buildMentionPluginCapabilityItems } from "./pluginCapabilitySections";

describe("pluginCapabilitySections", () => {
  it("应按触发词匹配 Agent App 候选并保持 item key 唯一", () => {
    const plugins: InputbarPluginCapability[] = [
      {
        pluginId: "content-factory-app",
        displayName: "写文章",
        trigger: "@写文章",
        description: "@写文章 · 启动内容工厂文章工作流",
        skills: [
          {
            skillId: "content_article_generate",
            title: "@写文章",
            trigger: "@写文章",
          },
          {
            skillId: "content_article_generate",
            title: "@写作",
            trigger: "@写作",
          },
        ],
      },
      {
        pluginId: "content-factory-app",
        displayName: "内容工厂",
        trigger: "@内容工厂",
        description: "生成文章、配图和交付检查清单。",
        skills: [
          {
            skillId: "content_article_generate",
            title: "@写文章",
            trigger: "@写文章",
          },
        ],
      },
    ];

    const items = buildMentionPluginCapabilityItems({
      plugins,
      query: "写",
    });

    expect(items.map((item) => item.title)).toEqual(
      expect.arrayContaining(["写文章", "写文章:@写文章", "写文章:@写作"]),
    );
    expect(new Set(items.map((item) => item.key)).size).toBe(items.length);
  });
});
