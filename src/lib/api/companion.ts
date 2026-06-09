import { safeInvoke, safeListen } from "@/lib/dev-bridge";
import type { UnlistenFn } from "@/lib/desktop-host/event";
import { assertNotDiagnosticFacade } from "./diagnosticFacade";

export const COMPANION_PET_STATUS_EVENT = "companion-pet-status";
export const COMPANION_OPEN_PROVIDER_SETTINGS_EVENT =
  "companion-open-provider-settings";
export const COMPANION_REQUEST_PROVIDER_SYNC_EVENT =
  "companion-request-provider-sync";
export const COMPANION_REQUEST_PET_CHEER_EVENT = "companion-request-pet-cheer";
export const COMPANION_REQUEST_PET_NEXT_STEP_EVENT =
  "companion-request-pet-next-step";
export const COMPANION_REQUEST_PET_CHAT_EVENT = "companion-request-pet-chat";
export const COMPANION_REQUEST_PET_CHAT_RESET_EVENT =
  "companion-request-pet-chat-reset";
export const COMPANION_REQUEST_PET_VOICE_CHAT_EVENT =
  "companion-request-pet-voice-chat";
export const COMPANION_PET_VOICE_TRANSCRIPT_EVENT =
  "companion-pet-voice-transcript";
export const COMPANION_PROVIDER_OVERVIEW_CAPABILITY = "provider-overview";

export type CompanionPetVisualState =
  | "hidden"
  | "idle"
  | "walking"
  | "thinking"
  | "done";

export interface CompanionPetStatus {
  endpoint: string;
  server_listening: boolean;
  connected: boolean;
  client_id: string | null;
  platform: string | null;
  capabilities: string[];
  last_event: string | null;
  last_error: string | null;
  last_state: CompanionPetVisualState | null;
}

export interface CompanionLaunchPetRequest {
  app_path?: string | null;
  endpoint?: string | null;
  client_id?: string | null;
  protocol_version?: number | null;
}

export interface CompanionLaunchPetResult {
  launched: boolean;
  resolved_path: string | null;
  endpoint: string;
  message: string | null;
}

export interface CompanionPetCommandRequest<
  TPayload = Record<string, unknown>,
> {
  event: string;
  payload?: TPayload | null;
}

export interface CompanionPetSendResult {
  delivered: boolean;
  connected: boolean;
}

export interface CompanionPetChatRequestPayload {
  text: string;
  source?: string | null;
}

export interface CompanionPetLive2DActionPayload {
  expressions?: Array<number | string>;
  emotion_tags?: string[];
  motion_group?: string | null;
  motion_index?: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertNotErrorEnvelope(command: string, value: unknown): void {
  if (isRecord(value) && "error" in value) {
    throw new Error(`${command} returned an error envelope`);
  }
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isCompanionPetVisualState(
  value: unknown,
): value is CompanionPetVisualState | null {
  return (
    value === null ||
    value === "hidden" ||
    value === "idle" ||
    value === "walking" ||
    value === "thinking" ||
    value === "done"
  );
}

function isCompanionPetStatus(value: unknown): value is CompanionPetStatus {
  return (
    isRecord(value) &&
    typeof value.endpoint === "string" &&
    typeof value.server_listening === "boolean" &&
    typeof value.connected === "boolean" &&
    isNullableString(value.client_id) &&
    isNullableString(value.platform) &&
    Array.isArray(value.capabilities) &&
    value.capabilities.every((capability) => typeof capability === "string") &&
    isNullableString(value.last_event) &&
    isNullableString(value.last_error) &&
    isCompanionPetVisualState(value.last_state)
  );
}

function isCompanionLaunchPetResult(
  value: unknown,
): value is CompanionLaunchPetResult {
  return (
    isRecord(value) &&
    typeof value.launched === "boolean" &&
    isNullableString(value.resolved_path) &&
    typeof value.endpoint === "string" &&
    isNullableString(value.message)
  );
}

function isCompanionPetSendResult(
  value: unknown,
): value is CompanionPetSendResult {
  return (
    isRecord(value) &&
    typeof value.delivered === "boolean" &&
    typeof value.connected === "boolean"
  );
}

async function invokeCompanionCommand<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const result = args
    ? await safeInvoke<unknown>(command, args)
    : await safeInvoke<unknown>(command);
  assertNotDiagnosticFacade(command, result, "真实 Companion current 通道");
  assertNotErrorEnvelope(command, result);
  return result as T;
}

export async function getCompanionPetStatus(): Promise<CompanionPetStatus> {
  const result = await invokeCompanionCommand<unknown>(
    "companion_get_pet_status",
  );
  if (!isCompanionPetStatus(result)) {
    throw new Error("companion_get_pet_status did not return companion status");
  }
  return result;
}

export async function launchCompanionPet(
  request: CompanionLaunchPetRequest = {},
): Promise<CompanionLaunchPetResult> {
  const result = await invokeCompanionCommand<unknown>("companion_launch_pet", {
    request,
  });
  if (!isCompanionLaunchPetResult(result)) {
    throw new Error("companion_launch_pet did not return launch result");
  }
  return result;
}

export async function sendCompanionPetCommand<
  TPayload = Record<string, unknown>,
>(
  request: CompanionPetCommandRequest<TPayload>,
): Promise<CompanionPetSendResult> {
  const result = await invokeCompanionCommand<unknown>(
    "companion_send_pet_command",
    {
      request,
    },
  );
  if (!isCompanionPetSendResult(result)) {
    throw new Error("companion_send_pet_command did not return send result");
  }
  return result;
}

export async function listenCompanionPetStatus(
  handler: (status: CompanionPetStatus) => void,
): Promise<UnlistenFn> {
  return safeListen<CompanionPetStatus>(COMPANION_PET_STATUS_EVENT, (event) => {
    handler(event.payload);
  });
}
