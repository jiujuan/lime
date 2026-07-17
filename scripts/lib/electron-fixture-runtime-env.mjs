import {
  DARWIN_ARM64_SYSTEM_PATH_PREFIX,
  withNativeSystemPath,
} from "./native-executable-env.mjs";

export { DARWIN_ARM64_SYSTEM_PATH_PREFIX };

export function withElectronFixtureSystemPath(env, options = {}) {
  return withNativeSystemPath(env, options);
}
