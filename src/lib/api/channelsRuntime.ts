import {
  APP_SERVER_METHOD_DISCORD_CHANNEL_PROBE,
  APP_SERVER_METHOD_FEISHU_CHANNEL_PROBE,
  APP_SERVER_METHOD_GATEWAY_CHANNEL_START,
  APP_SERVER_METHOD_GATEWAY_CHANNEL_STOP,
  APP_SERVER_METHOD_GATEWAY_CHANNEL_STATUS,
  APP_SERVER_METHOD_GATEWAY_TUNNEL_CLOUDFLARED_DETECT,
  APP_SERVER_METHOD_GATEWAY_TUNNEL_CLOUDFLARED_INSTALL,
  APP_SERVER_METHOD_GATEWAY_TUNNEL_CREATE,
  APP_SERVER_METHOD_GATEWAY_TUNNEL_PROBE,
  APP_SERVER_METHOD_GATEWAY_TUNNEL_RESTART,
  APP_SERVER_METHOD_GATEWAY_TUNNEL_START,
  APP_SERVER_METHOD_GATEWAY_TUNNEL_STATUS,
  APP_SERVER_METHOD_GATEWAY_TUNNEL_STOP,
  APP_SERVER_METHOD_GATEWAY_TUNNEL_SYNC_WEBHOOK_URL,
  APP_SERVER_METHOD_TELEGRAM_CHANNEL_PROBE,
  APP_SERVER_METHOD_WECHAT_CHANNEL_ACCOUNT_REMOVE,
  APP_SERVER_METHOD_WECHAT_CHANNEL_ACCOUNT_LIST,
  APP_SERVER_METHOD_WECHAT_CHANNEL_LOGIN_START,
  APP_SERVER_METHOD_WECHAT_CHANNEL_LOGIN_WAIT,
  APP_SERVER_METHOD_WECHAT_CHANNEL_PROBE,
  APP_SERVER_METHOD_WECHAT_CHANNEL_RUNTIME_MODEL_SET,
  createAppServerClient,
  type AppServerChannelProbeResponse,
  type AppServerGatewayChannelStatusResponse,
  type AppServerGatewayTunnelCloudflaredDetectResponse,
  type AppServerGatewayTunnelCloudflaredInstallResponse,
  type AppServerGatewayTunnelCreateResponse,
  type AppServerGatewayTunnelProbeResponse,
  type AppServerGatewayTunnelStatusResponse,
  type AppServerGatewayTunnelSyncWebhookUrlResponse,
  type AppServerWechatLoginStartResponse,
  type AppServerWechatLoginWaitResponse,
  type AppServerWechatRuntimeModelSetResponse,
} from "./appServer";
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function readAlias(
  value: Record<string, unknown>,
  primary: string,
  legacy: string,
): unknown {
  return value[primary] ?? value[legacy];
}

function assertGatewayChannelStatusResponse(
  command: string,
  value: unknown,
): asserts value is AppServerGatewayChannelStatusResponse {
  if (!isRecord(value) || !isString(value.channel) || !isRecord(value.status)) {
    throw new Error(`${command} 未返回有效渠道运行状态`);
  }
}

type WechatConfiguredAccountPayload = Record<string, unknown>;

function assertWechatChannelAccountListResponse(
  command: string,
  value: unknown,
): asserts value is { accounts: WechatConfiguredAccountPayload[] } {
  if (
    !isRecord(value) ||
    !Array.isArray(value.accounts) ||
    value.accounts.some((account) => {
      if (!isRecord(account)) {
        return true;
      }
      return (
        !isString(readAlias(account, "accountId", "account_id")) ||
        !isBoolean(account.enabled) ||
        !isBoolean(readAlias(account, "hasToken", "has_token")) ||
        !isOptionalString(account.name) ||
        !isOptionalString(readAlias(account, "baseUrl", "base_url")) ||
        !isOptionalString(readAlias(account, "cdnBaseUrl", "cdn_base_url")) ||
        !isOptionalString(
          readAlias(account, "scannerUserId", "scanner_user_id"),
        )
      );
    })
  ) {
    throw new Error(`${command} 未返回有效微信账号列表`);
  }
}

function toWechatConfiguredAccount(
  account: WechatConfiguredAccountPayload,
): WechatConfiguredAccount {
  return {
    accountId: readAlias(account, "accountId", "account_id") as string,
    enabled: account.enabled as boolean,
    name: account.name as string | undefined,
    baseUrl: readAlias(account, "baseUrl", "base_url") as string | undefined,
    cdnBaseUrl: readAlias(account, "cdnBaseUrl", "cdn_base_url") as
      | string
      | undefined,
    hasToken: readAlias(account, "hasToken", "has_token") as boolean,
    scannerUserId: readAlias(
      account,
      "scannerUserId",
      "scanner_user_id",
    ) as string | undefined,
  };
}

function assertAppServerProbeResult(
  command: string,
  value: unknown,
): asserts value is AppServerChannelProbeResponse & { accountId: string } {
  if (
    !isRecord(value) ||
    !isString(value.accountId) ||
    !isBoolean(value.ok) ||
    !isString(value.message)
  ) {
    throw new Error(`${command} 未返回有效渠道探测结果`);
  }
}

function toLegacyAccountProbeResult<
  T extends TelegramProbeResult | FeishuProbeResult | DiscordProbeResult,
>(value: AppServerChannelProbeResponse & { accountId: string }): T {
  const { accountId, ...rest } = value;
  return {
    ...rest,
    account_id: accountId,
  } as T;
}

function assertWechatLoginStartResult(
  command: string,
  value: unknown,
): asserts value is AppServerWechatLoginStartResponse {
  if (
    !isRecord(value) ||
    !isString(value.sessionKey) ||
    !isString(value.qrcodeUrl) ||
    !isString(value.message)
  ) {
    throw new Error(`${command} 未返回有效微信登录启动结果`);
  }
}

function assertWechatLoginWaitResult(
  command: string,
  value: unknown,
): asserts value is AppServerWechatLoginWaitResponse {
  if (
    !isRecord(value) ||
    !isBoolean(value.connected) ||
    !isString(value.message)
  ) {
    throw new Error(`${command} 未返回有效微信登录等待结果`);
  }
}

function assertVoidLikeResult(command: string, value: unknown): void {
  if (value == null) {
    return;
  }
  if (isRecord(value) && Object.keys(value).length === 0) {
    return;
  }
  throw new Error(`${command} 未返回空结果`);
}

function assertRuntimeModelSetResponse(
  command: string,
  value: unknown,
): asserts value is AppServerWechatRuntimeModelSetResponse {
  if (!isRecord(value) || !isString(value.runtimeModel)) {
    throw new Error(`${command} 未返回有效运行模型结果`);
  }
}

function assertGatewayTunnelStatus(
  command: string,
  value: unknown,
): asserts value is AppServerGatewayTunnelStatusResponse {
  if (
    !isRecord(value) ||
    !isBoolean(value.running) ||
    !isString(value.provider) ||
    !isString(value.mode) ||
    !isString(value.binary) ||
    typeof value.localUrl !== "string"
  ) {
    throw new Error(`${command} 未返回有效隧道状态`);
  }
}

function assertGatewayTunnelProbeResult(
  command: string,
  value: unknown,
): asserts value is AppServerGatewayTunnelProbeResponse {
  if (
    !isRecord(value) ||
    !isBoolean(value.ok) ||
    !isString(value.provider) ||
    !isString(value.mode) ||
    !isString(value.binary) ||
    !isBoolean(value.configReady) ||
    !isString(value.message)
  ) {
    throw new Error(`${command} 未返回有效隧道探测结果`);
  }
}

function assertCloudflaredInstallStatus(
  command: string,
  value: unknown,
): asserts value is AppServerGatewayTunnelCloudflaredDetectResponse {
  if (
    !isRecord(value) ||
    !isBoolean(value.installed) ||
    !isString(value.binary) ||
    !isString(value.platform) ||
    !isBoolean(value.installSupported) ||
    !isBoolean(value.requiresPrivilege) ||
    !isString(value.message)
  ) {
    throw new Error(`${command} 未返回有效 cloudflared 安装状态`);
  }
}

function assertCloudflaredInstallResult(
  command: string,
  value: unknown,
): asserts value is AppServerGatewayTunnelCloudflaredInstallResponse {
  if (
    !isRecord(value) ||
    !isBoolean(value.ok) ||
    !isBoolean(value.attempted) ||
    !isString(value.platform) ||
    !isBoolean(value.installed) ||
    typeof value.stdout !== "string" ||
    typeof value.stderr !== "string" ||
    !isString(value.message)
  ) {
    throw new Error(`${command} 未返回有效 cloudflared 安装结果`);
  }
}

function assertGatewayTunnelCreateResponse(
  command: string,
  value: unknown,
): asserts value is AppServerGatewayTunnelCreateResponse {
  if (
    !isRecord(value) ||
    !isRecord(value.result) ||
    !isBoolean(value.result.ok) ||
    !isString(value.result.tunnelName) ||
    !isString(value.result.message)
  ) {
    throw new Error(`${command} 未返回有效隧道创建结果`);
  }
  assertGatewayTunnelStatus(command, value.status);
}

function assertGatewayTunnelSyncWebhookResponse(
  command: string,
  value: unknown,
): asserts value is AppServerGatewayTunnelSyncWebhookUrlResponse {
  if (
    !isRecord(value) ||
    !isString(value.channel) ||
    !isString(value.webhookPath) ||
    !isString(value.publicBaseUrl) ||
    !isString(value.webhookUrl) ||
    !isBoolean(value.persisted)
  ) {
    throw new Error(`${command} 未返回有效隧道 webhook 同步结果`);
  }
}

function toLegacyGatewayTunnelStatus(
  value: AppServerGatewayTunnelStatusResponse,
): GatewayTunnelStatus {
  return {
    running: value.running,
    provider: value.provider,
    mode: value.mode,
    binary: value.binary,
    local_url: value.localUrl,
    public_base_url: value.publicBaseUrl,
    pid: value.pid,
    started_at: value.startedAt,
    last_error: value.lastError,
    last_exit: value.lastExit,
    command_preview: value.commandPreview,
    connector_active: value.connectorActive,
    connector_message: value.connectorMessage,
  };
}

function toLegacyGatewayTunnelProbeResult(
  value: AppServerGatewayTunnelProbeResponse,
): GatewayTunnelProbeResult {
  return {
    ok: value.ok,
    provider: value.provider,
    mode: value.mode,
    binary: value.binary,
    version: value.version,
    config_ready: value.configReady,
    message: value.message,
  };
}

function toLegacyCloudflaredInstallStatus(
  value: AppServerGatewayTunnelCloudflaredDetectResponse,
): CloudflaredInstallStatus {
  return {
    installed: value.installed,
    binary: value.binary,
    version: value.version,
    platform: value.platform,
    package_manager: value.packageManager,
    install_supported: value.installSupported,
    install_command: value.installCommand,
    requires_privilege: value.requiresPrivilege,
    message: value.message,
  };
}

function toLegacyCloudflaredInstallResult(
  value: AppServerGatewayTunnelCloudflaredInstallResponse,
): CloudflaredInstallResult {
  return {
    ok: value.ok,
    attempted: value.attempted,
    platform: value.platform,
    package_manager: value.packageManager,
    command: value.command,
    exit_code: value.exitCode,
    installed: value.installed,
    version: value.version,
    stdout: value.stdout,
    stderr: value.stderr,
    message: value.message,
  };
}

function toLegacyGatewayTunnelCreateResponse(
  value: AppServerGatewayTunnelCreateResponse,
): GatewayTunnelCreateResponse {
  return {
    result: {
      ok: value.result.ok,
      tunnel_name: value.result.tunnelName,
      tunnel_id: value.result.tunnelId,
      credentials_file: value.result.credentialsFile,
      dns_name: value.result.dnsName,
      public_base_url: value.result.publicBaseUrl,
      message: value.result.message,
    },
    status: toLegacyGatewayTunnelStatus(value.status),
  };
}

function toLegacyGatewayTunnelSyncWebhookResponse(
  value: AppServerGatewayTunnelSyncWebhookUrlResponse,
): GatewayTunnelSyncWebhookResponse {
  return {
    channel: value.channel,
    account_id: value.accountId,
    webhook_path: value.webhookPath,
    public_base_url: value.publicBaseUrl,
    webhook_url: value.webhookUrl,
    persisted: value.persisted,
  };
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
  const response = await createAppServerClient().startGatewayChannel({
    channel: params?.channel ?? "telegram",
    accountId: params?.accountId?.trim() || undefined,
    pollTimeoutSecs: params?.pollTimeoutSecs,
  });
  assertGatewayChannelStatusResponse(
    APP_SERVER_METHOD_GATEWAY_CHANNEL_START,
    response.result,
  );
  return response.result;
}

export async function gatewayChannelStop(params?: {
  channel?: "telegram" | "feishu" | "discord" | "wechat";
  accountId?: string;
}): Promise<GatewayChannelStatusResponse> {
  const response = await createAppServerClient().stopGatewayChannel({
    channel: params?.channel ?? "telegram",
    accountId: params?.accountId?.trim() || undefined,
  });
  assertGatewayChannelStatusResponse(
    APP_SERVER_METHOD_GATEWAY_CHANNEL_STOP,
    response.result,
  );
  return response.result;
}

export async function gatewayChannelStatus(params?: {
  channel?: "telegram" | "feishu" | "discord" | "wechat";
}): Promise<GatewayChannelStatusResponse> {
  const response = await createAppServerClient().readGatewayChannelStatus({
    channel: params?.channel ?? "telegram",
  });
  assertGatewayChannelStatusResponse(
    APP_SERVER_METHOD_GATEWAY_CHANNEL_STATUS,
    response.result,
  );
  return response.result;
}

export async function telegramChannelProbe(params?: {
  accountId?: string;
}): Promise<TelegramProbeResult> {
  const response = await createAppServerClient().probeTelegramChannel({
    accountId: params?.accountId?.trim() || undefined,
  });
  assertAppServerProbeResult(
    APP_SERVER_METHOD_TELEGRAM_CHANNEL_PROBE,
    response.result,
  );
  return toLegacyAccountProbeResult<TelegramProbeResult>(response.result);
}

export async function feishuChannelProbe(params?: {
  accountId?: string;
}): Promise<FeishuProbeResult> {
  const response = await createAppServerClient().probeFeishuChannel({
    accountId: params?.accountId?.trim() || undefined,
  });
  assertAppServerProbeResult(
    APP_SERVER_METHOD_FEISHU_CHANNEL_PROBE,
    response.result,
  );
  return toLegacyAccountProbeResult<FeishuProbeResult>(response.result);
}

export async function discordChannelProbe(params?: {
  accountId?: string;
}): Promise<DiscordProbeResult> {
  const response = await createAppServerClient().probeDiscordChannel({
    accountId: params?.accountId?.trim() || undefined,
  });
  assertAppServerProbeResult(
    APP_SERVER_METHOD_DISCORD_CHANNEL_PROBE,
    response.result,
  );
  return toLegacyAccountProbeResult<DiscordProbeResult>(response.result);
}

export async function wechatChannelProbe(params?: {
  accountId?: string;
}): Promise<WechatProbeResult> {
  const response = await createAppServerClient().probeWechatChannel({
    accountId: params?.accountId?.trim() || undefined,
  });
  assertAppServerProbeResult(
    APP_SERVER_METHOD_WECHAT_CHANNEL_PROBE,
    response.result,
  );
  return response.result as WechatProbeResult;
}

export async function wechatChannelLoginStart(params?: {
  baseUrl?: string;
  botType?: string;
  sessionKey?: string;
}): Promise<WechatLoginStartResult> {
  const response = await createAppServerClient().startWechatChannelLogin({
    baseUrl: params?.baseUrl?.trim() || undefined,
    botType: params?.botType?.trim() || undefined,
    sessionKey: params?.sessionKey?.trim() || undefined,
  });
  assertWechatLoginStartResult(
    APP_SERVER_METHOD_WECHAT_CHANNEL_LOGIN_START,
    response.result,
  );
  return response.result;
}

export async function wechatChannelLoginWait(params: {
  sessionKey: string;
  baseUrl?: string;
  botType?: string;
  timeoutMs?: number;
  accountName?: string;
}): Promise<WechatLoginWaitResult> {
  const response = await createAppServerClient().waitWechatChannelLogin({
    sessionKey: params.sessionKey,
    baseUrl: params.baseUrl?.trim() || undefined,
    botType: params.botType?.trim() || undefined,
    timeoutMs: params.timeoutMs,
    accountName: params.accountName?.trim() || undefined,
  });
  assertWechatLoginWaitResult(
    APP_SERVER_METHOD_WECHAT_CHANNEL_LOGIN_WAIT,
    response.result,
  );
  return response.result;
}

export async function wechatChannelListAccounts(): Promise<
  WechatConfiguredAccount[]
> {
  const response = await createAppServerClient().listWechatChannelAccounts();
  assertWechatChannelAccountListResponse(
    APP_SERVER_METHOD_WECHAT_CHANNEL_ACCOUNT_LIST,
    response.result,
  );
  return response.result.accounts.map(toWechatConfiguredAccount);
}

export async function wechatChannelRemoveAccount(params: {
  accountId: string;
  purgeData?: boolean;
}): Promise<void> {
  const response = await createAppServerClient().removeWechatChannelAccount({
    accountId: params.accountId,
    purgeData: params.purgeData ?? false,
  });
  assertVoidLikeResult(
    APP_SERVER_METHOD_WECHAT_CHANNEL_ACCOUNT_REMOVE,
    response.result,
  );
}

export async function wechatChannelSetRuntimeModel(params: {
  providerId: string;
  modelId: string;
}): Promise<string> {
  const response = await createAppServerClient().setWechatChannelRuntimeModel({
    providerId: params.providerId.trim(),
    modelId: params.modelId.trim(),
  });
  assertRuntimeModelSetResponse(
    APP_SERVER_METHOD_WECHAT_CHANNEL_RUNTIME_MODEL_SET,
    response.result,
  );
  return response.result.runtimeModel;
}

export async function gatewayTunnelProbe(): Promise<GatewayTunnelProbeResult> {
  const response = await createAppServerClient().probeGatewayTunnel();
  assertGatewayTunnelProbeResult(
    APP_SERVER_METHOD_GATEWAY_TUNNEL_PROBE,
    response.result,
  );
  return toLegacyGatewayTunnelProbeResult(response.result);
}

export async function gatewayTunnelDetectCloudflared(): Promise<CloudflaredInstallStatus> {
  const response = await createAppServerClient().detectGatewayTunnelCloudflared();
  assertCloudflaredInstallStatus(
    APP_SERVER_METHOD_GATEWAY_TUNNEL_CLOUDFLARED_DETECT,
    response.result,
  );
  return toLegacyCloudflaredInstallStatus(response.result);
}

export async function gatewayTunnelInstallCloudflared(params?: {
  confirm?: boolean;
}): Promise<CloudflaredInstallResult> {
  const response = await createAppServerClient().installGatewayTunnelCloudflared(
    {
      confirm: params?.confirm ?? false,
    },
  );
  assertCloudflaredInstallResult(
    APP_SERVER_METHOD_GATEWAY_TUNNEL_CLOUDFLARED_INSTALL,
    response.result,
  );
  return toLegacyCloudflaredInstallResult(response.result);
}

export async function gatewayTunnelCreate(params?: {
  tunnelName?: string;
  dnsName?: string;
  persist?: boolean;
}): Promise<GatewayTunnelCreateResponse> {
  const response = await createAppServerClient().createGatewayTunnel({
    tunnelName: params?.tunnelName?.trim() || undefined,
    dnsName: params?.dnsName?.trim() || undefined,
    persist: params?.persist ?? true,
  });
  assertGatewayTunnelCreateResponse(
    APP_SERVER_METHOD_GATEWAY_TUNNEL_CREATE,
    response.result,
  );
  return toLegacyGatewayTunnelCreateResponse(response.result);
}

export async function gatewayTunnelStart(): Promise<GatewayTunnelStatus> {
  const response = await createAppServerClient().startGatewayTunnel();
  assertGatewayTunnelStatus(
    APP_SERVER_METHOD_GATEWAY_TUNNEL_START,
    response.result,
  );
  return toLegacyGatewayTunnelStatus(response.result);
}

export async function gatewayTunnelStop(): Promise<GatewayTunnelStatus> {
  const response = await createAppServerClient().stopGatewayTunnel();
  assertGatewayTunnelStatus(
    APP_SERVER_METHOD_GATEWAY_TUNNEL_STOP,
    response.result,
  );
  return toLegacyGatewayTunnelStatus(response.result);
}

export async function gatewayTunnelRestart(): Promise<GatewayTunnelStatus> {
  const response = await createAppServerClient().restartGatewayTunnel();
  assertGatewayTunnelStatus(
    APP_SERVER_METHOD_GATEWAY_TUNNEL_RESTART,
    response.result,
  );
  return toLegacyGatewayTunnelStatus(response.result);
}

export async function gatewayTunnelStatus(): Promise<GatewayTunnelStatus> {
  const response = await createAppServerClient().readGatewayTunnelStatus();
  assertGatewayTunnelStatus(
    APP_SERVER_METHOD_GATEWAY_TUNNEL_STATUS,
    response.result,
  );
  return toLegacyGatewayTunnelStatus(response.result);
}

export async function gatewayTunnelSyncWebhookUrl(params: {
  channel: "feishu";
  accountId?: string;
  webhookPath?: string;
  persist?: boolean;
}): Promise<GatewayTunnelSyncWebhookResponse> {
  const response = await createAppServerClient().syncGatewayTunnelWebhookUrl({
    channel: params.channel,
    accountId: params.accountId?.trim() || undefined,
    webhookPath: params.webhookPath?.trim() || undefined,
    persist: params.persist ?? true,
  });
  assertGatewayTunnelSyncWebhookResponse(
    APP_SERVER_METHOD_GATEWAY_TUNNEL_SYNC_WEBHOOK_URL,
    response.result,
  );
  return toLegacyGatewayTunnelSyncWebhookResponse(response.result);
}
