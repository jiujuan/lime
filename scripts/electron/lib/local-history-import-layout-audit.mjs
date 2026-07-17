export async function inspectConversationChromeLayout(page) {
  return await page.evaluate(() => {
    const toolbar =
      document.querySelector(
        '[data-testid="task-center-home-top-toolbar-host"]',
      ) ||
      document.querySelector(
        '[data-testid="task-center-workbench-top-toolbar-host"]',
      );
    const messageViewport = document.querySelector(
      '[data-testid="message-list-scroll-container"]',
    );
    const toolbarRect =
      toolbar instanceof HTMLElement ? toolbar.getBoundingClientRect() : null;
    const messageViewportRect =
      messageViewport instanceof HTMLElement
        ? messageViewport.getBoundingClientRect()
        : null;
    const overlapWidth =
      toolbarRect && messageViewportRect
        ? Math.max(
            0,
            Math.min(toolbarRect.right, messageViewportRect.right) -
              Math.max(toolbarRect.left, messageViewportRect.left),
          )
        : 0;
    const overlapHeight =
      toolbarRect && messageViewportRect
        ? Math.max(
            0,
            Math.min(toolbarRect.bottom, messageViewportRect.bottom) -
              Math.max(toolbarRect.top, messageViewportRect.top),
          )
        : 0;
    const serializeRect = (rect) =>
      rect
        ? {
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            left: rect.left,
            width: rect.width,
            height: rect.height,
          }
        : null;

    return {
      toolbarVisible: Boolean(
        toolbarRect && toolbarRect.width > 0 && toolbarRect.height > 0,
      ),
      messageViewportVisible: Boolean(
        messageViewportRect &&
        messageViewportRect.width > 0 &&
        messageViewportRect.height > 0,
      ),
      toolbarMessageViewportOverlap: overlapWidth > 0 && overlapHeight > 0,
      overlapWidth,
      overlapHeight,
      toolbarRect: serializeRect(toolbarRect),
      messageViewportRect: serializeRect(messageViewportRect),
    };
  });
}
