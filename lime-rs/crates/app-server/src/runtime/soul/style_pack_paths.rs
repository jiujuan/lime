use lime_core::app_paths;
use std::path::PathBuf;

pub(super) const STYLE_PACK_DATA_DIR: &str = "soul/style-packs";
pub(super) const REGISTRY_FILE_NAME: &str = "registry.json";
pub(super) const REQUIRED_LOCALES: [&str; 5] = ["zh-CN", "zh-TW", "en-US", "ja-JP", "ko-KR"];

pub(crate) fn style_pack_data_root() -> Result<PathBuf, String> {
    Ok(app_paths::preferred_data_dir()?.join(STYLE_PACK_DATA_DIR))
}

pub(super) fn validate_storage_id(id: &str) -> Result<(), String> {
    if !id.is_empty()
        && id
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '-'))
    {
        return Ok(());
    }
    Err(format!("Soul Style Pack id 不安全: {id}"))
}
