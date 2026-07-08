import {
  isRecord,
  readString,
} from "./hostBridgeClientProtocol";
import type {
  LimeHostBridgeCapabilityInvoker,
  LimeHostThemeDocumentLike,
  LimeHostThemeSnapshot,
  SyncLimeHostThemeOptions,
} from "./hostBridgeClientTypes";

function readThemePayload(value: unknown): LimeHostThemeSnapshot | null {
  if (!isRecord(value)) {
    return null;
  }
  const theme = isRecord(value.theme) ? value.theme : value;
  if (!isRecord(theme)) {
    return null;
  }
  const tokens = isRecord(theme.tokens)
    ? Object.fromEntries(
        Object.entries(theme.tokens).filter(
          (entry): entry is [string, string] =>
            typeof entry[0] === "string" &&
            typeof entry[1] === "string" &&
            entry[1].trim().length > 0,
        ),
      )
    : undefined;
  const snapshot: LimeHostThemeSnapshot = {};
  const themeMode = readString(theme.themeMode);
  const effectiveThemeMode = readString(theme.effectiveThemeMode);
  const colorSchemeId = readString(theme.colorSchemeId);
  if (themeMode) snapshot.themeMode = themeMode;
  if (effectiveThemeMode) snapshot.effectiveThemeMode = effectiveThemeMode;
  if (colorSchemeId) snapshot.colorSchemeId = colorSchemeId;
  if (tokens) snapshot.tokens = tokens;
  return snapshot;
}

export function applyLimeHostTheme(
  payload: unknown,
  options: SyncLimeHostThemeOptions = {},
): LimeHostThemeSnapshot | null {
  const theme = readThemePayload(payload);
  if (!theme) {
    return null;
  }
  const documentRef =
    options.documentRef ??
    (typeof document === "undefined"
      ? undefined
      : (document as unknown as LimeHostThemeDocumentLike));
  const root = documentRef?.documentElement;
  if (!root) {
    return theme;
  }
  const allowedTokenPrefixes = options.allowedTokenPrefixes ?? [
    "--lime-",
    "--app-",
  ];
  for (const [name, value] of Object.entries(theme.tokens ?? {})) {
    if (!allowedTokenPrefixes.some((prefix) => name.startsWith(prefix))) {
      continue;
    }
    root.style.setProperty(name, value);
  }
  if (theme.themeMode) {
    root.dataset.limeTheme = theme.themeMode;
  }
  if (theme.effectiveThemeMode) {
    root.dataset.limeThemeEffective = theme.effectiveThemeMode;
    root.style.colorScheme =
      theme.effectiveThemeMode === "dark" ? "dark" : "light";
  }
  if (theme.colorSchemeId) {
    root.dataset.limeColorScheme = theme.colorSchemeId;
  }
  return theme;
}

export function syncLimeHostTheme(
  invoker: Pick<
    LimeHostBridgeCapabilityInvoker,
    "onHostSnapshot" | "onThemeUpdate" | "getHostSnapshot"
  >,
  options: SyncLimeHostThemeOptions = {},
): () => void {
  const apply = (payload: unknown) => {
    applyLimeHostTheme(payload, options);
  };
  const offSnapshot = invoker.onHostSnapshot(apply);
  const offTheme = invoker.onThemeUpdate(apply);
  void invoker.getHostSnapshot().then((response) => {
    if (response.ok) {
      apply(response.value);
    }
  });
  return () => {
    offSnapshot();
    offTheme();
  };
}
