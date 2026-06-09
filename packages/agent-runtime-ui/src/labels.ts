import type { ReactNode } from "react";

import type {
  AgentRuntimeActionProjection,
  AgentRuntimeEventProjection,
  ExecutionGraphNode,
  ProcessTimelineEntry,
  UIMessagePart,
} from "@limecloud/agent-ui-contracts";

import type { AgentMessageRole, AgentTimelineMessage } from "./types.js";

export function defaultMessageTitle(message: AgentTimelineMessage): ReactNode {
  if (message.role === "user") return "用户";
  if (message.role === "assistant") return "助手";
  return "系统";
}

export function defaultMessageMeta(message: AgentTimelineMessage): ReactNode {
  return message.createdAt ? new Date(message.createdAt).toLocaleString() : null;
}

export function defaultMessagePreview(message: AgentTimelineMessage): ReactNode {
  return message.content.trim();
}

export function roleLabel(role: AgentMessageRole): string {
  if (role === "user") return "用";
  if (role === "assistant") return "助";
  if (role === "system") return "系";
  return "讯";
}

export function defaultMessagePartTitle(part: UIMessagePart): ReactNode {
  if (part.role === "user") return "用户";
  if (part.role === "assistant") return "助手";
  if (part.type === "reasoning") return "推理";
  if (part.type === "tool-preview") return "工具";
  if (part.type === "artifact-card") return "产物";
  if (part.type === "evidence-citation") return "证据";
  if (part.type === "diagnostic-ref") return "诊断";
  return "消息";
}

export function defaultMessagePartMeta(part: UIMessagePart): ReactNode {
  return part.createdAt ? new Date(part.createdAt).toLocaleString() : part.state ?? null;
}

export function defaultMessagePartPreview(part: UIMessagePart): ReactNode {
  const text = part.text?.trim();
  if (text) return text;
  if (part.refs?.length) return part.refs.join(" / ");
  return part.partId;
}

export function defaultTimelineEntryMeta(entry: ProcessTimelineEntry): ReactNode {
  if (entry.phase) return entry.phase;
  return entry.status;
}

export function defaultGraphNodeMeta(node: ExecutionGraphNode): ReactNode {
  return node.parentId ? `${node.nodeType} / ${node.parentId}` : node.nodeType;
}

export function defaultActionButtonLabel(action: AgentRuntimeActionProjection): ReactNode {
  if (action.buttonLabel) return action.buttonLabel;
  if (action.labelKey === "agent.action.addInputSource") return "补输入源";
  if (action.labelKey === "agent.action.configureTextModel") return "打开模型设置";
  return "处理";
}

export function defaultEventStatusLabel(event: AgentRuntimeEventProjection): ReactNode {
  if (event.displayStatus) return event.displayStatus;
  if (event.displayStatusKey === "agent.status.completed") return "完成";
  if (event.displayStatusKey === "agent.status.running") return "执行中";
  if (event.displayStatusKey === "agent.status.blocked") return "待配置";
  if (event.displayStatusKey === "agent.status.failed") return "失败";
  if (event.displayStatusKey === "agent.status.actionRequired") return "待处理";
  if (event.displayStatusKey === "agent.status.actionResolved") return "已处理";
  return "等待";
}
