import {
  AppServerClient,
  type AppServerExecutionProcessDrainOutputParams,
  type AppServerExecutionProcessDrainOutputResponse,
  type AppServerExecutionProcessEmptyResponse,
  type AppServerExecutionProcessIdParams,
  type AppServerExecutionProcessStartParams,
  type AppServerExecutionProcessStartResponse,
  type AppServerExecutionProcessStatusResponse,
  type AppServerExecutionProcessWriteStdinParams,
} from "@/lib/api/appServer";

export type ExecutionProcessStartParams = AppServerExecutionProcessStartParams;
export type ExecutionProcessStartResponse =
  AppServerExecutionProcessStartResponse;
export type ExecutionProcessStatusResponse =
  AppServerExecutionProcessStatusResponse;
export type ExecutionProcessDrainOutputResponse =
  AppServerExecutionProcessDrainOutputResponse;
export type ExecutionProcessEmptyResponse =
  AppServerExecutionProcessEmptyResponse;

export type ExecutionProcessAppServerClient = Pick<
  AppServerClient,
  | "startExecutionProcess"
  | "writeExecutionProcessStdin"
  | "interruptExecutionProcess"
  | "terminateExecutionProcess"
  | "readExecutionProcessStatus"
  | "drainExecutionProcessOutput"
>;

function createExecutionProcessAppServerClient(): ExecutionProcessAppServerClient {
  return new AppServerClient();
}

export async function startExecutionProcess(
  params: ExecutionProcessStartParams,
  client: ExecutionProcessAppServerClient = createExecutionProcessAppServerClient(),
): Promise<ExecutionProcessStartResponse> {
  return (await client.startExecutionProcess(params)).result;
}

export async function writeExecutionProcessStdin(
  params: AppServerExecutionProcessWriteStdinParams,
  client: ExecutionProcessAppServerClient = createExecutionProcessAppServerClient(),
): Promise<ExecutionProcessEmptyResponse> {
  return (await client.writeExecutionProcessStdin(params)).result;
}

export async function interruptExecutionProcess(
  processId: string,
  client: ExecutionProcessAppServerClient = createExecutionProcessAppServerClient(),
): Promise<ExecutionProcessStatusResponse> {
  return (await client.interruptExecutionProcess(idParams(processId))).result;
}

export async function terminateExecutionProcess(
  processId: string,
  client: ExecutionProcessAppServerClient = createExecutionProcessAppServerClient(),
): Promise<ExecutionProcessStatusResponse> {
  return (await client.terminateExecutionProcess(idParams(processId))).result;
}

export async function readExecutionProcessStatus(
  processId: string,
  client: ExecutionProcessAppServerClient = createExecutionProcessAppServerClient(),
): Promise<ExecutionProcessStatusResponse> {
  return (await client.readExecutionProcessStatus(idParams(processId))).result;
}

export async function drainExecutionProcessOutput(
  params: AppServerExecutionProcessDrainOutputParams = {},
  client: ExecutionProcessAppServerClient = createExecutionProcessAppServerClient(),
): Promise<ExecutionProcessDrainOutputResponse> {
  return (await client.drainExecutionProcessOutput(params)).result;
}

function idParams(processId: string): AppServerExecutionProcessIdParams {
  const trimmed = processId.trim();
  if (!trimmed) {
    throw new Error("executionProcess requires processId");
  }
  return { processId: trimmed };
}
