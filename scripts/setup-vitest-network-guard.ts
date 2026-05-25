import { afterEach, beforeEach } from "vitest";

import { installVitestNetworkGuard } from "./lib/vitest-network-guard";

installVitestNetworkGuard();

beforeEach(() => {
  installVitestNetworkGuard();
});

afterEach(() => {
  installVitestNetworkGuard();
});
