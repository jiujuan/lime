async (args, helpers) => {
  const query = String(args.query || "").trim();
  const limit = helpers.number(args.limit, 10);
  const rowSelector = "li.feed-row-wide";

  await helpers.waitFor(
    () =>
      document.querySelectorAll(rowSelector).length > 0 ||
      /搜索结果|相关好价|什么值得买/i.test(document.body?.textContent || ""),
    12000,
    300,
  );

  const rows = Array.from(document.querySelectorAll(rowSelector));
  const items = helpers.take(
    helpers.uniqueBy(
      rows
        .map((row, index) => {
          const titleAnchor =
            row.querySelector("h5.feed-block-title > a") || row.querySelector("h5 > a");
          const rawHref =
            titleAnchor?.getAttribute("href") || titleAnchor?.href || "";
          const url = helpers.absoluteUrl(rawHref);
          const title = (
            titleAnchor?.getAttribute("title") || helpers.text(titleAnchor)
          ).trim();
          const price = helpers.text(row.querySelector(".z-highlight"));
          const mall = helpers.text(
            row.querySelector(".z-feed-foot-r .feed-block-extras span") ||
              row.querySelector(".z-feed-foot-r span"),
          );
          const commentsText = helpers.text(
            row.querySelector(".feed-btn-comment"),
          ).replace(/[^\d]/g, "");
          return {
            rank: index + 1,
            title,
            url,
            price,
            mall,
            comments: commentsText ? Number(commentsText) : 0,
          };
        })
        .filter((item) => item.title && item.url),
      (item) => item.url,
    ),
    limit,
  );

  return {
    ok: true,
    data: {
      query,
      items,
      count: items.length,
    },
    source_url: location.href,
  };
};
