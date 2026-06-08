export const memoryMocks: Record<string, (args?: any) => any> = {
  memory_runtime_get_overview: () => ({
    stats: { total_entries: 0, storage_used: 0, memory_count: 0 },
    categories: [],
    entries: [],
  }),
  memory_runtime_get_stats: () => ({
    total_entries: 0,
    storage_used: 0,
    memory_count: 0,
  }),
  memory_runtime_request_analysis: () => ({
    analyzed_sessions: 0,
    analyzed_messages: 0,
    generated_entries: 0,
    deduplicated_entries: 0,
  }),
  memory_runtime_cleanup: () => ({
    cleaned_entries: 0,
    freed_space: 0,
  }),
  memory_runtime_get_working_memory: () => ({
    memory_dir: "/mock/runtime/memory",
    total_sessions: 1,
    total_entries: 2,
    sessions: [
      {
        session_id: "mock-session",
        total_entries: 2,
        updated_at: Date.now(),
        files: [
          {
            file_type: "task_plan",
            path: "/mock/runtime/memory/mock-session/task_plan.md",
            exists: true,
            entry_count: 1,
            updated_at: Date.now(),
            summary: "当前任务与阶段计划。",
          },
          {
            file_type: "findings",
            path: "/mock/runtime/memory/mock-session/findings.md",
            exists: true,
            entry_count: 1,
            updated_at: Date.now(),
            summary: "最近的重要发现。",
          },
        ],
        highlights: [
          {
            id: "mock-session:task_plan:0",
            session_id: "mock-session",
            file_type: "task_plan",
            category: "context",
            title: "本轮任务",
            summary: "先补命令边界，再补页面。",
            updated_at: Date.now(),
            tags: ["plan"],
          },
        ],
      },
    ],
  }),
  memory_runtime_get_extraction_status: () => ({
    enabled: true,
    status: "ready",
    status_summary: "工作记忆和上下文压缩快照都已就绪。",
    working_session_count: 1,
    working_entry_count: 2,
    latest_working_memory_at: Date.now(),
    latest_compaction: {
      session_id: "mock-session",
      source: "summary_cache",
      summary_preview: "这是最近一次压缩后的摘要。",
      turn_count: 8,
      created_at: Date.now(),
    },
    recent_compactions: [
      {
        session_id: "mock-session",
        source: "summary_cache",
        summary_preview: "这是最近一次压缩后的摘要。",
        turn_count: 8,
        created_at: Date.now(),
      },
    ],
  }),
  memory_runtime_prefetch_for_turn: () => ({
    session_id: "mock-session",
    rules_source_paths: ["/mock/workspace/.lime/AGENTS.md"],
    working_memory_excerpt: "【task_plan.md】\\n先补命令边界，再补页面。",
    durable_memories: [
      {
        id: "durable-1",
        session_id: "mock-session",
        category: "experience",
        title: "记忆层分层经验",
        summary: "先收口事实源，再补产品层展示。",
        updated_at: Date.now(),
        tags: ["memory", "architecture"],
      },
    ],
    team_memory_entries: [
      {
        key: "team.selection",
        content: "分析、实现、验证三段式推进。",
        updated_at: Date.now(),
      },
    ],
    latest_compaction: {
      session_id: "mock-session",
      source: "summary_cache",
      summary_preview: "这是最近一次压缩后的摘要。",
      turn_count: 8,
      created_at: Date.now(),
    },
    prompt: "【运行时记忆召回】\\n- 以下是当前会话最近沉淀下来的工作记忆。",
  }),
  memory_get_effective_sources: () => ({
    working_dir: "/mock/workspace",
    total_sources: 2,
    loaded_sources: 1,
    follow_imports: true,
    import_max_depth: 5,
    sources: [
      {
        kind: "auto_memory",
        source_bucket: "auto",
        provider: "memdir",
        updated_at: Date.now(),
        path: "/mock/workspace/memory/MEMORY.md",
        exists: true,
        loaded: true,
        line_count: 4,
        import_count: 1,
        warnings: [],
        preview: "# Lime memdir\\n- [项目记忆](project/README.md)",
      },
    ],
  }),
  memory_get_auto_index: () => ({
    enabled: true,
    root_dir: "/mock/workspace/memory",
    entrypoint: "MEMORY.md",
    max_loaded_lines: 200,
    entry_exists: true,
    total_lines: 4,
    preview_lines: ["# Lime memdir", "- [项目记忆](project/README.md)"],
    items: [
      {
        title: "项目记忆",
        memory_type: "project",
        provider: "memdir",
        updated_at: Date.now(),
        relative_path: "project/README.md",
        exists: true,
        summary: "记录项目背景、时间点、约束、动机与团队分工。",
      },
    ],
  }),
  memory_toggle_auto: (args: any) => ({
    enabled: Boolean(args?.enabled),
  }),
  memory_update_auto_note: () => ({
    enabled: true,
    root_dir: "/mock/workspace/memory",
    entrypoint: "MEMORY.md",
    max_loaded_lines: 200,
    entry_exists: true,
    total_lines: 1,
    preview_lines: ["- mock note"],
    items: [
      {
        title: "项目记忆",
        memory_type: "project",
        provider: "memdir",
        updated_at: Date.now(),
        relative_path: "project/README.md",
        exists: true,
        summary: "记录项目背景、时间点、约束、动机与团队分工。",
      },
    ],
  }),
  memory_cleanup_memdir: () => ({
    root_dir: "/mock/workspace/memory",
    entrypoint: "MEMORY.md",
    scanned_files: 4,
    updated_files: 2,
    removed_duplicate_links: 1,
    dropped_missing_links: 0,
    removed_duplicate_notes: 1,
    trimmed_notes: 1,
    curated_topic_files: 1,
  }),
  memory_scaffold_memdir: (args: any) => ({
    root_dir: `${args?.workingDir ?? "/mock/workspace"}/memory`,
    entrypoint: "MEMORY.md",
    created_parent_dir: true,
    files: [
      {
        key: "entrypoint",
        path: `${args?.workingDir ?? "/mock/workspace"}/memory/MEMORY.md`,
        status: "created",
      },
      {
        key: "user",
        path: `${args?.workingDir ?? "/mock/workspace"}/memory/user/README.md`,
        status: "created",
      },
      {
        key: "feedback",
        path: `${args?.workingDir ?? "/mock/workspace"}/memory/feedback/README.md`,
        status: "created",
      },
      {
        key: "project",
        path: `${args?.workingDir ?? "/mock/workspace"}/memory/project/README.md`,
        status: "created",
      },
      {
        key: "reference",
        path: `${args?.workingDir ?? "/mock/workspace"}/memory/reference/README.md`,
        status: "created",
      },
    ],
  }),
  memory_scaffold_runtime_agents_template: (args: any) => {
    const target = args?.target ?? "workspace";
    const workingDir = args?.workingDir ?? "/mock/workspace";
    const pathByTarget: Record<string, string> = {
      global: "/mock/home/.lime/AGENTS.md",
      workspace: `${workingDir}/.lime/AGENTS.md`,
      workspace_local: `${workingDir}/.lime/AGENTS.local.md`,
    };
    return {
      target,
      path: pathByTarget[target] ?? `${workingDir}/.lime/AGENTS.md`,
      status: "created",
      createdParentDir: true,
    };
  },
  memory_ensure_workspace_local_agents_gitignore: (args: any) => ({
    path: `${args?.workingDir ?? "/mock/workspace"}/.gitignore`,
    entry: ".lime/AGENTS.local.md",
    status: "added",
  }),
};
