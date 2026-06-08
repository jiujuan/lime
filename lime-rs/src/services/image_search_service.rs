//! 图片搜索服务。

use crate::app::AppState;
use serde::{Deserialize, Serialize};

fn normalize_non_empty_api_key(raw: Option<String>) -> Option<String> {
    raw.and_then(|key| {
        let trimmed = key.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

fn resolve_api_key_with_env_fallback(config_key: Option<String>, env_key: &str) -> Option<String> {
    normalize_non_empty_api_key(config_key)
        .or_else(|| normalize_non_empty_api_key(std::env::var(env_key).ok()))
}

pub(crate) fn resolve_pexels_api_key(config_key: Option<String>) -> Option<String> {
    resolve_api_key_with_env_fallback(config_key, "PEXELS_API_KEY")
}

/// 获取 Pexels API Key（优先配置，其次环境变量）。
pub(crate) async fn get_pexels_api_key_from_app_state(app_state: &AppState) -> Option<String> {
    let key_from_config = {
        let state = app_state.read().await;
        state.config.image_gen.image_search_pexels_api_key.clone()
    };

    resolve_pexels_api_key(key_from_config)
}

/// 联网图片搜索请求。
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WebImageSearchRequest {
    pub query: String,
    pub page: u32,
    #[serde(alias = "per_page")]
    pub per_page: u32,
    pub aspect: Option<String>,
}

/// 联网图片搜索响应。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WebImageSearchResponse {
    pub total: u32,
    pub hits: Vec<WebImageHit>,
    pub provider: String,
}

/// 联网图片信息。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WebImageHit {
    pub id: String,
    pub thumbnail_url: String,
    pub content_url: String,
    pub width: u32,
    pub height: u32,
    pub name: String,
    pub host_page_url: String,
}

#[derive(Debug, Clone, Deserialize)]
struct PexelsSearchResponse {
    total_results: u32,
    photos: Vec<PexelsPhoto>,
}

#[derive(Debug, Clone, Deserialize)]
struct PexelsPhoto {
    id: u64,
    width: u32,
    height: u32,
    url: String,
    alt: Option<String>,
    src: PexelsPhotoSrc,
}

#[derive(Debug, Clone, Deserialize)]
struct PexelsPhotoSrc {
    tiny: Option<String>,
    small: Option<String>,
    medium: Option<String>,
    large: Option<String>,
    large2x: Option<String>,
    landscape: Option<String>,
    portrait: Option<String>,
    original: Option<String>,
}

fn map_aspect_to_pexels_orientation(aspect: Option<&str>) -> Option<&'static str> {
    match aspect.unwrap_or_default() {
        "landscape" => Some("landscape"),
        "portrait" => Some("portrait"),
        "square" => Some("square"),
        _ => None,
    }
}

fn map_pexels_to_web_response(resp: PexelsSearchResponse) -> WebImageSearchResponse {
    let hits = resp
        .photos
        .into_iter()
        .filter_map(|photo| {
            let content_url = photo
                .src
                .large2x
                .clone()
                .or(photo.src.large.clone())
                .or(photo.src.original.clone())
                .or(photo.src.landscape.clone())
                .or(photo.src.portrait.clone())
                .or(photo.src.medium.clone())
                .or(photo.src.small.clone())
                .or(photo.src.tiny.clone())?;
            let thumbnail_url = photo
                .src
                .medium
                .clone()
                .or(photo.src.small.clone())
                .or(photo.src.tiny.clone())
                .or(photo.src.landscape.clone())
                .or(photo.src.portrait.clone())
                .or(photo.src.large.clone())
                .or(photo.src.original.clone())
                .unwrap_or_else(|| content_url.clone());
            let name = photo
                .alt
                .as_deref()
                .map(str::trim)
                .filter(|name| !name.is_empty())
                .map(str::to_string)
                .unwrap_or_else(|| "Pexels Image".to_string());

            Some(WebImageHit {
                id: photo.id.to_string(),
                thumbnail_url,
                content_url,
                width: photo.width,
                height: photo.height,
                name,
                host_page_url: photo.url,
            })
        })
        .collect::<Vec<_>>();

    WebImageSearchResponse {
        total: resp.total_results,
        hits,
        provider: "pexels".to_string(),
    }
}

/// 联网搜索图片（Pexels）。
pub(crate) async fn search_web_images_with_pexels_api_key(
    api_key: Option<String>,
    req: WebImageSearchRequest,
) -> Result<WebImageSearchResponse, String> {
    let api_key = resolve_pexels_api_key(api_key)
        .ok_or_else(|| "未配置 Pexels API Key，请先在设置 → 系统 → 网络搜索中配置".to_string())?;

    let client = reqwest::Client::new();
    let mut query = vec![
        ("query", req.query.clone()),
        ("page", req.page.to_string()),
        ("per_page", req.per_page.to_string()),
    ];

    if let Some(orientation) = map_aspect_to_pexels_orientation(req.aspect.as_deref()) {
        query.push(("orientation", orientation.to_string()));
    }

    let response = client
        .get("https://api.pexels.com/v1/search")
        .header("Authorization", api_key)
        .header(
            reqwest::header::USER_AGENT,
            "Mozilla/5.0 (compatible; Lime/0.75; +https://github.com/aiclientproxy/lime)",
        )
        .header(reqwest::header::ACCEPT, "application/json")
        .query(&query)
        .send()
        .await
        .map_err(|e| format!("请求 Pexels 失败: {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        if status.as_u16() == 401 || status.as_u16() == 403 {
            return Err("Pexels API Key 无效或无权限，请检查设置".to_string());
        }
        return Err(format!("Pexels API 返回错误: HTTP {status}"));
    }

    let body: PexelsSearchResponse = response
        .json()
        .await
        .map_err(|e| format!("解析 Pexels 响应失败: {e}"))?;

    Ok(map_pexels_to_web_response(body))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolve_pexels_api_key_trims_config_value() {
        assert_eq!(
            resolve_pexels_api_key(Some(" pexels-key ".to_string())).as_deref(),
            Some("pexels-key")
        );
        assert_eq!(resolve_pexels_api_key(Some("   ".to_string())), None);
    }

    #[test]
    fn test_web_request_serialization() {
        let req = WebImageSearchRequest {
            query: "city".to_string(),
            page: 2,
            per_page: 30,
            aspect: Some("landscape".to_string()),
        };

        let json = serde_json::to_string(&req).unwrap();
        assert!(json.contains("city"));
        assert!(json.contains("landscape"));
        assert!(json.contains("\"page\":2"));
    }

    #[test]
    fn test_map_aspect_to_pexels_orientation() {
        assert_eq!(
            map_aspect_to_pexels_orientation(Some("landscape")),
            Some("landscape")
        );
        assert_eq!(
            map_aspect_to_pexels_orientation(Some("portrait")),
            Some("portrait")
        );
        assert_eq!(
            map_aspect_to_pexels_orientation(Some("square")),
            Some("square")
        );
        assert_eq!(map_aspect_to_pexels_orientation(Some("all")), None);
        assert_eq!(map_aspect_to_pexels_orientation(None), None);
    }

    #[test]
    fn test_map_pexels_to_web_response() {
        let resp = PexelsSearchResponse {
            total_results: 2,
            photos: vec![PexelsPhoto {
                id: 123,
                width: 1920,
                height: 1080,
                url: "https://www.pexels.com/photo/test".to_string(),
                alt: Some("  城市夜景  ".to_string()),
                src: PexelsPhotoSrc {
                    tiny: None,
                    small: None,
                    medium: Some("https://images.pexels.com/medium.jpg".to_string()),
                    large: Some("https://images.pexels.com/large.jpg".to_string()),
                    large2x: Some("https://images.pexels.com/large2x.jpg".to_string()),
                    landscape: None,
                    portrait: None,
                    original: None,
                },
            }],
        };

        let mapped = map_pexels_to_web_response(resp);
        assert_eq!(mapped.provider, "pexels");
        assert_eq!(mapped.total, 2);
        assert_eq!(mapped.hits.len(), 1);
        let hit = &mapped.hits[0];
        assert_eq!(hit.id, "123");
        assert_eq!(hit.name, "城市夜景");
        assert_eq!(hit.content_url, "https://images.pexels.com/large2x.jpg");
        assert_eq!(hit.thumbnail_url, "https://images.pexels.com/medium.jpg");
        assert_eq!(hit.width, 1920);
        assert_eq!(hit.height, 1080);
    }
}
