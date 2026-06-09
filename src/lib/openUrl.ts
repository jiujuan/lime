import { openExternalUrlWithSystemBrowser } from "@/lib/api/externalUrl";

export async function openUrl(url: string): Promise<void> {
  await openExternalUrlWithSystemBrowser(url);
}
