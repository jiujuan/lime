use super::archive::install_skill_zip_package_into_root;
use super::archive::read_skill_zip_package;
use crate::local_data_source::skills::common::parse_skill_package_app;
use crate::local_data_source::skills::common::skill_package_app_root;
use crate::local_data_source::skills::common::validate_skill_package_directory;
use app_server_protocol::SkillDownloadInstallParams;
use app_server_protocol::SkillDownloadInstallResponse;
use url::Url;

const MAX_SKILL_DOWNLOAD_BYTES: usize = 20 * 1024 * 1024;

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
        .timeout(std::time::Duration::from_secs(60))
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

pub(crate) async fn install_skill_from_download_url(
    params: SkillDownloadInstallParams,
) -> Result<SkillDownloadInstallResponse, String> {
    let app = parse_skill_package_app(&params.app)?;
    let skill_name = params.skill_name.trim();
    validate_skill_package_directory(skill_name)?;
    let bytes = download_skill_package_zip(&params.download_url).await?;
    let skills_root = skill_package_app_root(app)?;
    let result = install_skill_zip_package_into_root(
        &skills_root,
        skill_name,
        read_skill_zip_package(&bytes)?,
    )?;
    Ok(SkillDownloadInstallResponse {
        directory: result.directory,
        inspection: result.inspection,
    })
}
