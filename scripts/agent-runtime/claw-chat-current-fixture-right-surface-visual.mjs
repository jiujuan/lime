import {
  APP_SERVER_METHOD_WORKSPACE_RIGHT_SURFACE_PENDING_LIST,
  APP_SERVER_METHOD_WORKSPACE_RIGHT_SURFACE_REQUEST,
  EXPERT_SKILLS_RUNTIME_SESSION_ID,
} from "./claw-chat-current-fixture-constants.mjs";
import { invokeAppServerFromPage } from "./claw-chat-current-fixture-rpc.mjs";
import {
  assert,
  sanitizeJson,
  sleep,
} from "./claw-chat-current-fixture-utils.mjs";

const RIGHT_SURFACE_ROOTS = {
  expertInfo: "expert-info-panel",
  files: "workspace-files-surface",
  objectCanvas: "workspace-object-canvas-surface",
};

export async function runRightSurfaceVisualMatrix({
  page,
  options,
  workspace,
  appServerRequests,
  sessionId = EXPERT_SKILLS_RUNTIME_SESSION_ID,
}) {
  assert(
    workspace?.workspaceId,
    "Right Surface visual matrix 缺少 workspaceId",
  );
  assert(
    workspace?.rootPath,
    "Right Surface visual matrix 缺少 workspace rootPath",
  );

  const requests = {
    files: await requestRightSurfacePending(page, appServerRequests, {
      workspace,
      sessionId,
      surfaceKind: "files",
      candidateId: "internal/roadmap/rightsurface/README.md",
      metadata: {
        relativePath: "internal/roadmap/rightsurface/README.md",
        title: "Right Surface roadmap",
      },
    }),
    objectCanvas: await requestRightSurfacePending(page, appServerRequests, {
      workspace,
      sessionId,
      surfaceKind: "objectCanvas",
      candidateId: "right-surface-visual-browser-session",
      metadata: {
        candidateId: "right-surface-visual-browser-session",
        title: "Right Surface visual browser session",
        url: "https://example.com/right-surface-object-canvas",
        sessionId: "fixture-browser-session",
        profileKey: "fixture-profile",
        targetId: "fixture-target",
        lifecycleState: "ready",
        controlMode: "inspect",
        transportKind: "cdp",
      },
    }),
  };

  const captures = {
    files: await clickAndAssertRightSurface(page, options, {
      surfaceKind: "files",
      toggleTestId: "task-center-files-toggle",
      rootTestId: RIGHT_SURFACE_ROOTS.files,
    }),
    objectCanvas: await clickAndAssertRightSurface(page, options, {
      surfaceKind: "objectCanvas",
      toggleTestId: "task-center-object-canvas-toggle",
      rootTestId: RIGHT_SURFACE_ROOTS.objectCanvas,
    }),
    expertInfo: await clickAndAssertRightSurface(page, options, {
      surfaceKind: "expertInfo",
      toggleTestId: "task-center-expert-info-toggle",
      rootTestId: RIGHT_SURFACE_ROOTS.expertInfo,
    }),
  };

  const pendingAfterClicks = await invokeAppServerFromPage(
    page,
    APP_SERVER_METHOD_WORKSPACE_RIGHT_SURFACE_PENDING_LIST,
    {
      workspaceId: workspace.workspaceId,
      workspaceRoot: workspace.rootPath,
      sessionId,
      limit: 20,
    },
    appServerRequests,
  );

  return sanitizeJson({
    sessionId,
    requests: {
      files: summarizeRightSurfaceRequest(requests.files),
      objectCanvas: summarizeRightSurfaceRequest(requests.objectCanvas),
    },
    captures,
    pendingAfterClicks: summarizePendingList(pendingAfterClicks.result),
  });
}

async function requestRightSurfacePending(
  page,
  appServerRequests,
  { workspace, sessionId, surfaceKind, candidateId, metadata },
) {
  return await invokeAppServerFromPage(
    page,
    APP_SERVER_METHOD_WORKSPACE_RIGHT_SURFACE_REQUEST,
    {
      workspaceId: workspace.workspaceId,
      workspaceRoot: workspace.rootPath,
      sessionId,
      surfaceKind,
      origin: "fixture:right-surface-visual-matrix",
      priority: "normal",
      candidateId,
      ttlMs: 120_000,
      metadata,
    },
    appServerRequests,
  );
}

async function clickAndAssertRightSurface(
  page,
  options,
  { surfaceKind, toggleTestId, rootTestId },
) {
  const toggle = await waitForRightSurfaceToggle(page, options, toggleTestId);
  await clickRightSurfaceToggle(page, toggleTestId);
  const opened = await waitForRightSurfaceSnapshot(page, options, {
    surfaceKind,
    rootTestId,
  });

  await sleep(1_000);
  const stable = await captureRightSurfaceSnapshot(page, {
    surfaceKind,
    rootTestId,
  });
  assertRightSurfaceSnapshot(stable, surfaceKind);

  return {
    toggle,
    opened,
    stable,
  };
}

async function waitForRightSurfaceToggle(page, options, testId) {
  const startedAt = Date.now();
  let lastSnapshot = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await page.evaluate(
      ({ testId }) => {
        const element = document.querySelector(`[data-testid="${testId}"]`);
        const rect = element?.getBoundingClientRect();
        const style = element ? window.getComputedStyle(element) : null;
        const button =
          element instanceof HTMLButtonElement
            ? element
            : element?.closest("button");
        const visible = Boolean(
          element &&
          rect &&
          rect.width > 8 &&
          rect.height > 8 &&
          style?.display !== "none" &&
          style?.visibility !== "hidden",
        );
        return {
          testId,
          visible,
          disabled:
            button instanceof HTMLButtonElement
              ? button.disabled ||
                button.getAttribute("aria-disabled") === "true"
              : null,
          ariaExpanded: button?.getAttribute("aria-expanded") ?? null,
          title: button?.getAttribute("title") ?? "",
          text: button?.textContent ?? "",
          rect: rect ? rectToJson(rect) : null,
        };

        function rectToJson(rect) {
          return {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            top: Math.round(rect.top),
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            bottom: Math.round(rect.bottom),
          };
        }
      },
      { testId },
    );
    lastSnapshot = snapshot;
    if (snapshot.visible && snapshot.disabled === false) {
      return snapshot;
    }
    await sleep(options.intervalMs);
  }

  throw new Error(
    `Right Surface 顶部按钮不可用: ${testId}; snapshot=${JSON.stringify(
      sanitizeJson(lastSnapshot),
    )}`,
  );
}

async function clickRightSurfaceToggle(page, testId) {
  const clicked = await page.evaluate(
    ({ testId }) => {
      const element = document.querySelector(`[data-testid="${testId}"]`);
      const button =
        element instanceof HTMLButtonElement
          ? element
          : element?.closest("button");
      if (!button) {
        return { clicked: false, reason: "missing-button" };
      }
      button.click();
      return {
        clicked: true,
        testId,
        ariaExpanded: button.getAttribute("aria-expanded"),
        title: button.getAttribute("title") || "",
      };
    },
    { testId },
  );
  assert(clicked.clicked, `Right Surface 顶部按钮点击失败: ${testId}`);
  return clicked;
}

async function waitForRightSurfaceSnapshot(
  page,
  options,
  { surfaceKind, rootTestId },
) {
  const startedAt = Date.now();
  let lastSnapshot = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await captureRightSurfaceSnapshot(page, {
      surfaceKind,
      rootTestId,
    });
    lastSnapshot = snapshot;
    if (isRightSurfaceSnapshotReady(snapshot, surfaceKind)) {
      return snapshot;
    }
    await sleep(options.intervalMs);
  }

  throw new Error(
    `Right Surface 未打开目标 surface: ${surfaceKind}; snapshot=${JSON.stringify(
      sanitizeJson(lastSnapshot),
    )}`,
  );
}

async function captureRightSurfaceSnapshot(page, { surfaceKind, rootTestId }) {
  return await page.evaluate(
    ({ surfaceKind, rootTestId, roots }) => {
      const host = document.querySelector(
        '[data-testid="workspace-right-surface-host"]',
      );
      const canvasPanel = document.querySelector(
        '[data-testid="layout-canvas-panel"]',
      );
      const layoutRoot = document.querySelector(
        '[data-testid="layout-transition-root"]',
      );
      const root = document.querySelector(`[data-testid="${rootTestId}"]`);
      const hostRect = rectFor(host);
      const canvasPanelRect = rectFor(canvasPanel);
      const rootRect = rectFor(root);
      const rootVisibility = Object.fromEntries(
        Object.entries(roots).map(([kind, testId]) => {
          const node = document.querySelector(`[data-testid="${testId}"]`);
          return [kind, visibleInfo(node)];
        }),
      );
      const visibleRootKinds = Object.entries(rootVisibility)
        .filter(([, value]) => value.visible)
        .map(([kind]) => kind);
      const hostCanvasWidthDelta =
        hostRect && canvasPanelRect
          ? Math.abs(hostRect.width - canvasPanelRect.width)
          : null;
      const hostCanvasHeightDelta =
        hostRect && canvasPanelRect
          ? Math.abs(hostRect.height - canvasPanelRect.height)
          : null;
      const rootHostWidthDelta =
        hostRect && rootRect ? Math.abs(hostRect.width - rootRect.width) : null;
      const rootHostHeightDelta =
        hostRect && rootRect
          ? Math.abs(hostRect.height - rootRect.height)
          : null;

      return {
        expectedSurface: surfaceKind,
        activeSurface: host?.getAttribute("data-surface") ?? null,
        layoutMode: layoutRoot?.getAttribute("data-effective-mode") ?? null,
        hostVisible: visibleInfo(host).visible,
        rootVisible: visibleInfo(root).visible,
        visibleRootKinds,
        rootVisibility,
        rects: {
          host: hostRect,
          canvasPanel: canvasPanelRect,
          root: rootRect,
        },
        geometry: {
          hostCanvasWidthDelta,
          hostCanvasHeightDelta,
          rootHostWidthDelta,
          rootHostHeightDelta,
          hostFillsCanvasPanel:
            Boolean(hostRect && canvasPanelRect) &&
            hostRect.width >= 360 &&
            hostRect.height >= 500 &&
            hostCanvasWidthDelta <= 8 &&
            hostCanvasHeightDelta <= 8,
          rootFillsHost:
            Boolean(hostRect && rootRect) &&
            rootRect.width >= hostRect.width - 8 &&
            rootRect.height >= hostRect.height - 8,
        },
        bodyTextSample: (document.body?.innerText || "").slice(0, 2000),
      };

      function visibleInfo(node) {
        const rect = node?.getBoundingClientRect();
        const style = node ? window.getComputedStyle(node) : null;
        return {
          exists: Boolean(node),
          visible: Boolean(
            node &&
            rect &&
            rect.width > 8 &&
            rect.height > 8 &&
            style?.display !== "none" &&
            style?.visibility !== "hidden" &&
            Number(style?.opacity ?? "1") > 0,
          ),
          rect: rect ? rectToJson(rect) : null,
        };
      }

      function rectFor(node) {
        const rect = node?.getBoundingClientRect();
        return rect ? rectToJson(rect) : null;
      }

      function rectToJson(rect) {
        return {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          top: Math.round(rect.top),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          bottom: Math.round(rect.bottom),
        };
      }
    },
    {
      surfaceKind,
      rootTestId,
      roots: RIGHT_SURFACE_ROOTS,
    },
  );
}

function isRightSurfaceSnapshotReady(snapshot, surfaceKind) {
  return (
    snapshot?.activeSurface === surfaceKind &&
    snapshot?.hostVisible === true &&
    snapshot?.rootVisible === true &&
    Array.isArray(snapshot?.visibleRootKinds) &&
    snapshot.visibleRootKinds.length === 1 &&
    snapshot.visibleRootKinds[0] === surfaceKind &&
    snapshot?.geometry?.hostFillsCanvasPanel === true &&
    snapshot?.geometry?.rootFillsHost === true
  );
}

function assertRightSurfaceSnapshot(snapshot, surfaceKind) {
  assert(
    isRightSurfaceSnapshotReady(snapshot, surfaceKind),
    `Right Surface stable snapshot 未保持目标 surface: ${surfaceKind}; snapshot=${JSON.stringify(
      sanitizeJson(snapshot),
    )}`,
  );
}

function summarizeRightSurfaceRequest(invocation) {
  const pending = invocation?.result?.pending ?? {};
  return sanitizeJson({
    requestId: invocation?.result?.requestId ?? pending.requestId ?? null,
    status: invocation?.result?.status ?? pending.status ?? null,
    surfaceKind: pending.surfaceKind ?? null,
    candidateId: pending.candidateId ?? null,
    origin: pending.origin ?? null,
  });
}

function summarizePendingList(result) {
  const pending = Array.isArray(result?.pending) ? result.pending : [];
  return sanitizeJson({
    count: pending.length,
    surfaces: pending.map((request) => ({
      requestId: request?.requestId ?? null,
      surfaceKind: request?.surfaceKind ?? null,
      status: request?.status ?? null,
      candidateId: request?.candidateId ?? null,
    })),
  });
}
