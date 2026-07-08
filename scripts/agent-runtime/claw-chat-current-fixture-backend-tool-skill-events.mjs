import {
  EVENT_READ_PROBE_TOOL_CALL_ID,
  EVENT_READ_PROBE_TOOL_NAME,
  EVENT_READ_PROBE_TOOL_OUTPUT,
  EXPERT_PANEL_SKILLS_RUNTIME_SCENARIO,
  EXPERT_SKILLS_RUNTIME_BASE_SKILL_REF,
  EXPERT_SKILLS_RUNTIME_ID,
  EXPERT_SKILLS_RUNTIME_SCENARIO,
  EXPERT_SKILLS_RUNTIME_SKILL_REF,
  EXPERT_SKILLS_RUNTIME_TITLE,
  MCP_STRUCTURED_CONTENT_PROTOCOL_OUTPUT,
  MCP_STRUCTURED_CONTENT_RESULT,
  MCP_STRUCTURED_CONTENT_TOOL_CALL_ID,
  MCP_STRUCTURED_CONTENT_TOOL_NAME,
  SKILLS_RUNTIME_SKILL_NAME,
  WEB_TOOLS_FETCH_MARKDOWN,
  WEB_TOOLS_FETCH_TOOL_CALL_ID,
  WEB_TOOLS_MID_THINKING_TEXT,
  WEB_TOOLS_REASONING_FINAL_ID,
  WEB_TOOLS_REASONING_FINAL_SIGNATURE,
  WEB_TOOLS_REASONING_ITEM_ID,
  WEB_TOOLS_REASONING_ITEM_SIGNATURE,
  WEB_TOOLS_REASONING_NATIVE_ITEM_ID,
  WEB_TOOLS_REASONING_PROVIDER_BACKEND,
  WEB_TOOLS_SEARCH_SNIPPET,
  WEB_TOOLS_SEARCH_TITLE,
  WEB_TOOLS_SEARCH_TOOL_CALL_ID,
  WEB_TOOLS_SEARCH_URL,
} from "./claw-chat-current-fixture-constants.mjs";

export function renderBackendToolAndSkillEventScript({
  skillsRuntimeBackendEvents,
  explicitSkillsRuntimeBackendEvents,
  manualEnableSkillsRuntimeBackendEvents,
  multiAgentTeamBackendEvents,
  expertSkillsRuntimeBackendEvents,
  expertPanelSkillsRuntimeBackendEvents,
}) {
  return `
  if (isWebToolsRenderingPrompt) {
    emitEvents([
      {
        type: "tool.started",
        payload: {
          toolCallId: "${WEB_TOOLS_SEARCH_TOOL_CALL_ID}",
          tool_call_id: "${WEB_TOOLS_SEARCH_TOOL_CALL_ID}",
          toolId: "${WEB_TOOLS_SEARCH_TOOL_CALL_ID}",
          tool_id: "${WEB_TOOLS_SEARCH_TOOL_CALL_ID}",
          id: "${WEB_TOOLS_SEARCH_TOOL_CALL_ID}",
          toolName: "WebSearch",
          tool_name: "WebSearch",
          name: "WebSearch",
          arguments: {
            query: "Lime WebSearch rendering"
          }
        }
      }
    ]);
    await sleep(80);
    emitEvents([
      {
        type: "tool.result",
        payload: {
          toolCallId: "${WEB_TOOLS_SEARCH_TOOL_CALL_ID}",
          tool_call_id: "${WEB_TOOLS_SEARCH_TOOL_CALL_ID}",
          toolId: "${WEB_TOOLS_SEARCH_TOOL_CALL_ID}",
          tool_id: "${WEB_TOOLS_SEARCH_TOOL_CALL_ID}",
          id: "${WEB_TOOLS_SEARCH_TOOL_CALL_ID}",
          toolName: "WebSearch",
          tool_name: "WebSearch",
          outputPreview: ${JSON.stringify(
            JSON.stringify({
              results: [
                {
                  title: "Help",
                  url: "https://help.yahoo.com/kb/search-for-desktop",
                  snippet: "Yahoo search help navigation",
                },
                {
                  title: "Sign In",
                  url: "https://login.yahoo.com/?src=search",
                  snippet: "Yahoo sign in navigation",
                },
                {
                  title: "Yahoo Scout",
                  url: "https://scout.yahoo.com/chat",
                  snippet: "Yahoo search assistant navigation",
                },
                {
                  title: WEB_TOOLS_SEARCH_TITLE,
                  url: WEB_TOOLS_SEARCH_URL,
                  snippet: WEB_TOOLS_SEARCH_SNIPPET,
                },
              ],
            }),
          )},
          output: ${JSON.stringify(
            JSON.stringify({
              results: [
                {
                  title: "Help",
                  url: "https://help.yahoo.com/kb/search-for-desktop",
                  snippet: "Yahoo search help navigation",
                },
                {
                  title: "Sign In",
                  url: "https://login.yahoo.com/?src=search",
                  snippet: "Yahoo sign in navigation",
                },
                {
                  title: "Yahoo Scout",
                  url: "https://scout.yahoo.com/chat",
                  snippet: "Yahoo search assistant navigation",
                },
                {
                  title: WEB_TOOLS_SEARCH_TITLE,
                  url: WEB_TOOLS_SEARCH_URL,
                  snippet: WEB_TOOLS_SEARCH_SNIPPET,
                },
              ],
            }),
          )},
          success: true
        }
      }
    ]);
    await sleep(80);
    const webToolsReasoningStartedAt = new Date().toISOString();
    emitEvents([
      {
        type: "reasoning.final",
        payload: {
          reasoningId: "${WEB_TOOLS_REASONING_FINAL_ID}",
          reasoning_id: "${WEB_TOOLS_REASONING_FINAL_ID}",
          text: "${WEB_TOOLS_MID_THINKING_TEXT}",
          providerMetadata: {
            backend: "${WEB_TOOLS_REASONING_PROVIDER_BACKEND}",
            signature: "${WEB_TOOLS_REASONING_FINAL_SIGNATURE}"
          },
          provider_metadata: {
            backend: "${WEB_TOOLS_REASONING_PROVIDER_BACKEND}",
            signature: "${WEB_TOOLS_REASONING_FINAL_SIGNATURE}"
          }
        }
      }
    ]);
    await sleep(40);
    emitEvents([
      {
        type: "item.updated",
        payload: {
          item: {
            id: "${WEB_TOOLS_REASONING_ITEM_ID}",
            thread_id: currentThreadId(),
            threadId: currentThreadId(),
            turn_id: currentTurnId(),
            turnId: currentTurnId(),
            type: "reasoning",
            text: "${WEB_TOOLS_MID_THINKING_TEXT}",
            sequence: 3,
            status: "in_progress",
            started_at: webToolsReasoningStartedAt,
            startedAt: webToolsReasoningStartedAt,
            updated_at: webToolsReasoningStartedAt,
            updatedAt: webToolsReasoningStartedAt,
            metadata: {
              native_reasoning_item_id: "${WEB_TOOLS_REASONING_NATIVE_ITEM_ID}",
              provider_metadata: {
                backend: "${WEB_TOOLS_REASONING_PROVIDER_BACKEND}",
                signature: "${WEB_TOOLS_REASONING_ITEM_SIGNATURE}"
              }
            }
          }
        }
      }
    ]);
    await sleep(80);
    emitEvents([
      {
        type: "tool.started",
        payload: {
          toolCallId: "${WEB_TOOLS_FETCH_TOOL_CALL_ID}",
          tool_call_id: "${WEB_TOOLS_FETCH_TOOL_CALL_ID}",
          toolId: "${WEB_TOOLS_FETCH_TOOL_CALL_ID}",
          tool_id: "${WEB_TOOLS_FETCH_TOOL_CALL_ID}",
          id: "${WEB_TOOLS_FETCH_TOOL_CALL_ID}",
          toolName: "WebFetch",
          tool_name: "WebFetch",
          name: "WebFetch",
          arguments: {
            url: "${WEB_TOOLS_SEARCH_URL}"
          }
        }
      }
    ]);
    await sleep(80);
    emitEvents([
      {
        type: "tool.result",
        payload: {
          toolCallId: "${WEB_TOOLS_FETCH_TOOL_CALL_ID}",
          tool_call_id: "${WEB_TOOLS_FETCH_TOOL_CALL_ID}",
          toolId: "${WEB_TOOLS_FETCH_TOOL_CALL_ID}",
          tool_id: "${WEB_TOOLS_FETCH_TOOL_CALL_ID}",
          id: "${WEB_TOOLS_FETCH_TOOL_CALL_ID}",
          toolName: "WebFetch",
          tool_name: "WebFetch",
          outputPreview: ${JSON.stringify(
            JSON.stringify({
              bytes: 2048,
              code: 200,
              codeText: "OK",
              result: WEB_TOOLS_FETCH_MARKDOWN,
            }),
          )},
          output: ${JSON.stringify(
            JSON.stringify({
              bytes: 2048,
              code: 200,
              codeText: "OK",
              result: WEB_TOOLS_FETCH_MARKDOWN,
            }),
          )},
          success: true,
          metadata: {
            url: "${WEB_TOOLS_SEARCH_URL}"
          }
        }
      }
    ]);
    await sleep(80);
    emitEvents([
      {
        type: "item.completed",
        payload: {
          item: {
            id: "${WEB_TOOLS_REASONING_ITEM_ID}",
            thread_id: currentThreadId(),
            threadId: currentThreadId(),
            turn_id: currentTurnId(),
            turnId: currentTurnId(),
            type: "reasoning",
            text: "${WEB_TOOLS_MID_THINKING_TEXT}",
            sequence: 3,
            status: "completed",
            started_at: webToolsReasoningStartedAt,
            startedAt: webToolsReasoningStartedAt,
            completed_at: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            metadata: {
              native_reasoning_item_id: "${WEB_TOOLS_REASONING_NATIVE_ITEM_ID}",
              provider_metadata: {
                backend: "${WEB_TOOLS_REASONING_PROVIDER_BACKEND}",
                signature: "${WEB_TOOLS_REASONING_ITEM_SIGNATURE}"
              }
            }
          }
        }
      }
    ]);
    await sleep(1800);
  }
  if (isMcpStructuredContentPrompt) {
    emitEvents([
      {
        type: "tool.started",
        payload: {
          toolCallId: "${MCP_STRUCTURED_CONTENT_TOOL_CALL_ID}",
          tool_call_id: "${MCP_STRUCTURED_CONTENT_TOOL_CALL_ID}",
          toolId: "${MCP_STRUCTURED_CONTENT_TOOL_CALL_ID}",
          tool_id: "${MCP_STRUCTURED_CONTENT_TOOL_CALL_ID}",
          id: "${MCP_STRUCTURED_CONTENT_TOOL_CALL_ID}",
          toolName: "${MCP_STRUCTURED_CONTENT_TOOL_NAME}",
          tool_name: "${MCP_STRUCTURED_CONTENT_TOOL_NAME}",
          name: "${MCP_STRUCTURED_CONTENT_TOOL_NAME}",
          arguments: {
            question: "structured content display",
            server: "docs"
          },
          metadata: {
            tool_family: "mcp",
            mcp_server: "docs",
            mcp_tool: "diagnostic_probe"
          }
        }
      }
    ]);
    await sleep(80);
    emitEvents([
      {
        type: "tool.result",
        payload: {
          toolCallId: "${MCP_STRUCTURED_CONTENT_TOOL_CALL_ID}",
          tool_call_id: "${MCP_STRUCTURED_CONTENT_TOOL_CALL_ID}",
          toolId: "${MCP_STRUCTURED_CONTENT_TOOL_CALL_ID}",
          tool_id: "${MCP_STRUCTURED_CONTENT_TOOL_CALL_ID}",
          id: "${MCP_STRUCTURED_CONTENT_TOOL_CALL_ID}",
          toolName: "${MCP_STRUCTURED_CONTENT_TOOL_NAME}",
          tool_name: "${MCP_STRUCTURED_CONTENT_TOOL_NAME}",
          outputPreview: ${JSON.stringify(MCP_STRUCTURED_CONTENT_PROTOCOL_OUTPUT)},
          output: ${JSON.stringify(MCP_STRUCTURED_CONTENT_PROTOCOL_OUTPUT)},
          success: true,
          structuredContent: ${JSON.stringify(MCP_STRUCTURED_CONTENT_RESULT)},
          structured_content: ${JSON.stringify(MCP_STRUCTURED_CONTENT_RESULT)},
          result: {
            success: true,
            output: ${JSON.stringify(MCP_STRUCTURED_CONTENT_PROTOCOL_OUTPUT)},
            structuredContent: ${JSON.stringify(MCP_STRUCTURED_CONTENT_RESULT)},
            structured_content: ${JSON.stringify(MCP_STRUCTURED_CONTENT_RESULT)},
            metadata: {
              tool_family: "mcp",
              mcp_server: "docs",
              mcp_tool: "diagnostic_probe"
            }
          },
          metadata: {
            tool_family: "mcp",
            mcp_server: "docs",
            mcp_tool: "diagnostic_probe"
          }
        }
      }
    ]);
    await sleep(120);
  }
${skillsRuntimeBackendEvents}
${explicitSkillsRuntimeBackendEvents}
${manualEnableSkillsRuntimeBackendEvents}
${multiAgentTeamBackendEvents}
  if (isExpertSkillsRuntimePrompt) {
    emitEvents([
      {
        type: "runtime.status",
        payload: {
          status: "declared",
          text: "专家已声明 skillRefs，但声明不等于执行授权。",
          metadata: {
            expertSkillsRuntime: {
              event: "expert_declared_skill_refs",
              expertId: "${EXPERT_SKILLS_RUNTIME_ID}",
              expertTitle: "${EXPERT_SKILLS_RUNTIME_TITLE}",
              skillRefs: ["${EXPERT_SKILLS_RUNTIME_SKILL_REF}"]
            },
            expert_skills_runtime: {
              event: "expert_declared_skill_refs",
              expert_id: "${EXPERT_SKILLS_RUNTIME_ID}",
              expert_title: "${EXPERT_SKILLS_RUNTIME_TITLE}",
              skill_refs: ["${EXPERT_SKILLS_RUNTIME_SKILL_REF}"]
            }
          }
        }
      }
    ]);
    await sleep(80);
  }
  if (isExpertPanelSkillsRuntimePrompt) {
    emitEvents([
      {
        type: "runtime.status",
        payload: {
          status: "declared",
          text: "专家面板更新后的 skillRefs 已进入当前回合，但声明仍不等于执行授权。",
          metadata: {
            expertSkillsRuntime: {
              event: "expert_declared_skill_refs",
              expertId: "${EXPERT_SKILLS_RUNTIME_ID}",
              expertTitle: "${EXPERT_SKILLS_RUNTIME_TITLE}",
              skillRefs: [
                "${EXPERT_SKILLS_RUNTIME_BASE_SKILL_REF}",
                "${EXPERT_SKILLS_RUNTIME_SKILL_REF}"
              ]
            },
            expert_skills_runtime: {
              event: "expert_declared_skill_refs",
              expert_id: "${EXPERT_SKILLS_RUNTIME_ID}",
              expert_title: "${EXPERT_SKILLS_RUNTIME_TITLE}",
              skill_refs: [
                "${EXPERT_SKILLS_RUNTIME_BASE_SKILL_REF}",
                "${EXPERT_SKILLS_RUNTIME_SKILL_REF}"
              ]
            }
          }
        }
      }
    ]);
    await sleep(80);
  }
${expertSkillsRuntimeBackendEvents}
${expertPanelSkillsRuntimeBackendEvents}
  if (isExpertSkillsRuntimePrompt) {
    emitEvents([
      {
        type: "runtime.status",
        payload: {
          status: "selected",
          text: "专家本轮通过 selector 选择 capability-report。",
          metadata: {
            expertSkillsRuntime: {
              event: "expert_selected_skill",
              expertId: "${EXPERT_SKILLS_RUNTIME_ID}",
              skillName: "${SKILLS_RUNTIME_SKILL_NAME}",
              declaredSkillRef: "${EXPERT_SKILLS_RUNTIME_SKILL_REF}"
            },
            expert_skills_runtime: {
              event: "expert_selected_skill",
              expert_id: "${EXPERT_SKILLS_RUNTIME_ID}",
              skill_name: "${SKILLS_RUNTIME_SKILL_NAME}",
              declared_skill_ref: "${EXPERT_SKILLS_RUNTIME_SKILL_REF}"
            }
          }
        }
      },
      {
        type: "runtime.status",
        payload: {
          status: "invoked",
          text: "专家本轮真实调用 Skill tool: capability-report。",
          metadata: {
            expertSkillsRuntime: {
              event: "expert_invoked_skill",
              expertId: "${EXPERT_SKILLS_RUNTIME_ID}",
              skillName: "${SKILLS_RUNTIME_SKILL_NAME}",
              toolCallId: "${EXPERT_SKILLS_RUNTIME_SCENARIO.skillToolCallId}"
            },
            expert_skills_runtime: {
              event: "expert_invoked_skill",
              expert_id: "${EXPERT_SKILLS_RUNTIME_ID}",
              skill_name: "${SKILLS_RUNTIME_SKILL_NAME}",
              tool_call_id: "${EXPERT_SKILLS_RUNTIME_SCENARIO.skillToolCallId}"
            }
          }
        }
      }
    ]);
    await sleep(80);
  }
  if (isExpertPanelSkillsRuntimePrompt) {
    emitEvents([
      {
        type: "runtime.status",
        payload: {
          status: "selected",
          text: "专家面板新增技能后的下一轮通过 selector 选择 capability-report。",
          metadata: {
            expertSkillsRuntime: {
              event: "expert_selected_skill",
              expertId: "${EXPERT_SKILLS_RUNTIME_ID}",
              skillName: "${SKILLS_RUNTIME_SKILL_NAME}",
              declaredSkillRef: "${EXPERT_SKILLS_RUNTIME_SKILL_REF}"
            },
            expert_skills_runtime: {
              event: "expert_selected_skill",
              expert_id: "${EXPERT_SKILLS_RUNTIME_ID}",
              skill_name: "${SKILLS_RUNTIME_SKILL_NAME}",
              declared_skill_ref: "${EXPERT_SKILLS_RUNTIME_SKILL_REF}"
            }
          }
        }
      },
      {
        type: "runtime.status",
        payload: {
          status: "invoked",
          text: "专家面板新增技能后的下一轮真实调用 Skill tool: capability-report。",
          metadata: {
            expertSkillsRuntime: {
              event: "expert_invoked_skill",
              expertId: "${EXPERT_SKILLS_RUNTIME_ID}",
              skillName: "${SKILLS_RUNTIME_SKILL_NAME}",
              toolCallId: "${EXPERT_PANEL_SKILLS_RUNTIME_SCENARIO.skillToolCallId}"
            },
            expert_skills_runtime: {
              event: "expert_invoked_skill",
              expert_id: "${EXPERT_SKILLS_RUNTIME_ID}",
              skill_name: "${SKILLS_RUNTIME_SKILL_NAME}",
              tool_call_id: "${EXPERT_PANEL_SKILLS_RUNTIME_SCENARIO.skillToolCallId}"
            }
          }
        }
      }
    ]);
    await sleep(80);
  }
  if (isEventReadProbe) {
    emitEvents([
      {
        type: "tool.started",
        payload: {
          toolCallId: "${EVENT_READ_PROBE_TOOL_CALL_ID}",
          toolName: "${EVENT_READ_PROBE_TOOL_NAME}",
          tool_name: "${EVENT_READ_PROBE_TOOL_NAME}",
          arguments: {
            url: "https://example.com/claw-event-read",
            purpose: "claw-chat-current-fixture-event-read"
          }
        }
      }
    ]);
    await sleep(80);
    emitEvents([
      {
        type: "tool.result",
        payload: {
          toolCallId: "${EVENT_READ_PROBE_TOOL_CALL_ID}",
          toolName: "${EVENT_READ_PROBE_TOOL_NAME}",
          tool_name: "${EVENT_READ_PROBE_TOOL_NAME}",
          outputPreview: "${EVENT_READ_PROBE_TOOL_OUTPUT}",
          output: "${EVENT_READ_PROBE_TOOL_OUTPUT}",
          success: true
        }
      }
    ]);
    await sleep(80);
  }
`;
}
