/* global Buffer */
import { execFile } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

import { VoiceModelHost } from "./voiceModelHost";

const execFileAsync = promisify(execFile);
const tempDirs: string[] = [];

async function createTempUserDataDir() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "lime-voice-model-host-"));
  tempDirs.push(dir);
  return dir;
}

async function withBinaryServer<T>(
  assets: Record<string, Buffer>,
  run: (baseUrl: string) => Promise<T>,
): Promise<T> {
  const server = createServer((request, response) => {
    const asset = assets[request.url ?? ""];
    if (asset) {
      response.writeHead(200, {
        "content-type": "application/octet-stream",
        "content-length": asset.byteLength,
      });
      response.end(asset);
      return;
    }
    response.writeHead(404);
    response.end();
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("无法启动二进制测试服务");
  }
  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

async function createVoiceModelArchiveFixture(
  userDataDir: string,
): Promise<Buffer> {
  const sourceDir = path.join(userDataDir, "fixture-voice-model-source");
  const archivePath = path.join(userDataDir, "fixture-voice-model.tar.bz2");
  await mkdir(sourceDir, { recursive: true });
  await Promise.all([
    writeFile(path.join(sourceDir, "model.int8.onnx"), "model"),
    writeFile(path.join(sourceDir, "tokens.txt"), "tokens"),
  ]);
  await execFileAsync("tar", ["-cjf", archivePath, "-C", sourceDir, "."]);
  return await readFile(archivePath);
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

describe("VoiceModelHost", () => {
  it("listCatalog 返回 Electron Host current 目录形态", async () => {
    const userDataDir = await createTempUserDataDir();
    const host = new VoiceModelHost(userDataDir);

    expect(host.listCatalog()).toEqual([
      expect.objectContaining({
        id: "sensevoice-small-int8-2024-07-17",
        name: "SenseVoice Small INT8",
        provider: "FunAudioLLM / sherpa-onnx",
        download_url: expect.stringContaining(
          "/voice/sensevoice-small-int8-2024-07-17/",
        ),
        vad_download_url: expect.stringContaining(
          "/voice/silero-vad-onnx/silero_vad.onnx",
        ),
        runtime: "sherpa-onnx",
        bundled: false,
      }),
    ]);
  });

  it("getInstallState 读取用户数据目录中的本地模型文件", async () => {
    const userDataDir = await createTempUserDataDir();
    const host = new VoiceModelHost(userDataDir);
    const installDir = path.join(
      userDataDir,
      "models",
      "voice",
      "sensevoice-small-int8-2024-07-17",
    );
    await mkdir(installDir, { recursive: true });
    await Promise.all([
      writeFile(path.join(installDir, "model.int8.onnx"), "model"),
      writeFile(path.join(installDir, "tokens.txt"), "tokens"),
      writeFile(path.join(installDir, "silero_vad.onnx"), "vad"),
      writeFile(
        path.join(installDir, "lime-model.json"),
        JSON.stringify({ installed_at: 1_700_000_000 }),
      ),
    ]);

    await expect(
      host.getInstallState({
        modelId: "sensevoice-small-int8-2024-07-17",
      }),
    ).resolves.toEqual({
      model_id: "sensevoice-small-int8-2024-07-17",
      installed: true,
      installing: false,
      install_dir: installDir,
      model_file: path.join(installDir, "model.int8.onnx"),
      tokens_file: path.join(installDir, "tokens.txt"),
      vad_file: path.join(installDir, "silero_vad.onnx"),
      installed_bytes: 41,
      last_verified_at: 1_700_000_000,
      missing_files: [],
      default_credential_id: null,
    });
  });

  it("getInstallState 对未安装模型返回缺失文件但不返回 diagnostic facade", async () => {
    const userDataDir = await createTempUserDataDir();
    const host = new VoiceModelHost(userDataDir);

    await expect(
      host.getInstallState({
        modelId: "sensevoice-small-int8-2024-07-17",
      }),
    ).resolves.toEqual({
      model_id: "sensevoice-small-int8-2024-07-17",
      installed: false,
      installing: false,
      install_dir: path.join(
        userDataDir,
        "models",
        "voice",
        "sensevoice-small-int8-2024-07-17",
      ),
      model_file: null,
      tokens_file: null,
      vad_file: null,
      installed_bytes: 0,
      last_verified_at: null,
      missing_files: ["model.int8.onnx", "tokens.txt", "silero_vad.onnx"],
      default_credential_id: null,
    });
  });

  it("download 下载并安装本地模型文件", async () => {
    const userDataDir = await createTempUserDataDir();
    const emitted: Array<{ event: string; payload?: unknown }> = [];
    const host = new VoiceModelHost(userDataDir, (event, payload) => {
      emitted.push({ event, payload });
    });
    const archive = await createVoiceModelArchiveFixture(userDataDir);
    const vad = Buffer.from("vad");

    await withBinaryServer(
      {
        "/voice-model.tar.bz2": archive,
        "/silero_vad.onnx": vad,
      },
      async (baseUrl) => {
        await expect(
          host.download({
            modelId: "sensevoice-small-int8-2024-07-17",
            catalogEntry: {
              id: "sensevoice-small-int8-2024-07-17",
              download_url: `${baseUrl}/voice-model.tar.bz2`,
              vad_download_url: `${baseUrl}/silero_vad.onnx`,
              size_bytes: archive.byteLength,
            },
          }),
        ).resolves.toEqual({
          state: expect.objectContaining({
            model_id: "sensevoice-small-int8-2024-07-17",
            installed: true,
            installing: false,
            missing_files: [],
            installed_bytes: expect.any(Number),
            model_file: path.join(
              userDataDir,
              "models",
              "voice",
              "sensevoice-small-int8-2024-07-17",
              "model.int8.onnx",
            ),
            tokens_file: path.join(
              userDataDir,
              "models",
              "voice",
              "sensevoice-small-int8-2024-07-17",
              "tokens.txt",
            ),
            vad_file: path.join(
              userDataDir,
              "models",
              "voice",
              "sensevoice-small-int8-2024-07-17",
              "silero_vad.onnx",
            ),
          }),
        });
      },
    );

    const installDir = path.join(
      userDataDir,
      "models",
      "voice",
      "sensevoice-small-int8-2024-07-17",
    );
    await expect(
      readFile(path.join(installDir, "model.int8.onnx"), "utf8"),
    ).resolves.toBe("model");
    await expect(
      readFile(path.join(installDir, "tokens.txt"), "utf8"),
    ).resolves.toBe("tokens");
    await expect(
      readFile(path.join(installDir, "silero_vad.onnx"), "utf8"),
    ).resolves.toBe("vad");
    const manifest = JSON.parse(
      await readFile(path.join(installDir, "lime-model.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(manifest.model_id).toBe("sensevoice-small-int8-2024-07-17");
    expect(manifest.archive_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(emitted.map((entry) => entry.event)).toContain(
      "voice-model-download-progress",
    );
    expect(
      emitted.some(
        (entry) =>
          entry.event === "voice-model-download-progress" &&
          (entry.payload as Record<string, unknown>)?.phase === "done",
      ),
    ).toBe(true);
  });

  it("delete 删除本地模型目录并返回未安装状态", async () => {
    const userDataDir = await createTempUserDataDir();
    const host = new VoiceModelHost(userDataDir);
    const installDir = path.join(
      userDataDir,
      "models",
      "voice",
      "sensevoice-small-int8-2024-07-17",
    );
    await mkdir(installDir, { recursive: true });
    await Promise.all([
      writeFile(path.join(installDir, "model.int8.onnx"), "model"),
      writeFile(path.join(installDir, "tokens.txt"), "tokens"),
      writeFile(path.join(installDir, "silero_vad.onnx"), "vad"),
      writeFile(
        path.join(installDir, "lime-model.json"),
        JSON.stringify({ installed_at: 1_700_000_000 }),
      ),
    ]);

    await expect(
      host.delete({
        modelId: "sensevoice-small-int8-2024-07-17",
      }),
    ).resolves.toEqual({
      model_id: "sensevoice-small-int8-2024-07-17",
      installed: false,
      installing: false,
      install_dir: installDir,
      model_file: null,
      tokens_file: null,
      vad_file: null,
      installed_bytes: 0,
      last_verified_at: null,
      missing_files: ["model.int8.onnx", "tokens.txt", "silero_vad.onnx"],
      default_credential_id: null,
    });
    await expect(stat(installDir)).rejects.toThrow();
  });
});
