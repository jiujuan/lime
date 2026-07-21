use serde_json::json;
use serde_json::Value;
use std::fs;
use std::path::Path;
use std::path::PathBuf;

use super::read_json_string;
use super::safe_hash_path_segment;

#[derive(Clone)]
struct SeededPluginFixture {
    fixture_dir: PathBuf,
    app_id: String,
    version: String,
    package_url: String,
    package_hash: String,
    manifest_hash: String,
    worker_entrypoint: Option<String>,
}

struct SeededPluginsDescriptor {
    apps: Vec<SeededPluginDescriptorEntry>,
}

struct SeededPluginDescriptorEntry {
    app_id: String,
    version: String,
    manifest_path: String,
    package_root: String,
    package_url: String,
    package_hash: String,
    manifest_hash: String,
    worker_entrypoint: Option<String>,
}

pub(crate) fn materialize_seeded_plugin_runtime_package_from_data_root(
    state: &Value,
    data_root: &Path,
) -> Result<(), String> {
    let Some(fixture) = resolve_seeded_plugin_fixture(state)? else {
        return Ok(());
    };

    let worker_entrypoint = read_json_string(
        state,
        &["manifest", "runtimePackage", "worker", "entrypoint"],
    )
    .or_else(|| read_json_string(state, &["manifest", "agentRuntime", "worker", "entrypoint"]))
    .or_else(|| fixture.worker_entrypoint.clone());
    let Some(worker_entrypoint) = worker_entrypoint else {
        return Ok(());
    };
    let package_hash = read_json_string(state, &["identity", "packageHash"])
        .ok_or_else(|| "Seeded Plugin installed state 缺少 packageHash。".to_string())?;
    let cache_dir = data_root
        .join("packages")
        .join(safe_hash_path_segment(&package_hash));
    let worker_path = cache_dir.join(worker_entrypoint.trim_start_matches("./"));
    if cache_dir.join("package.json").is_file() && worker_path.is_file() {
        return Ok(());
    }

    replace_directory_from_fixture(&fixture.fixture_dir, &cache_dir)
}

pub(crate) fn migrate_seeded_plugin_installed_state(mut state: Value) -> Value {
    let Some(fixture) = resolve_seeded_plugin_fixture(&state).ok().flatten() else {
        return state;
    };
    if state
        .get("setup")
        .and_then(|setup| setup.get("cloudReleaseEvidence"))
        .is_some()
    {
        return state;
    }

    let Some(package_hash) = read_json_string(&state, &["identity", "packageHash"]) else {
        return state;
    };
    let Some(manifest_hash) = read_json_string(&state, &["identity", "manifestHash"]) else {
        return state;
    };
    let app_version = read_json_string(&state, &["identity", "appVersion"])
        .or_else(|| read_json_string(&state, &["manifest", "version"]))
        .unwrap_or_else(|| fixture.version.clone());
    let app_id = read_json_string(&state, &["appId"])
        .or_else(|| read_json_string(&state, &["identity", "appId"]))
        .unwrap_or_else(|| fixture.app_id.clone());

    let package_hash_matched = package_hash == fixture.package_hash;
    let manifest_hash_matched = manifest_hash == fixture.manifest_hash;
    let evidence = json!({
        "appId": app_id,
        "version": app_version,
        "catalogSource": "seeded",
        "sourceKind": "explicit_manifest",
        "packageHashDeclared": true,
        "manifestHashDeclared": true,
        "signatureDeclared": false,
        "declaredPackageHash": package_hash,
        "declaredManifestHash": manifest_hash,
        "actualPackageHash": fixture.package_hash,
        "actualManifestHash": fixture.manifest_hash,
        "packageHashMatched": package_hash_matched,
        "manifestHashMatched": manifest_hash_matched,
        "signaturePolicy": "optional",
        "signatureVerificationStatus": "not_configured",
        "packageVerificationStatus": if package_hash_matched && manifest_hash_matched { "verified" } else { "mismatch" },
        "status": if package_hash_matched && manifest_hash_matched { "warning" } else { "blocked" },
        "blockerCodes": if package_hash_matched && manifest_hash_matched { json!([]) } else { json!(["package_hash_mismatch"]) },
        "warningCodes": ["signature_missing"],
    });

    let Some(object) = state.as_object_mut() else {
        return state;
    };
    let setup = object.entry("setup").or_insert_with(|| json!({}));
    let Some(setup_object) = setup.as_object_mut() else {
        return state;
    };
    setup_object.insert("cloudReleaseEvidence".to_string(), evidence);
    state
}

fn resolve_seeded_plugin_fixture(state: &Value) -> Result<Option<SeededPluginFixture>, String> {
    let source_kind = read_json_string(state, &["identity", "sourceKind"]).unwrap_or_default();
    let source_uri = read_json_string(state, &["identity", "sourceUri"]).unwrap_or_default();
    if source_kind != "cloud_release" {
        return Ok(None);
    }

    let state_app_id = read_json_string(state, &["appId"])
        .or_else(|| read_json_string(state, &["identity", "appId"]))
        .unwrap_or_default();
    let state_version = read_json_string(state, &["identity", "appVersion"])
        .or_else(|| read_json_string(state, &["manifest", "version"]))
        .unwrap_or_default();
    let state_package_hash = read_json_string(state, &["identity", "packageHash"]);
    let state_manifest_hash = read_json_string(state, &["identity", "manifestHash"]);

    for fixture in load_seeded_plugin_fixtures()? {
        if state_app_id != fixture.app_id
            || state_version != fixture.version
            || source_uri != fixture.package_url
        {
            continue;
        }
        if state_package_hash.as_deref() != Some(fixture.package_hash.as_str())
            || state_manifest_hash.as_deref() != Some(fixture.manifest_hash.as_str())
        {
            continue;
        }
        return Ok(Some(fixture));
    }

    Ok(None)
}

fn load_seeded_plugin_fixtures() -> Result<Vec<SeededPluginFixture>, String> {
    let descriptor = read_seeded_plugins_descriptor()?;
    descriptor
        .apps
        .into_iter()
        .map(load_seeded_plugin_fixture)
        .collect()
}

fn seeded_plugin_fixture_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../..")
        .join("src/features/plugin/testing/fixtures")
}

fn read_seeded_plugins_descriptor() -> Result<SeededPluginsDescriptor, String> {
    let descriptor_path = seeded_plugin_fixture_root().join("seeded-plugins.json");
    let value = read_json_file(&descriptor_path)?;
    if read_json_string(&value, &["schemaVersion"]).as_deref() != Some("seeded-plugins/v1") {
        return Err(format!(
            "Seeded Plugin descriptor schemaVersion 不支持: {}",
            descriptor_path.display()
        ));
    }
    let apps_value = value.get("apps").and_then(Value::as_array).ok_or_else(|| {
        format!(
            "Seeded Plugin descriptor 缺少 apps: {}",
            descriptor_path.display()
        )
    })?;
    let mut apps = Vec::new();
    for app in apps_value {
        apps.push(parse_seeded_plugin_descriptor_entry(app, &descriptor_path)?);
    }
    Ok(SeededPluginsDescriptor { apps })
}

fn parse_seeded_plugin_descriptor_entry(
    value: &Value,
    descriptor_path: &Path,
) -> Result<SeededPluginDescriptorEntry, String> {
    let app_id = required_descriptor_string(value, descriptor_path, "appId")?;
    let version = required_descriptor_string(value, descriptor_path, "version")?;
    Ok(SeededPluginDescriptorEntry {
        app_id,
        version,
        manifest_path: required_descriptor_string(value, descriptor_path, "manifestPath")?,
        package_root: required_descriptor_string(value, descriptor_path, "packageRoot")?,
        package_url: required_descriptor_string(value, descriptor_path, "packageUrl")?,
        package_hash: required_descriptor_string(value, descriptor_path, "packageHash")?,
        manifest_hash: required_descriptor_string(value, descriptor_path, "manifestHash")?,
        worker_entrypoint: read_json_string(value, &["workerEntrypoint"]),
    })
}

fn required_descriptor_string(
    value: &Value,
    descriptor_path: &Path,
    key: &str,
) -> Result<String, String> {
    read_json_string(value, &[key]).ok_or_else(|| {
        format!(
            "Seeded Plugin descriptor 缺少 {key}: {}",
            descriptor_path.display()
        )
    })
}

fn load_seeded_plugin_fixture(
    descriptor: SeededPluginDescriptorEntry,
) -> Result<SeededPluginFixture, String> {
    let fixture_root = seeded_plugin_fixture_root();
    let fixture_dir = fixture_root.join(descriptor.package_root.trim_start_matches("./"));
    let package_json_path = fixture_dir.join("package.json");
    let plugin_manifest_path = fixture_dir.join("plugin.json");
    if !package_json_path.is_file() || !plugin_manifest_path.is_file() {
        return Err(format!(
            "Seeded Plugin package fixture 不完整: {}",
            fixture_dir.display()
        ));
    }

    let package_json = read_json_file(&package_json_path)?;
    let package_app_id = read_json_string(&package_json, &["name"]).ok_or_else(|| {
        format!(
            "Seeded Plugin package.json 缺少 name: {}",
            package_json_path.display()
        )
    })?;
    let package_version = read_json_string(&package_json, &["version"]).ok_or_else(|| {
        format!(
            "Seeded Plugin package.json 缺少 version: {}",
            package_json_path.display()
        )
    })?;
    if package_app_id != descriptor.app_id || package_version != descriptor.version {
        return Err(format!(
            "Seeded Plugin descriptor 与 package.json 不一致: {}",
            package_json_path.display()
        ));
    }
    let manifest_path = fixture_root.join(descriptor.manifest_path.trim_start_matches("./"));
    let manifest = read_json_file(&manifest_path)?;
    validate_fixture_manifest(
        &manifest,
        &manifest_path,
        &descriptor.app_id,
        &descriptor.version,
    )?;

    let worker_entrypoint = descriptor.worker_entrypoint.clone().or_else(|| {
        read_json_string(&manifest, &["runtimePackage", "worker", "entrypoint"])
            .or_else(|| read_json_string(&manifest, &["agentRuntime", "worker", "entrypoint"]))
    });
    if let Some(entrypoint) = worker_entrypoint.as_deref() {
        let worker_path = fixture_dir.join(entrypoint.trim_start_matches("./"));
        if !worker_path.is_file() {
            return Err(format!(
                "Seeded Plugin package fixture worker 不存在: {}",
                worker_path.display()
            ));
        }
    }

    Ok(SeededPluginFixture {
        fixture_dir,
        app_id: descriptor.app_id,
        version: descriptor.version,
        package_url: descriptor.package_url,
        package_hash: descriptor.package_hash,
        manifest_hash: descriptor.manifest_hash,
        worker_entrypoint,
    })
}

fn validate_fixture_manifest(
    manifest: &Value,
    manifest_path: &Path,
    app_id: &str,
    version: &str,
) -> Result<(), String> {
    let manifest_app_id = read_json_string(manifest, &["name"]).ok_or_else(|| {
        format!(
            "Seeded Plugin manifest 缺少 name: {}",
            manifest_path.display()
        )
    })?;
    let manifest_version = read_json_string(manifest, &["version"]).ok_or_else(|| {
        format!(
            "Seeded Plugin manifest 缺少 version: {}",
            manifest_path.display()
        )
    })?;
    if manifest_app_id != app_id || manifest_version != version {
        return Err(format!(
            "Seeded Plugin manifest 与 package.json 不一致: {}",
            manifest_path.display()
        ));
    }
    Ok(())
}

fn read_json_file(path: &Path) -> Result<Value, String> {
    let content = fs::read_to_string(path)
        .map_err(|error| format!("读取 JSON 文件失败 {}: {error}", path.display()))?;
    serde_json::from_str(&content)
        .map_err(|error| format!("解析 JSON 文件失败 {}: {error}", path.display()))
}

fn replace_directory_from_fixture(source: &Path, target: &Path) -> Result<(), String> {
    if target.exists() {
        fs::remove_dir_all(target)
            .map_err(|error| format!("清理 Plugin seeded package cache 失败: {error}"))?;
    }
    copy_directory_from_fixture(source, target)
}

fn copy_directory_from_fixture(source: &Path, target: &Path) -> Result<(), String> {
    fs::create_dir_all(target)
        .map_err(|error| format!("创建 Plugin seeded package cache 失败: {error}"))?;
    for entry in
        fs::read_dir(source).map_err(|error| format!("读取 Plugin seeded fixture 失败: {error}"))?
    {
        let entry =
            entry.map_err(|error| format!("读取 Plugin seeded fixture 条目失败: {error}"))?;
        let file_name = entry.file_name();
        let file_name_text = file_name.to_string_lossy();
        if matches!(
            file_name_text.as_ref(),
            ".git" | "node_modules" | ".local" | ".lime"
        ) {
            continue;
        }
        let source_path = entry.path();
        let target_path = target.join(file_name);
        let file_type = entry
            .file_type()
            .map_err(|error| format!("读取 Plugin seeded fixture 类型失败: {error}"))?;
        if file_type.is_dir() {
            copy_directory_from_fixture(&source_path, &target_path)?;
        } else if file_type.is_file() {
            if let Some(parent) = target_path.parent() {
                fs::create_dir_all(parent).map_err(|error| {
                    format!("创建 Plugin seeded package cache 父目录失败: {error}")
                })?;
            }
            fs::copy(&source_path, &target_path).map_err(|error| {
                format!(
                    "复制 Plugin seeded package 文件失败 {} -> {}: {error}",
                    source_path.display(),
                    target_path.display()
                )
            })?;
        }
    }
    Ok(())
}
