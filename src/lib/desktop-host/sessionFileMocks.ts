export const sessionFileMocks: Record<string, (args?: any) => any> = {
  session_files_get_or_create: (args: any) => ({
    sessionId: args?.sessionId ?? "mock-session",
    title: "",
    theme: null,
    creationMode: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    fileCount: 0,
    totalSize: 0,
  }),
  session_files_update_meta: (args: any) => ({
    sessionId: args?.sessionId ?? "mock-session",
    title: args?.title ?? "",
    theme: args?.theme ?? null,
    creationMode: args?.creationMode ?? null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    fileCount: 0,
    totalSize: 0,
  }),
  session_files_list_files: () => [],
  session_files_save_file: (args: any) => ({
    name: args?.fileName ?? "mock.txt",
    fileType: "text/plain",
    metadata:
      args?.metadata && typeof args.metadata === "object"
        ? args.metadata
        : undefined,
    size: typeof args?.content === "string" ? args.content.length : 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }),
  session_files_read_file: () => "",
  session_files_resolve_file_path: (args: any) =>
    `/mock/sessions/${args?.sessionId ?? "mock-session"}/${args?.fileName ?? "mock.txt"}`,
  session_files_delete_file: () => undefined,
};
