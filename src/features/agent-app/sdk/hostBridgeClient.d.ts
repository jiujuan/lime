import { type LimeCapabilityInvoker, type LimeCapabilityInvokeRequest, type LimeCapabilityInvokeResponse, type LimeCapabilityMethod, type LimeCapabilityName } from "./capabilityContract";
export declare const LIME_AGENT_APP_BRIDGE_PROTOCOL = "lime.agentApp.bridge";
export declare const LIME_AGENT_APP_BRIDGE_VERSION = 1;
export interface LimeAgentAppBridgeClientMessage {
    protocol: typeof LIME_AGENT_APP_BRIDGE_PROTOCOL;
    version: typeof LIME_AGENT_APP_BRIDGE_VERSION;
    type: string;
    requestId?: string;
    appId: string;
    entryKey?: string;
    payload?: unknown;
}
interface LimeHostBridgeMessageEvent {
    data: unknown;
    origin: string;
    source: unknown;
}
interface LimeHostBridgeWindowLike {
    readonly parent: {
        postMessage(message: LimeAgentAppBridgeClientMessage, targetOrigin: string): void;
    };
    readonly self?: unknown;
    addEventListener(type: "message", listener: (event: LimeHostBridgeMessageEvent) => void): void;
    removeEventListener(type: "message", listener: (event: LimeHostBridgeMessageEvent) => void): void;
    setTimeout(handler: () => void, timeoutMs: number): number;
    clearTimeout(timerId: number): void;
}
export interface CreateLimeHostBridgeCapabilityInvokerOptions {
    appId: string;
    entryKey?: string;
    windowRef?: LimeHostBridgeWindowLike;
    hostWindow?: LimeHostBridgeWindowLike;
    targetOrigin?: string;
    trustedHostOrigin?: string;
    requestTimeoutMs?: number;
    requestIdPrefix?: string;
    onSnapshot?: LimeHostBridgeEventHandler;
    onTheme?: LimeHostBridgeEventHandler;
    onVisibility?: LimeHostBridgeEventHandler;
    onCapabilityEvent?: LimeHostBridgeCapabilityEventHandler;
}
export interface LimeHostBridgeCapabilityInvoker extends LimeCapabilityInvoker {
    send(type: string, payload?: unknown, requestId?: string): void;
    request(type: string, payload?: unknown, options?: LimeHostBridgeLegacyRequestOptions): Promise<unknown>;
    ready(): void;
    getSnapshot(): void;
    notifyHost(message: string, level?: LimeHostBridgeNotifyPayload["level"]): Promise<LimeCapabilityInvokeResponse<{
        accepted: true;
    }>>;
    sendReady(): void;
    getHostSnapshot(): Promise<LimeCapabilityInvokeResponse<unknown>>;
    notifyHost(payload: LimeHostBridgeNotifyPayload): Promise<LimeCapabilityInvokeResponse<{
        accepted: true;
    }>>;
    navigateHost(payload: LimeHostBridgeNavigatePayload): Promise<LimeCapabilityInvokeResponse<{
        navigatedTo: string;
    }>>;
    openExternalHost(payload: LimeHostBridgeOpenExternalPayload): Promise<LimeCapabilityInvokeResponse<{
        opened: true;
    }>>;
    selectDirectoryHost(payload?: LimeHostBridgeSelectDirectoryPayload, options?: LimeHostBridgeLegacyRequestOptions): Promise<LimeCapabilityInvokeResponse<LimeHostBridgeSelectDirectoryResult>>;
    downloadHost(payload: LimeHostBridgeDownloadPayload, options?: LimeHostBridgeLegacyRequestOptions): Promise<LimeCapabilityInvokeResponse<{
        downloaded: true;
    }>>;
    onHostSnapshot(handler: LimeHostBridgeEventHandler): () => void;
    onThemeUpdate(handler: LimeHostBridgeEventHandler): () => void;
    onVisibilityChange(handler: LimeHostBridgeEventHandler): () => void;
    onCapabilityEvent(handler: LimeHostBridgeCapabilityEventHandler): () => void;
    invoke<Capability extends LimeCapabilityName, Method extends LimeCapabilityMethod<Capability>>(request: LimeHostBridgeLegacyInvokeRequest<Capability, Method>, options?: LimeHostBridgeLegacyRequestOptions): Promise<unknown>;
    subscribe(request: LimeHostBridgeCapabilitySubscribeRequest, options?: LimeHostBridgeLegacyRequestOptions): Promise<unknown>;
    unsubscribe(subscriptionId: string, options?: LimeHostBridgeLegacyRequestOptions): Promise<unknown>;
    subscribeCapability(request: LimeHostBridgeCapabilitySubscribeRequest, handler?: LimeHostBridgeCapabilityEventHandler, options?: LimeHostBridgeLegacyRequestOptions): Promise<LimeCapabilityInvokeResponse<LimeHostBridgeCapabilitySubscription>>;
    unsubscribeCapability(subscriptionId: string, options?: LimeHostBridgeLegacyRequestOptions): Promise<LimeCapabilityInvokeResponse<LimeHostBridgeCapabilityUnsubscribeResult>>;
    download(url: string, fileName?: string, options?: LimeHostBridgeLegacyRequestOptions): Promise<unknown>;
    getCallLog(): LimeHostBridgeLegacyCallLogEntry[];
    dispose(): void;
    readonly pendingRequestCount: number;
}
export interface LimeHostBridgeLegacyRequestOptions {
    requestId?: string;
    timeoutMs?: number;
}
export interface LimeHostBridgeLegacyInvokeRequest<Capability extends LimeCapabilityName = LimeCapabilityName, Method extends LimeCapabilityMethod<Capability> = LimeCapabilityMethod<Capability>> {
    capability: Capability;
    method: Method;
    args?: unknown;
    provenance?: LimeCapabilityInvokeRequest["provenance"];
}
export interface LimeHostBridgeLegacyCallLogEntry {
    capability: string;
    method: string;
    args?: unknown;
}
export interface LimeHostBridgeNotifyPayload {
    message: string;
    level?: "info" | "success" | "warning" | "error";
}
export interface LimeHostBridgeDownloadPayload {
    url: string;
    fileName?: string;
}
export interface LimeHostBridgeNavigatePayload {
    route?: string;
    url?: string;
}
export interface LimeHostBridgeOpenExternalPayload {
    url: string;
}
export interface LimeHostBridgeSelectDirectoryPayload {
    title?: string;
}
export interface LimeHostBridgeSelectDirectoryResult {
    path: string | null;
    cancelled: boolean;
    message?: string;
}
export type LimeHostBridgeEventHandler = (payload: unknown) => void;
export interface LimeHostThemeSnapshot {
    themeMode?: string;
    effectiveThemeMode?: string;
    colorSchemeId?: string;
    tokens?: Record<string, string>;
}
export interface LimeHostThemeDocumentLike {
    documentElement: LimeHostThemeElementLike;
}
export interface LimeHostThemeElementLike {
    dataset: Record<string, string | undefined>;
    style: {
        colorScheme?: string;
        setProperty(name: string, value: string): void;
    };
}
export interface SyncLimeHostThemeOptions {
    documentRef?: LimeHostThemeDocumentLike;
    allowedTokenPrefixes?: string[];
}
export interface LimeHostBridgeCapabilitySubscribeRequest {
    capability: LimeCapabilityName;
    topic: string;
    input?: unknown;
    subscriptionId?: string;
    pollIntervalMs?: number;
    bridgeAction?: string;
}
export interface LimeHostBridgeCapabilitySubscription {
    subscriptionId: string;
    capability: LimeCapabilityName;
    topic: string;
    taskId?: string;
    pollIntervalMs?: number;
    bridgeAction?: string;
}
export interface LimeHostBridgeCapabilityUnsubscribeResult {
    subscriptionId: string;
    unsubscribed: boolean;
}
export interface LimeHostBridgeCapabilityEvent {
    subscriptionId?: string;
    capability?: string;
    topic?: string;
    eventType?: string;
    taskId?: string;
    task?: unknown;
    events?: unknown[];
    snapshot?: unknown;
    error?: unknown;
    emittedAt?: string;
}
export type LimeHostBridgeCapabilityEventHandler = (event: LimeHostBridgeCapabilityEvent) => void;
export declare function applyLimeHostTheme(payload: unknown, options?: SyncLimeHostThemeOptions): LimeHostThemeSnapshot | null;
export declare function syncLimeHostTheme(invoker: Pick<LimeHostBridgeCapabilityInvoker, "onHostSnapshot" | "onThemeUpdate" | "getHostSnapshot">, options?: SyncLimeHostThemeOptions): () => void;
export declare function createLimeHostBridgeCapabilityInvoker(options: CreateLimeHostBridgeCapabilityInvokerOptions): LimeHostBridgeCapabilityInvoker;
export {};
