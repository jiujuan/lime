import { hasTauriInvokeCapability } from "@/lib/tauri-runtime";

const STARTUP_REVEAL_SETTLE_DELAY_MS = 80;
const STARTUP_REVEAL_PAINT_TIMEOUT_MS = 180;
const STARTUP_REVEAL_VIEWPORT_STABLE_FRAMES = 3;
const STARTUP_REVEAL_VIEWPORT_TIMEOUT_MS = 900;
const STARTUP_REVEAL_LOGO_TIMEOUT_MS = 240;
const STARTUP_LOGO_SELECTOR = "[data-lime-startup-logo]";

type StartupWindowAction = () => Promise<void>;

type StartupWindow = {
  unminimize?: StartupWindowAction;
  show?: StartupWindowAction;
  setFocus?: StartupWindowAction;
};

let startupWindowRevealRequested = false;

interface ViewportSize {
  width: number;
  height: number;
}

function waitForTimeout(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, timeoutMs);
  });
}

function readViewportSize(): ViewportSize {
  const viewport = window.visualViewport;

  return {
    width: Math.round(viewport?.width ?? window.innerWidth),
    height: Math.round(viewport?.height ?? window.innerHeight),
  };
}

function waitForAnimationFrame(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

async function waitForStableViewport(): Promise<void> {
  if (typeof window === "undefined" || !window.requestAnimationFrame) {
    return;
  }

  const deadline =
    window.performance.now() + STARTUP_REVEAL_VIEWPORT_TIMEOUT_MS;
  let previous = readViewportSize();
  let stableFrames = 0;

  while (
    stableFrames < STARTUP_REVEAL_VIEWPORT_STABLE_FRAMES &&
    window.performance.now() < deadline
  ) {
    await waitForAnimationFrame();

    const next = readViewportSize();
    if (
      next.width > 0 &&
      next.height > 0 &&
      next.width === previous.width &&
      next.height === previous.height
    ) {
      stableFrames += 1;
    } else {
      stableFrames = 0;
      previous = next;
    }
  }
}

async function waitForNextPaint(): Promise<void> {
  if (typeof window === "undefined" || !window.requestAnimationFrame) {
    return;
  }

  await Promise.race([
    new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => resolve());
      });
    }),
    waitForTimeout(STARTUP_REVEAL_PAINT_TIMEOUT_MS),
  ]);
  await waitForTimeout(STARTUP_REVEAL_SETTLE_DELAY_MS);
}

async function waitForStartupLogoDecode(): Promise<void> {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return;
  }

  const logo = document.querySelector<HTMLImageElement>(STARTUP_LOGO_SELECTOR);
  if (!logo || (logo.complete && logo.naturalWidth > 0)) {
    return;
  }

  if (typeof logo.decode === "function") {
    await Promise.race([
      logo.decode().catch(() => undefined),
      waitForTimeout(STARTUP_REVEAL_LOGO_TIMEOUT_MS),
    ]);
    return;
  }

  await Promise.race([
    new Promise<void>((resolve) => {
      logo.addEventListener("load", () => resolve(), { once: true });
      logo.addEventListener("error", () => resolve(), { once: true });
    }),
    waitForTimeout(STARTUP_REVEAL_LOGO_TIMEOUT_MS),
  ]);
}

async function runStartupWindowAction(
  action: StartupWindowAction | undefined,
): Promise<void> {
  if (!action) {
    return;
  }

  try {
    await action();
  } catch (error) {
    console.warn("[StartupWindowReveal] 窗口展示动作失败:", error);
  }
}

async function revealCurrentWindow(): Promise<void> {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const windowApi = getCurrentWindow() as StartupWindow;

    await runStartupWindowAction(windowApi.unminimize?.bind(windowApi));
    await runStartupWindowAction(windowApi.show?.bind(windowApi));
    await runStartupWindowAction(windowApi.setFocus?.bind(windowApi));
  } catch (error) {
    console.warn("[StartupWindowReveal] 主窗口展示失败:", error);
  }
}

export function revealStartupWindowWhenReady(): void {
  if (startupWindowRevealRequested || !hasTauriInvokeCapability()) {
    return;
  }

  startupWindowRevealRequested = true;
  void (async () => {
    await waitForStartupLogoDecode();
    await waitForStableViewport();
    await waitForNextPaint();
    await revealCurrentWindow();
  })();
}

export function resetStartupWindowRevealForTest(): void {
  startupWindowRevealRequested = false;
}
