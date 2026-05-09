import { safeInvoke } from "@/lib/dev-bridge";

export async function openExternalUrlWithSystemBrowser(
  url: string,
): Promise<void> {
  await safeInvoke("open_external_url", { url });
}
