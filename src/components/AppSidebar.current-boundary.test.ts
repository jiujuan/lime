import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
  return readFileSync(join(cwd(), relativePath), "utf8");
}

function sourceBetween(
  source: string,
  startNeedle: string,
  endNeedle: string,
): string {
  const start = source.indexOf(startNeedle);
  expect(start, `missing ${startNeedle}`).toBeGreaterThanOrEqual(0);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  expect(end, `missing ${endNeedle}`).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("AppSidebar current App Server session boundary", () => {
  it("侧栏归档 / 恢复入口只能经 agentRuntime session gateway 更新 session", () => {
    const source = readSource(
      "src/components/app-sidebar/useAppSidebarConversationActions.ts",
    );
    const archiveHandler = sourceBetween(
      source,
      "const toggleSessionArchive = useCallback(",
      "const deleteConversation = useCallback(",
    );

    expect(archiveHandler).toContain("await updateAgentRuntimeSession({");
    expect(archiveHandler).toContain("session_id: session.id");
    expect(archiveHandler).toContain("archived,");
    expect(archiveHandler).toContain(
      "moveSidebarSessionArchiveStateOptimistically(nextSession)",
    );
    expect(archiveHandler).toContain("refreshSidebarSessions");
    expect(archiveHandler).not.toContain("deleteAgentRuntimeSession");
    expect(archiveHandler).not.toContain("safeInvoke");
    expect(archiveHandler).not.toContain("invokeCommand");
    expect(archiveHandler).not.toContain("agent_runtime_");
  });

  it("agentRuntime session gateway 不应把 session update / delete 回流到 legacy command", () => {
    const source = readSource("src/lib/api/agentRuntime/sessionClient.ts");
    const updateFunction = sourceBetween(
      source,
      "async function updateAgentRuntimeSession(",
      "async function deleteAgentRuntimeSession(",
    );
    const deleteFunction = sourceBetween(
      source,
      "async function deleteAgentRuntimeSession(",
      "return {",
    );

    expect(updateFunction).toContain(
      "appServerSessionClient.updateAgentRuntimeSession(request)",
    );
    expect(deleteFunction).toContain(
      "return await updateAgentRuntimeSession({",
    );
    expect(deleteFunction).toContain("session_id: sessionId");
    expect(deleteFunction).toContain("archived: true");
    expect(source).not.toContain('"agent_runtime_update_session"');
    expect(source).not.toContain('"agent_runtime_delete_session"');
    expect(source).not.toContain("invokeCommand(");
  });

  it("App Server session gateway 必须通过 agentSession/list/read/update 事实源", () => {
    const source = readSource(
      "src/lib/api/agentRuntime/appServerSessionClient.ts",
    );
    const listFunction = sourceBetween(
      source,
      "async function listAgentRuntimeSessions(",
      "async function getAgentRuntimeSession(",
    );
    const getFunction = sourceBetween(
      source,
      "async function getAgentRuntimeSession(",
      "async function updateAgentRuntimeSession(",
    );
    const updateFunction = sourceBetween(
      source,
      "async function updateAgentRuntimeSession(",
      "return {",
    );

    expect(listFunction).toContain("METHOD_AGENT_SESSION_LIST");
    expect(getFunction).toContain("appServerClient.readSession(");
    expect(updateFunction).toContain("appServerClient.updateSession(");
    expect(source).not.toContain('"agent_runtime_list_sessions"');
    expect(source).not.toContain('"agent_runtime_get_session"');
    expect(source).not.toContain('"agent_runtime_update_session"');
    expect(source).not.toContain("safeInvoke");
    expect(source).not.toContain("invokeCommand");
  });
});
