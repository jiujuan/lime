import { safeInvoke } from "@/lib/dev-bridge/safeInvoke";
import { assertNotDiagnosticFacade } from "./diagnosticFacade";

export async function saveExportedDocument(
  filePath: string,
  content: string,
): Promise<void> {
  const result = await safeInvoke<unknown>("save_exported_document", {
    filePath,
    content,
  });
  assertNotDiagnosticFacade(
    "save_exported_document",
    result,
    "真实 Document Export current 通道",
  );
  if (result !== null && result !== undefined) {
    throw new Error("save_exported_document did not return void result");
  }
}
