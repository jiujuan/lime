async (args, helpers) => {
  const limit = helpers.number(args.limit, 10);

  try {
    const response = await fetch("/categories.json", { credentials: "include" });
    if (!response.ok) {
      return {
        ok: false,
        error_code: "auth_required",
        error_message: "linux.do 分类列表暂不可用，可能需要先登录。",
      };
    }
    const payload = await response.json();
    const categories = Array.isArray(payload?.category_list?.categories)
      ? payload.category_list.categories
      : [];

    const items = helpers.take(
      categories.map((category) => ({
        name: String(category?.name || "").trim(),
        slug: String(category?.slug || "").trim(),
        id: category?.id ?? null,
        topics: category?.topic_count ?? 0,
        description: String(category?.description_text || "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 80),
      })),
      limit,
    ).filter((item) => item.name);

    return {
      ok: true,
      data: {
        items,
        count: items.length,
      },
      source_url: location.href,
    };
  } catch (error) {
    return {
      ok: false,
      error_code: "runtime_error",
      error_message:
        error instanceof Error ? error.message : "读取 linux.do 分类列表失败。",
    };
  }
};
