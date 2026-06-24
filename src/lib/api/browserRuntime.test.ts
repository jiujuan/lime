import { describe, expect, it, vi } from "vitest";

import {
  closeBrowserSession,
  executeBrowserSessionAction,
  listBrowserSessionEvents,
  listBrowserSessionTargets,
  openBrowserSession,
  readBrowserSession,
} from "./browserRuntime";
import {
  METHOD_BROWSER_SESSION_ACTION_EXECUTE,
  METHOD_BROWSER_SESSION_CLOSE,
  METHOD_BROWSER_SESSION_EVENT_LIST,
  METHOD_BROWSER_SESSION_OPEN,
  METHOD_BROWSER_SESSION_READ,
  METHOD_BROWSER_SESSION_TARGET_LIST,
} from "../../../packages/app-server-client/src/protocol";

const session = {
  sessionId: "browser-session-1",
  profileKey: "task-profile",
  targetId: "target-1",
  targetTitle: "Example",
  targetUrl: "https://example.com",
  remoteDebuggingPort: 9222,
  wsDebuggerUrl: "ws://127.0.0.1:9222/devtools/page/target-1",
  transportKind: "cdp_frames",
  lifecycleState: "live",
  controlMode: "agent",
  createdAt: "2026-06-24T00:00:00Z",
  connected: true,
};

function clientWithResult(result: unknown) {
  return {
    request: vi.fn().mockResolvedValue({ result }),
  };
}

describe("browserRuntime api", () => {
  it("routes target listing through App Server browserSession/target/list", async () => {
    const client = clientWithResult({
      targets: [{ id: "target-1", title: "Example", url: "https://example.com" }],
    });

    const response = await listBrowserSessionTargets(
      { remoteDebuggingPort: 9222 },
      { appServerClient: client },
    );

    expect(client.request).toHaveBeenCalledWith(
      METHOD_BROWSER_SESSION_TARGET_LIST,
      { remoteDebuggingPort: 9222 },
    );
    expect(response.targets).toHaveLength(1);
  });

  it("routes session lifecycle and action methods through current App Server methods", async () => {
    const openClient = clientWithResult({ session });
    await expect(
      openBrowserSession(
        {
          profileKey: "task-profile",
          remoteDebuggingPort: 9222,
          launchUrl: "https://example.com",
        },
        { appServerClient: openClient },
      ),
    ).resolves.toEqual({ session });
    expect(openClient.request).toHaveBeenCalledWith(METHOD_BROWSER_SESSION_OPEN, {
      profileKey: "task-profile",
      remoteDebuggingPort: 9222,
      launchUrl: "https://example.com",
    });

    const readClient = clientWithResult({ session });
    await readBrowserSession(
      { sessionId: "browser-session-1" },
      { appServerClient: readClient },
    );
    expect(readClient.request).toHaveBeenCalledWith(METHOD_BROWSER_SESSION_READ, {
      sessionId: "browser-session-1",
    });

    const eventsClient = clientWithResult({
      events: [{ sessionId: "browser-session-1", sequence: 1, occurredAt: "now" }],
      nextCursor: 1,
    });
    await listBrowserSessionEvents(
      { sessionId: "browser-session-1", cursor: 0 },
      { appServerClient: eventsClient },
    );
    expect(eventsClient.request).toHaveBeenCalledWith(
      METHOD_BROWSER_SESSION_EVENT_LIST,
      { sessionId: "browser-session-1", cursor: 0 },
    );

    const actionClient = clientWithResult({
      sessionId: "browser-session-1",
      action: "get_page_info",
      result: { title: "Example" },
    });
    await executeBrowserSessionAction(
      { sessionId: "browser-session-1", action: "get_page_info" },
      { appServerClient: actionClient },
    );
    expect(actionClient.request).toHaveBeenCalledWith(
      METHOD_BROWSER_SESSION_ACTION_EXECUTE,
      { sessionId: "browser-session-1", action: "get_page_info" },
    );

    const closeClient = clientWithResult({
      status: "closed",
      sessionId: "browser-session-1",
    });
    await closeBrowserSession(
      { sessionId: "browser-session-1" },
      { appServerClient: closeClient },
    );
    expect(closeClient.request).toHaveBeenCalledWith(
      METHOD_BROWSER_SESSION_CLOSE,
      { sessionId: "browser-session-1" },
    );
  });
});
