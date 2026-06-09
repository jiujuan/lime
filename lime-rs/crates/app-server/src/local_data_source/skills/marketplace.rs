use super::common::parse_skill_package_app;
use super::common::skill_package_app_root;
use super::common::validate_skill_package_directory;
use app_server_protocol::SkillMarketplaceBundleFile;
use app_server_protocol::SkillMarketplaceInstallParams;
use app_server_protocol::SkillMarketplaceInstallResponse;
use lime_services::skill_service::SkillService;
use sha2::Digest;
use sha2::Sha256;
use std::fs;
use std::path::Component;
use std::path::Path;
use std::path::PathBuf;

fn validate_marketplace_skill_file_path(path: &str) -> Result<PathBuf, String> {
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

fn normalize_bundle_sha256(value: &str) -> String {
    value
        .trim()
        .strip_prefix("sha256:")
        .unwrap_or_else(|| value.trim())
        .to_ascii_lowercase()
}

fn verify_marketplace_skill_file_checksum(file: &SkillMarketplaceBundleFile) -> Result<(), String> {
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

fn resolve_marketplace_skill_install_directory(
    skills_root: &Path,
    preferred_directory: &str,
) -> Result<String, String> {
    let preferred_directory = preferred_directory.trim();
    validate_skill_package_directory(preferred_directory)?;
    if !skills_root.join(preferred_directory).exists() {
        return Ok(preferred_directory.to_string());
    }

    let suffix = "-official";
    let candidate = if preferred_directory.ends_with(suffix) {
        preferred_directory.to_string()
    } else {
        format!("{preferred_directory}{suffix}")
    };
    validate_skill_package_directory(&candidate)?;
    if !skills_root.join(&candidate).exists() {
        return Ok(candidate);
    }

    for index in 2..=99 {
        let candidate = format!("{preferred_directory}{suffix}-{index}");
        validate_skill_package_directory(&candidate)?;
        if !skills_root.join(&candidate).exists() {
            return Ok(candidate);
        }
    }

    Err(format!(
        "Skill directory already exists: {preferred_directory}"
    ))
}

fn install_marketplace_skill_bundle_into_root(
    skills_root: &Path,
    params: SkillMarketplaceInstallParams,
) -> Result<SkillMarketplaceInstallResponse, String> {
    let preferred_directory = params.name.trim();
    validate_skill_package_directory(preferred_directory)?;

    if !params.manifest_version.trim().is_empty()
        && params.manifest_version.trim() != "agentskills.v1"
    {
        return Err(format!(
            "Unsupported marketplace skill manifest version: {}",
            params.manifest_version
        ));
    }
    if params.files.is_empty() {
        return Err("Marketplace skill bundle is empty".to_string());
    }
    if params.file_count > 0 && params.file_count != params.files.len() as u64 {
        return Err("Marketplace skill bundle file count mismatch".to_string());
    }

    fs::create_dir_all(skills_root).map_err(|error| {
        format!(
            "Failed to create skills root {}: {error}",
            skills_root.display()
        )
    })?;
    let directory = resolve_marketplace_skill_install_directory(skills_root, preferred_directory)?;
    let target_dir = skills_root.join(&directory);
    fs::create_dir_all(&target_dir).map_err(|error| {
        format!(
            "Failed to create skill directory {}: {error}",
            target_dir.display()
        )
    })?;

    let mut has_skill_md = false;
    for file in &params.files {
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
        if let Err(error) = verify_marketplace_skill_file_checksum(file) {
            let _ = fs::remove_dir_all(&target_dir);
            return Err(error);
        }

        let relative_path = match validate_marketplace_skill_file_path(&file.path) {
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
            Ok(SkillMarketplaceInstallResponse {
                directory,
                inspection: serde_json::to_value(inspection)
                    .map_err(|error| format!("Failed to serialize skill inspection: {error}"))?,
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

pub(crate) fn install_marketplace_skill(
    params: SkillMarketplaceInstallParams,
) -> Result<SkillMarketplaceInstallResponse, String> {
    let app = parse_skill_package_app(&params.app)?;
    let skills_root = skill_package_app_root(app)?;
    install_marketplace_skill_bundle_into_root(&skills_root, params)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;
    use tempfile::TempDir;

    #[test]
    fn install_marketplace_skill_bundle_into_root_writes_standard_package() {
        let temp_dir = TempDir::new().expect("temp dir");
        let target_root = temp_dir.path().join("skills");
        let content = "---\nname: Market Skill\ndescription: install me\n---\n";
        let checksum = format!("sha256:{}", hex::encode(Sha256::digest(content.as_bytes())));

        let result = install_marketplace_skill_bundle_into_root(
            &target_root,
            SkillMarketplaceInstallParams {
                app: "lime".to_string(),
                manifest_version: "agentskills.v1".to_string(),
                name: "market-skill".to_string(),
                aliases: Vec::new(),
                version: "1.0.0".to_string(),
                content_hash: "sha256:bundle".to_string(),
                file_count: 2,
                files: vec![
                    SkillMarketplaceBundleFile {
                        path: "SKILL.md".to_string(),
                        content: content.to_string(),
                        encoding: Some("utf-8".to_string()),
                        sha256: Some(checksum),
                    },
                    SkillMarketplaceBundleFile {
                        path: "references/guide.md".to_string(),
                        content: "# Guide".to_string(),
                        encoding: Some("utf-8".to_string()),
                        sha256: None,
                    },
                ],
            },
        )
        .expect("marketplace package should install");

        assert_eq!(result.directory, "market-skill");
        assert!(target_root.join("market-skill").join("SKILL.md").is_file());
        assert!(target_root
            .join("market-skill")
            .join("references")
            .join("guide.md")
            .is_file());
        assert!(result
            .inspection
            .get("standardCompliance")
            .and_then(Value::as_object)
            .and_then(|value| value.get("isStandard"))
            .and_then(Value::as_bool)
            .unwrap_or(false));
    }

    #[test]
    fn install_marketplace_skill_bundle_into_root_avoids_existing_directory() {
        let temp_dir = TempDir::new().expect("temp dir");
        let target_root = temp_dir.path().join("skills");
        fs::create_dir_all(target_root.join("analysis")).expect("existing dir");
        fs::write(
            target_root.join("analysis").join("SKILL.md"),
            "---\nname: analysis\ndescription: existing builtin\n---\n",
        )
        .expect("existing skill");
        let content = "---\nname: Analysis\ndescription: install me\n---\n";

        let result = install_marketplace_skill_bundle_into_root(
            &target_root,
            SkillMarketplaceInstallParams {
                app: "lime".to_string(),
                manifest_version: "agentskills.v1".to_string(),
                name: "analysis".to_string(),
                aliases: Vec::new(),
                version: "1.0.0".to_string(),
                content_hash: "sha256:bundle".to_string(),
                file_count: 1,
                files: vec![SkillMarketplaceBundleFile {
                    path: "SKILL.md".to_string(),
                    content: content.to_string(),
                    encoding: Some("utf-8".to_string()),
                    sha256: None,
                }],
            },
        )
        .expect("marketplace package should install with alternate directory");

        assert_eq!(result.directory, "analysis-official");
        assert!(target_root.join("analysis").join("SKILL.md").is_file());
        assert!(target_root
            .join("analysis-official")
            .join("SKILL.md")
            .is_file());
    }

    #[test]
    fn install_marketplace_skill_bundle_into_root_rejects_path_traversal() {
        let temp_dir = TempDir::new().expect("temp dir");
        let target_root = temp_dir.path().join("skills");

        let err = install_marketplace_skill_bundle_into_root(
            &target_root,
            SkillMarketplaceInstallParams {
                app: "lime".to_string(),
                manifest_version: "agentskills.v1".to_string(),
                name: "market-skill".to_string(),
                aliases: Vec::new(),
                version: "1.0.0".to_string(),
                content_hash: String::new(),
                file_count: 1,
                files: vec![SkillMarketplaceBundleFile {
                    path: "../SKILL.md".to_string(),
                    content: "---\nname: Bad\ndescription: bad\n---\n".to_string(),
                    encoding: Some("utf-8".to_string()),
                    sha256: None,
                }],
            },
        )
        .expect_err("path traversal should be rejected");

        assert!(err.contains("Invalid marketplace skill file path"));
        assert!(!target_root.join("market-skill").exists());
    }

    #[test]
    fn install_marketplace_skill_bundle_into_root_rejects_checksum_mismatch() {
        let temp_dir = TempDir::new().expect("temp dir");
        let target_root = temp_dir.path().join("skills");

        let err = install_marketplace_skill_bundle_into_root(
            &target_root,
            SkillMarketplaceInstallParams {
                app: "lime".to_string(),
                manifest_version: "agentskills.v1".to_string(),
                name: "market-skill".to_string(),
                aliases: Vec::new(),
                version: "1.0.0".to_string(),
                content_hash: String::new(),
                file_count: 1,
                files: vec![SkillMarketplaceBundleFile {
                    path: "SKILL.md".to_string(),
                    content: "---\nname: Bad\ndescription: bad\n---\n".to_string(),
                    encoding: Some("utf-8".to_string()),
                    sha256: Some("sha256:0000".to_string()),
                }],
            },
        )
        .expect_err("checksum mismatch should be rejected");

        assert!(err.contains("checksum mismatch"));
        assert!(!target_root.join("market-skill").exists());
    }
}
