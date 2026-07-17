function normalizeVisibleText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function openImportedSessionFromSidebar(
  page,
  options,
  target,
  dependencies,
) {
  const { assert, evaluatePageSnapshot, sanitizeJson, waitForUiSnapshot } =
    dependencies;
  const normalizedTitle = normalizeVisibleText(target.title);
  await waitForUiSnapshot(
    page,
    options,
    (snapshot) =>
      snapshot.conversationRows.some((row) => {
        const candidate = normalizeVisibleText(`${row.title} ${row.text}`);
        return (
          candidate.includes(normalizedTitle) ||
          normalizedTitle.includes(candidate.slice(0, 24))
        );
      }),
    "侧边栏未出现目标会话",
  );
  const clicked = await evaluatePageSnapshot(
    page,
    ({ title }) => {
      const normalizedTitle = String(title || "")
        .replace(/\s+/g, " ")
        .trim();
      const buttons = Array.from(
        document.querySelectorAll(
          '[data-testid="app-sidebar-conversation-open"]',
        ),
      );
      const matched = buttons.find((button) => {
        const candidate = `${
          button.getAttribute("title") || ""
        } ${button.textContent || ""}`
          .replace(/\s+/g, " ")
          .trim();
        return (
          candidate.includes(normalizedTitle) ||
          normalizedTitle.includes(candidate.slice(0, 24))
        );
      });
      if (matched instanceof HTMLElement) {
        matched.click();
        return {
          clicked: true,
          title: matched.getAttribute("title") || "",
          text: matched.textContent || "",
        };
      }
      return {
        clicked: false,
        rows: buttons.map((button) => ({
          title: button.getAttribute("title") || "",
          text: button.textContent || "",
        })),
      };
    },
    target,
  );
  assert(
    clicked?.clicked,
    `未能点击目标会话: ${JSON.stringify(sanitizeJson(clicked))}`,
  );
  const openedSnapshot = await waitForUiSnapshot(
    page,
    options,
    (snapshot) =>
      snapshot.messageListSessionId === target.sessionId &&
      snapshot.messageContentTextLength > 0 &&
      snapshot.messageContentChildCount > 0 &&
      (snapshot.textareaSessionId === target.sessionId ||
        snapshot.planDecisionVisible ||
        snapshot.approvalReplacementVisible),
    "会话页未进入目标 session",
  );
  assert(
    !openedSnapshot.approvalReplacementVisible,
    "目标会话恢复为审批输入态，真实审计不能替用户处理审批",
  );
  let planDecisionHandled = false;
  if (openedSnapshot.planDecisionVisible) {
    const ignoreButton = page.locator(
      '[data-testid="plan-composer-decision-ignore"]',
    );
    assert(
      await ignoreButton.isVisible().catch(() => false),
      "计划确认面板缺少可操作的暂不执行入口",
    );
    await ignoreButton.click();
    planDecisionHandled = true;
  }
  const inputSnapshot = await waitForUiSnapshot(
    page,
    options,
    (snapshot) =>
      snapshot.messageListSessionId === target.sessionId &&
      snapshot.textareaVisible &&
      snapshot.textareaDisabled === false &&
      snapshot.textareaSessionId === target.sessionId &&
      snapshot.messageContentTextLength > 0 &&
      snapshot.messageContentChildCount > 0,
    "目标会话未恢复普通输入框",
  );
  return { ...inputSnapshot, planDecisionHandled };
}
