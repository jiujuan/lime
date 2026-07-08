import type { PluginHostBridgeCapabilityRequest } from "./hostBridge";
import {
  isRecord,
  readString,
} from "./capabilityDispatcherRecord";
import { PluginCapabilityDispatcherError } from "./capabilityDispatcherError";

export function readInputRecord(
  request: PluginHostBridgeCapabilityRequest,
  method: string,
): Record<string, unknown> {
  if (isRecord(request.input)) {
    return request.input;
  }
  if (isRecord(request.invokeRequest?.args)) {
    return request.invokeRequest.args;
  }
  const firstArg = request.args?.[0];
  if (isRecord(firstArg)) {
    return firstArg;
  }
  throw new PluginCapabilityDispatcherError(
    "INVALID_CAPABILITY_INPUT",
    `${request.capability}.${method} requires an input object.`,
  );
}

export function readOptionalInputRecord(
  request: PluginHostBridgeCapabilityRequest,
): Record<string, unknown> {
  if (isRecord(request.input)) {
    return request.input;
  }
  if (request.input !== undefined) {
    throw new PluginCapabilityDispatcherError(
      "INVALID_CAPABILITY_INPUT",
      `${request.capability}.${request.method} requires an input object.`,
    );
  }
  if (isRecord(request.invokeRequest?.args)) {
    return request.invokeRequest.args;
  }
  const firstArg = request.args?.[0];
  if (isRecord(firstArg)) {
    return firstArg;
  }
  return {};
}

export function readBooleanOption(
  request: PluginHostBridgeCapabilityRequest,
  key: string,
): boolean {
  const input = readOptionalInputRecord(request);
  return input[key] === true;
}

export function readStringParam(
  request: PluginHostBridgeCapabilityRequest,
  key: string,
  argIndex: number,
): string {
  const fromInput = isRecord(request.input)
    ? readString(request.input[key])
    : undefined;
  const fromInvokeArgs = isRecord(request.invokeRequest?.args)
    ? readString(request.invokeRequest.args[key])
    : undefined;
  const fromArgs = readString(request.args?.[argIndex]);
  const value = fromInput ?? fromInvokeArgs ?? fromArgs;
  if (!value) {
    throw new PluginCapabilityDispatcherError(
      "INVALID_CAPABILITY_INPUT",
      `${request.capability}.${request.method} requires ${key}.`,
    );
  }
  return value;
}

export function readOptionalStringParam(
  request: PluginHostBridgeCapabilityRequest,
  key: string,
  argIndex: number,
): string | undefined {
  const fromInput = isRecord(request.input)
    ? readString(request.input[key])
    : undefined;
  const fromInvokeArgs = isRecord(request.invokeRequest?.args)
    ? readString(request.invokeRequest.args[key])
    : undefined;
  const fromArgs = readString(request.args?.[argIndex]);
  return fromInput ?? fromInvokeArgs ?? fromArgs;
}
