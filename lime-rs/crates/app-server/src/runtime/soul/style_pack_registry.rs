use super::style_pack_install::StylePackInstallStatus;
use super::style_pack_paths::{
    style_pack_data_root, validate_storage_id, REGISTRY_FILE_NAME, REQUIRED_LOCALES,
};
use super::style_profile::{installed_style_profile_seeds_from_manifest_source, StyleProfileSeed};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::Path;

#[derive(Debug, Clone)]
pub(crate) struct InstalledStylePackListEntry {
    pub(crate) pack_id: String,
    pub(crate) source: String,
    pub(crate) status: StylePackInstallStatus,
    pub(crate) profile_ids: Vec<String>,
    pub(crate) manifest_source: String,
    pub(crate) locale_sources: BTreeMap<String, String>,
    pub(crate) updated_at: Option<String>,
    pub(crate) integrity_digest: Option<String>,
}

pub(super) fn load_installed_style_profile_seeds() -> Vec<StyleProfileSeed> {
    let Ok(root) = style_pack_data_root() else {
        return Vec::new();
    };
    load_installed_style_profile_seeds_from_root(&root).unwrap_or_default()
}

pub(crate) fn list_installed_style_packs() -> Result<Vec<InstalledStylePackListEntry>, String> {
    let root = style_pack_data_root()?;
    list_installed_style_packs_from_root(&root)
}

fn list_installed_style_packs_from_root(
    root: &Path,
) -> Result<Vec<InstalledStylePackListEntry>, String> {
    let registry_path = root.join(REGISTRY_FILE_NAME);
    if !registry_path.exists() {
        return Ok(Vec::new());
    }

    let registry_source = fs::read_to_string(&registry_path)
        .map_err(|error| format!("读取 Soul Style Pack registry 失败: {error}"))?;
    let registry: Value = serde_json::from_str(&registry_source)
        .map_err(|error| format!("解析 Soul Style Pack registry 失败: {error}"))?;
    let packs = registry
        .get("packs")
        .and_then(Value::as_array)
        .ok_or_else(|| "Soul Style Pack registry 缺少 packs".to_string())?;

    let mut pack_ids = BTreeSet::new();
    let mut entries = Vec::new();

    for entry in packs {
        let pack_id = required_string(entry, "id")?;
        validate_storage_id(&pack_id)?;
        if !pack_ids.insert(pack_id.clone()) {
            return Err(format!("重复 Soul Style Pack id: {pack_id}"));
        }

        let source = required_string(entry, "source")?;
        if source != "local_import" && source != "cloud_download" {
            return Err("Installed Soul Style Pack source 不合法".to_string());
        }
        let status = StylePackInstallStatus::from_registry_entry(entry)?;
        let integrity_digest = entry
            .get("integrity")
            .and_then(|value| value.get("digest"))
            .and_then(Value::as_str)
            .filter(|text| !text.trim().is_empty())
            .map(str::to_string);
        if integrity_digest.is_none() {
            return Err("Installed Soul Style Pack registry 缺少 integrity.digest".to_string());
        }

        let pack_dir = root.join("packs").join(&pack_id);
        let manifest_path = pack_dir.join("manifest.json");
        let manifest_source = fs::read_to_string(&manifest_path)
            .map_err(|error| format!("读取 Soul Style Pack manifest 失败: {error}"))?;
        let manifest: Value = serde_json::from_str(&manifest_source)
            .map_err(|error| format!("解析 Soul Style Pack manifest 失败: {error}"))?;
        let locale_sources = read_installed_pack_locale_sources(&pack_dir, &manifest)?;
        let profile_ids = installed_style_profile_seeds_from_manifest_source(&manifest_source)?
            .into_iter()
            .map(|profile| {
                if profile.pack_id.as_str() != pack_id {
                    return Err("Soul Style Pack manifest id 与 registry id 不一致".to_string());
                }
                Ok(profile.id)
            })
            .collect::<Result<Vec<_>, String>>()?;

        entries.push(InstalledStylePackListEntry {
            pack_id,
            source,
            status,
            profile_ids,
            manifest_source,
            locale_sources,
            updated_at: optional_string(entry, "updatedAt"),
            integrity_digest,
        });
    }

    Ok(entries)
}

fn load_installed_style_profile_seeds_from_root(
    root: &Path,
) -> Result<Vec<StyleProfileSeed>, String> {
    let registry_path = root.join(REGISTRY_FILE_NAME);
    if !registry_path.exists() {
        return Ok(Vec::new());
    }

    let registry_source = fs::read_to_string(&registry_path)
        .map_err(|error| format!("读取 Soul Style Pack registry 失败: {error}"))?;
    let registry: Value = serde_json::from_str(&registry_source)
        .map_err(|error| format!("解析 Soul Style Pack registry 失败: {error}"))?;
    let packs = registry
        .get("packs")
        .and_then(Value::as_array)
        .ok_or_else(|| "Soul Style Pack registry 缺少 packs".to_string())?;

    let mut pack_ids = BTreeSet::new();
    let mut profile_ids = BTreeSet::new();
    let mut seeds = Vec::new();

    for entry in packs {
        let status = StylePackInstallStatus::from_registry_entry(entry)?;
        if !status.is_prompt_readable() {
            continue;
        }
        let pack_id = required_string(entry, "id")?;
        validate_storage_id(&pack_id)?;
        let source = required_string(entry, "source")?;
        if source != "local_import" && source != "cloud_download" {
            return Err("Installed Soul Style Pack source 不合法".to_string());
        }
        let digest = entry
            .get("integrity")
            .and_then(|value| value.get("digest"))
            .and_then(Value::as_str)
            .filter(|text| !text.trim().is_empty());
        if digest.is_none() {
            return Err("Installed Soul Style Pack registry 缺少 integrity.digest".to_string());
        }
        if !pack_ids.insert(pack_id.clone()) {
            return Err(format!("重复 Soul Style Pack id: {pack_id}"));
        }

        let pack_dir = root.join("packs").join(&pack_id);
        let manifest_path = pack_dir.join("manifest.json");
        let manifest_source = fs::read_to_string(&manifest_path)
            .map_err(|error| format!("读取 Soul Style Pack manifest 失败: {error}"))?;
        let manifest: Value = serde_json::from_str(&manifest_source)
            .map_err(|error| format!("解析 Soul Style Pack manifest 失败: {error}"))?;
        validate_installed_pack_locale_resources(&pack_dir, &manifest)?;
        let pack_seeds = installed_style_profile_seeds_from_manifest_source(&manifest_source)?;
        if pack_seeds
            .iter()
            .any(|profile| profile.pack_id.as_str() != pack_id)
        {
            return Err("Soul Style Pack manifest id 与 registry id 不一致".to_string());
        }
        for profile in pack_seeds {
            if !profile_ids.insert(profile.id.clone()) {
                return Err(format!("重复 Soul Style Profile id: {}", profile.id));
            }
            seeds.push(profile);
        }
    }

    Ok(seeds)
}

fn required_string(value: &Value, key: &str) -> Result<String, String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .filter(|text| !text.trim().is_empty())
        .map(str::to_string)
        .ok_or_else(|| format!("Soul Style Pack registry 缺少 {key}"))
}

fn optional_string(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .filter(|text| !text.trim().is_empty())
        .map(str::to_string)
}

fn validate_installed_pack_locale_resources(
    pack_dir: &Path,
    manifest: &Value,
) -> Result<(), String> {
    read_installed_pack_locale_sources(pack_dir, manifest).map(|_| ())
}

fn read_installed_pack_locale_sources(
    pack_dir: &Path,
    manifest: &Value,
) -> Result<BTreeMap<String, String>, String> {
    let required_keys = required_locale_keys(manifest)?;
    let mut locale_sources = BTreeMap::new();
    for locale in REQUIRED_LOCALES {
        let locale_path = pack_dir.join("locales").join(format!("{locale}.json"));
        let locale_source = fs::read_to_string(&locale_path)
            .map_err(|error| format!("读取 Soul Style Pack locale {locale} 失败: {error}"))?;
        let locale_resource: Value = serde_json::from_str(&locale_source)
            .map_err(|error| format!("解析 Soul Style Pack locale {locale} 失败: {error}"))?;
        validate_installed_pack_locale_resource_value(locale, &locale_resource, &required_keys)?;
        locale_sources.insert(locale.to_string(), locale_source);
    }
    Ok(locale_sources)
}

pub(super) fn validate_installed_pack_locale_resource_value(
    locale: &str,
    locale_resource: &Value,
    required_keys: &[String],
) -> Result<(), String> {
    for key in required_keys {
        let value = locale_resource.get(key).and_then(Value::as_str);
        if value.is_none_or(|text| text.trim().is_empty()) {
            return Err(format!("Soul Style Pack locale {locale} 缺少 {key}"));
        }
    }
    Ok(())
}

pub(super) fn required_locale_keys(manifest: &Value) -> Result<Vec<String>, String> {
    let mut keys = Vec::new();
    keys.push(required_manifest_string(manifest, "nameKey")?);
    keys.push(required_manifest_string(manifest, "descriptionKey")?);
    let profiles = manifest
        .get("profiles")
        .and_then(Value::as_array)
        .ok_or_else(|| "Soul Style Pack manifest 缺少 profiles".to_string())?;
    for profile in profiles {
        keys.push(required_manifest_string(profile, "nameKey")?);
        keys.push(required_manifest_string(profile, "descriptionKey")?);
    }
    keys.sort();
    keys.dedup();
    Ok(keys)
}

pub(super) fn required_manifest_string(value: &Value, key: &str) -> Result<String, String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .filter(|text| !text.trim().is_empty())
        .map(str::to_string)
        .ok_or_else(|| format!("Soul Style Pack manifest 缺少 {key}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

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
        serde_json::to_string(&manifest).expect("serialize manifest")
    }

    fn write_registry(root: &Path, pack_id: &str, status: StylePackInstallStatus) {
        fs::create_dir_all(root.join("packs").join(pack_id)).expect("pack dir");
        fs::write(
            root.join(REGISTRY_FILE_NAME),
            serde_json::to_string_pretty(&json!({
                "schemaVersion": 1,
                "packs": [{
                    "id": pack_id,
                    "source": "local_import",
                    "status": status.as_str(),
                    "integrity": { "digest": "sha256-local-pack" }
                }]
            }))
            .expect("registry"),
        )
        .expect("write registry");
    }

    fn write_manifest(root: &Path, pack_id: &str, manifest: String) {
        fs::write(
            root.join("packs").join(pack_id).join("manifest.json"),
            manifest,
        )
        .expect("write manifest");
    }

    fn write_locale_resources(root: &Path, pack_id: &str, include_profile_key: bool) {
        let locales_dir = root.join("packs").join(pack_id).join("locales");
        fs::create_dir_all(&locales_dir).expect("locales dir");
        let mut resource = json!({
            "settings.memory.soul.styleProfile.localSassy.title": "Local Sassy",
            "settings.memory.soul.styleProfile.localSassy.description": "Local style",
        });
        if !include_profile_key {
            resource
                .as_object_mut()
                .expect("resource object")
                .remove("settings.memory.soul.styleProfile.localSassy.description");
        }
        for locale in REQUIRED_LOCALES {
            fs::write(
                locales_dir.join(format!("{locale}.json")),
                serde_json::to_string_pretty(&resource).expect("locale"),
            )
            .expect("write locale");
        }
    }

    #[test]
    fn reads_enabled_installed_pack_manifest() {
        let temp = tempfile::tempdir().expect("temp dir");
        let pack_id = "com.example.soul.local-sassy";
        write_registry(temp.path(), pack_id, StylePackInstallStatus::Enabled);
        write_manifest(
            temp.path(),
            pack_id,
            installed_manifest(pack_id, "local_sassy_executor"),
        );
        write_locale_resources(temp.path(), pack_id, true);

        let seeds = load_installed_style_profile_seeds_from_root(temp.path()).expect("seeds");

        assert_eq!(seeds.len(), 1);
        assert_eq!(seeds[0].id, "local_sassy_executor");
        assert_eq!(seeds[0].pack_id, pack_id);
    }

    #[test]
    fn disabled_pack_is_not_loaded() {
        let temp = tempfile::tempdir().expect("temp dir");
        let pack_id = "com.example.soul.local-sassy";
        write_registry(temp.path(), pack_id, StylePackInstallStatus::Disabled);
        write_manifest(
            temp.path(),
            pack_id,
            installed_manifest(pack_id, "local_sassy_executor"),
        );

        let seeds = load_installed_style_profile_seeds_from_root(temp.path()).expect("seeds");

        assert!(seeds.is_empty());
    }

    #[test]
    fn lists_disabled_pack_for_settings_management() {
        let temp = tempfile::tempdir().expect("temp dir");
        let pack_id = "com.example.soul.local-sassy";
        write_registry(temp.path(), pack_id, StylePackInstallStatus::Disabled);
        write_manifest(
            temp.path(),
            pack_id,
            installed_manifest(pack_id, "local_sassy_executor"),
        );
        write_locale_resources(temp.path(), pack_id, true);

        let entries = list_installed_style_packs_from_root(temp.path()).expect("entries");

        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].pack_id, pack_id);
        assert_eq!(entries[0].status, StylePackInstallStatus::Disabled);
        assert_eq!(entries[0].profile_ids, vec!["local_sassy_executor"]);
        assert!(entries[0].locale_sources.contains_key("zh-CN"));
    }

    #[test]
    fn missing_integrity_fails_closed() {
        let temp = tempfile::tempdir().expect("temp dir");
        fs::write(
            temp.path().join(REGISTRY_FILE_NAME),
            serde_json::to_string_pretty(&json!({
                "schemaVersion": 1,
                "packs": [{
                    "id": "com.example.soul.unsigned",
                    "source": "local_import",
                    "status": "enabled"
                }]
            }))
            .expect("registry"),
        )
        .expect("write registry");

        let error = load_installed_style_profile_seeds_from_root(temp.path())
            .expect_err("missing digest should fail");

        assert!(error.contains("integrity.digest"));
    }

    #[test]
    fn legacy_top_level_digest_fails_closed() {
        let temp = tempfile::tempdir().expect("temp dir");
        fs::write(
            temp.path().join(REGISTRY_FILE_NAME),
            serde_json::to_string_pretty(&json!({
                "schemaVersion": 1,
                "packs": [{
                    "id": "com.example.soul.legacy-digest",
                    "source": "local_import",
                    "status": "enabled",
                    "digest": "sha256-legacy"
                }]
            }))
            .expect("registry"),
        )
        .expect("write registry");

        let error = load_installed_style_profile_seeds_from_root(temp.path())
            .expect_err("legacy digest should fail");

        assert!(error.contains("integrity.digest"));
    }

    #[test]
    fn missing_status_fails_closed() {
        let temp = tempfile::tempdir().expect("temp dir");
        fs::write(
            temp.path().join(REGISTRY_FILE_NAME),
            serde_json::to_string_pretty(&json!({
                "schemaVersion": 1,
                "packs": [{
                    "id": "com.example.soul.missing-status",
                    "source": "local_import",
                    "integrity": { "digest": "sha256-local-pack" }
                }]
            }))
            .expect("registry"),
        )
        .expect("write registry");

        let error = load_installed_style_profile_seeds_from_root(temp.path())
            .expect_err("missing status should fail");

        assert!(error.contains("status"));
    }

    #[test]
    fn legacy_enabled_bool_fails_closed() {
        let temp = tempfile::tempdir().expect("temp dir");
        fs::write(
            temp.path().join(REGISTRY_FILE_NAME),
            serde_json::to_string_pretty(&json!({
                "schemaVersion": 1,
                "packs": [{
                    "id": "com.example.soul.legacy-enabled",
                    "source": "local_import",
                    "enabled": true,
                    "integrity": { "digest": "sha256-local-pack" }
                }]
            }))
            .expect("registry"),
        )
        .expect("write registry");

        let error = load_installed_style_profile_seeds_from_root(temp.path())
            .expect_err("legacy enabled should fail");

        assert!(error.contains("status"));
    }

    #[test]
    fn missing_locale_file_fails_closed() {
        let temp = tempfile::tempdir().expect("temp dir");
        let pack_id = "com.example.soul.local-sassy";
        write_registry(temp.path(), pack_id, StylePackInstallStatus::Enabled);
        write_manifest(
            temp.path(),
            pack_id,
            installed_manifest(pack_id, "local_sassy_executor"),
        );

        let error = load_installed_style_profile_seeds_from_root(temp.path())
            .expect_err("missing locale should fail");

        assert!(error.contains("locale zh-CN"));
    }

    #[test]
    fn locale_missing_profile_key_fails_closed() {
        let temp = tempfile::tempdir().expect("temp dir");
        let pack_id = "com.example.soul.local-sassy";
        write_registry(temp.path(), pack_id, StylePackInstallStatus::Enabled);
        write_manifest(
            temp.path(),
            pack_id,
            installed_manifest(pack_id, "local_sassy_executor"),
        );
        write_locale_resources(temp.path(), pack_id, false);

        let error = load_installed_style_profile_seeds_from_root(temp.path())
            .expect_err("missing locale key should fail");

        assert!(error.contains("settings.memory.soul.styleProfile.localSassy.description"));
    }
}
