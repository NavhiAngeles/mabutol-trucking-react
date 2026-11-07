import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { transformWithOxc } from 'vite';

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
    });
    const sanitized = code
      .replace(/^import .*;$/gm, '')
      .replace(/^export default .*;$/gm, '')
      .replace(/export function/g, 'function') + '\nthis.RouteLoadingFallback = RouteLoadingFallback;';
    vm.runInContext(sanitized, scope);
    return scope;
  }

  test('RouteLoadingFallback renders accessible loading state with status role and polite announcement', async () => {
    const { RouteLoadingFallback } = await loadAppRouter();
    const rendered = RouteLoadingFallback();

    assert.equal(rendered.type, 'div');
    assert.equal(rendered.props.role, 'status');
    assert.equal(rendered.props['aria-live'], 'polite');
    assert.equal(rendered.props.className, 'route-loading-fallback');

    const children = rendered.children;
    assert.ok(Array.isArray(children));
    assert.equal(children[0].props.className, 'route-loading-spinner');
    assert.equal(children[0].props['aria-hidden'], 'true');
    assert.equal(children[1].children[0], 'Loading page…');
  });
