import i18next from "i18next";

function interpolateDefaultText(
  defaultValue: string,
  options?: Record<string, unknown>,
): string {
  if (!options) {
    return defaultValue;
  }
  return defaultValue.replace(/\{\{\s*([^}\s]+)\s*\}\}/g, (_, key) => {
    const value = options[key];
    return value === undefined || value === null ? "" : String(value);
  });
}

export function agentText(
  key: string,
  defaultValue: string,
  options?: Record<string, unknown>,
): string {
  if (!i18next.isInitialized) {
    return interpolateDefaultText(defaultValue, options);
  }
  return String(
    i18next.t(key, {
      defaultValue,
      ns: "agent",
      ...options,
    }),
  );
}
