import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

import { withNativeSystemPath } from "../lib/native-executable-env.mjs";

const args = process.argv.slice(2);

function option(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function checked(body, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`^-\\s*\\[[xX]\\]\\s*${escaped}`, "mu").test(body);
}

function field(body, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = body.match(new RegExp(`^${escaped}\\s*(.+?)\\s*$`, "mu"));
  const value = match?.[1]?.trim() ?? "";
  if (!value || /<.*>|待填写|TODO|TBD/iu.test(value)) {
    return "";
  }
  return value;
}

function readPullRequest() {
  const bodyFile = option("--body-file");
  const eventPath = process.env.GITHUB_EVENT_PATH;
  const source = bodyFile ?? eventPath;
  if (!source || !existsSync(source)) {
    throw new Error("未找到 PR event 或 --body-file，无法读取责任开发者确认。");
  }
  const event = JSON.parse(readFileSync(source, "utf8"));
  return {
    base: option("--base") ?? event.pull_request?.base?.sha,
    body: event.pull_request?.body ?? event.body ?? "",
  };
}

function changedFiles(base) {
  if (!base) {
    throw new Error("缺少 PR base SHA；无法判断是否触及架构边界。");
  }
  return execFileSync("git", ["diff", "--name-only", `${base}...HEAD`], {
    encoding: "utf8",
    env: withNativeSystemPath(process.env),
  })
    .split(/\r?\n/u)
    .map((file) => file.trim())
    .filter(Boolean);
}

function isArchitectureSensitive(path) {
  return [
    /^AGENTS\.md$/u,
    /^forge\.config\.mjs$/u,
    /^package(?:-lock)?\.json$/u,
    /^electron\/(?:main|preload|ipcChannels|appServerHost|updateHost)\./u,
    /^lime-rs\/(?:Cargo\.toml|crates\/(?:app-server(?:-|\/)|agent(?:-|\/|$)|agent-protocol\/|agent-runtime\/|runtime-core\/|model-provider\/|tool-runtime\/|thread-store\/))/u,
    /^packages\/(?:app-server-client|agent-runtime-client|agent-runtime-projection|agent-runtime-ui|agent-ui-contracts|agent-workbench-adapter|agent-capability-catalog)\//u,
    /^src\/(?:RootRouter\.tsx|pages\/|lib\/(?:api\/appServer|dev-bridge\/|desktop-host\/))/u,
    /^internal\/aiprompts\/architecture\.md$/u,
  ].some((pattern) => pattern.test(path));
}

function fail(messages) {
  for (const message of messages) {
    console.error(`[architecture-confirmation] ${message}`);
  }
  process.exitCode = 1;
}

if (
  process.env.GITHUB_EVENT_NAME &&
  process.env.GITHUB_EVENT_NAME !== "pull_request" &&
  !option("--body-file")
) {
  console.log("[architecture-confirmation] skipped outside pull_request");
} else {
  try {
    const { base, body } = readPullRequest();
    const files = changedFiles(base);
    const sensitiveFiles = files.filter(isArchitectureSensitive);
    const major = checked(body, "本次属于重大架构变更");
    const nonMajor = checked(body, "本次不属于重大架构变更");
    const errors = [];

    if (major === nonMajor) {
      errors.push("必须且只能勾选一项：重大架构变更或非重大架构变更。");
    }

    if (nonMajor) {
      const reason = field(body, "非重大原因：");
      if (!reason) {
        errors.push("选择非重大架构变更时必须填写“非重大原因”。");
      }
      if (sensitiveFiles.length > 0) {
        errors.push(
          `本 PR 触及架构敏感路径，只能声明重大架构变更：${sensitiveFiles.join(", ")}`,
        );
      }
    }

    if (major) {
      if (!files.includes("internal/aiprompts/architecture.md")) {
        errors.push(
          "重大架构变更必须在同一 PR 更新 internal/aiprompts/architecture.md。",
        );
      }
      for (const label of [
        "架构影响：",
        "架构图更新章节：",
        "责任开发者确认：",
      ]) {
        if (!field(body, label)) {
          errors.push(`重大架构变更必须填写“${label}”。`);
        }
      }
      if (
        !checked(body, "已核对目录归属、数据流、依赖方向、协议边界和验证门禁")
      ) {
        errors.push("责任开发者必须勾选架构边界核对确认。");
      }
    }

    if (errors.length > 0) {
      fail(errors);
    } else {
      const classification = major ? "major" : "non-major";
      console.log(
        `[architecture-confirmation] ok classification=${classification} sensitiveFiles=${sensitiveFiles.length}`,
      );
    }
  } catch (error) {
    fail([error instanceof Error ? error.message : String(error)]);
  }
}
