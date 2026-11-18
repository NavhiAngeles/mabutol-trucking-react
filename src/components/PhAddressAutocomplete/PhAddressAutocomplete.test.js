import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { transformWithOxc } from "vite";

const find = (node, pred) => !node || typeof node !== "object" ? [] : [
  ...(pred(node) ? [node] : []),
  ...(node.children || []).flat(Infinity).flatMap(child => find(child, pred)),
];

async function mountCombobox(initialProps = {}) {
  const states = [], refs = [];
  let cursor = 0, refCursor = 0, idCounter = 0;

  const scope = {
    React: {
      Fragment: "Fragment",
      createElement: (type, props, ...children) =>
        typeof type === "function"
          ? type({ ...(props || {}), children })
          : { type, props: props || {}, children },
    },
    useState(initial) {
      const i = cursor++;
      if (!(i in states)) states[i] = typeof initial === "function" ? initial() : initial;
      return [states[i], v => { states[i] = typeof v === "function" ? v(states[i]) : v; }];
    },
    useRef: initial => refs[refCursor++] ||= { current: initial },
    useEffect() {},
    useId: () => `ac-${++idCounter}`,
    document: { addEventListener() {}, removeEventListener() {} },
    window: { innerHeight: 900 },
  };

  vm.createContext(scope);
  const path = new URL("./PhAddressAutocomplete.jsx", import.meta.url);
  const { code } = await transformWithOxc(await readFile(path, "utf8"), path.pathname, { jsx: { runtime: "classic" } });
  const stripped = code
    .replace(/^import [\s\S]*?from\s+['"][^'"]+['"];\r?\n?/gm, "")
    .replace(/^import\s+['"][^'"]+['"];\r?\n?/gm, "")
    .replace("export default function", "function");
  vm.runInContext(stripped + "\nthis.Combobox=PhAddressAutocomplete;", scope);

  return {
    render(overrides = {}) {
      cursor = refCursor = idCounter = 0;
      return scope.Combobox({
        id: "test-province",
        name: "province",
        label: "Province / Region",
        options: [
          { id: "0301400000", label: "Bulacan", subtitle: "Region III" },
          { id: "0304900000", label: "Nueva Ecija", subtitle: "Region III" },
        ],
        ...initialProps,
        ...overrides,
      });
    },
  };
}

test("PhAddressAutocomplete exposes combobox ARIA semantics and handles ArrowDown, ArrowUp, Enter, and Escape", async () => {
  const selected = [];
  let currentValue = "";
  const ui = await mountCombobox({
    onChange: (val) => { currentValue = val; },
    onSelect: (opt) => { selected.push(opt); currentValue = opt.label; },
  });

  let tree = ui.render({ value: currentValue });
  let input = find(tree, n => n.type === "input")[0];
  assert.equal(input.props.role, "combobox");
  assert.equal(input.props["aria-autocomplete"], "list");
  assert.equal(input.props["aria-expanded"], false);

  // ArrowDown opens dropdown and highlights first option
  let prevented = false;
  input.props.onKeyDown({ key: "ArrowDown", preventDefault() { prevented = true; } });
  tree = ui.render({ value: currentValue });
  input = find(tree, n => n.type === "input")[0];
  assert.equal(prevented, true);
  assert.equal(input.props["aria-expanded"], true);
  assert.ok(input.props["aria-activedescendant"]?.endsWith("-opt-0"));

  // ArrowDown moves to second option
  input.props.onKeyDown({ key: "ArrowDown", preventDefault() {} });
  tree = ui.render({ value: currentValue });
  input = find(tree, n => n.type === "input")[0];
  assert.ok(input.props["aria-activedescendant"]?.endsWith("-opt-1"));

  // ArrowUp moves back to first option
  input.props.onKeyDown({ key: "ArrowUp", preventDefault() {} });
  tree = ui.render({ value: currentValue });
  input = find(tree, n => n.type === "input")[0];
  assert.ok(input.props["aria-activedescendant"]?.endsWith("-opt-0"));

  // Escape closes dropdown and stops propagation so parent dialog stays open
  let stopped = false;
  input.props.onKeyDown({
    key: "Escape",
    preventDefault() {},
    stopPropagation() { stopped = true; },
  });
  tree = ui.render({ value: currentValue });
  input = find(tree, n => n.type === "input")[0];
  assert.equal(stopped, true);
  assert.equal(input.props["aria-expanded"], false);

  // Re-open with ArrowDown and press Enter to select
  input.props.onKeyDown({ key: "ArrowDown", preventDefault() {} });
  tree = ui.render({ value: currentValue });
  input = find(tree, n => n.type === "input")[0];
  let enterPrevented = false;
  input.props.onKeyDown({ key: "Enter", preventDefault() { enterPrevented = true; } });
  tree = ui.render({ value: currentValue });

  assert.equal(enterPrevented, true);
  assert.equal(selected.length, 1);
  assert.equal(selected[0].label, "Bulacan");
  assert.equal(find(tree, n => n.type === "input")[0].props["aria-expanded"], false);
});
