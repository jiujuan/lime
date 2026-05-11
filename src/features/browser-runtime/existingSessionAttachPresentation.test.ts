import { describe, expect, it } from "vitest";
import {
  buildExistingSessionAttachPresentation,
  type ExistingSessionAttachPresentationCopy,
} from "./existingSessionAttachPresentation";

const PRESENTATION_COPY: ExistingSessionAttachPresentationCopy = {
  status: {
    checking: {
      label: "Checking bridge",
      description: "Confirming the current Chrome bridge connection.",
    },
    waiting: {
      label: "Waiting for bridge",
      description: "Connect the Lime Browser Bridge extension first.",
    },
    reading: {
      label: "Reading page",
      description: "Syncing the current Chrome page summary.",
    },
    attached: {
      label: "Attached current Chrome",
      description: "Reusing your current Chrome page.",
    },
  },
  placeholder: {
    default:
      "Attach current Chrome can take over a live session when available.",
    checking: "Checking the current Chrome bridge connection...",
    waiting: "Install and connect Lime Browser Bridge in the current browser.",
    reading: "Reading the current Chrome page summary...",
  },
  actions: {
    reading: "Reading",
    checking: "Checking",
    readPage: "Read page",
    refreshBridge: "Refresh bridge",
    refreshing: "Refreshing...",
    refreshBridgeStatus: "Refresh bridge status",
    readCurrentPage: "Read current page",
    readTabs: "Read tabs",
  },
  hint: {
    embedded: {
      connected: "Attach mode is connected.",
      waiting: "Connect Lime Browser Bridge first.",
    },
    live: {
      connected: "Attach mode can take over the live view when available.",
      waiting: "Connect Lime Browser Bridge first.",
    },
  },
};

describe("existingSessionAttachPresentation", () => {
  it("检查桥接中时应返回检测态文案", () => {
    const presentation = buildExistingSessionAttachPresentation(
      {
        loading: true,
        observerConnected: false,
        pageLoading: false,
        tabsLoading: false,
      },
      PRESENTATION_COPY,
    );

    expect(presentation.statusInfo.label).toBe("Checking bridge");
    expect(presentation.placeholder).toContain("Checking the current Chrome");
    expect(presentation.embeddedActionLabel).toBe("Checking");
    expect(presentation.contextActionLabel).toBe("Refreshing...");
  });

  it("未连接 observer 时应返回桥接引导文案", () => {
    const presentation = buildExistingSessionAttachPresentation(
      {
        loading: false,
        observerConnected: false,
        pageLoading: false,
        tabsLoading: false,
      },
      PRESENTATION_COPY,
    );

    expect(presentation.statusInfo.label).toBe("Waiting for bridge");
    expect(presentation.placeholder).toContain("Install and connect");
    expect(presentation.embeddedControlHint).toContain(
      "Connect Lime Browser Bridge first",
    );
    expect(presentation.liveViewHint).toContain(
      "Connect Lime Browser Bridge first",
    );
  });

  it("已连接后应返回读取与切页相关文案", () => {
    const presentation = buildExistingSessionAttachPresentation(
      {
        loading: false,
        observerConnected: true,
        pageLoading: false,
        tabsLoading: true,
      },
      PRESENTATION_COPY,
    );

    expect(presentation.statusInfo.label).toBe("Attached current Chrome");
    expect(presentation.embeddedActionLabel).toBe("Read page");
    expect(presentation.pageActionLabel).toBe("Read current page");
    expect(presentation.tabsActionLabel).toBe("Refreshing...");
  });
});
