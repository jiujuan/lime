import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { vi } from "vitest";
import type { Project } from "@/types/project";
import { ProjectSelector } from "./ProjectSelector";

interface MountedHarness {
  container: HTMLDivElement;
  root: Root;
}

const mountedRoots: MountedHarness[] = [];

export function createProject(overrides: Partial<Project>): Project {
  return {
    id: "project-id",
    name: "项目",
    workspaceType: "general",
    rootPath: "/tmp/project",
    isDefault: false,
    icon: undefined,
    color: undefined,
    isFavorite: false,
    isArchived: false,
    tags: [],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

export function createUseProjectsResult(overrides?: Record<string, unknown>) {
  return {
    projects: [],
    generalProjects: [],
    filteredProjects: [],
    defaultProject: null,
    loading: false,
    error: null,
    filter: {},
    setFilter: vi.fn(),
    refresh: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    rename: vi.fn(),
    remove: vi.fn(async () => true),
    getOrCreateDefault: vi.fn(async () =>
      createProject({
        id: "default",
        name: "默认项目",
        isDefault: true,
        workspaceType: "general",
      }),
    ),
    ...overrides,
  };
}

export function renderProjectSelector(
  props?: Partial<React.ComponentProps<typeof ProjectSelector>>,
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  const defaultProps: React.ComponentProps<typeof ProjectSelector> = {
    value: "default",
    onChange: vi.fn(),
    workspaceType: "general",
    enableManagement: true,
  };

  act(() => {
    root.render(<ProjectSelector {...defaultProps} {...props} />);
  });

  mountedRoots.push({ container, root });
  return container;
}

export function cleanupMountedProjectSelectors() {
  while (mountedRoots.length > 0) {
    const mounted = mountedRoots.pop();
    if (!mounted) break;
    act(() => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }
}

export function findButton(
  container: HTMLElement,
  text: string,
): HTMLButtonElement | null {
  return (Array.from(container.querySelectorAll("button")).find((button) =>
    button.textContent?.includes(text),
  ) || null) as HTMLButtonElement | null;
}

export async function flushAsync() {
  await act(async () => {
    await Promise.resolve();
  });
}
