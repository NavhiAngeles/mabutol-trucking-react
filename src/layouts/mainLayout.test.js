import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('MainLayout renders accessible 2-minute countdown warning dialog and connects Stay signed in action', async () => {
  const { transformWithOxc } = await import('vite');
  let stayClicks = 0;
  let mockIdleState = { showWarning: false, remainingSeconds: 120, staySignedIn: () => stayClicks++ };

  const scope = {
    useNavigate: () => () => {},
    useAuth: () => ({ role: 'admin' }),
    useCallback: fn => fn,
    useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
    useEffect: () => {},
    useIdleTimeout: () => mockIdleState,
    Sidebar: () => ({ type: 'Sidebar' }),
    React: {
      createElement: (type, props, ...children) => ({
        type,
        props: props || {},
        children: children.flat(),
      }),
    },
  };

  vm.createContext(scope);
  const path = new URL('./mainLayout.jsx', import.meta.url);
  const { code } = await transformWithOxc(fs.readFileSync(path, 'utf8'), path.pathname, { jsx: { runtime: 'classic' } });
  vm.runInContext(code.replace(/^import .*;$/gm, '').replace('export default function', 'function') + '\nthis.MainLayout=MainLayout;', scope);

  const find = (node, predicate) => {
    if (!node || typeof node !== 'object') return [];
    const results = predicate(node) ? [node] : [];
    const children = Array.isArray(node.children) ? node.children : [];
    return [...results, ...children.flatMap(child => find(child, predicate))];
  };

  // 1. Initial / normal state without warning
  const tree1 = scope.MainLayout({ children: 'Child Content' });
  const dialogs1 = find(tree1, node => node.props?.role === 'alertdialog');
  assert.equal(dialogs1.length, 0);

  // 2. Warning active with 85 seconds remaining (1:25)
  mockIdleState = { showWarning: true, remainingSeconds: 85, staySignedIn: () => stayClicks++ };
  const tree2 = scope.MainLayout({ children: 'Child Content' });
  const dialogs2 = find(tree2, node => node.props?.role === 'alertdialog');
  assert.equal(dialogs2.length, 1);

  const dialog = dialogs2[0];
  assert.equal(dialog.props['aria-modal'], 'true');
  assert.equal(dialog.props['aria-labelledby'], 'idle-warning-title');
  assert.equal(dialog.props['aria-describedby'], 'idle-warning-desc');

  // Verify countdown formatted as 1:25
  const countdownNodes = find(tree2, node => node.props?.className === 'idle-timeout-countdown');
  assert.equal(countdownNodes.length, 1);
  assert.equal(countdownNodes[0].children[0], '1:25');

  // Verify "Stay signed in" button action
  const buttons = find(tree2, node => node.props?.className === 'btn-stay-signed-in');
  assert.equal(buttons.length, 1);
  assert.equal(buttons[0].children[0], 'Stay signed in');

  buttons[0].props.onClick();
  assert.equal(stayClicks, 1);
});

test('MainLayout renders accessible mobile menu trigger and connects sidebar drawer and backdrop', async () => {
  const { transformWithOxc } = await import('vite');
  let storedOpen;

  const scope = {
    useNavigate: () => () => {},
    useAuth: () => ({ role: 'admin' }),
    useCallback: fn => fn,
    useState: initial => {
      if (typeof storedOpen === 'undefined') {
        storedOpen = typeof initial === 'function' ? initial() : initial;
      }
      return [storedOpen, updater => {
        storedOpen = typeof updater === 'function' ? updater(storedOpen) : updater;
      }];
    },
    useEffect: () => {},
    useIdleTimeout: () => ({ showWarning: false, remainingSeconds: 0 }),
    Sidebar: props => ({ type: 'Sidebar', props }),
    React: {
      createElement: (type, props, ...children) => ({
        type,
        props: props || {},
        children: children.flat(),
      }),
    },
  };

  vm.createContext(scope);
  const path = new URL('./mainLayout.jsx', import.meta.url);
  const { code } = await transformWithOxc(fs.readFileSync(path, 'utf8'), path.pathname, { jsx: { runtime: 'classic' } });
  vm.runInContext(code.replace(/^import .*;$/gm, '').replace('export default function', 'function') + '\nthis.MainLayout=MainLayout;', scope);

  const find = (node, predicate) => {
    if (!node || typeof node !== 'object') return [];
    const results = predicate(node) ? [node] : [];
    const children = Array.isArray(node.children) ? node.children : [];
    return [...results, ...children.flatMap(child => find(child, predicate))];
  };

  // 1. Initial closed state
  const tree1 = scope.MainLayout({ children: 'Child Content' });
  const trigger1 = find(tree1, node => node.props?.className === 'mobile-menu-trigger')[0];
  assert.ok(trigger1, 'Mobile menu trigger button must exist');
  assert.equal(trigger1.props['aria-expanded'], false);
  assert.equal(trigger1.props['aria-controls'], 'main-sidebar');
  assert.equal(find(tree1, node => node.props?.className === 'sidebar-backdrop').length, 0);

  const sidebar1 = find(tree1, node => node.type === scope.Sidebar)[0];
  assert.ok(sidebar1);
  assert.equal(sidebar1.props.mobileOpen, false);

  // 2. Click trigger toggles state to open
  trigger1.props.onClick();
  assert.equal(storedOpen, true);

  // 3. Render open state: backdrop renders and sidebar has mobileOpen=true
  const tree2 = scope.MainLayout({ children: 'Child Content' });
  const backdrop = find(tree2, node => node.props?.className === 'sidebar-backdrop')[0];
  assert.ok(backdrop, 'Backdrop must render when mobile menu is open');

  const sidebar2 = find(tree2, node => node.type === scope.Sidebar)[0];
  assert.ok(sidebar2);
  assert.equal(sidebar2.props.mobileOpen, true);

  // 4. Clicking backdrop closes mobile menu
  backdrop.props.onClick();
  assert.equal(storedOpen, false);
});

