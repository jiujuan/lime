async (args, helpers) => {
  const limit = helpers.number(args.limit, 10);
  const allowedPeriods = new Set(["all", "daily", "weekly", "monthly", "yearly"]);
  const period = String(args.period || "weekly").trim().toLowerCase();
  const normalizedPeriod = allowedPeriods.has(period) ? period : "weekly";

  try {
    const response = await fetch(
      "/top.json?period=" + encodeURIComponent(normalizedPeriod),
      { credentials: "include" },
    );
    if (!response.ok) {
      return {
        ok: false,
        error_code: "auth_required",
        error_message: "linux.do 热门话题暂不可用，可能需要先登录。",
      };
    }
    const payload = await response.json();
    const topics = Array.isArray(payload?.topic_list?.topics)
      ? payload.topic_list.topics
      : [];
    const categories = Array.isArray(payload?.topic_list?.categories)
      ? payload.topic_list.categories
      : Array.isArray(payload?.categories)
        ? payload.categories
        : [];
    const categoryMap = new Map(
      categories.map((category) => [category?.id, String(category?.name || "").trim()]),
    );

    const items = helpers.take(
      topics.map((topic, index) => ({
        rank: index + 1,
        title: String(topic?.title || "").trim(),
        replies: Math.max(0, Number(topic?.posts_count || 1) - 1),
        views: Number(topic?.views || 0),
        likes: Number(topic?.like_count || 0),
        category:
          categoryMap.get(topic?.category_id) ||
          String(topic?.category_id || "").trim(),
      })),
      limit,
    ).filter((item) => item.title);

    return {
      ok: true,
      data: {
        period: normalizedPeriod,
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
        error instanceof Error ? error.message : "读取 linux.do 热门话题失败。",
    };
  }
};
