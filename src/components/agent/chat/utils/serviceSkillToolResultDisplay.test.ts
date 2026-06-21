import { describe, expect, it } from "vitest";

import { shouldHideServiceSkillToolResultEnvelope } from "./serviceSkillToolResultDisplay";

describe("serviceSkillToolResultDisplay", () => {
  it("应隐藏服务技能结构化运行包络", () => {
    expect(
      shouldHideServiceSkillToolResultEnvelope({
        toolName: "lime_run_service_skill",
        rawResultText: JSON.stringify({
          service_skill_id: "channel-preview",
          slot_values: { platform: "小红书" },
          status: "running",
        }),
      }),
    ).toBe(true);
  });

  it("应隐藏嵌套在 result/output/data 中的服务技能包络", () => {
    expect(
      shouldHideServiceSkillToolResultEnvelope({
        toolName: "lime_run_service_skill",
        rawResultText: JSON.stringify({
          result: {
            output: {
              data: {
                serviceSkillId: "channel-preview",
                slotValues: { platform: "小红书" },
              },
            },
          },
        }),
      }),
    ).toBe(true);

    expect(
      shouldHideServiceSkillToolResultEnvelope({
        toolName: "lime_run_service_skill",
        rawResultText: JSON.stringify({
          items: [
            {
              payload: {
                skill_id: "channel-preview",
                runner_type: "service_skill",
              },
            },
          ],
        }),
      }),
    ).toBe(true);

    expect(
      shouldHideServiceSkillToolResultEnvelope({
        toolName: "lime_run_service_skill",
        rawResultText: JSON.stringify({
          output: JSON.stringify({
            service_skill_id: "channel-preview",
            slot_values: { platform: "小红书" },
          }),
        }),
      }),
    ).toBe(true);
  });

  it("不应隐藏非服务技能工具或普通文本输出", () => {
    expect(
      shouldHideServiceSkillToolResultEnvelope({
        toolName: "WebFetch",
        rawResultText: JSON.stringify({
          service_skill_id: "channel-preview",
        }),
      }),
    ).toBe(false);

    expect(
      shouldHideServiceSkillToolResultEnvelope({
        toolName: "lime_run_service_skill",
        rawResultText: "已完成渠道预览。",
      }),
    ).toBe(false);
  });
});
