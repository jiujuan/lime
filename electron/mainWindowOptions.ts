import type { BrowserWindowConstructorOptions } from "electron";

export type MainWindowChromeOptions = Pick<
  BrowserWindowConstructorOptions,
  "titleBarStyle" | "trafficLightPosition"
>;

export type MainWindowStartupOptions = Pick<
  BrowserWindowConstructorOptions,
  "backgroundColor" | "show"
>;

interface MainWindowStartupHtmlOptions {
  appName: string;
  iconDataUrl?: string | null;
  locale?: string;
  slogan?: string;
  subtitle?: string;
}

const MAIN_WINDOW_STARTUP_COPY = {
  "zh-CN": {
    slogan: "青柠一下，灵感即来",
    subtitle: "从一句想法，到成稿、成图、成片、成事",
  },
  "zh-TW": {
    slogan: "青檸一下，靈感即來",
    subtitle: "從一句想法，到成稿、成圖、成片、成事",
  },
  "en-US": {
    slogan: "Tap Lime, inspiration arrives",
    subtitle:
      "From one thought to polished copy, images, videos, and finished work",
  },
  "ja-JP": {
    slogan: "Lime で、ひらめきをすぐに",
    subtitle: "一つのアイデアから、原稿・画像・動画・成果まで",
  },
  "ko-KR": {
    slogan: "Lime으로, 영감이 바로",
    subtitle: "한 줄의 아이디어에서 글, 이미지, 영상, 완성된 일까지",
  },
} as const;

export function buildMainWindowStartupOptions(): MainWindowStartupOptions {
  return {
    backgroundColor: "#f7fbf4",
    show: false,
  };
}

export function buildMainWindowStartupHtml({
  appName,
  iconDataUrl,
  locale,
  slogan,
  subtitle,
}: MainWindowStartupHtmlOptions): string {
  const copy = resolveMainWindowStartupCopy(locale);
  const escapedAppName = escapeHtml(appName);
  const escapedSlogan = escapeHtml(slogan ?? copy.slogan);
  const escapedSubtitle = escapeHtml(subtitle ?? copy.subtitle);
  const logoMarkup = iconDataUrl
    ? `<img class="startup-logo" src="${escapeHtml(iconDataUrl)}" alt="${escapedAppName}" data-lime-startup-logo />`
    : `<div class="startup-logo startup-logo-fallback" aria-label="${escapedAppName}" data-lime-startup-logo>${escapedAppName.slice(0, 1)}</div>`;

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      :root {
        color-scheme: light;
        background: #f7fbf4;
      }

      html,
      body {
        width: 100%;
        height: 100%;
        margin: 0;
        overflow: hidden;
        background:
          radial-gradient(circle at 20% 18%, rgba(132, 204, 22, 0.18), transparent 30%),
          radial-gradient(circle at 78% 12%, rgba(250, 204, 21, 0.14), transparent 28%),
          radial-gradient(circle at 50% 84%, rgba(34, 197, 94, 0.1), transparent 28%),
          linear-gradient(180deg, #fbfff8 0%, #edf5ea 48%, #fbfff8 100%);
        color: #0f172a;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif;
        -webkit-app-region: drag;
        user-select: none;
      }

      body {
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .startup-orb {
        position: absolute;
        border-radius: 999px;
        filter: blur(40px);
        animation: startup-orb-float 10s ease-in-out infinite;
        pointer-events: none;
      }

      .startup-orb-primary {
        top: -72px;
        left: -56px;
        width: 280px;
        height: 280px;
        background: rgba(132, 204, 22, 0.22);
      }

      .startup-orb-secondary {
        top: 8%;
        right: -96px;
        width: 340px;
        height: 340px;
        background: rgba(250, 204, 21, 0.14);
        animation-delay: -2.2s;
      }

      .startup-orb-tertiary {
        bottom: -84px;
        left: 18%;
        width: 260px;
        height: 260px;
        background: rgba(34, 197, 94, 0.14);
        animation-delay: -4s;
      }

      .startup-stage {
        position: relative;
        z-index: 1;
        width: min(860px, calc(100vw - 40px));
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        opacity: 1;
      }

      .startup-logo-stack {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        width: min(360px, 78vw);
        height: min(360px, 78vw);
      }

      .startup-logo-glow {
        position: absolute;
        inset: 12% 12% 16%;
        border-radius: 999px;
        background: radial-gradient(
          circle,
          rgba(163, 230, 53, 0.4) 0%,
          rgba(163, 230, 53, 0.16) 38%,
          rgba(250, 204, 21, 0.1) 60%,
          transparent 78%
        );
        filter: blur(26px);
        animation: startup-glow-pulse 2.8s ease-in-out infinite;
      }

      .startup-logo {
        position: relative;
        width: clamp(240px, 34vw, 320px);
        height: clamp(240px, 34vw, 320px);
        object-fit: contain;
        animation: startup-logo-float 4.2s ease-in-out infinite;
        filter: drop-shadow(0 28px 44px rgba(15, 23, 42, 0.16));
      }

      .startup-logo-fallback {
        display: flex;
        align-items: center;
        justify-content: center;
        background: #13bf73;
        color: #ffffff;
        font-size: 96px;
        font-weight: 700;
      }

      .startup-copy {
        position: relative;
        margin-top: 12px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
      }

      .startup-copy-glow {
        position: absolute;
        inset: 0 auto auto;
        width: min(420px, 92vw);
        height: 112px;
        border-radius: 999px;
        background: radial-gradient(
          circle,
          rgba(163, 230, 53, 0.24) 0%,
          rgba(250, 204, 21, 0.18) 36%,
          transparent 74%
        );
        filter: blur(26px);
        pointer-events: none;
      }

      .startup-slogan {
        position: relative;
        margin: 22px 0 0;
        max-width: 18em;
        font-size: clamp(28px, 4vw, 38px);
        line-height: 1.16;
        font-weight: 700;
        letter-spacing: -0.04em;
        color: #0f172a;
        text-wrap: balance;
        text-shadow:
          0 0 18px rgba(163, 230, 53, 0.26),
          0 10px 30px rgba(15, 23, 42, 0.1),
          0 0 42px rgba(250, 204, 21, 0.14);
      }

      .startup-slogan::before {
        content: "";
        position: absolute;
        inset: 12% -10% -18%;
        z-index: -1;
        border-radius: 999px;
        background: radial-gradient(
          circle,
          rgba(163, 230, 53, 0.36) 0%,
          rgba(250, 204, 21, 0.2) 34%,
          rgba(255, 255, 255, 0.12) 52%,
          transparent 76%
        );
        filter: blur(30px);
        transform: scale(1.02);
      }

      .startup-slogan::after {
        content: "";
        position: absolute;
        inset: auto 12% -6% 12%;
        z-index: -1;
        height: 18px;
        border-radius: 999px;
        background: linear-gradient(
          90deg,
          rgba(132, 204, 22, 0) 0%,
          rgba(132, 204, 22, 0.42) 18%,
          rgba(250, 204, 21, 0.45) 50%,
          rgba(132, 204, 22, 0.42) 82%,
          rgba(132, 204, 22, 0) 100%
        );
        filter: blur(16px);
        opacity: 0.95;
      }

      .startup-subtitle {
        position: relative;
        margin: 0;
        max-width: min(33em, calc(100vw - 56px));
        font-size: clamp(15px, 2vw, 18px);
        line-height: 1.72;
        font-weight: 500;
        letter-spacing: 0;
        color: #667085;
        text-wrap: balance;
        text-shadow: 0 1px 0 rgba(255, 255, 255, 0.35);
      }

      .startup-progress-track {
        position: relative;
        overflow: hidden;
        margin-top: 30px;
        width: min(320px, 72vw);
        height: 8px;
        border-radius: 999px;
        background: linear-gradient(90deg, rgba(226, 232, 240, 0.82) 0%, rgba(226, 232, 240, 0.96) 100%);
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.32),
          0 12px 28px rgba(15, 23, 42, 0.08);
      }

      .startup-progress-bar {
        position: absolute;
        inset: 0 auto 0 0;
        width: 44%;
        border-radius: inherit;
        background: linear-gradient(
          90deg,
          rgba(132, 204, 22, 0.96) 0%,
          rgba(250, 204, 21, 0.9) 100%
        );
        box-shadow: 0 0 24px rgba(163, 230, 53, 0.35);
        animation: startup-progress-shift 1.6s ease-in-out infinite;
      }

      @keyframes startup-orb-float {
        0%,
        100% {
          transform: translate3d(0, 0, 0) scale(1);
        }

        50% {
          transform: translate3d(0, -16px, 0) scale(1.06);
        }
      }

      @keyframes startup-logo-float {
        0%,
        100% {
          transform: translateY(0);
        }

        50% {
          transform: translateY(-8px);
        }
      }

      @keyframes startup-glow-pulse {
        0%,
        100% {
          opacity: 0.58;
          transform: scale(0.96);
        }

        50% {
          opacity: 1;
          transform: scale(1.04);
        }
      }

      @keyframes startup-progress-shift {
        0% {
          transform: translateX(-38%) scaleX(0.78);
          opacity: 0.56;
        }

        50% {
          opacity: 1;
          transform: translateX(10%) scaleX(1);
        }

        100% {
          transform: translateX(76%) scaleX(0.82);
          opacity: 0.56;
        }
      }

      @media (max-width: 640px) {
        .startup-logo {
          width: min(260px, 72vw);
          height: min(260px, 72vw);
        }

        .startup-slogan {
          margin-top: 16px;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .startup-orb,
        .startup-logo,
        .startup-logo-glow,
        .startup-progress-bar {
          animation: none;
        }
      }
    </style>
  </head>
  <body>
    <div class="startup-orb startup-orb-primary" aria-hidden="true"></div>
    <div class="startup-orb startup-orb-secondary" aria-hidden="true"></div>
    <div class="startup-orb startup-orb-tertiary" aria-hidden="true"></div>
    <main class="startup-stage" data-lime-startup-shell>
      <div class="startup-logo-stack">
        <div class="startup-logo-glow" aria-hidden="true"></div>
        ${logoMarkup}
      </div>
      <div class="startup-copy">
        <div class="startup-copy-glow" aria-hidden="true"></div>
        <h1 class="startup-slogan">${escapedSlogan}</h1>
        <p class="startup-subtitle">${escapedSubtitle}</p>
      </div>
      <div class="startup-progress-track" aria-hidden="true">
        <div class="startup-progress-bar"></div>
      </div>
    </main>
  </body>
</html>`;
}

export function resolveMainWindowStartupCopy(locale?: string): {
  slogan: string;
  subtitle: string;
} {
  const normalizedLocale = String(locale || "").toLowerCase();
  if (normalizedLocale.startsWith("zh-tw") || normalizedLocale.includes("hant")) {
    return MAIN_WINDOW_STARTUP_COPY["zh-TW"];
  }
  if (normalizedLocale.startsWith("en")) {
    return MAIN_WINDOW_STARTUP_COPY["en-US"];
  }
  if (normalizedLocale.startsWith("ja")) {
    return MAIN_WINDOW_STARTUP_COPY["ja-JP"];
  }
  if (normalizedLocale.startsWith("ko")) {
    return MAIN_WINDOW_STARTUP_COPY["ko-KR"];
  }
  return MAIN_WINDOW_STARTUP_COPY["zh-CN"];
}

export function buildMainWindowStartupDataUrl(html: string): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

export function buildMainWindowChromeOptions(
  platform: NodeJS.Platform = process.platform,
): MainWindowChromeOptions {
  if (platform !== "darwin") {
    return {};
  }

  return {
    titleBarStyle: "hidden",
    trafficLightPosition: { x: 18, y: 18 },
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
