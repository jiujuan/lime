import { open as openExternal } from "@/lib/desktop-host/plugin-shell";

export async function openUrl(url: string): Promise<void> {
  try {
    await openExternal(url);
  } catch {
    window.open(url, "_blank");
  }
}
