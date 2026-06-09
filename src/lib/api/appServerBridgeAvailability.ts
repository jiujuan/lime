import { isDevBridgeAvailable } from "@/lib/dev-bridge";
import { isElectronHostCommandAvailable } from "@/lib/electron-host";

const APP_SERVER_HANDLE_JSON_LINES_COMMAND = "app_server_handle_json_lines";

export function isAppServerBridgeAvailable(): boolean {
  return (
    isElectronHostCommandAvailable(APP_SERVER_HANDLE_JSON_LINES_COMMAND) ||
    isDevBridgeAvailable()
  );
}
