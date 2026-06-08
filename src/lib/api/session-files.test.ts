import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/lib/dev-bridge";
import {
  cleanupEmpty,
  createSession,
  importDocument,
  importDocumentToSession,
  listFiles,
  readFile,
  resolveFilePath,
  uploadImageToSession,
} from "./session-files";

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
}));

describe("session-files API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createSession 应代理到 session_files_create", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      sessionId: "session-1",
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
      fileCount: 0,
      totalSize: 0,
    });

    await expect(createSession("session-1")).resolves.toEqual(
      expect.objectContaining({
        sessionId: "session-1",
        fileCount: 0,
      }),
    );
    expect(safeInvoke).toHaveBeenCalledWith("session_files_create", {
      sessionId: "session-1",
    });
  });

  it("cleanupEmpty 应支持无参数命令", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce(2);

    await expect(cleanupEmpty()).resolves.toBe(2);
    expect(safeInvoke).toHaveBeenCalledWith("session_files_cleanup_empty");
  });

  it("listFiles / readFile / resolveFilePath 应保持原命令参数", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce([
        {
          name: "article.md",
          fileType: "markdown",
          size: 64,
          createdAt: 1_700_000_000_000,
          updatedAt: 1_700_000_000_000,
        },
      ])
      .mockResolvedValueOnce("# title")
      .mockResolvedValueOnce("/tmp/session-1/article.md");

    await expect(listFiles("session-1")).resolves.toEqual([
      expect.objectContaining({ name: "article.md" }),
    ]);
    await expect(readFile("session-1", "article.md")).resolves.toBe("# title");
    await expect(resolveFilePath("session-1", "article.md")).resolves.toBe(
      "/tmp/session-1/article.md",
    );

    expect(safeInvoke).toHaveBeenNthCalledWith(1, "session_files_list_files", {
      sessionId: "session-1",
    });
    expect(safeInvoke).toHaveBeenNthCalledWith(2, "session_files_read_file", {
      sessionId: "session-1",
      fileName: "article.md",
    });
    expect(safeInvoke).toHaveBeenNthCalledWith(
      3,
      "session_files_resolve_file_path",
      {
        sessionId: "session-1",
        fileName: "article.md",
      },
    );
  });

  it("image / document helper 应代理到旧命令名", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce("images/cover.png")
      .mockResolvedValueOnce("document text")
      .mockResolvedValueOnce(["document text", "doc.md"]);

    await expect(
      uploadImageToSession("session-1", "/tmp/cover.png"),
    ).resolves.toBe("images/cover.png");
    await expect(importDocument("/tmp/doc.md")).resolves.toBe("document text");
    await expect(
      importDocumentToSession("session-1", "/tmp/doc.md"),
    ).resolves.toEqual(["document text", "doc.md"]);

    expect(safeInvoke).toHaveBeenNthCalledWith(1, "upload_image_to_session", {
      sessionId: "session-1",
      filePath: "/tmp/cover.png",
    });
    expect(safeInvoke).toHaveBeenNthCalledWith(2, "import_document", {
      filePath: "/tmp/doc.md",
    });
    expect(safeInvoke).toHaveBeenNthCalledWith(
      3,
      "import_document_to_session",
      {
        sessionId: "session-1",
        filePath: "/tmp/doc.md",
      },
    );
  });

  it("遇到 diagnostic facade 时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      diagnostic: {
        command: "session_files_read_file",
        source: "electron-host-diagnostic",
      },
    });

    await expect(readFile("session-1", "article.md")).rejects.toThrow(
      "session_files_read_file 尚未接入真实 Session files current 通道",
    );
  });
});
