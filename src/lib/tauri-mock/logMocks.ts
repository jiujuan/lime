export const logMocks: Record<string, () => any> = {
  get_logs: () => [],
  get_persisted_logs_tail: () => [],
  export_support_bundle: () => ({
    bundle_path: "mock://Lime-Support.zip",
    output_directory: "mock://",
    generated_at: new Date().toISOString(),
    platform: "mock-web",
    included_sections: ["meta/manifest.json"],
    omitted_sections: ["config 内容", "数据库内容"],
  }),
  clear_logs: () => ({}),
  clear_diagnostic_log_history: () => ({}),
};
