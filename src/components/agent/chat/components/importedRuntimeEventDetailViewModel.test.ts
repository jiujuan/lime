import { describe, expect, it } from "vitest";
import {
  buildImportedRuntimeEventDisplay,
  formatImportedRuntimePayloadPreview,
} from "./importedRuntimeEventDetailViewModel";

describe("importedRuntimeEventDetailViewModel", () => {
  it("应对运行事件做稳定投影且不泄露来源路径", () => {
    const display = buildImportedRuntimeEventDisplay({
      sourceEventIndex: 120,
      turnIndex: 2,
      eventIndex: 4,
      eventType: "command_execution",
      payload: {
        command: "npm test",
        status: "completed",
        sourcePath: "/Users/example/.codex/sessions/thread.jsonl",
        threadId: "thread-1",
        source_thread_id: "thread-1",
      },
    });

    expect(display.eventTypeLabel).toBe("command execution");
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

  it("应截断超长字符串负载", () => {
    const preview = formatImportedRuntimePayloadPreview("x".repeat(2500), 50);

    expect(preview.truncated).toBe(true);
    expect(preview.text.length).toBeLessThanOrEqual(50);
  });
});
