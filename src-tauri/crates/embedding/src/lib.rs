//! 向量嵌入服务
//!
//! 提供文本向量化功能，用于语义搜索

use reqwest::Client;
use serde::{Deserialize, Serialize};
#[cfg(feature = "local-onnx")]
use std::collections::HashMap;
#[cfg(feature = "local-onnx")]
use std::path::{Path, PathBuf};
#[cfg(feature = "local-onnx")]
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

#[cfg(feature = "local-onnx")]
use fastembed::{
    EmbeddingModel, InitOptions, InitOptionsUserDefined, Pooling, TextEmbedding, TokenizerFiles,
    UserDefinedEmbeddingModel,
};

pub const DEFAULT_LOCAL_ONNX_EMBEDDING_MODEL: &str = "all-MiniLM-L6-v2";
#[cfg(feature = "local-onnx")]
const LOCAL_ONNX_CACHE_ENV: &str = "LIME_LOCAL_ONNX_CACHE_DIR";
#[cfg(feature = "local-onnx")]
const LOCAL_ONNX_HF_ENDPOINT_ENV: &str = "LIME_LOCAL_ONNX_HF_ENDPOINT";
#[cfg(feature = "local-onnx")]
const LOCAL_ONNX_MODEL_REPO: &str = "Qdrant/all-MiniLM-L6-v2-onnx";
#[cfg(feature = "local-onnx")]
const LOCAL_ONNX_MODEL_REVISION: &str = "main";

/// OpenAI Embedding API 请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbeddingRequest {
    /// 输入文本
    pub input: String,
    /// 模型名称（默认 text-embedding-3-small）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
}

/// OpenAI Embedding API 响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbeddingResponse {
    pub data: Vec<EmbeddingData>,
}

/// 向量数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbeddingData {
    /// 向量数组，维度由当前嵌入模型决定
    pub embedding: Vec<f32>,
    /// 索引
    pub index: usize,
}

/// API 错误响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiErrorResponse {
    pub error: ApiError,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiError {
    pub message: String,
    #[serde(rename = "type")]
    pub error_type: String,
}

/// 规范化本地 ONNX 嵌入模型名。
pub fn normalize_local_onnx_model_name(model: Option<&str>) -> Result<&'static str, String> {
    let requested = model
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(DEFAULT_LOCAL_ONNX_EMBEDDING_MODEL);
    let key = requested.to_ascii_lowercase().replace('_', "-");

    match key.as_str() {
        "all-minilm-l6-v2"
        | "sentence-transformers/all-minilm-l6-v2"
        | "qdrant/all-minilm-l6-v2-onnx" => Ok(DEFAULT_LOCAL_ONNX_EMBEDDING_MODEL),
        _ => Err(format!(
            "不支持的本地 ONNX 嵌入模型: {requested}。当前支持: {DEFAULT_LOCAL_ONNX_EMBEDDING_MODEL}"
        )),
    }
}

#[cfg(feature = "local-onnx")]
#[derive(Debug, Clone)]
struct LocalOnnxModelSpec {
    cache_key: &'static str,
    model: EmbeddingModel,
}

#[cfg(feature = "local-onnx")]
static LOCAL_ONNX_MODELS: OnceLock<Mutex<HashMap<&'static str, TextEmbedding>>> = OnceLock::new();

#[cfg(feature = "local-onnx")]
fn resolve_local_onnx_model(model: Option<&str>) -> Result<LocalOnnxModelSpec, String> {
    match normalize_local_onnx_model_name(model)? {
        DEFAULT_LOCAL_ONNX_EMBEDDING_MODEL => Ok(LocalOnnxModelSpec {
            cache_key: DEFAULT_LOCAL_ONNX_EMBEDDING_MODEL,
            model: EmbeddingModel::AllMiniLML6V2,
        }),
        _ => unreachable!("normalize_local_onnx_model_name returned an unknown model"),
    }
}

#[cfg(feature = "local-onnx")]
fn local_onnx_cache_dir() -> PathBuf {
    if let Ok(value) = std::env::var(LOCAL_ONNX_CACHE_ENV) {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed);
        }
    }

    dirs::cache_dir()
        .unwrap_or_else(|| PathBuf::from(".lime"))
        .join("lime")
        .join("models")
        .join("embedding")
}

#[cfg(feature = "local-onnx")]
fn local_onnx_hf_endpoint() -> String {
    std::env::var(LOCAL_ONNX_HF_ENDPOINT_ENV)
        .or_else(|_| std::env::var("HF_ENDPOINT"))
        .ok()
        .map(|value| value.trim().trim_end_matches('/').to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "https://huggingface.co".to_string())
}

#[cfg(feature = "local-onnx")]
fn local_onnx_manual_cache_path(cache_dir: &Path, file: &str) -> PathBuf {
    let mut path = cache_dir
        .join("manual")
        .join(LOCAL_ONNX_MODEL_REPO.replace('/', "--"))
        .join(LOCAL_ONNX_MODEL_REVISION);
    for part in file.split('/') {
        path.push(part);
    }
    path
}

#[cfg(feature = "local-onnx")]
fn read_or_download_local_onnx_file(
    cache_dir: &Path,
    endpoint: &str,
    file: &str,
) -> Result<Vec<u8>, String> {
    let path = local_onnx_manual_cache_path(cache_dir, file);
    if path.exists() {
        return std::fs::read(&path).map_err(|e| format!("读取本地 ONNX 缓存文件失败 {file}: {e}"));
    }

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建本地 ONNX 缓存目录失败: {e}"))?;
    }

    let url = format!(
        "{}/{}/resolve/{}/{}",
        endpoint, LOCAL_ONNX_MODEL_REPO, LOCAL_ONNX_MODEL_REVISION, file
    );
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(180))
        .build()
        .map_err(|e| format!("创建本地 ONNX 下载客户端失败: {e}"))?;
    let response = client
        .get(&url)
        .send()
        .map_err(|e| format!("下载本地 ONNX 模型文件失败 {file}: {e}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "下载本地 ONNX 模型文件失败 {file}: HTTP {}",
            response.status()
        ));
    }

    let bytes = response
        .bytes()
        .map_err(|e| format!("读取本地 ONNX 模型文件响应失败 {file}: {e}"))?
        .to_vec();
    std::fs::write(&path, &bytes).map_err(|e| format!("写入本地 ONNX 缓存文件失败 {file}: {e}"))?;
    Ok(bytes)
}

#[cfg(feature = "local-onnx")]
fn build_local_onnx_model_from_manual_cache(
    cache_dir: &Path,
    endpoint: &str,
) -> Result<TextEmbedding, String> {
    let onnx_file = read_or_download_local_onnx_file(cache_dir, endpoint, "model.onnx")?;
    let tokenizer_files = TokenizerFiles {
        tokenizer_file: read_or_download_local_onnx_file(cache_dir, endpoint, "tokenizer.json")?,
        config_file: read_or_download_local_onnx_file(cache_dir, endpoint, "config.json")?,
        special_tokens_map_file: read_or_download_local_onnx_file(
            cache_dir,
            endpoint,
            "special_tokens_map.json",
        )?,
        tokenizer_config_file: read_or_download_local_onnx_file(
            cache_dir,
            endpoint,
            "tokenizer_config.json",
        )?,
    };
    let model =
        UserDefinedEmbeddingModel::new(onnx_file, tokenizer_files).with_pooling(Pooling::Mean);

    TextEmbedding::try_new_from_user_defined(model, InitOptionsUserDefined::new())
        .map_err(|e| format!("从手动缓存加载本地 ONNX 嵌入模型失败: {e}"))
}

#[cfg(feature = "local-onnx")]
fn build_local_onnx_model(spec: &LocalOnnxModelSpec) -> Result<TextEmbedding, String> {
    let cache_dir = local_onnx_cache_dir();
    std::fs::create_dir_all(&cache_dir)
        .map_err(|e| format!("创建本地 ONNX 嵌入模型缓存目录失败: {e}"))?;

    let options = InitOptions::new(spec.model.clone())
        .with_cache_dir(cache_dir.clone())
        .with_show_download_progress(false);

    match TextEmbedding::try_new(options) {
        Ok(model) => Ok(model),
        Err(primary_error) => {
            let endpoint = local_onnx_hf_endpoint();
            build_local_onnx_model_from_manual_cache(&cache_dir, &endpoint).map_err(|fallback| {
                format!(
                    "加载本地 ONNX 嵌入模型失败: {primary_error}; endpoint={endpoint}; {fallback}"
                )
            })
        }
    }
}

#[cfg(feature = "local-onnx")]
fn get_local_onnx_embedding_blocking(text: &str, model: Option<&str>) -> Result<Vec<f32>, String> {
    if text.trim().is_empty() {
        return Err("本地 ONNX 嵌入文本不能为空".to_string());
    }

    let spec = resolve_local_onnx_model(model)?;
    let models = LOCAL_ONNX_MODELS.get_or_init(|| Mutex::new(HashMap::new()));
    let mut models = models
        .lock()
        .map_err(|_| "本地 ONNX 嵌入模型缓存锁已损坏".to_string())?;

    if !models.contains_key(spec.cache_key) {
        let model = build_local_onnx_model(&spec)?;
        models.insert(spec.cache_key, model);
    }

    let model = models
        .get_mut(spec.cache_key)
        .ok_or_else(|| "本地 ONNX 嵌入模型缓存未命中".to_string())?;
    let embeddings = model
        .embed([text], None)
        .map_err(|e| format!("本地 ONNX 嵌入推理失败: {e}"))?;

    embeddings
        .into_iter()
        .next()
        .filter(|embedding| !embedding.is_empty())
        .ok_or_else(|| "本地 ONNX 嵌入结果为空".to_string())
}

/// 使用本地 ONNX 文本嵌入模型生成向量。
#[cfg(feature = "local-onnx")]
pub async fn get_local_onnx_embedding(text: &str, model: Option<&str>) -> Result<Vec<f32>, String> {
    let text = text.to_string();
    let model = model.map(str::to_string);

    tokio::task::spawn_blocking(move || get_local_onnx_embedding_blocking(&text, model.as_deref()))
        .await
        .map_err(|e| format!("本地 ONNX 嵌入任务失败: {e}"))?
}

/// 使用本地 ONNX 文本嵌入模型生成向量。
#[cfg(not(feature = "local-onnx"))]
pub async fn get_local_onnx_embedding(
    _text: &str,
    _model: Option<&str>,
) -> Result<Vec<f32>, String> {
    Err("本地 ONNX 嵌入运行时未启用。请启用 lime-embedding/local-onnx 构建特性。".to_string())
}

/// 获取文本向量嵌入
///
/// # 参数
///
/// * `text` - 要向量化的文本
/// * `api_key` - OpenAI API 密钥
/// * `model` - 模型名称（可选，默认 text-embedding-3-small）
///
/// # 返回
///
/// 成功时返回向量数组，维度由当前嵌入模型决定；失败时返回错误信息
///
/// # 示例
///
/// ```ignore
/// use lime_embedding::get_embedding;
///
/// # tokio::runtime::Runtime::new().unwrap().block_on(async {
///     let api_key = "sk-...";
///     let text = "我喜欢喝咖啡";
///
///     match get_embedding(text, api_key, None).await {
///         Ok(embedding) => println!("向量维度: {}", embedding.len()),
///         Err(e) => eprintln!("错误: {}", e),
///     }
/// });
/// ```
pub async fn get_embedding(
    text: &str,
    api_key: &str,
    model: Option<&str>,
) -> Result<Vec<f32>, String> {
    get_embedding_with_base_url(text, api_key, None, model).await
}

/// 通过 OpenAI 兼容 Embeddings API 获取文本向量嵌入
pub async fn get_embedding_with_base_url(
    text: &str,
    api_key: &str,
    base_url: Option<&str>,
    model: Option<&str>,
) -> Result<Vec<f32>, String> {
    tracing::debug!(
        "[嵌入服务] 请求嵌入: text_len={}, model={:?}",
        text.len(),
        model
    );

    let client = Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {e}"))?;

    let model = model.unwrap_or("text-embedding-3-small");

    let req = EmbeddingRequest {
        input: text.to_string(),
        model: Some(model.to_string()),
    };

    let url = build_embeddings_url(base_url);

    tracing::debug!("[嵌入服务] 发送请求到: {}", url);

    let resp = client
        .post(&url)
        .header("Authorization", format!("Bearer {api_key}"))
        .json(&req)
        .send()
        .await
        .map_err(|e| format!("请求失败: {e}"))?;

    tracing::debug!("[嵌入服务] 响应状态: {}", resp.status());

    if resp.status() != 200 {
        let status = resp.status();
        let error_text = resp
            .text()
            .await
            .unwrap_or_else(|e| format!("读取错误响应失败: {e}"));

        tracing::error!("[嵌入服务] API 错误: {} - {}", status, error_text);

        return Err(format!("API 错误: {status} - {error_text}"));
    }

    let body = resp
        .text()
        .await
        .map_err(|e| format!("读取响应体失败: {e}"))?;

    tracing::debug!("[嵌入服务] 响应体长度: {} bytes", body.len());

    let response: EmbeddingResponse =
        serde_json::from_str(&body).map_err(|e| format!("JSON 解析失败: {e}"))?;

    if response.data.is_empty() {
        return Err("API 返回数据为空".to_string());
    }

    let embedding = &response.data[0].embedding;

    tracing::debug!("[嵌入服务] 向量维度: {}", embedding.len());

    Ok(embedding.clone())
}

fn build_embeddings_url(base_url: Option<&str>) -> String {
    let base = base_url
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("https://api.openai.com/v1")
        .trim_end_matches('/');

    if base.ends_with("/embeddings") {
        return base.to_string();
    }

    let base = if base_has_path(base) {
        base.to_string()
    } else {
        format!("{base}/v1")
    };

    format!("{base}/embeddings")
}

fn base_has_path(base: &str) -> bool {
    let without_scheme = base
        .strip_prefix("https://")
        .or_else(|| base.strip_prefix("http://"))
        .unwrap_or(base);
    without_scheme.contains('/')
}

/// 批量获取向量嵌入
///
/// # 参数
///
/// * `texts` - 文本列表
/// * `api_key` - OpenAI API 密钥
/// * `model` - 模型名称（可选）
///
/// # 返回
///
/// 成功时返回向量列表
pub async fn get_embeddings_batch(
    texts: &[String],
    api_key: &str,
    model: Option<&str>,
) -> Result<Vec<Vec<f32>>, String> {
    if texts.is_empty() {
        return Ok(Vec::new());
    }

    tracing::info!("[嵌入服务] 批量嵌入: count={}", texts.len());

    // 并发请求，限制并发数为 10
    let mut tasks = Vec::new();
    for chunk in texts.chunks(10) {
        for text in chunk {
            let text = text.clone();
            let api_key = api_key.to_string();
            let model = model.map(|s| s.to_string());

            let task =
                tokio::spawn(async move { get_embedding(&text, &api_key, model.as_deref()).await });

            tasks.push(task);
        }
    }

    let mut results = Vec::with_capacity(texts.len());
    let mut errors = Vec::new();

    for task in tasks {
        match task.await.map_err(|e| format!("任务失败: {e}"))? {
            Ok(embedding) => results.push(embedding),
            Err(e) => {
                tracing::warn!("[嵌入服务] 批量中单个失败: {}", e);
                errors.push(e);
                results.push(vec![]); // 占位
            }
        }
    }

    if !errors.is_empty() {
        tracing::warn!("[嵌入服务] 批量完成，但有 {} 个失败", errors.len());
    }

    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn real_api_test_enabled() -> bool {
        std::env::var("LIME_REAL_API_TEST").as_deref() == Ok("1")
            || std::env::var("PROXYCAST_REAL_API_TEST").as_deref() == Ok("1")
    }

    #[tokio::test]
    #[ignore = "真实联网测试：设置 LIME_REAL_API_TEST=1 后执行"]
    async fn test_get_embedding_mock() {
        if !real_api_test_enabled() {
            println!("跳过测试：未设置 LIME_REAL_API_TEST=1");
            return;
        }

        let api_key = std::env::var("OPENAI_API_KEY");
        if api_key.is_err() {
            println!("跳过测试：未设置 OPENAI_API_KEY");
            return;
        }

        let api_key = api_key.unwrap();
        let text = "测试文本";

        match get_embedding(text, &api_key, None).await {
            Ok(embedding) => {
                assert_eq!(embedding.len(), 1536); // text-embedding-3-small 是 1536 维
                println!("向量前 5 维: {:?}", &embedding[..5]);
            }
            Err(e) => {
                eprintln!("测试失败: {e}");
            }
        }
    }

    #[test]
    fn test_build_embeddings_url() {
        assert_eq!(
            build_embeddings_url(None),
            "https://api.openai.com/v1/embeddings"
        );
        assert_eq!(
            build_embeddings_url(Some("https://hub.lime.ai/v1")),
            "https://hub.lime.ai/v1/embeddings"
        );
        assert_eq!(
            build_embeddings_url(Some("https://api.openai.com")),
            "https://api.openai.com/v1/embeddings"
        );
        assert_eq!(
            build_embeddings_url(Some("https://api.example.com/v1/embeddings")),
            "https://api.example.com/v1/embeddings"
        );
    }

    #[test]
    fn test_normalize_local_onnx_model_name() {
        assert_eq!(
            normalize_local_onnx_model_name(None).unwrap(),
            DEFAULT_LOCAL_ONNX_EMBEDDING_MODEL
        );
        assert_eq!(
            normalize_local_onnx_model_name(Some(" all-MiniLM-L6-v2 ")).unwrap(),
            DEFAULT_LOCAL_ONNX_EMBEDDING_MODEL
        );
        assert_eq!(
            normalize_local_onnx_model_name(Some("sentence-transformers/all-MiniLM-L6-v2"))
                .unwrap(),
            DEFAULT_LOCAL_ONNX_EMBEDDING_MODEL
        );
        assert_eq!(
            normalize_local_onnx_model_name(Some("Qdrant/all-MiniLM-L6-v2-onnx")).unwrap(),
            DEFAULT_LOCAL_ONNX_EMBEDDING_MODEL
        );
    }

    #[test]
    fn test_normalize_local_onnx_model_rejects_unsupported_model() {
        let error = normalize_local_onnx_model_name(Some("text-embedding-3-small")).unwrap_err();
        assert!(error.contains("不支持的本地 ONNX 嵌入模型"));
    }

    #[cfg(feature = "local-onnx")]
    #[tokio::test]
    #[ignore = "真实模型下载和本地 ONNX 推理测试：设置 LIME_REAL_API_TEST=1 后执行"]
    async fn test_get_local_onnx_embedding_real() {
        if !real_api_test_enabled() {
            println!("跳过测试：未设置 LIME_REAL_API_TEST=1");
            return;
        }

        let embedding = get_local_onnx_embedding("测试文本", Some("all-MiniLM-L6-v2"))
            .await
            .expect("local onnx embedding");

        assert_eq!(embedding.len(), 384);
    }

    #[test]
    fn test_embedding_request_serialization() {
        let req = EmbeddingRequest {
            input: "测试".to_string(),
            model: Some("text-embedding-3-small".to_string()),
        };

        let json = serde_json::to_string(&req).unwrap();
        assert!(json.contains(r#""input":"测试""#));
        assert!(json.contains(r#""model":"text-embedding-3-small""#));
    }
}
