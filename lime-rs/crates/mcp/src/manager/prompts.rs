use super::McpClientManager;
use crate::types::*;
use tracing::{debug, error, info, warn};

impl McpClientManager {
    // ========================================================================
    // 提示词管理方法
    // ========================================================================

    /// 获取所有提示词
    ///
    /// 从所有运行中的服务器获取提示词定义。
    ///
    /// # Returns
    ///
    /// 返回所有可用提示词的定义列表。
    ///
    /// # 实现步骤（Task 4.4）
    ///
    /// 1. 遍历所有运行中的服务器
    /// 2. 检查服务器是否支持提示词
    /// 3. 调用 list_all_prompts 获取提示词列表
    /// 4. 转换为 McpPromptDefinition 格式
    /// 5. 返回合并后的提示词列表
    pub async fn list_prompts(&self) -> Result<Vec<McpPromptDefinition>, McpError> {
        info!("获取所有 MCP 提示词");

        let mut all_prompts: Vec<McpPromptDefinition> = Vec::new();
        let clients = self.clients.read().await;

        for (server_name, wrapper) in clients.iter() {
            // 检查服务器是否支持提示词
            if let Some(ref info) = wrapper.server_info {
                if !info.supports_prompts {
                    debug!(server_name = %server_name, "服务器不支持提示词，跳过");
                    continue;
                }
            }

            // 获取 rmcp 服务
            let service = match wrapper.running_service() {
                Some(s) => s,
                None => {
                    warn!(server_name = %server_name, "服务器无运行服务，跳过");
                    continue;
                }
            };

            // 调用 list_all_prompts 获取所有提示词
            match service.list_all_prompts().await {
                Ok(prompts) => {
                    debug!(
                        server_name = %server_name,
                        prompt_count = prompts.len(),
                        "获取服务器提示词列表成功"
                    );
                    for prompt in prompts {
                        all_prompts.push(Self::convert_prompt_to_definition(
                            prompt,
                            server_name.clone(),
                        ));
                    }
                }
                Err(e) => {
                    warn!(
                        server_name = %server_name,
                        error = %e,
                        "获取服务器提示词列表失败"
                    );
                    // 继续处理其他服务器，不中断
                }
            }
        }

        info!(prompt_count = all_prompts.len(), "提示词列表已获取");
        Ok(all_prompts)
    }

    /// 将 rmcp Prompt 转换为 McpPromptDefinition
    pub(super) fn convert_prompt_to_definition(
        prompt: rmcp::model::Prompt,
        server_name: String,
    ) -> McpPromptDefinition {
        let arguments = prompt
            .arguments
            .unwrap_or_default()
            .into_iter()
            .map(|arg| McpPromptArgument {
                name: arg.name,
                description: arg.description,
                required: arg.required.unwrap_or(false),
            })
            .collect();

        McpPromptDefinition {
            name: prompt.name.to_string(),
            description: prompt.description.map(|s| s.to_string()),
            arguments,
            server_name,
        }
    }

    /// 获取提示词内容
    ///
    /// # Arguments
    ///
    /// * `name` - 提示词名称（可能包含服务器前缀，格式为 "server_promptname"）
    /// * `arguments` - 提示词参数
    ///
    /// # Returns
    ///
    /// 返回提示词内容，包含描述和消息列表。
    ///
    /// # 实现步骤（Task 4.4）
    ///
    /// 1. 解析提示词名称，确定目标服务器
    /// 2. 验证必需参数是否提供
    /// 3. 调用服务器的 get_prompt 方法
    /// 4. 转换结果为 McpPromptResult
    /// 5. 返回结果
    pub async fn get_prompt(
        &self,
        name: &str,
        arguments: serde_json::Map<String, serde_json::Value>,
    ) -> Result<McpPromptResult, McpError> {
        info!(prompt_name = %name, "获取 MCP 提示词内容");

        // 1. 解析提示词名称，确定目标服务器和实际提示词名
        let (server_name, actual_prompt_name) = self.resolve_prompt_target(name).await?;

        debug!(
            prompt_name = %name,
            server_name = %server_name,
            actual_prompt_name = %actual_prompt_name,
            "解析提示词目标"
        );

        // 2. 获取目标服务器的客户端
        let clients = self.clients.read().await;
        let wrapper = clients
            .get(&server_name)
            .ok_or_else(|| McpError::ServerNotRunning(server_name.clone()))?;

        let service = wrapper
            .running_service()
            .ok_or_else(|| McpError::ServerNotRunning(server_name.clone()))?;

        // 3. 构建 get_prompt 请求参数
        let args: Option<serde_json::Map<String, serde_json::Value>> = if arguments.is_empty() {
            None
        } else {
            Some(arguments)
        };

        let get_prompt_param = rmcp::model::GetPromptRequestParam {
            name: actual_prompt_name.clone(),
            arguments: args,
        };

        // 4. 调用 get_prompt
        let result = service.get_prompt(get_prompt_param).await.map_err(|e| {
            error!(
                prompt_name = %actual_prompt_name,
                server_name = %server_name,
                error = %e,
                "获取提示词失败"
            );
            McpError::ToolCallFailed(format!("获取提示词失败: {e}"))
        })?;

        // 5. 转换结果为 McpPromptResult
        let mcp_result = Self::convert_get_prompt_result(result);

        info!(
            prompt_name = %actual_prompt_name,
            server_name = %server_name,
            message_count = mcp_result.messages.len(),
            "提示词获取完成"
        );

        Ok(mcp_result)
    }

    /// 解析提示词目标（服务器名称和实际提示词名）
    ///
    /// # Arguments
    ///
    /// * `prompt_name` - 提示词名称（可能包含服务器前缀，格式为 "server_promptname"）
    ///
    /// # Returns
    ///
    /// 返回 (服务器名称, 实际提示词名) 元组。
    async fn resolve_prompt_target(&self, prompt_name: &str) -> Result<(String, String), McpError> {
        let clients = self.clients.read().await;

        // 尝试解析带前缀的提示词名（格式：server_promptname）
        if let Some(underscore_pos) = prompt_name.find('_') {
            let potential_server = &prompt_name[..underscore_pos];
            let potential_prompt = &prompt_name[underscore_pos + 1..];

            // 检查是否存在该服务器
            if clients.contains_key(potential_server) && !potential_prompt.is_empty() {
                return Ok((potential_server.to_string(), potential_prompt.to_string()));
            }
        }

        // 没有前缀或前缀不匹配，在所有服务器中查找该提示词
        for (server_name, wrapper) in clients.iter() {
            if let Some(service) = wrapper.running_service() {
                // 尝试获取提示词列表并查找
                if let Ok(prompts) = service.list_all_prompts().await {
                    if prompts.iter().any(|p| p.name.as_str() == prompt_name) {
                        return Ok((server_name.clone(), prompt_name.to_string()));
                    }
                }
            }
        }

        // 提示词未找到
        Err(McpError::ToolNotFound(format!(
            "提示词不存在: {prompt_name}"
        )))
    }

    /// 转换 rmcp GetPromptResult 为 McpPromptResult
    pub(super) fn convert_get_prompt_result(
        result: rmcp::model::GetPromptResult,
    ) -> McpPromptResult {
        let messages: Vec<McpPromptMessage> = result
            .messages
            .into_iter()
            .map(Self::convert_prompt_message)
            .collect();

        McpPromptResult {
            description: result.description.map(|s| s.to_string()),
            messages,
        }
    }

    /// 转换 rmcp PromptMessage 为 McpPromptMessage
    pub(super) fn convert_prompt_message(msg: rmcp::model::PromptMessage) -> McpPromptMessage {
        let role = match msg.role {
            rmcp::model::PromptMessageRole::User => "user".to_string(),
            rmcp::model::PromptMessageRole::Assistant => "assistant".to_string(),
        };

        let content = Self::convert_prompt_message_content(msg.content);

        McpPromptMessage { role, content }
    }

    /// 转换 rmcp PromptMessageContent 为 McpContent
    pub(super) fn convert_prompt_message_content(
        content: rmcp::model::PromptMessageContent,
    ) -> McpContent {
        match content {
            rmcp::model::PromptMessageContent::Text { text } => McpContent::Text { text },
            rmcp::model::PromptMessageContent::Image { image } => McpContent::Image {
                data: image.data.clone(),
                mime_type: image.mime_type.clone(),
            },
            rmcp::model::PromptMessageContent::Resource { resource } => {
                let (uri, text, blob) = match &resource.resource {
                    rmcp::model::ResourceContents::TextResourceContents { uri, text, .. } => {
                        (uri.clone(), Some(text.clone()), None)
                    }
                    rmcp::model::ResourceContents::BlobResourceContents { uri, blob, .. } => {
                        (uri.clone(), None, Some(blob.clone()))
                    }
                };
                McpContent::Resource { uri, text, blob }
            }
            rmcp::model::PromptMessageContent::ResourceLink { link } => McpContent::Resource {
                uri: link.uri.clone(),
                text: Some(link.name.clone()),
                blob: None,
            },
        }
    }
}
