use hmac::{Hmac, Mac};
use sha2::Sha256;
use std::fmt;
use subtle::ConstantTimeEq;
use uuid::Uuid;

const TOKEN_PREFIX: &str = "lime-plugin";
const TOKEN_VERSION: &str = "v1";
pub const PLUGIN_RUNTIME_SCOPE_MODEL_GENERATION: &str = "model-generation";

type HmacSha256 = Hmac<Sha256>;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PluginRuntimeTokenClaims {
    pub app_id: String,
    pub expires_at_unix: i64,
    pub scope: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PluginRuntimeTokenError {
    EmptySecret,
    InvalidAppId,
    InvalidTtl,
    Malformed,
    UnsupportedVersion,
    UnsupportedScope,
    Expired,
    InvalidSignature,
}

impl fmt::Display for PluginRuntimeTokenError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let message = match self {
            Self::EmptySecret => "Plugin runtime token secret is empty",
            Self::InvalidAppId => "Plugin runtime token app id is invalid",
            Self::InvalidTtl => "Plugin runtime token ttl is invalid",
            Self::Malformed => "Plugin runtime token is malformed",
            Self::UnsupportedVersion => "Plugin runtime token version is unsupported",
            Self::UnsupportedScope => "Plugin runtime token scope is unsupported",
            Self::Expired => "Plugin runtime token is expired",
            Self::InvalidSignature => "Plugin runtime token signature is invalid",
        };
        formatter.write_str(message)
    }
}

impl std::error::Error for PluginRuntimeTokenError {}

pub fn issue_plugin_runtime_token(
    secret: &str,
    app_id: &str,
    ttl_secs: u64,
) -> Result<String, PluginRuntimeTokenError> {
    let now = chrono::Utc::now().timestamp();
    let ttl = i64::try_from(ttl_secs).map_err(|_| PluginRuntimeTokenError::InvalidTtl)?;
    issue_plugin_runtime_token_at(secret, app_id, now, ttl)
}

pub fn issue_plugin_runtime_token_at(
    secret: &str,
    app_id: &str,
    issued_at_unix: i64,
    ttl_secs: i64,
) -> Result<String, PluginRuntimeTokenError> {
    if ttl_secs <= 0 {
        return Err(PluginRuntimeTokenError::InvalidTtl);
    }
    let expires_at_unix = issued_at_unix
        .checked_add(ttl_secs)
        .ok_or(PluginRuntimeTokenError::InvalidTtl)?;
    let nonce = Uuid::new_v4().to_string();
    issue_plugin_runtime_token_with_nonce(secret, app_id, expires_at_unix, &nonce)
}

pub fn issue_plugin_runtime_token_with_nonce(
    secret: &str,
    app_id: &str,
    expires_at_unix: i64,
    nonce: &str,
) -> Result<String, PluginRuntimeTokenError> {
    issue_plugin_runtime_token_with_nonce_for_scope(
        secret,
        app_id,
        expires_at_unix,
        nonce,
        PLUGIN_RUNTIME_SCOPE_MODEL_GENERATION,
    )
}

fn issue_plugin_runtime_token_with_nonce_for_scope(
    secret: &str,
    app_id: &str,
    expires_at_unix: i64,
    nonce: &str,
    scope: &str,
) -> Result<String, PluginRuntimeTokenError> {
    ensure_secret(secret)?;
    ensure_safe_token_field(app_id).ok_or(PluginRuntimeTokenError::InvalidAppId)?;
    ensure_safe_token_field(nonce).ok_or(PluginRuntimeTokenError::Malformed)?;
    if scope != PLUGIN_RUNTIME_SCOPE_MODEL_GENERATION {
        return Err(PluginRuntimeTokenError::UnsupportedScope);
    }

    let signature = sign_token_parts(secret, app_id, expires_at_unix, nonce, scope)?;
    Ok(format!(
        "{TOKEN_PREFIX}:{TOKEN_VERSION}:{app_id}:{expires_at_unix}:{nonce}:{scope}:{signature}"
    ))
}

pub fn verify_plugin_runtime_token(
    secret: &str,
    token: &str,
) -> Result<PluginRuntimeTokenClaims, PluginRuntimeTokenError> {
    verify_plugin_runtime_token_at(secret, token, chrono::Utc::now().timestamp())
}

pub fn verify_plugin_runtime_token_for_scope(
    secret: &str,
    token: &str,
    expected_scope: &str,
) -> Result<PluginRuntimeTokenClaims, PluginRuntimeTokenError> {
    verify_plugin_runtime_token_at_for_scope(
        secret,
        token,
        chrono::Utc::now().timestamp(),
        expected_scope,
    )
}

pub fn verify_plugin_runtime_token_at(
    secret: &str,
    token: &str,
    now_unix: i64,
) -> Result<PluginRuntimeTokenClaims, PluginRuntimeTokenError> {
    verify_plugin_runtime_token_at_for_scope(
        secret,
        token,
        now_unix,
        PLUGIN_RUNTIME_SCOPE_MODEL_GENERATION,
    )
}

pub fn verify_plugin_runtime_token_at_for_scope(
    secret: &str,
    token: &str,
    now_unix: i64,
    expected_scope: &str,
) -> Result<PluginRuntimeTokenClaims, PluginRuntimeTokenError> {
    ensure_secret(secret)?;

    let parts: Vec<&str> = token.split(':').collect();
    if parts.len() != 7 || parts[0] != TOKEN_PREFIX {
        return Err(PluginRuntimeTokenError::Malformed);
    }
    if parts[1] != TOKEN_VERSION {
        return Err(PluginRuntimeTokenError::UnsupportedVersion);
    }

    let app_id = parts[2];
    let expires_at_unix = parts[3]
        .parse::<i64>()
        .map_err(|_| PluginRuntimeTokenError::Malformed)?;
    let nonce = parts[4];
    let scope = parts[5];
    let signature = parts[6];

    ensure_safe_token_field(app_id).ok_or(PluginRuntimeTokenError::InvalidAppId)?;
    ensure_safe_token_field(nonce).ok_or(PluginRuntimeTokenError::Malformed)?;
    if scope != expected_scope || scope != PLUGIN_RUNTIME_SCOPE_MODEL_GENERATION {
        return Err(PluginRuntimeTokenError::UnsupportedScope);
    }
    if expires_at_unix <= now_unix {
        return Err(PluginRuntimeTokenError::Expired);
    }

    let expected = sign_token_parts(secret, app_id, expires_at_unix, nonce, scope)?;
    if signature.len() != expected.len()
        || !bool::from(signature.as_bytes().ct_eq(expected.as_bytes()))
    {
        return Err(PluginRuntimeTokenError::InvalidSignature);
    }

    Ok(PluginRuntimeTokenClaims {
        app_id: app_id.to_string(),
        expires_at_unix,
        scope: scope.to_string(),
    })
}

pub fn is_plugin_runtime_token(token: &str) -> bool {
    token.starts_with(&format!("{TOKEN_PREFIX}:"))
}

fn ensure_secret(secret: &str) -> Result<(), PluginRuntimeTokenError> {
    if secret.trim().is_empty() {
        return Err(PluginRuntimeTokenError::EmptySecret);
    }
    Ok(())
}

fn ensure_safe_token_field(value: &str) -> Option<()> {
    if value.is_empty()
        || !value
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '-'))
    {
        return None;
    }
    Some(())
}

fn sign_token_parts(
    secret: &str,
    app_id: &str,
    expires_at_unix: i64,
    nonce: &str,
    scope: &str,
) -> Result<String, PluginRuntimeTokenError> {
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes())
        .map_err(|_| PluginRuntimeTokenError::EmptySecret)?;
    mac.update(
        format!("{TOKEN_VERSION}\n{app_id}\n{expires_at_unix}\n{nonce}\n{scope}").as_bytes(),
    );
    Ok(hex_encode(&mac.finalize().into_bytes()))
}

fn hex_encode(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        output.push(HEX[(byte >> 4) as usize] as char);
        output.push(HEX[(byte & 0x0f) as usize] as char);
    }
    output
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn issued_plugin_runtime_token_verifies_claims() {
        let token = issue_plugin_runtime_token_with_nonce(
            "server-secret",
            "content-factory-app",
            1_800,
            "nonce-1",
        )
        .unwrap();

        assert!(is_plugin_runtime_token(&token));
        assert_ne!(token, "server-secret");

        let claims = verify_plugin_runtime_token_at("server-secret", &token, 1_000).unwrap();
        assert_eq!(claims.app_id, "content-factory-app");
        assert_eq!(claims.expires_at_unix, 1_800);
        assert_eq!(claims.scope, PLUGIN_RUNTIME_SCOPE_MODEL_GENERATION);
    }

    #[test]
    fn token_rejects_tampering_and_wrong_secret() {
        let token = issue_plugin_runtime_token_with_nonce(
            "server-secret",
            "content-factory-app",
            1_800,
            "nonce-1",
        )
        .unwrap();
        let tampered = token.replace("content-factory-app", "other-app");

        assert_eq!(
            verify_plugin_runtime_token_at("server-secret", &tampered, 1_000).unwrap_err(),
            PluginRuntimeTokenError::InvalidSignature
        );
        assert_eq!(
            verify_plugin_runtime_token_at("other-secret", &token, 1_000).unwrap_err(),
            PluginRuntimeTokenError::InvalidSignature
        );
    }

    #[test]
    fn token_rejects_expired_or_malformed_values() {
        let token = issue_plugin_runtime_token_with_nonce(
            "server-secret",
            "content-factory-app",
            1_800,
            "nonce-1",
        )
        .unwrap();

        assert_eq!(
            verify_plugin_runtime_token_at("server-secret", &token, 1_801).unwrap_err(),
            PluginRuntimeTokenError::Expired
        );
        assert_eq!(
            issue_plugin_runtime_token_with_nonce("server-secret", "bad:app", 1_800, "nonce")
                .unwrap_err(),
            PluginRuntimeTokenError::InvalidAppId
        );
    }

    #[test]
    fn token_rejects_unsupported_scope() {
        assert_eq!(
            issue_plugin_runtime_token_with_nonce_for_scope(
                "server-secret",
                "content-factory-app",
                1_800,
                "nonce-1",
                "gateway",
            )
            .unwrap_err(),
            PluginRuntimeTokenError::UnsupportedScope
        );

        let token = issue_plugin_runtime_token_with_nonce(
            "server-secret",
            "content-factory-app",
            1_800,
            "nonce-1",
        )
        .unwrap();

        assert_eq!(
            verify_plugin_runtime_token_at_for_scope("server-secret", &token, 1_000, "gateway",)
                .unwrap_err(),
            PluginRuntimeTokenError::UnsupportedScope
        );
    }
}
