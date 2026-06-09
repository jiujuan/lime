import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openExternalUrlWithSystemBrowser } from "@/lib/api/externalUrl";
import type { RelayInfo } from "@/hooks/useDeepLink";
import { ConnectConfirmDialog } from "./ConnectConfirmDialog";

vi.mock("@/lib/api/externalUrl", () => ({
  openExternalUrlWithSystemBrowser: vi.fn(),
}));

interface MountedHarness {
  container: HTMLDivElement;
  root: Root;
}

const mountedRoots: MountedHarness[] = [];

const baseRelay: RelayInfo = {
  id: "relay-one",
  name: "Relay One",
  description: "Relay provider",
  branding: {
    logo: "",
    color: "#10b981",
  },
  links: {
    homepage: "https://relay.example.com",
  },
  api: {
    base_url: "https://api.relay.example.com",
    protocol: "openai",
    auth_header: "Authorization",
    auth_prefix: "Bearer",
  },
  contact: {},
  features: {
    models: [],
    streaming: true,
    function_calling: false,
    vision: false,
  },
};

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.mocked(openExternalUrlWithSystemBrowser).mockResolvedValue(undefined);
});

afterEach(() => {
  while (mountedRoots.length > 0) {
    const mounted = mountedRoots.pop();
    if (!mounted) break;
    act(() => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }
  vi.clearAllMocks();
});

function renderDialog(relay: RelayInfo): HTMLDivElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <ConnectConfirmDialog
        apiKey="sk-test"
        error={null}
        isSaving={false}
        isVerified={true}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        open={true}
        relay={relay}
        relayId={relay.id}
      />,
    );
  });

  mountedRoots.push({ container, root });
  return container;
}

describe("ConnectConfirmDialog external links", () => {
  it("已验证中转商官网 http/https 链接应交给 externalUrl current 网关", async () => {
    renderDialog(baseRelay);
    const link = document.body.querySelector(
      'a[href="https://relay.example.com"]',
    );

    expect(link).not.toBeNull();
    expect(link?.getAttribute("target")).toBeNull();
    expect(link?.getAttribute("rel")).toBe("noreferrer noopener");

    const clickEvent = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    });

    await act(async () => {
      link?.dispatchEvent(clickEvent);
      await Promise.resolve();
    });

    expect(clickEvent.defaultPrevented).toBe(true);
    expect(openExternalUrlWithSystemBrowser).toHaveBeenCalledWith(
      "https://relay.example.com",
    );
  });

  it("非 http(s) 官网链接保留原生链接语义", async () => {
    const relay = {
      ...baseRelay,
      links: {
        ...baseRelay.links,
        homepage: "#support",
      },
    };
    renderDialog(relay);
    const link = document.body.querySelector('a[href="#support"]');

    expect(link).not.toBeNull();
    expect(link?.getAttribute("rel")).toBeNull();

    const clickEvent = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    });

    await act(async () => {
      link?.dispatchEvent(clickEvent);
      await Promise.resolve();
    });

    expect(clickEvent.defaultPrevented).toBe(false);
    expect(openExternalUrlWithSystemBrowser).not.toHaveBeenCalled();
  });
});
