import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const supportedLocales = ["zh-CN", "zh-TW", "en-US", "ja-JP", "ko-KR"];
const defaultLocale = "zh-CN";

function loadLocale(locale) {
  const file = path.join(appRoot, "locales", `${locale}.json`);
  return JSON.parse(readFileSync(file, "utf8"));
}

export function resolveLocale(acceptLanguage = "") {
  const normalized = String(acceptLanguage).toLowerCase();
  if (normalized.includes("zh-tw") || normalized.includes("zh-hk")) {
    return "zh-TW";
  }
  for (const locale of supportedLocales) {
    if (normalized.includes(locale.toLowerCase())) {
      return locale;
    }
  }
  const languageTags = normalized
    .split(",")
    .map((item) => item.split(";")[0]?.split("-")[0]?.trim())
    .filter(Boolean);
  for (const language of languageTags) {
    if (language === "en") {
      return "en-US";
    }
    if (language === "ja") {
      return "ja-JP";
    }
    if (language === "ko") {
      return "ko-KR";
    }
    if (language === "zh") {
      return "zh-CN";
    }
  }
  return defaultLocale;
}

function translate(locale, key) {
  const selected = safeLoadLocale(locale);
  const fallback = locale === defaultLocale ? selected : safeLoadLocale(defaultLocale);
  return selected[key] ?? fallback[key] ?? key;
}

function safeLoadLocale(locale) {
  try {
    return loadLocale(locale);
  } catch {
    return {};
  }
}

export function buildBootstrapPayload(locale = defaultLocale) {
  return {
    appId: "content-factory-app",
    version: "2.2.0",
    status: "ready",
    locale,
    displayName: translate(locale, "app.displayName"),
    shortDescription: translate(locale, "app.shortDescription"),
    profile: "workbench",
    hostContract: {
      conversationDock: "center",
      articleWorkspaceDock: "right",
      articleWorkspaceTab: "articleWorkspace",
      artifactKind: "content_factory.workspace_patch"
    },
    runtime: {
      workerEntrypoint: "./src/runtime/content-factory-worker.mjs",
      sampleRequest: "./examples/runtime-request.sample.json"
    }
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function renderAppHtml(locale = defaultLocale) {
  const bootstrap = buildBootstrapPayload(locale);
  return `<!doctype html>
<html lang="${escapeHtml(locale)}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(bootstrap.displayName)}</title>
    <style>
      :root {
        color: #111827;
        background: #f8fafc;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
      }
      main {
        width: min(680px, calc(100vw - 48px));
        border: 1px solid #d1fae5;
        background: #ffffff;
        padding: 28px;
        box-shadow: 0 20px 60px rgba(15, 23, 42, 0.08);
      }
      h1 {
        margin: 0 0 10px;
        font-size: 24px;
        line-height: 1.2;
      }
      p {
        margin: 0;
        color: #475569;
        font-size: 14px;
        line-height: 1.7;
      }
      dl {
        display: grid;
        grid-template-columns: max-content 1fr;
        gap: 10px 16px;
        margin: 24px 0 0;
        font-size: 13px;
      }
      dt {
        color: #64748b;
      }
      dd {
        margin: 0;
        color: #0f172a;
        overflow-wrap: anywhere;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(bootstrap.displayName)}</h1>
      <p>${escapeHtml(translate(locale, "ui.runtime.summary"))}</p>
      <dl>
        <dt>${escapeHtml(translate(locale, "ui.runtime.center"))}</dt>
        <dd>${escapeHtml(translate(locale, "ui.runtime.centerValue"))}</dd>
        <dt>${escapeHtml(translate(locale, "ui.runtime.right"))}</dt>
        <dd>${escapeHtml(translate(locale, "ui.runtime.rightValue"))}</dd>
        <dt>${escapeHtml(translate(locale, "ui.runtime.status"))}</dt>
        <dd>${escapeHtml(translate(locale, "ui.runtime.ready"))}</dd>
      </dl>
    </main>
    <script type="application/json" id="content-factory-bootstrap">${escapeHtml(JSON.stringify(bootstrap))}</script>
  </body>
</html>`;
}

export function createContentFactoryDevServer() {
  return createServer((request, response) => {
    const locale = resolveLocale(request.headers["accept-language"]);
    const url = new URL(request.url ?? "/", "http://127.0.0.1");

    if (url.pathname === "/api/bootstrap") {
      response.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store"
      });
      response.end(JSON.stringify(buildBootstrapPayload(locale)));
      return;
    }

    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store"
    });
    response.end(renderAppHtml(locale));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number.parseInt(process.env.PORT ?? "0", 10);
  if (!Number.isInteger(port) || port <= 0) {
    console.error("CONTENT_FACTORY_UI_PORT_MISSING");
    process.exit(1);
  }
  createContentFactoryDevServer().listen(port, "127.0.0.1", () => {
    console.log(`[content-factory-app] dev runtime listening on http://127.0.0.1:${port}`);
  });
}
