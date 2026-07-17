import { useMemo, useState } from "react";
import {
  CheckCircle2,
  LoaderCircle,
  MonitorUp,
  PlugZap,
  RefreshCw,
  Unplug,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  closeBrowserSession,
  listBrowserSessionTargets,
  openBrowserSession,
  readBrowserSession,
  type BrowserSessionState,
  type BrowserSessionTargetInfo,
} from "@/lib/api/browserRuntime";

type ConnectionPhase =
  | "idle"
  | "checking"
  | "available"
  | "connecting"
  | "connected"
  | "closing"
  | "closed"
  | "error";

const DEFAULT_REMOTE_DEBUGGING_PORT = "9222";
const MIN_PORT = 1;
const MAX_PORT = 65_535;

function parsePort(value: string): number | null {
  const port = Number(value);
  if (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) {
    return null;
  }
  return port;
}

function profileKeyForTarget(port: number, targetId: string): string {
  const targetKey = targetId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 48);
  return `manual-cdp-${port}-${targetKey || "page"}`;
}

function phaseTone(phase: ConnectionPhase): string {
  switch (phase) {
    case "connected":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "available":
    case "closed":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "error":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "checking":
    case "connecting":
    case "closing":
      return "border-amber-200 bg-amber-50 text-amber-700";
    default:
      return "border-slate-200 bg-slate-100 text-slate-600";
  }
}

export function ChromeRelaySettings() {
  const { t } = useTranslation("settings");
  const [portInput, setPortInput] = useState(DEFAULT_REMOTE_DEBUGGING_PORT);
  const [targets, setTargets] = useState<BrowserSessionTargetInfo[]>([]);
  const [selectedTargetId, setSelectedTargetId] = useState("");
  const [session, setSession] = useState<BrowserSessionState | null>(null);
  const [phase, setPhase] = useState<ConnectionPhase>("idle");
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const port = parsePort(portInput);
  const selectedTarget = useMemo(
    () => targets.find((target) => target.id === selectedTargetId) ?? null,
    [selectedTargetId, targets],
  );
  const busy = ["checking", "connecting", "closing"].includes(phase);

  const checkTargets = async () => {
    if (port === null) {
      setErrorKey("settings.browserConnection.error.invalidPort");
      setPhase("error");
      return;
    }

    setErrorKey(null);
    setPhase("checking");
    try {
      const response = await listBrowserSessionTargets({
        remoteDebuggingPort: port,
      });
      const nextTargets = (response.targets ?? []).filter(
        (target) =>
          (target.targetType ?? "page") === "page" &&
          Boolean(target.webSocketDebuggerUrl),
      );
      setTargets(nextTargets);
      setSelectedTargetId((current) =>
        nextTargets.some((target) => target.id === current)
          ? current
          : (nextTargets[0]?.id ?? ""),
      );
      setPhase("available");
    } catch {
      setTargets([]);
      setSelectedTargetId("");
      setErrorKey("settings.browserConnection.error.unavailable");
      setPhase("error");
    }
  };

  const connectSelectedTarget = async () => {
    if (port === null || !selectedTarget) {
      return;
    }

    setErrorKey(null);
    setPhase("connecting");
    let openedSessionId: string | null = null;
    try {
      const opened = await openBrowserSession({
        profileKey: profileKeyForTarget(port, selectedTarget.id),
        remoteDebuggingPort: port,
        targetId: selectedTarget.id,
      });
      openedSessionId = opened.session.sessionId;
      const current = await readBrowserSession({
        sessionId: opened.session.sessionId,
      });
      setSession(current.session);
      setPhase("connected");
    } catch {
      if (openedSessionId) {
        await closeBrowserSession({ sessionId: openedSessionId }).catch(
          () => undefined,
        );
      }
      setSession(null);
      setErrorKey("settings.browserConnection.error.connectFailed");
      setPhase("error");
    }
  };

  const disconnect = async () => {
    if (!session) {
      return;
    }

    setErrorKey(null);
    setPhase("closing");
    try {
      await closeBrowserSession({ sessionId: session.sessionId });
      setSession(null);
      setPhase("closed");
    } catch {
      setErrorKey("settings.browserConnection.error.closeFailed");
      setPhase("error");
    }
  };

  return (
    <div
      className="mx-auto w-full max-w-[800px] space-y-6 pb-10"
      data-testid="browser-connection-settings"
      data-connection-state={phase}
      data-target-count={targets.length}
    >
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
            <MonitorUp className="h-5 w-5" />
          </span>
          <h2 className="text-base font-semibold text-slate-900">
            {t("settings.browserConnection.title")}
          </h2>
        </div>
        <span
          className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${phaseTone(phase)}`}
          aria-live="polite"
          data-testid="browser-connection-status"
        >
          {busy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}
          {t(`settings.browserConnection.status.${phase}`)}
        </span>
      </header>

      <section className="space-y-4" aria-labelledby="browser-connection-port-label">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1 space-y-2">
            <label
              id="browser-connection-port-label"
              htmlFor="browser-connection-port"
              className="block text-sm font-medium text-slate-900"
            >
              {t("settings.browserConnection.port")}
            </label>
            <input
              id="browser-connection-port"
              data-testid="browser-connection-port"
              type="number"
              min={MIN_PORT}
              max={MAX_PORT}
              inputMode="numeric"
              value={portInput}
              disabled={busy || Boolean(session)}
              onChange={(event) => setPortInput(event.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100 disabled:bg-slate-50 disabled:text-slate-500"
            />
          </div>
          <button
            type="button"
            data-testid="browser-connection-check"
            onClick={() => void checkTargets()}
            disabled={busy || Boolean(session)}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className="h-4 w-4" />
            {t("settings.browserConnection.action.check")}
          </button>
        </div>

        {errorKey ? (
          <div
            role="alert"
            data-testid="browser-connection-error"
            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700"
          >
            {t(errorKey)}
          </div>
        ) : null}
      </section>

      {targets.length > 0 && !session ? (
        <section className="space-y-3 border-t border-slate-200 pt-5">
          <h3 className="text-sm font-semibold text-slate-900">
            {t("settings.browserConnection.targets.title")}
          </h3>
          <div className="divide-y divide-slate-100 border-y border-slate-200" role="radiogroup">
            {targets.map((target) => (
              <label
                key={target.id}
                className="flex cursor-pointer items-start gap-3 py-3"
                data-testid="browser-connection-target"
              >
                <input
                  type="radio"
                  name="browser-connection-target"
                  value={target.id}
                  checked={selectedTargetId === target.id}
                  onChange={() => setSelectedTargetId(target.id)}
                  className="mt-1 h-4 w-4 accent-sky-600"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-900">
                    {target.title || t("settings.browserConnection.targets.untitled")}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-slate-500">
                    {target.url || t("settings.browserConnection.targets.noUrl")}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <button
            type="button"
            data-testid="browser-connection-connect"
            onClick={() => void connectSelectedTarget()}
            disabled={busy || !selectedTarget}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <PlugZap className="h-4 w-4" />
            {t("settings.browserConnection.action.connect")}
          </button>
        </section>
      ) : null}

      {phase === "available" && targets.length === 0 ? (
        <div
          role="status"
          data-testid="browser-connection-empty"
          className="border-y border-slate-200 py-5 text-sm text-slate-600"
        >
          {t("settings.browserConnection.targets.empty")}
        </div>
      ) : null}

      {session ? (
        <section
          className="space-y-4 border-t border-slate-200 pt-5"
          data-testid="browser-connection-session"
          data-session-connected={session.connected ? "true" : "false"}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                {t("settings.browserConnection.session.title")}
              </div>
              <p className="mt-1 truncate text-xs text-slate-500">
                {session.targetTitle || session.targetUrl}
              </p>
            </div>
            <button
              type="button"
              data-testid="browser-connection-disconnect"
              onClick={() => void disconnect()}
              disabled={busy}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-rose-200 bg-white px-3 text-sm font-medium text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Unplug className="h-4 w-4" />
              {t("settings.browserConnection.action.disconnect")}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
