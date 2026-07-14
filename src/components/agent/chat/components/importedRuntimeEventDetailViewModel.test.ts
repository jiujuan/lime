import { describe, expect, it } from "vitest";
import { loadNamespaceResource } from "@/i18n/loadNamespace";
import {
  buildImportedRuntimeEventDisplay,
  formatImportedRuntimePayloadPreview,
} from "./importedRuntimeEventDetailViewModel";

const IMPORTED_RUNTIME_REQUIRED_KEYS = [
  "generalWorkbench.taskRail.importedRuntime.fact.collaborationKind",
  "generalWorkbench.taskRail.importedRuntime.fact.collaborationPhase",
  "generalWorkbench.taskRail.importedRuntime.fact.collaborationSurface",
  "generalWorkbench.taskRail.importedRuntime.fact.packId",
  "generalWorkbench.taskRail.importedRuntime.fact.profileId",
  "generalWorkbench.taskRail.importedRuntime.fact.riskLevel",
  "generalWorkbench.taskRail.importedRuntime.fact.styleLevel",
  "generalWorkbench.taskRail.importedRuntime.fact.toneVariant",
  "generalWorkbench.taskRail.importedRuntime.payload.type.bigint",
  "generalWorkbench.taskRail.importedRuntime.payload.type.boolean",
  "generalWorkbench.taskRail.importedRuntime.payload.type.function",
  "generalWorkbench.taskRail.importedRuntime.payload.type.number",
  "generalWorkbench.taskRail.importedRuntime.payload.type.string",
  "generalWorkbench.taskRail.importedRuntime.payload.type.symbol",
  "generalWorkbench.taskRail.importedRuntime.payload.type.value",
] as const;

describe("importedRuntimeEventDetailViewModel", () => {
  it("应对运行事件做稳定投影且不泄露来源路径", () => {
    const display = buildImportedRuntimeEventDisplay({
      sourceEventIndex: 120,
      turnIndex: 2,
      eventIndex: 4,
      eventType: "command.started",
      payload: {
        command: "npm test",
        status: "completed",
        sourcePath: "/Users/example/.codex/sessions/thread.jsonl",
        threadId: "thread-1",
        source_thread_id: "thread-1",
      },
    });

    expect(display.kind).toBe("command");
    expect(display.title.defaultValue).toBe("命令");
    expect(display.eventTypeLabel).toBe("command started");
    expect(display.turnNumber).toBe(3);
    expect(display.eventNumber).toBe(5);
    expect(display.sourceEventNumber).toBe(121);
    expect(display.payloadSummary).toEqual({ kind: "record", fieldCount: 5 });
    expect(display.payloadPreview).toContain("npm test");
    expect(display.payloadPreview).toContain("completed");
    expect(display.payloadPreview).not.toContain(".codex");
    expect(display.payloadPreview).not.toContain("sourcePath");
    expect(display.payloadPreview).not.toContain("source_thread_id");
  });

  it("应把 Codex 特化运行事件投影为可扫描语义块", () => {
    const cases = [
      {
        eventType: "tool.started",
        payload: {
          toolName: "mcp__filesystem__read_file",
          status: "in_progress",
          server: "filesystem",
          arguments: { path: "src/lib.rs" },
          sourceEventType: "mcp_tool_call_begin",
        },
        kind: "mcp_tool",
        title: "MCP 工具",
        fact: "filesystem",
      },
      {
        eventType: "tool.result",
        payload: {
          toolName: "docs.lookup",
          namespace: "docs",
          output: "dynamic result",
          success: true,
          sourceEventType: "dynamic_tool_call_response",
        },
        kind: "dynamic_tool",
        title: "动态工具",
        fact: "docs",
      },
      {
        eventType: "tool.result",
        payload: {
          toolName: "view_image",
          path: "/workspace/app/assets/input.png",
          success: true,
          sourceEventType: "view_image_tool_call",
        },
        kind: "image_view",
        title: "图片查看",
        fact: "input.png",
      },
      {
        eventType: "tool.result",
        payload: {
          toolName: "image_generation",
          status: "completed",
          arguments: {
            revisedPrompt: "draw a cleaner timeline",
            savedPath: "/workspace/app/assets/result.png",
          },
          output: "/workspace/app/assets/result.png",
          sourceEventType: "image_generation_end",
        },
        kind: "image_generation",
        title: "图片生成",
        fact: "result.png",
      },
      {
        eventType: "context.compaction.completed",
        payload: {
          stage: "completed",
          trigger: "auto",
          detail: "Context compacted before continuing.",
          sourceEventType: "context_compacted",
        },
        kind: "context_compaction",
        title: "上下文压缩",
        fact: "Context compacted",
      },
      {
        eventType: "reasoning.completed",
        payload: {
          text: "Review current changes.",
          sourceEventType: "entered_review_mode",
        },
        kind: "review",
        title: "代码审查",
        fact: "Review current changes",
      },
      {
        eventType: "subagent.activity",
        payload: {
          status: "in_progress",
          title: "agents/reviewer.md",
          summary: "Subagent started imported review.",
          sourceEventType: "sub_agent_activity",
        },
        kind: "subagent",
        title: "子任务活动",
        fact: "Subagent started",
      },
      {
        eventType: "tool.result",
        payload: {
          toolName: "agent",
          status: "completed",
          output: "subagent-thread-2",
          model: "gpt-5.5",
          sourceEventType: "collab_agent_spawn_end",
          senderThreadId: "main-thread",
          newThreadId: "subagent-thread-2",
        },
        kind: "collaboration",
        title: "协作任务",
        fact: "gpt-5.5",
      },
      {
        eventType: "plan.final",
        payload: {
          status: "completed",
          plan: [
            { step: "one", status: "completed" },
            { step: "two", status: "pending" },
          ],
          sourceEventType: "function_call",
        },
        kind: "plan",
        title: "计划",
        fact: "2 项",
      },
      {
        eventType: "action.required",
        payload: {
          status: "completed",
          toolName: "apply_patch",
          prompt: "Approve imported patch",
          arguments: ["apply_patch"],
          sourceEventType: "apply_patch_approval_request",
        },
        kind: "approval",
        title: "权限确认",
        fact: "Approve imported patch",
      },
    ] as const;

    for (const item of cases) {
      const display = buildImportedRuntimeEventDisplay({
        sourceEventIndex: 1,
        turnIndex: 0,
        eventIndex: 0,
        eventType: item.eventType,
        payload: item.payload,
      });
      const factValues = display.facts.map((fact) => fact.value).join("\n");

      expect(display.kind).toBe(item.kind);
      expect(display.title.defaultValue).toBe(item.title);
      expect(factValues).toContain(item.fact);
    }
  });

  it("协作事件默认不在 UI 投影里暴露线程标识", () => {
    const display = buildImportedRuntimeEventDisplay({
      sourceEventIndex: 1,
      turnIndex: 0,
      eventIndex: 0,
      eventType: "tool.result",
      payload: {
        toolName: "agent",
        output: "subagent-thread-2",
        sourceEventType: "collab_agent_spawn_end",
        senderThreadId: "main-thread",
        receiverThreadId: "receiver-thread",
        newThreadId: "subagent-thread-2",
      },
    });

    const factValues = display.facts.map((fact) => fact.value).join("\n");

    expect(display.kind).toBe("collaboration");
    expect(factValues).not.toContain("main-thread");
    expect(factValues).not.toContain("receiver-thread");
    expect(factValues).not.toContain("subagent-thread-2");
    expect(display.payloadPreview).not.toContain("senderThreadId");
    expect(display.payloadPreview).not.toContain("receiverThreadId");
    expect(display.payloadPreview).not.toContain("newThreadId");
  });

  it("应优先使用 collaboration facts 识别 workbench task rail 协作事件", () => {
    const display = buildImportedRuntimeEventDisplay({
      sourceEventIndex: 1,
      turnIndex: 0,
      eventIndex: 0,
      eventType: "subagent.status",
      payload: {
        status: "running",
        collaborationFacts: {
          collaborationSurface: "team_roster",
          collaborationPhase: "acting",
          collaborationKind: "subagent_status",
          styleLevel: "L1",
          riskLevel: "normal",
          profileId: "cheeky_sassy_executor",
          packId: "stylepack.cheeky_sassy_executor.v1",
          toneVariant: "cheeky_sassy",
        },
        collaborationSurface: "team_roster",
        collaborationPhase: "acting",
        sourceEventType: "item_completed",
        senderThreadId: "main-thread",
        newThreadId: "subagent-thread-2",
      },
    });

    const factValues = display.facts.map((fact) => fact.value).join("\n");

    expect(display.kind).toBe("collaboration");
    expect(display.title.key).toBe(
      "generalWorkbench.taskRail.importedRuntime.kind.collaboration",
    );
    expect(factValues).toContain("team_roster");
    expect(factValues).toContain("acting");
    expect(factValues).toContain("subagent_status");
    expect(factValues).toContain("L1");
    expect(factValues).toContain("normal");
    expect(factValues).toContain("cheeky_sassy_executor");
    expect(factValues).toContain("stylepack.cheeky_sassy_executor.v1");
    expect(factValues).toContain("cheeky_sassy");
    expect(factValues).not.toContain("main-thread");
    expect(factValues).not.toContain("subagent-thread-2");
  });

  it("应截断超长字符串负载", () => {
    const preview = formatImportedRuntimePayloadPreview("x".repeat(2500), 50);

    expect(preview.truncated).toBe(true);
    expect(preview.text.length).toBeLessThanOrEqual(50);
  });

  it("完整记录 payload 类型展示文案覆盖五语言资源", () => {
    for (const locale of ["zh-CN", "zh-TW", "en-US", "ja-JP", "ko-KR"]) {
      const resource = loadNamespaceResource(locale, "agent");
      for (const key of IMPORTED_RUNTIME_REQUIRED_KEYS) {
        expect(resource[key], `${locale}:${key}`).toEqual(expect.any(String));
        expect(String(resource[key]).trim()).not.toBe("");
      }
    }
  });
});
