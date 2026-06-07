import path from "node:path";
import { pathToFileURL } from "node:url";

const UPDATE_NOTIFICATION_ROUTE = "/update-notification";
const UPDATE_NOTIFICATION_WINDOW_ROUTE_ID = "update-notification";
const WINDOW_ROUTE_QUERY_PARAM = "lime_window";

export function buildUpdateNotificationWindowUrl(params: {
  devServerUrl?: string;
  appPath: string;
  current?: string | null;
  latest?: string | null;
  downloadUrl?: string | null;
}): string {
  const targetUrl = params.devServerUrl
    ? new URL(UPDATE_NOTIFICATION_ROUTE, params.devServerUrl)
    : pathToFileURL(path.resolve(params.appPath, "dist/index.html"));

  if (!params.devServerUrl) {
    targetUrl.searchParams.set(
      WINDOW_ROUTE_QUERY_PARAM,
      UPDATE_NOTIFICATION_WINDOW_ROUTE_ID,
    );
  }
  if (params.current) {
    targetUrl.searchParams.set("current", params.current);
  }
  if (params.latest) {
    targetUrl.searchParams.set("latest", params.latest);
  }
  if (params.downloadUrl) {
    targetUrl.searchParams.set("download_url", params.downloadUrl);
  }
  return targetUrl.toString();
}
