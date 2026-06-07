const DOCUMENT_ICON_DATA_URL =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB4PSIxOCIgeT0iOCIgd2lkdGg9IjMwIiBoZWlnaHQ9IjQ4IiByeD0iNiIgZmlsbD0iI0Y4RkJGNyIgc3Ryb2tlPSIjNDE3NTY1IiBzdHJva2Utd2lkdGg9IjMiLz48cGF0aCBkPSJNMzggOHYxMmgxMCIgZmlsbD0iI0U5RjVGMSIgc3Ryb2tlPSIjNDE3NTY1IiBzdHJva2Utd2lkdGg9IjMiLz48cGF0aCBkPSJNMjUgMzFoMTZNMjUgNDBoMTIiIHN0cm9rZT0iIzQxNzU2NSIgc3Ryb2tlLXdpZHRoPSIzIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz48L3N2Zz4=";

export const fileSystemMocks: Record<string, (args?: any) => any> = {
  reveal_in_finder: () => ({}),
  open_with_default_app: () => ({}),
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
  get_file_icon_data_url: () => DOCUMENT_ICON_DATA_URL,
  get_file_manager_locations: () => [
    {
      id: "home",
      label: "个人",
      path: "/Users/mock",
      kind: "home",
    },
    {
      id: "downloads",
      label: "下载",
      path: "/Users/mock/Downloads",
      kind: "downloads",
    },
    {
      id: "applications",
      label: "应用程序",
      path: "/Applications",
      kind: "applications",
    },
  ],
};
