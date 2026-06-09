use app_server_protocol::ProjectMaterial;
use app_server_protocol::ProjectMaterialContentResponse;
use app_server_protocol::ProjectMaterialCountResponse;
use app_server_protocol::ProjectMaterialDeleteResponse;
use app_server_protocol::ProjectMaterialFilter;
use app_server_protocol::ProjectMaterialImportFromUrlParams;
use app_server_protocol::ProjectMaterialListParams;
use app_server_protocol::ProjectMaterialListResponse;
use app_server_protocol::ProjectMaterialLookupParams;
use app_server_protocol::ProjectMaterialResponse;
use app_server_protocol::ProjectMaterialUpdate;
use app_server_protocol::ProjectMaterialUpdateParams;
use app_server_protocol::ProjectMaterialUploadParams;
use base64::Engine;
use lime_core::database::dao::material_dao::MaterialDao;
use lime_core::database::DbConnection;
use lime_core::models::project_model as core_project_model;
use lime_services::material_service::MaterialService;
use reqwest::header::CONTENT_TYPE;
use std::fs;
use std::path::Path;
use tracing::warn;
use url::Url;
use uuid::Uuid;

const IMPORT_MAX_FILE_SIZE: usize = 50 * 1024 * 1024;

pub fn list_project_materials(
    db: &DbConnection,
    params: ProjectMaterialListParams,
) -> Result<ProjectMaterialListResponse, String> {
    let conn = db
        .lock()
        .map_err(|error| format!("数据库锁定失败: {error}"))?;
    let materials =
        MaterialService::list_materials(&conn, &params.project_id, params.filter.map(core_filter))
            .map_err(|error| error.to_string())?
            .into_iter()
            .map(protocol_material)
            .collect();
    Ok(ProjectMaterialListResponse { materials })
}

pub fn get_project_material(
    db: &DbConnection,
    params: ProjectMaterialLookupParams,
) -> Result<ProjectMaterialResponse, String> {
    let conn = db
        .lock()
        .map_err(|error| format!("数据库锁定失败: {error}"))?;
    let material = MaterialService::get_material(&conn, &params.id)
        .map_err(|error| error.to_string())?
        .map(protocol_material);
    Ok(ProjectMaterialResponse { material })
}

pub fn count_project_materials(
    db: &DbConnection,
    params: ProjectMaterialListParams,
) -> Result<ProjectMaterialCountResponse, String> {
    let conn = db
        .lock()
        .map_err(|error| format!("数据库锁定失败: {error}"))?;
    let count = MaterialDao::count(&conn, &params.project_id).map_err(|error| error.to_string())?;
    Ok(ProjectMaterialCountResponse { count })
}

pub fn upload_project_material(
    db: &DbConnection,
    params: ProjectMaterialUploadParams,
) -> Result<ProjectMaterialResponse, String> {
    let conn = db
        .lock()
        .map_err(|error| format!("数据库锁定失败: {error}"))?;
    let material = MaterialService::upload_material(&conn, core_upload_params(params))
        .map_err(|error| error.to_string())
        .map(protocol_material)?;
    Ok(ProjectMaterialResponse {
        material: Some(material),
    })
}

pub async fn import_project_material_from_url(
    db: &DbConnection,
    params: ProjectMaterialImportFromUrlParams,
) -> Result<ProjectMaterialResponse, String> {
    let normalized_material_type = params.material_type.trim().to_lowercase();
    if normalized_material_type.is_empty() {
        return Err("素材类型不能为空".to_string());
    }

    let normalized_url = params.url.trim();
    if normalized_url.is_empty() {
        return Err("URL 不能为空".to_string());
    }

    if normalized_material_type == "link" {
        let upload = core_project_model::UploadMaterialRequest {
            project_id: params.project_id,
            name: normalize_material_name(&params.name, normalized_url, "link", "txt"),
            material_type: normalized_material_type,
            file_path: None,
            content: Some(normalized_url.to_string()),
            tags: params.tags,
            description: params.description,
        };
        return upload_core_material(db, upload);
    }

    let (bytes, mime_type) = load_material_bytes(normalized_url).await?;
    let extension = resolve_import_extension(
        params.name.as_str(),
        normalized_url,
        mime_type.as_deref(),
        normalized_material_type.as_str(),
    );
    let temp_file_path = create_temp_file(&bytes, &extension)?;

    let upload = core_project_model::UploadMaterialRequest {
        project_id: params.project_id,
        name: normalize_material_name(
            &params.name,
            normalized_url,
            normalized_material_type.as_str(),
            &extension,
        ),
        material_type: normalized_material_type,
        file_path: Some(temp_file_path.clone()),
        content: None,
        tags: params.tags,
        description: params.description,
    };

    let result = upload_core_material(db, upload);
    if let Err(error) = fs::remove_file(&temp_file_path) {
        warn!(
            path = %temp_file_path,
            error = %error,
            "导入素材后删除临时文件失败"
        );
    }
    result
}

pub fn update_project_material(
    db: &DbConnection,
    params: ProjectMaterialUpdateParams,
) -> Result<ProjectMaterialResponse, String> {
    let conn = db
        .lock()
        .map_err(|error| format!("数据库锁定失败: {error}"))?;
    let material = MaterialService::update_material(&conn, &params.id, core_update(params.update))
        .map_err(|error| error.to_string())
        .map(protocol_material)?;
    Ok(ProjectMaterialResponse {
        material: Some(material),
    })
}

pub fn delete_project_material(
    db: &DbConnection,
    params: ProjectMaterialLookupParams,
) -> Result<ProjectMaterialDeleteResponse, String> {
    let conn = db
        .lock()
        .map_err(|error| format!("数据库锁定失败: {error}"))?;
    MaterialService::delete_material(&conn, &params.id).map_err(|error| error.to_string())?;
    Ok(ProjectMaterialDeleteResponse {})
}

pub fn read_project_material_content(
    db: &DbConnection,
    params: ProjectMaterialLookupParams,
) -> Result<ProjectMaterialContentResponse, String> {
    let conn = db
        .lock()
        .map_err(|error| format!("数据库锁定失败: {error}"))?;
    let content = MaterialService::get_material_content(&conn, &params.id)
        .map_err(|error| error.to_string())?;
    Ok(ProjectMaterialContentResponse { content })
}

fn upload_core_material(
    db: &DbConnection,
    upload: core_project_model::UploadMaterialRequest,
) -> Result<ProjectMaterialResponse, String> {
    let conn = db
        .lock()
        .map_err(|error| format!("数据库锁定失败: {error}"))?;
    let material = MaterialService::upload_material(&conn, upload)
        .map_err(|error| error.to_string())
        .map(protocol_material)?;
    Ok(ProjectMaterialResponse {
        material: Some(material),
    })
}

fn protocol_material(material: core_project_model::Material) -> ProjectMaterial {
    ProjectMaterial {
        id: material.id,
        project_id: material.project_id,
        name: material.name,
        material_type: material.material_type,
        file_path: material.file_path,
        file_size: material.file_size,
        mime_type: material.mime_type,
        content: material.content,
        tags: material.tags,
        description: material.description,
        created_at: material.created_at,
    }
}

fn core_filter(filter: ProjectMaterialFilter) -> core_project_model::MaterialFilter {
    core_project_model::MaterialFilter {
        material_type: filter.material_type,
        tags: filter.tags,
        search_query: filter.search_query,
    }
}

fn core_upload_params(
    params: ProjectMaterialUploadParams,
) -> core_project_model::UploadMaterialRequest {
    core_project_model::UploadMaterialRequest {
        project_id: params.project_id,
        name: params.name,
        material_type: params.material_type,
        file_path: params.file_path,
        content: params.content,
        tags: params.tags,
        description: params.description,
    }
}

fn core_update(update: ProjectMaterialUpdate) -> core_project_model::MaterialUpdate {
    core_project_model::MaterialUpdate {
        name: update.name,
        tags: update.tags,
        description: update.description,
    }
}

fn sanitize_extension(extension: &str) -> Option<String> {
    let normalized = extension.trim().trim_start_matches('.').to_lowercase();
    if normalized.is_empty() || normalized.len() > 12 {
        return None;
    }
    normalized
        .chars()
        .all(|character| character.is_ascii_alphanumeric())
        .then_some(normalized)
}

fn extension_from_name(name: &str) -> Option<String> {
    Path::new(name)
        .extension()
        .and_then(|value| value.to_str())
        .and_then(sanitize_extension)
}

fn extension_from_url(raw_url: &str) -> Option<String> {
    let parsed = Url::parse(raw_url).ok()?;
    let filename = parsed.path_segments()?.next_back()?;
    if filename.is_empty() {
        return None;
    }
    let extension = filename.rsplit_once('.')?.1;
    sanitize_extension(extension)
}

fn extension_from_mime(mime_type: &str) -> Option<&'static str> {
    match mime_type {
        "image/jpeg" => Some("jpg"),
        "image/png" => Some("png"),
        "image/gif" => Some("gif"),
        "image/webp" => Some("webp"),
        "image/svg+xml" => Some("svg"),
        "image/bmp" => Some("bmp"),
        "audio/mpeg" | "audio/mp3" => Some("mp3"),
        "audio/wav" => Some("wav"),
        "audio/aac" => Some("aac"),
        "audio/ogg" => Some("ogg"),
        "audio/flac" => Some("flac"),
        "video/mp4" => Some("mp4"),
        "video/webm" => Some("webm"),
        "video/quicktime" => Some("mov"),
        "application/pdf" => Some("pdf"),
        "application/json" => Some("json"),
        "text/plain" => Some("txt"),
        "text/markdown" => Some("md"),
        _ => None,
    }
}

fn default_extension_by_material_type(material_type: &str) -> &'static str {
    match material_type {
        "image" => "png",
        "audio" => "mp3",
        "video" => "mp4",
        "data" => "json",
        "text" | "document" => "txt",
        _ => "png",
    }
}

fn resolve_import_extension(
    name: &str,
    raw_url: &str,
    mime_type: Option<&str>,
    normalized_material_type: &str,
) -> String {
    extension_from_name(name)
        .or_else(|| extension_from_url(raw_url))
        .or_else(|| mime_type.and_then(extension_from_mime).map(str::to_string))
        .unwrap_or_else(|| default_extension_by_material_type(normalized_material_type).to_string())
}

fn normalize_material_name(
    raw_name: &str,
    raw_url: &str,
    material_type: &str,
    extension: &str,
) -> String {
    let trimmed = raw_name.trim();
    if !trimmed.is_empty() {
        return trimmed.to_string();
    }

    if let Some(name_from_url) = Url::parse(raw_url)
        .ok()
        .and_then(|url| {
            url.path_segments()
                .and_then(|mut segments| segments.next_back().map(str::to_string))
        })
        .map(|value| value.trim().to_string())
        .filter(|name| !name.is_empty())
    {
        return name_from_url;
    }

    let prefix = match material_type {
        "image" => "导入图片",
        "audio" => "导入语音",
        "video" => "导入视频",
        "data" => "导入数据",
        "text" => "导入文本",
        _ => "导入素材",
    };
    format!("{prefix}.{extension}")
}

fn decode_data_url(raw_url: &str) -> Result<(Vec<u8>, Option<String>), String> {
    let (header, payload) = raw_url
        .split_once(',')
        .ok_or_else(|| "data URL 格式不正确".to_string())?;

    if !header.starts_with("data:") {
        return Err("不支持的 URL 协议，仅支持 http(s) 或 data URL".to_string());
    }

    let meta = &header[5..];
    let mut mime_type: Option<String> = None;
    let mut is_base64 = false;

    if !meta.is_empty() {
        let mut segments = meta.split(';');
        if let Some(first) = segments.next() {
            let first_trimmed = first.trim();
            if !first_trimmed.is_empty() {
                mime_type = Some(first_trimmed.to_lowercase());
            }
        }
        is_base64 = segments.any(|segment| segment.eq_ignore_ascii_case("base64"));
    }

    if !is_base64 {
        return Err("data URL 必须使用 base64 编码".to_string());
    }

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(payload.trim())
        .map_err(|error| format!("解析 data URL 失败: {error}"))?;

    if bytes.len() > IMPORT_MAX_FILE_SIZE {
        return Err(format!(
            "素材文件过大，最大支持 {}MB",
            IMPORT_MAX_FILE_SIZE / 1024 / 1024
        ));
    }

    Ok((bytes, mime_type))
}

async fn load_material_bytes(raw_url: &str) -> Result<(Vec<u8>, Option<String>), String> {
    if raw_url.starts_with("data:") {
        return decode_data_url(raw_url);
    }

    let parsed = Url::parse(raw_url).map_err(|error| format!("URL 格式不正确: {error}"))?;
    match parsed.scheme() {
        "http" | "https" => {}
        _ => return Err("不支持的 URL 协议，仅支持 http(s) 或 data URL".to_string()),
    }

    let response = reqwest::get(parsed)
        .await
        .map_err(|error| format!("下载素材失败: {error}"))?;
    if !response.status().is_success() {
        return Err(format!("下载素材失败，HTTP 状态码 {}", response.status()));
    }

    let mime_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(';').next())
        .map(|value| value.trim().to_lowercase())
        .filter(|value| !value.is_empty());
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("读取素材内容失败: {error}"))?;

    if bytes.len() > IMPORT_MAX_FILE_SIZE {
        return Err(format!(
            "素材文件过大，最大支持 {}MB",
            IMPORT_MAX_FILE_SIZE / 1024 / 1024
        ));
    }

    Ok((bytes.to_vec(), mime_type))
}

fn create_temp_file(bytes: &[u8], extension: &str) -> Result<String, String> {
    let extension = sanitize_extension(extension).unwrap_or_else(|| "bin".to_string());
    let file_name = format!("project-material-import-{}.{}", Uuid::new_v4(), extension);
    let file_path = std::env::temp_dir().join(file_name);
    fs::write(&file_path, bytes).map_err(|error| format!("写入临时文件失败: {error}"))?;
    Ok(file_path.to_string_lossy().to_string())
}
