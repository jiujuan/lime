export type BrowserSessionAdapterKind = "embedded" | "cdp" | "unknown";

export interface BrowserSessionRef {
  browserSessionId: string | null;
  profileKey: string | null;
  adapterKind: BrowserSessionAdapterKind;
  launchUrl: string | null;
  title: string | null;
  sourceRequestId: string | null;
}

export interface BrowserSessionRefInput {
  browserSessionId?: string | null;
  profileKey?: string | null;
  adapterKind?: string | null;
  launchUrl?: string | null;
  title?: string | null;
  sourceRequestId?: string | null;
  targetId?: string | null;
}

export interface BrowserAssistSessionStateLike {
  sessionId?: string | null;
  profileKey?: string | null;
  url?: string | null;
  title?: string | null;
  targetId?: string | null;
  transportKind?: string | null;
}

type BrowserSessionStateLike = Record<string, unknown> | null | undefined;

export function buildBrowserSessionRef(
  input: BrowserSessionRefInput,
): BrowserSessionRef {
  const browserSessionId = normalizeNullableText(input.browserSessionId);
  const targetId = normalizeNullableText(input.targetId);
  return {
    browserSessionId,
    profileKey: normalizeNullableText(input.profileKey),
    adapterKind:
      normalizeAdapterKind(input.adapterKind) ??
      inferAdapterKind(browserSessionId, targetId),
    launchUrl: normalizeNullableText(input.launchUrl),
    title: normalizeNullableText(input.title),
    sourceRequestId: normalizeNullableText(input.sourceRequestId),
  };
}

export function buildBrowserSessionRefFromCdpState(
  session: BrowserSessionStateLike,
  options: {
    sourceRequestId?: string | null;
    launchUrl?: string | null;
  } = {},
): BrowserSessionRef {
  const lastPageInfo = asRecord(
    session?.lastPageInfo ?? session?.last_page_info,
  );
  return buildBrowserSessionRef({
    browserSessionId: firstString(session?.sessionId, session?.session_id),
    profileKey: firstString(session?.profileKey, session?.profile_key),
    adapterKind: "cdp",
    launchUrl: firstString(
      options.launchUrl,
      lastPageInfo?.url,
      session?.targetUrl,
      session?.target_url,
    ),
    title: firstString(
      lastPageInfo?.title,
      session?.targetTitle,
      session?.target_title,
    ),
    sourceRequestId: options.sourceRequestId,
    targetId: firstString(session?.targetId, session?.target_id),
  });
}

export function buildBrowserSessionRefFromBrowserAssistMetadata(
  metadata: unknown,
  options: {
    sourceRequestId?: string | null;
  } = {},
): BrowserSessionRef | null {
  const root = asRecord(metadata);
  const harness = asRecord(root?.harness);
  const browserAssist =
    asRecord(root?.browser_assist) ||
    asRecord(root?.browserAssist) ||
    asRecord(harness?.browser_assist) ||
    asRecord(harness?.browserAssist);
  const browser = asRecord(root?.browser);
  const candidates = [browserAssist, browser, harness, root];
  const browserSessionId = firstString(
    ...candidates.map((candidate) =>
      firstString(
        candidate?.browserSessionId,
        candidate?.browser_session_id,
        candidate?.sessionId,
        candidate?.session_id,
      ),
    ),
  );
  const profileKey = firstString(
    ...candidates.map((candidate) =>
      firstString(candidate?.profileKey, candidate?.profile_key),
    ),
  );
  const launchUrl = firstString(
    ...candidates.map((candidate) =>
      firstString(
        candidate?.launchUrl,
        candidate?.launch_url,
        candidate?.browserLaunchUrl,
        candidate?.browser_launch_url,
        candidate?.targetUrl,
        candidate?.target_url,
        candidate?.url,
        candidate?.href,
      ),
    ),
  );
  const title = firstString(
    ...candidates.map((candidate) =>
      firstString(
        candidate?.title,
        candidate?.pageTitle,
        candidate?.page_title,
        candidate?.targetTitle,
        candidate?.target_title,
      ),
    ),
  );
  const targetId = firstString(
    ...candidates.map((candidate) =>
      firstString(candidate?.targetId, candidate?.target_id),
    ),
  );
  const adapterKind = resolveBrowserAssistAdapterKind(
    ...candidates.map((candidate) =>
      firstString(
        candidate?.adapterKind,
        candidate?.adapter_kind,
        candidate?.preferredBackend,
        candidate?.preferred_backend,
        candidate?.transportKind,
        candidate?.transport_kind,
      ),
    ),
  );

  if (!browserSessionId && !profileKey && !launchUrl && !title && !targetId) {
    return null;
  }

  return buildBrowserSessionRef({
    browserSessionId,
    profileKey,
    adapterKind,
    launchUrl,
    title,
    sourceRequestId: firstString(
      options.sourceRequestId,
      root?.sourceRequestId,
      root?.source_request_id,
      browserAssist?.sourceRequestId,
      browserAssist?.source_request_id,
    ),
    targetId,
  });
}

export function buildBrowserSessionRefFromBrowserAssistSessionState(
  sessionState: BrowserAssistSessionStateLike | null | undefined,
  options: {
    sourceRequestId?: string | null;
  } = {},
): BrowserSessionRef | null {
  if (!sessionState) {
    return null;
  }

  const browserSessionId = firstString(sessionState.sessionId);
  const profileKey = firstString(sessionState.profileKey);
  const launchUrl = firstString(sessionState.url);
  const title = firstString(sessionState.title);
  const targetId = firstString(sessionState.targetId);
  if (!browserSessionId && !profileKey && !launchUrl && !title && !targetId) {
    return null;
  }

  return buildBrowserSessionRef({
    browserSessionId,
    profileKey,
    adapterKind: resolveBrowserAssistAdapterKind(
      sessionState.transportKind ?? null,
    ),
    launchUrl,
    title,
    sourceRequestId: options.sourceRequestId,
    targetId,
  });
}

function inferAdapterKind(
  browserSessionId: string | null,
  targetId: string | null,
): BrowserSessionAdapterKind {
  if (browserSessionId || targetId) {
    return "cdp";
  }
  return "embedded";
}

function normalizeAdapterKind(
  value: string | null | undefined,
): BrowserSessionAdapterKind | null {
  const normalized = normalizeNullableText(value)?.toLowerCase();
  if (!normalized) {
    return null;
  }
  if (
    normalized === "cdp" ||
    normalized === "browser-runtime" ||
    normalized === "external-chrome"
  ) {
    return "cdp";
  }
  if (
    normalized === "embedded" ||
    normalized === "webcontentsview" ||
    normalized === "right-surface"
  ) {
    return "embedded";
  }
  return "unknown";
}

function resolveBrowserAssistAdapterKind(
  ...values: Array<string | null>
): BrowserSessionAdapterKind | null {
  let hasExplicitValue = false;
  for (const value of values) {
    const normalized = normalizeNullableText(value)?.toLowerCase();
    if (!normalized) {
      continue;
    }
    hasExplicitValue = true;
    if (
      normalized === "cdp" ||
      normalized === "cdp_direct" ||
      normalized === "cdp_frames" ||
      normalized === "browser-runtime" ||
      normalized === "external-chrome"
    ) {
      return "cdp";
    }
    if (
      normalized === "embedded" ||
      normalized === "webcontentsview" ||
      normalized === "right-surface"
    ) {
      return "embedded";
    }
  }
  if (hasExplicitValue) {
    return "unknown";
  }
  return null;
}

function normalizeNullableText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized || null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    const normalized = normalizeNullableText(value);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
