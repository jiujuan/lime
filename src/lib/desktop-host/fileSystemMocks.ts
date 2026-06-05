const APP_ICON_DATA_URL =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHJ4PSIxNCIgZmlsbD0iI0Y1QjQyNSIvPjxwYXRoIGQ9Ik0xOCA0NkwzMiAxMkw0NiA0NkMzNyA0MiAyNyA0MiAxOCA0NloiIGZpbGw9IiNGRkZCRUIiLz48L3N2Zz4=";
const FOLDER_ICON_DATA_URL =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB4PSI4IiB5PSIxOCIgd2lkdGg9IjQ4IiBoZWlnaHQ9IjM0IiByeD0iMTAiIGZpbGw9IiNGRkY3RUQiIHN0cm9rZT0iI0Y1OUUwQiIgc3Ryb2tlLXdpZHRoPSIzIi8+PHBhdGggZD0iTTEwIDE4aDE3bDUgN0g4IiBmaWxsPSIjRkVERTk1IiBzdHJva2U9IiNGNTlFMEIiIHN0cm9rZS13aWR0aD0iMyIvPjwvc3ZnPg==";
const DOCUMENT_ICON_DATA_URL =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB4PSIxOCIgeT0iOCIgd2lkdGg9IjMwIiBoZWlnaHQ9IjQ4IiByeD0iNiIgZmlsbD0iI0Y4RkJGNyIgc3Ryb2tlPSIjNDE3NTY1IiBzdHJva2Utd2lkdGg9IjMiLz48cGF0aCBkPSJNMzggOHYxMmgxMCIgZmlsbD0iI0U5RjVGMSIgc3Ryb2tlPSIjNDE3NTY1IiBzdHJva2Utd2lkdGg9IjMiLz48cGF0aCBkPSJNMjUgMzFoMTZNMjUgNDBoMTIiIHN0cm9rZT0iIzQxNzU2NSIgc3Ryb2tlLXdpZHRoPSIzIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz48L3N2Zz4=";

function buildMockDirectoryEntries(now: number): Record<string, any[]> {
  return {
    "/Users/mock": [
      {
        name: "Downloads",
        path: "/Users/mock/Downloads",
        isDir: true,
        size: 0,
        modifiedAt: now - 1000 * 60 * 22,
        mimeType: null,
        iconDataUrl: FOLDER_ICON_DATA_URL,
      },
      {
        name: "Desktop",
        path: "/Users/mock/Desktop",
        isDir: true,
        size: 0,
        modifiedAt: now - 1000 * 60 * 48,
        mimeType: null,
        iconDataUrl: FOLDER_ICON_DATA_URL,
      },
      {
        name: "brief.md",
        path: "/Users/mock/brief.md",
        isDir: false,
        size: 2048,
        modifiedAt: now - 1000 * 60 * 90,
        mimeType: "text/markdown",
        iconDataUrl: DOCUMENT_ICON_DATA_URL,
      },
    ],
    "/Users/mock/Downloads": [
      {
        name: "campaign-assets",
        path: "/Users/mock/Downloads/campaign-assets",
        isDir: true,
        size: 0,
        modifiedAt: now - 1000 * 60 * 12,
        mimeType: null,
        iconDataUrl: FOLDER_ICON_DATA_URL,
      },
      {
        name: "requirements.pdf",
        path: "/Users/mock/Downloads/requirements.pdf",
        isDir: false,
        size: 348160,
        modifiedAt: now - 1000 * 60 * 36,
        mimeType: "application/pdf",
        iconDataUrl: DOCUMENT_ICON_DATA_URL,
      },
    ],
    "/Applications": [
      {
        name: "Lime.app",
        path: "/Applications/Lime.app",
        isDir: true,
        size: 0,
        modifiedAt: now - 1000 * 60 * 120,
        mimeType: null,
        iconDataUrl: APP_ICON_DATA_URL,
      },
    ],
  };
}

export const fileSystemMocks: Record<string, (args?: any) => any> = {
  read_file_preview_cmd: (args: any) => ({
    path: args?.path ?? "/mock/file.txt",
    content: "mock file preview",
    isBinary: false,
    size: 17,
    error: null,
  }),
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
  list_dir: (args: any) => {
    const path = args?.path ?? "~";
    const entriesByPath = buildMockDirectoryEntries(Date.now());
    return {
      path,
      parentPath: path === "/Users/mock" ? null : "/Users/mock",
      entries: entriesByPath[path] ?? [],
      error: null,
    };
  },
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
