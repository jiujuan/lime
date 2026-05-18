import type { AgentAppInstallMode } from "../types";
import { listAgentAppInstallModes } from "./normalizeInstallContract";
import {
  createInstallModeStrategy,
  type InstallModeStrategy,
} from "./installModeStrategy";

export class InstallModeRegistry {
  private readonly strategies: Map<AgentAppInstallMode, InstallModeStrategy>;

  constructor(strategies: readonly InstallModeStrategy[]) {
    this.strategies = new Map(strategies.map((strategy) => [strategy.mode, strategy]));
    this.assertExhaustive();
  }

  get(mode: AgentAppInstallMode): InstallModeStrategy {
    const strategy = this.strategies.get(mode);
    if (!strategy) {
      throw new Error(`Missing Agent App install mode strategy: ${mode}`);
    }
    return strategy;
  }

  listSupported(): AgentAppInstallMode[] {
    return Array.from(this.strategies.keys());
  }

  assertExhaustive(): void {
    const missing = listAgentAppInstallModes().filter(
      (mode) => !this.strategies.has(mode),
    );
    if (missing.length > 0) {
      throw new Error(`Missing Agent App install mode strategies: ${missing.join(", ")}`);
    }
  }
}

export const defaultInstallModeRegistry = new InstallModeRegistry(
  listAgentAppInstallModes().map(createInstallModeStrategy),
);
