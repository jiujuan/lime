import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanupMountedRoots,
  fillTextInput,
  findButtonByText,
  findInputById,
  flushEffects,
  mountHarness,
  setupReactActEnvironment,
  type MountedRoot,
} from "@/components/workspace/hooks/testUtils";
import { changeLimeLocale } from "@/i18n/createI18n";
import { CreateProjectDialog } from "./CreateProjectDialog";

const {
  mockExtractErrorMessage,
  mockGetCreateProjectErrorMessage,
  mockGetProjectByRootPath,
  mockGetWorkspaceProjectsRoot,
  mockResolveProjectRootPath,
} = vi.hoisted(() => ({
  mockExtractErrorMessage: vi.fn((error: unknown) =>
    error instanceof Error ? error.message : String(error),
  ),
  mockGetCreateProjectErrorMessage: vi.fn((message: string) => message),
  mockGetProjectByRootPath: vi.fn(),
  mockGetWorkspaceProjectsRoot: vi.fn(),
  mockResolveProjectRootPath: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/lib/api/project", () => ({
  USER_PROJECT_TYPES: ["general"],
  extractErrorMessage: mockExtractErrorMessage,
  getCreateProjectErrorMessage: mockGetCreateProjectErrorMessage,
  getProjectTypeIcon: vi.fn(() => "📁"),
  getProjectByRootPath: mockGetProjectByRootPath,
  getWorkspaceProjectsRoot: mockGetWorkspaceProjectsRoot,
  resolveProjectRootPath: mockResolveProjectRootPath,
}));

setupReactActEnvironment();

const mountedRoots: MountedRoot[] = [];

describe("CreateProjectDialog", () => {
  beforeEach(async () => {
    await changeLimeLocale("en-US");
    mockGetWorkspaceProjectsRoot.mockResolvedValue("/tmp/workspace");
    mockResolveProjectRootPath.mockImplementation(
      async (name: string) => `/tmp/workspace/${name}`,
    );
    mockGetProjectByRootPath.mockResolvedValue(null);
  });

  afterEach(async () => {
    cleanupMountedRoots(mountedRoots);
    vi.clearAllMocks();
    await changeLimeLocale("zh-CN");
  });

  it("uses common namespace resources for the project creation workspace", async () => {
    mountHarness(
      CreateProjectDialog,
      {
        open: true,
        onOpenChange: vi.fn(),
        onSubmit: vi.fn(async () => undefined),
        defaultType: "general",
        defaultName: "Research Notes",
      },
      mountedRoots,
    );

    await flushEffects(3);

    const text = document.body.textContent ?? "";
    expect(text).toContain("Create a new project workspace");
    expect(text).toContain("Choose project type");
    expect(text).toContain("Folder and path");
    expect(text).toContain("General chat");
    expect(text).toContain("/tmp/workspace/Research Notes");
    expect(text).not.toContain("创建新的项目工作台");
    expect(text).not.toContain("选择项目类型");
    expect(text).not.toContain("目录与路径");
  });

  it("localizes path conflict feedback and disables creation", async () => {
    mockGetProjectByRootPath.mockResolvedValue({
      id: "project-exists",
      name: "Existing Project",
    });

    mountHarness(
      CreateProjectDialog,
      {
        open: true,
        onOpenChange: vi.fn(),
        onSubmit: vi.fn(async () => undefined),
        defaultType: "general",
      },
      mountedRoots,
    );

    await flushEffects(2);

    const nameInput = findInputById(document.body, "name");
    expect(nameInput).not.toBeNull();
    fillTextInput(nameInput, "Conflicting Project");

    await flushEffects(3);

    expect(document.body.textContent ?? "").toContain(
      "Path already belongs to project: Existing Project",
    );
    expect(document.body.textContent ?? "").not.toContain("路径已存在项目");
    const createButton = findButtonByText(document.body, "Create", {
      exact: true,
    });
    expect(createButton).toBeDefined();
    expect(createButton?.disabled).toBe(true);
  });
});
