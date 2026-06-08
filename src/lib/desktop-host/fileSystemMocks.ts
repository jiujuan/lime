export const fileSystemMocks: Record<string, (args?: any) => any> = {
  open_external_url: (args: any) => {
    const url = typeof args?.url === "string" ? args.url.trim() : "";
    const normalizedUrl = url.toLowerCase();
    if (
      typeof window !== "undefined" &&
      (normalizedUrl.startsWith("http://") ||
        normalizedUrl.startsWith("https://"))
    ) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
    return {};
  },
  start_oem_cloud_oauth_callback_bridge: () => ({
    callbackUrl: "http://127.0.0.1:1420/oauth/callback",
  }),
  delete_file: () => ({ success: true }),
  create_file: () => ({ success: true }),
  create_directory: () => ({ success: true }),
  rename_file: () => ({ success: true }),
};
