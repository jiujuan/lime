use crate::types::CdpTargetInfo;
use std::time::Duration;

fn cdp_http_client(timeout_secs: u64) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .no_proxy()
        .timeout(Duration::from_secs(timeout_secs))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {e}"))
}

pub(super) async fn ensure_cdp_target(
    port: u16,
    requested_target_id: Option<&str>,
) -> Result<CdpTargetInfo, String> {
    let mut targets = fetch_cdp_targets(port).await?;
    if targets.is_empty() {
        open_new_target(port, "about:blank").await?;
        targets = fetch_cdp_targets(port).await?;
    }
    if let Some(target_id) = requested_target_id {
        if let Some(target) = targets.into_iter().find(|item| item.id == target_id) {
            return Ok(target);
        }
        return Err(format!("未找到 target_id={target_id}"));
    }
    if let Some(target) = targets
        .iter()
        .find(|item| item.target_type == "page")
        .cloned()
    {
        return Ok(target);
    }
    targets
        .into_iter()
        .next()
        .ok_or_else(|| "CDP 未返回可用标签页".to_string())
}

async fn open_new_target(port: u16, url: &str) -> Result<(), String> {
    let endpoint = format!(
        "http://127.0.0.1:{port}/json/new?{}",
        urlencoding::encode(url)
    );
    let client = cdp_http_client(5)?;
    let response = match client.put(&endpoint).send().await {
        Ok(resp) => resp,
        Err(_) => client
            .get(&endpoint)
            .send()
            .await
            .map_err(|e| format!("创建 CDP 标签页失败: {e}"))?,
    };
    if !response.status().is_success() {
        return Err(format!("创建 CDP 标签页失败: {}", response.status()));
    }
    Ok(())
}

pub async fn fetch_cdp_targets(port: u16) -> Result<Vec<CdpTargetInfo>, String> {
    let endpoint = format!("http://127.0.0.1:{port}/json/list");
    let client = cdp_http_client(5)?;
    let response = client
        .get(&endpoint)
        .send()
        .await
        .map_err(|e| format!("读取 CDP 标签页失败: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("读取 CDP 标签页失败: {}", response.status()));
    }
    response
        .json::<Vec<CdpTargetInfo>>()
        .await
        .map_err(|e| format!("解析 CDP 标签页失败: {e}"))
}

pub async fn is_cdp_endpoint_alive(port: u16) -> bool {
    let endpoint = format!("http://127.0.0.1:{port}/json/version");
    let client = match cdp_http_client(2) {
        Ok(client) => client,
        Err(_) => return false,
    };
    match client.get(endpoint).send().await {
        Ok(resp) => resp.status().is_success(),
        Err(_) => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parse_target_info_with_debugger_urls() {
        let value = json!({
            "id": "page-1",
            "title": "Example",
            "url": "https://example.com",
            "type": "page",
            "webSocketDebuggerUrl": "ws://127.0.0.1/devtools/page/1",
            "devtoolsFrontendUrl": "/devtools/inspector.html?ws=127.0.0.1/devtools/page/1"
        });
        let parsed: CdpTargetInfo = serde_json::from_value(value).unwrap();
        assert_eq!(parsed.id, "page-1");
        assert_eq!(parsed.target_type, "page");
        assert!(parsed.web_socket_debugger_url.is_some());
        assert!(parsed.devtools_frontend_url.is_some());
    }
}
