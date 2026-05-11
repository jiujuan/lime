import { open as openExternal } from "@tauri-apps/plugin-shell";

export async function openUrl(url: string): Promise<void> {
  try {
    await openExternal(url);
  } catch {
    window.open(url, "_blank");
  }
}
