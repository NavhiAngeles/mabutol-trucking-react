import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { transformWithOxc } from 'vite';

function find(node, predicate) {
  if (!node || typeof node !== 'object') return [];
  const matches = predicate(node) ? [node] : [];
  const children = Array.isArray(node.children)
    ? node.children
    : node.props?.children
    ? Array.isArray(node.props.children)
      ? node.props.children
      : [node.props.children]
    : [];
  return [...matches, ...children.flatMap(child => find(child, predicate))];
}

test('TollGateManager does not use window.confirm and defines 3-dots action menu with accessible delete dialog attributes', async () => {
  const source = await readFile(new URL('./TollGateManager.jsx', import.meta.url), 'utf8');

  // Verify zero calls to window.confirm
  assert.equal(source.includes('window.confirm'), false, 'window.confirm must not be used');
  assert.equal(source.includes('confirm('), false, 'confirm() must not be used');

  // Verify 3-dots action menu markup and upward/fixed positioning
  assert.ok(source.includes('toll-action-dots-btn'), '3-dots button must be rendered');
  assert.ok(source.includes('toll-action-dropdown'), 'Action dropdown menu must be present');
  assert.ok(source.includes('handleOpenMenu'), 'handleOpenMenu handler must be defined');
  assert.ok(source.includes('zIndex: 9999'), 'Action dropdown must float forward with high z-index');
  assert.ok(source.includes('position: "fixed"'), 'Action dropdown must use fixed positioning');

  // Verify accessible modal markup
  assert.ok(source.includes('aria-modal="true"'), 'Delete dialog must declare aria-modal="true"');
  assert.ok(source.includes('role="dialog"'), 'Delete dialog must declare role="dialog"');
  assert.ok(source.includes('aria-labelledby="toll-delete-dialog-title"'), 'Delete dialog must declare aria-labelledby');
  assert.ok(source.includes('aria-describedby="toll-delete-dialog-desc"'), 'Delete dialog must declare aria-describedby');
  assert.ok(source.includes('handleCancelDelete'), 'Cancel handler must be defined');
  assert.ok(source.includes('handleConfirmDelete'), 'Confirm delete handler must be defined');
  assert.ok(source.includes('deleteCancelBtnRef'), 'Cancel button ref must be attached for initial auto-focus');
});

test('TollGateManager 3-dots action menu and delete dialog lifecycle: open dropdown, trigger delete, cancel, focus restoration, in-flight state, and error handling', async () => {
  const source = await readFile(new URL('./TollGateManager.jsx', import.meta.url), 'utf8');
  const { code } = await transformWithOxc(source, 'TollGateManager.jsx', { jsx: { runtime: 'classic' } });

  const stateValues = new Map();
  const stateSetters = new Map();
  const refs = new Map();
  const effectEntries = new Map();
  const eventListeners = {};
  const windowListeners = {};
  const serviceCalls = [];

  let stateIdx = 0;
  let refIdx = 0;
  let effectIdx = 0;

  let mockCurrentUser = { isAdmin: true };
  let mockTollGates = [
    {
      id: 'gate-1',
      gate_name: 'Balintawak',
      highway: 'NLEX',
      vehicle_class: 'Class 2',
      fee: 250,
      pricing_scope: 'entry_exit',
    },
  ];
  let deleteTollGateImpl = async (id) => {
    serviceCalls.push({ action: 'deleteTollGate', id });
    return { success: true };
  };

  const fakeTrigger = {
    id: 'dots-btn',
    focused: false,
    focus() { this.focused = true; },
    getBoundingClientRect() {
      return { top: 720, bottom: 752, left: 1000, right: 1032, width: 32, height: 32 };
    },
    closest(selector) {
      if (selector === '.toll-action-menu-wrapper') {
        return {
          querySelector(childSel) {
            if (childSel === '.toll-action-dots-btn') return fakeTrigger;
            return null;
          },
        };
      }
      return null;
    },
  };

  const context = vm.createContext({
    React: {
      createElement: (type, props, ...children) => {
        const flatChildren = children.flat(Infinity);
        return {
          type,
          props: { ...(props || {}), children: flatChildren.length === 1 ? flatChildren[0] : flatChildren },
          children: flatChildren,
        };
      },
    },
    useState(initialValue) {
      const idx = stateIdx++;
      if (!stateValues.has(idx)) {
        stateValues.set(idx, typeof initialValue === 'function' ? initialValue() : initialValue);
      }
      if (!stateSetters.has(idx)) {
        stateSetters.set(idx, (next) => {
          const current = stateValues.get(idx);
          stateValues.set(idx, typeof next === 'function' ? next(current) : next);
        });
      }
      return [stateValues.get(idx), stateSetters.get(idx)];
    },
    useRef(initial) {
      const idx = refIdx++;
      if (!refs.has(idx)) {
        refs.set(idx, { current: initial });
      }
      return refs.get(idx);
    },
    useEffect(effect, deps) {
      const idx = effectIdx++;
      const prev = effectEntries.get(idx);
      const hasChanged = !prev || !deps || deps.some((dep, i) => dep !== prev.deps?.[i]);
      if (hasChanged) {
        if (typeof prev?.cleanup === 'function') prev.cleanup();
        const cleanup = effect();
        effectEntries.set(idx, { deps, cleanup });
      }
    },
    useCallback(fn) {
      return fn;
    },
    document: {
      activeElement: fakeTrigger,
      addEventListener(name, fn) {
        (eventListeners[name] = eventListeners[name] || []).push(fn);
      },
      removeEventListener(name, fn) {
        if (eventListeners[name]) {
          eventListeners[name] = eventListeners[name].filter(f => f !== fn);
        }
      },
    },
    window: {
      innerHeight: 800,
      innerWidth: 1200,
      addEventListener(name, fn) {
        (windowListeners[name] = windowListeners[name] || []).push(fn);
      },
      removeEventListener(name, fn) {
        if (windowListeners[name]) {
          windowListeners[name] = windowListeners[name].filter(f => f !== fn);
        }
      },
    },
    getTollGates: async () => mockTollGates,
    addTollGate: async () => {},
    updateTollGate: async () => {},
    deleteTollGate: async (id) => deleteTollGateImpl(id),
    getCurrentPricingUser: async () => mockCurrentUser,
    VERIFIED_TOLL_PRESETS: [],
    cleanGateName: (name) => String(name || '').trim(),
    setTimeout: (fn) => { fn(); return 1; },
    clearTimeout: () => {},
  });

  const wrapped = code
    .replace(/^import .*;$/gm, '')
    .replace('export default function TollGateManager', 'function TollGateManager') +
    '\nthis.TollGateManager = TollGateManager;';

  vm.runInContext(wrapped, context);

  const render = () => {
    stateIdx = 0;
    refIdx = 0;
    effectIdx = 0;
    return context.TollGateManager();
  };

  // 1. Initial render & mount
  render();

  // Allow async initialize to run
  await new Promise((r) => setTimeout(r, 20));

  let tree = render();

  // 2. Locate 3-dots button in the table
  const dotsBtn = find(tree, (n) => n.type === 'button' && n.props?.className === 'toll-action-dots-btn')[0];
  assert.ok(dotsBtn, '3-dots button should be present in toll row');
  assert.equal(dotsBtn.props['aria-expanded'], false);

  // Verify dropdown menu is not visible yet
  let dropdown = find(tree, (n) => n.props?.className === 'toll-action-dropdown')[0];
  assert.equal(dropdown, undefined, 'Dropdown should not be rendered initially');

  // 3. Click 3-dots button to open menu
  dotsBtn.props.onClick({
    stopPropagation() {},
    currentTarget: fakeTrigger,
  });

  tree = render();
  dropdown = find(tree, (n) => n.props?.className === 'toll-action-dropdown')[0];
  assert.ok(dropdown, 'Dropdown should now be rendered');
  assert.equal(dropdown.props.role, 'menu');
  assert.equal(dropdown.props.style?.position, 'fixed');
  assert.equal(dropdown.props.style?.zIndex, 9999);
  // Verify upward positioning because fakeTrigger bottom (752) is near window height (800): spaceBelow = 48 < 110
  assert.equal(dropdown.props.style?.top, 'auto');
  assert.ok(dropdown.props.style?.bottom.includes('px'), 'Dropdown should position upward when near bottom');

  // Verify menuitems inside dropdown
  const editItem = find(dropdown, (n) => n.type === 'button' && n.children.some(c => typeof c === 'object' && c.children?.includes?.('Edit Price')))[0];
  const deleteItem = find(dropdown, (n) => n.type === 'button' && n.props?.className?.includes('danger'))[0];
  assert.ok(editItem, 'Edit Price option should be in dropdown');
  assert.ok(deleteItem, 'Delete option should be in dropdown');

  // 4. Click Delete item in the dropdown
  deleteItem.props.onClick({
    currentTarget: fakeTrigger,
  });

  tree = render();
  // Dropdown should close, confirmation dialog should open
  dropdown = find(tree, (n) => n.props?.className === 'toll-action-dropdown')[0];
  assert.equal(dropdown, undefined, 'Dropdown should close when item is selected');

  let dialog = find(tree, (n) => n.props?.['role'] === 'dialog' && n.props?.['aria-labelledby'] === 'toll-delete-dialog-title')[0];
  assert.ok(dialog, 'Delete confirmation dialog should now be rendered');
  assert.equal(dialog.props['aria-modal'], 'true');

  const cancelBtn = find(dialog, (n) => n.type === 'button' && n.children.includes('Cancel'))[0];
  const confirmBtn = find(dialog, (n) => n.type === 'button' && (n.children.includes('Delete') || n.children.includes('Deleting…')))[0];
  assert.ok(cancelBtn, 'Cancel button should be present in dialog');
  assert.ok(confirmBtn, 'Confirm Delete button should be present in dialog');

  // 5. Cancel restores focus to 3-dots button
  fakeTrigger.focused = false;
  cancelBtn.props.onClick();

  tree = render();
  dialog = find(tree, (n) => n.props?.['role'] === 'dialog' && n.props?.['aria-labelledby'] === 'toll-delete-dialog-title')[0];
  assert.equal(dialog, undefined, 'Dialog should close on Cancel');
  assert.equal(fakeTrigger.focused, true, 'Focus should be restored to 3-dots trigger on Cancel');

  // 6. Test Escape dismissal
  const dotsBtn2 = find(tree, (n) => n.type === 'button' && n.props?.className === 'toll-action-dots-btn')[0];
  dotsBtn2.props.onClick({ stopPropagation() {}, currentTarget: fakeTrigger });
  tree = render();
  const deleteItem2 = find(tree, (n) => n.type === 'button' && n.props?.className?.includes('danger'))[0];
  deleteItem2.props.onClick({ currentTarget: fakeTrigger });
  render();

  fakeTrigger.focused = false;
  (eventListeners['keydown'] || []).forEach(fn => fn({
    key: 'Escape',
    preventDefault() {},
    stopPropagation() {},
  }));

  tree = render();
  dialog = find(tree, (n) => n.props?.['role'] === 'dialog' && n.props?.['aria-labelledby'] === 'toll-delete-dialog-title')[0];
  assert.equal(dialog, undefined, 'Dialog should close on Escape');
  assert.equal(fakeTrigger.focused, true, 'Focus should be restored to trigger on Escape');

  // 7. Test successful delete execution
  const dotsBtn3 = find(tree, (n) => n.type === 'button' && n.props?.className === 'toll-action-dots-btn')[0];
  dotsBtn3.props.onClick({ stopPropagation() {}, currentTarget: fakeTrigger });
  tree = render();
  const deleteItem3 = find(tree, (n) => n.type === 'button' && n.props?.className?.includes('danger'))[0];
  deleteItem3.props.onClick({ currentTarget: fakeTrigger });
  tree = render();
  dialog = find(tree, (n) => n.props?.['role'] === 'dialog' && n.props?.['aria-labelledby'] === 'toll-delete-dialog-title')[0];
  const confirmBtnToDelete = find(dialog, (n) => n.type === 'button' && n.children.includes('Delete'))[0];

  fakeTrigger.focused = false;
  await confirmBtnToDelete.props.onClick();

  assert.equal(serviceCalls.length, 1);
  assert.equal(serviceCalls[0].action, 'deleteTollGate');
  assert.equal(serviceCalls[0].id, 'gate-1');

  tree = render();
  dialog = find(tree, (n) => n.props?.['role'] === 'dialog' && n.props?.['aria-labelledby'] === 'toll-delete-dialog-title')[0];
  assert.equal(dialog, undefined, 'Dialog should close on successful delete');
  assert.equal(fakeTrigger.focused, true, 'Focus should be restored to trigger on success');

  // 8. Test deletion error keeps dialog open
  deleteTollGateImpl = async () => {
    throw new Error('Database connection failed');
  };
  const dotsBtn4 = find(tree, (n) => n.type === 'button' && n.props?.className === 'toll-action-dots-btn')[0];
  dotsBtn4.props.onClick({ stopPropagation() {}, currentTarget: fakeTrigger });
  tree = render();
  const deleteItem4 = find(tree, (n) => n.type === 'button' && n.props?.className?.includes('danger'))[0];
  deleteItem4.props.onClick({ currentTarget: fakeTrigger });
  tree = render();
  dialog = find(tree, (n) => n.props?.['role'] === 'dialog' && n.props?.['aria-labelledby'] === 'toll-delete-dialog-title')[0];
  const confirmBtnToFail = find(dialog, (n) => n.type === 'button' && n.children.includes('Delete'))[0];

  await confirmBtnToFail.props.onClick();

  tree = render();
  dialog = find(tree, (n) => n.props?.['role'] === 'dialog' && n.props?.['aria-labelledby'] === 'toll-delete-dialog-title')[0];
  assert.ok(dialog, 'Dialog should remain open on error');
  const alert = find(dialog, (n) => n.props?.['role'] === 'alert')[0];
  assert.ok(alert, 'Error alert should be rendered');
  assert.equal(alert.children.includes('Database connection failed'), true);
});
