use crate::sha256_hex;
use crate::sidecar_binary_name_for_platform;
use std::fs;
use std::path::Path;
use std::path::PathBuf;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExecutableIdentity {
    pub sha256: String,
}

pub fn managed_sidecar_binary_path(base_dir: &Path, platform: &str, arch: &str) -> PathBuf {
    base_dir
        .join("app-server")
        .join(crate::platform_key(platform, arch))
        .join(sidecar_binary_name_for_platform(platform))
}

pub fn executable_identity(path: &Path) -> std::io::Result<ExecutableIdentity> {
    let bytes = fs::read(path)?;
    Ok(executable_identity_from_bytes(&bytes))
}

pub fn executable_identity_from_bytes(bytes: &[u8]) -> ExecutableIdentity {
    ExecutableIdentity {
        sha256: sha256_hex(bytes),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn managed_sidecar_binary_path_uses_platform_layout() {
        assert_eq!(
            managed_sidecar_binary_path(Path::new("/app/resources"), "darwin", "arm64"),
            PathBuf::from("/app/resources")
                .join("app-server")
                .join("darwin-arm64")
                .join("app-server")
        );
        assert_eq!(
            managed_sidecar_binary_path(Path::new("/app/resources"), "windows", "x86_64"),
            PathBuf::from("/app/resources")
                .join("app-server")
                .join("win32-x64")
                .join("app-server.exe")
        );
    }

    #[test]
    fn executable_identity_is_sha256_of_binary_bytes() {
        assert_eq!(
            executable_identity_from_bytes(b"app-server").sha256,
            sha256_hex(b"app-server")
        );
        assert_ne!(
            executable_identity_from_bytes(b"app-server").sha256,
            executable_identity_from_bytes(b"other").sha256
        );
    }
}
