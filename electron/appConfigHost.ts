import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

type HostArgs = Record<string, unknown> | null | undefined;

const CONFIG_YAML_FILE = "config.yaml";

export class AppConfigHost {
  readonly #userDataDir: string;

  constructor(userDataDir: string) {
    this.#userDataDir = userDataDir;
  }

  async readConfig(): Promise<Record<string, unknown>> {
    const fallback = buildDefaultConfig();
    const config = await this.#readYamlConfig();
    return config ? { ...fallback, ...config } : fallback;
  }

  async saveConfig(args: HostArgs): Promise<null> {
    const config = readRecord(args, "config") ?? toRecord(args) ?? {};
    await mkdir(this.#userDataDir, { recursive: true });
    await writeFile(this.#configYamlPath(), stringifyYaml(config), "utf8");
    return null;
  }

  async #readYamlConfig(): Promise<Record<string, unknown> | null> {
    const configPath = this.#configYamlPath();
    let text: string;
    try {
      text = await readFile(configPath, "utf8");
    } catch (error) {
      if (isNotFoundError(error)) {
        return null;
      }
      throw error;
    }

    const parsed = parseYaml(text) as unknown;
    if (!parsed) {
      return null;
    }
    const record = toRecord(parsed);
    if (!record) {
      throw new Error(`${CONFIG_YAML_FILE} must contain an object`);
    }
    return record;
  }

  #configYamlPath(): string {
    return path.join(this.#userDataDir, CONFIG_YAML_FILE);
  }
}

function readRecord(
  value: unknown,
  key: string,
): Record<string, unknown> | null {
  const record = toRecord(value);
  const nested = record?.[key];
  return toRecord(nested);
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  return "code" in error && (error as { code?: unknown }).code === "ENOENT";
}

export function buildDefaultConfig(): Record<string, unknown> {
  return {
    server: {
      host: "127.0.0.1",
      port: 8787,
      api_key: "",
      response_cache: {
        enabled: true,
        ttl_secs: 600,
        max_entries: 200,
        max_body_bytes: 1048576,
        cacheable_status_codes: [200],
      },
      tls: { enable: false, cert_path: null, key_path: null },
    },
    default_provider: "openai",
    remote_management: {
      allow_remote: false,
      secret_key: null,
      disable_control_panel: false,
    },
    quota_exceeded: {
      switch_project: true,
      switch_preview_model: false,
      cooldown_seconds: 60,
    },
    ampcode: {
      upstream_url: null,
      model_mappings: [],
      restrict_management_to_localhost: true,
    },
    proxy_url: null,
    minimize_to_tray: false,
    language: "zh-CN",
    experimental: { webmcp: { enabled: false } },
    tool_calling: {
      enabled: true,
      dynamic_filtering: true,
      native_input_examples: false,
    },
    automation: {
      enabled: false,
      poll_interval_secs: 30,
      enable_history: true,
    },
    workspace_preferences: {
      schema_version: 3,
      media_defaults: {},
      service_models: {},
    },
    navigation: { schema_version: 3, enabled_items: [] },
    crash_reporting: {
      enabled: true,
      dsn: null,
      environment: "development",
      sample_rate: 1,
      send_pii: false,
    },
  };
}
