import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke, safeListen } from "@/lib/dev-bridge";
import {
  getCompanionPetStatus,
  launchCompanionPet,
  listenCompanionPetStatus,
  sendCompanionPetCommand,
} from "./companion";

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
  safeListen: vi.fn(),
}));

describe("companion API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应读取桌宠状态并代理命令", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce({
        endpoint: "ws://127.0.0.1:45554/companion/pet",
        server_listening: true,
        connected: true,
        client_id: "lime",
        platform: "macos",
        capabilities: ["bubble", "movement"],
        last_event: "pet.ready",
        last_error: null,
        last_state: "walking",
      })
      .mockResolvedValueOnce({
        launched: true,
        resolved_path: "/Applications/Lime Pet.app/Contents/MacOS/Lime Pet",
        endpoint: "ws://127.0.0.1:45554/companion/pet",
        message: null,
      })
      .mockResolvedValueOnce({
        delivered: true,
        connected: true,
      });

    await expect(getCompanionPetStatus()).resolves.toEqual(
      expect.objectContaining({
        connected: true,
        client_id: "lime",
      }),
    );
    await expect(
      launchCompanionPet({ app_path: "/Applications/Lime Pet.app" }),
    ).resolves.toEqual(expect.objectContaining({ launched: true }));
    await expect(
      sendCompanionPetCommand({
        event: "pet.show_bubble",
        payload: { text: "你好" },
      }),
    ).resolves.toEqual({ delivered: true, connected: true });
  });

  it("桌宠命令遇到 diagnostic facade 时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValue({
      diagnostic: {
        source: "electron-host-diagnostic",
        status: "degraded",
      },
    });

    await expect(getCompanionPetStatus()).rejects.toThrow(
      "companion_get_pet_status 尚未接入真实 Companion current 通道",
    );
    await expect(launchCompanionPet()).rejects.toThrow(
      "companion_launch_pet 尚未接入真实 Companion current 通道",
    );
    await expect(
      sendCompanionPetCommand({
        event: "pet.show_bubble",
        payload: { text: "你好" },
      }),
    ).rejects.toThrow(
      "companion_send_pet_command 尚未接入真实 Companion current 通道",
    );

    expect(vi.mocked(safeInvoke).mock.calls.map(([cmd]) => cmd)).toEqual([
      "companion_get_pet_status",
      "companion_launch_pet",
      "companion_send_pet_command",
    ]);
  });

  it("应代理桌宠状态监听", async () => {
    vi.mocked(safeListen).mockImplementationOnce(async (_event, handler) => {
      handler({
        payload: {
          endpoint: "ws://127.0.0.1:45554/companion/pet",
          server_listening: true,
          connected: false,
          client_id: null,
          platform: null,
          capabilities: [],
          last_event: "pet.disconnected",
          last_error: "桌宠连接已关闭",
          last_state: null,
        },
      });
      return vi.fn();
    });

    const handler = vi.fn();
    await listenCompanionPetStatus(handler);

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        connected: false,
        last_event: "pet.disconnected",
      }),
    );
  });
});
