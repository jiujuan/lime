use super::McpClientManager;
use crate::types::*;
use tracing::{debug, error, info, warn};

impl McpClientManager {
    // ========================================================================
    // 资源管理方法
    // ========================================================================

    /// 获取所有资源
    ///
    /// 从所有运行中的服务器获取资源定义。
    ///
    /// # Returns
    ///
    /// 返回所有可用资源的定义列表。
    ///
    /// # 实现步骤（Task 4.5）
    ///
    /// 1. 遍历所有运行中的服务器
    /// 2. 检查服务器是否支持资源
    /// 3. 调用 list_all_resources 获取资源列表
    /// 4. 转换为 McpResourceDefinition 格式
    /// 5. 返回合并后的资源列表
    pub async fn list_resources(&self) -> Result<Vec<McpResourceDefinition>, McpError> {
        info!("获取所有 MCP 资源");

        let mut all_resources: Vec<McpResourceDefinition> = Vec::new();
        let clients = self.clients.read().await;

        for (server_name, wrapper) in clients.iter() {
            // 检查服务器是否支持资源
            if let Some(ref info) = wrapper.server_info {
                if !info.supports_resources {
                    debug!(server_name = %server_name, "服务器不支持资源，跳过");
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

            // 调用 list_all_resources 获取所有资源
            match service.list_all_resources().await {
                Ok(resources) => {
                    debug!(
                        server_name = %server_name,
                        resource_count = resources.len(),
                        "获取服务器资源列表成功"
                    );
                    for resource in resources {
                        all_resources.push(Self::convert_resource_to_definition(
                            resource,
                            server_name.clone(),
                        ));
                    }
                }
                Err(e) => {
                    warn!(
                        server_name = %server_name,
                        error = %e,
                        "获取服务器资源列表失败"
                    );
                    // 继续处理其他服务器，不中断
                }
            }
        }

        info!(resource_count = all_resources.len(), "资源列表已获取");
        Ok(all_resources)
    }

    /// 获取所有资源模板。
    pub async fn list_resource_templates(
        &self,
    ) -> Result<Vec<McpResourceTemplateDefinition>, McpError> {
        info!("获取所有 MCP 资源模板");

        let mut all_templates: Vec<McpResourceTemplateDefinition> = Vec::new();
        let clients = self.clients.read().await;

        for (server_name, wrapper) in clients.iter() {
            if let Some(ref info) = wrapper.server_info {
                if !info.supports_resources {
                    debug!(server_name = %server_name, "服务器不支持资源，跳过资源模板");
                    continue;
                }
            }

            let service = match wrapper.running_service() {
                Some(service) => service,
                None => {
                    warn!(server_name = %server_name, "服务器无运行服务，跳过资源模板");
                    continue;
                }
            };

            match service.list_all_resource_templates().await {
                Ok(templates) => {
                    debug!(
                        server_name = %server_name,
                        template_count = templates.len(),
                        "获取服务器资源模板列表成功"
                    );
                    for template in templates {
                        all_templates.push(Self::convert_resource_template_to_definition(
                            template,
                            server_name.clone(),
                        ));
                    }
                }
                Err(error) => {
                    warn!(
                        server_name = %server_name,
                        error = %error,
                        "获取服务器资源模板列表失败"
                    );
                }
            }
        }

        info!(template_count = all_templates.len(), "资源模板列表已获取");
        Ok(all_templates)
    }

    /// 将 rmcp Resource 转换为 McpResourceDefinition
    pub(super) fn convert_resource_to_definition(
        resource: rmcp::model::Resource,
        server_name: String,
    ) -> McpResourceDefinition {
        McpResourceDefinition {
            uri: resource.uri.clone(),
            name: resource.name.clone(),
            description: resource.description.clone(),
            mime_type: resource.mime_type.clone(),
            server_name,
        }
    }

    /// 将 rmcp ResourceTemplate 转换为 McpResourceTemplateDefinition
    pub(super) fn convert_resource_template_to_definition(
        template: rmcp::model::ResourceTemplate,
        server_name: String,
    ) -> McpResourceTemplateDefinition {
        McpResourceTemplateDefinition {
            uri_template: template.uri_template.clone(),
            name: template.name.clone(),
            title: template.title.clone(),
            description: template.description.clone(),
            mime_type: template.mime_type.clone(),
            server_name,
        }
    }

    /// 读取资源内容
    ///
    /// # Arguments
    ///
    /// * `uri` - 资源 URI
    ///
    /// # Returns
    ///
    /// 返回资源内容。
    ///
    /// # 实现步骤（Task 4.5）
    ///
    /// 1. 解析资源 URI，确定目标服务器
    /// 2. 调用服务器的 read_resource 方法
    /// 3. 转换结果为 McpResourceContent
    /// 4. 返回结果
    pub async fn read_resource(&self, uri: &str) -> Result<McpResourceContent, McpError> {
        info!(uri = %uri, "读取 MCP 资源");

        // 1. 解析资源 URI，确定目标服务器
        let (server_name, _) = self.resolve_resource_target(uri).await?;

        debug!(
            uri = %uri,
            server_name = %server_name,
            "解析资源目标"
        );

        // 2. 获取目标服务器的客户端
        let clients = self.clients.read().await;
        let wrapper = clients
            .get(&server_name)
            .ok_or_else(|| McpError::ServerNotRunning(server_name.clone()))?;

        let service = wrapper
            .running_service()
            .ok_or_else(|| McpError::ServerNotRunning(server_name.clone()))?;

        // 3. 构建 read_resource 请求参数
        let read_param = rmcp::model::ReadResourceRequestParam {
            uri: uri.to_string(),
        };

        // 4. 调用 read_resource
        let result = service.read_resource(read_param).await.map_err(|e| {
            error!(
                uri = %uri,
                server_name = %server_name,
                error = %e,
                "读取资源失败"
            );
            McpError::ToolCallFailed(format!("读取资源失败: {e}"))
        })?;

        // 5. 转换结果为 McpResourceContent
        let mcp_result = Self::convert_read_resource_result(uri, result);

        info!(
            uri = %uri,
            server_name = %server_name,
            "资源读取完成"
        );

        Ok(mcp_result)
    }

    /// 解析资源目标（服务器名称）
    ///
    /// # Arguments
    ///
    /// * `uri` - 资源 URI
    ///
    /// # Returns
    ///
    /// 返回 (服务器名称, 资源 URI) 元组。
    ///
    /// # 解析逻辑
    ///
    /// 遍历所有运行中的服务器，查找提供该资源的服务器。
    async fn resolve_resource_target(&self, uri: &str) -> Result<(String, String), McpError> {
        let clients = self.clients.read().await;

        // 在所有服务器中查找该资源
        for (server_name, wrapper) in clients.iter() {
            // 检查服务器是否支持资源
            if let Some(ref info) = wrapper.server_info {
                if !info.supports_resources {
                    continue;
                }
            }

            if let Some(service) = wrapper.running_service() {
                // 尝试获取资源列表并查找
                if let Ok(resources) = service.list_all_resources().await {
                    if resources.iter().any(|r| r.uri == uri) {
                        return Ok((server_name.clone(), uri.to_string()));
                    }
                }
            }
        }

        // 资源未找到
        Err(McpError::ToolNotFound(format!("资源不存在: {uri}")))
    }

    /// 转换 rmcp ReadResourceResult 为 McpResourceContent
    pub(super) fn convert_read_resource_result(
        uri: &str,
        result: rmcp::model::ReadResourceResult,
    ) -> McpResourceContent {
        // 获取第一个内容（通常只有一个）
        if let Some(content) = result.contents.into_iter().next() {
            match content {
                rmcp::model::ResourceContents::TextResourceContents {
                    uri: content_uri,
                    mime_type,
                    text,
                    ..
                } => McpResourceContent {
                    uri: content_uri,
                    mime_type,
                    text: Some(text),
                    blob: None,
                },
                rmcp::model::ResourceContents::BlobResourceContents {
                    uri: content_uri,
                    mime_type,
                    blob,
                    ..
                } => McpResourceContent {
                    uri: content_uri,
                    mime_type,
                    text: None,
                    blob: Some(blob),
                },
            }
        } else {
            // 如果没有内容，返回空的资源内容
            McpResourceContent {
                uri: uri.to_string(),
                mime_type: None,
                text: None,
                blob: None,
            }
        }
    }
}
