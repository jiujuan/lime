import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildRustLayerReport,
  classifyRustTestFiles,
} from "./rust-test-layer-classifier.mjs";
import {
  filterEntriesForCargoArgs,
  parseArgs,
} from "./run-rust-layer.mjs";

let tempRoot = null;

function writeFile(relPath, content) {
  const target = path.join(tempRoot, relPath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function createFixtureRepo() {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lime-rust-layers-"));
  writeFile(
    "lime-rs/Cargo.toml",
    `
[workspace]
members = ["crates/*"]
exclude = ["crates/aster-rust"]

[package]
name = "lime"
version = "0.0.0"
`,
  );
  writeFile(
    "lime-rs/src/lib.rs",
    `
#[cfg(test)]
mod tests {
    #[test]
    fn pure_unit() {}
}
`,
  );
  writeFile(
    "lime-rs/src/commands/foo/tests/projection.rs",
    `
#[tokio::test]
async fn module_level_unit() {}
`,
  );
  writeFile(
    "lime-rs/tests/provider_contract.rs",
    `
#[tokio::test]
async fn provider_contract() {}
`,
  );
  writeFile(
    "lime-rs/tests/real_web_search.rs",
    `
#[tokio::test]
#[ignore = "真实联网测试：设置 LIME_REAL_API_TEST=1 后执行"]
async fn real_web_search() {
    let _ = std::env::var("LIME_REAL_API_TEST");
}
`,
  );
  writeFile(
    "lime-rs/crates/agent/Cargo.toml",
    `
[package]
name = "lime-agent"
version = "0.0.0"
`,
  );
  writeFile(
    "lime-rs/crates/agent/tests/protocol.rs",
    `
#[test]
fn protocol_guard() {}
`,
  );
  writeFile(
    "lime-rs/crates/services/Cargo.toml",
    `
[package]
name = "lime-services"
version = "0.0.0"
`,
  );
  writeFile(
    "lime-rs/crates/services/src/skill_service.rs",
    `
#[cfg(test)]
mod tests {
    #[test]
    fn local_skill_projection_is_unit() {}

    #[test]
    #[ignore = "live GitHub smoke for the official skills docx package"]
    fn live_github_skill_smoke() {}
}
`,
  );
  writeFile(
    "lime-rs/crates/aster-rust/Cargo.toml",
    `
[package]
name = "aster-rust"
version = "0.0.0"
`,
  );
  writeFile(
    "lime-rs/crates/aster-rust/tests/agent.rs",
    `
#[test]
fn excluded_agent_test() {}

#[test]
#[ignore]
fn excluded_ignored_agent_test() {}
`,
  );
  return tempRoot;
}

afterEach(() => {
  if (tempRoot) {
    fs.rmSync(tempRoot, { force: true, recursive: true });
    tempRoot = null;
  }
});

describe("rust-test-layer-classifier", () => {
  it("按 Cargo 边界区分 unit、integration、e2e 和 excluded subcrate", () => {
    const repoRoot = createFixtureRepo();
    const entries = classifyRustTestFiles(repoRoot);
    const byFile = Object.fromEntries(entries.map((entry) => [entry.file, entry]));

    expect(byFile["lime-rs/src/lib.rs"]).toMatchObject({
      layer: "unit",
      cargoScope: "workspace",
      runnableByDefault: true,
    });
    expect(
      byFile["lime-rs/src/commands/foo/tests/projection.rs"],
    ).toMatchObject({
      layer: "unit",
      cargoScope: "workspace",
      runnableByDefault: true,
    });
    expect(byFile["lime-rs/tests/provider_contract.rs"]).toMatchObject({
      layer: "integration",
      cargoScope: "workspace",
      runnableByDefault: true,
    });
    expect(byFile["lime-rs/tests/real_web_search.rs"]).toMatchObject({
      layer: "e2e",
      liveGated: true,
      runnableByDefault: false,
    });
    expect(byFile["lime-rs/crates/agent/tests/protocol.rs"]).toMatchObject({
      layer: "integration",
      packageName: "lime-agent",
      cargoScope: "workspace",
    });
    expect(byFile["lime-rs/crates/services/src/skill_service.rs"]).toMatchObject({
      layer: "unit",
      packageName: "lime-services",
      liveGated: true,
      testCount: 2,
      ignoredCount: 1,
      runnableByDefault: true,
    });
    expect(byFile["lime-rs/crates/aster-rust/tests/agent.rs"]).toMatchObject({
      layer: "integration",
      cargoScope: "excluded-subcrate",
      ignoredCount: 1,
      runnableByDefault: false,
    });
  });

  it("生成按层统计", () => {
    const repoRoot = createFixtureRepo();
    const report = buildRustLayerReport({ repoRoot });

    expect(report.layers.unit.files).toBe(3);
    expect(report.layers.unit.ignored).toBe(1);
    expect(report.layers.integration.files).toBe(3);
    expect(report.layers.e2e.files).toBe(1);
    expect(report.layers.integration.ignored).toBe(1);
    expect(report.liveGated).toBe(2);
    expect(report.excludedSubcrateFiles).toBe(1);
    expect(report.runnableByDefault).toBe(5);
  });
});

describe("run-rust-layer 参数解析", () => {
  it("保留 Cargo package 参数和测试过滤器", () => {
    expect(parseArgs(["unit", "-p", "lime-agent", "request_tool_policy"]))
      .toMatchObject({
        layer: "unit",
        cargoArgs: ["-p", "lime-agent", "request_tool_policy"],
        testArgs: [],
      });
  });

  it("把分隔符后的参数透传给 Rust test binary", () => {
    expect(parseArgs(["e2e", "--", "--ignored", "--nocapture"])).toMatchObject(
      {
        layer: "e2e",
        cargoArgs: [],
        testArgs: ["--ignored", "--nocapture"],
      },
    );
  });

  it("列表按 Cargo package scope 过滤", () => {
    const repoRoot = createFixtureRepo();
    const entries = classifyRustTestFiles(repoRoot);

    const defaultFiles = filterEntriesForCargoArgs(entries, []).map(
      (entry) => entry.file,
    );
    expect(defaultFiles).toContain("lime-rs/src/lib.rs");
    expect(defaultFiles).not.toContain(
      "lime-rs/crates/agent/tests/protocol.rs",
    );

    const workspaceFiles = filterEntriesForCargoArgs(entries, [
      "--workspace",
    ]).map((entry) => entry.file);
    expect(workspaceFiles).toContain(
      "lime-rs/crates/agent/tests/protocol.rs",
    );

    const agentFiles = filterEntriesForCargoArgs(entries, [
      "-p",
      "lime-agent",
    ]).map((entry) => entry.file);
    expect(agentFiles).toEqual(["lime-rs/crates/agent/tests/protocol.rs"]);
  });
});
