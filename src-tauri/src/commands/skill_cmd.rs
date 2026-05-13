use crate::agent::aster_state::AsterAgentState;
use crate::database::dao::skills::SkillDao;
use crate::database::DbConnection;
use crate::models::app_type::AppType;
use crate::models::skill_model::{
    Skill, SkillCatalogSource, SkillPackageInspection, SkillRepo, SkillState,
};
use chrono::Utc;
use lime_core::app_paths;
use lime_services::skill_service::SkillService;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{Cursor, Read};
use std::path::{Component, Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use tauri::State;
use url::Url;
use zip::ZipArchive;

/// 从指定目录扫描已安装的 Skills
///
/// 扫描给定目录，返回包含 SKILL.md 的子目录名列表。
/// 这是一个可测试的内部函数。
///
/// # Arguments
/// - `skills_dir`: Skills 目录路径
///
/// # Returns
/// - `Vec<String>`: 已安装的 Skill 目录名列表
pub fn scan_installed_skills(skills_dir: &Path) -> Vec<String> {
    if !skills_dir.exists() {
        return vec![];
    }

    let mut skills = Vec::new();

    if let Ok(entries) = std::fs::read_dir(skills_dir) {
        for entry in entries.flatten() {
            if entry.path().is_dir() {
                let skill_md = entry.path().join("SKILL.md");
                if skill_md.exists() {
                    if let Some(name) = entry.file_name().to_str() {
                        skills.push(name.to_string());
                    }
                }
            }
        }
    }

    skills
}

fn scan_installed_skills_from_roots(skill_roots: &[PathBuf]) -> Vec<String> {
    let mut skills = Vec::new();
    for root in skill_roots {
        for directory in scan_installed_skills(root) {
            if !skills.contains(&directory) {
                skills.push(directory);
            }
        }
    }
    skills
}

fn get_skills_dir(app_type: &AppType) -> Result<PathBuf, String> {
    match app_type {
        AppType::Lime => app_paths::resolve_skills_dir(),
        AppType::Claude => dirs::home_dir()
            .ok_or_else(|| "Failed to get home directory".to_string())
            .map(|home| home.join(".claude").join("skills")),
        AppType::Codex => dirs::home_dir()
            .ok_or_else(|| "Failed to get home directory".to_string())
            .map(|home| home.join(".codex").join("skills")),
        AppType::Gemini => dirs::home_dir()
            .ok_or_else(|| "Failed to get home directory".to_string())
            .map(|home| home.join(".gemini").join("skills")),
    }
}

fn get_skill_lookup_roots(app_type: &AppType) -> Result<Vec<PathBuf>, String> {
    match app_type {
        AppType::Lime => app_paths::resolve_lime_skill_roots(),
        _ => Ok(vec![get_skills_dir(app_type)?]),
    }
}

fn validate_skill_directory(directory: &str) -> Result<(), String> {
    if directory.trim().is_empty() {
        return Err("Skill directory is required".to_string());
    }

    if directory.contains("..") || directory.contains('/') || directory.contains('\\') {
        return Err("Invalid skill directory".to_string());
    }

    let mut components = Path::new(directory).components();
    let first = components
        .next()
        .ok_or_else(|| "Skill directory is required".to_string())?;

    if components.next().is_some() {
        return Err("Invalid skill directory".to_string());
    }

    match first {
        Component::Normal(_) => Ok(()),
        _ => Err("Invalid skill directory".to_string()),
    }
}

fn validate_remote_skill_directory(directory: &str) -> Result<(), String> {
    let directory = directory.trim();
    if directory.is_empty() {
        return Err("Skill directory is required".to_string());
    }

    if directory.contains("..")
        || directory.contains('\\')
        || directory.starts_with('/')
        || directory.starts_with("./")
        || directory.ends_with("/.")
        || directory.contains("/./")
        || directory.split('/').any(str::is_empty)
    {
        return Err("Invalid skill directory".to_string());
    }

    let mut has_component = false;
    for component in Path::new(directory).components() {
        match component {
            Component::Normal(_) => has_component = true,
            _ => return Err("Invalid skill directory".to_string()),
        }
    }

    if has_component {
        Ok(())
    } else {
        Err("Skill directory is required".to_string())
    }
}

fn try_resolve_local_skill_dir(
    skills_dir: &Path,
    directory: &str,
) -> Result<Option<PathBuf>, String> {
    validate_skill_directory(directory)?;

    if !skills_dir.exists() {
        return Ok(None);
    }

    let canonical_skills_dir = skills_dir
        .canonicalize()
        .map_err(|e| format!("Failed to resolve skills directory: {e}"))?;

    let skill_dir = skills_dir.join(directory);
    if !skill_dir.exists() {
        return Ok(None);
    }

    let canonical_skill_dir = skill_dir
        .canonicalize()
        .map_err(|e| format!("Failed to resolve skill directory: {e}"))?;

    if !canonical_skill_dir.starts_with(&canonical_skills_dir) {
        return Err("Invalid skill directory path".to_string());
    }

    let skill_md_path = canonical_skill_dir.join("SKILL.md");
    if !skill_md_path.is_file() {
        return Ok(None);
    }

    Ok(Some(canonical_skill_dir))
}

fn resolve_local_skill_dir(skill_roots: &[PathBuf], directory: &str) -> Result<PathBuf, String> {
    validate_skill_directory(directory)?;

    for root in skill_roots {
        if let Some(skill_dir) = try_resolve_local_skill_dir(root, directory)? {
            return Ok(skill_dir);
        }
    }

    Err(format!("Skill not found: {directory}"))
}

fn inspect_local_skill(
    skill_roots: &[PathBuf],
    directory: &str,
) -> Result<SkillPackageInspection, String> {
    let skill_dir = resolve_local_skill_dir(skill_roots, directory)?;
    SkillService::inspect_skill_dir(&skill_dir).map_err(|e| e.to_string())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SkillScaffoldTarget {
    Project,
    User,
}

impl SkillScaffoldTarget {
    fn parse(value: &str) -> Result<Self, String> {
        match value.trim().to_ascii_lowercase().as_str() {
            "project" => Ok(Self::Project),
            "user" => Ok(Self::User),
            _ => Err(format!("Unsupported scaffold target: {value}")),
        }
    }
}

#[derive(Serialize)]
struct SkillScaffoldFrontmatter<'a> {
    name: &'a str,
    description: &'a str,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSkillScaffoldRequest {
    pub target: String,
    pub directory: String,
    pub name: String,
    pub description: String,
    #[serde(default)]
    pub when_to_use: Vec<String>,
    #[serde(default)]
    pub inputs: Vec<String>,
    #[serde(default)]
    pub outputs: Vec<String>,
    #[serde(default)]
    pub steps: Vec<String>,
    #[serde(default)]
    pub fallback_strategy: Vec<String>,
}

struct SkillScaffoldSections {
    when_to_use: Vec<String>,
    inputs: Vec<String>,
    outputs: Vec<String>,
    steps: Vec<String>,
    fallback_strategy: Vec<String>,
}

fn normalize_scaffold_items(items: &[String], fallback: &[&str]) -> Vec<String> {
    let normalized: Vec<String> = items
        .iter()
        .map(|item| item.trim())
        .filter(|item| !item.is_empty())
        .map(ToOwned::to_owned)
        .collect();

    if normalized.is_empty() {
        return fallback.iter().map(|item| (*item).to_string()).collect();
    }

    normalized
}

fn build_skill_scaffold_sections(request: &CreateSkillScaffoldRequest) -> SkillScaffoldSections {
    SkillScaffoldSections {
        when_to_use: normalize_scaffold_items(
            &request.when_to_use,
            &[
                "当你需要重复完成这类任务时使用。",
                "适合把一次成功结果沉淀成稳定可复用的工作流。",
            ],
        ),
        inputs: normalize_scaffold_items(
            &request.inputs,
            &[
                "用户目标、主题与成功标准。",
                "受众、风格、篇幅、平台或交付格式等约束。",
                "如有参考资料、示例或素材，请一并提供。",
            ],
        ),
        outputs: normalize_scaffold_items(
            &request.outputs,
            &[
                "交付一份可直接使用的完整结果。",
                "保留清晰的结构层级、重点信息与必要说明。",
            ],
        ),
        steps: normalize_scaffold_items(
            &request.steps,
            &[
                "先确认目标、边界与交付格式。",
                "提炼可复用的结构骨架，再补齐关键信息。",
                "输出可直接交付的首版结果，并为后续迭代留好锚点。",
            ],
        ),
        fallback_strategy: normalize_scaffold_items(
            &request.fallback_strategy,
            &[
                "信息不足时，先补问最关键的约束，不要自行假设事实。",
                "原结果不可直接复用时，先提炼最小骨架，再继续展开。",
            ],
        ),
    }
}

fn render_bullet_list(items: &[String]) -> String {
    items.iter().map(|item| format!("- {item}\n")).collect()
}

fn render_ordered_list(items: &[String]) -> String {
    items
        .iter()
        .enumerate()
        .map(|(index, item)| format!("{}. {item}\n", index + 1))
        .collect()
}

fn resolve_skill_scaffold_root(
    app_type: &AppType,
    target: SkillScaffoldTarget,
) -> Result<PathBuf, String> {
    match target {
        SkillScaffoldTarget::User => get_skills_dir(app_type),
        SkillScaffoldTarget::Project => match app_type {
            AppType::Lime => app_paths::resolve_project_skills_dir()
                .ok_or_else(|| "Failed to resolve project skills directory".to_string()),
            _ => Err("Project skill scaffold is only supported for lime".to_string()),
        },
    }
}

fn build_skill_scaffold_content(request: &CreateSkillScaffoldRequest) -> Result<String, String> {
    let name = request.name.trim();
    let description = request.description.trim();
    let sections = build_skill_scaffold_sections(request);
    let frontmatter = serde_yaml::to_string(&SkillScaffoldFrontmatter { name, description })
        .map_err(|e| format!("Failed to build skill frontmatter: {e}"))?;
    let frontmatter = frontmatter.strip_prefix("---\n").unwrap_or(&frontmatter);

    Ok(format!(
        "---\n{frontmatter}---\n\n# {name}\n\n## 何时使用\n{when_to_use}\n## 输入\n{inputs}\n## 执行步骤\n{steps}\n## 输出\n{outputs}\n## 失败回退\n{fallback_strategy}\n## 维护提示\n- 如需引用资料，请将文件放到 `references/` 目录。\n- 如需脚本或素材，请分别放到 `scripts/` 与 `assets/` 目录。\n- 如需长期沉淀模板或示例，优先放到相邻目录，不要把所有细节都塞进主文件。\n",
        when_to_use = render_bullet_list(&sections.when_to_use),
        inputs = render_bullet_list(&sections.inputs),
        steps = render_ordered_list(&sections.steps),
        outputs = render_bullet_list(&sections.outputs),
        fallback_strategy = render_bullet_list(&sections.fallback_strategy),
    ))
}

fn create_skill_scaffold_in_root(
    skills_root: &Path,
    request: &CreateSkillScaffoldRequest,
) -> Result<SkillPackageInspection, String> {
    let directory = request.directory.trim();
    validate_skill_directory(directory)?;

    let name = request.name.trim();
    if name.is_empty() {
        return Err("Skill name is required".to_string());
    }

    let description = request.description.trim();
    if description.is_empty() {
        return Err("Skill description is required".to_string());
    }

    fs::create_dir_all(skills_root).map_err(|e| {
        format!(
            "Failed to create skills root {}: {e}",
            skills_root.display()
        )
    })?;

    let skill_dir = skills_root.join(directory);
    if skill_dir.exists() {
        return Err(format!("Skill directory already exists: {directory}"));
    }

    fs::create_dir_all(&skill_dir).map_err(|e| {
        format!(
            "Failed to create skill directory {}: {e}",
            skill_dir.display()
        )
    })?;

    let skill_md_content = build_skill_scaffold_content(request)?;
    let skill_md_path = skill_dir.join("SKILL.md");
    if let Err(error) = fs::write(&skill_md_path, skill_md_content) {
        let _ = fs::remove_dir_all(&skill_dir);
        return Err(format!(
            "Failed to write scaffold file {}: {error}",
            skill_md_path.display()
        ));
    }

    match SkillService::inspect_skill_dir(&skill_dir) {
        Ok(inspection) => Ok(inspection),
        Err(error) => {
            let _ = fs::remove_dir_all(&skill_dir);
            Err(format!("Created scaffold failed inspection: {error}"))
        }
    }
}

fn copy_directory_recursive(source: &Path, destination: &Path) -> Result<(), String> {
    let metadata = fs::symlink_metadata(source)
        .map_err(|e| format!("Failed to read skill source {}: {e}", source.display()))?;

    if metadata.file_type().is_symlink() {
        return Err(format!(
            "Skill package contains unsupported symlink: {}",
            source.display()
        ));
    }

    if metadata.is_dir() {
        fs::create_dir_all(destination).map_err(|e| {
            format!(
                "Failed to create target directory {}: {e}",
                destination.display()
            )
        })?;

        let entries = fs::read_dir(source)
            .map_err(|e| format!("Failed to read skill directory {}: {e}", source.display()))?;

        for entry in entries {
            let entry = entry.map_err(|e| format!("Failed to read skill entry: {e}"))?;
            let child_source = entry.path();
            let child_destination = destination.join(entry.file_name());
            copy_directory_recursive(&child_source, &child_destination)?;
        }

        return Ok(());
    }

    if metadata.is_file() {
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent).map_err(|e| {
                format!(
                    "Failed to create target parent directory {}: {e}",
                    parent.display()
                )
            })?;
        }

        fs::copy(source, destination).map_err(|e| {
            format!(
                "Failed to copy skill file {} -> {}: {e}",
                source.display(),
                destination.display()
            )
        })?;
        return Ok(());
    }

    Err(format!(
        "Unsupported skill package entry: {}",
        source.display()
    ))
}

fn import_local_skill_into_root(skills_root: &Path, source_path: &Path) -> Result<String, String> {
    let canonical_source = source_path.canonicalize().map_err(|e| {
        format!(
            "Failed to resolve skill source {}: {e}",
            source_path.display()
        )
    })?;

    if !canonical_source.is_dir() {
        return Err("Skill source path must be a directory".to_string());
    }

    let inspection = SkillService::inspect_skill_dir(&canonical_source).map_err(|e| {
        format!(
            "Skill source is invalid {}: {e}",
            canonical_source.display()
        )
    })?;

    if !inspection.standard_compliance.validation_errors.is_empty() {
        return Err(format!(
            "Skill package is not Agent Skills compliant: {}",
            inspection.standard_compliance.validation_errors.join("; ")
        ));
    }

    let directory = canonical_source
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "Failed to resolve skill directory name".to_string())?;
    validate_skill_directory(directory)?;

    fs::create_dir_all(skills_root).map_err(|e| {
        format!(
            "Failed to create skills root {}: {e}",
            skills_root.display()
        )
    })?;

    let target_dir = skills_root.join(directory);
    if target_dir.exists() {
        return Err(format!("Skill directory already exists: {directory}"));
    }

    if let Err(error) = copy_directory_recursive(&canonical_source, &target_dir) {
        let _ = fs::remove_dir_all(&target_dir);
        return Err(error);
    }

    match SkillService::inspect_skill_dir(&target_dir) {
        Ok(imported_inspection)
            if imported_inspection
                .standard_compliance
                .validation_errors
                .is_empty() =>
        {
            Ok(directory.to_string())
        }
        Ok(imported_inspection) => {
            let _ = fs::remove_dir_all(&target_dir);
            Err(format!(
                "Imported skill is not Agent Skills compliant: {}",
                imported_inspection
                    .standard_compliance
                    .validation_errors
                    .join("; ")
            ))
        }
        Err(error) => {
            let _ = fs::remove_dir_all(&target_dir);
            Err(format!("Imported skill failed inspection: {error}"))
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct ImportedSkillResult {
    pub directory: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketplaceSkillBundleFile {
    pub path: String,
    pub content: String,
    #[serde(default)]
    pub encoding: Option<String>,
    #[serde(default)]
    pub sha256: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketplaceSkillBundle {
    pub manifest_version: String,
    pub name: String,
    #[serde(default)]
    #[allow(dead_code)]
    pub aliases: Vec<String>,
    #[allow(dead_code)]
    pub version: String,
    #[serde(default)]
    #[allow(dead_code)]
    pub content_hash: String,
    #[serde(default)]
    pub file_count: usize,
    pub files: Vec<MarketplaceSkillBundleFile>,
}

#[derive(Debug, Clone, Serialize)]
pub struct MarketplaceSkillInstallResult {
    pub directory: String,
    pub inspection: SkillPackageInspection,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillDownloadInstallRequest {
    pub skill_name: String,
    pub download_url: String,
}

const MAX_SKILL_DOWNLOAD_BYTES: usize = 20 * 1024 * 1024;

fn normalize_bundle_sha256(value: &str) -> String {
    value
        .trim()
        .strip_prefix("sha256:")
        .unwrap_or_else(|| value.trim())
        .to_ascii_lowercase()
}

fn validate_marketplace_file_path(path: &str) -> Result<PathBuf, String> {
    let path = path.trim();
    if path.is_empty() {
        return Err("Marketplace skill file path is required".to_string());
    }

    if path.contains('\\') || path.starts_with('/') || path.contains("..") {
        return Err(format!("Invalid marketplace skill file path: {path}"));
    }

    let mut normalized = PathBuf::new();
    let mut has_component = false;
    for component in Path::new(path).components() {
        match component {
            Component::Normal(value) => {
                has_component = true;
                normalized.push(value);
            }
            _ => return Err(format!("Invalid marketplace skill file path: {path}")),
        }
    }

    if !has_component {
        return Err("Marketplace skill file path is required".to_string());
    }

    Ok(normalized)
}

fn verify_marketplace_file_checksum(file: &MarketplaceSkillBundleFile) -> Result<(), String> {
    let Some(expected) = file.sha256.as_deref() else {
        return Ok(());
    };
    let expected = normalize_bundle_sha256(expected);
    if expected.is_empty() {
        return Ok(());
    }

    let actual = hex::encode(Sha256::digest(file.content.as_bytes()));
    if actual != expected {
        return Err(format!(
            "Marketplace skill file checksum mismatch: {}",
            file.path
        ));
    }

    Ok(())
}

fn validate_skill_download_url(value: &str) -> Result<String, String> {
    let url =
        Url::parse(value.trim()).map_err(|error| format!("Invalid skill download URL: {error}"))?;
    if url.scheme() != "https" {
        return Err("Skill download URL must use https".to_string());
    }
    Ok(url.to_string())
}

async fn download_skill_package_zip(download_url: &str) -> Result<Vec<u8>, String> {
    let download_url = validate_skill_download_url(download_url)?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|error| format!("Failed to create skill download client: {error}"))?;
    let response = client
        .get(download_url)
        .send()
        .await
        .map_err(|error| format!("Failed to download skill package: {error}"))?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!(
            "Skill package download failed with status {status}"
        ));
    }
    if let Some(content_length) = response.content_length() {
        if content_length > MAX_SKILL_DOWNLOAD_BYTES as u64 {
            return Err("Skill package is too large".to_string());
        }
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("Failed to read skill package: {error}"))?;
    if bytes.len() > MAX_SKILL_DOWNLOAD_BYTES {
        return Err("Skill package is too large".to_string());
    }
    Ok(bytes.to_vec())
}

fn normalize_zip_entry_path(path: &Path) -> Result<PathBuf, String> {
    let mut normalized = PathBuf::new();
    let mut has_component = false;
    for component in path.components() {
        match component {
            Component::Normal(value) => {
                has_component = true;
                normalized.push(value);
            }
            _ => return Err(format!("Invalid skill zip entry path: {}", path.display())),
        }
    }
    if !has_component {
        return Err("Skill zip entry path is required".to_string());
    }
    Ok(normalized)
}

fn is_ignorable_zip_entry(path: &Path) -> bool {
    let mut components = path.components();
    let Some(first) = components.next() else {
        return true;
    };
    let first = first.as_os_str().to_string_lossy();
    if first == "__MACOSX" {
        return true;
    }
    path.file_name()
        .map(|value| value.to_string_lossy() == ".DS_Store")
        .unwrap_or(false)
}

fn first_zip_component(path: &Path) -> Option<String> {
    path.components()
        .next()
        .and_then(|component| match component {
            Component::Normal(value) => Some(value.to_string_lossy().to_string()),
            _ => None,
        })
}

fn strip_first_zip_component(path: &Path) -> Result<PathBuf, String> {
    let mut stripped = PathBuf::new();
    let mut components = path.components();
    let _ = components.next();
    for component in components {
        match component {
            Component::Normal(value) => stripped.push(value),
            _ => return Err(format!("Invalid skill zip entry path: {}", path.display())),
        }
    }
    if stripped.as_os_str().is_empty() {
        return Err("Skill zip entry path is required".to_string());
    }
    Ok(stripped)
}

fn install_skill_zip_bytes_into_root(
    skills_root: &Path,
    skill_name: &str,
    bytes: &[u8],
) -> Result<MarketplaceSkillInstallResult, String> {
    let directory = skill_name.trim();
    validate_skill_directory(directory)?;
    if bytes.is_empty() {
        return Err("Skill package is empty".to_string());
    }

    let cursor = Cursor::new(bytes);
    let mut archive =
        ZipArchive::new(cursor).map_err(|error| format!("Invalid skill zip package: {error}"))?;
    let mut files: Vec<(PathBuf, Vec<u8>)> = Vec::new();
    for index in 0..archive.len() {
        let mut file = archive
            .by_index(index)
            .map_err(|error| format!("Failed to read skill zip entry: {error}"))?;
        if file.is_dir() {
            continue;
        }
        if file.name().contains('\\') {
            return Err(format!("Invalid skill zip entry path: {}", file.name()));
        }
        let enclosed = file
            .enclosed_name()
            .ok_or_else(|| format!("Invalid skill zip entry path: {}", file.name()))?;
        let normalized = normalize_zip_entry_path(enclosed)?;
        if is_ignorable_zip_entry(&normalized) {
            continue;
        }
        if file.size() > MAX_SKILL_DOWNLOAD_BYTES as u64 {
            return Err("Skill package file is too large".to_string());
        }
        let mut content = Vec::new();
        file.read_to_end(&mut content)
            .map_err(|error| format!("Failed to read skill zip entry {}: {error}", file.name()))?;
        if content.len() > MAX_SKILL_DOWNLOAD_BYTES {
            return Err("Skill package file is too large".to_string());
        }
        files.push((normalized, content));
    }

    if files.is_empty() {
        return Err("Skill package contains no files".to_string());
    }

    let root_skill_md = Path::new("SKILL.md");
    let has_root_skill_md = files.iter().any(|(path, _)| path == root_skill_md);
    let shared_zip_root = files
        .first()
        .and_then(|(path, _)| first_zip_component(path));
    let should_strip_directory = shared_zip_root
        .as_deref()
        .map(|root| {
            let nested_skill_md = Path::new(root).join("SKILL.md");
            !has_root_skill_md
                && files.iter().any(|(path, _)| path == &nested_skill_md)
                && files
                    .iter()
                    .all(|(path, _)| first_zip_component(path).as_deref() == Some(root))
        })
        .unwrap_or(false);

    fs::create_dir_all(skills_root).map_err(|e| {
        format!(
            "Failed to create skills root {}: {e}",
            skills_root.display()
        )
    })?;
    let target_dir = skills_root.join(directory);
    if target_dir.exists() {
        return Err(format!("Skill directory already exists: {directory}"));
    }
    fs::create_dir_all(&target_dir).map_err(|e| {
        format!(
            "Failed to create skill directory {}: {e}",
            target_dir.display()
        )
    })?;

    let mut has_skill_md = false;
    for (path, content) in files {
        let relative_path = if should_strip_directory {
            match strip_first_zip_component(&path) {
                Ok(value) => value,
                Err(error) => {
                    let _ = fs::remove_dir_all(&target_dir);
                    return Err(error);
                }
            }
        } else {
            path
        };
        let relative_path_text = match relative_path.to_str() {
            Some(value) => value,
            None => {
                let _ = fs::remove_dir_all(&target_dir);
                return Err("Skill zip entry path must be valid UTF-8".to_string());
            }
        };
        let relative_path = match validate_marketplace_file_path(relative_path_text) {
            Ok(value) => value,
            Err(error) => {
                let _ = fs::remove_dir_all(&target_dir);
                return Err(error);
            }
        };
        if relative_path == root_skill_md {
            has_skill_md = true;
        }
        let destination = target_dir.join(relative_path);
        if let Some(parent) = destination.parent() {
            if let Err(error) = fs::create_dir_all(parent) {
                let _ = fs::remove_dir_all(&target_dir);
                return Err(format!(
                    "Failed to create skill file parent {}: {error}",
                    parent.display()
                ));
            }
        }
        if let Err(error) = fs::write(&destination, content) {
            let _ = fs::remove_dir_all(&target_dir);
            return Err(format!(
                "Failed to write skill package file {}: {error}",
                destination.display()
            ));
        }
    }

    if !has_skill_md {
        let _ = fs::remove_dir_all(&target_dir);
        return Err("Skill package missing SKILL.md".to_string());
    }

    match SkillService::inspect_skill_dir(&target_dir) {
        Ok(inspection) if inspection.standard_compliance.validation_errors.is_empty() => {
            Ok(MarketplaceSkillInstallResult {
                directory: directory.to_string(),
                inspection,
            })
        }
        Ok(inspection) => {
            let _ = fs::remove_dir_all(&target_dir);
            Err(format!(
                "Downloaded skill is not Agent Skills compliant: {}",
                inspection.standard_compliance.validation_errors.join("; ")
            ))
        }
        Err(error) => {
            let _ = fs::remove_dir_all(&target_dir);
            Err(format!("Downloaded skill failed inspection: {error}"))
        }
    }
}

fn install_marketplace_skill_bundle_into_root(
    skills_root: &Path,
    bundle: &MarketplaceSkillBundle,
) -> Result<MarketplaceSkillInstallResult, String> {
    let directory = bundle.name.trim();
    validate_skill_directory(directory)?;

    if !bundle.manifest_version.trim().is_empty()
        && bundle.manifest_version.trim() != "agentskills.v1"
    {
        return Err(format!(
            "Unsupported marketplace skill manifest version: {}",
            bundle.manifest_version
        ));
    }

    if bundle.files.is_empty() {
        return Err("Marketplace skill bundle is empty".to_string());
    }

    if bundle.file_count > 0 && bundle.file_count != bundle.files.len() {
        return Err("Marketplace skill bundle file count mismatch".to_string());
    }

    fs::create_dir_all(skills_root).map_err(|e| {
        format!(
            "Failed to create skills root {}: {e}",
            skills_root.display()
        )
    })?;

    let target_dir = skills_root.join(directory);
    if target_dir.exists() {
        return Err(format!("Skill directory already exists: {directory}"));
    }

    fs::create_dir_all(&target_dir).map_err(|e| {
        format!(
            "Failed to create skill directory {}: {e}",
            target_dir.display()
        )
    })?;

    let mut has_skill_md = false;
    for file in &bundle.files {
        let encoding = file
            .encoding
            .as_deref()
            .unwrap_or("utf-8")
            .trim()
            .to_ascii_lowercase();
        if encoding != "utf-8" && encoding != "utf8" {
            let _ = fs::remove_dir_all(&target_dir);
            return Err(format!(
                "Unsupported marketplace skill file encoding: {}",
                file.path
            ));
        }

        if file.path.trim() == "SKILL.md" {
            has_skill_md = true;
        }
        if let Err(error) = verify_marketplace_file_checksum(file) {
            let _ = fs::remove_dir_all(&target_dir);
            return Err(error);
        }

        let relative_path = match validate_marketplace_file_path(&file.path) {
            Ok(value) => value,
            Err(error) => {
                let _ = fs::remove_dir_all(&target_dir);
                return Err(error);
            }
        };
        let destination = target_dir.join(relative_path);
        if let Some(parent) = destination.parent() {
            if let Err(error) = fs::create_dir_all(parent) {
                let _ = fs::remove_dir_all(&target_dir);
                return Err(format!(
                    "Failed to create skill file parent {}: {error}",
                    parent.display()
                ));
            }
        }
        if let Err(error) = fs::write(&destination, &file.content) {
            let _ = fs::remove_dir_all(&target_dir);
            return Err(format!(
                "Failed to write marketplace skill file {}: {error}",
                destination.display()
            ));
        }
    }

    if !has_skill_md {
        let _ = fs::remove_dir_all(&target_dir);
        return Err("Marketplace skill bundle missing SKILL.md".to_string());
    }

    match SkillService::inspect_skill_dir(&target_dir) {
        Ok(inspection) if inspection.standard_compliance.validation_errors.is_empty() => {
            Ok(MarketplaceSkillInstallResult {
                directory: directory.to_string(),
                inspection,
            })
        }
        Ok(inspection) => {
            let _ = fs::remove_dir_all(&target_dir);
            Err(format!(
                "Marketplace skill is not Agent Skills compliant: {}",
                inspection.standard_compliance.validation_errors.join("; ")
            ))
        }
        Err(error) => {
            let _ = fs::remove_dir_all(&target_dir);
            Err(format!("Marketplace skill failed inspection: {error}"))
        }
    }
}

/// 获取已安装的 Lime Skills 目录列表
///
/// 扫描 Lime 可发现的 provider Skills 根目录，返回包含 SKILL.md 的子目录名列表。
/// 这些 Skills 将被传递给 aster 用于 AI Agent 功能。
///
/// # Returns
/// - `Ok(Vec<String>)`: 已安装的 Skill 目录名列表
/// - `Err(String)`: 错误信息
#[tauri::command]
pub async fn get_installed_lime_skills() -> Result<Vec<String>, String> {
    let skill_roots = get_skill_lookup_roots(&AppType::Lime)?;
    Ok(scan_installed_skills_from_roots(&skill_roots))
}

/// 获取本地已安装 Skill 的标准检查结果
///
/// 仅支持读取本地 Skills 目录下的文件，包含目录合法性、路径穿越防护、
/// Agent Skills 标准检查和 Lime 扩展引用校验。
///
/// # Arguments
/// - `app`: 应用类型（lime/claude/codex/gemini）
/// - `directory`: Skill 目录名
///
/// # Returns
/// - `Ok(SkillPackageInspection)`: Skill 检查结果与原始内容
/// - `Err(String)`: 错误信息
#[tauri::command]
pub fn inspect_local_skill_for_app(
    app: String,
    directory: String,
) -> Result<SkillPackageInspection, String> {
    let app_type: AppType = app.parse().map_err(|e: String| e)?;
    let skill_roots = get_skill_lookup_roots(&app_type)?;
    inspect_local_skill(&skill_roots, &directory)
}

/// 创建标准 Skill 脚手架
///
/// 在项目级或用户级 Skills root 下创建一个最小 Agent Skills 标准包，
/// 并返回创建后的 inspection 结果，供 UI 立即预览。
#[tauri::command]
pub fn create_skill_scaffold_for_app(
    app: String,
    request: CreateSkillScaffoldRequest,
) -> Result<SkillPackageInspection, String> {
    let app_type: AppType = app.parse().map_err(|e: String| e)?;
    let target = SkillScaffoldTarget::parse(&request.target)?;
    let skills_root = resolve_skill_scaffold_root(&app_type, target)?;
    let inspection = create_skill_scaffold_in_root(&skills_root, &request)?;

    if matches!(app_type, AppType::Lime) {
        AsterAgentState::reload_lime_skills();
    }

    Ok(inspection)
}

/// 从本地目录导入 Skill
///
/// `source_path` 必须指向一个包含 `SKILL.md` 的单个 Skill 目录。
#[tauri::command]
pub fn import_local_skill_for_app(
    app: String,
    source_path: String,
) -> Result<ImportedSkillResult, String> {
    let app_type: AppType = app.parse().map_err(|e: String| e)?;
    let skills_root = get_skills_dir(&app_type)?;
    let directory = import_local_skill_into_root(&skills_root, Path::new(&source_path))?;

    if matches!(app_type, AppType::Lime) {
        AsterAgentState::reload_lime_skills();
    }

    Ok(ImportedSkillResult { directory })
}

/// 从官方技能市场 bundle 结构化安装 Skill。
///
/// bundle 文件必须是 AgentSkills 标准目录内的相对路径，写入后会立刻执行
/// 标准校验，失败时回滚已写入目录。
#[tauri::command]
pub fn install_marketplace_skill_for_app(
    app: String,
    bundle: MarketplaceSkillBundle,
) -> Result<MarketplaceSkillInstallResult, String> {
    let app_type: AppType = app.parse().map_err(|e: String| e)?;
    let skills_root = get_skills_dir(&app_type)?;
    let result = install_marketplace_skill_bundle_into_root(&skills_root, &bundle)?;

    if matches!(app_type, AppType::Lime) {
        AsterAgentState::reload_lime_skills();
    }

    Ok(result)
}

/// 从安装 Prompt 中的下载 URL 安装 Skill。
///
/// 该入口服务于官网复制的 Agent 安装 Prompt：下载 ZIP、解压到
/// Skills 目录、执行 Agent Skills 标准校验，并在 Lime 下刷新 runtime。
#[tauri::command]
pub async fn install_skill_from_download_url_for_app(
    app: String,
    request: SkillDownloadInstallRequest,
) -> Result<MarketplaceSkillInstallResult, String> {
    let app_type: AppType = app.parse().map_err(|e: String| e)?;
    let skill_name = request.skill_name.trim();
    validate_skill_directory(skill_name)?;
    let bytes = download_skill_package_zip(&request.download_url).await?;
    let skills_root = get_skills_dir(&app_type)?;
    let result = install_skill_zip_bytes_into_root(&skills_root, skill_name, &bytes)?;

    if matches!(app_type, AppType::Lime) {
        AsterAgentState::reload_lime_skills();
    }

    Ok(result)
}

/// 获取远程 Skill 包的标准检查结果
///
/// 直接从远程仓库读取目标 Skill 目录，返回标准检查结果与原始 SKILL.md，
/// 用于安装前预检和 workflow/reference 可见性。
#[tauri::command]
pub async fn inspect_remote_skill(
    skill_service: State<'_, SkillServiceState>,
    owner: String,
    name: String,
    branch: String,
    directory: String,
) -> Result<SkillPackageInspection, String> {
    validate_remote_skill_directory(&directory)?;
    skill_service
        .0
        .inspect_remote_skill(&owner, &name, &branch, &directory)
        .await
        .map_err(|e| e.to_string())
}

pub struct SkillServiceState(pub Arc<SkillService>);

fn get_skill_key(app_type: &AppType, directory: &str) -> String {
    format!("{}:{}", app_type.to_string().to_lowercase(), directory)
}

/// 解析指定应用的技能列表（供 dispatcher 等非 Tauri command 场景调用）
#[cfg_attr(any(test, not(debug_assertions)), allow(dead_code))]
pub async fn resolve_skills_for_app(
    db: &DbConnection,
    skill_service: &Arc<SkillService>,
    app_type: &AppType,
    _refresh_remote: bool,
) -> Result<Vec<Skill>, String> {
    let (repos, installed_states) = {
        let conn = db.lock().map_err(|e| e.to_string())?;
        let repos = SkillDao::get_skill_repos(&conn).map_err(|e| e.to_string())?;
        let installed_states = SkillDao::get_skills(&conn).map_err(|e| e.to_string())?;
        (repos, installed_states)
    };

    let skills = skill_service
        .list_skills(app_type, &repos, &installed_states)
        .await
        .map_err(|e| e.to_string())?;

    Ok(skills)
}

#[tauri::command]
pub async fn get_skills(
    db: State<'_, DbConnection>,
    skill_service: State<'_, SkillServiceState>,
) -> Result<Vec<Skill>, String> {
    get_skills_for_app(db, skill_service, "lime".to_string()).await
}

#[tauri::command]
pub async fn get_skills_for_app(
    db: State<'_, DbConnection>,
    skill_service: State<'_, SkillServiceState>,
    app: String,
) -> Result<Vec<Skill>, String> {
    let app_type: AppType = app.parse().map_err(|e: String| e)?;

    // 获取仓库列表和已安装状态（在 await 之前完成）
    let (repos, installed_states) = {
        let conn = db.lock().map_err(|e| e.to_string())?;
        let repos = SkillDao::get_skill_repos(&conn).map_err(|e| e.to_string())?;
        let installed_states = SkillDao::get_skills(&conn).map_err(|e| e.to_string())?;
        (repos, installed_states)
    };

    // 获取技能列表
    let skills = skill_service
        .0
        .list_skills(&app_type, &repos, &installed_states)
        .await
        .map_err(|e| e.to_string())?;

    // 自动同步本地已安装的 skills 到数据库
    {
        let conn = db.lock().map_err(|e| e.to_string())?;
        let existing_states = SkillDao::get_skills(&conn).map_err(|e| e.to_string())?;

        for skill in &skills {
            if skill.installed && skill.catalog_source != SkillCatalogSource::Project {
                let key = get_skill_key(&app_type, &skill.directory);
                if !existing_states.contains_key(&key) {
                    let state = SkillState {
                        installed: true,
                        installed_at: Utc::now(),
                    };
                    SkillDao::update_skill_state(&conn, &key, &state).map_err(|e| e.to_string())?;
                }
            }
        }
    }

    Ok(skills)
}

#[tauri::command]
pub fn get_local_skills_for_app(
    db: State<'_, DbConnection>,
    skill_service: State<'_, SkillServiceState>,
    app: String,
) -> Result<Vec<Skill>, String> {
    let app_type: AppType = app.parse().map_err(|e: String| e)?;

    let installed_states = {
        let conn = db.lock().map_err(|e| e.to_string())?;
        SkillDao::get_skills(&conn).map_err(|e| e.to_string())?
    };

    skill_service
        .0
        .list_local_skills(&app_type, &installed_states)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn install_skill(
    db: State<'_, DbConnection>,
    skill_service: State<'_, SkillServiceState>,
    directory: String,
) -> Result<bool, String> {
    install_skill_for_app(db, skill_service, "lime".to_string(), directory).await
}

#[tauri::command]
pub async fn install_skill_for_app(
    db: State<'_, DbConnection>,
    skill_service: State<'_, SkillServiceState>,
    app: String,
    directory: String,
) -> Result<bool, String> {
    let app_type: AppType = app.parse().map_err(|e: String| e)?;

    // 获取技能信息（在 await 之前完成）
    let (repos, installed_states) = {
        let conn = db.lock().map_err(|e| e.to_string())?;
        let repos = SkillDao::get_skill_repos(&conn).map_err(|e| e.to_string())?;
        let installed_states = SkillDao::get_skills(&conn).map_err(|e| e.to_string())?;
        (repos, installed_states)
    };

    let skills = skill_service
        .0
        .list_skills(&app_type, &repos, &installed_states)
        .await
        .map_err(|e| e.to_string())?;

    let skill = skills
        .iter()
        .find(|s| s.directory == directory)
        .ok_or_else(|| format!("Skill not found: {directory}"))?;

    let repo_owner = skill
        .repo_owner
        .as_ref()
        .ok_or_else(|| "Missing repo owner".to_string())?
        .clone();
    let repo_name = skill
        .repo_name
        .as_ref()
        .ok_or_else(|| "Missing repo name".to_string())?
        .clone();
    let repo_branch = skill
        .repo_branch
        .as_ref()
        .ok_or_else(|| "Missing repo branch".to_string())?
        .clone();

    // 安装技能
    skill_service
        .0
        .install_skill(&app_type, &repo_owner, &repo_name, &repo_branch, &directory)
        .await
        .map_err(|e| e.to_string())?;

    // 更新数据库
    let key = get_skill_key(&app_type, &directory);
    let state = SkillState {
        installed: true,
        installed_at: Utc::now(),
    };

    {
        let conn = db.lock().map_err(|e| e.to_string())?;
        SkillDao::update_skill_state(&conn, &key, &state).map_err(|e| e.to_string())?;
    }

    // 刷新 aster-rust 的 global_registry，使 AI 能够发现新安装的 Skill
    AsterAgentState::reload_lime_skills();

    Ok(true)
}

#[tauri::command]
pub fn uninstall_skill(db: State<'_, DbConnection>, directory: String) -> Result<bool, String> {
    uninstall_skill_for_app(db, "lime".to_string(), directory)
}

#[tauri::command]
pub fn uninstall_skill_for_app(
    db: State<'_, DbConnection>,
    app: String,
    directory: String,
) -> Result<bool, String> {
    let app_type: AppType = app.parse().map_err(|e: String| e)?;

    // 卸载技能
    SkillService::uninstall_skill(&app_type, &directory).map_err(|e| e.to_string())?;

    // 更新数据库
    let key = get_skill_key(&app_type, &directory);
    let state = SkillState {
        installed: false,
        installed_at: Utc::now(),
    };

    let conn = db.lock().map_err(|e| e.to_string())?;
    SkillDao::update_skill_state(&conn, &key, &state).map_err(|e| e.to_string())?;

    // 刷新 aster-rust 的 global_registry，移除已卸载的 Skill
    AsterAgentState::reload_lime_skills();

    Ok(true)
}

#[tauri::command]
pub fn get_skill_repos(db: State<'_, DbConnection>) -> Result<Vec<SkillRepo>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    SkillDao::get_skill_repos(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_skill_repo(db: State<'_, DbConnection>, repo: SkillRepo) -> Result<bool, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    SkillDao::save_skill_repo(&conn, &repo).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub fn remove_skill_repo(
    db: State<'_, DbConnection>,
    owner: String,
    name: String,
) -> Result<bool, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    SkillDao::delete_skill_repo(&conn, &owner, &name).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub fn refresh_skill_cache(skill_service: State<'_, SkillServiceState>) -> Result<bool, String> {
    skill_service.0.refresh_cache();
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;
    use std::collections::HashSet;
    use std::io::Write;
    use tempfile::TempDir;
    use zip::write::FileOptions;

    /// 生成有效的 Skill 目录名（字母数字和连字符）
    fn skill_name_strategy() -> impl Strategy<Value = String> {
        "[a-z][a-z0-9-]{0,20}".prop_filter("non-empty", |s| !s.is_empty())
    }

    /// 生成 Skill 目录名列表
    fn skill_names_strategy() -> impl Strategy<Value = Vec<String>> {
        prop::collection::vec(skill_name_strategy(), 0..10).prop_filter("unique names", |names| {
            let set: HashSet<_> = names.iter().collect();
            set.len() == names.len()
        })
    }

    /// 创建测试用的 Skills 目录结构
    fn create_test_skills_dir(temp_dir: &TempDir, skill_names: &[String]) {
        let skills_dir = temp_dir.path();

        for name in skill_names {
            let skill_path = skills_dir.join(name);
            std::fs::create_dir_all(&skill_path).unwrap();
            let skill_md_path = skill_path.join("SKILL.md");
            std::fs::write(&skill_md_path, "# Test Skill\n").unwrap();
        }
    }

    // **Feature: skills-platform-mvp, Property 2: Installed Skills Discovery**
    // **Validates: Requirements 2.1, 2.2, 2.3**
    //
    // *For any* valid skills 目录 containing subdirectories
    // with SKILL.md files, calling `scan_installed_skills()` SHALL return a list
    // containing exactly those subdirectory names.
    proptest! {
        #![proptest_config(ProptestConfig::with_cases(100))]

        #[test]
        fn prop_installed_skills_discovery(skill_names in skill_names_strategy()) {
            // Arrange: 创建临时目录和 Skills 结构
            let temp_dir = TempDir::new().unwrap();
            create_test_skills_dir(&temp_dir, &skill_names);

            // Act: 扫描已安装的 Skills
            let discovered = scan_installed_skills(temp_dir.path());

            // Assert: 发现的 Skills 应该与创建的完全匹配
            let expected_set: HashSet<_> = skill_names.iter().cloned().collect();
            let discovered_set: HashSet<_> = discovered.iter().cloned().collect();

            prop_assert_eq!(
                expected_set,
                discovered_set,
                "Discovered skills should match created skills exactly"
            );
        }

        #[test]
        fn prop_empty_dir_returns_empty_list(skill_names in skill_names_strategy()) {
            // Arrange: 创建临时目录但不创建任何 Skills
            let temp_dir = TempDir::new().unwrap();

            // 创建目录但不添加 SKILL.md
            for name in &skill_names {
                let skill_path = temp_dir.path().join(name);
                std::fs::create_dir_all(&skill_path).unwrap();
                // 不创建 SKILL.md 文件
            }

            // Act: 扫描已安装的 Skills
            let discovered = scan_installed_skills(temp_dir.path());

            // Assert: 没有 SKILL.md 的目录不应该被发现
            prop_assert!(
                discovered.is_empty(),
                "Directories without SKILL.md should not be discovered"
            );
        }

        #[test]
        fn prop_nonexistent_dir_returns_empty_list(_dummy in 0..1i32) {
            // Arrange: 使用不存在的目录路径
            let nonexistent_path = std::path::Path::new("/nonexistent/path/to/skills");

            // Act: 扫描不存在的目录
            let discovered = scan_installed_skills(nonexistent_path);

            // Assert: 不存在的目录应该返回空列表
            prop_assert!(
                discovered.is_empty(),
                "Non-existent directory should return empty list"
            );
        }
    }

    #[test]
    fn test_scan_installed_skills_with_mixed_content() {
        // Arrange: 创建包含混合内容的目录
        let temp_dir = TempDir::new().unwrap();
        let skills_dir = temp_dir.path();

        // 创建有效的 Skill 目录（有 SKILL.md）
        let valid_skill = skills_dir.join("valid-skill");
        std::fs::create_dir_all(&valid_skill).unwrap();
        std::fs::write(valid_skill.join("SKILL.md"), "# Valid Skill").unwrap();

        // 创建无效的目录（没有 SKILL.md）
        let invalid_skill = skills_dir.join("invalid-skill");
        std::fs::create_dir_all(&invalid_skill).unwrap();

        // 创建文件（不是目录）
        std::fs::write(skills_dir.join("not-a-directory.txt"), "test").unwrap();

        // Act
        let discovered = scan_installed_skills(skills_dir);

        // Assert: 只有有效的 Skill 应该被发现
        assert_eq!(discovered.len(), 1);
        assert!(discovered.contains(&"valid-skill".to_string()));
    }

    #[test]
    fn test_scan_installed_skills_from_roots_deduplicates_provider_roots() {
        let temp_dir = TempDir::new().unwrap();
        let agents_root = temp_dir.path().join(".agents").join("skills");
        let claude_root = temp_dir.path().join(".claude").join("skills");

        for skill_dir in [
            agents_root.join("shared-skill"),
            claude_root.join("shared-skill"),
            claude_root.join("claude-only"),
        ] {
            std::fs::create_dir_all(&skill_dir).unwrap();
            std::fs::write(skill_dir.join("SKILL.md"), "# Test Skill").unwrap();
        }

        let discovered =
            scan_installed_skills_from_roots(&[agents_root.clone(), claude_root.clone()]);
        let discovered_set: HashSet<_> = discovered.into_iter().collect();

        assert_eq!(discovered_set.len(), 2);
        assert!(discovered_set.contains("shared-skill"));
        assert!(discovered_set.contains("claude-only"));
    }

    #[test]
    fn test_inspect_local_skill_success() {
        let temp_dir = TempDir::new().unwrap();
        let skills_dir = temp_dir.path().join("skills");
        let skill_dir = skills_dir.join("demo-skill");
        let references_dir = skill_dir.join("references");
        std::fs::create_dir_all(&references_dir).unwrap();
        std::fs::write(
            skill_dir.join("SKILL.md"),
            r#"---
name: Demo Skill
description: Inspect me
metadata:
  lime_workflow_ref: references/workflow.yaml
---

# Demo Skill
content"#,
        )
        .unwrap();
        std::fs::write(
            references_dir.join("workflow.yaml"),
            "- id: draft\n  title: 起草\n",
        )
        .unwrap();

        let inspection = inspect_local_skill(&[skills_dir.clone()], "demo-skill").unwrap();
        assert!(inspection.content.contains("# Demo Skill"));
        assert!(inspection.resource_summary.has_references);
        assert!(inspection.standard_compliance.validation_errors.is_empty());
    }

    #[test]
    fn test_inspect_local_skill_rejects_traversal() {
        let temp_dir = TempDir::new().unwrap();
        let skills_dir = temp_dir.path().join("skills");
        std::fs::create_dir_all(&skills_dir).unwrap();

        let err = inspect_local_skill(&[skills_dir.clone()], "../outside").unwrap_err();
        assert!(err.contains("Invalid skill directory"));
    }

    #[test]
    fn test_validate_remote_skill_directory_accepts_anthropic_nested_path() {
        assert!(validate_remote_skill_directory("skills/docx").is_ok());
        assert!(validate_remote_skill_directory("docx").is_ok());
    }

    #[test]
    fn test_validate_remote_skill_directory_rejects_traversal() {
        assert!(validate_remote_skill_directory("../docx").is_err());
        assert!(validate_remote_skill_directory("skills/../docx").is_err());
        assert!(validate_remote_skill_directory("skills\\docx").is_err());
        assert!(validate_remote_skill_directory("/skills/docx").is_err());
        assert!(validate_remote_skill_directory("skills//docx").is_err());
        assert!(validate_remote_skill_directory("skills/./docx").is_err());
    }

    #[test]
    fn test_inspect_local_skill_missing_skill_md() {
        let temp_dir = TempDir::new().unwrap();
        let skills_dir = temp_dir.path().join("skills");
        let skill_dir = skills_dir.join("no-skill-md");
        std::fs::create_dir_all(&skill_dir).unwrap();

        let err = inspect_local_skill(&[skills_dir.clone()], "no-skill-md").unwrap_err();
        assert!(err.contains("Skill not found"));
    }

    #[cfg(unix)]
    #[test]
    fn test_inspect_local_skill_rejects_symlink_escape() {
        use std::os::unix::fs::symlink;

        let temp_dir = TempDir::new().unwrap();
        let skills_dir = temp_dir.path().join("skills");
        std::fs::create_dir_all(&skills_dir).unwrap();

        let outside_dir = temp_dir.path().join("outside-skill");
        std::fs::create_dir_all(&outside_dir).unwrap();
        std::fs::write(outside_dir.join("SKILL.md"), "# Outside").unwrap();

        let symlink_dir = skills_dir.join("escape-skill");
        symlink(&outside_dir, &symlink_dir).unwrap();

        let err = inspect_local_skill(&[skills_dir.clone()], "escape-skill").unwrap_err();
        assert!(err.contains("Invalid skill directory path"));
    }

    #[test]
    fn test_inspect_local_skill_prefers_project_root_order() {
        let temp_dir = TempDir::new().unwrap();
        let project_skills_dir = temp_dir
            .path()
            .join("project")
            .join(".agents")
            .join("skills");
        let user_skills_dir = temp_dir.path().join("user-skills");
        let project_skill_dir = project_skills_dir.join("demo-skill");
        let user_skill_dir = user_skills_dir.join("demo-skill");

        std::fs::create_dir_all(&project_skill_dir).unwrap();
        std::fs::create_dir_all(&user_skill_dir).unwrap();
        std::fs::write(
            project_skill_dir.join("SKILL.md"),
            "---\nname: Project Skill\ndescription: project\n---\n",
        )
        .unwrap();
        std::fs::write(
            user_skill_dir.join("SKILL.md"),
            "---\nname: User Skill\ndescription: user\n---\n",
        )
        .unwrap();

        let inspection = inspect_local_skill(
            &[project_skills_dir.clone(), user_skills_dir.clone()],
            "demo-skill",
        )
        .unwrap();

        assert!(inspection.content.contains("Project Skill"));
        assert!(!inspection.content.contains("User Skill"));
    }

    #[test]
    fn test_create_skill_scaffold_in_root_creates_standard_package() {
        let temp_dir = TempDir::new().unwrap();
        let skills_dir = temp_dir.path().join("skills");

        let inspection = create_skill_scaffold_in_root(
            &skills_dir,
            &CreateSkillScaffoldRequest {
                target: "project".to_string(),
                directory: "draft-skill".to_string(),
                name: "Draft Skill".to_string(),
                description: "Create a new draft".to_string(),
                when_to_use: vec!["当你需要复用草稿输出时使用。".to_string()],
                inputs: vec!["目标与主题：草稿输出".to_string()],
                outputs: vec!["交付一份可直接复用的草稿。".to_string()],
                steps: vec!["先确认目标，再复用结构。".to_string()],
                fallback_strategy: vec!["信息不足时先补问。".to_string()],
            },
        )
        .unwrap();

        let skill_md = skills_dir.join("draft-skill").join("SKILL.md");
        assert!(skill_md.is_file());
        assert!(inspection.standard_compliance.is_standard);
        assert!(inspection.content.contains("name: Draft Skill"));
        assert!(inspection.content.contains("# Draft Skill"));
        assert!(inspection.content.contains("## 失败回退"));
        assert!(inspection.content.contains("当你需要复用草稿输出时使用。"));
        assert!(inspection.content.contains("1. 先确认目标，再复用结构。"));
    }

    #[test]
    fn test_create_skill_scaffold_in_root_rejects_existing_directory() {
        let temp_dir = TempDir::new().unwrap();
        let skills_dir = temp_dir.path().join("skills");
        std::fs::create_dir_all(skills_dir.join("draft-skill")).unwrap();

        let err = create_skill_scaffold_in_root(
            &skills_dir,
            &CreateSkillScaffoldRequest {
                target: "project".to_string(),
                directory: "draft-skill".to_string(),
                name: "Draft Skill".to_string(),
                description: "Create a new draft".to_string(),
                when_to_use: Vec::new(),
                inputs: Vec::new(),
                outputs: Vec::new(),
                steps: Vec::new(),
                fallback_strategy: Vec::new(),
            },
        )
        .unwrap_err();

        assert!(err.contains("already exists"));
    }

    #[test]
    fn test_import_local_skill_into_root_copies_directory_tree() {
        let temp_dir = TempDir::new().unwrap();
        let source_dir = temp_dir.path().join("source-skill");
        let references_dir = source_dir.join("references");
        let scripts_dir = source_dir.join("scripts");
        let target_root = temp_dir.path().join("skills");

        std::fs::create_dir_all(&references_dir).unwrap();
        std::fs::create_dir_all(&scripts_dir).unwrap();
        std::fs::write(
            source_dir.join("SKILL.md"),
            "---\nname: Source Skill\ndescription: import me\n---\n",
        )
        .unwrap();
        std::fs::write(references_dir.join("guide.md"), "# guide").unwrap();
        std::fs::write(scripts_dir.join("run.js"), "console.log('ok')").unwrap();

        let imported_directory = import_local_skill_into_root(&target_root, &source_dir).unwrap();

        assert_eq!(imported_directory, "source-skill");
        assert!(target_root.join("source-skill").join("SKILL.md").is_file());
        assert!(target_root
            .join("source-skill")
            .join("references")
            .join("guide.md")
            .is_file());
        assert!(target_root
            .join("source-skill")
            .join("scripts")
            .join("run.js")
            .is_file());
    }

    #[test]
    fn test_import_local_skill_into_root_rejects_existing_directory() {
        let temp_dir = TempDir::new().unwrap();
        let source_dir = temp_dir.path().join("source-skill");
        let target_root = temp_dir.path().join("skills");
        let existing_dir = target_root.join("source-skill");

        std::fs::create_dir_all(&source_dir).unwrap();
        std::fs::write(
            source_dir.join("SKILL.md"),
            "---\nname: Source Skill\ndescription: import me\n---\n",
        )
        .unwrap();
        std::fs::create_dir_all(&existing_dir).unwrap();

        let err = import_local_skill_into_root(&target_root, &source_dir).unwrap_err();
        assert!(err.contains("already exists"));
    }

    #[test]
    fn test_install_marketplace_skill_bundle_into_root_writes_standard_package() {
        let temp_dir = TempDir::new().unwrap();
        let target_root = temp_dir.path().join("skills");
        let content = "---\nname: Market Skill\ndescription: install me\n---\n";
        let checksum = format!("sha256:{}", hex::encode(Sha256::digest(content.as_bytes())));

        let result = install_marketplace_skill_bundle_into_root(
            &target_root,
            &MarketplaceSkillBundle {
                manifest_version: "agentskills.v1".to_string(),
                name: "market-skill".to_string(),
                aliases: Vec::new(),
                version: "1.0.0".to_string(),
                content_hash: "sha256:bundle".to_string(),
                file_count: 2,
                files: vec![
                    MarketplaceSkillBundleFile {
                        path: "SKILL.md".to_string(),
                        content: content.to_string(),
                        encoding: Some("utf-8".to_string()),
                        sha256: Some(checksum),
                    },
                    MarketplaceSkillBundleFile {
                        path: "references/guide.md".to_string(),
                        content: "# Guide".to_string(),
                        encoding: Some("utf-8".to_string()),
                        sha256: None,
                    },
                ],
            },
        )
        .unwrap();

        assert_eq!(result.directory, "market-skill");
        assert!(target_root.join("market-skill").join("SKILL.md").is_file());
        assert!(target_root
            .join("market-skill")
            .join("references")
            .join("guide.md")
            .is_file());
        assert!(result.inspection.standard_compliance.is_standard);
    }

    #[test]
    fn test_install_marketplace_skill_bundle_into_root_rejects_path_traversal() {
        let temp_dir = TempDir::new().unwrap();
        let target_root = temp_dir.path().join("skills");

        let err = install_marketplace_skill_bundle_into_root(
            &target_root,
            &MarketplaceSkillBundle {
                manifest_version: "agentskills.v1".to_string(),
                name: "market-skill".to_string(),
                aliases: Vec::new(),
                version: "1.0.0".to_string(),
                content_hash: String::new(),
                file_count: 1,
                files: vec![MarketplaceSkillBundleFile {
                    path: "../SKILL.md".to_string(),
                    content: "---\nname: Bad\ndescription: bad\n---\n".to_string(),
                    encoding: Some("utf-8".to_string()),
                    sha256: None,
                }],
            },
        )
        .unwrap_err();

        assert!(err.contains("Invalid marketplace skill file path"));
        assert!(!target_root.join("market-skill").exists());
    }

    #[test]
    fn test_install_marketplace_skill_bundle_into_root_rejects_checksum_mismatch() {
        let temp_dir = TempDir::new().unwrap();
        let target_root = temp_dir.path().join("skills");

        let err = install_marketplace_skill_bundle_into_root(
            &target_root,
            &MarketplaceSkillBundle {
                manifest_version: "agentskills.v1".to_string(),
                name: "market-skill".to_string(),
                aliases: Vec::new(),
                version: "1.0.0".to_string(),
                content_hash: String::new(),
                file_count: 1,
                files: vec![MarketplaceSkillBundleFile {
                    path: "SKILL.md".to_string(),
                    content: "---\nname: Bad\ndescription: bad\n---\n".to_string(),
                    encoding: Some("utf-8".to_string()),
                    sha256: Some("sha256:0000".to_string()),
                }],
            },
        )
        .unwrap_err();

        assert!(err.contains("checksum mismatch"));
        assert!(!target_root.join("market-skill").exists());
    }

    fn build_skill_zip(entries: &[(&str, &str)]) -> Vec<u8> {
        let cursor = Cursor::new(Vec::new());
        let mut writer = zip::ZipWriter::new(cursor);
        let options = FileOptions::default();
        for (path, content) in entries {
            writer.start_file(*path, options).unwrap();
            writer.write_all(content.as_bytes()).unwrap();
        }
        writer.finish().unwrap().into_inner()
    }

    #[test]
    fn test_install_skill_zip_bytes_into_root_strips_matching_root_directory() {
        let temp_dir = TempDir::new().unwrap();
        let target_root = temp_dir.path().join("skills");
        let package = build_skill_zip(&[
            (
                "viral-content-breakdown/SKILL.md",
                "---\nname: Viral Content Breakdown\ndescription: install me\n---\n",
            ),
            ("viral-content-breakdown/references/guide.md", "# Guide"),
        ]);

        let result =
            install_skill_zip_bytes_into_root(&target_root, "viral-content-breakdown", &package)
                .unwrap();

        assert_eq!(result.directory, "viral-content-breakdown");
        assert!(target_root
            .join("viral-content-breakdown")
            .join("SKILL.md")
            .is_file());
        assert!(target_root
            .join("viral-content-breakdown")
            .join("references")
            .join("guide.md")
            .is_file());
        assert!(result.inspection.standard_compliance.is_standard);
    }

    #[test]
    fn test_install_skill_zip_bytes_into_root_accepts_root_skill_md() {
        let temp_dir = TempDir::new().unwrap();
        let target_root = temp_dir.path().join("skills");
        let package = build_skill_zip(&[(
            "SKILL.md",
            "---\nname: Root Skill\ndescription: install me\n---\n",
        )]);

        let result = install_skill_zip_bytes_into_root(&target_root, "root-skill", &package)
            .expect("root SKILL.md zip should install");

        assert_eq!(result.directory, "root-skill");
        assert!(target_root.join("root-skill").join("SKILL.md").is_file());
    }

    #[test]
    fn test_install_skill_zip_bytes_into_root_strips_single_nonmatching_root_directory() {
        let temp_dir = TempDir::new().unwrap();
        let target_root = temp_dir.path().join("skills");
        let package = build_skill_zip(&[
            (
                "skill-export/SKILL.md",
                "---\nname: Exported Skill\ndescription: install me\n---\n",
            ),
            ("skill-export/assets/example.txt", "asset"),
        ]);

        let result = install_skill_zip_bytes_into_root(&target_root, "exported-skill", &package)
            .expect("single-root zip should install into requested directory");

        assert_eq!(result.directory, "exported-skill");
        assert!(target_root
            .join("exported-skill")
            .join("SKILL.md")
            .is_file());
        assert!(target_root
            .join("exported-skill")
            .join("assets")
            .join("example.txt")
            .is_file());
    }

    #[test]
    fn test_install_skill_zip_bytes_into_root_rejects_zip_path_traversal() {
        let temp_dir = TempDir::new().unwrap();
        let target_root = temp_dir.path().join("skills");
        let package = build_skill_zip(&[(
            "../SKILL.md",
            "---\nname: Bad Skill\ndescription: bad\n---\n",
        )]);

        let err = install_skill_zip_bytes_into_root(&target_root, "bad-skill", &package)
            .expect_err("path traversal should fail");

        assert!(err.contains("Invalid skill zip entry path"));
        assert!(!target_root.join("bad-skill").exists());
    }
}
