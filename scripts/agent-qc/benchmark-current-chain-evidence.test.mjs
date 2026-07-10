import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildCurrentChainEvidence,
  factsFromJsonRpcTrace,
  renderMarkdown,
} from "./benchmark-current-chain-evidence.mjs";

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "lime-benchmark-current-chain-"));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function makeTurnStart(overrides = {}) {
  return {
    method: "agentSession/turn/start",
    invoked: true,
    sessionId: "session-1",
    threadId: "thread-1",
    turnId: "turn-1",
    requestId: "request-1",
    ...overrides,
  };
}

function makeEvidencePack(overrides = {}) {
  return {
    session_id: "session-1",
    thread_id: "thread-1",
    workspace_root: "/tmp/workspace",
    pack_relative_root: ".lime/harness/sessions/session-1/evidence",
    pack_absolute_root: "/tmp/workspace/.lime/harness/sessions/session-1/evidence",
    exported_at: "2026-07-09T00:00:00.000Z",
    thread_status: "completed",
    latest_turn_status: "completed",
    turn_count: 1,
    item_count: 2,
    pending_request_count: 0,
    queued_turn_count: 0,
    recent_artifact_count: 1,
    known_gaps: [],
    observability_summary: {
      schemaVersion: "runtime-evidence-pack.v1",
      source: "app-server-current",
      sessionId: "session-1",
      threadId: "thread-1",
    },
    artifacts: [],
    ...overrides,
  };
}

function makeVerifier(overrides = {}) {
  return {
    invoked: true,
    verdict: "pass",
    reward: 1,
    source: "terminal-bench",
    ...overrides,
  };
}

describe("benchmark current chain evidence", () => {
  it("从 App Server turn-start、Evidence Pack 和 verifier 生成有效合同", () => {
    const evidence = buildCurrentChainEvidence({
      suiteId: "terminal-bench-release-slice",
      taskId: "hello-world",
      turnStart: makeTurnStart(),
      evidencePack: makeEvidencePack(),
      verifier: makeVerifier(),
      generatedAt: "2026-07-09T00:00:01.000Z",
    });

    expect(evidence.validation.valid).toBe(true);
    expect(evidence).toMatchObject({
      schemaVersion: "benchmark-current-chain-evidence-v1",
      suiteId: "terminal-bench-release-slice",
      taskId: "hello-world",
      appServer: {
        method: "agentSession/turn/start",
        invoked: true,
        sessionId: "session-1",
      },
      evidenceExport: {
        method: "evidence/export",
        invoked: true,
        pack: {
          pack_relative_root: ".lime/harness/sessions/session-1/evidence",
          observability_summary: {
            source: "app-server-current",
          },
        },
      },
      externalVerifier: {
        invoked: true,
        verdict: "pass",
      },
    });
    expect(renderMarkdown(evidence)).toContain("valid: yes");
  });

  it("支持 App Server Evidence Pack 的 camelCase 字段", () => {
    const evidence = buildCurrentChainEvidence({
      suiteId: "terminal-bench-release-slice",
      taskId: "hello-world",
      turnStart: makeTurnStart({
        session_id: "session-2",
        thread_id: "thread-2",
      }),
      evidencePack: {
        sessionId: "session-2",
        threadId: "thread-2",
        workspaceRoot: "/tmp/workspace",
        packRelativeRoot: ".lime/harness/sessions/session-2/evidence",
        packAbsoluteRoot: "/tmp/workspace/.lime/harness/sessions/session-2/evidence",
        exportedAt: "2026-07-09T00:00:00.000Z",
        threadStatus: "completed",
        turnCount: 1,
        itemCount: 2,
        pendingRequestCount: 0,
        queuedTurnCount: 0,
        recentArtifactCount: 0,
        knownGaps: [],
        observabilitySummary: {
          source: "app-server-current",
        },
        artifacts: [],
      },
      verifier: makeVerifier({ verdict: "ready" }),
    });

    expect(evidence.validation.valid).toBe(true);
    expect(evidence.evidenceExport.pack).toMatchObject({
      session_id: "session-2",
      thread_id: "thread-2",
      pack_relative_root: ".lime/harness/sessions/session-2/evidence",
    });
  });

  it("legacy turn-start 或 verifier 未通过时 fail closed", () => {
    const evidence = buildCurrentChainEvidence({
      suiteId: "terminal-bench-release-slice",
      taskId: "hello-world",
      turnStart: makeTurnStart({
        method: "agent_runtime_turn_start",
      }),
      evidencePack: makeEvidencePack({
        observability_summary: {
          source: "legacy",
        },
      }),
      verifier: makeVerifier({
        invoked: false,
        verdict: "blocked",
      }),
    });

    expect(evidence.validation.valid).toBe(false);
    expect(evidence.validation.issues).toEqual(
      expect.arrayContaining([
        "appServer 必须证明 agentSession/turn/start 已调用",
        "Evidence Pack observability_summary.source 必须是 app-server-current",
        "externalVerifier 必须已调用",
        "externalVerifier verdict 必须是 pass / passed / ready",
      ]),
    );
  });

  it("CLI 输出可被 true-run --current-chain-evidence 消费的 JSON", () => {
    const root = makeTempDir();
    writeJson(path.join(root, "turn-start.json"), makeTurnStart());
    writeJson(path.join(root, "evidence-pack.json"), makeEvidencePack());
    writeJson(path.join(root, "verifier.json"), makeVerifier());

    const evidence = buildCurrentChainEvidence({
      suiteId: "terminal-bench-release-slice",
      taskId: "hello-world",
      turnStart: JSON.parse(fs.readFileSync(path.join(root, "turn-start.json"), "utf8")),
      evidencePack: JSON.parse(fs.readFileSync(path.join(root, "evidence-pack.json"), "utf8")),
      verifier: JSON.parse(fs.readFileSync(path.join(root, "verifier.json"), "utf8")),
    });

    expect(evidence.schemaVersion).toBe("benchmark-current-chain-evidence-v1");
    expect(evidence.validation.valid).toBe(true);
  });

  it("可以从 JSON-RPC trace 抽取 turn-start 和 evidence/export 调用事实", () => {
    const trace = {
      entries: [
        {
          args_preview: {
            request: {
              lines: [
                `${JSON.stringify({
                  jsonrpc: "2.0",
                  id: "1",
                  method: "agentSession/turn/start",
                  params: {
                    sessionId: "session-1",
                    turnId: "turn-1",
                  },
                })}\n`,
              ],
            },
          },
        },
        {
          args_preview: {
            request: {
              lines: [
                `${JSON.stringify({
                  jsonrpc: "2.0",
                  id: "2",
                  method: "evidence/export",
                  params: {
                    sessionId: "session-1",
                  },
                })}\n`,
              ],
            },
          },
        },
      ],
    };
    const facts = factsFromJsonRpcTrace(trace);
    const evidence = buildCurrentChainEvidence({
      suiteId: "terminal-bench-release-slice",
      taskId: "hello-world",
      turnStart: facts.turnStart,
      evidencePack: makeEvidencePack(),
      verifier: makeVerifier(),
      evidenceExportInvoked: facts.evidenceExportInvoked,
    });

    expect(facts.evidenceExportInvoked).toBe(true);
    expect(evidence.validation.valid).toBe(true);
    expect(evidence.appServer).toMatchObject({
      method: "agentSession/turn/start",
      sessionId: "session-1",
      threadId: "thread-1",
      turnId: "turn-1",
    });
  });

  it("JSON-RPC trace 缺少 evidence/export 时保持无效", () => {
    const facts = factsFromJsonRpcTrace({
      appServerRequests: [
        {
          method: "agentSession/turn/start",
          params: {
            sessionId: "session-1",
            turnId: "turn-1",
          },
        },
      ],
    });
    const evidence = buildCurrentChainEvidence({
      suiteId: "terminal-bench-release-slice",
      taskId: "hello-world",
      turnStart: facts.turnStart,
      evidencePack: makeEvidencePack(),
      verifier: makeVerifier(),
      evidenceExportInvoked: facts.evidenceExportInvoked,
    });

    expect(evidence.validation.valid).toBe(false);
    expect(evidence.validation.issues).toEqual(
      expect.arrayContaining(["evidenceExport 必须证明 evidence/export 已调用"]),
    );
  });
});
