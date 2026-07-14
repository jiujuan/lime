import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it } from "vitest";

const CURRENT_ROADMAP_PATHS = [
  "internal/roadmap/projectthread/README.md",
  "internal/roadmap/agent-workspace/README.md",
  "internal/roadmap/agent-workspace/run-observability.md",
  "internal/roadmap/agentui/conversation-projection-fact-map.md",
  "internal/roadmap/agentui/lime-agentui-target-architecture.md",
  "internal/roadmap/agentui/conversation-projection-implementation-plan.md",
] as const;

describe("legacy SubAgent roadmap boundary", () => {
  it("current roadmap 只描述 canonical Thread roster owner", () => {
    const sources = CURRENT_ROADMAP_PATHS.map((path) => ({
      path,
      source: readFileSync(join(cwd(), path), "utf8"),
    }));

    for (const { path, source } of sources) {
      for (const retiredSurface of [
        "childSubagentSessions",
        "child_subagent_sessions",
        "sibling_subagent_sessions",
        "subagent_parent_context",
      ]) {
        expect(source, `${path}: ${retiredSurface}`).not.toContain(
          retiredSurface,
        );
      }
    }

    expect(sources.map(({ source }) => source).join("\n")).toContain(
      "CanonicalChildThreadSummary",
    );
  });
});
