export class PluginCapabilityDispatcherError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "PluginCapabilityDispatcherError";
    this.code = code;
  }
}
