import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBootstrapPayload,
  createContentFactoryDevServer,
  renderAppHtml,
  resolveLocale
} from "../src/ui/dev-server.mjs";

test("UI runtime exposes bootstrap contract for Lime host", () => {
  const bootstrap = buildBootstrapPayload("en-US");

  assert.equal(bootstrap.appId, "content-factory-app");
  assert.equal(bootstrap.status, "ready");
  assert.equal(bootstrap.profile, "workbench");
  assert.equal(bootstrap.hostContract.conversationDock, "center");
  assert.equal(bootstrap.hostContract.articleWorkspaceDock, "right");
  assert.equal(bootstrap.hostContract.articleWorkspaceTab, "articleWorkspace");
  assert.equal(bootstrap.hostContract.artifactKind, "content_factory.workspace_patch");
});

test("UI runtime resolves current five locales", () => {
  assert.equal(resolveLocale("zh-TW,zh;q=0.9"), "zh-TW");
  assert.equal(resolveLocale("en-US,en;q=0.9"), "en-US");
  assert.equal(resolveLocale("ja;q=0.9"), "ja-JP");
  assert.equal(resolveLocale("ko;q=0.9"), "ko-KR");
  assert.equal(resolveLocale("fr-FR,fr;q=0.9"), "zh-CN");
});

test("UI runtime renders installed plugin routes without owning the article workspace", () => {
  const html = renderAppHtml("zh-CN");

  assert.match(html, /内容工厂/);
  assert.match(html, /Claw/);
  assert.match(html, /Article Workspace/);
});

test("UI runtime serves /api/bootstrap for App Server readiness probe", async () => {
  const server = createContentFactoryDevServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/bootstrap`);
    const json = await response.json();
    assert.equal(response.status, 200);
    assert.equal(json.appId, "content-factory-app");
    assert.equal(json.status, "ready");
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
