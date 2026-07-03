import type { PluginHostFlags } from "./types";
export declare const PLUGIN_LAB_STORAGE_KEY = "lime.pluginHost.labEnabled";
export declare const PLUGIN_HOST_FLAGS_STORAGE_KEY = "lime.pluginHost.flags";
export declare const defaultPluginHostFlags: PluginHostFlags;
export declare function resolvePluginHostFlags(overrides?: Partial<PluginHostFlags>): PluginHostFlags;
export declare function isPluginLabEnabled(): boolean;
