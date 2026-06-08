export const configSystemMocks: Record<string, (args?: any) => any> = {
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

};
