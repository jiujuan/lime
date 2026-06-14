use super::api;
use super::types::{
    MessageItem, MessageItemType, MessageState, MessageType, SendMessageReq, WechatMessage,
};
use std::fs;
use std::path::PathBuf;
use uuid::Uuid;

pub fn resolve_channel_data_dir() -> Result<PathBuf, String> {
    let root = dirs::data_dir()
        .or_else(dirs::home_dir)
        .ok_or_else(|| "无法解析微信渠道数据目录".to_string())?;
    let path = root.join("lime").join("channels").join("wechat");
    fs::create_dir_all(&path).map_err(|e| format!("创建微信渠道目录失败: {e}"))?;
    Ok(path)
}

pub fn resolve_account_data_dir(account_id: &str) -> Result<PathBuf, String> {
    let path = resolve_channel_data_dir()?
        .join("accounts")
        .join(account_id);
    fs::create_dir_all(&path).map_err(|e| format!("创建微信账号目录失败: {e}"))?;
    Ok(path)
}

pub fn purge_account_data(account_id: &str) -> Result<(), String> {
    let path = resolve_channel_data_dir()?
        .join("accounts")
        .join(account_id);
    if path.exists() {
        fs::remove_dir_all(path).map_err(|e| format!("删除微信账号目录失败: {e}"))?;
    }
    Ok(())
}

fn media_item_type(item: &MessageItem) -> Option<MessageItemType> {
    match item.r#type {
        Some(value) if value == MessageItemType::Text as i32 => Some(MessageItemType::Text),
        Some(value) if value == MessageItemType::Image as i32 => Some(MessageItemType::Image),
        Some(value) if value == MessageItemType::Voice as i32 => Some(MessageItemType::Voice),
        Some(value) if value == MessageItemType::File as i32 => Some(MessageItemType::File),
        Some(value) if value == MessageItemType::Video as i32 => Some(MessageItemType::Video),
        _ => None,
    }
}

pub fn body_from_item_list(item_list: Option<&[MessageItem]>) -> String {
    let Some(item_list) = item_list else {
        return String::new();
    };

    for item in item_list {
        match media_item_type(item) {
            Some(MessageItemType::Text) => {
                let text = item
                    .text_item
                    .as_ref()
                    .and_then(|value| value.text.as_deref())
                    .unwrap_or("")
                    .to_string();
                if text.is_empty() {
                    continue;
                }
                if let Some(ref_msg) = item.ref_msg.as_ref() {
                    let mut parts = Vec::new();
                    if let Some(title) = ref_msg.title.as_deref() {
                        if !title.trim().is_empty() {
                            parts.push(title.trim().to_string());
                        }
                    }
                    if let Some(message_item) = ref_msg.message_item.as_deref() {
                        let body = body_from_item_list(Some(std::slice::from_ref(message_item)));
                        if !body.trim().is_empty() {
                            parts.push(body);
                        }
                    }
                    if !parts.is_empty() {
                        return format!("[引用: {}]\n{text}", parts.join(" | "));
                    }
                }
                return text;
            }
            Some(MessageItemType::Voice) => {
                if let Some(text) = item
                    .voice_item
                    .as_ref()
                    .and_then(|value| value.text.as_deref())
                    .filter(|value| !value.trim().is_empty())
                {
                    return text.to_string();
                }
            }
            _ => {}
        }
    }

    String::new()
}

pub fn find_media_item(item_list: Option<&[MessageItem]>) -> Option<MessageItem> {
    let item_list = item_list?;
    for target in [
        MessageItemType::Image,
        MessageItemType::Video,
        MessageItemType::File,
        MessageItemType::Voice,
    ] {
        if let Some(item) = item_list.iter().find(|item| {
            media_item_type(item) == Some(target)
                && match target {
                    MessageItemType::Image => item
                        .image_item
                        .as_ref()
                        .and_then(|value| value.media.as_ref())
                        .and_then(|value| value.encrypt_query_param.as_deref())
                        .is_some(),
                    MessageItemType::Video => item
                        .video_item
                        .as_ref()
                        .and_then(|value| value.media.as_ref())
                        .and_then(|value| value.encrypt_query_param.as_deref())
                        .is_some(),
                    MessageItemType::File => item
                        .file_item
                        .as_ref()
                        .and_then(|value| value.media.as_ref())
                        .and_then(|value| value.encrypt_query_param.as_deref())
                        .is_some(),
                    MessageItemType::Voice => item
                        .voice_item
                        .as_ref()
                        .and_then(|value| value.media.as_ref())
                        .and_then(|value| value.encrypt_query_param.as_deref())
                        .is_some(),
                    MessageItemType::Text => false,
                }
        }) {
            return Some(item.clone());
        }
    }
    None
}

fn build_text_message(to_user_id: &str, text: &str, context_token: Option<&str>) -> SendMessageReq {
    SendMessageReq {
        msg: WechatMessage {
            from_user_id: Some(String::new()),
            to_user_id: Some(to_user_id.to_string()),
            client_id: Some(Uuid::new_v4().to_string()),
            message_type: Some(MessageType::Bot as i32),
            message_state: Some(MessageState::Finish as i32),
            item_list: Some(vec![MessageItem {
                r#type: Some(MessageItemType::Text as i32),
                text_item: Some(super::types::TextItem {
                    text: Some(text.to_string()),
                }),
                ..MessageItem::default()
            }]),
            context_token: context_token.map(|value| value.to_string()),
            ..WechatMessage::default()
        },
    }
}

pub async fn send_text_message(
    client: &reqwest::Client,
    base_url: &str,
    token: &str,
    to_user_id: &str,
    text: &str,
    context_token: Option<&str>,
) -> Result<(), String> {
    let text = text.trim();
    if text.is_empty() {
        return Ok(());
    }
    api::send_message(
        client,
        base_url,
        token,
        build_text_message(to_user_id, text, context_token),
    )
    .await
}
