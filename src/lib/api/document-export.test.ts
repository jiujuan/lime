import { describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/lib/dev-bridge/safeInvoke";
import { saveExportedDocument } from "./document-export";

vi.mock("@/lib/dev-bridge/safeInvoke", () => ({
  safeInvoke: vi.fn(),
}));

describe("document-export API", () => {
  it("应通过 native 命令保存导出文档", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce(undefined);

    await expect(
      saveExportedDocument("/tmp/report.md", "# Report"),
    ).resolves.toBeUndefined();

    expect(safeInvoke).toHaveBeenCalledWith("save_exported_document", {
      filePath: "/tmp/report.md",
      content: "# Report",
    });
  });
});
