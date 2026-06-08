export const modelMocks: Record<string, (args?: any) => any> = {
  get_model_registry_provider_ids: () => [],
  refresh_model_registry: () => ({ success: true }),
  search_models: () => [],
  toggle_model_favorite: () => ({ success: true }),
  hide_model: () => ({ success: true }),
  record_model_usage: () => ({}),
  sync_tray_model_shortcuts: () => ({}),
};
