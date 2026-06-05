//! 视频生成服务
//!
//! 提供视频生成任务创建、状态轮询与结果管理能力。

use std::time::Duration;

use async_trait::async_trait;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use lime_core::database::dao::api_key_provider::ApiKeyProvider;
use lime_core::database::dao::material_dao::MaterialDao;
use lime_core::database::dao::video_generation_task_dao::{
    CreateVideoGenerationTaskParams, UpdateVideoGenerationTaskParams, VideoGenerationTask,
    VideoGenerationTaskDao, VideoGenerationTaskStatus,
};
use lime_core::database::{lock_db, DbConnection};
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};

use crate::api_key_provider_service::ApiKeyProviderService;

const DEFAULT_TIMEOUT_SECS: u64 = 45;
const DEFAULT_VOLCENGINE_HOST: &str = "https://ark.cn-beijing.volces.com/api/v3";
const DEFAULT_DASHSCOPE_HOST: &str = "https://dashscope.aliyuncs.com";
const MATERIAL_URL_PREFIX: &str = "material://";

/// 创建视频任务请求
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateVideoGenerationRequest {
    pub project_id: String,
    pub provider_id: String,
    pub model: String,
    pub prompt: String,
    pub aspect_ratio: Option<String>,
    pub resolution: Option<String>,
    pub duration: Option<i64>,
    pub image_url: Option<String>,
    pub end_image_url: Option<String>,
    pub seed: Option<i64>,
    pub generate_audio: Option<bool>,
    pub camera_fixed: Option<bool>,
}

/// 视频任务状态响应（用于 Provider 轮询）
#[derive(Debug, Clone)]
struct ProviderTaskStatus {
    status: VideoGenerationTaskStatus,
    progress: Option<i64>,
    video_url: Option<String>,
    error_message: Option<String>,
}

/// Provider 适配器上下文
#[derive(Debug, Clone)]
struct AdapterContext {
    api_host: String,
    api_key: String,
}

#[async_trait]
trait VideoProviderAdapter {
    async fn submit(
        &self,
        client: &Client,
        context: &AdapterContext,
        request: &CreateVideoGenerationRequest,
    ) -> Result<String, String>;

    async fn query(
        &self,
        client: &Client,
        context: &AdapterContext,
        provider_task_id: &str,
    ) -> Result<ProviderTaskStatus, String>;

    async fn cancel(
        &self,
        _client: &Client,
        _context: &AdapterContext,
        _provider_task_id: &str,
    ) -> Result<(), String> {
        Ok(())
    }
}

struct VolcengineVideoAdapter;
struct DashscopeVideoAdapter;

#[async_trait]
impl VideoProviderAdapter for VolcengineVideoAdapter {
    async fn submit(
        &self,
        client: &Client,
        context: &AdapterContext,
        request: &CreateVideoGenerationRequest,
    ) -> Result<String, String> {
        let base_url = normalize_host(
            if context.api_host.trim().is_empty() {
                DEFAULT_VOLCENGINE_HOST
            } else {
                &context.api_host
            },
            DEFAULT_VOLCENGINE_HOST,
        );
        let endpoint = format!(
            "{}/contents/generations/tasks",
            base_url.trim_end_matches('/')
        );

        let mut content = vec![json!({
            "type": "text",
            "text": request.prompt
        })];

        if let Some(image_url) = &request.image_url {
            if !image_url.trim().is_empty() {
                content.push(json!({
                    "type": "image_url",
                    "role": "first_frame",
                    "image_url": { "url": image_url }
                }));
            }
        }

        if let Some(end_image_url) = &request.end_image_url {
            if !end_image_url.trim().is_empty() {
                content.push(json!({
                    "type": "image_url",
                    "role": "last_frame",
                    "image_url": { "url": end_image_url }
                }));
            }
        }

        let mut body = Map::new();
        body.insert("model".to_string(), Value::String(request.model.clone()));
        body.insert("content".to_string(), Value::Array(content));
        body.insert("watermark".to_string(), Value::Bool(false));

        if let Some(aspect_ratio) = &request.aspect_ratio {
            if !aspect_ratio.trim().is_empty() && aspect_ratio != "adaptive" {
                body.insert("ratio".to_string(), Value::String(aspect_ratio.clone()));
            }
        }
        if let Some(duration) = request.duration {
            body.insert("duration".to_string(), Value::Number(duration.into()));
        }
        if let Some(seed) = request.seed {
            body.insert("seed".to_string(), Value::Number(seed.into()));
        }
        if let Some(generate_audio) = request.generate_audio {
            body.insert("generate_audio".to_string(), Value::Bool(generate_audio));
        }
        if let Some(camera_fixed) = request.camera_fixed {
            body.insert("camera_fixed".to_string(), Value::Bool(camera_fixed));
        }
        if let Some(resolution) = &request.resolution {
            if !resolution.trim().is_empty() {
                body.insert("resolution".to_string(), Value::String(resolution.clone()));
            }
        }

        let response = client
            .post(endpoint)
            .header(AUTHORIZATION, format!("Bearer {}", context.api_key))
            .header(CONTENT_TYPE, "application/json")
            .json(&Value::Object(body))
            .send()
            .await
            .map_err(|error| format!("火山视频任务提交失败: {error}"))?;

        let status = response.status();
        let payload = response
            .text()
            .await
            .map_err(|error| format!("火山视频响应读取失败: {error}"))?;

        if !status.is_success() {
            return Err(format!(
                "火山视频任务提交失败 ({}): {}",
                status.as_u16(),
                preview_payload(&payload)
            ));
        }

        let value: Value = serde_json::from_str(&payload)
            .map_err(|error| format!("火山视频响应解析失败: {error}"))?;

        find_string_value(&value, &["id", "task_id"])
            .ok_or_else(|| "火山视频响应缺少任务 ID".to_string())
    }

    async fn query(
        &self,
        client: &Client,
        context: &AdapterContext,
        provider_task_id: &str,
    ) -> Result<ProviderTaskStatus, String> {
        let base_url = normalize_host(
            if context.api_host.trim().is_empty() {
                DEFAULT_VOLCENGINE_HOST
            } else {
                &context.api_host
            },
            DEFAULT_VOLCENGINE_HOST,
        );
        let endpoint = format!(
            "{}/contents/generations/tasks/{}",
            base_url.trim_end_matches('/'),
            provider_task_id
        );

        let response = client
            .get(endpoint)
            .header(AUTHORIZATION, format!("Bearer {}", context.api_key))
            .send()
            .await
            .map_err(|error| format!("火山视频任务查询失败: {error}"))?;

        let status_code = response.status();
        let payload = response
            .text()
            .await
            .map_err(|error| format!("火山视频查询响应读取失败: {error}"))?;

        if !status_code.is_success() {
            return Err(format!(
                "火山视频任务查询失败 ({}): {}",
                status_code.as_u16(),
                preview_payload(&payload)
            ));
        }

        let value: Value = serde_json::from_str(&payload)
            .map_err(|error| format!("火山视频查询响应解析失败: {error}"))?;

        let raw_status = find_string_value(
            &value,
            &[
                "status",
                "state",
                "task_status",
                "taskStatus",
                "output.task_status",
            ],
        )
        .unwrap_or_else(|| "processing".to_string());

        let progress = find_i64_value(
            &value,
            &[
                "progress",
                "task_progress",
                "output.task_progress",
                "output.progress",
            ],
        );

        let video_url = extract_video_url(&value);
        let normalized_status = normalize_provider_status(&raw_status);
        let error_message = if normalized_status == VideoGenerationTaskStatus::Error {
            find_string_value(&value, &["error", "error_message", "message", "msg"])
                .or_else(|| Some("视频生成失败".to_string()))
        } else {
            None
        };

        Ok(ProviderTaskStatus {
            status: normalized_status,
            progress,
            video_url,
            error_message,
        })
    }
}

#[async_trait]
impl VideoProviderAdapter for DashscopeVideoAdapter {
    async fn submit(
        &self,
        client: &Client,
        context: &AdapterContext,
        request: &CreateVideoGenerationRequest,
    ) -> Result<String, String> {
        let base_url = normalize_host(
            if context.api_host.trim().is_empty() {
                DEFAULT_DASHSCOPE_HOST
            } else {
                &context.api_host
            },
            DEFAULT_DASHSCOPE_HOST,
        );
        let endpoint = format!(
            "{}/api/v1/services/aigc/video-generation/video-synthesis",
            base_url.trim_end_matches('/')
        );

        let mut input = Map::new();
        input.insert("prompt".to_string(), Value::String(request.prompt.clone()));
        if let Some(image_url) = &request.image_url {
            if !image_url.trim().is_empty() {
                input.insert("image_url".to_string(), Value::String(image_url.clone()));
            }
        }
        if let Some(end_image_url) = &request.end_image_url {
            if !end_image_url.trim().is_empty() {
                input.insert(
                    "end_image_url".to_string(),
                    Value::String(end_image_url.clone()),
                );
            }
        }

        let mut parameters = Map::new();
        if let Some(size) = resolve_dashscope_size(
            request.resolution.as_deref(),
            request.aspect_ratio.as_deref(),
        ) {
            parameters.insert("size".to_string(), Value::String(size));
        }
        if let Some(duration) = request.duration {
            parameters.insert("duration".to_string(), Value::Number(duration.into()));
        }
        if let Some(seed) = request.seed {
            parameters.insert("seed".to_string(), Value::Number(seed.into()));
        }
        if let Some(camera_fixed) = request.camera_fixed {
            parameters.insert("camera_fixed".to_string(), Value::Bool(camera_fixed));
        }

        let mut body = Map::new();
        body.insert("model".to_string(), Value::String(request.model.clone()));
        body.insert("input".to_string(), Value::Object(input));
        if !parameters.is_empty() {
            body.insert("parameters".to_string(), Value::Object(parameters));
        }

        let response = client
            .post(endpoint)
            .header(AUTHORIZATION, format!("Bearer {}", context.api_key))
            .header(CONTENT_TYPE, "application/json")
            .header("X-DashScope-Async", "enable")
            .json(&Value::Object(body))
            .send()
            .await
            .map_err(|error| format!("阿里视频任务提交失败: {error}"))?;

        let status = response.status();
        let payload = response
            .text()
            .await
            .map_err(|error| format!("阿里视频响应读取失败: {error}"))?;

        if !status.is_success() {
            return Err(format!(
                "阿里视频任务提交失败 ({}): {}",
                status.as_u16(),
                preview_payload(&payload)
            ));
        }

        let value: Value = serde_json::from_str(&payload)
            .map_err(|error| format!("阿里视频响应解析失败: {error}"))?;

        find_string_value(&value, &["output.task_id", "task_id", "id"])
            .ok_or_else(|| "阿里视频响应缺少任务 ID".to_string())
    }

    async fn query(
        &self,
        client: &Client,
        context: &AdapterContext,
        provider_task_id: &str,
    ) -> Result<ProviderTaskStatus, String> {
        let base_url = normalize_host(
            if context.api_host.trim().is_empty() {
                DEFAULT_DASHSCOPE_HOST
            } else {
                &context.api_host
            },
            DEFAULT_DASHSCOPE_HOST,
        );
        let endpoint = format!(
            "{}/api/v1/tasks/{}",
            base_url.trim_end_matches('/'),
            provider_task_id
        );

        let response = client
            .get(endpoint)
            .header(AUTHORIZATION, format!("Bearer {}", context.api_key))
            .send()
            .await
            .map_err(|error| format!("阿里视频任务查询失败: {error}"))?;

        let status_code = response.status();
        let payload = response
            .text()
            .await
            .map_err(|error| format!("阿里视频查询响应读取失败: {error}"))?;

        if !status_code.is_success() {
            return Err(format!(
                "阿里视频任务查询失败 ({}): {}",
                status_code.as_u16(),
                preview_payload(&payload)
            ));
        }

        let value: Value = serde_json::from_str(&payload)
            .map_err(|error| format!("阿里视频查询响应解析失败: {error}"))?;

        let raw_status = find_string_value(
            &value,
            &[
                "output.task_status",
                "task_status",
                "status",
                "state",
                "output.status",
            ],
        )
        .unwrap_or_else(|| "processing".to_string());
        let progress = find_i64_value(
            &value,
            &["output.task_progress", "task_progress", "progress"],
        );
        let video_url = extract_video_url(&value);

        let normalized_status = normalize_provider_status(&raw_status);
        let error_message = if normalized_status == VideoGenerationTaskStatus::Error {
            find_string_value(
                &value,
                &["output.message", "message", "error_message", "msg"],
            )
            .or_else(|| Some("视频生成失败".to_string()))
        } else {
            None
        };

        Ok(ProviderTaskStatus {
            status: normalized_status,
            progress,
            video_url,
            error_message,
        })
    }
}

fn normalize_host(api_host: &str, fallback: &str) -> String {
    let trimmed = api_host.trim();
    if trimmed.is_empty() {
        return fallback.trim_end_matches('/').to_string();
    }
    let with_protocol = if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        trimmed.to_string()
    } else {
        format!("https://{trimmed}")
    };
    with_protocol.trim_end_matches('/').to_string()
}

fn preview_payload(payload: &str) -> String {
    if payload.len() <= 280 {
        return payload.to_string();
    }
    format!("{}...", &payload[..280])
}

fn normalize_provider_status(raw_status: &str) -> VideoGenerationTaskStatus {
    let normalized = raw_status.trim().to_uppercase();
    if normalized.contains("SUCCEED")
        || normalized.contains("SUCCESS")
        || normalized == "DONE"
        || normalized == "COMPLETED"
    {
        return VideoGenerationTaskStatus::Success;
    }
    if normalized.contains("FAIL") || normalized.contains("ERROR") {
        return VideoGenerationTaskStatus::Error;
    }
    if normalized.contains("CANCEL") {
        return VideoGenerationTaskStatus::Cancelled;
    }
    if normalized.contains("PENDING")
        || normalized.contains("RUNNING")
        || normalized.contains("PROCESSING")
        || normalized.contains("QUEUE")
        || normalized.contains("SUBMITTED")
    {
        return VideoGenerationTaskStatus::Processing;
    }
    VideoGenerationTaskStatus::Processing
}

fn find_value_by_path<'a>(value: &'a Value, path: &str) -> Option<&'a Value> {
    let mut current = value;
    for segment in path.split('.') {
        match current {
            Value::Object(map) => {
                current = map.get(segment)?;
            }
            Value::Array(items) => {
                let index = segment.parse::<usize>().ok()?;
                current = items.get(index)?;
            }
            _ => return None,
        }
    }
    Some(current)
}

fn find_string_value(value: &Value, paths: &[&str]) -> Option<String> {
    for path in paths {
        if let Some(candidate) = find_value_by_path(value, path) {
            match candidate {
                Value::String(text) => {
                    if !text.trim().is_empty() {
                        return Some(text.clone());
                    }
                }
                Value::Number(number) => {
                    return Some(number.to_string());
                }
                _ => {}
            }
        }
    }
    None
}

fn find_i64_value(value: &Value, paths: &[&str]) -> Option<i64> {
    for path in paths {
        if let Some(candidate) = find_value_by_path(value, path) {
            match candidate {
                Value::Number(number) => {
                    if let Some(integer) = number.as_i64() {
                        return Some(integer);
                    }
                }
                Value::String(text) => {
                    if let Ok(parsed) = text.parse::<i64>() {
                        return Some(parsed);
                    }
                }
                _ => {}
            }
        }
    }
    None
}

fn extract_video_url(value: &Value) -> Option<String> {
    if let Some(url) = find_string_value(
        value,
        &[
            "output.video_url",
            "output.url",
            "video_url",
            "url",
            "result.video_url",
            "result.url",
            "output.video_urls.0",
        ],
    ) {
        if url.starts_with("http://") || url.starts_with("https://") {
            return Some(url);
        }
    }

    if let Some(results) = find_value_by_path(value, "output.results") {
        if let Value::Array(items) = results {
            for item in items {
                if let Some(url) = find_string_value(item, &["url", "video_url"]) {
                    if url.starts_with("http://") || url.starts_with("https://") {
                        return Some(url);
                    }
                }
            }
        }
    }

    None
}

fn resolve_dashscope_size(resolution: Option<&str>, aspect_ratio: Option<&str>) -> Option<String> {
    let ratio = aspect_ratio.unwrap_or("16:9");
    let normalized_ratio = if ratio == "adaptive" { "16:9" } else { ratio };
    let normalized_resolution = resolution.unwrap_or("720p").to_lowercase();

    let value = match (normalized_resolution.as_str(), normalized_ratio) {
        ("1080p", "16:9") => "1920*1080",
        ("1080p", "9:16") => "1080*1920",
        ("1080p", "1:1") => "1536*1536",
        ("720p", "16:9") => "1280*720",
        ("720p", "9:16") => "720*1280",
        ("720p", "1:1") => "1024*1024",
        ("480p", "16:9") => "854*480",
        ("480p", "9:16") => "480*854",
        ("480p", "1:1") => "720*720",
        _ => "1280*720",
    };

    Some(value.to_string())
}

fn infer_mime_type_from_path(path: &str) -> &'static str {
    let extension = std::path::Path::new(path)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_lowercase();

    match extension.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "svg" => "image/svg+xml",
        _ => "application/octet-stream",
    }
}

fn build_data_url(mime_type: &str, bytes: &[u8]) -> String {
    format!("data:{mime_type};base64,{}", BASE64.encode(bytes))
}

fn resolve_material_reference_url(db: &DbConnection, raw_url: &str) -> Result<String, String> {
    if !raw_url.starts_with(MATERIAL_URL_PREFIX) {
        return Ok(raw_url.to_string());
    }

    let material_id = raw_url
        .trim_start_matches(MATERIAL_URL_PREFIX)
        .trim()
        .to_string();
    if material_id.is_empty() {
        return Err("素材引用 URL 无效：缺少 material id".to_string());
    }

    let material = {
        let conn = lock_db(db)?;
        MaterialDao::get(&conn, &material_id).map_err(|error| format!("读取素材失败: {error}"))?
    }
    .ok_or_else(|| format!("素材不存在: {material_id}"))?;

    let file_path = material
        .file_path
        .ok_or_else(|| format!("素材缺少文件路径: {material_id}"))?;
    let bytes = std::fs::read(&file_path).map_err(|error| format!("读取素材文件失败: {error}"))?;
    let mime_type = material
        .mime_type
        .unwrap_or_else(|| infer_mime_type_from_path(&file_path).to_string());

    Ok(build_data_url(&mime_type, &bytes))
}

fn resolve_submit_request(
    db: &DbConnection,
    request: &CreateVideoGenerationRequest,
) -> Result<CreateVideoGenerationRequest, String> {
    let mut resolved = request.clone();
    if let Some(image_url) = &request.image_url {
        if !image_url.trim().is_empty() {
            resolved.image_url = Some(resolve_material_reference_url(db, image_url)?);
        }
    }
    if let Some(end_image_url) = &request.end_image_url {
        if !end_image_url.trim().is_empty() {
            resolved.end_image_url = Some(resolve_material_reference_url(db, end_image_url)?);
        }
    }
    Ok(resolved)
}

fn resolve_adapter(
    provider: &ApiKeyProvider,
) -> Result<Box<dyn VideoProviderAdapter + Send + Sync>, String> {
    let provider_id = provider.id.to_lowercase();
    let api_host = provider.api_host.to_lowercase();

    if provider_id.contains("doubao")
        || provider_id.contains("volc")
        || api_host.contains("volces.com")
        || api_host.contains("volcengine.com")
    {
        return Ok(Box::new(VolcengineVideoAdapter));
    }

    if provider_id.contains("dashscope")
        || provider_id.contains("alibaba")
        || provider_id.contains("qwen")
        || api_host.contains("dashscope.aliyuncs.com")
    {
        return Ok(Box::new(DashscopeVideoAdapter));
    }

    Err(format!(
        "当前 Provider 尚未实现视频生成适配: {} (api_host={})",
        provider.id, provider.api_host
    ))
}

/// 视频生成服务
pub struct VideoGenerationService {
    client: Client,
}

impl Default for VideoGenerationService {
    fn default() -> Self {
        Self::new()
    }
}

impl VideoGenerationService {
    pub fn new() -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(DEFAULT_TIMEOUT_SECS))
            .build()
            .unwrap_or_else(|_| Client::new());
        Self { client }
    }

    pub async fn create_task(
        &self,
        db: &DbConnection,
        api_key_provider_service: &ApiKeyProviderService,
        request: CreateVideoGenerationRequest,
    ) -> Result<VideoGenerationTask, String> {
        let provider_with_keys = api_key_provider_service
            .get_provider(db, &request.provider_id)?
            .ok_or_else(|| format!("Provider 不存在: {}", request.provider_id))?;
        let provider = provider_with_keys.provider;

        if !provider.enabled {
            return Err(format!("Provider 已禁用: {}", provider.id));
        }

        let request_payload = serde_json::to_string(&request)
            .map_err(|error| format!("视频任务请求序列化失败: {error}"))?;

        let mut task = {
            let conn = lock_db(db)?;
            VideoGenerationTaskDao::create(
                &conn,
                &CreateVideoGenerationTaskParams {
                    project_id: request.project_id.clone(),
                    provider_id: request.provider_id.clone(),
                    model: request.model.clone(),
                    prompt: request.prompt.clone(),
                    request_payload: Some(request_payload),
                    metadata_json: None,
                },
            )
            .map_err(|error| format!("视频任务创建失败: {error}"))?
        };

        let (selected_key_id, selected_api_key) = api_key_provider_service
            .get_next_api_key_entry(db, &provider.id)?
            .ok_or_else(|| format!("Provider 没有可用的 API Key: {}", provider.id))?;

        let adapter = resolve_adapter(&provider)?;
        let context = AdapterContext {
            api_host: provider.api_host.clone(),
            api_key: selected_api_key,
        };
        let submit_request = resolve_submit_request(db, &request)?;

        match adapter
            .submit(&self.client, &context, &submit_request)
            .await
        {
            Ok(provider_task_id) => {
                let updated = {
                    let conn = lock_db(db)?;
                    VideoGenerationTaskDao::update_task(
                        &conn,
                        &task.id,
                        &UpdateVideoGenerationTaskParams {
                            provider_task_id: Some(Some(provider_task_id)),
                            status: Some(VideoGenerationTaskStatus::Processing),
                            progress: Some(Some(0)),
                            result_url: None,
                            error_message: None,
                            metadata_json: None,
                            finished_at: Some(None),
                        },
                    )
                    .map_err(|error| format!("视频任务更新失败: {error}"))?
                };

                api_key_provider_service.record_usage(db, &selected_key_id)?;

                task = updated.ok_or_else(|| "视频任务更新后丢失".to_string())?;
                Ok(task)
            }
            Err(error_message) => {
                {
                    let conn = lock_db(db)?;
                    let _ = VideoGenerationTaskDao::update_task(
                        &conn,
                        &task.id,
                        &UpdateVideoGenerationTaskParams {
                            status: Some(VideoGenerationTaskStatus::Error),
                            error_message: Some(Some(error_message.clone())),
                            finished_at: Some(Some(chrono::Utc::now().timestamp())),
                            ..Default::default()
                        },
                    );
                }
                let _ = api_key_provider_service.record_error(db, &selected_key_id);

                Err(error_message)
            }
        }
    }

    pub async fn get_task(
        &self,
        db: &DbConnection,
        api_key_provider_service: &ApiKeyProviderService,
        task_id: &str,
        refresh_status: bool,
    ) -> Result<Option<VideoGenerationTask>, String> {
        let task = {
            let conn = lock_db(db)?;
            VideoGenerationTaskDao::get_by_id(&conn, task_id)
                .map_err(|error| format!("读取视频任务失败: {error}"))?
        };

        let mut task = match task {
            Some(value) => value,
            None => return Ok(None),
        };

        if !refresh_status {
            return Ok(Some(task));
        }

        if task.status != VideoGenerationTaskStatus::Pending
            && task.status != VideoGenerationTaskStatus::Processing
        {
            return Ok(Some(task));
        }

        let provider_task_id = match &task.provider_task_id {
            Some(value) if !value.trim().is_empty() => value.clone(),
            _ => return Ok(Some(task)),
        };

        let provider_with_keys = api_key_provider_service
            .get_provider(db, &task.provider_id)?
            .ok_or_else(|| format!("Provider 不存在: {}", task.provider_id))?;
        let provider = provider_with_keys.provider;
        let (_key_id, api_key) = api_key_provider_service
            .get_next_api_key_entry(db, &provider.id)?
            .ok_or_else(|| format!("Provider 没有可用的 API Key: {}", provider.id))?;

        let adapter = resolve_adapter(&provider)?;
        let context = AdapterContext {
            api_host: provider.api_host.clone(),
            api_key,
        };

        let status = match adapter
            .query(&self.client, &context, &provider_task_id)
            .await
        {
            Ok(value) => value,
            Err(error_message) => ProviderTaskStatus {
                status: VideoGenerationTaskStatus::Error,
                progress: None,
                video_url: None,
                error_message: Some(error_message),
            },
        };

        let updated_task = {
            let conn = lock_db(db)?;
            VideoGenerationTaskDao::update_task(
                &conn,
                &task.id,
                &UpdateVideoGenerationTaskParams {
                    status: Some(status.status),
                    progress: Some(status.progress),
                    result_url: Some(status.video_url),
                    error_message: Some(status.error_message),
                    finished_at: if matches!(
                        status.status,
                        VideoGenerationTaskStatus::Success
                            | VideoGenerationTaskStatus::Error
                            | VideoGenerationTaskStatus::Cancelled
                    ) {
                        Some(Some(chrono::Utc::now().timestamp()))
                    } else {
                        Some(None)
                    },
                    ..Default::default()
                },
            )
            .map_err(|error| format!("更新视频任务状态失败: {error}"))?
        };

        if let Some(updated) = updated_task {
            task = updated;
        }

        Ok(Some(task))
    }

    pub fn list_tasks(
        &self,
        db: &DbConnection,
        project_id: &str,
        limit: i64,
    ) -> Result<Vec<VideoGenerationTask>, String> {
        let conn = lock_db(db)?;
        VideoGenerationTaskDao::list_by_project(&conn, project_id, limit)
            .map_err(|error| format!("读取视频任务列表失败: {error}"))
    }

    pub async fn cancel_task(
        &self,
        db: &DbConnection,
        api_key_provider_service: &ApiKeyProviderService,
        task_id: &str,
    ) -> Result<Option<VideoGenerationTask>, String> {
        let task = {
            let conn = lock_db(db)?;
            VideoGenerationTaskDao::get_by_id(&conn, task_id)
                .map_err(|error| format!("读取视频任务失败: {error}"))?
        };

        let task = match task {
            Some(value) => value,
            None => return Ok(None),
        };

        if let Some(provider_task_id) = &task.provider_task_id {
            if let Some(provider_with_keys) =
                api_key_provider_service.get_provider(db, &task.provider_id)?
            {
                if let Some((_key_id, api_key)) = api_key_provider_service
                    .get_next_api_key_entry(db, &provider_with_keys.provider.id)?
                {
                    let adapter = resolve_adapter(&provider_with_keys.provider)?;
                    let context = AdapterContext {
                        api_host: provider_with_keys.provider.api_host.clone(),
                        api_key,
                    };
                    let _ = adapter
                        .cancel(&self.client, &context, provider_task_id)
                        .await;
                }
            }
        }

        let updated = {
            let conn = lock_db(db)?;
            VideoGenerationTaskDao::update_task(
                &conn,
                task_id,
                &UpdateVideoGenerationTaskParams {
                    status: Some(VideoGenerationTaskStatus::Cancelled),
                    finished_at: Some(Some(chrono::Utc::now().timestamp())),
                    ..Default::default()
                },
            )
            .map_err(|error| format!("取消视频任务失败: {error}"))?
        };

        Ok(updated)
    }
}
