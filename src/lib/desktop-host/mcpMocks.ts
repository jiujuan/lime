export const mcpMocks: Record<string, (args?: any) => any> = {
  add_mcp_server: () => ({ success: true }),
  update_mcp_server: () => ({ success: true }),
  delete_mcp_server: () => ({ success: true }),
  toggle_mcp_server: () => ({ success: true }),
  import_mcp_from_app: () => ({ success: true }),
  sync_all_mcp_to_live: () => ({ success: true }),
  mcp_start_server: () => ({ success: true }),
  mcp_stop_server: () => ({ success: true }),
};
