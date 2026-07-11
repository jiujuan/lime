interface HomeHotpathPendingShellOptions {
  requestId: string;
  text: string;
}

interface ClearHomeHotpathPendingShellOptions {
  requestId?: string;
  restoreHome?: boolean;
}

interface HiddenHomeFirstScreen {
  element: HTMLElement;
  rootElement: HTMLElement;
  previousAriaHidden: string | null;
  previousDisplay: string;
  previousRootAriaHidden: string | null;
  previousRootDisplay: string;
  previousTestId: string | null;
}

interface ActiveHomeHotpathPendingShell {
  hiddenHomeFirstScreens: HiddenHomeFirstScreen[];
  observer: MutationObserver | null;
  pendingClearFrameId: number | null;
  pendingClearTimeoutId: number | null;
  requestId: string;
  resizeHandler: (() => void) | null;
  shell: HTMLElement;
  timeoutId: number | null;
}

const HOME_FIRST_SCREEN_SELECTOR = '[data-testid="empty-state-first-screen"]';
const PENDING_SHELL_DATA_ATTRIBUTE = "data-home-hotpath-pending-shell";
const PENDING_SHELL_SELECTOR = `[${PENDING_SHELL_DATA_ATTRIBUTE}="true"]`;
const REAL_MESSAGE_LIST_SELECTOR = [
  `[data-testid="message-list-frame"]:not(${PENDING_SHELL_SELECTOR})`,
  `[data-testid="message-list"]:not(${PENDING_SHELL_SELECTOR})`,
].join(", ");
const REAL_MESSAGE_CONTENT_SELECTOR = [
  '[data-testid="message-turn-group"]',
  "[data-message-role]",
].join(", ");

let activeShell: ActiveHomeHotpathPendingShell | null = null;

function isBrowserDomAvailable(): boolean {
  return typeof document !== "undefined" && typeof window !== "undefined";
}

function isHTMLElement(value: Element | null): value is HTMLElement {
  return value instanceof HTMLElement;
}

function hasRealMessageListWithContent(): boolean {
  return Array.from(
    document.querySelectorAll<HTMLElement>(REAL_MESSAGE_LIST_SELECTOR),
  ).some((node) => Boolean(node.querySelector(REAL_MESSAGE_CONTENT_SELECTOR)));
}

function hideHomeFirstScreens(state: ActiveHomeHotpathPendingShell): void {
  document.querySelectorAll(HOME_FIRST_SCREEN_SELECTOR).forEach((node) => {
    if (!isHTMLElement(node)) {
      return;
    }
    if (state.hiddenHomeFirstScreens.some((entry) => entry.element === node)) {
      return;
    }
    const rootElement = isHTMLElement(node.parentElement)
      ? node.parentElement
      : node;

    state.hiddenHomeFirstScreens.push({
      element: node,
      rootElement,
      previousAriaHidden: node.getAttribute("aria-hidden"),
      previousDisplay: node.style.display,
      previousRootAriaHidden: rootElement.getAttribute("aria-hidden"),
      previousRootDisplay: rootElement.style.display,
      previousTestId: node.getAttribute("data-testid"),
    });
    rootElement.setAttribute("aria-hidden", "true");
    rootElement.setAttribute("data-home-hotpath-root-hidden", "true");
    rootElement.style.display = "none";
    node.setAttribute("aria-hidden", "true");
    node.setAttribute("data-home-hotpath-hidden", "true");
    node.removeAttribute("data-testid");
    node.style.display = "none";
  });
}

function restoreHomeFirstScreens(
  hiddenHomeFirstScreens: HiddenHomeFirstScreen[],
): void {
  hiddenHomeFirstScreens.forEach(
    ({
      element,
      rootElement,
      previousAriaHidden,
      previousDisplay,
      previousRootAriaHidden,
      previousRootDisplay,
      previousTestId,
    }) => {
      if (!element.isConnected) {
        return;
      }
      if (rootElement.isConnected) {
        if (previousRootAriaHidden === null) {
          rootElement.removeAttribute("aria-hidden");
        } else {
          rootElement.setAttribute("aria-hidden", previousRootAriaHidden);
        }
        rootElement.removeAttribute("data-home-hotpath-root-hidden");
        rootElement.style.display = previousRootDisplay;
      }
      if (previousTestId === null) {
        element.removeAttribute("data-testid");
      } else {
        element.setAttribute("data-testid", previousTestId);
      }
      if (previousAriaHidden === null) {
        element.removeAttribute("aria-hidden");
      } else {
        element.setAttribute("aria-hidden", previousAriaHidden);
      }
      element.removeAttribute("data-home-hotpath-hidden");
      element.style.display = previousDisplay;
    },
  );
}

function applyShellBounds(shell: HTMLElement): void {
  shell.style.left = "0";
  shell.style.top = "0";
  shell.style.width = "100vw";
  shell.style.height = "100vh";
}

function createPendingShell({
  requestId,
  text,
}: HomeHotpathPendingShellOptions): HTMLElement {
  const shell = document.createElement("div");
  shell.setAttribute(PENDING_SHELL_DATA_ATTRIBUTE, "true");
  shell.setAttribute("data-testid", "message-list-frame");
  shell.setAttribute("data-request-id", requestId);
  shell.setAttribute("role", "log");
  shell.setAttribute("aria-live", "polite");
  Object.assign(shell.style, {
    background:
      "linear-gradient(180deg, rgba(248, 250, 252, 0.98) 0%, rgba(255, 255, 255, 0.96) 100%)",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-start",
    minHeight: "0",
    padding: "22px 0 16px",
    pointerEvents: "none",
    position: "fixed",
    zIndex: "45",
  });

  const scrollContainer = document.createElement("div");
  scrollContainer.setAttribute("data-testid", "message-list-scroll-container");
  Object.assign(scrollContainer.style, {
    boxSizing: "border-box",
    flex: "1 1 auto",
    minHeight: "0",
    overflow: "hidden",
    width: "100%",
  });

  const column = document.createElement("div");
  column.setAttribute("data-testid", "message-list-column");
  Object.assign(column.style, {
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    margin: "0 auto",
    maxWidth: "min(760px, calc(100% - 32px))",
    minHeight: "100%",
    padding: "16px",
    width: "100%",
  });

  const turnGroup = document.createElement("section");
  turnGroup.setAttribute("data-testid", "message-turn-group");
  turnGroup.setAttribute("data-group-index", "1");
  turnGroup.setAttribute("data-runtime-turn-id", "");
  turnGroup.setAttribute("data-last-assistant-message-id", "");
  turnGroup.setAttribute("data-timeline-message-id", "");
  Object.assign(turnGroup.style, {
    display: "flex",
    justifyContent: "flex-end",
    padding: "8px 4px",
    width: "100%",
  });

  const userBubble = document.createElement("div");
  userBubble.setAttribute("data-message-role", "user");
  userBubble.setAttribute("data-message-id", `${requestId}:hotpath-user`);
  userBubble.setAttribute("data-visual-tone", "neutral-user");
  Object.assign(userBubble.style, {
    background: "rgba(240, 253, 244, 0.96)",
    border: "1px solid rgba(187, 247, 208, 0.9)",
    borderRadius: "18px",
    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.06)",
    boxSizing: "border-box",
    color: "#0f172a",
    fontSize: "14px",
    lineHeight: "1.65",
    maxWidth: "min(620px, 82%)",
    overflowWrap: "anywhere",
    padding: "10px 13px",
    whiteSpace: "pre-wrap",
  });
  userBubble.textContent = text.trim() ? text : " ";

  turnGroup.appendChild(userBubble);
  column.appendChild(turnGroup);
  scrollContainer.appendChild(column);
  shell.appendChild(scrollContainer);
  return shell;
}

function cancelScheduledClear(state: ActiveHomeHotpathPendingShell): void {
  if (state.pendingClearFrameId !== null) {
    window.cancelAnimationFrame(state.pendingClearFrameId);
    state.pendingClearFrameId = null;
  }
  if (state.pendingClearTimeoutId !== null) {
    window.clearTimeout(state.pendingClearTimeoutId);
    state.pendingClearTimeoutId = null;
  }
}

function scheduleClearAfterRealMessageList(requestId: string): void {
  const state = activeShell;
  if (!state || state.requestId !== requestId) {
    return;
  }
  if (
    state.pendingClearFrameId !== null ||
    state.pendingClearTimeoutId !== null
  ) {
    return;
  }

  const clearIfStillReady = () => {
    const latestState = activeShell;
    if (!latestState || latestState.requestId !== requestId) {
      return;
    }
    latestState.pendingClearFrameId = null;
    latestState.pendingClearTimeoutId = null;
    if (!hasRealMessageListWithContent()) {
      return;
    }
    clearHomeHotpathPendingShell({ requestId, restoreHome: false });
  };

  if (typeof window.requestAnimationFrame === "function") {
    state.pendingClearFrameId = window.requestAnimationFrame(() => {
      const latestState = activeShell;
      if (!latestState || latestState.requestId !== requestId) {
        return;
      }
      latestState.pendingClearFrameId =
        window.requestAnimationFrame(clearIfStillReady);
    });
    return;
  }

  state.pendingClearTimeoutId = window.setTimeout(clearIfStillReady, 32);
}

function maybeClearAfterRealMessageList(requestId: string): void {
  const state = activeShell;
  if (state?.requestId !== requestId) {
    return;
  }
  if (!hasRealMessageListWithContent()) {
    cancelScheduledClear(state);
    return;
  }
  scheduleClearAfterRealMessageList(requestId);
}

export function applyHomeHotpathPendingShell(
  options: HomeHotpathPendingShellOptions,
): { clear: (restoreHome?: boolean) => void; refresh: () => void } {
  if (!isBrowserDomAvailable()) {
    return { clear: () => {}, refresh: () => {} };
  }

  clearHomeHotpathPendingShell({ restoreHome: true });

  const shell = createPendingShell(options);
  const state: ActiveHomeHotpathPendingShell = {
    hiddenHomeFirstScreens: [],
    observer: null,
    pendingClearFrameId: null,
    pendingClearTimeoutId: null,
    requestId: options.requestId,
    resizeHandler: null,
    shell,
    timeoutId: null,
  };
  activeShell = state;

  hideHomeFirstScreens(state);
  document.body.appendChild(shell);
  applyShellBounds(shell);

  const refresh = () => {
    if (activeShell?.requestId !== options.requestId) {
      return;
    }
    hideHomeFirstScreens(state);
    applyShellBounds(shell);
    maybeClearAfterRealMessageList(options.requestId);
  };

  state.resizeHandler = refresh;
  window.addEventListener("resize", refresh);
  if (typeof MutationObserver !== "undefined") {
    state.observer = new MutationObserver(refresh);
    state.observer.observe(document.body, {
      attributeFilter: ["data-testid"],
      attributes: true,
      childList: true,
      subtree: true,
    });
  }
  if (typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(refresh);
  } else {
    window.setTimeout(refresh, 0);
  }
  state.timeoutId = window.setTimeout(() => {
    clearHomeHotpathPendingShell({
      requestId: options.requestId,
      restoreHome: true,
    });
  }, 15_000);

  return {
    clear: (restoreHome = true) =>
      clearHomeHotpathPendingShell({
        requestId: options.requestId,
        restoreHome,
      }),
    refresh,
  };
}

export function clearHomeHotpathPendingShell({
  requestId,
  restoreHome = true,
}: ClearHomeHotpathPendingShellOptions = {}): void {
  if (!isBrowserDomAvailable() || !activeShell) {
    return;
  }
  if (requestId && activeShell.requestId !== requestId) {
    return;
  }

  const shell = activeShell;
  activeShell = null;
  shell.observer?.disconnect();
  if (shell.resizeHandler) {
    window.removeEventListener("resize", shell.resizeHandler);
  }
  if (shell.timeoutId !== null) {
    window.clearTimeout(shell.timeoutId);
  }
  cancelScheduledClear(shell);
  shell.shell.remove();
  if (restoreHome) {
    restoreHomeFirstScreens(shell.hiddenHomeFirstScreens);
  }
}
