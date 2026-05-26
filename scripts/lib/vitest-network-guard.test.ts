import https from "node:https";
import net from "node:net";
import tls from "node:tls";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  installVitestNetworkGuard,
  isVitestNodeHttpRequestAllowed,
  isVitestNodeSocketConnectAllowed,
  isVitestNetworkUrlAllowed,
  resolveNodeHttpRequestUrl,
  resolveNodeSocketConnectUrl,
  resolveFetchUrl,
  vitestLiveProviderNetworkAllowed,
} from "./vitest-network-guard";

function disableLiveProviderNetwork(): void {
  vi.stubEnv("LIME_ALLOW_LIVE_PROVIDER_SMOKE", "");
  vi.stubEnv("LIME_REAL_API_TEST", "");
}

describe("vitest-network-guard", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("默认不允许 live Provider 网络", () => {
    expect(vitestLiveProviderNetworkAllowed({})).toBe(false);
  });

  it("显式授权时允许 live Provider 网络", () => {
    expect(
      vitestLiveProviderNetworkAllowed({
        LIME_ALLOW_LIVE_PROVIDER_SMOKE: "1",
      }),
    ).toBe(true);
    expect(
      vitestLiveProviderNetworkAllowed({ LIME_REAL_API_TEST: "true" }),
    ).toBe(true);
  });

  it("只允许本地 HTTP，默认阻断外部 Provider URL", () => {
    expect(isVitestNetworkUrlAllowed("http://127.0.0.1:1420/api")).toBe(true);
    expect(isVitestNetworkUrlAllowed("http://localhost:1420/api")).toBe(true);
    expect(isVitestNetworkUrlAllowed("/api/dev-bridge")).toBe(true);
    expect(isVitestNetworkUrlAllowed("data:text/plain,ok")).toBe(true);
    expect(
      isVitestNetworkUrlAllowed("https://api.deepseek.com/v1/chat/completions"),
    ).toBe(false);
    expect(
      isVitestNetworkUrlAllowed("https://api.openai.com/v1/responses"),
    ).toBe(false);
  });

  it("应把相对 URL 解析成本地地址", () => {
    expect(resolveFetchUrl("/api/dev-bridge")?.href).toBe(
      "http://127.0.0.1/api/dev-bridge",
    );
  });

  it("应解析 Node http/https 请求参数并保持本地白名单", () => {
    expect(
      resolveNodeHttpRequestUrl("https:", [
        {
          hostname: "api.deepseek.com",
          path: "/v1/chat/completions",
        },
      ])?.href,
    ).toBe("https://api.deepseek.com/v1/chat/completions");
    expect(
      isVitestNodeHttpRequestAllowed("http:", [
        {
          hostname: "127.0.0.1",
          port: 3030,
          path: "/invoke",
        },
      ]),
    ).toBe(true);
    expect(
      isVitestNodeHttpRequestAllowed("https:", [
        "https://api.deepseek.com/v1/chat/completions",
      ]),
    ).toBe(false);
  });

  it("应解析 Node socket 连接参数并保持本地白名单", () => {
    expect(
      resolveNodeSocketConnectUrl("https:", [
        {
          host: "api.deepseek.com",
          port: 443,
        },
      ])?.href,
    ).toBe("https://api.deepseek.com/");
    expect(
      resolveNodeSocketConnectUrl("https:", [443, "api.deepseek.com"])?.href,
    ).toBe("https://api.deepseek.com/");
    expect(
      isVitestNodeSocketConnectAllowed("http:", [
        {
          host: "127.0.0.1",
          port: 3030,
        },
      ]),
    ).toBe(true);
    expect(
      isVitestNodeSocketConnectAllowed("https:", [
        {
          host: "api.openai.com",
          port: 443,
        },
      ]),
    ).toBe(false);
  });

  it("安装后应在真实请求发出前阻断外部 fetch", async () => {
    disableLiveProviderNetwork();
    installVitestNetworkGuard();

    await expect(
      fetch("https://api.deepseek.com/v1/chat/completions"),
    ).rejects.toThrow("默认禁止 Vitest 外部网络请求");
  });

  it("安装后应在真实请求发出前阻断 Node net.connect", () => {
    disableLiveProviderNetwork();
    installVitestNetworkGuard();

    expect(() => {
      net.connect({ host: "api.deepseek.com", port: 443 });
    }).toThrow("默认禁止 Vitest 外部网络请求");
  });

  it("安装后应在真实请求发出前阻断 Node net.createConnection", () => {
    disableLiveProviderNetwork();
    installVitestNetworkGuard();

    expect(() => {
      net.createConnection({ host: "api.deepseek.com", port: 443 });
    }).toThrow("默认禁止 Vitest 外部网络请求");
  });

  it("安装后应在真实请求发出前阻断 Node tls.connect", () => {
    disableLiveProviderNetwork();
    installVitestNetworkGuard();

    expect(() => {
      tls.connect({ host: "api.deepseek.com", port: 443 });
    }).toThrow("默认禁止 Vitest 外部网络请求");
  });

  it("安装后应在真实请求发出前阻断 Node https.request", () => {
    disableLiveProviderNetwork();
    installVitestNetworkGuard();

    expect(() => {
      https.request("https://api.deepseek.com/v1/chat/completions");
    }).toThrow("默认禁止 Vitest 外部网络请求");
  });

  it("安装后应在真实请求发出前阻断 XMLHttpRequest 外部 URL", () => {
    disableLiveProviderNetwork();
    installVitestNetworkGuard();

    expect(typeof XMLHttpRequest).toBe("function");
    const request = new XMLHttpRequest();

    expect(() => {
      request.open("POST", "https://api.deepseek.com/v1/chat/completions");
    }).toThrow("默认禁止 Vitest 外部网络请求");
  });

  it("安装后仍允许 XMLHttpRequest 打开本地 URL", () => {
    disableLiveProviderNetwork();
    installVitestNetworkGuard();

    const request = new XMLHttpRequest();
    expect(() => {
      request.open("GET", "http://127.0.0.1:3030/health");
    }).not.toThrow();
  });
});
