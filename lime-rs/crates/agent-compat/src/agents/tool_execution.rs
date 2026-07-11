use std::collections::HashMap;
use std::future::Future;
use std::sync::Arc;

use async_stream::try_stream;
use futures::stream::{self, BoxStream};
use futures::{Stream, StreamExt};
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;

use crate::tool::Permission;
use rmcp::model::{CallToolRequestParam, Content, ErrorData, ServerNotification};

type ToolResult<T> = Result<T, ErrorData>;

// ToolCallResult combines the result of a tool call with an optional notification stream that
// can be used to receive notifications from the tool.
pub struct ToolCallResult {
    pub result: Box<dyn Future<Output = ToolResult<rmcp::model::CallToolResult>> + Send + Unpin>,
    pub notification_stream: Option<Box<dyn Stream<Item = ServerNotification> + Send + Unpin>>,
}

impl From<ToolResult<rmcp::model::CallToolResult>> for ToolCallResult {
    fn from(result: ToolResult<rmcp::model::CallToolResult>) -> Self {
        Self {
            result: Box::new(futures::future::ready(result)),
            notification_stream: None,
        }
    }
}

use super::agent::{tool_stream, ToolStream};
use crate::agents::{Agent, PermissionRequestHookContext, PermissionRequestHookDecision};
use crate::conversation::message::{Message, ToolRequest};
use crate::reply_provider::Provider;
use crate::session::Session;
use crate::tool_inspection::get_security_finding_id_from_results;

pub const DECLINED_RESPONSE: &str = "The user has declined to run this tool. \
    DO NOT attempt to call this tool again. \
    If there are no alternative methods to proceed, clearly explain the situation and STOP.";

pub const CHAT_MODE_TOOL_SKIPPED_RESPONSE: &str = "Let the user know the tool call was skipped in aster chat mode. \
                                        DO NOT apologize for skipping the tool call. DO NOT say sorry. \
                                        Provide an explanation of what the tool call would do, structured as a \
                                        plan for the user. Again, DO NOT apologize. \
                                        **Example Plan:**\n \
                                        1. **Identify Task Scope** - Determine the purpose and expected outcome.\n \
                                        2. **Outline Steps** - Break down the steps.\n \
                                        If needed, adjust the explanation based on user preferences or questions.";

const PERMISSION_REQUEST_HOOK_DENIED_RESPONSE: &str = "Permission denied by PermissionRequest hook";

fn build_permission_request_hook_denied_message(message: Option<String>) -> String {
    message
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| PERMISSION_REQUEST_HOOK_DENIED_RESPONSE.to_string())
}

fn apply_permission_request_updated_input(
    tool_call: &CallToolRequestParam,
    updated_input: Option<serde_json::Map<String, serde_json::Value>>,
) -> CallToolRequestParam {
    let mut rewritten_tool_call = tool_call.clone();
    if let Some(updated_input) = updated_input {
        rewritten_tool_call.arguments = Some(updated_input);
    }
    rewritten_tool_call
}

impl Agent {
    async fn run_permission_request_hook_handler(
        &self,
        tool_call: &CallToolRequestParam,
        request_id: &str,
        session: &Session,
    ) -> Option<PermissionRequestHookDecision> {
        let handler = self.permission_request_hook_handler.clone()?;

        let input = PermissionRequestHookContext {
            tool_name: tool_call.name.to_string(),
            tool_input: tool_call.arguments.clone().map(serde_json::Value::Object),
            tool_use_id: request_id.to_string(),
            session_id: session.id.clone(),
            permission_mode: None,
        };

        match handler(input).await {
            Ok(decision) => decision,
            Err(error) => {
                tracing::warn!(
                    "[AsterAgent] PermissionRequest hooks 执行失败，已回退到人工审批: tool={}, request_id={}, error={}",
                    tool_call.name,
                    request_id,
                    error
                );
                None
            }
        }
    }

    pub(crate) fn handle_approval_tool_requests<'a>(
        &'a self,
        tool_requests: &'a [ToolRequest],
        tool_futures: Arc<Mutex<Vec<(String, ToolStream)>>>,
        request_to_response_map: &'a HashMap<String, Arc<Mutex<Message>>>,
        cancellation_token: Option<CancellationToken>,
        session: &'a Session,
        inspection_results: &'a [crate::tool_inspection::InspectionResult],
        pinned_provider: Option<Arc<dyn Provider>>,
    ) -> BoxStream<'a, anyhow::Result<Message>> {
        try_stream! {
        for request in tool_requests.iter() {
            if let Ok(tool_call) = request.tool_call.clone() {
                if let Some(decision) = self
                    .run_permission_request_hook_handler(&tool_call, &request.id, session)
                    .await
                {
                    match decision {
                        PermissionRequestHookDecision::Allow { updated_input } => {
                            let rewritten_tool_call =
                                apply_permission_request_updated_input(&tool_call, updated_input);
                            let (req_id, tool_result) = self
                                .dispatch_tool_call_with_provider(
                                    rewritten_tool_call,
                                    request.id.clone(),
                                    cancellation_token.clone(),
                                    session,
                                    pinned_provider.clone(),
                                )
                                .await;
                            let mut futures = tool_futures.lock().await;

                            futures.push((
                                req_id,
                                match tool_result {
                                    Ok(result) => tool_stream(
                                        result
                                            .notification_stream
                                            .unwrap_or_else(|| Box::new(stream::empty())),
                                        result.result,
                                    ),
                                    Err(e) => tool_stream(
                                        Box::new(stream::empty()),
                                        futures::future::ready(Err(e)),
                                    ),
                                },
                            ));
                            continue;
                        }
                        PermissionRequestHookDecision::Deny { message } => {
                            if let Some(response_msg) = request_to_response_map.get(&request.id) {
                                let mut response = response_msg.lock().await;
                                *response = response.clone().with_tool_response_with_metadata(
                                    request.id.clone(),
                                    Ok(rmcp::model::CallToolResult {
                                        content: vec![Content::text(
                                            build_permission_request_hook_denied_message(message),
                                        )],
                                        structured_content: None,
                                        is_error: Some(true),
                                        meta: None,
                                    }),
                                    request.metadata.as_ref(),
                                );
                            }
                            continue;
                        }
                    }
                }

                // Find the corresponding inspection result for this tool request
                let security_message = inspection_results.iter()
                    .find(|result| result.tool_request_id == request.id)
                    .and_then(|result| {
                        if let crate::tool_inspection::InspectionAction::RequireApproval(Some(message)) = &result.action {
                            Some(message.clone())
                        } else {
                            None
                        }
                    });

                let confirmation = Message::assistant()
                    .with_action_required(
                        request.id.clone(),
                        tool_call.name.to_string().clone(),
                        tool_call.arguments.clone().unwrap_or_default(),
                        security_message,
                    )
                    .user_only();
                yield confirmation;

                let mut rx = self.confirmation_rx.lock().await;
                while let Some((req_id, confirmation)) = rx.recv().await {
                    if req_id == request.id {
                        // Log user decision if this was a security alert
                        if let Some(finding_id) = get_security_finding_id_from_results(&request.id, inspection_results) {
                            tracing::info!(
                                counter.aster.prompt_injection_user_decisions = 1,
                                decision = ?confirmation.permission,
                                finding_id = %finding_id,
                                "User security decision"
                            );
                        }

                        if confirmation.permission == Permission::AllowOnce || confirmation.permission == Permission::AlwaysAllow {
                            let (req_id, tool_result) = self
                                .dispatch_tool_call_with_provider(
                                    tool_call.clone(),
                                    request.id.clone(),
                                    cancellation_token.clone(),
                                    session,
                                    pinned_provider.clone(),
                                )
                                .await;
                            let mut futures = tool_futures.lock().await;

                            futures.push((req_id, match tool_result {
                                Ok(result) => tool_stream(
                                    result.notification_stream.unwrap_or_else(|| Box::new(stream::empty())),
                                    result.result,
                                ),
                                Err(e) => tool_stream(
                                    Box::new(stream::empty()),
                                    futures::future::ready(Err(e)),
                                ),
                            }));
                        } else {
                            // User declined - update the specific response message for this request
                            if let Some(response_msg) = request_to_response_map.get(&request.id) {
                                let mut response = response_msg.lock().await;
                                *response = response.clone().with_tool_response_with_metadata(
                                    request.id.clone(),
                                    Ok(rmcp::model::CallToolResult {
                                        content: vec![Content::text(DECLINED_RESPONSE)],
                                        structured_content: None,
                                        is_error: Some(true),
                                        meta: None,
                                    }),
                                    request.metadata.as_ref(),
                                );
                            }
                        }
                        break; // Exit the loop once the matching `req_id` is found
                    }
                }
            }
        }
    }.boxed()
    }

    pub(crate) fn handle_frontend_tool_request<'a>(
        &'a self,
        tool_request: &'a ToolRequest,
        message_tool_response: Arc<Mutex<Message>>,
    ) -> BoxStream<'a, anyhow::Result<Message>> {
        try_stream! {
                if let Ok(tool_call) = tool_request.tool_call.clone() {
                    if self.is_frontend_tool(&tool_call.name).await {
                        // Send frontend tool request and wait for response
                        yield Message::assistant().with_frontend_tool_request(
                            tool_request.id.clone(),
                            Ok(tool_call.clone())
                        );

                        if let Some((id, result)) = self.tool_result_rx.lock().await.recv().await {
                            let mut response = message_tool_response.lock().await;
                            *response = response.clone().with_tool_response_with_metadata(
                                id,
                                result,
                                tool_request.metadata.as_ref(),
                            );
                        }
                    }
            }
        }
        .boxed()
    }
}
