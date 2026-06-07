//! 电商差评回复 Skill
//!
//! 实现电商差评自动回复功能,支持淘宝、京东、拼多多等平台

use serde::{Deserialize, Serialize};

/// 电商平台类型
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EcommercePlatform {
    /// 淘宝/天猫
    Taobao,
    /// 京东
    JD,
    /// 拼多多
    Pinduoduo,
}

impl EcommercePlatform {
    /// 获取平台名称
    pub fn name(&self) -> &str {
        match self {
            EcommercePlatform::Taobao => "淘宝",
            EcommercePlatform::JD => "京东",
            EcommercePlatform::Pinduoduo => "拼多多",
        }
    }

    /// 获取平台的回复风格特点
    pub fn reply_style(&self) -> &str {
        match self {
            EcommercePlatform::Taobao => "亲切、友好、注重客户体验",
            EcommercePlatform::JD => "专业、高效、强调服务保障",
            EcommercePlatform::Pinduoduo => "热情、实惠、突出性价比",
        }
    }
}

/// 回复配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReplyConfig {
    /// 回复语气: polite(礼貌), sincere(真诚), professional(专业)
    pub tone: String,
    /// 回复长度: short(简短), medium(中等), long(详细)
    pub length: String,
    /// 回复模板类型
    pub template: Option<String>,
}

impl Default for ReplyConfig {
    fn default() -> Self {
        Self {
            tone: "sincere".to_string(),
            length: "medium".to_string(),
            template: None,
        }
    }
}

/// 电商差评回复请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EcommerceReviewReplyRequest {
    /// 电商平台
    pub platform: EcommercePlatform,
    /// 差评链接
    pub review_url: String,
    /// 回复配置
    pub config: ReplyConfig,
}

/// 电商差评回复结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EcommerceReviewReplyResult {
    /// 是否成功
    pub success: bool,
    /// 提取的差评内容
    pub review_content: Option<String>,
    /// 识别的问题类型
    pub problem_type: Option<String>,
    /// 生成的回复
    pub reply: Option<String>,
    /// 错误信息
    pub error: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_platform_name() {
        assert_eq!(EcommercePlatform::Taobao.name(), "淘宝");
        assert_eq!(EcommercePlatform::JD.name(), "京东");
        assert_eq!(EcommercePlatform::Pinduoduo.name(), "拼多多");
    }

    #[test]
    fn test_reply_style() {
        assert!(EcommercePlatform::Taobao.reply_style().contains("亲切"));
        assert!(EcommercePlatform::JD.reply_style().contains("专业"));
        assert!(EcommercePlatform::Pinduoduo.reply_style().contains("热情"));
    }

    #[test]
    fn test_reply_config_default() {
        let config = ReplyConfig::default();
        assert_eq!(config.tone, "sincere");
        assert_eq!(config.length, "medium");
        assert!(config.template.is_none());
    }

    #[test]
    fn test_platform_serialization() {
        let platform = EcommercePlatform::Taobao;
        let json = serde_json::to_string(&platform).unwrap();
        assert_eq!(json, "\"taobao\"");

        let deserialized: EcommercePlatform = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, EcommercePlatform::Taobao);
    }
}
