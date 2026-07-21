import path from "node:path";

export const SETTINGS_GATE_A_STATE_FIXTURE_METHOD = "thread/list";
export const SETTINGS_GATE_A_STATE_ERROR_MARKER =
  "SETTINGS-01 archived state fixture unavailable";

export function readSettingsGateAStateRequest(payload) {
  if (payload?.cmd !== "app_server_handle_json_lines") {
    return null;
  }
  const lines = payload?.args?.request?.lines;
  if (!Array.isArray(lines)) {
    return null;
  }
  for (const line of lines) {
    try {
      const message = JSON.parse(String(line));
      if (
        message?.method === SETTINGS_GATE_A_STATE_FIXTURE_METHOD &&
        message?.params?.archived === true
      ) {
        return message;
      }
    } catch {
      // Non-request JSONL messages belong to the pass-through bridge.
    }
  }
  return null;
}

export function buildSettingsGateAStateBridgeResponse(request, response) {
  return JSON.stringify({
    result: {
      lines: [
        JSON.stringify({
          jsonrpc: "2.0",
          id: request.id,
          ...response,
        }),
      ],
    },
  });
}

async function waitForFixtureRequest(promise, timeoutMs) {
  let timer = null;
  try {
    await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("archived loading fixture request timeout")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

async function installArchivedStateFixture(page) {
  let mode = "pass-through";
  let releaseLoading = null;
  let loadingRequestObserved = null;
  let markLoadingRequestObserved = null;

  const handler = async (route) => {
    let payload = null;
    try {
      payload = route.request().postDataJSON();
    } catch {
      await route.continue();
      return;
    }
    const request = readSettingsGateAStateRequest(payload);
    const currentMode = mode;
    if (!request || currentMode === "pass-through") {
      await route.continue();
      return;
    }

    if (currentMode === "loading-empty") {
      markLoadingRequestObserved?.();
      markLoadingRequestObserved = null;
      await new Promise((resolve) => {
        releaseLoading = resolve;
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: buildSettingsGateAStateBridgeResponse(request, {
          result: { data: [], nextCursor: null },
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: buildSettingsGateAStateBridgeResponse(request, {
        error: {
          code: -32000,
          message: SETTINGS_GATE_A_STATE_ERROR_MARKER,
        },
      }),
    });
  };

  await page.route("**/invoke", handler);
  return {
    beginLoadingEmpty() {
      mode = "loading-empty";
      releaseLoading = null;
      loadingRequestObserved = new Promise((resolve) => {
        markLoadingRequestObserved = resolve;
      });
    },
    async waitForLoadingRequest() {
      if (!loadingRequestObserved) {
        throw new Error("archived loading fixture was not started");
      }
      await waitForFixtureRequest(loadingRequestObserved, 15_000);
    },
    releaseLoading() {
      if (!releaseLoading) {
        throw new Error("archived loading fixture request was not observed");
      }
      const release = releaseLoading;
      releaseLoading = null;
      release();
    },
    beginError() {
      mode = "error";
    },
    stop() {
      mode = "pass-through";
      releaseLoading?.();
      releaseLoading = null;
      markLoadingRequestObserved = null;
      loadingRequestObserved = null;
    },
    async dispose() {
      mode = "pass-through";
      releaseLoading?.();
      releaseLoading = null;
      markLoadingRequestObserved = null;
      loadingRequestObserved = null;
      await page.unroute("**/invoke", handler);
    },
  };
}

async function captureStateObservation(
  page,
  { evidenceDir, state, testId, fixtureOutcome },
) {
  const marker = page.locator(`[data-testid="${testId}"]`);
  await marker.waitFor({ state: "visible", timeout: 15_000 });
  const screenshot = `state-${state}-zh-CN.png`;
  const observation = await marker.evaluate(
    (element, context) => {
      const isVisible = (candidate) => {
        if (!(candidate instanceof HTMLElement)) {
          return false;
        }
        const rect = candidate.getBoundingClientRect();
        const style = getComputedStyle(candidate);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== "none" &&
          style.visibility !== "hidden"
        );
      };
      const text = element.innerText.replace(/\s+/g, " ").trim();
      const rawKeys = text.match(/\bsettings\.[A-Za-z0-9_.-]+\b/g) ?? [];
      return {
        state: context.state,
        tab: "archived-conversations",
        viewport: "desktop",
        locale: "zh-CN",
        fixtureMethod: context.fixtureMethod,
        fixtureOutcome: context.fixtureOutcome,
        testOnly: true,
        testId: element.getAttribute("data-testid"),
        visible: isVisible(element),
        contentHasText: text.length > 8,
        role: element.getAttribute("role"),
        ariaBusy: element.getAttribute("aria-busy") === "true",
        retryVisible: isVisible(
          document.querySelector(
            '[data-testid="settings-archived-conversations-retry"]',
          ),
        ),
        rawTranslationKeyCount: rawKeys.length,
        documentOverflow:
          document.documentElement.scrollWidth > window.innerWidth + 2,
        screenshot: context.screenshot,
      };
    },
    {
      state,
      fixtureOutcome,
      screenshot,
      fixtureMethod: SETTINGS_GATE_A_STATE_FIXTURE_METHOD,
    },
  );
  await page.screenshot({
    path: path.join(evidenceDir, screenshot),
    fullPage: true,
  });
  return observation;
}

export async function runSettingsGateAStateScenarios(page, options) {
  const {
    evidenceDir,
    screenshots,
    stateObservations,
    expectedStateConsoleErrors,
    setStatePhase,
    desktopViewport,
    logStage,
    setLocale,
    clickSettingsTab,
    activateSettingsTab,
    clearInvokeBuffers,
  } = options;
  const fixture = await installArchivedStateFixture(page);

  try {
    logStage("component-state:prepare");
    await page.setViewportSize(desktopViewport);
    await setLocale(page, "zh-CN");
    await clickSettingsTab(page, "home");
    await clearInvokeBuffers(page);

    logStage("component-state:loading");
    fixture.beginLoadingEmpty();
    await activateSettingsTab(page, "archived-conversations");
    const loading = await captureStateObservation(page, {
      evidenceDir,
      state: "loading",
      testId: "settings-archived-conversations-loading",
      fixtureOutcome: "pending",
    });
    stateObservations.push(loading);
    screenshots.push(loading.screenshot);

    logStage("component-state:empty");
    await fixture.waitForLoadingRequest();
    fixture.releaseLoading();
    const empty = await captureStateObservation(page, {
      evidenceDir,
      state: "empty",
      testId: "settings-archived-conversations-empty",
      fixtureOutcome: "empty-list",
    });
    stateObservations.push(empty);
    screenshots.push(empty.screenshot);

    fixture.stop();
    await clickSettingsTab(page, "home");
    await clearInvokeBuffers(page);

    logStage("component-state:error");
    fixture.beginError();
    setStatePhase("error");
    await activateSettingsTab(page, "archived-conversations");
    const error = await captureStateObservation(page, {
      evidenceDir,
      state: "error",
      testId: "settings-archived-conversations-error",
      fixtureOutcome: "rpc-error",
    });
    error.expectedConsoleErrorCount = expectedStateConsoleErrors.length;
    stateObservations.push(error);
    screenshots.push(error.screenshot);
  } finally {
    setStatePhase(null);
    fixture.stop();
    await clearInvokeBuffers(page).catch(() => undefined);
    await fixture.dispose();
  }
}
