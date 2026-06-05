import { describe, expect, it } from "vitest";
import {
  buildRustModuleIndex,
  expandRustUseTree,
  resolveMatchingGovernanceRule,
  resolveRustUseToFile,
} from "./governance-graph-core.mjs";

describe("governance-graph-core", () => {
  it("应优先命中更具体的治理规则", () => {
    const rules = [
      {
        match: "src/**/*.tsx",
        status: "deprecated",
        exitCriteria: "fallback",
      },
      {
        match: "src/pages/smart-input.tsx",
        status: "current",
        sourceOfTruth: "RootRouter",
      },
    ];

    const matched = resolveMatchingGovernanceRule(
      "src/pages/smart-input.tsx",
      rules,
    );

    expect(matched?.status).toBe("current");
    expect(matched?.match).toBe("src/pages/smart-input.tsx");
  });

  it("应展开带嵌套花括号的 Rust use 树", () => {
    const expanded = expandRustUseTree(
      "use crate::commands::{agent_cmd::{run, status}, model_cmd, self};",
    );

    expect(expanded).toEqual([
      "crate::commands::agent_cmd::run",
      "crate::commands::agent_cmd::status",
      "crate::commands::model_cmd",
      "crate::commands",
    ]);
  });

  it("应解析 crate/self/super Rust use 到文件路径", () => {
    const moduleIndex = buildRustModuleIndex([
      "lime-rs/src/app/mod.rs",
      "lime-rs/src/app/bootstrap.rs",
      "lime-rs/src/commands/mod.rs",
      "lime-rs/src/commands/agent_cmd.rs",
      "lime-rs/src/commands/internal/helper.rs",
    ]);

    expect(
      resolveRustUseToFile(
        moduleIndex,
        "commands::agent_cmd",
        "crate::app::bootstrap::boot",
      ),
    ).toBe("lime-rs/src/app/bootstrap.rs");

    expect(
      resolveRustUseToFile(
        moduleIndex,
        "commands::internal::helper",
        "super::super::agent_cmd::run_agent",
      ),
    ).toBe("lime-rs/src/commands/agent_cmd.rs");

    expect(
      resolveRustUseToFile(
        moduleIndex,
        "commands::internal::helper",
        "self::helper",
      ),
    ).toBe("lime-rs/src/commands/internal/helper.rs");
  });
});
