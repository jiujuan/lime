import { describe, expect, it } from "vitest";
import type { AgentToolCallState } from "@/lib/api/agentProtocol";
import {
  shouldAutoExpandProcessEntries,
  type StreamingProcessEntry,
} from "./StreamingProcessGroupModel";

function toolCall(patch: Partial<AgentToolCallState> = {}): AgentToolCallState {
  return {
    id: patch.id ?? "tool-1",
    name: patch.name ?? "skill",
    arguments: patch.arguments ?? "{}",
    status: patch.status ?? "completed",
    startTime: patch.startTime ?? new Date("2026-06-22T10:00:00.000Z"),
    result: patch.result,
    metadata: patch.metadata,
    ...patch,
  };
}

function toolEntry(tool: AgentToolCallState): StreamingProcessEntry {
  return {
    kind: "tool",
    id: tool.id,
    toolCall: tool,
  };
}

describe("StreamingProcessGroupModel", () => {
  it("消息仍在输出时，completed Skill 过程不应提前折叠", () => {
    expect(
      shouldAutoExpandProcessEntries(
        [
          toolEntry(
            toolCall({
              status: "completed",
              metadata: {
                tool_family: "skill",
                skill_name: "capability-report",
              },
            }),
          ),
        ],
        true,
      ),
    ).toBe(true);
  });

  it("消息完成后，completed Skill 过程应回到折叠摘要", () => {
    expect(
      shouldAutoExpandProcessEntries(
        [
          toolEntry(
            toolCall({
              status: "completed",
              metadata: {
                tool_family: "skill",
                skill_name: "capability-report",
              },
            }),
          ),
        ],
        false,
      ),
    ).toBe(false);
  });

  it("普通命令仍默认折叠，避免实时 raw 输出切开正文", () => {
    expect(
      shouldAutoExpandProcessEntries(
        [
          toolEntry(
            toolCall({
              name: "Bash",
              status: "running",
              result: {
                success: true,
                output: "raw streaming output",
              },
            }),
          ),
        ],
        true,
      ),
    ).toBe(false);
  });

  it("失败 Skill 仍默认折叠，避免错误细节抢占正文", () => {
    expect(
      shouldAutoExpandProcessEntries(
        [
          toolEntry(
            toolCall({
              status: "failed",
              result: {
                success: false,
                output: "",
                error: "failed",
              },
              metadata: {
                tool_family: "skill",
                skill_name: "capability-report",
              },
            }),
          ),
        ],
        true,
      ),
    ).toBe(false);
  });
});
