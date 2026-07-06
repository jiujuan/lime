import { describe, expect, it } from "vitest";

import { agentEnUSResource, agentZhCNResource } from "@/i18n/agentResources";
import {
  buildInputbarCoreCopy,
  type InputbarCoreCopyKey,
} from "./inputbarCoreCopy";

function translateResource(
  resource: Partial<Record<InputbarCoreCopyKey, string>>,
  key: InputbarCoreCopyKey,
  values?: Record<string, number | string>,
) {
  return Object.entries(values ?? {}).reduce(
    (text, [name, value]) => text.split(`{{${name}}}`).join(String(value)),
    resource[key] ?? key,
  );
}

describe("inputbarCoreCopy", () => {
  it("应构造中英文输入区 chrome 与语音文案", () => {
    const zhCopy = buildInputbarCoreCopy((key, values) =>
      translateResource(agentZhCNResource, key, values),
    );
    const enCopy = buildInputbarCoreCopy((key, values) =>
      translateResource(agentEnUSResource, key, values),
    );

    expect(zhCopy.image.add).toBe("添加图片");
    expect(zhCopy.textarea.expand).toBe("展开输入框");
    expect(zhCopy.action.running).toBe("正在输出");
    expect(zhCopy.action.defer).toBe("稍后处理");
    expect(zhCopy.dictation.recording("1:05")).toBe("录音中 1:05");
    expect(zhCopy.dictation.stopRecording("录音中 1:05")).toBe(
      "录音中 1:05，点击停止",
    );

    expect(enCopy.image.add).toBe("Add image");
    expect(enCopy.textarea.expand).toBe("Expand input");
    expect(enCopy.action.running).toBe("Generating");
    expect(enCopy.action.defer).toBe("Handle later");
    expect(enCopy.action.stop).toBe("Stop");
    expect(enCopy.action.send).toBe("Send");
    expect(enCopy.dictation.recording("1:05")).toBe("Recording 1:05");
    expect(enCopy.dictation.stopRecording("Recording 1:05")).toBe(
      "Recording 1:05, click to stop",
    );
  });
});
