use super::common::parse_skill_package_app;
use super::common::resolve_skill_package_dir;
use super::common::skill_package_app_lookup_roots;
use super::common::skill_package_app_root;
use super::common::validate_skill_package_directory;
use app_server_protocol::SkillLocalDetailInspectParams;
use app_server_protocol::SkillLocalDetailInspectResponse;
use app_server_protocol::SkillPackageExportParams;
use app_server_protocol::SkillPackageExportResponse;
use app_server_protocol::SkillPackageLocalInspectParams;
use app_server_protocol::SkillPackageLocalInspectResponse;
use app_server_protocol::SkillPackageLocalInstallParams;
use app_server_protocol::SkillPackageLocalInstallResponse;
use app_server_protocol::SkillPackageLocalReplaceParams;
use app_server_protocol::SkillPackageLocalReplaceResponse;
use archive::collect_local_skill_detail_file_entries;
use archive::export_local_skill_package_to_path;
use archive::inspect_skill_zip_package;
use archive::install_skill_zip_package_into_root;
use archive::install_skill_zip_package_into_staged_dir;
use archive::normalize_skill_package_output_path;
use archive::read_local_skill_package_file;
use archive::read_skill_zip_package;
use archive::resolve_local_skill_package_fallback_name;
use archive::resolve_skill_package_directory_name;
use chrono::Utc;
use lime_services::skill_service::SkillService;
use serde_json::json;
use serde_json::Value;
use std::collections::BTreeSet;
use std::fs;
use std::path::Path;

pub(crate) mod archive;
pub(crate) mod download;
pub(crate) use download::install_skill_from_download_url;
pub(crate) fn inspect_local_skill_package(
    params: SkillPackageLocalInspectParams,
) -> Result<SkillPackageLocalInspectResponse, String> {
    let _app = parse_skill_package_app(&params.app)?;
    let (canonical_source, bytes) = read_local_skill_package_file(Path::new(&params.source_path))?;
    let fallback_name = resolve_local_skill_package_fallback_name(&canonical_source)?;
    inspect_skill_zip_package(&fallback_name, &bytes)
}

pub(crate) fn inspect_local_skill_detail(
    params: SkillLocalDetailInspectParams,
) -> Result<SkillLocalDetailInspectResponse, String> {
    let app = parse_skill_package_app(&params.app)?;
    let skill_roots = skill_package_app_lookup_roots(app)?;
    let skill_dir = resolve_skill_package_dir(&skill_roots, &params.directory)?;
    let inspection = SkillService::inspect_skill_dir(&skill_dir)
        .map_err(|error| format!("Skill failed inspection: {error}"))?;

    let mut directories = BTreeSet::new();
    let mut files = Vec::new();
    collect_local_skill_detail_file_entries(&skill_dir, &skill_dir, &mut directories, &mut files)?;

    let mut entries: Vec<Value> = directories
        .into_iter()
        .map(|path| {
            json!({
                "path": path,
                "isDirectory": true,
                "size": 0,
                "content": Value::Null,
            })
        })
        .collect();
    files.sort_by(|left, right| {
        left.get("path")
            .and_then(Value::as_str)
            .cmp(&right.get("path").and_then(Value::as_str))
    });
    entries.extend(files);

    Ok(SkillLocalDetailInspectResponse {
        directory: params.directory,
        inspection: serde_json::to_value(inspection)
            .map_err(|error| format!("Failed to serialize skill inspection: {error}"))?,
        files: entries,
    })
}

pub(crate) fn install_local_skill_package(
    params: SkillPackageLocalInstallParams,
) -> Result<SkillPackageLocalInstallResponse, String> {
    let app = parse_skill_package_app(&params.app)?;
    let (canonical_source, bytes) = read_local_skill_package_file(Path::new(&params.source_path))?;
    let fallback_name = resolve_local_skill_package_fallback_name(&canonical_source)?;
    let package = read_skill_zip_package(&bytes)?;
    let directory = match params
        .skill_name
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        Some(value) => {
            validate_skill_package_directory(value)?;
            value.to_string()
        }
        None => resolve_skill_package_directory_name(&package, &fallback_name)?,
    };
    let skills_root = skill_package_app_root(app)?;
    install_skill_zip_package_into_root(&skills_root, &directory, package)
}

pub(crate) fn replace_local_skill_package(
    params: SkillPackageLocalReplaceParams,
) -> Result<SkillPackageLocalReplaceResponse, String> {
    let app = parse_skill_package_app(&params.app)?;
    validate_skill_package_directory(&params.directory)?;
    let skills_root = skill_package_app_root(app)?;
    let existing_dir = resolve_skill_package_dir(&[skills_root.clone()], &params.directory)?;
    let (_canonical_source, bytes) = read_local_skill_package_file(Path::new(&params.source_path))?;
    let package = read_skill_zip_package(&bytes)?;

    fs::create_dir_all(&skills_root).map_err(|error| {
        format!(
            "Failed to create skills root {}: {error}",
            skills_root.display()
        )
    })?;
    let staging_parent = tempfile::TempDir::new_in(&skills_root)
        .map_err(|error| format!("Failed to create replacement staging directory: {error}"))?;
    let staged_dir = staging_parent.path().join(&params.directory);
    let staged_result =
        install_skill_zip_package_into_staged_dir(&staged_dir, &params.directory, package)?;

    let backup_dir = skills_root.join(format!(
        ".{}.replace-backup-{}",
        params.directory,
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
            "[Skill Package] failed to remove replacement backup {}: {}",
            backup_dir.display(),
            error
        );
    }

    Ok(staged_result)
}

pub(crate) fn export_local_skill_package(
    params: SkillPackageExportParams,
) -> Result<SkillPackageExportResponse, String> {
    let app = parse_skill_package_app(&params.app)?;
    let skill_roots = skill_package_app_lookup_roots(app)?;
    let target_path = normalize_skill_package_output_path(&params.target_path)?;
    export_local_skill_package_to_path(&skill_roots, &params.directory, &target_path)
}
