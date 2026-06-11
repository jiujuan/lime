import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it } from "vitest";

const GATEWAY_TUNNEL_FACADE_COMMANDS = [
  "gateway_tunnel_probe",
  "gateway_tunnel_detect_cloudflared",
  "gateway_tunnel_install_cloudflared",
  "gateway_tunnel_create",
  "gateway_tunnel_start",
  "gateway_tunnel_stop",
  "gateway_tunnel_restart",
  "gateway_tunnel_status",
  "gateway_tunnel_sync_webhook_url",
];

const CURRENT_APP_SERVER_TUNNEL_METHODS = [
  "gatewayTunnel/probe",
  "gatewayTunnel/cloudflared/detect",
  "gatewayTunnel/cloudflared/install",
  "gatewayTunnel/create",
  "gatewayTunnel/start",
  "gatewayTunnel/stop",
  "gatewayTunnel/restart",
  "gatewayTunnel/status",
  "gatewayTunnel/syncWebhookUrl",
];

const CURRENT_APP_SERVER_TUNNEL_SYMBOLS = [
  "METHOD_GATEWAY_TUNNEL_PROBE",
  "METHOD_GATEWAY_TUNNEL_CLOUDFLARED_DETECT",
  "METHOD_GATEWAY_TUNNEL_CLOUDFLARED_INSTALL",
  "METHOD_GATEWAY_TUNNEL_CREATE",
  "METHOD_GATEWAY_TUNNEL_START",
  "METHOD_GATEWAY_TUNNEL_STOP",
  "METHOD_GATEWAY_TUNNEL_RESTART",
  "METHOD_GATEWAY_TUNNEL_STATUS",
  "METHOD_GATEWAY_TUNNEL_SYNC_WEBHOOK_URL",
  "GatewayTunnelProbeResponse",
  "GatewayTunnelStatusResponse",
  "GatewayTunnelCloudflaredInstallParams",
  "GatewayTunnelCreateParams",
  "GatewayTunnelSyncWebhookUrlParams",
];

function readRepoFile(path: string): string {
  return readFileSync(resolve(cwd(), path), "utf8");
}

function readOptionalRepoFile(path: string): string {
  const absolutePath = resolve(cwd(), path);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
}

function readDesktopHostMockSources(): string {
  const desktopHostDir = resolve(cwd(), "src/lib/desktop-host");
  return readdirSync(desktopHostDir)
    .filter(
      (fileName) => fileName.endsWith(".ts") || fileName.endsWith(".d.ts"),
    )
    .map((fileName) => readFileSync(join(desktopHostDir, fileName), "utf8"))
    .join("\n");
}

function expectStringLiteralsAbsent(source: string, literals: string[]): void {
  for (const literal of literals) {
    expect(source).not.toContain(`"${literal}"`);
    expect(source).not.toContain(`'${literal}'`);
  }
}

describe("gateway tunnel current boundary", () => {
  it("gateway tunnel 已有 App Server current method，不能再被判为 current-missing 协议缺口", () => {
    const appServerSources = [
      readRepoFile("src/lib/api/appServer.ts"),
      readRepoFile("packages/app-server-client/src/protocol.ts"),
      readRepoFile("packages/app-server-client/src/index.ts"),
      readRepoFile(
        "lime-rs/crates/app-server-protocol/src/protocol/v0/method_names.rs",
      ),
      readRepoFile(
        "lime-rs/crates/app-server-protocol/src/protocol/v0/channels.rs",
      ),
      readRepoFile("lime-rs/crates/app-server/src/processor.rs"),
      readRepoFile("lime-rs/crates/app-server/src/runtime.rs"),
    ].join("\n");

    for (const method of CURRENT_APP_SERVER_TUNNEL_METHODS) {
      expect(appServerSources).toContain(method);
    }
    for (const symbol of CURRENT_APP_SERVER_TUNNEL_SYMBOLS) {
      expect(appServerSources).toContain(symbol);
    }
  });

  it("gateway tunnel 旧 facade 不应回到 Electron Host、DevBridge truth、mock 或治理 catalog", () => {
    const productionTruthSources = [
      readRepoFile("electron/ipcChannels.ts"),
      readRepoFile("electron/hostCommands.ts"),
      readRepoFile("src/lib/dev-bridge/commandPolicy.ts"),
      readRepoFile("src/lib/dev-bridge/mockPriorityCommands.ts"),
      readRepoFile("src/lib/governance/agentCommandCatalog.json"),
      readDesktopHostMockSources(),
    ].join("\n");

    expectStringLiteralsAbsent(
      productionTruthSources,
      GATEWAY_TUNNEL_FACADE_COMMANDS,
    );
  });

  it("gateway tunnel 旧 facade 不应回到前端生产网关或旧 Rust 注册面", () => {
    const productionSources = [
      readRepoFile("src/lib/api/channelsRuntime.ts"),
      readOptionalRepoFile("lime-rs/src/app/runner.rs"),
      readOptionalRepoFile("lime-rs/src/commands/mod.rs"),
      readOptionalRepoFile("lime-rs/src/dev_bridge/dispatcher.rs"),
    ].join("\n");

    for (const command of GATEWAY_TUNNEL_FACADE_COMMANDS) {
      expect(productionSources).not.toContain(`"${command}"`);
      expect(productionSources).not.toContain(`'${command}'`);
    }
    expect(productionSources).not.toContain("commands::gateway_tunnel_cmd::");
    expect(productionSources).not.toContain("pub mod gateway_tunnel_cmd;");
    expect(productionSources).not.toContain("GatewayTunnelState");
    expect(productionSources).not.toContain("lime_gateway::tunnel::");
    expect(existsSync(resolve(cwd(), "lime-rs/src/app/runner.rs"))).toBe(
      false,
    );
    expect(existsSync(resolve(cwd(), "lime-rs/src/commands/mod.rs"))).toBe(
      false,
    );
    expect(
      existsSync(resolve(cwd(), "lime-rs/src/dev_bridge/dispatcher.rs")),
    ).toBe(false);
    expect(
      existsSync(resolve(cwd(), "lime-rs/src/commands/gateway_tunnel_cmd.rs")),
    ).toBe(false);
  });
});
