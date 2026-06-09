import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useSessionFiles,
  type UseSessionFilesOptions,
  type UseSessionFilesReturn,
} from "./useSessionFiles";

const {
  mockDeleteFile,
  mockGetOrCreateSession,
  mockListFiles,
  mockReadFile,
  mockSaveFile,
  mockUpdateSessionMeta,
} = vi.hoisted(() => ({
  mockDeleteFile: vi.fn(),
  mockGetOrCreateSession: vi.fn(),
  mockListFiles: vi.fn(),
  mockReadFile: vi.fn(),
  mockSaveFile: vi.fn(),
  mockUpdateSessionMeta: vi.fn(),
}));

vi.mock("@/lib/api/session-files", () => ({
  deleteFile: mockDeleteFile,
  getOrCreateSession: mockGetOrCreateSession,
  listFiles: mockListFiles,
  readFile: mockReadFile,
  saveFile: mockSaveFile,
  updateSessionMeta: mockUpdateSessionMeta,
}));

interface MountedHook {
  container: HTMLDivElement;
  root: Root;
}

const mountedHooks: MountedHook[] = [];

function buildSessionMeta(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: "session-1",
    createdAt: 1,
    updatedAt: 2,
    fileCount: 0,
    totalSize: 0,
    ...overrides,
  };
}

async function flushEffects(rounds = 8) {
  for (let index = 0; index < rounds; index += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function renderHook(options: UseSessionFilesOptions) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let latestValue: UseSessionFilesReturn | null = null;

  function Probe({ value }: { value: UseSessionFilesOptions }) {
    latestValue = useSessionFiles(value);
    return null;
  }

  await act(async () => {
    root.render(<Probe value={options} />);
    await Promise.resolve();
  });
  await flushEffects();

  mountedHooks.push({ container, root });

  return {
    getValue: () => {
      if (!latestValue) {
        throw new Error("useSessionFiles hook 尚未初始化");
      }
      return latestValue;
    },
  };
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  vi.clearAllMocks();
  mockGetOrCreateSession.mockResolvedValue(buildSessionMeta());
  mockUpdateSessionMeta.mockResolvedValue(
    buildSessionMeta({
      theme: "article",
      creationMode: "draft",
      updatedAt: 3,
    }),
  );
  mockListFiles.mockResolvedValue([
    {
      name: "existing.md",
      fileType: "document",
      size: 12,
      createdAt: 1,
      updatedAt: 2,
    },
  ]);
  mockSaveFile.mockResolvedValue({
    name: "draft.md",
    fileType: "document",
    metadata: { kind: "draft" },
    size: 15,
    createdAt: 4,
    updatedAt: 5,
  });
  mockReadFile.mockResolvedValue("# draft");
  mockDeleteFile.mockResolvedValue(undefined);
});

afterEach(() => {
  while (mountedHooks.length > 0) {
    const mounted = mountedHooks.pop();
    if (!mounted) {
      break;
    }
    act(() => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }
  vi.clearAllMocks();
});

describe("useSessionFiles", () => {
  it("自动初始化应走 App Server current 会话文件链并加载文件列表", async () => {
    const { getValue } = await renderHook({
      sessionId: "session-1",
      theme: "article",
      creationMode: "draft",
    });

    expect(mockGetOrCreateSession).toHaveBeenCalledWith("session-1");
    expect(mockUpdateSessionMeta).toHaveBeenCalledWith("session-1", {
      theme: "article",
      creationMode: "draft",
    });
    expect(mockListFiles).toHaveBeenCalledWith("session-1");
    expect(getValue().meta).toMatchObject({
      sessionId: "session-1",
      theme: "article",
      creationMode: "draft",
    });
    expect(getValue().files).toEqual([
      expect.objectContaining({ name: "existing.md" }),
    ]);
    expect(getValue().isLoading).toBe(false);
    expect(getValue().error).toBeNull();
  });

  it("保存、读取、删除和刷新应复用 current API 并同步 hook 状态", async () => {
    const { getValue } = await renderHook({
      sessionId: "session-1",
      autoInit: false,
    });

    await act(async () => {
      await expect(
        getValue().saveFile("draft.md", "# draft", { kind: "draft" }),
      ).resolves.toMatchObject({ name: "draft.md" });
    });

    expect(mockSaveFile).toHaveBeenCalledWith(
      "session-1",
      "draft.md",
      "# draft",
      {
        kind: "draft",
      },
    );
    expect(getValue().files).toEqual([
      expect.objectContaining({ name: "draft.md" }),
    ]);

    await act(async () => {
      await expect(getValue().readFile("draft.md")).resolves.toBe("# draft");
    });
    expect(mockReadFile).toHaveBeenCalledWith("session-1", "draft.md");

    await act(async () => {
      await expect(getValue().deleteFile("draft.md")).resolves.toBe(true);
    });
    expect(mockDeleteFile).toHaveBeenCalledWith("session-1", "draft.md");
    expect(getValue().files).toEqual([]);

    await act(async () => {
      await getValue().refresh();
    });
    expect(mockListFiles).toHaveBeenCalledWith("session-1");
    expect(getValue().files).toEqual([
      expect.objectContaining({ name: "existing.md" }),
    ]);
  });
});
