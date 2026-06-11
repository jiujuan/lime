//! Skill launch request context builders（从 useWorkspaceSendActions.ts 提取）
//!
//! 用于构建发送给 AI 的技能启动请求上下文。
//!
//! @module skillLaunchContextBuilders

import { toast } from "sonner";
import {
  PDF_EXTRACT_DEFAULT_ENTRY_SOURCE,
  WEB_RESEARCH_DEFAULT_ENTRY_SOURCE,
  resolvePdfExtractRuntimeContractBinding,
  resolveTextTransformRuntimeContractBinding,
  resolveWebResearchRuntimeContractBinding,
} from "@/lib/governance/modalityRuntimeContracts";
import {
  resolveContractEntrySource,
} from "../workspaceModelSkillLaunchRequestContext";
import { parseCompetitorWorkbenchCommand } from "../../utils/competitorWorkbenchCommand";
import { parseCoverWorkbenchCommand } from "../../utils/coverWorkbenchCommand";
import { parseDeepSearchWorkbenchCommand } from "../../utils/deepSearchWorkbenchCommand";
import { parseFileReadWorkbenchCommand } from "../../utils/fileReadWorkbenchCommand";
import { parsePdfWorkbenchCommand } from "../../utils/pdfWorkbenchCommand";
import { parseReportWorkbenchCommand } from "../../utils/reportWorkbenchCommand";
import { parseSearchWorkbenchCommand } from "../../utils/searchWorkbenchCommand";
import { parseSiteSearchWorkbenchCommand } from "../../utils/siteSearchWorkbenchCommand";
import { parseVideoWorkbenchCommand } from "../../utils/videoWorkbenchCommand";

type ParsedFileReadWorkbenchCommand = NonNullable<ReturnType<typeof parseFileReadWorkbenchCommand>>;
type ParsedVideoWorkbenchCommand = NonNullable<ReturnType<typeof parseVideoWorkbenchCommand>>;
type ParsedCoverWorkbenchCommand = NonNullable<ReturnType<typeof parseCoverWorkbenchCommand>>;
type ParsedSearchWorkbenchCommand = NonNullable<ReturnType<typeof parseSearchWorkbenchCommand>>;
type ParsedDeepSearchWorkbenchCommand = NonNullable<ReturnType<typeof parseDeepSearchWorkbenchCommand>>;
type ParsedReportWorkbenchCommand = NonNullable<ReturnType<typeof parseReportWorkbenchCommand>>;
type ParsedCompetitorWorkbenchCommand = NonNullable<ReturnType<typeof parseCompetitorWorkbenchCommand>>;
type ParsedSiteSearchWorkbenchCommand = NonNullable<ReturnType<typeof parseSiteSearchWorkbenchCommand>>;
type ParsedPdfWorkbenchCommand = NonNullable<ReturnType<typeof parsePdfWorkbenchCommand>>;

export function buildFileReadSkillLaunchRequestContext(params: {
  rawText: string;
  parsedCommand: ParsedFileReadWorkbenchCommand;
  projectId?: string | null;
  contentId?: string | null;
}): Record<string, unknown> | null {
  const sourcePath = params.parsedCommand.sourcePath?.trim();
  if (!sourcePath) {
    toast.error("请先提供文件路径后再读取");
    return null;
  }

  const prompt =
    params.parsedCommand.prompt.trim() ||
    params.parsedCommand.focus?.trim() ||
    "请阅读这个文件并提炼关键信息";
  const runtimeContract = resolveTextTransformRuntimeContractBinding();
  const entrySource = resolveContractEntrySource(
    runtimeContract.boundEntrySources,
    "at_file_read_command",
  );

  return {
    kind: "summary_request",
    summary_request: {
      raw_text: params.rawText,
      prompt,
      source_path: sourcePath,
      focus: params.parsedCommand.focus,
      length: params.parsedCommand.length,
      style: params.parsedCommand.style,
      output_format: params.parsedCommand.outputFormat,
      project_id: params.projectId || undefined,
      content_id: params.contentId || undefined,
      entry_source: entrySource,
      modality_contract_key: runtimeContract.contractKey,
      modality: runtimeContract.modality,
      required_capabilities: runtimeContract.requiredCapabilities,
      routing_slot: runtimeContract.routingSlot,
      runtime_contract: runtimeContract.runtimeContract,
    },
  };
}

function buildVideoSkillLaunchRequestContext(params: {
  rawText: string;
  parsedCommand: ParsedVideoWorkbenchCommand;
  projectId?: string | null;
  contentId?: string | null;
  sessionId?: string | null;
}): Record<string, unknown> | null {
  if (!params.projectId) {
    toast.error("请先选择项目后再开始生成视频");
    return null;
  }

  const prompt = params.parsedCommand.prompt.trim();
  if (!prompt) {
    toast.error("请补充清晰的视频描述后再提交");
    return null;
  }

  return {
    kind: "video_task",
    video_task: {
      prompt,
      raw_text: params.rawText,
      duration: params.parsedCommand.duration,
      aspect_ratio: params.parsedCommand.aspectRatio,
      resolution: params.parsedCommand.resolution,
      project_id: params.projectId,
      content_id: params.contentId || undefined,
      session_id: params.sessionId || undefined,
      entry_source: "at_video_command",
    },
  };
}

function buildCoverSkillLaunchRequestContext(params: {
  rawText: string;
  parsedCommand: ParsedCoverWorkbenchCommand;
  projectId?: string | null;
  contentId?: string | null;
  sessionId?: string | null;
}): Record<string, unknown> | null {
  const prompt =
    params.parsedCommand.prompt.trim() ||
    params.parsedCommand.title?.trim() ||
    "";
  if (!prompt) {
    toast.error("请补充封面主题或视觉描述后再提交");
    return null;
  }

  return {
    kind: "cover_task",
    cover_task: {
      raw_text: params.rawText,
      prompt,
      title: params.parsedCommand.title,
      platform: params.parsedCommand.platform,
      size: params.parsedCommand.size,
      style: params.parsedCommand.style,
      project_id: params.projectId || undefined,
      content_id: params.contentId || undefined,
      session_id: params.sessionId || undefined,
      entry_source: "at_cover_command",
    },
  };
}

function buildResearchSkillLaunchRequestContext(params: {
  rawText: string;
  parsedCommand: ParsedSearchWorkbenchCommand;
  projectId?: string | null;
  contentId?: string | null;
}): Record<string, unknown> | null {
  const prompt = params.parsedCommand.prompt.trim();
  const query = params.parsedCommand.query?.trim() || prompt;
  if (!query) {
    toast.error("请补充明确的搜索主题后再提交");
    return null;
  }
  const runtimeContract = resolveWebResearchRuntimeContractBinding();
  const entrySource = resolveContractEntrySource(
    runtimeContract.boundEntrySources,
    WEB_RESEARCH_DEFAULT_ENTRY_SOURCE,
  );

  return {
    kind: "research_request",
    research_request: {
      raw_text: params.rawText,
      prompt: prompt || query,
      query,
      site: params.parsedCommand.site,
      time_range: params.parsedCommand.timeRange,
      depth: params.parsedCommand.depth,
      focus: params.parsedCommand.focus,
      output_format: params.parsedCommand.outputFormat,
      project_id: params.projectId || undefined,
      content_id: params.contentId || undefined,
      entry_source: entrySource,
      modality_contract_key: runtimeContract.contractKey,
      modality: runtimeContract.modality,
      required_capabilities: runtimeContract.requiredCapabilities,
      routing_slot: runtimeContract.routingSlot,
      runtime_contract: runtimeContract.runtimeContract,
    },
  };
}

function buildDeepSearchSkillLaunchRequestContext(params: {
  rawText: string;
  parsedCommand: ParsedDeepSearchWorkbenchCommand;
  projectId?: string | null;
  contentId?: string | null;
}): Record<string, unknown> | null {
  const prompt = params.parsedCommand.prompt.trim();
  const query = params.parsedCommand.query?.trim() || prompt;
  if (!query) {
    toast.error("请补充明确的深搜主题后再提交");
    return null;
  }
  const runtimeContract = resolveWebResearchRuntimeContractBinding();
  const entrySource = resolveContractEntrySource(
    runtimeContract.boundEntrySources,
    "at_deep_search_command",
  );

  return {
    kind: "deep_search_request",
    deep_search_request: {
      raw_text: params.rawText,
      prompt: prompt || query,
      query,
      site: params.parsedCommand.site,
      time_range: params.parsedCommand.timeRange,
      depth: "deep",
      focus: params.parsedCommand.focus,
      output_format: params.parsedCommand.outputFormat,
      project_id: params.projectId || undefined,
      content_id: params.contentId || undefined,
      entry_source: entrySource,
      modality_contract_key: runtimeContract.contractKey,
      modality: runtimeContract.modality,
      required_capabilities: runtimeContract.requiredCapabilities,
      routing_slot: runtimeContract.routingSlot,
      runtime_contract: runtimeContract.runtimeContract,
    },
  };
}

function buildReportSkillLaunchRequestContext(params: {
  rawText: string;
  parsedCommand: ParsedReportWorkbenchCommand;
  projectId?: string | null;
  contentId?: string | null;
}): Record<string, unknown> | null {
  const prompt = params.parsedCommand.prompt.trim();
  const query = params.parsedCommand.query?.trim() || prompt;
  if (!query) {
    toast.error("请补充明确的研报主题后再提交");
    return null;
  }
  const runtimeContract = resolveWebResearchRuntimeContractBinding();
  const entrySource = resolveContractEntrySource(
    runtimeContract.boundEntrySources,
    "at_report_command",
  );

  return {
    kind: "report_request",
    report_request: {
      raw_text: params.rawText,
      prompt: prompt || query,
      query,
      site: params.parsedCommand.site,
      time_range: params.parsedCommand.timeRange,
      depth: "deep",
      focus: params.parsedCommand.focus,
      output_format: params.parsedCommand.outputFormat || "研究报告",
      project_id: params.projectId || undefined,
      content_id: params.contentId || undefined,
      entry_source: entrySource,
      modality_contract_key: runtimeContract.contractKey,
      modality: runtimeContract.modality,
      required_capabilities: runtimeContract.requiredCapabilities,
      routing_slot: runtimeContract.routingSlot,
      runtime_contract: runtimeContract.runtimeContract,
    },
  };
}

function buildCompetitorSkillLaunchRequestContext(params: {
  rawText: string;
  parsedCommand: ParsedCompetitorWorkbenchCommand;
  projectId?: string | null;
  contentId?: string | null;
}): Record<string, unknown> | null {
  const prompt = params.parsedCommand.prompt.trim();
  const query = params.parsedCommand.query?.trim() || prompt;
  if (!query) {
    toast.error("请补充明确的竞品分析主题后再提交");
    return null;
  }
  const runtimeContract = resolveWebResearchRuntimeContractBinding();
  const entrySource = resolveContractEntrySource(
    runtimeContract.boundEntrySources,
    "at_competitor_command",
  );

  return {
    kind: "report_request",
    report_request: {
      raw_text: params.rawText,
      prompt: prompt || query,
      query,
      site: params.parsedCommand.site,
      time_range: params.parsedCommand.timeRange,
      depth: "deep",
      focus: params.parsedCommand.focus,
      output_format: params.parsedCommand.outputFormat,
      project_id: params.projectId || undefined,
      content_id: params.contentId || undefined,
      entry_source: entrySource,
      modality_contract_key: runtimeContract.contractKey,
      modality: runtimeContract.modality,
      required_capabilities: runtimeContract.requiredCapabilities,
      routing_slot: runtimeContract.routingSlot,
      runtime_contract: runtimeContract.runtimeContract,
    },
  };
}

function buildSiteSearchSkillLaunchRequestContext(params: {
  rawText: string;
  parsedCommand: ParsedSiteSearchWorkbenchCommand;
  projectId?: string | null;
  contentId?: string | null;
}): Record<string, unknown> | null {
  const prompt = params.parsedCommand.prompt.trim();
  const query = params.parsedCommand.query?.trim() || prompt;
  if (!query && !params.parsedCommand.site?.trim()) {
    toast.error("请先补充站点和检索主题后再提交");
    return null;
  }
  const runtimeContract = resolveWebResearchRuntimeContractBinding();
  const entrySource = resolveContractEntrySource(
    runtimeContract.boundEntrySources,
    "at_site_search_command",
  );

  return {
    kind: "site_search_request",
    site_search_request: {
      raw_text: params.rawText,
      prompt: prompt || query || params.parsedCommand.site,
      site: params.parsedCommand.site,
      query: query || undefined,
      limit: params.parsedCommand.limit,
      project_id: params.projectId || undefined,
      content_id: params.contentId || undefined,
      entry_source: entrySource,
      modality_contract_key: runtimeContract.contractKey,
      modality: runtimeContract.modality,
      required_capabilities: runtimeContract.requiredCapabilities,
      routing_slot: runtimeContract.routingSlot,
      runtime_contract: runtimeContract.runtimeContract,
    },
  };
}

function buildPdfReadSkillLaunchRequestContext(params: {
  rawText: string;
  parsedCommand: ParsedPdfWorkbenchCommand;
  projectId?: string | null;
  contentId?: string | null;
}): Record<string, unknown> | null {
  const sourcePath = params.parsedCommand.sourcePath?.trim();
  const sourceUrl = params.parsedCommand.sourceUrl?.trim();
  if (!sourcePath && !sourceUrl) {
    toast.error("请先提供 PDF 文件路径，或先把 PDF 导入工作区后再试");
    return null;
  }

  const prompt =
    params.parsedCommand.prompt.trim() ||
    params.parsedCommand.focus?.trim() ||
    "请阅读这份 PDF 并提炼关键信息";
  const runtimeContract = resolvePdfExtractRuntimeContractBinding();
  const entrySource =
    runtimeContract.boundEntrySources[0] || PDF_EXTRACT_DEFAULT_ENTRY_SOURCE;

  return {
    kind: "pdf_read_request",
    pdf_read_request: {
      raw_text: params.rawText,
      prompt,
      source_path: sourcePath || undefined,
      source_url: sourceUrl || undefined,
      focus: params.parsedCommand.focus,
      output_format: params.parsedCommand.outputFormat,
      project_id: params.projectId || undefined,
      content_id: params.contentId || undefined,
      entry_source: entrySource,
      modality_contract_key: runtimeContract.contractKey,
      modality: runtimeContract.modality,
      required_capabilities: runtimeContract.requiredCapabilities,
      routing_slot: runtimeContract.routingSlot,
      runtime_contract: runtimeContract.runtimeContract,
    },
  };
}

export { buildGrowthSkillLaunchRequestContext, buildVoiceSkillLaunchRequestContext };
