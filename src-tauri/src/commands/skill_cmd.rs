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
use std::collections::BTreeSet;
use std::fs;
use std::io::{Cursor, Read};
use std::path::{Component, Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;
use tauri::State;
use url::Url;
use zip::write::FileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

pub const SKILL_PACKAGE_OPEN_EVENT: &str = "skill-package://open";
static PENDING_SKILL_PACKAGE_OPEN_PATHS: OnceLock<Mutex<Vec<String>>> = OnceLock::new();

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

fn collect_local_skill_file_entries(
    root: &Path,
    current: &Path,
    directories: &mut BTreeSet<String>,
    files: &mut Vec<LocalSkillPackageFileEntry>,
) -> Result<(), String> {
    let entries = fs::read_dir(current).map_err(|error| {
        format!(
            "Failed to read skill directory {}: {error}",
            current.display()
        )
    })?;

    for entry in entries.flatten() {
        let path = entry.path();
        let file_type = entry
            .file_type()
            .map_err(|error| format!("Failed to inspect skill file {}: {error}", path.display()))?;
        let relative_path = path.strip_prefix(root).map_err(|error| {
            format!(
                "Failed to resolve skill file path {}: {error}",
                path.display()
            )
        })?;
        let display_path = relative_path
            .to_string_lossy()
            .replace(std::path::MAIN_SEPARATOR, "/");

        if file_type.is_dir() {
            directories.insert(display_path);
            collect_local_skill_file_entries(root, &path, directories, files)?;
            continue;
        }

        if !file_type.is_file() {
            continue;
        }

        let content = fs::read(&path)
            .map_err(|error| format!("Failed to read skill file {}: {error}", path.display()))?;
        files.push(LocalSkillPackageFileEntry {
            path: display_path,
            is_directory: false,
            size: content.len() as u64,
            content: String::from_utf8(content).ok(),
        });
    }

    Ok(())
}

fn inspect_local_skill_detail(
    skill_roots: &[PathBuf],
    directory: &str,
) -> Result<LocalSkillPackageInspectionResult, String> {
    let skill_dir = resolve_local_skill_dir(skill_roots, directory)?;
    let inspection = SkillService::inspect_skill_dir(&skill_dir).map_err(|e| e.to_string())?;
    let mut directories = BTreeSet::new();
    let mut files = Vec::new();
    collect_local_skill_file_entries(&skill_dir, &skill_dir, &mut directories, &mut files)?;

    let mut entries: Vec<LocalSkillPackageFileEntry> = directories
        .into_iter()
        .map(|path| LocalSkillPackageFileEntry {
            path,
            is_directory: true,
            size: 0,
            content: None,
        })
        .collect();
    files.sort_by(|a, b| a.path.cmp(&b.path));
    entries.extend(files);

    Ok(LocalSkillPackageInspectionResult {
        directory: directory.to_string(),
        inspection,
        files: entries,
    })
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalSkillPackageFileEntry {
    pub path: String,
    pub is_directory: bool,
    pub size: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct LocalSkillPackageInspectionResult {
    pub directory: String,
    pub inspection: SkillPackageInspection,
    pub files: Vec<LocalSkillPackageFileEntry>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillPackageFileAssociationStatus {
    pub platform: String,
    pub extension: String,
    pub extensions: Vec<String>,
    pub mime_type: String,
    pub app_identifier: String,
    pub is_default: bool,
    pub can_set_default: bool,
    pub requires_user_confirmation: bool,
    pub current_handler: Option<String>,
    pub settings_url: Option<String>,
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillPackageFileAssociationApplyResult {
    pub changed: bool,
    pub message: String,
    pub status: SkillPackageFileAssociationStatus,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillPackageExportResult {
    pub directory: String,
    pub output_path: String,
    pub file_count: usize,
    pub bytes_written: u64,
}

#[derive(Debug, Clone)]
struct SkillZipPackageFile {
    path: PathBuf,
    content: Vec<u8>,
}

#[derive(Debug, Clone)]
struct SkillZipPackage {
    files: Vec<SkillZipPackageFile>,
    shared_zip_root: Option<String>,
    should_strip_directory: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillDownloadInstallRequest {
    pub skill_name: String,
    pub download_url: String,
}

const MAX_SKILL_DOWNLOAD_BYTES: usize = 20 * 1024 * 1024;
const LIME_APP_BUNDLE_ID: &str = "com.limecloud.lime";
const LIME_SKILL_PACKAGE_EXTENSION: &str = "skill";
const LIME_SKILL_PACKAGE_EXPORT_EXTENSION: &str = "skills";
const LIME_SKILL_PACKAGE_EXTENSIONS: &[&str] = &[
    LIME_SKILL_PACKAGE_EXTENSION,
    LIME_SKILL_PACKAGE_EXPORT_EXTENSION,
];
const LIME_SKILL_PACKAGE_MIME_TYPE: &str = "application/vnd.lime.skill+zip";
const LIME_SKILL_PACKAGE_UTI: &str = "com.limecloud.lime.skill";
#[cfg(target_os = "windows")]
const LIME_SKILL_PACKAGE_PROG_ID: &str = "Lime.skill";
#[cfg(target_os = "linux")]
const LIME_LINUX_DESKTOP_FILE_ID: &str = "com.limecloud.lime.desktop";

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

fn pending_skill_package_open_paths() -> &'static Mutex<Vec<String>> {
    PENDING_SKILL_PACKAGE_OPEN_PATHS.get_or_init(|| Mutex::new(Vec::new()))
}

fn skill_package_extensions() -> Vec<String> {
    LIME_SKILL_PACKAGE_EXTENSIONS
        .iter()
        .map(|extension| (*extension).to_string())
        .collect()
}

fn is_lime_skill_package_extension(extension: &str) -> bool {
    LIME_SKILL_PACKAGE_EXTENSIONS
        .iter()
        .any(|supported| extension.eq_ignore_ascii_case(supported))
}

fn normalize_skill_package_open_argument(value: &str) -> Option<String> {
    let trimmed = value.trim().trim_matches('"').trim_matches('\'');
    if trimmed.is_empty() {
        return None;
    }

    let path = if let Ok(url) = Url::parse(trimmed) {
        if url.scheme() != "file" {
            return None;
        }
        url.to_file_path().ok()?
    } else {
        PathBuf::from(trimmed)
    };

    if !path
        .extension()
        .and_then(|value| value.to_str())
        .map(is_lime_skill_package_extension)
        .unwrap_or(false)
    {
        return None;
    }

    Some(path.to_string_lossy().to_string())
}

pub fn collect_skill_package_open_paths<I, S>(values: I) -> Vec<String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let mut paths = Vec::new();
    for value in values {
        let Some(path) = normalize_skill_package_open_argument(value.as_ref()) else {
            continue;
        };
        if !paths.contains(&path) {
            paths.push(path);
        }
    }
    paths
}

pub fn collect_skill_package_open_paths_from_urls(urls: &[Url]) -> Vec<String> {
    collect_skill_package_open_paths(urls.iter().map(Url::as_str))
}

pub fn record_skill_package_open_paths(paths: Vec<String>) {
    if paths.is_empty() {
        return;
    }
    let Ok(mut pending) = pending_skill_package_open_paths().lock() else {
        return;
    };
    for path in paths {
        if !pending.contains(&path) {
            pending.push(path);
        }
    }
}

fn take_pending_skill_package_open_paths() -> Vec<String> {
    let Ok(mut pending) = pending_skill_package_open_paths().lock() else {
        return Vec::new();
    };
    std::mem::take(&mut *pending)
}

fn current_skill_package_file_association_status() -> SkillPackageFileAssociationStatus {
    platform_skill_package_file_association_status()
}

#[cfg(target_os = "macos")]
fn platform_skill_package_file_association_status() -> SkillPackageFileAssociationStatus {
    let handlers = macos_skill_package_default_handlers();
    let current_handler = handlers
        .iter()
        .find(|(_, handler)| handler.as_deref() != Some(LIME_APP_BUNDLE_ID))
        .and_then(|(_, handler)| handler.clone())
        .or_else(|| handlers.iter().find_map(|(_, handler)| handler.clone()));
    let has_types = !handlers.is_empty();
    let is_default = has_types
        && handlers
            .iter()
            .all(|(_, handler)| handler.as_deref() == Some(LIME_APP_BUNDLE_ID));

    SkillPackageFileAssociationStatus {
        platform: "macos".to_string(),
        extension: LIME_SKILL_PACKAGE_EXTENSION.to_string(),
        extensions: skill_package_extensions(),
        mime_type: LIME_SKILL_PACKAGE_MIME_TYPE.to_string(),
        app_identifier: LIME_APP_BUNDLE_ID.to_string(),
        is_default,
        can_set_default: true,
        requires_user_confirmation: false,
        current_handler,
        settings_url: None,
        detail: None,
    }
}

#[cfg(target_os = "windows")]
fn platform_skill_package_file_association_status() -> SkillPackageFileAssociationStatus {
    let current_handler = windows_skill_package_current_handler();
    let is_default = current_handler
        .as_deref()
        .map(|value| value.eq_ignore_ascii_case(LIME_SKILL_PACKAGE_PROG_ID))
        .unwrap_or(false);

    SkillPackageFileAssociationStatus {
        platform: "windows".to_string(),
        extension: LIME_SKILL_PACKAGE_EXTENSION.to_string(),
        extensions: skill_package_extensions(),
        mime_type: LIME_SKILL_PACKAGE_MIME_TYPE.to_string(),
        app_identifier: LIME_SKILL_PACKAGE_PROG_ID.to_string(),
        is_default,
        can_set_default: true,
        requires_user_confirmation: true,
        current_handler,
        settings_url: Some("ms-settings:defaultapps".to_string()),
        detail: Some("Windows 需要用户在系统默认应用设置中确认文件关联。".to_string()),
    }
}

#[cfg(target_os = "linux")]
fn platform_skill_package_file_association_status() -> SkillPackageFileAssociationStatus {
    let current_handler = linux_skill_package_current_handler();
    let is_default = current_handler
        .as_deref()
        .map(|value| value == LIME_LINUX_DESKTOP_FILE_ID)
        .unwrap_or(false);

    SkillPackageFileAssociationStatus {
        platform: "linux".to_string(),
        extension: LIME_SKILL_PACKAGE_EXTENSION.to_string(),
        extensions: skill_package_extensions(),
        mime_type: LIME_SKILL_PACKAGE_MIME_TYPE.to_string(),
        app_identifier: LIME_LINUX_DESKTOP_FILE_ID.to_string(),
        is_default,
        can_set_default: true,
        requires_user_confirmation: false,
        current_handler,
        settings_url: None,
        detail: None,
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
fn platform_skill_package_file_association_status() -> SkillPackageFileAssociationStatus {
    SkillPackageFileAssociationStatus {
        platform: std::env::consts::OS.to_string(),
        extension: LIME_SKILL_PACKAGE_EXTENSION.to_string(),
        extensions: skill_package_extensions(),
        mime_type: LIME_SKILL_PACKAGE_MIME_TYPE.to_string(),
        app_identifier: LIME_APP_BUNDLE_ID.to_string(),
        is_default: false,
        can_set_default: false,
        requires_user_confirmation: true,
        current_handler: None,
        settings_url: None,
        detail: Some("当前平台暂不支持从 Lime 内设置 .skill / .skills 默认打开方式。".to_string()),
    }
}

fn set_skill_package_file_association_default_impl(
) -> Result<SkillPackageFileAssociationApplyResult, String> {
    platform_set_skill_package_file_association_default()
}

#[cfg(target_os = "macos")]
fn platform_set_skill_package_file_association_default(
) -> Result<SkillPackageFileAssociationApplyResult, String> {
    macos_register_current_app_bundle();
    let content_types = macos_skill_package_content_types();
    if content_types.is_empty() {
        return Err("无法解析 .skill / .skills 文件类型".to_string());
    }

    for content_type in content_types {
        macos_set_default_handler_for_content_type(&content_type, LIME_APP_BUNDLE_ID)?;
    }

    Ok(SkillPackageFileAssociationApplyResult {
        changed: true,
        message: "已将 .skill / .skills 默认打开方式设置为 Lime。".to_string(),
        status: current_skill_package_file_association_status(),
    })
}

#[cfg(target_os = "windows")]
fn platform_set_skill_package_file_association_default(
) -> Result<SkillPackageFileAssociationApplyResult, String> {
    windows_register_skill_package_prog_id()?;
    if let Err(error) = open::that("ms-settings:defaultapps") {
        tracing::warn!("[Skill Package] 打开 Windows 默认应用设置失败: {}", error);
    }

    Ok(SkillPackageFileAssociationApplyResult {
        changed: false,
        message: "已注册 Lime 的 .skill / .skills 打开方式，请在 Windows 默认应用设置中选择 Lime。"
            .to_string(),
        status: current_skill_package_file_association_status(),
    })
}

#[cfg(target_os = "linux")]
fn platform_set_skill_package_file_association_default(
) -> Result<SkillPackageFileAssociationApplyResult, String> {
    linux_register_skill_package_mime_type()?;
    linux_set_default_skill_package_handler()?;

    Ok(SkillPackageFileAssociationApplyResult {
        changed: true,
        message: "已将 .skill / .skills 默认打开方式设置为 Lime。".to_string(),
        status: current_skill_package_file_association_status(),
    })
}

#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
fn platform_set_skill_package_file_association_default(
) -> Result<SkillPackageFileAssociationApplyResult, String> {
    let status = current_skill_package_file_association_status();
    Err(status
        .detail
        .clone()
        .unwrap_or_else(|| "当前平台暂不支持设置 .skill / .skills 默认打开方式。".to_string()))
}

#[cfg(target_os = "macos")]
mod macos_file_association {
    use super::{
        LIME_SKILL_PACKAGE_EXTENSIONS, LIME_SKILL_PACKAGE_MIME_TYPE, LIME_SKILL_PACKAGE_UTI,
    };
    use std::ffi::{CStr, CString};
    use std::os::raw::{c_char, c_void};
    use std::path::{Path, PathBuf};
    use std::ptr;

    type CFIndex = isize;
    type CFStringRef = *const c_void;
    type CFURLRef = *const c_void;
    type OSStatus = i32;

    const K_CF_STRING_ENCODING_UTF8: u32 = 0x0800_0100;
    const K_LS_ROLES_ALL: u32 = 0xffff_ffff;

    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        fn CFStringCreateWithCString(
            alloc: *const c_void,
            c_str: *const c_char,
            encoding: u32,
        ) -> CFStringRef;
        fn CFStringGetCString(
            the_string: CFStringRef,
            buffer: *mut c_char,
            buffer_size: CFIndex,
            encoding: u32,
        ) -> u8;
        fn CFStringGetLength(the_string: CFStringRef) -> CFIndex;
        fn CFStringGetMaximumSizeForEncoding(length: CFIndex, encoding: u32) -> CFIndex;
        fn CFURLCreateFromFileSystemRepresentation(
            allocator: *const c_void,
            buffer: *const u8,
            buf_len: CFIndex,
            is_directory: u8,
        ) -> CFURLRef;
        fn CFRelease(cf: *const c_void);
    }

    #[link(name = "CoreServices", kind = "framework")]
    extern "C" {
        fn LSRegisterURL(url: CFURLRef, update: u8) -> OSStatus;
        fn LSSetDefaultRoleHandlerForContentType(
            content_type: CFStringRef,
            role: u32,
            handler_bundle_id: CFStringRef,
        ) -> OSStatus;
        fn LSCopyDefaultRoleHandlerForContentType(
            content_type: CFStringRef,
            role: u32,
        ) -> CFStringRef;
        fn UTTypeCreatePreferredIdentifierForTag(
            tag_class: CFStringRef,
            tag: CFStringRef,
            conforming_to_uti: CFStringRef,
        ) -> CFStringRef;
    }

    pub fn content_types() -> Vec<String> {
        let mut types = vec![LIME_SKILL_PACKAGE_UTI.to_string()];
        for extension in LIME_SKILL_PACKAGE_EXTENSIONS {
            if let Some(extension_uti) =
                preferred_identifier_for_tag("public.filename-extension", extension, None)
            {
                push_unique(&mut types, extension_uti);
            }
        }
        if let Some(mime_uti) = preferred_identifier_for_tag(
            "public.mime-type",
            LIME_SKILL_PACKAGE_MIME_TYPE,
            Some(LIME_SKILL_PACKAGE_UTI),
        ) {
            push_unique(&mut types, mime_uti);
        }
        types
    }

    pub fn default_handler(content_type: &str) -> Option<String> {
        let content_type = create_cf_string(content_type).ok()?;
        let handler = unsafe {
            LSCopyDefaultRoleHandlerForContentType(content_type.as_ptr(), K_LS_ROLES_ALL)
        };
        let result = cf_string_to_string(handler);
        if !handler.is_null() {
            unsafe { CFRelease(handler) };
        }
        result
    }

    pub fn set_default_handler(content_type: &str, bundle_id: &str) -> Result<(), String> {
        let content_type = create_cf_string(content_type)?;
        let bundle_id = create_cf_string(bundle_id)?;
        let status = unsafe {
            LSSetDefaultRoleHandlerForContentType(
                content_type.as_ptr(),
                K_LS_ROLES_ALL,
                bundle_id.as_ptr(),
            )
        };
        if status == 0 {
            Ok(())
        } else {
            Err(format!(
                "设置 .skill / .skills 默认打开方式失败（LaunchServices {status}）"
            ))
        }
    }

    pub fn register_current_app_bundle() {
        let Some(bundle_path) = current_app_bundle_path() else {
            return;
        };
        if let Err(error) = register_app_bundle(&bundle_path) {
            tracing::warn!(
                "[Skill Package] 注册 macOS app bundle 失败 {}: {}",
                bundle_path.display(),
                error
            );
        }
    }

    fn push_unique(values: &mut Vec<String>, value: String) {
        if !values.contains(&value) {
            values.push(value);
        }
    }

    fn preferred_identifier_for_tag(
        tag_class: &str,
        tag: &str,
        conforming_to_uti: Option<&str>,
    ) -> Option<String> {
        let tag_class = create_cf_string(tag_class).ok()?;
        let tag = create_cf_string(tag).ok()?;
        let conforming_to_uti = conforming_to_uti.and_then(|value| create_cf_string(value).ok());
        let result = unsafe {
            UTTypeCreatePreferredIdentifierForTag(
                tag_class.as_ptr(),
                tag.as_ptr(),
                conforming_to_uti
                    .as_ref()
                    .map(|value| value.as_ptr())
                    .unwrap_or(ptr::null()),
            )
        };
        let text = cf_string_to_string(result);
        if !result.is_null() {
            unsafe { CFRelease(result) };
        }
        text
    }

    fn create_cf_string(value: &str) -> Result<ScopedCfString, String> {
        let c_string =
            CString::new(value).map_err(|_| format!("无效的 macOS 文件关联字符串: {value}"))?;
        let ptr = unsafe {
            CFStringCreateWithCString(ptr::null(), c_string.as_ptr(), K_CF_STRING_ENCODING_UTF8)
        };
        if ptr.is_null() {
            Err(format!("无法创建 macOS 文件关联字符串: {value}"))
        } else {
            Ok(ScopedCfString(ptr))
        }
    }

    fn cf_string_to_string(value: CFStringRef) -> Option<String> {
        if value.is_null() {
            return None;
        }
        let length = unsafe { CFStringGetLength(value) };
        let max_size =
            unsafe { CFStringGetMaximumSizeForEncoding(length, K_CF_STRING_ENCODING_UTF8) } + 1;
        if max_size <= 1 {
            return Some(String::new());
        }
        let mut buffer = vec![0 as c_char; max_size as usize];
        let ok = unsafe {
            CFStringGetCString(
                value,
                buffer.as_mut_ptr(),
                max_size,
                K_CF_STRING_ENCODING_UTF8,
            )
        };
        if ok == 0 {
            return None;
        }
        Some(
            unsafe { CStr::from_ptr(buffer.as_ptr()) }
                .to_string_lossy()
                .to_string(),
        )
    }

    fn current_app_bundle_path() -> Option<PathBuf> {
        let executable = std::env::current_exe().ok()?;
        executable
            .ancestors()
            .find(|path| {
                path.extension()
                    .and_then(|value| value.to_str())
                    .is_some_and(|value| value.eq_ignore_ascii_case("app"))
            })
            .map(Path::to_path_buf)
    }

    fn register_app_bundle(bundle_path: &Path) -> Result<(), String> {
        #[cfg(unix)]
        {
            use std::os::unix::ffi::OsStrExt;
            let bytes = bundle_path.as_os_str().as_bytes();
            let url = unsafe {
                CFURLCreateFromFileSystemRepresentation(
                    ptr::null(),
                    bytes.as_ptr(),
                    bytes.len() as CFIndex,
                    1,
                )
            };
            if url.is_null() {
                return Err("无法创建 app bundle URL".to_string());
            }
            let status = unsafe { LSRegisterURL(url, 1) };
            unsafe { CFRelease(url) };
            if status == 0 {
                Ok(())
            } else {
                Err(format!("LaunchServices 注册返回 {status}"))
            }
        }
        #[cfg(not(unix))]
        {
            let _ = bundle_path;
            Ok(())
        }
    }

    struct ScopedCfString(CFStringRef);

    impl ScopedCfString {
        fn as_ptr(&self) -> CFStringRef {
            self.0
        }
    }

    impl Drop for ScopedCfString {
        fn drop(&mut self) {
            if !self.0.is_null() {
                unsafe { CFRelease(self.0) };
            }
        }
    }
}

#[cfg(target_os = "macos")]
fn macos_skill_package_content_types() -> Vec<String> {
    macos_file_association::content_types()
}

#[cfg(target_os = "macos")]
fn macos_skill_package_default_handlers() -> Vec<(String, Option<String>)> {
    macos_skill_package_content_types()
        .into_iter()
        .map(|content_type| {
            let handler = macos_file_association::default_handler(&content_type);
            (content_type, handler)
        })
        .collect()
}

#[cfg(target_os = "macos")]
fn macos_set_default_handler_for_content_type(
    content_type: &str,
    bundle_id: &str,
) -> Result<(), String> {
    macos_file_association::set_default_handler(content_type, bundle_id)
}

#[cfg(target_os = "macos")]
fn macos_register_current_app_bundle() {
    macos_file_association::register_current_app_bundle();
}

#[cfg(target_os = "windows")]
fn windows_skill_package_current_handler_for_extension(extension: &str) -> Option<String> {
    use winreg::{enums::*, RegKey};

    let extension = format!(".{extension}");
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if let Ok(user_choice) = hkcu.open_subkey(format!(
        "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\{extension}\\UserChoice",
    )) {
        if let Ok(value) = user_choice.get_value::<String, _>("ProgId") {
            return Some(value);
        }
    }
    if let Ok(extension_key) = hkcu.open_subkey(format!("Software\\Classes\\{extension}")) {
        if let Ok(value) = extension_key.get_value::<String, _>("") {
            return Some(value);
        }
    }
    None
}

#[cfg(target_os = "windows")]
fn windows_skill_package_current_handler() -> Option<String> {
    let handlers: Vec<String> = LIME_SKILL_PACKAGE_EXTENSIONS
        .iter()
        .filter_map(|extension| windows_skill_package_current_handler_for_extension(extension))
        .collect();

    handlers
        .iter()
        .find(|handler| !handler.eq_ignore_ascii_case(LIME_SKILL_PACKAGE_PROG_ID))
        .cloned()
        .or_else(|| handlers.into_iter().next())
}

#[cfg(target_os = "windows")]
fn windows_register_skill_package_prog_id() -> Result<(), String> {
    use winreg::{enums::*, RegKey};

    let exe = std::env::current_exe()
        .map_err(|error| format!("无法获取 Lime 可执行文件路径: {error}"))?;
    let command = format!("\"{}\" \"%1\"", exe.display());
    let icon = format!("{},0", exe.display());
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    for extension in LIME_SKILL_PACKAGE_EXTENSIONS {
        let (extension_key, _) = hkcu
            .create_subkey(format!("Software\\Classes\\.{extension}"))
            .map_err(|error| format!("无法注册 .{extension} 扩展名: {error}"))?;
        extension_key
            .set_value("", &LIME_SKILL_PACKAGE_PROG_ID)
            .map_err(|error| format!("无法写入 .{extension} 默认 ProgID: {error}"))?;
        extension_key
            .set_value("Content Type", &LIME_SKILL_PACKAGE_MIME_TYPE)
            .map_err(|error| format!("无法写入 .{extension} MIME 类型: {error}"))?;
    }

    let (prog_id_key, _) = hkcu
        .create_subkey(format!("Software\\Classes\\{LIME_SKILL_PACKAGE_PROG_ID}"))
        .map_err(|error| format!("无法注册 Lime Skill ProgID: {error}"))?;
    prog_id_key
        .set_value("", &"Lime Skill Package")
        .map_err(|error| format!("无法写入 Lime Skill ProgID 名称: {error}"))?;

    let (icon_key, _) = hkcu
        .create_subkey(format!(
            "Software\\Classes\\{LIME_SKILL_PACKAGE_PROG_ID}\\DefaultIcon"
        ))
        .map_err(|error| format!("无法注册 .skill / .skills 图标: {error}"))?;
    icon_key
        .set_value("", &icon)
        .map_err(|error| format!("无法写入 .skill / .skills 图标: {error}"))?;

    let (command_key, _) = hkcu
        .create_subkey(format!(
            "Software\\Classes\\{LIME_SKILL_PACKAGE_PROG_ID}\\shell\\open\\command"
        ))
        .map_err(|error| format!("无法注册 .skill / .skills 打开命令: {error}"))?;
    command_key
        .set_value("", &command)
        .map_err(|error| format!("无法写入 .skill / .skills 打开命令: {error}"))?;
    Ok(())
}

#[cfg(target_os = "linux")]
fn linux_skill_package_current_handler() -> Option<String> {
    std::process::Command::new("xdg-mime")
        .arg("query")
        .arg("default")
        .arg(LIME_SKILL_PACKAGE_MIME_TYPE)
        .output()
        .ok()
        .filter(|output| output.status.success())
        .and_then(|output| String::from_utf8(output.stdout).ok())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

#[cfg(target_os = "linux")]
fn linux_register_skill_package_mime_type() -> Result<(), String> {
    let Some(data_dir) = dirs::data_dir() else {
        return Err("无法获取 Linux 用户数据目录".to_string());
    };
    let package_dir = data_dir.join("mime").join("packages");
    fs::create_dir_all(&package_dir).map_err(|error| {
        format!(
            "无法创建 Linux MIME package 目录 {}: {error}",
            package_dir.display()
        )
    })?;
    let xml_path = package_dir.join("com.limecloud.lime.skill.xml");
    fs::write(
        &xml_path,
        format!(
            r#"<?xml version="1.0" encoding="UTF-8"?>
<mime-info xmlns="http://www.freedesktop.org/standards/shared-mime-info">
  <mime-type type="{mime}">
    <comment>Lime Skill Package</comment>
    <glob pattern="*.skill"/>
    <glob pattern="*.skills"/>
  </mime-type>
</mime-info>
"#,
            mime = LIME_SKILL_PACKAGE_MIME_TYPE
        ),
    )
    .map_err(|error| {
        format!(
            "无法写入 Linux MIME package {}: {error}",
            xml_path.display()
        )
    })?;

    let mime_root = data_dir.join("mime");
    let status = std::process::Command::new("update-mime-database")
        .arg(&mime_root)
        .status()
        .map_err(|error| format!("无法运行 update-mime-database: {error}"))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("update-mime-database 退出状态: {status}"))
    }
}

#[cfg(target_os = "linux")]
fn linux_set_default_skill_package_handler() -> Result<(), String> {
    let status = std::process::Command::new("xdg-mime")
        .arg("default")
        .arg(LIME_LINUX_DESKTOP_FILE_ID)
        .arg(LIME_SKILL_PACKAGE_MIME_TYPE)
        .status()
        .map_err(|error| format!("无法运行 xdg-mime: {error}"))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("xdg-mime 退出状态: {status}"))
    }
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

fn read_skill_zip_package(bytes: &[u8]) -> Result<SkillZipPackage, String> {
    if bytes.is_empty() {
        return Err("Skill package is empty".to_string());
    }

    let cursor = Cursor::new(bytes);
    let mut archive =
        ZipArchive::new(cursor).map_err(|error| format!("Invalid skill zip package: {error}"))?;
    let mut files: Vec<SkillZipPackageFile> = Vec::new();
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
        files.push(SkillZipPackageFile {
            path: normalized,
            content,
        });
    }

    if files.is_empty() {
        return Err("Skill package contains no files".to_string());
    }

    let root_skill_md = Path::new("SKILL.md");
    let has_root_skill_md = files.iter().any(|file| file.path == root_skill_md);
    let shared_zip_root = files
        .first()
        .and_then(|file| first_zip_component(&file.path));
    let should_strip_directory = shared_zip_root
        .as_deref()
        .map(|root| {
            let nested_skill_md = Path::new(root).join("SKILL.md");
            !has_root_skill_md
                && files.iter().any(|file| file.path == nested_skill_md)
                && files
                    .iter()
                    .all(|file| first_zip_component(&file.path).as_deref() == Some(root))
        })
        .unwrap_or(false);

    Ok(SkillZipPackage {
        files,
        shared_zip_root,
        should_strip_directory,
    })
}

fn normalize_skill_zip_relative_path(
    path: &Path,
    should_strip_directory: bool,
) -> Result<PathBuf, String> {
    let relative_path = if should_strip_directory {
        strip_first_zip_component(path)?
    } else {
        path.to_path_buf()
    };
    let relative_path_text = relative_path
        .to_str()
        .ok_or_else(|| "Skill zip entry path must be valid UTF-8".to_string())?;
    validate_marketplace_file_path(relative_path_text)
}

fn skill_zip_path_to_display_path(path: &Path) -> Result<String, String> {
    let mut parts = Vec::new();
    for component in path.components() {
        match component {
            Component::Normal(value) => {
                let text = value
                    .to_str()
                    .ok_or_else(|| "Skill zip entry path must be valid UTF-8".to_string())?;
                parts.push(text.to_string());
            }
            _ => return Err(format!("Invalid skill zip entry path: {}", path.display())),
        }
    }
    if parts.is_empty() {
        return Err("Skill zip entry path is required".to_string());
    }
    Ok(parts.join("/"))
}

fn build_local_skill_package_file_entries(
    package: &SkillZipPackage,
) -> Result<Vec<LocalSkillPackageFileEntry>, String> {
    let mut directories = BTreeSet::new();
    let mut files = Vec::new();

    for file in &package.files {
        let relative_path =
            normalize_skill_zip_relative_path(&file.path, package.should_strip_directory)?;
        let display_path = skill_zip_path_to_display_path(&relative_path)?;

        let mut current = PathBuf::new();
        let mut components = relative_path.components().peekable();
        while let Some(component) = components.next() {
            if components.peek().is_none() {
                break;
            }
            match component {
                Component::Normal(value) => {
                    current.push(value);
                    directories.insert(skill_zip_path_to_display_path(&current)?);
                }
                _ => {
                    return Err(format!(
                        "Invalid skill zip entry path: {}",
                        relative_path.display()
                    ))
                }
            }
        }

        files.push(LocalSkillPackageFileEntry {
            path: display_path,
            is_directory: false,
            size: file.content.len() as u64,
            content: String::from_utf8(file.content.clone()).ok(),
        });
    }

    let mut entries: Vec<LocalSkillPackageFileEntry> = directories
        .into_iter()
        .map(|path| LocalSkillPackageFileEntry {
            path,
            is_directory: true,
            size: 0,
            content: None,
        })
        .collect();
    files.sort_by(|a, b| a.path.cmp(&b.path));
    entries.extend(files);
    Ok(entries)
}

fn write_skill_zip_package_files(
    target_dir: &Path,
    package: &SkillZipPackage,
) -> Result<(), String> {
    let root_skill_md = Path::new("SKILL.md");
    let mut has_skill_md = false;

    for file in &package.files {
        let relative_path =
            normalize_skill_zip_relative_path(&file.path, package.should_strip_directory)?;
        if relative_path == root_skill_md {
            has_skill_md = true;
        }
        let destination = target_dir.join(relative_path);
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                format!(
                    "Failed to create skill file parent {}: {error}",
                    parent.display()
                )
            })?;
        }
        fs::write(&destination, &file.content).map_err(|error| {
            format!(
                "Failed to write skill package file {}: {error}",
                destination.display()
            )
        })?;
    }

    if !has_skill_md {
        return Err("Skill package missing SKILL.md".to_string());
    }

    Ok(())
}

fn resolve_skill_package_directory_name(
    package: &SkillZipPackage,
    fallback_name: &str,
) -> Result<String, String> {
    let directory = if package.should_strip_directory {
        package.shared_zip_root.as_deref().unwrap_or(fallback_name)
    } else {
        fallback_name
    }
    .trim();

    validate_skill_directory(directory)?;
    Ok(directory.to_string())
}

fn resolve_local_skill_package_fallback_name(source_path: &Path) -> Result<String, String> {
    let fallback = source_path
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "Failed to resolve skill package file name".to_string())?
        .trim();
    validate_skill_directory(fallback)?;
    Ok(fallback.to_string())
}

fn read_local_skill_package_file(source_path: &Path) -> Result<(PathBuf, Vec<u8>), String> {
    let canonical_source = source_path.canonicalize().map_err(|e| {
        format!(
            "Failed to resolve skill package source {}: {e}",
            source_path.display()
        )
    })?;

    if !canonical_source.is_file() {
        return Err("Skill package source path must be a file".to_string());
    }

    let metadata = fs::metadata(&canonical_source).map_err(|e| {
        format!(
            "Failed to read skill package metadata {}: {e}",
            canonical_source.display()
        )
    })?;
    if metadata.len() > MAX_SKILL_DOWNLOAD_BYTES as u64 {
        return Err("Skill package is too large".to_string());
    }

    let bytes = fs::read(&canonical_source).map_err(|e| {
        format!(
            "Failed to read skill package {}: {e}",
            canonical_source.display()
        )
    })?;
    if bytes.len() > MAX_SKILL_DOWNLOAD_BYTES {
        return Err("Skill package is too large".to_string());
    }

    Ok((canonical_source, bytes))
}

fn inspect_skill_zip_package(
    fallback_name: &str,
    bytes: &[u8],
) -> Result<LocalSkillPackageInspectionResult, String> {
    let package = read_skill_zip_package(bytes)?;
    let directory = resolve_skill_package_directory_name(&package, fallback_name)?;
    let files = build_local_skill_package_file_entries(&package)?;
    let temp_dir = tempfile::TempDir::new()
        .map_err(|error| format!("Failed to create skill package preview: {error}"))?;
    let target_dir = temp_dir.path().join(&directory);
    fs::create_dir_all(&target_dir).map_err(|error| {
        format!(
            "Failed to create skill package preview directory {}: {error}",
            target_dir.display()
        )
    })?;
    write_skill_zip_package_files(&target_dir, &package)?;
    let inspection = SkillService::inspect_skill_dir(&target_dir)
        .map_err(|error| format!("Skill package failed inspection: {error}"))?;

    Ok(LocalSkillPackageInspectionResult {
        directory,
        inspection,
        files,
    })
}

fn install_skill_zip_package_into_root(
    skills_root: &Path,
    skill_name: &str,
    package: SkillZipPackage,
) -> Result<MarketplaceSkillInstallResult, String> {
    let directory = skill_name.trim();
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
    fs::create_dir_all(&target_dir).map_err(|e| {
        format!(
            "Failed to create skill directory {}: {e}",
            target_dir.display()
        )
    })?;

    if let Err(error) = write_skill_zip_package_files(&target_dir, &package) {
        let _ = fs::remove_dir_all(&target_dir);
        return Err(error);
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

fn install_skill_zip_package_into_existing_dir(
    target_dir: &Path,
    directory: &str,
    package: SkillZipPackage,
) -> Result<MarketplaceSkillInstallResult, String> {
    validate_skill_directory(directory)?;

    fs::create_dir_all(target_dir).map_err(|error| {
        format!(
            "Failed to create replacement skill directory {}: {error}",
            target_dir.display()
        )
    })?;

    if let Err(error) = write_skill_zip_package_files(target_dir, &package) {
        let _ = fs::remove_dir_all(target_dir);
        return Err(error);
    }

    match SkillService::inspect_skill_dir(target_dir) {
        Ok(inspection) if inspection.standard_compliance.validation_errors.is_empty() => {
            Ok(MarketplaceSkillInstallResult {
                directory: directory.to_string(),
                inspection,
            })
        }
        Ok(inspection) => {
            let _ = fs::remove_dir_all(target_dir);
            Err(format!(
                "Replacement skill is not Agent Skills compliant: {}",
                inspection.standard_compliance.validation_errors.join("; ")
            ))
        }
        Err(error) => {
            let _ = fs::remove_dir_all(target_dir);
            Err(format!("Replacement skill failed inspection: {error}"))
        }
    }
}

fn install_skill_zip_bytes_into_root(
    skills_root: &Path,
    skill_name: &str,
    bytes: &[u8],
) -> Result<MarketplaceSkillInstallResult, String> {
    let package = read_skill_zip_package(bytes)?;
    install_skill_zip_package_into_root(skills_root, skill_name, package)
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

#[derive(Debug, Clone)]
struct SkillPackageExportFile {
    source_path: PathBuf,
    archive_path: String,
}

fn normalize_skill_package_output_path(target_path: &str) -> Result<PathBuf, String> {
    let target_path = target_path.trim();
    if target_path.is_empty() {
        return Err("Skill package export path is required".to_string());
    }

    let path = PathBuf::from(target_path);
    let Some(extension) = path.extension().and_then(|value| value.to_str()) else {
        return Err("Skill package export path must end with .skill or .skills".to_string());
    };
    if !is_lime_skill_package_extension(extension) {
        return Err("Skill package export path must end with .skill or .skills".to_string());
    }

    Ok(path)
}

fn path_to_skill_package_zip_path(path: &Path) -> Result<String, String> {
    let mut parts = Vec::new();
    for component in path.components() {
        match component {
            Component::Normal(value) => {
                let text = value
                    .to_str()
                    .ok_or_else(|| "Skill package path must be valid UTF-8".to_string())?;
                parts.push(text.to_string());
            }
            _ => return Err(format!("Invalid skill package path: {}", path.display())),
        }
    }
    if parts.is_empty() {
        return Err("Skill package path is required".to_string());
    }
    Ok(parts.join("/"))
}

fn is_ignorable_skill_package_export_entry(path: &Path) -> bool {
    path.file_name()
        .map(|value| value.to_string_lossy() == ".DS_Store")
        .unwrap_or(false)
}

fn collect_skill_package_export_files(
    root_dir: &Path,
    current_dir: &Path,
    directory: &str,
    files: &mut Vec<SkillPackageExportFile>,
    total_size: &mut u64,
) -> Result<(), String> {
    let mut entries = fs::read_dir(current_dir)
        .map_err(|error| {
            format!(
                "Failed to read skill directory {}: {error}",
                current_dir.display()
            )
        })?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Failed to read skill directory entry: {error}"))?;
    entries.sort_by_key(|entry| entry.file_name());

    for entry in entries {
        let path = entry.path();
        if is_ignorable_skill_package_export_entry(&path) {
            continue;
        }

        let metadata = fs::symlink_metadata(&path)
            .map_err(|error| format!("Failed to read skill file {}: {error}", path.display()))?;
        if metadata.file_type().is_symlink() {
            return Err(format!(
                "Skill package export does not support symlinks: {}",
                path.display()
            ));
        }
        if metadata.is_dir() {
            collect_skill_package_export_files(root_dir, &path, directory, files, total_size)?;
            continue;
        }
        if !metadata.is_file() {
            return Err(format!(
                "Unsupported skill package export entry: {}",
                path.display()
            ));
        }

        let next_total = total_size
            .checked_add(metadata.len())
            .ok_or_else(|| "Skill package is too large".to_string())?;
        if next_total > MAX_SKILL_DOWNLOAD_BYTES as u64 {
            return Err("Skill package is too large".to_string());
        }
        *total_size = next_total;

        let relative_path = path.strip_prefix(root_dir).map_err(|error| {
            format!(
                "Failed to resolve skill package relative path {}: {error}",
                path.display()
            )
        })?;
        let archive_path =
            path_to_skill_package_zip_path(&Path::new(directory).join(relative_path))?;
        files.push(SkillPackageExportFile {
            source_path: path,
            archive_path,
        });
    }

    Ok(())
}

fn ensure_skill_package_export_target_allowed(
    skill_dir: &Path,
    target_path: &Path,
) -> Result<(), String> {
    let Some(parent) = target_path.parent() else {
        return Ok(());
    };
    if parent.as_os_str().is_empty() {
        return Ok(());
    }

    fs::create_dir_all(parent).map_err(|error| {
        format!(
            "Failed to create skill package export directory {}: {error}",
            parent.display()
        )
    })?;

    let canonical_parent = parent.canonicalize().map_err(|error| {
        format!(
            "Failed to resolve skill package export directory {}: {error}",
            parent.display()
        )
    })?;
    if canonical_parent.starts_with(skill_dir) {
        return Err("Skill package export path cannot be inside the Skill directory".to_string());
    }
    Ok(())
}

fn export_local_skill_package_to_path(
    skill_roots: &[PathBuf],
    directory: &str,
    target_path: &Path,
) -> Result<SkillPackageExportResult, String> {
    validate_skill_directory(directory)?;
    let skill_dir = resolve_local_skill_dir(skill_roots, directory)?;
    let inspection = SkillService::inspect_skill_dir(&skill_dir)
        .map_err(|error| format!("Skill failed inspection before export: {error}"))?;
    if !inspection.standard_compliance.validation_errors.is_empty() {
        return Err(format!(
            "Skill is not Agent Skills compliant: {}",
            inspection.standard_compliance.validation_errors.join("; ")
        ));
    }

    ensure_skill_package_export_target_allowed(&skill_dir, target_path)?;

    let mut files = Vec::new();
    let mut total_size = 0;
    collect_skill_package_export_files(
        &skill_dir,
        &skill_dir,
        directory,
        &mut files,
        &mut total_size,
    )?;
    if files.is_empty() {
        return Err("Skill package export contains no files".to_string());
    }

    let export_file = fs::File::create(target_path).map_err(|error| {
        format!(
            "Failed to create skill package export {}: {error}",
            target_path.display()
        )
    })?;
    let mut writer = ZipWriter::new(export_file);
    let file_options = FileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .unix_permissions(0o644);

    for file in &files {
        writer
            .start_file(&file.archive_path, file_options)
            .map_err(|error| {
                format!(
                    "Failed to write skill package entry {}: {error}",
                    file.archive_path
                )
            })?;
        let mut source_file = fs::File::open(&file.source_path).map_err(|error| {
            format!(
                "Failed to open skill package file {}: {error}",
                file.source_path.display()
            )
        })?;
        std::io::copy(&mut source_file, &mut writer).map_err(|error| {
            format!(
                "Failed to compress skill package file {}: {error}",
                file.source_path.display()
            )
        })?;
    }

    writer.finish().map_err(|error| {
        let _ = fs::remove_file(target_path);
        format!(
            "Failed to finish skill package export {}: {error}",
            target_path.display()
        )
    })?;
    let bytes_written = fs::metadata(target_path)
        .map(|metadata| metadata.len())
        .unwrap_or(total_size);

    Ok(SkillPackageExportResult {
        directory: directory.to_string(),
        output_path: target_path.to_string_lossy().to_string(),
        file_count: files.len(),
        bytes_written,
    })
}

fn resolve_user_local_skill_dir(app_type: &AppType, directory: &str) -> Result<PathBuf, String> {
    validate_skill_directory(directory)?;
    let skills_root = get_skills_dir(app_type)?;
    resolve_local_skill_dir(&[skills_root], directory)
}

fn validate_skill_rename_directory(old_directory: &str, new_directory: &str) -> Result<(), String> {
    validate_skill_directory(old_directory)?;
    validate_skill_directory(new_directory)?;
    if old_directory == new_directory {
        return Err("New skill directory must be different".to_string());
    }
    Ok(())
}

fn rename_user_local_skill_dir(
    app_type: &AppType,
    directory: &str,
    new_directory: &str,
) -> Result<String, String> {
    validate_skill_rename_directory(directory, new_directory)?;
    let skills_root = get_skills_dir(app_type)?;
    let source_dir = resolve_local_skill_dir(&[skills_root.clone()], directory)?;
    let target_dir = skills_root.join(new_directory);

    if target_dir.exists() {
        return Err(format!("Skill directory already exists: {new_directory}"));
    }

    fs::rename(&source_dir, &target_dir).map_err(|error| {
        format!(
            "Failed to rename skill directory {} -> {}: {error}",
            source_dir.display(),
            target_dir.display()
        )
    })?;

    Ok(new_directory.to_string())
}

fn replace_user_local_skill_package(
    app_type: &AppType,
    directory: &str,
    source_path: &str,
) -> Result<MarketplaceSkillInstallResult, String> {
    validate_skill_directory(directory)?;
    let skills_root = get_skills_dir(app_type)?;
    let existing_dir = resolve_local_skill_dir(&[skills_root.clone()], directory)?;
    let (_canonical_source, bytes) = read_local_skill_package_file(Path::new(source_path))?;
    let package = read_skill_zip_package(&bytes)?;

    let staging_parent = tempfile::TempDir::new_in(&skills_root)
        .map_err(|error| format!("Failed to create replacement staging directory: {error}"))?;
    let staged_dir = staging_parent.path().join(directory);
    let staged_result =
        install_skill_zip_package_into_existing_dir(&staged_dir, directory, package)?;

    let backup_dir = skills_root.join(format!(
        ".{directory}.replace-backup-{}",
        Utc::now().timestamp_millis()
    ));
    fs::rename(&existing_dir, &backup_dir).map_err(|error| {
        format!(
            "Failed to backup existing skill directory {}: {error}",
            existing_dir.display()
        )
    })?;

    if let Err(error) = fs::rename(&staged_dir, &existing_dir) {
        let _ = fs::remove_dir_all(&existing_dir);
        let _ = fs::rename(&backup_dir, &existing_dir);
        return Err(format!(
            "Failed to replace skill directory {}: {error}",
            existing_dir.display()
        ));
    }

    if let Err(error) = fs::remove_dir_all(&backup_dir) {
        tracing::warn!(
            "[Skill Package] 清理替换备份目录失败 {}: {}",
            backup_dir.display(),
            error
        );
    }

    Ok(staged_result)
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

#[tauri::command]
pub fn inspect_local_skill_detail_for_app(
    app: String,
    directory: String,
) -> Result<LocalSkillPackageInspectionResult, String> {
    let app_type: AppType = app.parse().map_err(|e: String| e)?;
    let skill_roots = get_skill_lookup_roots(&app_type)?;
    inspect_local_skill_detail(&skill_roots, &directory)
}

/// 在系统文件管理器中显示用户级本地 Skill 目录。
#[tauri::command]
pub fn reveal_local_skill_for_app(app: String, directory: String) -> Result<bool, String> {
    let app_type: AppType = app.parse().map_err(|e: String| e)?;
    let skill_dir = resolve_user_local_skill_dir(&app_type, &directory)?;
    open::that(&skill_dir).map_err(|error| {
        format!(
            "Failed to reveal skill directory {}: {error}",
            skill_dir.display()
        )
    })?;
    Ok(true)
}

/// 重命名用户级本地 Skill 目录。
#[tauri::command]
pub fn rename_local_skill_for_app(
    app: String,
    directory: String,
    new_directory: String,
) -> Result<ImportedSkillResult, String> {
    let app_type: AppType = app.parse().map_err(|e: String| e)?;
    let renamed_directory = rename_user_local_skill_dir(&app_type, &directory, &new_directory)?;

    if matches!(app_type, AppType::Lime) {
        AsterAgentState::reload_lime_skills();
    }

    Ok(ImportedSkillResult {
        directory: renamed_directory,
    })
}

/// 用本地 `.skill`/`.skills` 包替换用户级本地 Skill。
#[tauri::command]
pub fn replace_local_skill_package_for_app(
    app: String,
    directory: String,
    source_path: String,
) -> Result<MarketplaceSkillInstallResult, String> {
    let app_type: AppType = app.parse().map_err(|e: String| e)?;
    let result = replace_user_local_skill_package(&app_type, &directory, &source_path)?;

    if matches!(app_type, AppType::Lime) {
        AsterAgentState::reload_lime_skills();
    }

    Ok(result)
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

/// 预检本地 `.skill` 安装包。
///
/// 安装包按 ZIP 读取，允许包内有单个根目录；预检会返回安装目录名、
/// `SKILL.md` 标准检查结果和包内文件清单，供 GUI 在安装前展示。
#[tauri::command]
pub fn inspect_local_skill_package_for_app(
    app: String,
    source_path: String,
) -> Result<LocalSkillPackageInspectionResult, String> {
    let _app_type: AppType = app.parse().map_err(|e: String| e)?;
    let (canonical_source, bytes) = read_local_skill_package_file(Path::new(&source_path))?;
    let fallback_name = resolve_local_skill_package_fallback_name(&canonical_source)?;
    inspect_skill_zip_package(&fallback_name, &bytes)
}

/// 从本地 `.skill` 安装包安装 Skill。
///
/// 如果未显式提供 `skill_name`，优先使用 ZIP 单根目录名；否则使用文件名。
#[tauri::command]
pub fn install_local_skill_package_for_app(
    app: String,
    source_path: String,
    skill_name: Option<String>,
) -> Result<MarketplaceSkillInstallResult, String> {
    let app_type: AppType = app.parse().map_err(|e: String| e)?;
    let (canonical_source, bytes) = read_local_skill_package_file(Path::new(&source_path))?;
    let fallback_name = resolve_local_skill_package_fallback_name(&canonical_source)?;
    let package = read_skill_zip_package(&bytes)?;
    let directory = match skill_name
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        Some(value) => {
            validate_skill_directory(value)?;
            value.to_string()
        }
        None => resolve_skill_package_directory_name(&package, &fallback_name)?,
    };
    let skills_root = get_skills_dir(&app_type)?;
    let result = install_skill_zip_package_into_root(&skills_root, &directory, package)?;

    if matches!(app_type, AppType::Lime) {
        AsterAgentState::reload_lime_skills();
    }

    Ok(result)
}

/// 将已安装 Skill 导出为可双击安装的 `.skills`/`.skill` ZIP 包。
#[tauri::command]
pub fn export_local_skill_package_for_app(
    app: String,
    directory: String,
    target_path: String,
) -> Result<SkillPackageExportResult, String> {
    let app_type: AppType = app.parse().map_err(|e: String| e)?;
    let skill_roots = get_skill_lookup_roots(&app_type)?;
    let target_path = normalize_skill_package_output_path(&target_path)?;
    export_local_skill_package_to_path(&skill_roots, &directory, &target_path)
}

/// 取出系统文件关联或单实例转发过来的 `.skill` 打开请求。
///
/// 前端启动后调用一次，用于避免早于事件监听注册的打开请求丢失。
#[tauri::command]
pub fn take_pending_skill_package_open_requests() -> Result<Vec<String>, String> {
    Ok(take_pending_skill_package_open_paths())
}

/// 查询 `.skill` 当前默认打开方式。
#[tauri::command]
pub fn get_skill_package_file_association_status(
) -> Result<SkillPackageFileAssociationStatus, String> {
    Ok(current_skill_package_file_association_status())
}

/// 尝试将 `.skill` 默认打开方式设置为 Lime。
#[tauri::command]
pub fn set_skill_package_file_association_default(
) -> Result<SkillPackageFileAssociationApplyResult, String> {
    set_skill_package_file_association_default_impl()
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
    use std::ffi::OsString;
    use std::io::Write;
    use std::sync::{Mutex, MutexGuard, OnceLock};
    use tempfile::TempDir;
    use zip::write::FileOptions;

    static TEST_ENV_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

    struct EnvVarGuard {
        key: &'static str,
        original: Option<OsString>,
    }

    impl Drop for EnvVarGuard {
        fn drop(&mut self) {
            match &self.original {
                Some(value) => std::env::set_var(self.key, value),
                None => std::env::remove_var(self.key),
            }
        }
    }

    fn set_test_env_var(key: &'static str, value: &Path) -> EnvVarGuard {
        let original = std::env::var_os(key);
        std::env::set_var(key, value);
        EnvVarGuard { key, original }
    }

    fn lock_test_env() -> MutexGuard<'static, ()> {
        TEST_ENV_LOCK
            .get_or_init(|| Mutex::new(()))
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    #[test]
    fn test_collect_skill_package_open_paths_accepts_file_urls_and_paths() {
        let temp_dir = TempDir::new().unwrap();
        let skill_path = temp_dir.path().join("article-typesetting-master.skill");
        let skills_path = temp_dir.path().join("article-typesetting-addon.skills");
        let skill_path_string = skill_path.to_string_lossy().to_string();
        let skills_path_string = skills_path.to_string_lossy().to_string();
        let skill_file_url = Url::from_file_path(&skill_path)
            .expect("temp skill path should convert to file URL")
            .to_string();
        let skills_file_url = Url::from_file_path(&skills_path)
            .expect("temp skills path should convert to file URL")
            .to_string();
        let readme_path_string = temp_dir
            .path()
            .join("readme.md")
            .to_string_lossy()
            .to_string();
        let paths = collect_skill_package_open_paths([
            "lime",
            skill_path_string.as_str(),
            skills_path_string.as_str(),
            skill_file_url.as_str(),
            skills_file_url.as_str(),
            readme_path_string.as_str(),
            "https://example.com/example.skill",
        ]);

        assert_eq!(paths, vec![skill_path_string, skills_path_string]);
    }

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
    fn test_inspect_local_skill_detail_returns_file_entries() {
        let temp_dir = TempDir::new().unwrap();
        let skills_dir = temp_dir.path().join("skills");
        let skill_dir = skills_dir.join("demo-skill");
        let references_dir = skill_dir.join("references");
        std::fs::create_dir_all(&references_dir).unwrap();
        std::fs::write(
            skill_dir.join("SKILL.md"),
            "---\nname: Demo Skill\n---\n# Demo Skill",
        )
        .unwrap();
        std::fs::write(references_dir.join("guide.md"), "# Guide").unwrap();

        let detail = inspect_local_skill_detail(&[skills_dir.clone()], "demo-skill").unwrap();

        assert_eq!(detail.directory, "demo-skill");
        assert!(detail.inspection.content.contains("# Demo Skill"));
        assert!(detail.files.iter().any(|entry| {
            entry.path == "references" && entry.is_directory && entry.content.is_none()
        }));
        assert!(detail.files.iter().any(|entry| {
            entry.path == "references/guide.md"
                && !entry.is_directory
                && entry.content.as_deref() == Some("# Guide")
        }));
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

    #[test]
    fn test_export_local_skill_package_to_path_writes_skill_zip() {
        let temp_dir = TempDir::new().unwrap();
        let skill_root = temp_dir.path().join("skills");
        let source_dir = skill_root.join("writer");
        std::fs::create_dir_all(source_dir.join("references")).unwrap();
        std::fs::write(
            source_dir.join("SKILL.md"),
            "---\nname: Writer\ndescription: export me\n---\n\n# Writer\n",
        )
        .unwrap();
        std::fs::write(source_dir.join("references").join("guide.md"), "# Guide").unwrap();

        let export_path = temp_dir.path().join("exports").join("writer.skills");
        let result =
            export_local_skill_package_to_path(&[skill_root], "writer", &export_path).unwrap();

        assert_eq!(result.directory, "writer");
        assert_eq!(result.output_path, export_path.to_string_lossy());
        assert_eq!(result.file_count, 2);
        assert!(result.bytes_written > 0);
        assert!(export_path.is_file());

        let export_file = fs::File::open(&export_path).unwrap();
        let mut archive = ZipArchive::new(export_file).unwrap();
        let mut names = Vec::new();
        for index in 0..archive.len() {
            names.push(archive.by_index(index).unwrap().name().to_string());
        }
        assert_eq!(names, vec!["writer/SKILL.md", "writer/references/guide.md"]);

        let mut skill_md = String::new();
        archive
            .by_name("writer/SKILL.md")
            .unwrap()
            .read_to_string(&mut skill_md)
            .unwrap();
        assert!(skill_md.contains("name: Writer"));
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

    #[tokio::test]
    #[ignore = "downloads the live limeai.run skill package and verifies local install output"]
    async fn test_install_live_lime_skill_zip_from_website_prompt() {
        const SKILL_NAME: &str = "viral-content-breakdown";
        const DOWNLOAD_URL: &str =
            "https://limeai.run/skill-packages/viral-content-breakdown/latest/viral-content-breakdown.zip";

        let _env_lock = lock_test_env();
        let temp_dir = TempDir::new().unwrap();
        // Isolate app paths so the command path never writes to the developer's real Lime data dir.
        let _home = set_test_env_var("HOME", &temp_dir.path().join("home"));
        let _userprofile = set_test_env_var("USERPROFILE", &temp_dir.path().join("home"));
        let _xdg_data = set_test_env_var("XDG_DATA_HOME", &temp_dir.path().join("xdg-data"));
        let _appdata = set_test_env_var("APPDATA", &temp_dir.path().join("appdata"));
        let _local_appdata =
            set_test_env_var("LOCALAPPDATA", &temp_dir.path().join("local-appdata"));

        let result = install_skill_from_download_url_for_app(
            "lime".to_string(),
            SkillDownloadInstallRequest {
                skill_name: SKILL_NAME.to_string(),
                download_url: DOWNLOAD_URL.to_string(),
            },
        )
        .await
        .expect("live website prompt package should install through the Lime command path");

        let target_root = app_paths::resolve_skills_dir().expect("temp skills dir should resolve");
        assert!(target_root.starts_with(temp_dir.path()));

        let installed_dir = target_root.join(SKILL_NAME);
        let discovered = scan_installed_skills(&target_root);
        println!("installed_dir={}", installed_dir.display());
        println!("discovered_skills={discovered:?}");
        assert_eq!(result.directory, SKILL_NAME);
        assert!(installed_dir.join("SKILL.md").is_file());
        assert!(!installed_dir.join(SKILL_NAME).join("SKILL.md").exists());
        assert!(result.inspection.standard_compliance.is_standard);
        assert!(result
            .inspection
            .standard_compliance
            .validation_errors
            .is_empty());
        assert!(discovered.contains(&SKILL_NAME.to_string()));
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
    fn test_inspect_skill_zip_package_returns_stripped_file_tree() {
        let package = build_skill_zip(&[
            (
                "article-typesetting-master/SKILL.md",
                "---\nname: Article Typesetting\ndescription: typeset article\n---\n\n# Article Typesetting",
            ),
            (
                "article-typesetting-master/references/guide.md",
                "# Guide",
            ),
            (
                "article-typesetting-master/templates/default.md",
                "# Template",
            ),
        ]);

        let result = inspect_skill_zip_package("article-typesetting-master", &package).unwrap();

        assert_eq!(result.directory, "article-typesetting-master");
        assert!(result.inspection.content.contains("# Article Typesetting"));
        assert!(result.inspection.standard_compliance.is_standard);
        assert_eq!(
            result
                .files
                .iter()
                .map(|entry| (entry.path.as_str(), entry.is_directory))
                .collect::<Vec<_>>(),
            vec![
                ("references", true),
                ("templates", true),
                ("SKILL.md", false),
                ("references/guide.md", false),
                ("templates/default.md", false),
            ]
        );
    }

    #[test]
    fn test_install_local_skill_package_for_app_installs_skill_file() {
        let _env_lock = lock_test_env();
        let temp_dir = TempDir::new().unwrap();
        let _home = set_test_env_var("HOME", &temp_dir.path().join("home"));
        let _userprofile = set_test_env_var("USERPROFILE", &temp_dir.path().join("home"));
        let _xdg_data = set_test_env_var("XDG_DATA_HOME", &temp_dir.path().join("xdg-data"));
        let _appdata = set_test_env_var("APPDATA", &temp_dir.path().join("appdata"));
        let _local_appdata =
            set_test_env_var("LOCALAPPDATA", &temp_dir.path().join("local-appdata"));
        let package = build_skill_zip(&[
            (
                "article-typesetting-master/SKILL.md",
                "---\nname: Article Typesetting\ndescription: typeset article\n---\n",
            ),
            ("article-typesetting-master/references/guide.md", "# Guide"),
        ]);
        let source_path = temp_dir
            .path()
            .join("packages")
            .join("article-typesetting-master.skill");
        std::fs::create_dir_all(source_path.parent().unwrap()).unwrap();
        std::fs::write(&source_path, package).unwrap();

        let result = install_local_skill_package_for_app(
            "lime".to_string(),
            source_path.to_string_lossy().to_string(),
            None,
        )
        .expect("local .skill package should install");

        let target_root = app_paths::resolve_skills_dir().expect("temp skills dir should resolve");
        assert_eq!(
            target_root,
            temp_dir.path().join("home").join(".lime").join("skills")
        );
        assert_eq!(result.directory, "article-typesetting-master");
        assert!(target_root
            .join("article-typesetting-master")
            .join("SKILL.md")
            .is_file());
        assert!(target_root
            .join("article-typesetting-master")
            .join("references")
            .join("guide.md")
            .is_file());
    }

    #[test]
    fn test_rename_user_local_skill_dir_moves_skill_directory() {
        let _env_lock = lock_test_env();
        let temp_dir = TempDir::new().unwrap();
        let _home = set_test_env_var("HOME", &temp_dir.path().join("home"));
        let _userprofile = set_test_env_var("USERPROFILE", &temp_dir.path().join("home"));
        let _xdg_data = set_test_env_var("XDG_DATA_HOME", &temp_dir.path().join("xdg-data"));
        let _appdata = set_test_env_var("APPDATA", &temp_dir.path().join("appdata"));
        let _local_appdata =
            set_test_env_var("LOCALAPPDATA", &temp_dir.path().join("local-appdata"));
        let target_root = app_paths::resolve_skills_dir().expect("temp skills dir should resolve");
        let source_dir = target_root.join("writer");
        std::fs::create_dir_all(&source_dir).unwrap();
        std::fs::write(
            source_dir.join("SKILL.md"),
            "---\nname: Writer\ndescription: rename me\n---\n",
        )
        .unwrap();

        let result =
            rename_user_local_skill_dir(&AppType::Lime, "writer", "writer-renamed").unwrap();

        assert_eq!(result, "writer-renamed");
        assert!(!target_root.join("writer").exists());
        assert!(target_root
            .join("writer-renamed")
            .join("SKILL.md")
            .is_file());
    }

    #[test]
    fn test_replace_user_local_skill_package_replaces_existing_tree() {
        let _env_lock = lock_test_env();
        let temp_dir = TempDir::new().unwrap();
        let _home = set_test_env_var("HOME", &temp_dir.path().join("home"));
        let _userprofile = set_test_env_var("USERPROFILE", &temp_dir.path().join("home"));
        let _xdg_data = set_test_env_var("XDG_DATA_HOME", &temp_dir.path().join("xdg-data"));
        let _appdata = set_test_env_var("APPDATA", &temp_dir.path().join("appdata"));
        let _local_appdata =
            set_test_env_var("LOCALAPPDATA", &temp_dir.path().join("local-appdata"));
        let target_root = app_paths::resolve_skills_dir().expect("temp skills dir should resolve");
        let existing_dir = target_root.join("writer");
        std::fs::create_dir_all(existing_dir.join("references")).unwrap();
        std::fs::write(
            existing_dir.join("SKILL.md"),
            "---\nname: Writer\ndescription: old\n---\n",
        )
        .unwrap();
        std::fs::write(existing_dir.join("references").join("old.md"), "old").unwrap();

        let package = build_skill_zip(&[
            (
                "writer/SKILL.md",
                "---\nname: Writer\ndescription: replaced\n---\n\n# Replaced",
            ),
            ("writer/assets/new.txt", "new"),
        ]);
        let source_path = temp_dir.path().join("writer.skills");
        std::fs::write(&source_path, package).unwrap();

        let result = replace_user_local_skill_package(
            &AppType::Lime,
            "writer",
            &source_path.to_string_lossy(),
        )
        .unwrap();

        assert_eq!(result.directory, "writer");
        assert!(target_root.join("writer").join("SKILL.md").is_file());
        assert!(target_root
            .join("writer")
            .join("assets")
            .join("new.txt")
            .is_file());
        assert!(!target_root
            .join("writer")
            .join("references")
            .join("old.md")
            .exists());
        assert!(result.inspection.content.contains("# Replaced"));
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
