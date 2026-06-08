import { safeInvoke } from "@/lib/dev-bridge";
import { assertNotDiagnosticFacade } from "./diagnosticFacade";
import type {
  CloudflaredInstallResult,
  CloudflaredInstallStatus,
  DiscordProbeResult,
  FeishuProbeResult,
  GatewayChannelStatusResponse,
  GatewayTunnelCreateResponse,
  GatewayTunnelProbeResult,
  GatewayTunnelStatus,
  GatewayTunnelSyncWebhookResponse,
  TelegramProbeResult,
  WechatConfiguredAccount,
  WechatLoginStartResult,
  WechatLoginWaitResult,
  WechatProbeResult,
} from "./channelsRuntimeTypes";

async function invokeChannelsCommand<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const result = args
    ? await safeInvoke(command, args)
    : await safeInvoke(command);
  assertNotDiagnosticFacade(command, result, "真实 Channels current 通道");
  return result as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function assertGatewayChannelStatusResponse(
  command: string,
  value: unknown,
): asserts value is GatewayChannelStatusResponse {
  if (!isRecord(value) || !isString(value.channel) || !isRecord(value.status)) {
    throw new Error(`${command} 未返回有效渠道运行状态`);
  }
}

function assertWechatConfiguredAccounts(
  command: string,
  value: unknown,
): asserts value is WechatConfiguredAccount[] {
  if (
    !Array.isArray(value) ||
    value.some(
      (account) =>
        !isRecord(account) ||
        !isString(account.accountId) ||
        !isBoolean(account.enabled) ||
        !isBoolean(account.hasToken),
    )
  ) {
    throw new Error(`${command} 未返回有效微信账号列表`);
  }
}

export type {
  ChannelsConfig,
  CloudflaredInstallResult,
  CloudflaredInstallStatus,
  DiscordAccountConfig,
  DiscordActionsConfig,
  DiscordAgentComponentsConfig,
  DiscordBotConfig,
  DiscordChannelConfig,
  DiscordExecApprovalsConfig,
  DiscordGatewayAccountStatus,
  DiscordGatewayStatus,
  DiscordGuildConfig,
  DiscordIntentsConfig,
  DiscordProbeResult,
  DiscordThreadBindingsConfig,
  DiscordUiComponentsConfig,
  DiscordUiConfig,
  DiscordVoiceAutoJoinConfig,
  DiscordVoiceConfig,
  DiscordAutoPresenceConfig,
  FeishuBotConfig,
  FeishuAccountConfig,
  FeishuGatewayAccountStatus,
  FeishuGatewayStatus,
  FeishuGroupConfig,
  FeishuProbeResult,
  CloudflareTunnelConfig,
  GatewayChannelStatusResponse,
  GatewayConfig,
  GatewayTunnelCreateResponse,
  GatewayTunnelConfig,
  GatewayTunnelProbeResult,
  GatewayTunnelStatus,
  GatewayTunnelSyncWebhookResponse,
  TelegramBotConfig,
  TelegramGatewayAccountStatus,
  TelegramGatewayStatus,
  TelegramProbeResult,
  WechatAccountConfig,
  WechatBotConfig,
  WechatConfiguredAccount,
  WechatGatewayAccountStatus,
  WechatGatewayStatus,
  WechatGroupConfig,
  WechatLoginStartResult,
  WechatLoginWaitResult,
  WechatProbeResult,
} from "./channelsRuntimeTypes";

export async function gatewayChannelStart(params?: {
  channel?: "telegram" | "feishu" | "discord" | "wechat";
  accountId?: string;
  pollTimeoutSecs?: number;
}): Promise<GatewayChannelStatusResponse> {
  return invokeChannelsCommand("gateway_channel_start", {
    request: {
      channel: params?.channel ?? "telegram",
      account_id: params?.accountId?.trim() || undefined,
      poll_timeout_secs: params?.pollTimeoutSecs,
    },
  });
}

export async function gatewayChannelStop(params?: {
  channel?: "telegram" | "feishu" | "discord" | "wechat";
  accountId?: string;
}): Promise<GatewayChannelStatusResponse> {
  return invokeChannelsCommand("gateway_channel_stop", {
    request: {
      channel: params?.channel ?? "telegram",
      account_id: params?.accountId?.trim() || undefined,
    },
  });
}

export async function gatewayChannelStatus(params?: {
  channel?: "telegram" | "feishu" | "discord" | "wechat";
}): Promise<GatewayChannelStatusResponse> {
  const result = await invokeChannelsCommand<unknown>("gateway_channel_status", {
    request: {
      channel: params?.channel ?? "telegram",
    },
  });
  assertGatewayChannelStatusResponse("gateway_channel_status", result);
  return result;
}

export async function telegramChannelProbe(params?: {
  accountId?: string;
}): Promise<TelegramProbeResult> {
  return invokeChannelsCommand("telegram_channel_probe", {
    request: {
      account_id: params?.accountId?.trim() || undefined,
    },
  });
}

export async function feishuChannelProbe(params?: {
  accountId?: string;
}): Promise<FeishuProbeResult> {
  return invokeChannelsCommand("feishu_channel_probe", {
    request: {
      account_id: params?.accountId?.trim() || undefined,
    },
  });
}

export async function discordChannelProbe(params?: {
  accountId?: string;
}): Promise<DiscordProbeResult> {
  return invokeChannelsCommand("discord_channel_probe", {
    request: {
      account_id: params?.accountId?.trim() || undefined,
    },
  });
}

export async function wechatChannelProbe(params?: {
  accountId?: string;
}): Promise<WechatProbeResult> {
  return invokeChannelsCommand("wechat_channel_probe", {
    request: {
      account_id: params?.accountId?.trim() || undefined,
    },
  });
}

export async function wechatChannelLoginStart(params?: {
  baseUrl?: string;
  botType?: string;
  sessionKey?: string;
}): Promise<WechatLoginStartResult> {
  return invokeChannelsCommand("wechat_channel_login_start", {
    request: {
      base_url: params?.baseUrl?.trim() || undefined,
      bot_type: params?.botType?.trim() || undefined,
      session_key: params?.sessionKey?.trim() || undefined,
    },
  });
}

export async function wechatChannelLoginWait(params: {
  sessionKey: string;
  baseUrl?: string;
  botType?: string;
  timeoutMs?: number;
  accountName?: string;
}): Promise<WechatLoginWaitResult> {
  return invokeChannelsCommand("wechat_channel_login_wait", {
    request: {
      session_key: params.sessionKey,
      base_url: params.baseUrl?.trim() || undefined,
      bot_type: params.botType?.trim() || undefined,
      timeout_ms: params.timeoutMs,
      account_name: params.accountName?.trim() || undefined,
    },
  });
}

export async function wechatChannelListAccounts(): Promise<
  WechatConfiguredAccount[]
> {
  const result = await invokeChannelsCommand<unknown>(
    "wechat_channel_list_accounts",
  );
  assertWechatConfiguredAccounts("wechat_channel_list_accounts", result);
  return result;
}

export async function wechatChannelRemoveAccount(params: {
  accountId: string;
  purgeData?: boolean;
}): Promise<void> {
  return invokeChannelsCommand("wechat_channel_remove_account", {
    request: {
      account_id: params.accountId,
      purge_data: params.purgeData ?? false,
    },
  });
}

export async function wechatChannelSetRuntimeModel(params: {
  providerId: string;
  modelId: string;
}): Promise<string> {
  return invokeChannelsCommand("wechat_channel_set_runtime_model", {
    request: {
      provider_id: params.providerId.trim(),
      model_id: params.modelId.trim(),
    },
  });
}

export async function gatewayTunnelProbe(): Promise<GatewayTunnelProbeResult> {
  return invokeChannelsCommand("gateway_tunnel_probe");
}

export async function gatewayTunnelDetectCloudflared(): Promise<CloudflaredInstallStatus> {
  return invokeChannelsCommand("gateway_tunnel_detect_cloudflared");
}

export async function gatewayTunnelInstallCloudflared(params?: {
  confirm?: boolean;
}): Promise<CloudflaredInstallResult> {
  return invokeChannelsCommand("gateway_tunnel_install_cloudflared", {
    request: {
      confirm: params?.confirm ?? false,
    },
  });
}

export async function gatewayTunnelCreate(params?: {
  tunnelName?: string;
  dnsName?: string;
  persist?: boolean;
}): Promise<GatewayTunnelCreateResponse> {
  return invokeChannelsCommand("gateway_tunnel_create", {
    request: {
      tunnel_name: params?.tunnelName?.trim() || undefined,
      dns_name: params?.dnsName?.trim() || undefined,
      persist: params?.persist ?? true,
    },
  });
}

export async function gatewayTunnelStart(): Promise<GatewayTunnelStatus> {
  return invokeChannelsCommand("gateway_tunnel_start");
}

export async function gatewayTunnelStop(): Promise<GatewayTunnelStatus> {
  return invokeChannelsCommand("gateway_tunnel_stop");
}

export async function gatewayTunnelRestart(): Promise<GatewayTunnelStatus> {
  return invokeChannelsCommand("gateway_tunnel_restart");
}

export async function gatewayTunnelStatus(): Promise<GatewayTunnelStatus> {
  return invokeChannelsCommand("gateway_tunnel_status");
}

export async function gatewayTunnelSyncWebhookUrl(params: {
  channel: "feishu";
  accountId?: string;
  webhookPath?: string;
  persist?: boolean;
}): Promise<GatewayTunnelSyncWebhookResponse> {
  return invokeChannelsCommand("gateway_tunnel_sync_webhook_url", {
    request: {
      channel: params.channel,
      account_id: params.accountId?.trim() || undefined,
      webhook_path: params.webhookPath?.trim() || undefined,
      persist: params.persist ?? true,
    },
  });
}
