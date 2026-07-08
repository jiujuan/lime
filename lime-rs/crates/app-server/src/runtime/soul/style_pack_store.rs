use super::style_pack_install::StylePackInstallStatus;
use super::style_pack_paths::{validate_storage_id, REGISTRY_FILE_NAME, REQUIRED_LOCALES};
use super::style_pack_registry::{
    required_locale_keys, required_manifest_string, validate_installed_pack_locale_resource_value,
};
use super::style_profile::installed_style_profile_seeds_from_manifest_source;
use chrono::Utc;
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

pub(crate) struct StylePackInstallSources {
    pub(crate) manifest_source: String,
    pub(crate) locale_sources: BTreeMap<String, String>,
    pub(crate) enable_after_install: bool,
}

#[derive(Debug)]
pub(crate) struct StylePackInstallRecord {
    pub(crate) pack_id: String,
    pub(crate) profile_ids: Vec<String>,
    pub(crate) status: StylePackInstallStatus,
}

pub(crate) fn install_style_pack_from_sources(
    root: &Path,
    sources: StylePackInstallSources,
) -> Result<StylePackInstallRecord, String> {
    let manifest = parse_installed_manifest(&sources.manifest_source)?;
    let pack_id = required_manifest_string(&manifest, "id")?;
    validate_storage_id(&pack_id)?;
    let source = required_manifest_string(&manifest, "source")?;
    if source != "local_import" && source != "cloud_download" {
        return Err("Installed Soul Style Pack source 不合法".to_string());
    }
    let digest = manifest_integrity_digest(&manifest)?;
    let profile_ids = validate_installed_manifest_source(&sources.manifest_source, &pack_id)?;
    validate_locale_sources(&manifest, &sources.locale_sources)?;

    StylePackInstallStatus::Validating.ensure_transition_to(StylePackInstallStatus::Installing)?;
    StylePackInstallStatus::Installing.ensure_transition_to(StylePackInstallStatus::Installed)?;
    let status = if sources.enable_after_install {
        StylePackInstallStatus::Installed.ensure_transition_to(StylePackInstallStatus::Enabled)?;
        StylePackInstallStatus::Enabled
    } else {
        StylePackInstallStatus::Installed
    };

    let registry = upsert_registry_entry(
        load_registry(root)?,
        &pack_id,
        &source,
        status,
        &digest,
        now_iso(),
    )?;
    let staged_pack_dir = stage_pack(root, &pack_id, &sources)?;
    let pack_dir = root.join("packs").join(&pack_id);
    let rollback_dir = replace_pack_dir(&pack_dir, &staged_pack_dir)?;
    if let Err(error) = write_registry_atomically(root, &registry) {
        rollback_pack_dir(&pack_dir, rollback_dir.as_deref());
        return Err(error);
    }
    cleanup_rollback_dir(rollback_dir.as_deref());

    Ok(StylePackInstallRecord {
        pack_id,
        profile_ids,
        status,
    })
}

pub(crate) fn set_style_pack_status_from_root(
    root: &Path,
    pack_id: &str,
    next: StylePackInstallStatus,
) -> Result<(), String> {
    validate_storage_id(pack_id)?;
    let mut registry = load_registry(root)?;
    let packs = registry_packs_mut(&mut registry)?;
    let Some(entry) = packs
        .iter_mut()
        .find(|entry| entry.get("id").and_then(Value::as_str) == Some(pack_id))
    else {
        return Err(format!("Soul Style Pack 未安装: {pack_id}"));
    };
    let current = StylePackInstallStatus::from_registry_entry(entry)?;
    current.ensure_transition_to(next)?;
    set_object_field(entry, "status", Value::String(next.as_str().to_string()))?;
    set_object_field(entry, "updatedAt", Value::String(now_iso()))?;
    write_registry_atomically(root, &registry)
}

pub(crate) fn uninstall_style_pack_from_root(root: &Path, pack_id: &str) -> Result<(), String> {
    validate_storage_id(pack_id)?;
    let mut registry = load_registry(root)?;
    let packs = registry_packs_mut(&mut registry)?;
    let Some(index) = packs
        .iter()
        .position(|entry| entry.get("id").and_then(Value::as_str) == Some(pack_id))
    else {
        return Err(format!("Soul Style Pack 未安装: {pack_id}"));
    };
    let status = StylePackInstallStatus::from_registry_entry(&packs[index])?;
    status.ensure_transition_to(StylePackInstallStatus::Uninstalled)?;
    packs.remove(index);
    let pack_dir = root.join("packs").join(pack_id);
    if pack_dir.exists() {
        fs::remove_dir_all(&pack_dir)
            .map_err(|error| format!("删除 Soul Style Pack 目录失败: {error}"))?;
    }
    write_registry_atomically(root, &registry)
}

fn parse_installed_manifest(source: &str) -> Result<Value, String> {
    serde_json::from_str(source)
        .map_err(|error| format!("解析 Soul Style Pack manifest 失败: {error}"))
}

fn manifest_integrity_digest(manifest: &Value) -> Result<String, String> {
    manifest
        .get("integrity")
        .and_then(|value| value.get("digest"))
        .and_then(Value::as_str)
        .filter(|text| !text.trim().is_empty())
        .map(str::to_string)
        .ok_or_else(|| "Installed Soul Style Pack manifest 缺少 integrity.digest".to_string())
}

fn validate_installed_manifest_source(
    manifest_source: &str,
    pack_id: &str,
) -> Result<Vec<String>, String> {
    let seeds = installed_style_profile_seeds_from_manifest_source(manifest_source)?;
    if seeds.iter().any(|profile| profile.pack_id != pack_id) {
        return Err("Soul Style Pack manifest id 与 profile packId 不一致".to_string());
    }
    Ok(seeds.into_iter().map(|profile| profile.id).collect())
}

fn validate_locale_sources(
    manifest: &Value,
    locale_sources: &BTreeMap<String, String>,
) -> Result<(), String> {
    let required_keys = required_locale_keys(manifest)?;
    for locale in REQUIRED_LOCALES {
        let source = locale_sources
            .get(locale)
            .ok_or_else(|| format!("Soul Style Pack locale {locale} 缺失"))?;
        let locale_resource: Value = serde_json::from_str(source)
            .map_err(|error| format!("解析 Soul Style Pack locale {locale} 失败: {error}"))?;
        validate_installed_pack_locale_resource_value(locale, &locale_resource, &required_keys)?;
    }
    Ok(())
}

fn stage_pack(
    root: &Path,
    pack_id: &str,
    sources: &StylePackInstallSources,
) -> Result<PathBuf, String> {
    let stage_dir = root
        .join(".installing")
        .join(format!("{pack_id}-{}", Utc::now().timestamp_millis()));
    if stage_dir.exists() {
        fs::remove_dir_all(&stage_dir)
            .map_err(|error| format!("清理 Soul Style Pack staging 目录失败: {error}"))?;
    }
    fs::create_dir_all(stage_dir.join("locales"))
        .map_err(|error| format!("创建 Soul Style Pack staging 目录失败: {error}"))?;
    fs::write(stage_dir.join("manifest.json"), &sources.manifest_source)
        .map_err(|error| format!("写入 Soul Style Pack manifest 失败: {error}"))?;
    for locale in REQUIRED_LOCALES {
        let source = sources
            .locale_sources
            .get(locale)
            .ok_or_else(|| format!("Soul Style Pack locale {locale} 缺失"))?;
        fs::write(
            stage_dir.join("locales").join(format!("{locale}.json")),
            source,
        )
        .map_err(|error| format!("写入 Soul Style Pack locale {locale} 失败: {error}"))?;
    }
    Ok(stage_dir)
}

fn replace_pack_dir(target: &Path, staged_pack_dir: &Path) -> Result<Option<PathBuf>, String> {
    let packs_root = target
        .parent()
        .ok_or_else(|| "Soul Style Pack target 缺少父目录".to_string())?;
    fs::create_dir_all(packs_root)
        .map_err(|error| format!("创建 Soul Style Pack packs 目录失败: {error}"))?;
    let rollback_dir = if target.exists() {
        let rollback_dir = packs_root.join(".rollback").join(format!(
            "{}-{}",
            target
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("style-pack"),
            Utc::now().timestamp_millis()
        ));
        if let Some(parent) = rollback_dir.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("创建 Soul Style Pack rollback 目录失败: {error}"))?;
        }
        fs::rename(target, &rollback_dir)
            .map_err(|error| format!("备份既有 Soul Style Pack 目录失败: {error}"))?;
        Some(rollback_dir)
    } else {
        None
    };
    if let Err(error) = fs::rename(staged_pack_dir, target) {
        rollback_pack_dir(target, rollback_dir.as_deref());
        return Err(format!("安装 Soul Style Pack 目录失败: {error}"));
    }
    Ok(rollback_dir)
}

fn rollback_pack_dir(target: &Path, rollback_dir: Option<&Path>) {
    if target.exists() {
        let _ = fs::remove_dir_all(target);
    }
    if let Some(rollback_dir) = rollback_dir {
        if rollback_dir.exists() {
            let _ = fs::rename(rollback_dir, target);
        }
    }
}

fn cleanup_rollback_dir(rollback_dir: Option<&Path>) {
    if let Some(rollback_dir) = rollback_dir {
        if rollback_dir.exists() {
            let _ = fs::remove_dir_all(rollback_dir);
        }
    }
}

fn load_registry(root: &Path) -> Result<Value, String> {
    let path = root.join(REGISTRY_FILE_NAME);
    if !path.exists() {
        return Ok(json!({
            "schemaVersion": 1,
            "packs": []
        }));
    }
    let source = fs::read_to_string(&path)
        .map_err(|error| format!("读取 Soul Style Pack registry 失败: {error}"))?;
    let registry: Value = serde_json::from_str(&source)
        .map_err(|error| format!("解析 Soul Style Pack registry 失败: {error}"))?;
    let schema_version = registry
        .get("schemaVersion")
        .and_then(Value::as_u64)
        .ok_or_else(|| "Soul Style Pack registry 缺少 schemaVersion".to_string())?;
    if schema_version != 1 {
        return Err(format!(
            "不支持的 Soul Style Pack registry schemaVersion: {schema_version}",
        ));
    }
    registry
        .get("packs")
        .and_then(Value::as_array)
        .ok_or_else(|| "Soul Style Pack registry 缺少 packs".to_string())?;
    Ok(registry)
}

fn upsert_registry_entry(
    mut registry: Value,
    pack_id: &str,
    source: &str,
    status: StylePackInstallStatus,
    digest: &str,
    installed_at: String,
) -> Result<Value, String> {
    let packs = registry_packs_mut(&mut registry)?;
    packs.retain(|entry| entry.get("id").and_then(Value::as_str) != Some(pack_id));
    packs.push(json!({
        "id": pack_id,
        "source": source,
        "status": status.as_str(),
        "integrity": { "digest": digest },
        "installedAt": installed_at,
        "updatedAt": installed_at,
    }));
    packs.sort_by(|left, right| {
        left.get("id")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .cmp(right.get("id").and_then(Value::as_str).unwrap_or_default())
    });
    Ok(registry)
}

fn registry_packs_mut(registry: &mut Value) -> Result<&mut Vec<Value>, String> {
    registry
        .get_mut("packs")
        .and_then(Value::as_array_mut)
        .ok_or_else(|| "Soul Style Pack registry 缺少 packs".to_string())
}

fn write_registry_atomically(root: &Path, registry: &Value) -> Result<(), String> {
    fs::create_dir_all(root)
        .map_err(|error| format!("创建 Soul Style Pack registry 目录失败: {error}"))?;
    let registry_path = root.join(REGISTRY_FILE_NAME);
    let suffix = Utc::now().timestamp_millis();
    let temp_path = root.join(format!("{REGISTRY_FILE_NAME}.tmp-{suffix}"));
    let backup_path = root.join(format!("{REGISTRY_FILE_NAME}.bak-{suffix}"));
    let content = serde_json::to_string_pretty(registry)
        .map_err(|error| format!("序列化 Soul Style Pack registry 失败: {error}"))?;
    fs::write(&temp_path, content)
        .map_err(|error| format!("写入 Soul Style Pack registry 临时文件失败: {error}"))?;

    let had_registry = registry_path.exists();
    if had_registry {
        fs::rename(&registry_path, &backup_path)
            .map_err(|error| format!("备份 Soul Style Pack registry 失败: {error}"))?;
    }
    if let Err(error) = fs::rename(&temp_path, &registry_path) {
        let _ = fs::remove_file(&temp_path);
        if had_registry && backup_path.exists() {
            let _ = fs::rename(&backup_path, &registry_path);
        }
        return Err(format!("替换 Soul Style Pack registry 失败: {error}"));
    }
    if had_registry && backup_path.exists() {
        let _ = fs::remove_file(&backup_path);
    }
    Ok(())
}

fn set_object_field(value: &mut Value, key: &str, next: Value) -> Result<(), String> {
    let object = value
        .as_object_mut()
        .ok_or_else(|| "Soul Style Pack registry entry 必须是 object".to_string())?;
    object.insert(key.to_string(), next);
    Ok(())
}

fn now_iso() -> String {
    Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn installed_manifest(pack_id: &str, profile_id: &str) -> String {
        let mut manifest: Value = serde_json::from_str(include_str!(
            "../../../../../../src/lib/soul/style-profiles/packs/cheeky-sassy-executor.json"
        ))
        .expect("built-in manifest");
        manifest["id"] = json!(pack_id);
        manifest["source"] = json!("local_import");
        manifest["integrity"] = json!({ "digest": "sha256-local-pack" });
        manifest["nameKey"] = json!("settings.memory.soul.styleProfile.localSassy.title");
        manifest["descriptionKey"] =
            json!("settings.memory.soul.styleProfile.localSassy.description");
        manifest["profiles"][0]["id"] = json!(profile_id);
        manifest["profiles"][0]["packId"] = json!(pack_id);
        manifest["profiles"][0]["nameKey"] =
            json!("settings.memory.soul.styleProfile.localSassy.title");
        manifest["profiles"][0]["descriptionKey"] =
            json!("settings.memory.soul.styleProfile.localSassy.description");
        serde_json::to_string_pretty(&manifest).expect("serialize manifest")
    }

    fn locale_sources() -> BTreeMap<String, String> {
        REQUIRED_LOCALES
            .into_iter()
            .map(|locale| {
                (
                    locale.to_string(),
                    serde_json::to_string_pretty(&json!({
                        "settings.memory.soul.styleProfile.localSassy.title": "Local Sassy",
                        "settings.memory.soul.styleProfile.localSassy.description": "Local style",
                    }))
                    .expect("locale"),
                )
            })
            .collect()
    }

    fn install_sources(
        pack_id: &str,
        profile_id: &str,
        enable_after_install: bool,
    ) -> StylePackInstallSources {
        StylePackInstallSources {
            manifest_source: installed_manifest(pack_id, profile_id),
            locale_sources: locale_sources(),
            enable_after_install,
        }
    }

    #[test]
    fn installs_enabled_pack_with_registry_and_locale_resources() {
        let temp = tempfile::tempdir().expect("temp dir");
        let pack_id = "com.example.soul.local-sassy";

        let record = install_style_pack_from_sources(
            temp.path(),
            install_sources(pack_id, "local_sassy_executor", true),
        )
        .expect("install");

        assert_eq!(record.pack_id, pack_id);
        assert_eq!(record.profile_ids, vec!["local_sassy_executor"]);
        assert_eq!(record.status, StylePackInstallStatus::Enabled);
        assert!(temp
            .path()
            .join("packs")
            .join(pack_id)
            .join("manifest.json")
            .exists());
        for locale in REQUIRED_LOCALES {
            assert!(temp
                .path()
                .join("packs")
                .join(pack_id)
                .join("locales")
                .join(format!("{locale}.json"))
                .exists());
        }

        let registry_source =
            fs::read_to_string(temp.path().join(REGISTRY_FILE_NAME)).expect("registry");
        let registry: Value = serde_json::from_str(&registry_source).expect("registry json");
        assert_eq!(registry["packs"][0]["id"], pack_id);
        assert_eq!(registry["packs"][0]["status"], "enabled");
        assert_eq!(
            registry["packs"][0]["integrity"]["digest"],
            "sha256-local-pack"
        );
    }

    #[test]
    fn install_failure_leaves_no_half_installed_pack() {
        let temp = tempfile::tempdir().expect("temp dir");
        let pack_id = "com.example.soul.bad-locale";
        let mut sources = install_sources(pack_id, "bad_locale_executor", true);
        sources
            .locale_sources
            .insert("zh-CN".to_string(), "{}".to_string());

        let error = install_style_pack_from_sources(temp.path(), sources)
            .expect_err("locale validation should fail");

        assert!(error.contains("localSassy"));
        assert!(!temp.path().join("packs").join(pack_id).exists());
        assert!(!temp.path().join(REGISTRY_FILE_NAME).exists());
    }

    #[test]
    fn failed_reinstall_keeps_previous_pack() {
        let temp = tempfile::tempdir().expect("temp dir");
        let pack_id = "com.example.soul.replace";
        install_style_pack_from_sources(
            temp.path(),
            install_sources(pack_id, "old_executor", true),
        )
        .expect("install old");
        let old_manifest = fs::read_to_string(
            temp.path()
                .join("packs")
                .join(pack_id)
                .join("manifest.json"),
        )
        .expect("old manifest");

        let mut sources = install_sources(pack_id, "new_executor", true);
        sources.locale_sources.clear();
        let error =
            install_style_pack_from_sources(temp.path(), sources).expect_err("missing locales");

        assert!(error.contains("locale zh-CN"));
        let manifest = fs::read_to_string(
            temp.path()
                .join("packs")
                .join(pack_id)
                .join("manifest.json"),
        )
        .expect("manifest");
        assert_eq!(manifest, old_manifest);
    }

    #[test]
    fn disabling_pack_hides_it_from_prompt_read_model() {
        let temp = tempfile::tempdir().expect("temp dir");
        let pack_id = "com.example.soul.disable";
        install_style_pack_from_sources(
            temp.path(),
            install_sources(pack_id, "disabled_executor", true),
        )
        .expect("install");

        set_style_pack_status_from_root(temp.path(), pack_id, StylePackInstallStatus::Disabled)
            .expect("disable");
        let registry_source =
            fs::read_to_string(temp.path().join(REGISTRY_FILE_NAME)).expect("registry");
        let registry: Value = serde_json::from_str(&registry_source).expect("registry json");

        assert_eq!(registry["packs"][0]["status"], "disabled");
    }

    #[test]
    fn uninstall_disabled_pack_removes_registry_entry_and_files() {
        let temp = tempfile::tempdir().expect("temp dir");
        let pack_id = "com.example.soul.uninstall";
        install_style_pack_from_sources(
            temp.path(),
            install_sources(pack_id, "uninstall_executor", true),
        )
        .expect("install");
        set_style_pack_status_from_root(temp.path(), pack_id, StylePackInstallStatus::Disabled)
            .expect("disable");

        uninstall_style_pack_from_root(temp.path(), pack_id).expect("uninstall");
        let registry_source =
            fs::read_to_string(temp.path().join(REGISTRY_FILE_NAME)).expect("registry");
        let registry: Value = serde_json::from_str(&registry_source).expect("registry json");

        assert_eq!(registry["packs"].as_array().expect("packs").len(), 0);
        assert!(!temp.path().join("packs").join(pack_id).exists());
    }

    #[test]
    fn uninstall_enabled_pack_requires_disable_first() {
        let temp = tempfile::tempdir().expect("temp dir");
        let pack_id = "com.example.soul.enabled-uninstall";
        install_style_pack_from_sources(
            temp.path(),
            install_sources(pack_id, "enabled_uninstall_executor", true),
        )
        .expect("install");

        let error = uninstall_style_pack_from_root(temp.path(), pack_id)
            .expect_err("enabled uninstall should be rejected");

        assert!(error.contains("enabled -> uninstalled"));
        assert!(temp.path().join("packs").join(pack_id).exists());
    }
}
