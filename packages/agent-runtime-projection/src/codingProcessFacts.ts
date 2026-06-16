export interface CodingProcessFactInput {
  process_id?: string;
  processId?: string;
  execution_process_status?: string;
  executionProcessStatus?: string;
  execution_surface?: string;
  executionSurface?: string;
  output_bytes?: number;
  outputBytes?: number;
  output_omitted_bytes?: number;
  outputOmittedBytes?: number;
  output_truncated?: boolean;
  outputTruncated?: boolean;
  stdout_bytes?: number;
  stdoutBytes?: number;
  stderr_bytes?: number;
  stderrBytes?: number;
  metadata?: unknown;
}

export interface CodingProcessFacts {
  processId?: string;
  executionProcessStatus?: string;
  executionSurface?: string;
  outputBytes?: number;
  outputOmittedBytes?: number;
  outputTruncated?: boolean;
  stdoutBytes?: number;
  stderrBytes?: number;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function stringValue(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function numberValue(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

function booleanValue(...values: unknown[]): boolean | undefined {
  for (const value of values) {
    if (typeof value === "boolean") return value;
  }
  return undefined;
}

export function codingProcessFactsFromInput(
  input: unknown,
): CodingProcessFacts {
  const record = isRecord(input) ? input : {};
  const metadata = isRecord(record.metadata) ? record.metadata : {};
  return {
    processId: stringValue(
      record.processId,
      record.process_id,
      metadata.processId,
      metadata.process_id,
    ),
    executionProcessStatus: stringValue(
      record.executionProcessStatus,
      record.execution_process_status,
      metadata.executionProcessStatus,
      metadata.execution_process_status,
    ),
    executionSurface: stringValue(
      record.executionSurface,
      record.execution_surface,
      metadata.executionSurface,
      metadata.execution_surface,
    ),
    outputBytes: numberValue(
      record.outputBytes,
      record.output_bytes,
      metadata.outputBytes,
      metadata.output_bytes,
    ),
    outputOmittedBytes: numberValue(
      record.outputOmittedBytes,
      record.output_omitted_bytes,
      metadata.outputOmittedBytes,
      metadata.output_omitted_bytes,
    ),
    outputTruncated: booleanValue(
      record.outputTruncated,
      record.output_truncated,
      metadata.outputTruncated,
      metadata.output_truncated,
    ),
    stdoutBytes: numberValue(
      record.stdoutBytes,
      record.stdout_bytes,
      metadata.stdoutBytes,
      metadata.stdout_bytes,
    ),
    stderrBytes: numberValue(
      record.stderrBytes,
      record.stderr_bytes,
      metadata.stderrBytes,
      metadata.stderr_bytes,
    ),
  };
}

export function mergeCodingProcessFacts(
  base: CodingProcessFacts,
  next: CodingProcessFacts,
): CodingProcessFacts {
  return {
    processId: next.processId ?? base.processId,
    executionProcessStatus:
      next.executionProcessStatus ?? base.executionProcessStatus,
    executionSurface: next.executionSurface ?? base.executionSurface,
    outputBytes: next.outputBytes ?? base.outputBytes,
    outputOmittedBytes: next.outputOmittedBytes ?? base.outputOmittedBytes,
    outputTruncated: next.outputTruncated ?? base.outputTruncated,
    stdoutBytes: next.stdoutBytes ?? base.stdoutBytes,
    stderrBytes: next.stderrBytes ?? base.stderrBytes,
  };
}
