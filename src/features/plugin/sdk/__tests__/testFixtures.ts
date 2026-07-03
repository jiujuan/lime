import type {
  LimeCapabilityInvokeRequest,
  LimeCapabilityTransport,
} from "../capabilityContract";
import {
  createLimeCapabilityErrorResponse,
  createLimeCapabilitySuccessResponse,
} from "../capabilityContract";
import type { LimeCapabilityName } from "../capabilityCatalog";
import { MockCapabilityHost } from "../MockCapabilityHost";
import { buildMockCapabilityProfile } from "../mockCapabilityProfile";
import { assertTestMockSdkEnvironment } from "../mockEnvironment";

export type LimeCapabilityMockHandler = (
  request: LimeCapabilityInvokeRequest,
) => Promise<unknown> | unknown;

export type LimeCapabilityMockHandlers = Partial<
  Record<LimeCapabilityName, Partial<Record<string, LimeCapabilityMockHandler>>>
>;

export function createMockLimeCapabilityTransport(
  handlers: LimeCapabilityMockHandlers = {},
): LimeCapabilityTransport {
  assertTestMockSdkEnvironment("createMockLimeCapabilityTransport");
  return {
    async dispatch(request) {
      const handler = handlers[request.capability]?.[request.method];
      if (!handler) {
        return createLimeCapabilityErrorResponse(
          {
            code: "UNSUPPORTED_CAPABILITY_METHOD",
            message: `${request.capability}.${request.method} is not available in the mock host.`,
          },
          {
            capability: request.capability,
            method: request.method,
            requestId: request.requestId,
          },
        );
      }

      try {
        return createLimeCapabilitySuccessResponse(await handler(request));
      } catch (error) {
        return createLimeCapabilityErrorResponse(error, {
          capability: request.capability,
          method: request.method,
          requestId: request.requestId,
        });
      }
    },
  };
}

export { MockCapabilityHost, buildMockCapabilityProfile };
