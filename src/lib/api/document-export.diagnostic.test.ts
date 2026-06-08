import { describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/lib/dev-bridge/safeInvoke";
import { saveExportedDocument } from "./document-export";

vi.mock("@/lib/dev-bridge/safeInvoke", () => ({
  safeInvoke: vi.fn(),
}));

describe("document-export API diagnostic fail-closed", () => {
  it("保存导出文档收到 diagnostic facade 时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      diagnostic: {
        command: "save_exported_document",
        source: "electron-host",
      },
    });

    await expect(
      saveExportedDocument("/tmp/report.md", "# Report"),
    ).rejects.toThrow(
      "save_exported_document 尚未接入真实 Document Export current 通道",
    );
  });
});
