import { useState } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InstructionEditor } from "./InstructionEditor";

const {
  mockDeleteVoiceInstruction,
  mockGetVoiceInstructions,
  mockSaveVoiceInstruction,
} = vi.hoisted(() => ({
  mockDeleteVoiceInstruction: vi.fn(),
  mockGetVoiceInstructions: vi.fn(),
  mockSaveVoiceInstruction: vi.fn(),
}));

vi.mock("./types", () => ({
  deleteVoiceInstruction: mockDeleteVoiceInstruction,
  getVoiceInstructions: mockGetVoiceInstructions,
  saveVoiceInstruction: mockSaveVoiceInstruction,
}));

interface Mounted {
  container: HTMLDivElement;
  root: Root;
}

const mounted: Mounted[] = [];

async function flushEffects(times = 4) {
  await act(async () => {
    for (let index = 0; index < times; index += 1) {
      await Promise.resolve();
    }
  });
}

function renderWithParentSnapshot() {
  function Harness() {
    const [, setSnapshotVersion] = useState(0);

    return (
      <InstructionEditor
        defaultInstructionId="default"
        onInstructionsChange={(instructions) => {
          setSnapshotVersion((current) => current + instructions.length);
        }}
      />
    );
  }

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<Harness />);
  });

  mounted.push({ container, root });
  return container;
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  vi.clearAllMocks();
  mockGetVoiceInstructions.mockResolvedValue([
    {
      id: "default",
      name: "默认润色",
      prompt: "{{text}}",
      is_preset: true,
    },
    {
      id: "translate_en",
      name: "翻译为英文",
      prompt: "{{text}}",
      is_preset: true,
    },
  ]);
});

afterEach(() => {
  while (mounted.length > 0) {
    const target = mounted.pop();
    if (!target) {
      break;
    }
    act(() => {
      target.root.unmount();
    });
    target.container.remove();
  }
});

describe("InstructionEditor", () => {
  it("父组件同步指令快照后重新渲染时不应重复加载指令", async () => {
    const container = renderWithParentSnapshot();

    await flushEffects(8);

    expect(container.textContent ?? "").toContain("默认润色");
    expect(container.textContent ?? "").toContain("翻译为英文");
    expect(mockGetVoiceInstructions).toHaveBeenCalledTimes(1);
  });
});
