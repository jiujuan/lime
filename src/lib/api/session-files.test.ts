import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/lib/dev-bridge";
import {
  cleanupEmpty,
  cleanupExpired,
  createSession,
  getOrCreateSession,
  getSessionDetail,
  importDocument,
  importDocumentToSession,
  listFiles,
  listSessions,
  readFile,
  readImageFromSession,
  resolveFilePath,
  saveFile,
  sessionExists,
  updateSessionMeta,
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

  it("遇到非 Session files 返回形态时应 fail closed", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce([{ success: true }])
      .mockResolvedValueOnce({
        meta: {
          sessionId: "session-1",
          createdAt: 1_700_000_000_000,
          updatedAt: 1_700_000_000_000,
          fileCount: 1,
          totalSize: 64,
        },
        files: [{ success: true }],
      })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce(["document text"])
      .mockResolvedValueOnce({ success: true });

    await expect(sessionExists("session-1")).rejects.toThrow(
      "session_files_exists did not return a boolean",
    );
    await expect(getOrCreateSession("session-1")).rejects.toThrow(
      "session_files_get_or_create did not return session metadata",
    );
    await expect(listSessions()).rejects.toThrow(
      "session_files_list[0] did not return a session summary",
    );
    await expect(getSessionDetail("session-1")).rejects.toThrow(
      "session_files_get_detail.files[0] did not return a session file",
    );
    await expect(
      updateSessionMeta("session-1", { title: "新会话" }),
    ).rejects.toThrow(
      "session_files_update_meta did not return session metadata",
    );
    await expect(
      saveFile("session-1", "article.md", "# title"),
    ).rejects.toThrow("session_files_save_file did not return a session file");
    await expect(resolveFilePath("session-1", "article.md")).rejects.toThrow(
      "session_files_resolve_file_path did not return a string",
    );
    await expect(cleanupExpired(30)).rejects.toThrow(
      "session_files_cleanup_expired did not return a number",
    );
    await expect(readImageFromSession("session-1", "cover.png")).rejects.toThrow(
      "read_image_from_session did not return a string",
    );
    await expect(importDocument("/tmp/doc.md")).rejects.toThrow(
      "import_document did not return a string",
    );
    await expect(
      importDocumentToSession("session-1", "/tmp/doc.md"),
    ).rejects.toThrow(
      "import_document_to_session did not return imported document tuple",
    );
    await expect(cleanupEmpty()).rejects.toThrow(
      "session_files_cleanup_empty did not return a number",
    );
  });
});
