import fs from "node:fs";
import { fileURLToPath } from "node:url";
import {
  APP_SERVER_DRAIN_EVENTS_COMMAND,
  APP_SERVER_HANDLE_JSON_LINES_COMMAND,
  APP_SERVER_METHOD_AGENT_SESSION_EVENT,
  APP_SERVER_METHOD_INITIALIZED,
  APP_SERVER_METHOD_INITIALIZE,
  APP_SERVER_METHOD_SESSION_READ,
  APP_SERVER_METHOD_SESSION_THREAD_RESUME,
  APP_SERVER_METHOD_SESSION_TURN_START,
  APP_SERVER_METHOD_WORKSPACE_DEFAULT_ENSURE,
  FIXTURE_MODEL,
  FIXTURE_PROVIDER,
  IMAGE_FIXTURE_MODEL,
  IMAGE_FIXTURE_PROVIDER_NAME,
  SESSION_ID,
} from "./claw-chat-current-fixture-constants.mjs";
import {
  assert,
  readArray,
  readRecord,
  readString,
  sanitizeJson,
  sanitizeText,
  sleep,
} from "./claw-chat-current-fixture-utils.mjs";
import {
  readModelTurnId,
  readModelTurnStatus,
  summarizeReadModelQueueState,
} from "./claw-chat-current-fixture-read-model-core.mjs";

export async function reloadRendererDocument(page, options) {
  const urlBefore = page.url();
  try {
    await page.reload({
      waitUntil: "domcontentloaded",
      timeout: options.timeoutMs,
    });
    return {
      reloaded: true,
      recovered: false,
      urlBefore,
      urlAfter: page.url(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!isRecoverableRendererReloadError(message)) {
      throw error;
    }
    const recovery = await recoverRendererReload(
      page,
      options,
      urlBefore,
      message,
    );
    if (!recovery.recovered) {
      throw error;
    }
    return {
      reloaded: true,
      recovered: true,
      recovery: recovery.method,
      urlBefore,
      urlAfter: page.url(),
      reloadError: sanitizeText(message).slice(0, 240),
    };
  }
}

function isRecoverableRendererReloadError(message) {
  return (
    message.includes("net::ERR_ABORTED") ||
    message.includes("frame was detached") ||
    message.includes("net::ERR_FILE_NOT_FOUND")
  );
}

async function recoverRendererReload(page, options, urlBefore, message) {
  const fileTarget = await waitForFileUrlTarget(urlBefore, options);
  if (fileTarget.exists) {
    await page.goto(urlBefore, {
      waitUntil: "domcontentloaded",
      timeout: options.timeoutMs,
    });
    return {
      recovered: true,
      method: "goto-current-file-url",
      filePath: fileTarget.filePath,
    };
  }
  if (message.includes("net::ERR_FILE_NOT_FOUND")) {
    return {
      recovered: false,
      method: "missing-file-url-target",
      filePath: fileTarget.filePath ?? null,
    };
  }

  await page
    .waitForLoadState("domcontentloaded", {
      timeout: Math.min(options.timeoutMs ?? 30_000, 30_000),
    })
    .catch(() => undefined);
  return {
    recovered: true,
    method: "wait-load-state",
    filePath: fileTarget.filePath ?? null,
  };
}

async function waitForFileUrlTarget(rawUrl, options) {
  const filePath = filePathFromFileUrl(rawUrl);
  if (!filePath) {
    return {
      exists: false,
      filePath: null,
    };
  }

  const startedAt = Date.now();
  const timeoutMs = Math.min(options.timeoutMs ?? 30_000, 10_000);
  while (Date.now() - startedAt < timeoutMs) {
    if (fs.existsSync(filePath)) {
      return {
        exists: true,
        filePath,
      };
    }
    await sleep(options.intervalMs);
  }
  return {
    exists: fs.existsSync(filePath),
    filePath,
  };
}

function filePathFromFileUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "file:") {
      return null;
    }
    return fileURLToPath(parsed);
  } catch {
    return null;
  }
}

export async function waitForAppUrlReady(options) {
  if (!options.appUrl) {
    return null;
  }

  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    try {
      const response = await fetch(options.appUrl, { method: "GET" });
      if (response.ok) {
        return {
          url: options.appUrl,
          status: response.status,
          waitedMs: Date.now() - startedAt,
        };
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(options.intervalMs);
  }

  throw new Error(
    `renderer dev server 未就绪: ${options.appUrl}; lastError=${lastError}`,
  );
}

export function parseJsonRpcLine(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function decodeJsonRpcLines(lines) {
  return Array.isArray(lines)
    ? lines.map(parseJsonRpcLine).filter(Boolean)
    : [];
}

export function agentSessionEventFromMessage(message) {
  if (message?.method !== APP_SERVER_METHOD_AGENT_SESSION_EVENT) {
    return null;
  }
  const event = readRecord(message?.params)?.event;
  if (!event) {
    return null;
  }
  return {
    eventId: readString(event, "eventId", "event_id"),
    sequence:
      typeof event.sequence === "number" && Number.isFinite(event.sequence)
        ? event.sequence
        : null,
    sessionId: readString(event, "sessionId", "session_id"),
    threadId: readString(event, "threadId", "thread_id"),
    turnId: readString(event, "turnId", "turn_id"),
    type: readString(event, "type"),
    timestamp: readString(event, "timestamp"),
    payload: readRecord(event.payload) ?? event.payload ?? null,
  };
}

export function collectAgentSessionEvents(messages) {
  return Array.isArray(messages)
    ? messages.map(agentSessionEventFromMessage).filter(Boolean)
    : [];
}

export function mergeAgentSessionEvents(events, nextEvents) {
  const byKey = new Map();
  for (const event of [...events, ...nextEvents]) {
    const key =
      event.eventId ||
      `${event.sessionId || ""}:${event.turnId || ""}:${event.sequence ?? ""}:${event.type || ""}`;
    byKey.set(key, event);
  }
  return [...byKey.values()].sort((left, right) => {
    const leftSequence =
      typeof left.sequence === "number"
        ? left.sequence
        : Number.MAX_SAFE_INTEGER;
    const rightSequence =
      typeof right.sequence === "number"
        ? right.sequence
        : Number.MAX_SAFE_INTEGER;
    return leftSequence - rightSequence;
  });
}

export function summarizeAgentSessionEvents(events, turnId) {
  const scopedEvents = events.filter((event) => event.turnId === turnId);
  const terminalTypes = new Set([
    "turn.completed",
    "turn.done",
    "turn.final_done",
    "turn.failed",
    "turn.canceled",
    "turn.cancelled",
  ]);
  return sanitizeJson({
    eventCount: events.length,
    scopedEventCount: scopedEvents.length,
    eventTypes: scopedEvents.map((event) => event.type).filter(Boolean),
    eventTurnIds: Array.from(
      new Set(scopedEvents.map((event) => event.turnId).filter(Boolean)),
    ),
    hasTextDelta: scopedEvents.some((event) => event.type === "message.delta"),
    hasToolStarted: scopedEvents.some((event) => event.type === "tool.started"),
    hasToolResult: scopedEvents.some((event) => event.type === "tool.result"),
    hasCompleted: scopedEvents.some((event) => event.type === "turn.completed"),
    hasTerminal: scopedEvents.some((event) => terminalTypes.has(event.type)),
    terminalTypes: scopedEvents
      .map((event) => event.type)
      .filter((type) => terminalTypes.has(type)),
    sequences: scopedEvents
      .map((event) => event.sequence)
      .filter((sequence) => typeof sequence === "number"),
  });
}

export function collectTraceRequestMethods(traceMessages) {
  return traceMessages
    .filter((entry) => entry?.command === APP_SERVER_HANDLE_JSON_LINES_COMMAND)
    .flatMap((entry) =>
      decodeJsonRpcLines(entry?.args_preview?.request?.lines).map(
        (message) => message.method,
      ),
    )
    .filter(Boolean);
}

export function readTraceMessages(traceRaw) {
  try {
    const parsed = JSON.parse(traceRaw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function isTransientPageEvaluationError(error) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    message.includes("Execution context was destroyed") ||
    message.includes("most likely because of a navigation") ||
    message.includes("Cannot find context with specified id")
  );
}

export async function evaluatePageSnapshot(page, pageFunction, arg) {
  try {
    return await page.evaluate(pageFunction, arg);
  } catch (error) {
    if (isTransientPageEvaluationError(error)) {
      return null;
    }
    throw error;
  }
}

export async function waitForRendererReady(page, options, onSnapshot) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await evaluatePageSnapshot(page, () => ({
      url: window.location.href,
      title: document.title || "",
      electron: window.__LIME_ELECTRON__ === true,
      hasInvokeBridge: typeof window.electronAPI?.invoke === "function",
      supportsAppServer:
        typeof window.electronAPI?.supportsCommand === "function" &&
        window.electronAPI.supportsCommand("app_server_handle_json_lines"),
      startupVisible: Boolean(
        document.querySelector("[data-lime-startup-shell]"),
      ),
      appSidebarVisible: Boolean(
        document.querySelector('[data-testid="app-sidebar"]'),
      ),
      bodyText: document.body?.innerText || "",
    }));
    if (!snapshot) {
      await sleep(options.intervalMs);
      continue;
    }
    onSnapshot?.(snapshot);
    if (
      snapshot.electron &&
      snapshot.hasInvokeBridge &&
      snapshot.supportsAppServer &&
      !snapshot.startupVisible &&
      snapshot.appSidebarVisible
    ) {
      return snapshot;
    }
    await sleep(options.intervalMs);
  }
  throw new Error("Electron renderer / App Server bridge 未就绪");
}

export async function clearInvokeBuffers(page) {
  await page.evaluate(() => {
    window.localStorage.removeItem("lime_invoke_error_buffer_v1");
    window.localStorage.removeItem("lime_invoke_trace_buffer_v1");
  });
}

export async function invokeAppServerFromPage(
  page,
  method,
  params = {},
  requestLog,
) {
  const requestEntry = requestLog
    ? { method, params: sanitizeJson(params) }
    : null;
  requestLog?.push(requestEntry);
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const invocation = await page.evaluate(
        async ({ command, method, params }) => {
          const invoke = window.electronAPI?.invoke;
          if (typeof invoke !== "function") {
            throw new Error("Electron preload invoke bridge is unavailable");
          }
          const id = `claw-chat-current-${Date.now()}-${Math.random()}`;
          const response = await invoke(command, {
            request: {
              lines: [
                JSON.stringify({
                  jsonrpc: "2.0",
                  id,
                  method,
                  params,
                }),
              ],
            },
          });
          const messages = Array.isArray(response?.lines)
            ? response.lines
                .map((line) => {
                  try {
                    return JSON.parse(line);
                  } catch {
                    return null;
                  }
                })
                .filter(Boolean)
            : [];
          const error = messages.find(
            (message) => message?.id === id && message.error,
          );
          if (error) {
            throw new Error(`${method} failed: ${JSON.stringify(error.error)}`);
          }
          const result = messages.find(
            (message) =>
              message?.id === id &&
              Object.prototype.hasOwnProperty.call(message, "result"),
          );
          if (!result) {
            throw new Error(`${method} did not return a JSON-RPC result`);
          }
          return {
            result: result.result,
            messages,
          };
        },
        {
          command: APP_SERVER_HANDLE_JSON_LINES_COMMAND,
          method,
          params,
        },
      );
      if (requestEntry) {
        requestEntry.response = summarizeAppServerInvocationResult(
          method,
          invocation.result,
        );
      }
      return invocation;
    } catch (error) {
      if (requestEntry) {
        requestEntry.error = sanitizeText(error);
      }
      if (!isTransientPageEvaluationError(error) || attempt === 2) {
        throw error;
      }
      lastError = error;
      await sleep(250);
    }
  }
  throw lastError ?? new Error(`${method} App Server invocation failed`);
}

export function summarizeAppServerInvocationResult(method, result) {
  if (method === APP_SERVER_METHOD_SESSION_TURN_START) {
    const turn = readRecord(result?.turn) ?? {};
    return sanitizeJson({
      turnId: readModelTurnId(turn),
      status: readModelTurnStatus(turn),
      sessionId: readString(turn, "session_id", "sessionId"),
      threadId: readString(turn, "thread_id", "threadId"),
    });
  }

  if (method === APP_SERVER_METHOD_SESSION_THREAD_RESUME) {
    const turns = readArray(result, "turns").map((turn) => ({
      turnId: readModelTurnId(turn),
      status: readModelTurnStatus(turn),
    }));
    return sanitizeJson({
      resumed: result?.resumed ?? null,
      turnCount: turns.length,
      turns,
    });
  }

  if (method === APP_SERVER_METHOD_SESSION_READ) {
    return summarizeReadModelQueueState(result);
  }

  return null;
}

export async function drainAppServerEventsFromPage(page, limit = 50) {
  return await page.evaluate(
    async ({ command, limit }) => {
      const invoke = window.electronAPI?.invoke;
      if (typeof invoke !== "function") {
        throw new Error("Electron preload invoke bridge is unavailable");
      }
      const response = await invoke(command, {
        request: {
          includeRecent: true,
          limit,
        },
      });
      const messages = Array.isArray(response?.lines)
        ? response.lines
            .map((line) => {
              try {
                return JSON.parse(line);
              } catch {
                return null;
              }
            })
            .filter(Boolean)
        : [];
      return {
        messages,
      };
    },
    {
      command: APP_SERVER_DRAIN_EVENTS_COMMAND,
      limit,
    },
  );
}

export async function initializeAppServer(page, requestLog) {
  const initialize = await invokeAppServerFromPage(
    page,
    APP_SERVER_METHOD_INITIALIZE,
    {
      clientInfo: {
        name: "claw-chat-current-fixture",
        version: "1.0.0",
      },
      capabilities: { eventMethods: ["agentSession/event"] },
    },
    requestLog,
  );
  requestLog?.push({ method: APP_SERVER_METHOD_INITIALIZED, params: {} });
  await page.evaluate(async (command) => {
    await window.electronAPI.invoke(command, {
      request: {
        lines: [JSON.stringify({ jsonrpc: "2.0", method: "initialized" })],
      },
    });
  }, APP_SERVER_HANDLE_JSON_LINES_COMMAND);
  return initialize.result;
}

export async function ensureDefaultWorkspace(page, requestLog) {
  const ensured = await invokeAppServerFromPage(
    page,
    APP_SERVER_METHOD_WORKSPACE_DEFAULT_ENSURE,
    {},
    requestLog,
  );
  const workspace = ensured.result?.workspace;
  const workspaceId = String(workspace?.id || "").trim();
  assert(workspaceId, "workspace/default/ensure 未返回可用 workspace.id");
  return {
    workspaceId,
    rootPath: workspace?.rootPath || workspace?.root_path || null,
    workspace,
  };
}

export async function ensureFixtureImageProvider(
  page,
  requestLog,
  options = {},
) {
  const apiHost =
    typeof options.apiHost === "string" && options.apiHost.trim()
      ? options.apiHost.trim()
      : "https://example.invalid/v1";
  const created = await invokeAppServerFromPage(
    page,
    "modelProvider/create",
    {
      name: IMAGE_FIXTURE_PROVIDER_NAME,
      providerType: "openai",
      apiHost,
    },
    requestLog,
  );
  const provider = created.result?.provider;
  const providerId = String(provider?.id || "").trim();
  assert(providerId, "modelProvider/create 未返回 fixture 图片 Provider id");

  await invokeAppServerFromPage(
    page,
    "modelProvider/update",
    {
      providerId,
      enabled: true,
      customModels: [IMAGE_FIXTURE_MODEL],
      sortOrder: 1,
    },
    requestLog,
  );
  await invokeAppServerFromPage(
    page,
    "modelProviderKey/create",
    {
      providerId,
      apiKey: "sk-claw-image-fixture",
      alias: "claw-image-fixture-key",
      replaceExisting: true,
    },
    requestLog,
  );

  const configBinding = await page.evaluate(
    async ({
      providerId,
      modelId,
      localImageServerApiKey,
      localImageServerHost,
      localImageServerPort,
    }) => {
      const invoke = window.electronAPI?.invoke;
      if (typeof invoke !== "function") {
        throw new Error("Electron preload invoke bridge is unavailable");
      }
      const currentConfig = await invoke("get_config");
      const nextConfig = {
        ...(currentConfig || {}),
        server: {
          ...(currentConfig?.server || {}),
          host:
            typeof localImageServerHost === "string" &&
            localImageServerHost.trim()
              ? localImageServerHost.trim()
              : currentConfig?.server?.host,
          port:
            typeof localImageServerPort === "number" &&
            Number.isFinite(localImageServerPort) &&
            localImageServerPort > 0
              ? localImageServerPort
              : currentConfig?.server?.port,
          api_key:
            typeof localImageServerApiKey === "string" &&
            localImageServerApiKey.trim()
              ? localImageServerApiKey.trim()
              : currentConfig?.server?.api_key,
        },
        workspace_preferences: {
          ...(currentConfig?.workspace_preferences || {}),
          media_defaults: {
            ...(currentConfig?.workspace_preferences?.media_defaults || {}),
            image: {
              preferredProviderId: providerId,
              preferredModelId: modelId,
              allowFallback: false,
            },
          },
        },
      };
      await invoke("save_config", { config: nextConfig });
      try {
        window.localStorage.setItem(
          "lime.app-config.changed-at",
          String(Date.now()),
        );
      } catch {
        // ignore
      }
      window.dispatchEvent(
        new CustomEvent("provider-data-changed", {
          detail: {
            source: "fixture_refresh",
            timestamp: Date.now(),
          },
        }),
      );
      window.dispatchEvent(new Event("lime:app-config-changed"));
      return {
        providerId,
        modelId,
        localImageServerApiKeyConfigured: Boolean(nextConfig.server?.api_key),
        localImageServerEndpoint: {
          host: nextConfig.server?.host ?? null,
          port: nextConfig.server?.port ?? null,
        },
        imageDefaults:
          nextConfig.workspace_preferences?.media_defaults?.image ?? null,
      };
    },
    {
      providerId,
      modelId: IMAGE_FIXTURE_MODEL,
      localImageServerApiKey: options.localImageServerApiKey ?? null,
      localImageServerHost: options.localImageServerHost ?? null,
      localImageServerPort: options.localImageServerPort ?? null,
    },
  );

  return sanitizeJson({
    providerId,
    providerName: provider?.name ?? IMAGE_FIXTURE_PROVIDER_NAME,
    apiHost,
    modelId: IMAGE_FIXTURE_MODEL,
    configBinding,
  });
}

export async function bindGuiWorkspaceAndModelPreferences(page, workspaceId) {
  return await page.evaluate(
    ({ workspaceId, sessionId, provider, model }) => {
      const providerKey = `agent_pref_provider_${workspaceId}`;
      const modelKey = `agent_pref_model_${workspaceId}`;
      const migratedKey = `agent_pref_migrated_${workspaceId}`;
      const sessionProviderKey = `agent_topic_model_pref_${workspaceId}_${sessionId}`;
      const sessionWorkspaceKey = `agent_session_workspace_${sessionId}`;
      const lastProjectKey = "agent_last_project_id";
      const openedProjectIdsKey = "agent_opened_project_ids";

      const openedProjectIds = (() => {
        try {
          const parsed = JSON.parse(
            window.localStorage.getItem(openedProjectIdsKey) || "[]",
          );
          return Array.isArray(parsed)
            ? parsed.filter(
                (projectId) =>
                  typeof projectId === "string" && projectId.trim(),
              )
            : [];
        } catch {
          return [];
        }
      })();
      const nextOpenedProjectIds = Array.from(
        new Set([...openedProjectIds, workspaceId]),
      );

      window.localStorage.setItem("lime:agent-debug", "1");
      window.localStorage.setItem(lastProjectKey, JSON.stringify(workspaceId));
      window.localStorage.setItem(
        openedProjectIdsKey,
        JSON.stringify(nextOpenedProjectIds),
      );
      window.localStorage.setItem(providerKey, JSON.stringify(provider));
      window.localStorage.setItem(modelKey, JSON.stringify(model));
      window.localStorage.setItem(migratedKey, JSON.stringify(true));
      window.localStorage.setItem(
        sessionProviderKey,
        JSON.stringify({ providerType: provider, model }),
      );
      window.localStorage.setItem(
        `aster_execution_strategy_${workspaceId}`,
        JSON.stringify("react"),
      );
      window.localStorage.setItem(
        `aster_access_mode_${workspaceId}`,
        JSON.stringify("full-access"),
      );
      window.localStorage.setItem(
        sessionWorkspaceKey,
        JSON.stringify(workspaceId),
      );
      window.dispatchEvent(
        new CustomEvent("agent-persisted-project-id-changed", {
          detail: {
            key: lastProjectKey,
            projectId: workspaceId,
          },
        }),
      );
      window.dispatchEvent(
        new CustomEvent("agent-opened-project-ids-changed", {
          detail: {
            projectIds: nextOpenedProjectIds,
          },
        }),
      );
      window.dispatchEvent(new Event("focus"));

      return {
        lastProject: window.localStorage.getItem(lastProjectKey),
        openedProjects: window.localStorage.getItem(openedProjectIdsKey),
        provider: window.localStorage.getItem(providerKey),
        model: window.localStorage.getItem(modelKey),
        sessionProvider: window.localStorage.getItem(sessionProviderKey),
        sessionWorkspace: window.localStorage.getItem(sessionWorkspaceKey),
      };
    },
    {
      workspaceId,
      sessionId: SESSION_ID,
      provider: FIXTURE_PROVIDER,
      model: FIXTURE_MODEL,
    },
  );
}
