import { describe, expect, it } from "vitest";

import { buildAgentRuntimeProcessView } from "./agentRuntimeProcess";

describe("buildAgentRuntimeProcessView", () => {
  it("保留完整运行过程，不在数据层截断到最后 16 条", () => {
    const events = Array.from({ length: 20 }, (_, index) => ({
      eventType: "task:progress",
      message: `步骤${index + 1}`,
    }));

    const process = buildAgentRuntimeProcessView({ events });

    expect(process.timeline).toHaveLength(20);
    expect(process.timeline[0]).toMatchObject({ message: "步骤1" });
    expect(process.timeline.at(-1)).toMatchObject({ message: "步骤20" });
  });

  it("保留每段流式输出过程，折叠只交给 UI 层处理", () => {
    const events = ["第一段", "第二段", "第三段"].map((delta) => ({
      eventType: "task:partialArtifact",
      status: "streaming",
      message: delta,
      payload: {
        streamKind: "assistant_text_delta",
        delta,
        runtimeEvent: { type: "text_delta", text: delta },
      },
    }));

    const process = buildAgentRuntimeProcessView({ events });

    expect(process.streamText).toBe("第一段第二段第三段");
    expect(process.timeline.map((item) => item.message)).toEqual([
      "第一段",
      "第二段",
      "第三段",
    ]);
  });

  it("从 Skill 工具参数对象中识别真实调用的业务 Skill", () => {
    const process = buildAgentRuntimeProcessView({
      task: {
        taskId: "task-1",
        status: "completed",
        skills: ["article-w", "content-review"],
      },
      events: [
        {
          eventType: "task:toolCall",
          status: "completed",
          message: "工具 Skill completed",
          toolName: "Skill",
          payload: {
            runtimeEvent: {
              type: "tool_start",
              toolName: "Skill",
              arguments: {
                skill: "knowledge-builder",
                args: { projectId: "project-1" },
              },
            },
          },
        },
      ],
    });

    expect(process.invokedSkillNames).toEqual(["knowledge-builder"]);
    expect(process.timeline[0]).toMatchObject({
      kind: "skill",
      title: "Skill · knowledge-builder",
    });
  });

  it("从 snapshot tool_calls 和 artifact 文本补齐多 Skill 调用，并剔除流式参数前缀", () => {
    const process = buildAgentRuntimeProcessView({
      events: [
        {
          eventType: "task:runtimeEvent",
          status: "streaming",
          message: "工具 Skill running",
          toolName: "Skill",
          payload: {
            streamKind: "tool_input_delta",
            delta: '{"skill":"article',
            runtimeEvent: { type: "tool_input_delta", toolName: "Skill" },
          },
        },
        {
          eventType: "task:runtimeEvent",
          status: "streaming",
          message: "工具 Skill running",
          toolName: "Skill",
          payload: {
            streamKind: "tool_input_delta",
            delta: '{"skill":"article-w',
            runtimeEvent: { type: "tool_input_delta", toolName: "Skill" },
          },
        },
        {
          eventType: "task:toolCall",
          status: "completed",
          message: "工具 Skill completed",
          toolName: "Skill",
          payload: {
            runtimeEvent: {
              type: "tool_start",
              toolName: "Skill",
              arguments: {
                skill: "article-writer",
              },
            },
          },
        },
      ],
      expectedOutput: {
        requiredSkills: ["article-writer", "content-reviewer"],
      },
      snapshot: {
        threadRead: {
          tool_calls: [
            {
              tool_name: "Skill",
              status: "completed",
              arguments: { skill: "content-reviewer" },
            },
          ],
          artifacts: [
            {
              title: "内容工厂产物",
              metadata: {
                artifactDocument: {
                  blocks: [
                    {
                      markdown:
                        "Skill article-writer completed\nSkill content-reviewer completed",
                    },
                  ],
                },
              },
            },
          ],
        },
      },
    });

    expect(process.invokedSkillNames).toEqual([
      "article-writer",
      "content-reviewer",
    ]);
    expect(process.invokedSkillNames).not.toContain("article");
    expect(process.invokedSkillNames).not.toContain("article-w");
    expect(process.timeline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "skill",
          title: "Skill · article-writer",
        }),
        expect.objectContaining({
          kind: "skill",
          title: "Skill · content-reviewer",
          statusText: "已记录",
        }),
      ]),
    );
  });

  it("从 threadRead.model_routing 和 artifact 事件投影完成态运行事实", () => {
    const process = buildAgentRuntimeProcessView({
      task: {
        taskStatus: "completed",
        input: {
          projectId: "project-1",
          material: "这是一段用于内容工厂知识库整理的项目资料。",
        },
      },
      snapshot: {
        taskStatus: "completed",
        threadRead: {
          model_routing: {
            selectedProvider: "deepseek",
            selectedModel: "deepseek-v4-flash",
          },
          cost_state: {
            estimatedCostClass: "medium",
            status: "estimated",
          },
        },
      },
      events: [
        {
          eventType: "task:toolCall",
          status: "completed",
          message: "工具 Skill completed",
          toolName: "Skill",
          payload: {
            tool_name: "Skill",
          },
        },
        {
          eventType: "artifact:created",
          status: "created",
          message: "内容工厂 workspace patch 已创建",
          payload: {
            contentFactoryWorkspacePatch: {
              kind: "content_factory.workspace_patch",
              projectId: "project-1",
            },
          },
        },
      ],
    });

    expect(process.model).toMatchObject({
      provider: "deepseek",
      model: "deepseek-v4-flash",
      label: "deepseek/deepseek-v4-flash",
    });
    expect(process.usage).toMatchObject({
      estimated: true,
      source: "plugin_runtime_process_estimate",
    });
    expect(process.cost).toMatchObject({
      estimatedCostClass: "medium",
      status: "estimated",
    });
    expect(process.artifactCount).toBe(1);
    expect(process.terminal).toBe(true);
  });
});
