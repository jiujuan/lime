/* global process */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();

const RUNTIME_BACKEND_DIR = join(
  REPO_ROOT,
  "lime-rs/crates/app-server/src/runtime_backend",
);
const AGENT_SRC_DIR = join(REPO_ROOT, "lime-rs/crates/agent/src");

const SNAPSHOT_OWNER_FILES = new Set([
  "lime-rs/crates/app-server/src/runtime_backend/agent_skills_context.rs",
  "lime-rs/crates/app-server/src/runtime_backend/agent_skills_telemetry.rs",
]);

const SKILL_GATE_OWNER_FILES = new Set([
  "lime-rs/crates/app-server/src/runtime_backend/skill_runtime_enable.rs",
]);

const SKILL_TOOL_WRAPPER_OWNER =
  "lime-rs/crates/agent/src/tools/skill_tool_gate.rs";

function collectRustFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      if (entry === "target") {
        continue;
      }
      files.push(...collectRustFiles(fullPath));
      continue;
    }
    if (fullPath.endsWith(".rs")) {
      files.push(fullPath);
    }
  }
  return files;
}

function repoRelative(path: string): string {
  return relative(REPO_ROOT, path).replace(/\\/g, "/");
}

function productionSource(path: string): string {
  const source = readFileSync(path, "utf8");
  const testIndex = source.indexOf("#[cfg(test)]");
  return testIndex >= 0 ? source.slice(0, testIndex) : source;
}

describe("agent skills runtime boundary", () => {
  it("Agent turn runtime 不应绕过 AgentSkillSnapshot 直接扫描 skill roots", () => {
    const forbiddenSnippets = [
      "get_skill_roots(",
      "load_skills_from_directory(",
      "load_skill_from_file(",
    ];
    const offenders = collectRustFiles(RUNTIME_BACKEND_DIR)
      .map((file) => ({
        path: repoRelative(file),
        source: productionSource(file),
      }))
      .filter(({ source }) =>
        forbiddenSnippets.some((snippet) => source.includes(snippet)),
      )
      .map(({ path }) => path);

    expect(offenders).toEqual([]);
  });

  it("SKILL.md 正文读取只能挂在 AgentSkillSnapshot 选择链之后", () => {
    const offenders = collectRustFiles(RUNTIME_BACKEND_DIR)
      .map((file) => ({
        path: repoRelative(file),
        source: productionSource(file),
      }))
      .filter(({ path, source }) => {
        if (!source.includes("read_agent_skill_body")) {
          return false;
        }
        return !SNAPSHOT_OWNER_FILES.has(path);
      })
      .map(({ path }) => path);

    expect(offenders).toEqual([]);
  });

  it("SkillTool session allowlist 只能由 runtime enable gate 写入", () => {
    const forbiddenSnippets = [
      "set_skill_tool_session_allowed_skills(",
      "set_skill_tool_session_allowed_skill_sources(",
    ];
    const offenders = collectRustFiles(RUNTIME_BACKEND_DIR)
      .map((file) => ({
        path: repoRelative(file),
        source: productionSource(file),
      }))
      .filter(({ path, source }) => {
        if (!forbiddenSnippets.some((snippet) => source.includes(snippet))) {
          return false;
        }
        return !SKILL_GATE_OWNER_FILES.has(path);
      })
      .map(({ path }) => path);

    expect(offenders).toEqual([]);
  });

  it("生产代码不应绕过 LimeSkillTool 直接注册原始 SkillTool", () => {
    const offenders = collectRustFiles(AGENT_SRC_DIR)
      .map((file) => ({
        path: repoRelative(file),
        source: productionSource(file),
      }))
      .filter(({ path, source }) => {
        if (!source.includes("SkillTool::new(")) {
          return false;
        }
        return path !== SKILL_TOOL_WRAPPER_OWNER;
      })
      .map(({ path }) => path);

    expect(offenders).toEqual([]);
  });

  it("runtime backend 不应新增硬编码 Skill(name) 首刀绕过 selector", () => {
    const offenders = collectRustFiles(RUNTIME_BACKEND_DIR)
      .map((file) => ({
        path: repoRelative(file),
        source: productionSource(file),
      }))
      .filter(({ source }) => /Skill\([A-Za-z0-9_-]+\)/u.test(source))
      .map(({ path }) => path);

    expect(offenders).toEqual([]);
  });
});
