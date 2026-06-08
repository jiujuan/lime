export const LIME_BRAND_NAME = "Lime";
// 前台品牌默认使用 logo-v6 主图；托盘态会在同一底图上额外叠加状态点。
export const LIME_BRAND_LOGO_SRC = buildPublicAssetUrl("logo.png");

export function buildPublicAssetUrl(
  fileName: string,
  baseUrl = import.meta.env.BASE_URL,
): string {
  const normalizedBaseUrl = baseUrl.trim() || "/";
  const baseWithSlash = normalizedBaseUrl.endsWith("/")
    ? normalizedBaseUrl
    : `${normalizedBaseUrl}/`;
  return `${baseWithSlash}${fileName.replace(/^\/+/, "")}`;
}
