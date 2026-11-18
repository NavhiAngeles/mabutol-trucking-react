import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { transformWithOxc } from 'vite';

function findNodes(node, predicate) {
  if (!node || typeof node !== 'object') return [];
  const children = Array.isArray(node.children) ? node.children.flat(Infinity) : [];
  return [...(predicate(node) ? [node] : []), ...children.flatMap(child => findNodes(child, predicate))];
}

async function loadAppRouter() {
  const fileContent = fs.readFileSync(new URL('./AppRouter.jsx', import.meta.url), 'utf8');
  const { code } = await transformWithOxc(fileContent, 'AppRouter.jsx', { jsx: { runtime: 'classic' } });
  const scope = vm.createContext({
    React: {
      createElement: (type, props, ...children) => ({
        type,
        props: props || {},
        children: children.flat(),
      }),
      lazy: fn => fn,
      Suspense: ({ fallback, children }) => ({ type: 'Suspense', props: { fallback }, children }),
    },
    lazy: fn => fn,
    Suspense: ({ fallback, children }) => ({ type: 'Suspense', props: { fallback }, children }),
    Outlet: () => ({ type: 'Outlet', props: {}, children: [] }),
    WorkspaceLoadingScreen: props => ({ type: 'WorkspaceLoadingScreen', props, children: [] }),
  });
  const sanitized = code
    .replace(/^import .*;$/gm, '')
    .replace(/^export default .*;$/gm, '')
    .replace(/export function/g, 'function') + '\nthis.RouteLoadingFallback = RouteLoadingFallback;\nthis.WorkspaceSuspense = WorkspaceSuspense;';
  vm.runInContext(sanitized, scope);
  return scope;
}

async function loadWorkspaceLoadingScreen() {
  const fileContent = fs.readFileSync(new URL('../components/WorkspaceLoadingScreen.jsx', import.meta.url), 'utf8');
  const { code } = await transformWithOxc(fileContent, 'WorkspaceLoadingScreen.jsx', { jsx: { runtime: 'classic' } });
  const scope = vm.createContext({
    React: {
      createElement: (type, props, ...children) => ({
        type,
        props: props || {},
        children: children.flat(),
      }),
    },
  });
  const sanitized = code
    .replace(/^import .*;$/gm, '')
    .replace(/export default function/g, 'function') + '\nthis.WorkspaceLoadingScreen = WorkspaceLoadingScreen;';
  vm.runInContext(sanitized, scope);
  return scope.WorkspaceLoadingScreen;
}

test('RouteLoadingFallback renders accessible TANAW loading card with status role and polite announcement', async () => {
  const { RouteLoadingFallback } = await loadAppRouter();
  const rendered = RouteLoadingFallback();

  assert.equal(rendered.type, 'div');
  assert.equal(rendered.props.role, 'status');
  assert.equal(rendered.props['aria-live'], 'polite');
  assert.equal(rendered.props['aria-busy'], 'true');
  assert.equal(rendered.props.className, 'route-loading-fallback');

  const spinner = findNodes(rendered, n => n.props?.className === 'route-loading-spinner')[0];
  assert.ok(spinner);
  assert.equal(spinner.props['aria-hidden'], 'true');
  assert.ok(JSON.stringify(rendered).includes('Loading page…'));
});

test('WorkspaceSuspense wraps protected workspace routes with WorkspaceLoadingScreen fallback', async () => {
  const { WorkspaceSuspense } = await loadAppRouter();
  const rendered = WorkspaceSuspense();

  assert.equal(rendered.type?.name, 'Suspense');
  assert.equal(rendered.props.fallback.type?.name, 'WorkspaceLoadingScreen');
  assert.equal(rendered.props.fallback.props.message, 'Loading dispatch workspace…');
});

test('WorkspaceLoadingScreen renders accessible status announcement and aria-hidden dashboard shell skeleton', async () => {
  const WorkspaceLoadingScreen = await loadWorkspaceLoadingScreen();
  const rendered = WorkspaceLoadingScreen({
    message: 'Verifying office session…',
    detail: 'Confirming dispatch credentials.',
  });

  assert.equal(rendered.type, 'div');
  assert.equal(rendered.props.role, 'status');
  assert.equal(rendered.props['aria-live'], 'polite');
  assert.equal(rendered.props['aria-busy'], 'true');
  assert.equal(rendered.props.className, 'workspace-loading');

  const text = JSON.stringify(rendered);
  assert.ok(text.includes('Verifying office session…'));
  assert.ok(text.includes('Confirming dispatch credentials.'));

  const sidebar = findNodes(rendered, n => n.type === 'aside')[0];
  assert.ok(sidebar);
  assert.equal(sidebar.props['aria-hidden'], 'true');

  const topbar = findNodes(rendered, n => n.type === 'header')[0];
  assert.ok(topbar);
  assert.equal(topbar.props['aria-hidden'], 'true');
  assert.equal(findNodes(topbar, n => typeof n.props?.className === 'string' && n.props.className.includes('workspace-loading-search')).length, 0);

  const kpiCards = findNodes(rendered, n => typeof n.props?.className === 'string' && n.props.className.includes('workspace-loading-stat-card'));
  assert.equal(kpiCards.length, 4);
});
