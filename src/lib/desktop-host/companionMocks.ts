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
};
