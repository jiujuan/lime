import type { PluginInstallMode } from "../types";
import { listPluginInstallModes } from "./normalizeInstallContract";
import {
  createInstallModeStrategy,
  type InstallModeStrategy,
} from "./installModeStrategy";

export class InstallModeRegistry {
  private readonly strategies: Map<PluginInstallMode, InstallModeStrategy>;

  constructor(strategies: readonly InstallModeStrategy[]) {
    this.strategies = new Map(strategies.map((strategy) => [strategy.mode, strategy]));
    this.assertExhaustive();
  }

  get(mode: PluginInstallMode): InstallModeStrategy {
    const strategy = this.strategies.get(mode);
    if (!strategy) {
      throw new Error(`Missing Plugin install mode strategy: ${mode}`);
    }
    return strategy;
  }

  listSupported(): PluginInstallMode[] {
    return Array.from(this.strategies.keys());
  }

  assertExhaustive(): void {
    const missing = listPluginInstallModes().filter(
      (mode) => !this.strategies.has(mode),
    );
    if (missing.length > 0) {
      throw new Error(`Missing Plugin install mode strategies: ${missing.join(", ")}`);
    }
  }
}

export const defaultInstallModeRegistry = new InstallModeRegistry(
  listPluginInstallModes().map(createInstallModeStrategy),
);
