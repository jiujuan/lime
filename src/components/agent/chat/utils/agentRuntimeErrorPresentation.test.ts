import { describe, expect, it } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";

import { resolveAgentRuntimeErrorPresentation } from "./agentRuntimeErrorPresentation";

describe("agentRuntimeErrorPresentation", () => {
  it("普通错误应保留原始文案", () => {
    expect(resolveAgentRuntimeErrorPresentation("模型执行失败")).toEqual({
      displayMessage: "模型执行失败",
      toastMessage: "响应错误: 模型执行失败",
    });
  });

  it("鉴权失效错误应转换为友好提示", () => {
    expect(
      resolveAgentRuntimeErrorPresentation(
        "Request failed: 401 unauthorized, token expired",
      ),
    ).toEqual({
      displayMessage:
        "当前 Provider 鉴权未通过，请前往设置 -> AI 服务商检查 API Key、Base URL 或授权配置后重试。",
      toastMessage:
        "当前 Provider 鉴权未通过，请前往设置 -> AI 服务商检查 API Key、Base URL 或授权配置后重试。",
    });
  });

  it("SendMessage schema 错误应转换为模型通道配置提示", () => {
    expect(
      resolveAgentRuntimeErrorPresentation(
        "Agent provider execution failed: Request failed: Bad request (400): Invalid schema for function 'SendMessage': In context=('properties', 'message', 'oneOf', '2'), array schema missing items",
      ),
    ).toEqual({
      displayMessage:
        "当前模型通道返回了不兼容的工具 schema，请前往设置 -> AI 服务商检查 Provider 配置或切换模型后重试。",
      toastMessage:
        "当前模型通道返回了不兼容的工具 schema，请前往设置 -> AI 服务商检查 Provider 配置或切换模型后重试。",
    });
  });

  it("402 与余额不足错误应转换为额度提示", async () => {
    await changeLimeLocale("zh-CN");

    expect(
      resolveAgentRuntimeErrorPresentation(
        "Agent provider execution failed: Request failed with status 402 Payment Required: Insufficient Balance",
      ),
    ).toEqual({
      displayMessage:
        "当前模型通道返回了计费或额度类错误，请检查该 Provider/模型通道的计费、配额或授权状态，或切换到其他可用模型后重试。",
      toastMessage:
        "当前模型通道返回了计费或额度类错误，请检查该 Provider/模型通道的计费、配额或授权状态，或切换到其他可用模型后重试。",
    });
  });

  it("JSON-RPC 内部错误应转换为短提示", async () => {
    await changeLimeLocale("zh-CN");

    expect(
      resolveAgentRuntimeErrorPresentation(
        "-32603: -32002: runtime error\n\nTroubleshooting: inspect provider logs",
      ),
    ).toEqual({
      displayMessage:
        "运行时返回内部错误，已保留详情用于排查。请稍后重试，或检查服务商与工具连接状态。",
      toastMessage:
        "运行时返回内部错误，已保留详情用于排查。请稍后重试，或检查服务商与工具连接状态。",
    });
  });

  it("普通错误里包含 402 字符串时不应误判为额度不足", () => {
    expect(
      resolveAgentRuntimeErrorPresentation(
        "requestKey 2026042402 failed: 模型通道暂时不可用",
      ),
    ).toEqual({
      displayMessage: "requestKey 2026042402 failed: 模型通道暂时不可用",
      toastMessage:
        "响应错误: requestKey 2026042402 failed: 模型通道暂时不可用",
    });
  });
});
