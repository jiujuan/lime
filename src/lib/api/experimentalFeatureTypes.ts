export interface WebMcpConfig {
  enabled: boolean;
}

export interface ExperimentalFeatures {
  webmcp: WebMcpConfig;
}

export interface ToolCallingConfig {
  enabled: boolean;
  dynamic_filtering: boolean;
  native_input_examples: boolean;
}

export const DEFAULT_EXPERIMENTAL_FEATURES: ExperimentalFeatures = {
  webmcp: {
    enabled: false,
  },
};
