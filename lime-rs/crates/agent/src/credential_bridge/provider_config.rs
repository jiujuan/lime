#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RuntimeProviderProtocol {
    ChatCompletions,
    Responses,
}

impl RuntimeProviderProtocol {
    pub fn uses_responses_api(self) -> bool {
        matches!(self, Self::Responses)
    }
}

/// Runtime provider 配置。
#[derive(Debug, Clone)]
pub struct RuntimeProviderConfig {
    /// Provider 名称 (openai, anthropic, google 等)
    pub provider_name: String,
    /// Provider 选择器（优先保留前端 provider_id / runtime_provider_type）
    pub provider_selector: Option<String>,
    /// 模型名称
    pub model_name: String,
    /// API Key
    pub api_key: Option<String>,
    /// Base URL
    pub base_url: Option<String>,
    /// 凭证 UUID（用于记录使用和健康状态）
    pub credential_uuid: String,
    /// 当前回合显式推理强度
    pub reasoning_effort: Option<String>,
    /// App Server RouteResolver 派生出的 provider 执行协议
    pub protocol: Option<RuntimeProviderProtocol>,
    /// 当前回合是否启用 toolshim
    pub toolshim: bool,
    /// toolshim 解释器模型
    pub toolshim_model: Option<String>,
}
