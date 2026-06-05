//! 百度语音识别客户端
//!
//! 使用百度 AI 开放平台的语音识别 API。

use async_trait::async_trait;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use serde::{Deserialize, Serialize};

use super::AsrClient;
use crate::error::{Result, VoiceError};
use crate::types::{AudioData, TranscribeResult};

/// 百度 Token 响应
#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
    #[allow(dead_code)]
    expires_in: u64,
}

/// 百度 ASR 响应
#[derive(Debug, Deserialize)]
struct AsrResponse {
    err_no: i32,
    err_msg: String,
    #[serde(default)]
    result: Vec<String>,
}

/// 百度 ASR 请求
#[derive(Debug, Serialize)]
struct AsrRequest {
    format: String,
    rate: u32,
    channel: u16,
    cuid: String,
    token: String,
    speech: String,
    len: usize,
}

/// 百度客户端
pub struct BaiduClient {
    api_key: String,
    secret_key: String,
    cached_token: Option<String>,
}

impl BaiduClient {
    /// 创建新的客户端
    pub fn new(api_key: String, secret_key: String) -> Self {
        Self {
            api_key,
            secret_key,
            cached_token: None,
        }
    }

    /// 获取 Access Token
    async fn get_token(&mut self) -> Result<String> {
        if let Some(ref token) = self.cached_token {
            return Ok(token.clone());
        }

        let url = format!(
            "https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id={}&client_secret={}",
            self.api_key, self.secret_key
        );

        let client = reqwest::Client::new();
        let response = client
            .post(&url)
            .send()
            .await
            .map_err(|e| VoiceError::NetworkError(e.to_string()))?;

        if !response.status().is_success() {
            return Err(VoiceError::AsrAuthError("获取百度 Token 失败".to_string()));
        }

        let token_resp: TokenResponse = response
            .json()
            .await
            .map_err(|e| VoiceError::AsrAuthError(e.to_string()))?;

        self.cached_token = Some(token_resp.access_token.clone());
        Ok(token_resp.access_token)
    }
}

#[async_trait]
impl AsrClient for BaiduClient {
    async fn transcribe(&self, audio: &AudioData) -> Result<TranscribeResult> {
        // 需要可变引用来缓存 token
        let mut client = BaiduClient::new(self.api_key.clone(), self.secret_key.clone());
        let token = client.get_token().await?;

        let wav_bytes = audio.to_wav_bytes();
        let speech = BASE64.encode(&wav_bytes);

        let request = AsrRequest {
            format: "wav".to_string(),
            rate: audio.sample_rate,
            channel: audio.channels,
            cuid: "lime".to_string(),
            token,
            speech,
            len: wav_bytes.len(),
        };

        let http_client = reqwest::Client::new();
        let response = http_client
            .post("https://vop.baidu.com/server_api")
            .json(&request)
            .send()
            .await
            .map_err(|e| VoiceError::NetworkError(e.to_string()))?;

        let result: AsrResponse = response
            .json()
            .await
            .map_err(|e| VoiceError::AsrError(e.to_string()))?;

        if result.err_no != 0 {
            return Err(VoiceError::AsrError(format!(
                "百度 ASR 错误: {} - {}",
                result.err_no, result.err_msg
            )));
        }

        let text = result.result.join("");

        Ok(TranscribeResult {
            text,
            language: Some("zh".to_string()),
            confidence: None,
            segments: vec![],
        })
    }

    fn name(&self) -> &'static str {
        "百度语音"
    }
}
