import fs from "node:fs";
import { describe, expect, it } from "vitest";

function readSmokeScript() {
  return fs.readFileSync(
    "scripts/agent-app/runtime-electron-sdk-fixture-smoke.mjs",
    "utf8",
  );
}

describe("agent app runtime Electron SDK fixture smoke guard", () => {
  it("keeps the proof on a real Electron runtime page and iframe SDK bridge", () => {
    const content = readSmokeScript();

    expect(content).toContain("import { _electron as electron }");
    expect(content).toContain("electron.launch({");
    expect(content).toContain('"--use-mock-keychain"');
    expect(content).toContain("ELECTRON_E2E_USER_DATA_DIR");
    expect(content).toContain('LIME_ELECTRON_E2E: "1"');
    expect(content).toContain('LIME_ELECTRON_DEV_HTTP_BRIDGE: "0"');
    expect(content).toContain("window.__LIME_ELECTRON__ === true");
    expect(content).toContain(
      'typeof window.electronAPI?.invoke === "function"',
    );
    expect(content).toContain("waitForAgentAppSidebarEntry(");
    expect(content).toContain("clickAgentAppSidebarEntry(");
    expect(content).toContain('[data-testid="agent-app-runtime-surface"]');
    expect(content).toContain('[data-testid="agent-app-runtime-frame"]');
    expect(content).toContain("__agentAppSdkFixtureResult");
  });

  it("drives task lifecycle from iframe SDK instead of renderer direct invoke", () => {
    const content = readSmokeScript();

    expect(content).toContain("createLimeHostBridgeCapabilityInvoker");
    expect(content).toContain("bridge.ready()");
    expect(content).toContain("bridge.getHostSnapshot()");
    expect(content).toContain('capability: "lime.agent"');
    expect(content).toContain('method: "startTask"');
    expect(content).toContain('method: "getTask"');
    expect(content).toContain('method: "submitHostResponse"');
    expect(content).toContain('method: "cancelTask"');
    expect(content).toContain("bridge.getCallLog()");
    expect(content).toContain("REQUIRED_HOST_ADAPTER_CAPABILITIES");
    expect(content).toContain("Host Snapshot 未声明 ${capability} available");
    expect(content).not.toContain(
      'window.electronAPI.invoke("agent_app_runtime_start_task"',
    );
    expect(content).not.toContain(
      'window.electronAPI.invoke("agent_app_runtime_get_task"',
    );
    expect(content).not.toContain(
      'window.electronAPI.invoke("agent_app_runtime_submit_host_response"',
    );
    expect(content).not.toContain(
      'window.electronAPI.invoke("agent_app_runtime_cancel_task"',
    );
    expect(content).not.toContain('api.invoke("agent_app_runtime_start_task"');
    expect(content).not.toContain('api.invoke("agent_app_runtime_get_task"');
    expect(content).not.toContain(
      'api.invoke("agent_app_runtime_submit_host_response"',
    );
    expect(content).not.toContain('api.invoke("agent_app_runtime_cancel_task"');
  });

  it("uses the App Server runtime turn id for follow-up SDK actions", () => {
    const content = readSmokeScript();

    expect(content).not.toContain("const TURN_ID");
    expect(content).not.toContain("turnId: TURN_ID");
    expect(content).not.toContain("?? TURN_ID");
    expect(content).not.toContain("agent-app-electron-sdk-turn-1");
    expect(content).toContain("const runtimeTurnId =");
    expect(content).toContain("startTask did not return runtime turnId");
    expect(content).toMatch(
      /method: "submitHostResponse"[\s\S]*actionScope: \{[\s\S]*sessionId: SESSION_ID,[\s\S]*turnId: runtimeTurnId[\s\S]*\}/,
    );
    expect(content).toMatch(
      /method: "cancelTask"[\s\S]*args: \{[\s\S]*taskId: TASK_ID,[\s\S]*sessionId: SESSION_ID,[\s\S]*turnId: runtimeTurnId[\s\S]*\}/,
    );
    expect(content).toContain("SDK startTask 未返回有效 turnId");
    expect(content).toContain(
      "external backend turnStart turnId 未与 SDK startTask 返回值一致",
    );
    expect(content).toContain(
      "external backend turnCancel turnId 未使用 SDK startTask 返回值",
    );
    expect(content).toContain(
      "turnId: sdkEvidence.result?.taskLifecycle?.startTask?.turnId ?? null",
    );
    expect(content).not.toContain("backendSummary.startTurnId === TURN_ID");
    expect(content).not.toContain("backendSummary.cancelTurnId === TURN_ID");
  });

  it("replays App Server artifact and evidence facts into the SDK task record", () => {
    const content = readSmokeScript();

    expect(content).toContain('type: "artifact.snapshot"');
    expect(content).toContain("ARTIFACT_ID");
    expect(content).toContain("ARTIFACT_REF");
    expect(content).toContain("contentFactoryWorkspacePatch");
    expect(content).toContain('kind: "content_batch"');
    expect(content).toContain("readArtifactEvidenceFromTaskRecord(secondRead)");
    expect(content).toContain("artifactEventType: artifactCreated.type");
    expect(content).toContain("evidenceEventType: evidenceRecorded.type");
    expect(content).toContain("resultArtifactRefs");
    expect(content).toContain("workspacePatchKind");
    expect(content).toContain('"artifact:created"');
    expect(content).toContain('"evidence:recorded"');
    expect(content).toContain(
      "SDK secondRead 未从 App Server read model replay artifact:created",
    );
    expect(content).toContain(
      "SDK secondRead 未从 App Server read model replay evidence:recorded",
    );
    expect(content).toContain(
      "SDK secondRead result.artifacts 未包含 App Server artifact path",
    );
  });

  it("replays App Server tool call facts into the SDK task record", () => {
    const content = readSmokeScript();

    expect(content).toContain('type: "tool.started"');
    expect(content).toContain('type: "tool.result"');
    expect(content).toContain("TOOL_CALL_ID");
    expect(content).toContain("TOOL_NAME");
    expect(content).toContain("TOOL_OUTPUT_PREVIEW");
    expect(content).toContain("readToolCallEvidenceFromTaskRecord(secondRead)");
    expect(content).toContain("readTaskResultToolCalls(task)");
    expect(content).toContain('event?.type !== "task:toolCall"');
    expect(content).toContain("result?.tool_calls");
    expect(content).toContain("result?.thread_read");
    expect(content).toContain("toolEventType: toolCall.type");
    expect(content).toContain("readModelToolCallCount");
    expect(content).toContain("readModelOutputPreview");
    expect(content).toContain(
      "toolEvidence: sanitizeJson(sdkEvidence.result?.toolEvidence ?? null)",
    );
    expect(content).toContain(
      "SDK secondRead 未从 App Server read model replay task:toolCall",
    );
    expect(content).toContain(
      "SDK secondRead result thread_read.tool_calls missing App Server tool call",
    );
    expect(content).toContain(
      "SDK task:toolCall 未携带 App Server outputPreview",
    );
  });

  it("declares adapter capabilities in installed state and readiness", () => {
    const content = readSmokeScript();

    expect(content).toContain('"lime.agent": "^0.3.0"');
    expect(content).toContain('"lime.storage": "^0.3.0"');
    expect(content).toContain('"lime.artifacts": "^0.3.0"');
    expect(content).toContain('"lime.evidence": "^0.3.0"');
    expect(content).toContain('"lime.knowledge": "^0.3.0"');
    expect(content).toContain("REQUIRED_HOST_ADAPTER_CAPABILITIES");
    for (const capability of [
      "lime.agent",
      "lime.storage",
      "lime.artifacts",
      "lime.evidence",
      "lime.knowledge",
    ]) {
      expect(content).toContain(`capability: "${capability}"`);
    }
    expect(content).toContain('requestedRange: "^0.3.0"');
    expect(content).toContain('declaredBy: ["requires"]');
    expect(content).toContain('declaredBy: ["entry"]');
    expect(content).toContain("supportedCapabilities: [");
    expect(content).toContain('implementation: "adapter"');
    expect(content).toContain("Host Snapshot 仍把 ${capability} 标为 blocked");
  });

  it("uses external App Server backend evidence and rejects mocks or legacy runtime", () => {
    const content = readSmokeScript();

    expect(content).toContain('APP_SERVER_BACKEND_MODE: "external"');
    expect(content).toContain("APP_SERVER_BACKEND_COMMAND: process.execPath");
    expect(content).toContain("APP_SERVER_BACKEND_ARGS: JSON.stringify");
    expect(content).toContain("writeFixtureBackend(");
    expect(content).toContain('kind === "turnStart"');
    expect(content).toContain('kind === "actionRespond"');
    expect(content).toContain('kind === "turnCancel"');
    expect(content).toContain("hostOptionsAsterChatRequestSeen");
    expect(content).toContain("turnConfigMirrorSeen");
    expect(content).toContain("provider_config");
    expect(content).toContain("system_prompt");
    expect(content).toContain("reasoning_effort");
    expect(content).toContain("approval_policy");
    expect(content).toContain("sandbox_policy");
    expect(content).toContain("web_search");
    expect(content).toContain("execution_strategy");
    expect(content).not.toContain('APP_SERVER_BACKEND_MODE: "mock"');
    expect(content).not.toContain('backendMode: "mock"');
    expect(content).not.toContain("mockPriorityCommands");
    expect(content).not.toContain("defaultMocks");
    expect(content).not.toContain("invokeMockOnly");
    expect(content).not.toContain("explicitMockFallback");
    expect(content).not.toContain("agent_runtime_submit_turn");
    expect(content).not.toContain("agent_runtime_get_thread_read");
    expect(content).not.toContain("agent_runtime_respond_action");
    expect(content).not.toContain("agent_runtime_interrupt_turn");
  });
});
