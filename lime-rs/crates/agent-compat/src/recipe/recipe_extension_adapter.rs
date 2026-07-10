use crate::agents::extension::{Envs, ExtensionConfig};
use rmcp::model::Tool;
use serde::de::Deserializer;
use serde::Deserialize;
use std::collections::HashMap;

#[derive(Deserialize)]
#[serde(tag = "type")]
enum RecipeExtensionConfigInternal {
    #[serde(rename = "stdio")]
    Stdio {
        name: String,
        #[serde(default)]
        description: Option<String>,
        cmd: String,
        args: Vec<String>,
        #[serde(default)]
        envs: Envs,
        #[serde(default)]
        env_keys: Vec<String>,
        timeout: Option<u64>,
        #[serde(default)]
        bundled: Option<bool>,
        #[serde(default)]
        available_tools: Vec<String>,
        #[serde(default)]
        deferred_loading: bool,
        #[serde(default)]
        always_expose_tools: Vec<String>,
        #[serde(default)]
        allowed_caller: Option<String>,
    },
    #[serde(rename = "builtin")]
    Builtin {
        name: String,
        #[serde(default)]
        description: Option<String>,
        display_name: Option<String>,
        timeout: Option<u64>,
        #[serde(default)]
        bundled: Option<bool>,
        #[serde(default)]
        available_tools: Vec<String>,
        #[serde(default)]
        deferred_loading: bool,
        #[serde(default)]
        always_expose_tools: Vec<String>,
        #[serde(default)]
        allowed_caller: Option<String>,
    },
    #[serde(rename = "platform")]
    Platform {
        name: String,
        #[serde(default)]
        description: Option<String>,
        #[serde(default)]
        bundled: Option<bool>,
        #[serde(default)]
        available_tools: Vec<String>,
        #[serde(default)]
        deferred_loading: bool,
        #[serde(default)]
        always_expose_tools: Vec<String>,
        #[serde(default)]
        allowed_caller: Option<String>,
    },
    #[serde(rename = "streamable_http")]
    StreamableHttp {
        name: String,
        #[serde(default)]
        description: Option<String>,
        uri: String,
        #[serde(default)]
        envs: Envs,
        #[serde(default)]
        env_keys: Vec<String>,
        #[serde(default)]
        headers: HashMap<String, String>,
        timeout: Option<u64>,
        #[serde(default)]
        bundled: Option<bool>,
        #[serde(default)]
        available_tools: Vec<String>,
        #[serde(default)]
        deferred_loading: bool,
        #[serde(default)]
        always_expose_tools: Vec<String>,
        #[serde(default)]
        allowed_caller: Option<String>,
    },
    #[serde(rename = "frontend")]
    Frontend {
        name: String,
        #[serde(default)]
        description: Option<String>,
        tools: Vec<Tool>,
        instructions: Option<String>,
        #[serde(default)]
        bundled: Option<bool>,
        #[serde(default)]
        available_tools: Vec<String>,
        #[serde(default)]
        deferred_loading: bool,
        #[serde(default)]
        always_expose_tools: Vec<String>,
        #[serde(default)]
        allowed_caller: Option<String>,
    },
    #[serde(rename = "inline_python")]
    InlinePython {
        name: String,
        #[serde(default)]
        description: Option<String>,
        code: String,
        timeout: Option<u64>,
        #[serde(default)]
        dependencies: Option<Vec<String>>,
        #[serde(default)]
        available_tools: Vec<String>,
        #[serde(default)]
        deferred_loading: bool,
        #[serde(default)]
        always_expose_tools: Vec<String>,
        #[serde(default)]
        allowed_caller: Option<String>,
    },
}

macro_rules! map_recipe_extensions {
    ($value:expr; $( $variant:ident { $( $field:ident ),* $(,)? } ),+ $(,)?) => {{
        match $value {
            $(
                RecipeExtensionConfigInternal::$variant {
                    name,
                    description,
                    $( $field ),*
                } => ExtensionConfig::$variant {
                    name,
                    description: description.unwrap_or_default(),
                    $( $field ),*
                },
            )+
        }
    }};
}

impl From<RecipeExtensionConfigInternal> for ExtensionConfig {
    fn from(internal_variant: RecipeExtensionConfigInternal) -> Self {
        map_recipe_extensions!(
        internal_variant;
            Stdio {
                cmd,
                args,
                envs,
                env_keys,
                timeout,
                bundled,
                available_tools,
                deferred_loading,
                always_expose_tools,
                allowed_caller
            },
            Builtin {
                display_name,
                timeout,
                bundled,
                available_tools,
                deferred_loading,
                always_expose_tools,
                allowed_caller
            },
            Platform {
                bundled,
                available_tools,
                deferred_loading,
                always_expose_tools,
                allowed_caller
            },
            StreamableHttp {
                uri,
                envs,
                env_keys,
                headers,
                timeout,
                bundled,
                available_tools,
                deferred_loading,
                always_expose_tools,
                allowed_caller
            },
            Frontend {
                tools,
                instructions,
                bundled,
                available_tools,
                deferred_loading,
                always_expose_tools,
                allowed_caller
            },
            InlinePython {
                code,
                timeout,
                dependencies,
                available_tools,
                deferred_loading,
                always_expose_tools,
                allowed_caller
            }
        )
    }
}

pub fn deserialize_recipe_extensions<'de, D>(
    deserializer: D,
) -> Result<Option<Vec<ExtensionConfig>>, D::Error>
where
    D: Deserializer<'de>,
{
    let remotes = Option::<Vec<RecipeExtensionConfigInternal>>::deserialize(deserializer)?;
    Ok(remotes.map(|items| items.into_iter().map(ExtensionConfig::from).collect()))
}
