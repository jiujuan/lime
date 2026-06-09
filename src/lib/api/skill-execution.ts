/**
 * @file Skill 执行 API 模块
 * @description 封装 Skill 执行相关的 Desktop Host / App Server 命令调用
 *
 * 提供以下功能：
 * - listExecutableSkills: 列出所有可执行的 Skills
 * - getSkillDetail: 获取 Skill 详情
 *
 * @module lib/api/skill-execution
 * @requirements 3.1, 4.1, 5.1
 */

import { AppServerClient } from "@/lib/api/appServer";
import {
  METHOD_SKILL_LIST,
  METHOD_SKILL_READ,
  type SkillListResponse as AppServerSkillListResponse,
  type SkillReadResponse as AppServerSkillReadResponse,
} from "../../../packages/app-server-client/src/protocol";

type SkillExecutionAppServerClient = Pick<AppServerClient, "request">;

async function requestSkillExecutionAppServer<T>(
  method: string,
  params: unknown,
  appServerClient: SkillExecutionAppServerClient = new AppServerClient(),
): Promise<T> {
  const response = await appServerClient.request<T>(method, params);
  return response.result;
}

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 可执行 Skill 信息
 *
 * 用于 listExecutableSkills 返回的 Skill 列表项
 */
export interface ExecutableSkillInfo {
  /** Skill 名称（唯一标识） */
  name: string;
  /** 显示名称 */
  display_name: string;
  /** Skill 描述 */
  description: string;
  /** 执行模式：prompt, workflow, agent */
  execution_mode: "prompt" | "workflow" | "agent";
  /** 是否有 workflow 定义 */
  has_workflow: boolean;
  /** 指定的 Provider（可选） */
  provider?: string;
  /** 指定的 Model（可选） */
  model?: string;
  /** 参数提示（可选） */
  argument_hint?: string;
}

/**
 * Workflow 步骤信息
 *
 * 描述 Workflow 中的单个步骤
 */
export interface WorkflowStepInfo {
  /** 步骤 ID */
  id: string;
  /** 步骤名称 */
  name: string;
  /** 依赖的步骤 ID 列表 */
  dependencies: string[];
}

/**
 * Skill 详情信息
 *
 * 包含 Skill 的完整信息，用于 getSkillDetail 返回
 */
export interface SkillDetailInfo extends ExecutableSkillInfo {
  /** Markdown 内容（System Prompt） */
  markdown_content: string;
  /** Workflow 步骤（如果有） */
  workflow_steps?: WorkflowStepInfo[];
  /** 允许的工具列表（可选） */
  allowed_tools?: string[];
  /** 使用场景说明（可选） */
  when_to_use?: string;
}

function normalizeSkillListResponse(
  response: AppServerSkillListResponse | null | undefined,
): ExecutableSkillInfo[] {
  if (!response || typeof response !== "object") {
    throw new Error("App Server skill/list did not return skills");
  }

  if (!Array.isArray(response.skills)) {
    throw new Error("App Server skill/list did not return skills");
  }

  return response.skills as ExecutableSkillInfo[];
}

function normalizeSkillReadResponse(
  response: AppServerSkillReadResponse | null | undefined,
): SkillDetailInfo {
  if (!response || typeof response !== "object" || !response.skill) {
    throw new Error("App Server skill/read did not return skill");
  }

  return response.skill as SkillDetailInfo;
}

/**
 * 步骤执行结果
 *
 * 描述单个步骤的执行结果
 */
export interface StepResult {
  /** 步骤 ID */
  step_id: string;
  /** 步骤名称 */
  step_name: string;
  /** 是否成功 */
  success: boolean;
  /** 输出内容 */
  output?: string;
  /** 错误信息 */
  error?: string;
}

// ============================================================================
// API 函数
// ============================================================================

/**
 * Skill 执行 API
 *
 * 封装 Skill 执行相关的 Desktop Host / App Server 命令调用
 */
export const skillExecutionApi = {
  /**
   * 列出所有可执行的 Skills
   *
   * 返回所有可以执行的 Skills 列表，已过滤掉 disable_model_invocation=true 的 Skills
   *
   * @returns 可执行的 Skills 列表
   *
   * @requirements 4.1, 4.2, 4.3, 4.4
   */
  async listExecutableSkills(): Promise<ExecutableSkillInfo[]> {
    const response =
      await requestSkillExecutionAppServer<AppServerSkillListResponse>(
        METHOD_SKILL_LIST,
        {},
      );
    return normalizeSkillListResponse(response);
  },

  /**
   * 获取 Skill 详情
   *
   * @param skillName - Skill 名称
   * @returns Skill 详情信息
   * @throws 如果 Skill 不存在则抛出错误
   *
   * @requirements 5.1, 5.2, 5.3, 5.4
   */
  async getSkillDetail(skillName: string): Promise<SkillDetailInfo> {
    const response =
      await requestSkillExecutionAppServer<AppServerSkillReadResponse>(
        METHOD_SKILL_READ,
        { skillName },
      );
    return normalizeSkillReadResponse(response);
  },
};
