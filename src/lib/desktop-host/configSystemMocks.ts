function logConfigSave(config: unknown) {
  if (import.meta.env.MODE === "test") {
    return;
  }
  console.log("[Mock] Config saved:", config);
}

export const configSystemMocks: Record<string, (args?: any) => any> = {
  get_config: () => ({
    server: {
      host: "127.0.0.1",
      port: 8787,
      api_key: "",
      response_cache: {
        enabled: true,
        ttl_secs: 600,
        max_entries: 200,
        max_body_bytes: 1048576,
        cacheable_status_codes: [200],
      },
      tls: {
        enable: false,
        cert_path: null,
        key_path: null,
      },
    },
    default_provider: "openai",
    remote_management: {
      allow_remote: false,
      secret_key: null,
      disable_control_panel: false,
    },
    quota_exceeded: {
      switch_project: true,
      switch_preview_model: false,
      cooldown_seconds: 60,
    },
    ampcode: {
      upstream_url: null,
      model_mappings: [],
      restrict_management_to_localhost: true,
    },
    proxy_url: null,
    minimize_to_tray: false,
    language: "zh-CN",
    experimental: {
      webmcp: {
        enabled: false,
      },
    },
    tool_calling: {
      enabled: true,
      dynamic_filtering: true,
      native_input_examples: false,
    },
    web_search: {
      engine: "google",
      provider: "duckduckgo_instant",
      provider_priority: [
        "duckduckgo_instant",
        "tavily",
        "multi_search_engine",
        "bing_search_api",
        "google_custom_search",
      ],
      tavily_api_key: "",
      bing_search_api_key: "",
      google_search_api_key: "",
      google_search_engine_id: "",
      multi_search: {
        priority: [],
        engines: [],
        max_results_per_engine: 5,
        max_total_results: 20,
        timeout_ms: 4000,
      },
    },
    image_gen: {
      default_service: "dall_e",
      default_count: 1,
      default_size: "1024x1024",
      default_quality: "standard",
      default_style: "vivid",
      enable_enhancement: false,
      auto_download: false,
      image_search_pexels_api_key: "",
      image_search_pixabay_api_key: "",
    },
    workspace_preferences: {
      schema_version: 3,
      media_defaults: {},
      companion_defaults: {},
      service_models: {},
    },
    navigation: {
      schema_version: 3,
      enabled_items: [],
    },
    crash_reporting: {
      enabled: true,
      dsn: null,
      environment: "development",
      sample_rate: 1.0,
      send_pii: false,
    },
  }),

  save_config: (args: any) => {
    const config = args?.config ?? args;
    logConfigSave(config);
    return { success: true };
  },

  get_experimental_config: () => ({
    webmcp: { enabled: false },
  }),
  save_experimental_config: () => ({}),
  validate_shortcut: () => true,

  get_default_provider: () => "openai",
  set_default_provider: (args: any) => {
    const provider = args?.provider ?? args;
    logConfigSave({ default_provider: provider });
    return provider;
  },
  get_hint_routes: () => [],

  subscribe_sysinfo: () => ({ success: true }),
  unsubscribe_sysinfo: () => ({ success: true }),

  // Session 相关
  update_session: () => ({ success: true }),
  add_flow_to_session: () => ({ success: true }),
  remove_flow_from_session: () => ({ success: true }),
  unarchive_session: () => ({ success: true }),
  archive_session: () => ({ success: true }),
  delete_session: () => ({ success: true }),

  // Bookmark 相关
  remove_bookmark: () => ({ success: true }),

  // Intercept 相关
  intercept_config_set: () => ({ success: true }),
  intercept_continue: () => ({ success: true }),
  intercept_cancel: () => ({ success: true }),

  // Quick Filter 相关
  delete_quick_filter: () => ({ success: true }),

  report_frontend_crash: () => ({ success: true }),

  // Prompts 相关
  get_prompts: () => [],
  upsert_prompt: () => ({ success: true }),
  add_prompt: () => ({ success: true }),
  update_prompt: () => ({ success: true }),
  delete_prompt: () => ({ success: true }),
  enable_prompt: () => ({ success: true }),
  import_prompt_from_file: () => ({ success: true }),
  get_current_prompt_file_content: () => ({ content: "" }),
  auto_import_prompt: () => ({ success: true }),

  // Window 相关
  get_window_size: () => ({ width: 1280, height: 800 }),
  set_window_size: () => ({}),
  get_window_size_options: () => ({ options: [] }),
  set_window_size_by_option: () => ({}),
  toggle_fullscreen: () => ({}),
  is_fullscreen: () => ({ fullscreen: false }),
  resize_for_flow_monitor: () => ({}),
  restore_window_size: () => ({}),
  toggle_window_size: () => ({}),
  center_window: () => ({}),

  // Machine ID 相关
  get_current_machine_id: () => ({ machine_id: "" }),
  set_machine_id: () => ({ success: true }),
  generate_random_machine_id: () => ({ machine_id: "" }),
  validate_machine_id: () => ({ valid: true }),
  check_admin_privileges: () => ({ is_admin: false }),
  get_os_type: () => ({ os_type: "linux" }),
  backup_machine_id_to_file: () => ({ success: true }),
  restore_machine_id_from_file: () => ({ success: true }),
  format_machine_id: () => ({ formatted: "" }),
  detect_machine_id_format: () => ({ format: "unknown" }),
  convert_machine_id_format: () => ({ converted: "" }),
  get_machine_id_history: () => ({ history: [] }),
  clear_machine_id_override: () => ({ success: true }),
  copy_machine_id_to_clipboard: () => ({ success: true }),
  paste_machine_id_from_clipboard: () => ({ machine_id: "" }),
  get_system_info: () => ({ info: {} }),

  // Injection 相关
  get_injection_config: () => ({ config: {} }),
  set_injection_enabled: () => ({ success: true }),
  add_injection_rule: () => ({ success: true }),
  remove_injection_rule: () => ({ success: true }),
  update_injection_rule: () => ({ success: true }),
  get_injection_rules: () => ({ rules: [] }),
};
