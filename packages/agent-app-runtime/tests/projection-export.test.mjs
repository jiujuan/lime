import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { test } = process.env.VITEST
  ? await import('vitest')
  : await import('node:test');

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));

execFileSync(process.execPath, ['build.mjs'], {
  cwd: packageDir,
  stdio: 'inherit',
});

function distModuleUrl(relativePath) {
  return pathToFileURL(resolve(packageDir, 'dist', relativePath)).href;
}

test('root export exposes bridge adapters and AgentUI projection helpers', async () => {
  const root = await import(/* @vite-ignore */ distModuleUrl('index.js'));

  assert.equal(typeof root.createLimeCoreCapabilityAdapters, 'function');
  assert.equal(typeof root.createLimeHostBridgeCapabilityInvoker, 'function');
  assert.equal(typeof root.buildLimeAgentUiProjectionEvents, 'function');
  assert.equal(typeof root.buildLimeAgentRunProjectionViewModel, 'function');
});

test('projection subpath groups reasoning and answer stream deltas by run scope', async () => {
  const projection = await import(/* @vite-ignore */ distModuleUrl('projection.js'));
  const events = projection.buildLimeAgentUiProjectionEvents({
    taskId: 'task-package-regression',
    sessionId: 'session-package-regression',
    events: [
      {
        id: 'thinking-1',
        eventType: 'task:partialArtifact',
        payload: { streamKind: 'thinking_delta', delta: 'Understand first ' },
      },
      {
        id: 'thinking-2',
        eventType: 'task:partialArtifact',
        payload: { streamKind: 'thinking_delta', delta: 'then call Skill.' },
      },
      {
        id: 'answer-1',
        eventType: 'task:partialArtifact',
        payload: { streamKind: 'assistant_text_delta', delta: 'Draft paragraph one.' },
      },
      {
        id: 'answer-2',
        eventType: 'task:partialArtifact',
        payload: { streamKind: 'assistant_text_delta', delta: 'Draft paragraph two.' },
      },
    ],
  });

  const view = projection.buildLimeAgentRunProjectionViewModel(events);

  assert.equal(view.orderedParts.filter((part) => part.kind === 'reasoning').length, 1);
  assert.equal(view.orderedParts.filter((part) => part.kind === 'text').length, 1);
  assert.equal(view.reasoningText, 'Understand first then call Skill.');
  assert.equal(view.answerText, 'Draft paragraph one.Draft paragraph two.');
});

test('terminal projection collapses by default but keeps historical process parts', async () => {
  const { buildLimeAgentRunProjectionViewModelFromState } = await import(
    /* @vite-ignore */ distModuleUrl('index.js')
  );
  const view = buildLimeAgentRunProjectionViewModelFromState({
    taskId: 'task-terminal-regression',
    sessionId: 'session-terminal-regression',
    events: [
      {
        id: 'tool-1',
        eventType: 'task:toolCall',
        status: 'completed',
        toolName: 'Skill(article-writer)',
        message: 'Skill completed',
      },
      {
        id: 'completed-1',
        eventType: 'task:completed',
        message: 'AgentRuntime turn finished',
      },
    ],
  });

  assert.equal(view.task.terminal, true);
  assert.equal(view.task.collapsedByDefault, true);
  assert.ok(view.orderedParts.some((part) => part.kind === 'tool'));
  assert.ok(view.orderedParts.some((part) => part.kind === 'status'));
});

test('root renderer returns escaped collapsible process html', async () => {
  const root = await import(/* @vite-ignore */ distModuleUrl('index.js'));
  const view = root.buildLimeAgentRunProjectionViewModel(root.buildLimeAgentUiProjectionEvents({
    taskId: 'task-renderer-regression',
    sessionId: 'session-renderer-regression',
    events: [
      {
        id: 'thinking-html',
        eventType: 'task:partialArtifact',
        payload: { streamKind: 'thinking_delta', delta: '<unsafe thinking>' },
      },
      {
        id: 'completed-html',
        eventType: 'task:completed',
        message: 'done',
      },
    ],
  }));

  const html = root.renderLimeAgentRunProjectionHtml(view, { className: 'agent-run&view' });

  assert.match(html, /data-lime-agent-run-projection/);
  assert.match(html, /class="agent-run&amp;view"/);
  assert.match(html, /data-terminal="true"/);
  assert.match(html, /data-kind="reasoning"/);
  assert.match(html, /&lt;unsafe thinking&gt;/);
  assert.doesNotMatch(html, /<unsafe thinking>/);
});


test('root renderer can render directly from host task state', async () => {
  const root = await import(/* @vite-ignore */ distModuleUrl('index.js'));
  const html = root.renderLimeAgentRunProjectionStateHtml({
    taskId: 'task-state-renderer-regression',
    sessionId: 'session-state-renderer-regression',
    runtimeFacts: {
      modelRouting: {
        routes: [{ model: { provider: 'deepseek', model: 'deepseek-v4-flash' } }],
      },
      tokenUsage: { totals: { totalTokens: 120 } },
      costSummary: { cost: { currency: 'USD', estimatedTotalCost: 0.0042 } },
    },
    runtimeProcess: {
      timeline: [
        { id: 'state-thinking', kind: 'thinking', message: 'Plan route' },
        { id: 'state-tool', kind: 'skill', title: 'Skill article-writer', status: 'completed' },
      ],
    },
    events: [{ id: 'state-completed', eventType: 'task:completed', message: 'done' }],
  }, { className: 'state-renderer' });

  assert.match(html, /class="state-renderer"/);
  assert.match(html, /data-kind="reasoning"/);
  assert.match(html, /Plan route/);
  assert.match(html, /article-writer/);
  assert.match(html, /deepseek \/ deepseek-v4-flash/);
  assert.match(html, /120 tokens/);
  assert.match(html, /USD 0\.0042/);
  assert.match(html, /data-terminal="true"/);
});

test('root mount helper writes rendered AgentUI projection into a DOM-like target', async () => {
  const root = await import(/* @vite-ignore */ distModuleUrl('index.js'));
  const target = { innerHTML: '' };
  const html = root.mountLimeAgentRunProjectionState(target, {
    runtimeProcess: { timeline: [{ kind: 'thinking', message: 'Mount route' }] },
  });

  assert.equal(target.innerHTML, html);
  assert.match(target.innerHTML, /Mount route/);
  assert.match(target.innerHTML, /data-lime-agent-run-projection/);
});

test('root renderer can include default projection styles with escaped nonce', async () => {
  const root = await import(/* @vite-ignore */ distModuleUrl('index.js'));
  assert.match(root.LIME_AGENT_RUN_PROJECTION_DEFAULT_CSS, /data-lime-agent-run-projection/);

  const html = root.renderLimeAgentRunProjectionStateHtml({ events: [] }, {
    includeStyles: true,
    styleNonce: 'nonce"value',
  });

  assert.match(html, /data-lime-agent-run-projection-style/);
  assert.match(html, /nonce="nonce&quot;value"/);
  assert.match(html, /--lime-agent-run-bg/);
});
