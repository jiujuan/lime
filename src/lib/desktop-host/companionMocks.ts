import type { CompanionPetStatus } from "../api/companion";

function createDefaultCompanionPetStatus(): CompanionPetStatus {
  return {
    endpoint: "ws://127.0.0.1:45554/companion/pet",
    server_listening: false,
    connected: false,
    client_id: null,
    platform: null,
    capabilities: [] as string[],
    last_event: null,
    last_error: null,
    last_state: null as
      | "hidden"
      | "idle"
      | "walking"
      | "thinking"
      | "done"
      | null,
  };
}

let mockCompanionPetStatus = createDefaultCompanionPetStatus();

export function clearCompanionMocks() {
  mockCompanionPetStatus = createDefaultCompanionPetStatus();
}

export const companionMocks: Record<
  string,
  (args?: Record<string, unknown>) => unknown
> = {
  companion_get_pet_status: () => ({
    ...mockCompanionPetStatus,
    capabilities: [...mockCompanionPetStatus.capabilities],
  }),
  companion_launch_pet: (args?: Record<string, unknown>) => {
    const request =
      (args?.request as Record<string, unknown> | undefined) ?? args ?? {};
    const endpoint =
      typeof request.endpoint === "string" && request.endpoint.trim()
        ? request.endpoint
        : mockCompanionPetStatus.endpoint;

    mockCompanionPetStatus = {
      ...mockCompanionPetStatus,
      endpoint,
      server_listening: true,
      last_event: "pet.launch_requested",
      last_error: null,
    };

    return {
      launched: true,
      resolved_path:
        typeof request.app_path === "string" ? request.app_path : null,
      endpoint,
      message: null,
    };
  },
  companion_send_pet_command: (args?: Record<string, unknown>) => {
    const request =
      (args?.request as Record<string, unknown> | undefined) ?? args ?? {};
    const event =
      typeof request.event === "string" ? request.event : "pet.show_bubble";
    const payload =
      (request.payload as Record<string, unknown> | undefined) ?? {};
    let lastState = mockCompanionPetStatus.last_state;
    if (event === "pet.hide") {
      lastState = "hidden";
    } else if (event === "pet.show") {
      lastState = "walking";
    } else if (
      event === "pet.state_changed" &&
      typeof payload.state === "string"
    ) {
      lastState = payload.state as
        | "hidden"
        | "idle"
        | "walking"
        | "thinking"
        | "done";
    }

    mockCompanionPetStatus = {
      ...mockCompanionPetStatus,
      last_event: event,
      last_error: null,
      last_state: lastState,
    };

    return {
      delivered: true,
      connected: mockCompanionPetStatus.connected,
    };
  },
};
