import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  METHOD_SOUL_STYLE_PACK_INSTALL,
  METHOD_SOUL_STYLE_PACK_LIST,
  METHOD_SOUL_STYLE_PACK_STATUS_SET,
  METHOD_SOUL_STYLE_PACK_UNINSTALL,
} from "../../../packages/app-server-client/src/protocol";
import {
  installSoulStylePack,
  listSoulStylePacks,
  setSoulStylePackStatus,
  uninstallSoulStylePack,
} from "./soulStylePacks";

const appServerRequestMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/appServer", () => ({
  AppServerClient: vi.fn(() => ({
    request: appServerRequestMock,
  })),
}));

describe("Soul Style Pack API", () => {
  beforeEach(() => {
    appServerRequestMock.mockReset();
  });

  it("通过 App Server JSON-RPC 安装风格包", async () => {
    appServerRequestMock.mockResolvedValueOnce({
      result: {
        packId: "com.example.soul.local",
        profileIds: ["local_sassy_executor"],
        status: "enabled",
      },
    });

    const result = await installSoulStylePack({
      manifestSource: '{"id":"com.example.soul.local"}',
      localeSources: {
        "zh-CN": "{}",
        "zh-TW": "{}",
        "en-US": "{}",
        "ja-JP": "{}",
        "ko-KR": "{}",
      },
      enableAfterInstall: true,
    });

    expect(appServerRequestMock).toHaveBeenCalledWith(
      METHOD_SOUL_STYLE_PACK_INSTALL,
      {
        manifestSource: '{"id":"com.example.soul.local"}',
        localeSources: {
          "zh-CN": "{}",
          "zh-TW": "{}",
          "en-US": "{}",
          "ja-JP": "{}",
          "ko-KR": "{}",
        },
        enableAfterInstall: true,
      },
    );
    expect(result.status).toBe("enabled");
    expect(result.profileIds).toEqual(["local_sassy_executor"]);
  });

  it("通过 App Server JSON-RPC 列出已安装风格包", async () => {
    appServerRequestMock.mockResolvedValueOnce({
      result: {
        packs: [
          {
            packId: "com.example.soul.local",
            source: "local_import",
            status: "enabled",
            profileIds: ["local_sassy_executor"],
            manifestSource: "{}",
            localeSources: {
              "zh-CN": "{}",
              "zh-TW": "{}",
              "en-US": "{}",
              "ja-JP": "{}",
              "ko-KR": "{}",
            },
          },
        ],
      },
    });

    const result = await listSoulStylePacks();

    expect(appServerRequestMock).toHaveBeenCalledWith(
      METHOD_SOUL_STYLE_PACK_LIST,
      {},
    );
    expect(result.packs[0]?.packId).toBe("com.example.soul.local");
    expect(result.packs[0]?.status).toBe("enabled");
  });

  it("通过 App Server JSON-RPC 启用或禁用风格包", async () => {
    appServerRequestMock.mockResolvedValueOnce({
      result: {
        packId: "com.example.soul.local",
        status: "disabled",
      },
    });

    const result = await setSoulStylePackStatus({
      packId: "com.example.soul.local",
      status: "disabled",
    });

    expect(appServerRequestMock).toHaveBeenCalledWith(
      METHOD_SOUL_STYLE_PACK_STATUS_SET,
      {
        packId: "com.example.soul.local",
        status: "disabled",
      },
    );
    expect(result.status).toBe("disabled");
  });

  it("通过 App Server JSON-RPC 卸载风格包", async () => {
    appServerRequestMock.mockResolvedValueOnce({
      result: {
        packId: "com.example.soul.local",
        status: "uninstalled",
      },
    });

    const result = await uninstallSoulStylePack({
      packId: "com.example.soul.local",
    });

    expect(appServerRequestMock).toHaveBeenCalledWith(
      METHOD_SOUL_STYLE_PACK_UNINSTALL,
      {
        packId: "com.example.soul.local",
      },
    );
    expect(result.status).toBe("uninstalled");
  });
});
