import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import * as vite from "vite";

async function loadModule(relativePath, exportNames, dependencies = {}) {
  const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
  const { code } = vite.transformWithOxc
    ? await vite.transformWithOxc(source, relativePath, { jsx: { runtime: "classic" } })
    : await vite.transformWithEsbuild(source, relativePath, { loader: "jsx", jsx: "transform" });
  const states = [];
  const refs = [];
  let stateIndex = 0;
  let refIndex = 0;
  let idCounter = 0;

  const scope = {
    React: {
      createElement: (type, props, ...children) => {
        const flatChildren = children
          .flat(Infinity)
          .filter((c) => c !== null && c !== undefined && c !== false);
        if (typeof type === "function") {
          return type({ ...(props || {}), children: flatChildren });
        }
        return {
          type,
          props: props || {},
          children: flatChildren,
        };
      },
      Fragment: "fragment",
    },
    useId() {
      return `test-id-${++idCounter}`;
    },
    useState(initial) {
      const i = stateIndex++;
      if (!(i in states)) states[i] = typeof initial === "function" ? initial() : initial;
      return [
        states[i],
        (value) => {
          states[i] = typeof value === "function" ? value(states[i]) : value;
        },
      ];
    },
    useRef(initial) {
      return refs[refIndex++] || (refs[refIndex - 1] = { current: initial });
    },
    ...dependencies,
  };

  vm.createContext(scope);
  const transformed =
    code
      .replace(/^import .*;$/gm, "")
      .replace(/export default function/g, "function") +
    "\n" +
    exportNames.map((name) => `this.${name}=${name};`).join("\n");
  vm.runInContext(transformed, scope);

  return {
    render: (name, props = {}) => {
      stateIndex = 0;
      refIndex = 0;
      idCounter = 0;
      return scope[name](props);
    },
  };
}

function collectNodes(node, predicate, out = []) {
  if (!node || typeof node !== "object") return out;
  if (predicate(node)) out.push(node);
  if (Array.isArray(node.children)) {
    for (const child of node.children) collectNodes(child, predicate, out);
  }
  return out;
}

function textContent(node) {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!node || typeof node !== "object") return "";
  return (node.children || []).map(textContent).join("");
}

test("MobileShowcase switches between anonymized Customer View and Driver View and renders callouts", async () => {
  const ui = await loadModule("./MobileShowcase.jsx", ["MobileShowcase"], {
    Link: ({ to, children, ...rest }) => ({ type: "a", props: { href: to, ...rest }, children: [children].flat(Infinity) }),
  });

  // Initial render: Customer View
  let tree = ui.render("MobileShowcase");
  let text = textContent(tree);

  const tabs = collectNodes(tree, (n) => n.type === "button" && n.props.role === "tab");
  assert.equal(tabs.length, 2);
  assert.equal(tabs[0].props["aria-selected"], true);
  assert.equal(tabs[1].props["aria-selected"], false);

  const logoImg = collectNodes(tree, (n) => n.type === "img" && n.props.src === "/tanaw-logo-dark.jpg");
  assert.equal(logoImg.length, 1);
  assert.match(text, /TANAW/);
  assert.match(text, /Good morning,/);
  assert.match(text, /Commercial Shipper/);
  assert.match(text, /Peñaranda, Nueva Ecija/);
  assert.match(text, /SHP-NE-26-0104/);
  assert.match(text, /In Transit/);
  assert.match(text, /Peñaranda Hub → Balagtas, Bulacan/);
  assert.match(text, /10-Wheeler Wing Van/);
  assert.match(text, /Up to 12,000 kg/);

  // Privacy check: no test names or raw strings
  assert.equal(text.includes("Ivhan Angeles"), false);
  assert.equal(text.includes("Ingatan mo ya"), false);

  // Floating glassmorphic callout cards
  assert.match(text, /GPS TELEMETRY/);
  assert.match(text, /Foreground Location Sync/);
  assert.match(text, /Live route & ETA updates across Luzon corridors/);
  assert.equal(text.includes("TRK-004"), false);
  assert.match(text, /VERIFIED POD/);
  assert.match(text, /Photo & E-Signature Capture/);
  assert.match(text, /Timestamped in PHT UTC\+8 upon drop-off/);

  // Switch to Driver View
  tabs[1].props.onClick();
  tree = ui.render("MobileShowcase");
  text = textContent(tree);

  const driverTabs = collectNodes(tree, (n) => n.type === "button" && n.props.role === "tab");
  assert.equal(driverTabs[1].props["aria-selected"], true);
  assert.match(text, /Trip Assignment/);
  assert.match(text, /SHP-NE-26-0108/);
  assert.match(text, /Palletized Agri Goods · 8,000 kg/);
  assert.match(text, /Isuzu Forward Dropside/);
  assert.equal(text.includes("Ivhan Angeles"), false);
  assert.equal(text.includes("Ingatan mo ya"), false);

  const milestoneButtons = collectNodes(
    tree,
    (n) => n.type === "button" && typeof n.props.className === "string" && n.props.className.includes("m3-milestone-btn")
  );
  assert.equal(milestoneButtons.length, 6);
  assert.match(text, /1\. Assigned/);
  assert.match(text, /2\. Route Started/);
  assert.match(text, /3\. Arrived at Pickup/);
  assert.match(text, /4\. Cargo Loaded/);
  assert.match(text, /5\. In Transit/);
  assert.match(text, /6\. Proof Submitted/);
  assert.match(text, /Step 5 of 6/);

  // Interact with milestone 3 and action buttons
  milestoneButtons[2].props.onClick();
  tree = ui.render("MobileShowcase");
  assert.match(textContent(tree), /Step 3 of 6/);

  const actionBtns = collectNodes(
    tree,
    (n) => n.type === "button" && typeof n.props.className === "string" && n.props.className.includes("m3-driver-btn")
  );
  assert.equal(actionBtns.length, 2);
  assert.match(textContent(actionBtns[0]), /Open Navigation/);
  assert.match(textContent(actionBtns[1]), /Submit POD/);

  actionBtns[1].props.onClick();
  tree = ui.render("MobileShowcase");
  text = textContent(tree);
  assert.match(text, /Step 6 of 6/);
  assert.match(text, /Digital POD Capture Ready/);
});

test("MobileShowcase compact variant links to /mobile-app and MobileAppPage embeds MobileShowcase", async () => {
  const showcaseUi = await loadModule("./MobileShowcase.jsx", ["MobileShowcase"], {
    Link: ({ to, children, ...rest }) => ({ type: "a", props: { href: to, ...rest }, children: [children].flat(Infinity) }),
    TanawLogo: ({ subtitle, size, className }) => ({
      type: "tanaw-logo",
      props: { subtitle, size, className },
      children: [],
    }),
  });

  const compactTree = showcaseUi.render("MobileShowcase", { variant: "compact" });
  const mobileLink = collectNodes(compactTree, (n) => n.type === "a" && n.props.href === "/mobile-app");
  assert.equal(mobileLink.length, 1);

  const pageUi = await loadModule("./MobileAppPage.jsx", ["MobileAppPage"], {
    Link: ({ to, children, ...rest }) => ({ type: "a", props: { href: to, ...rest }, children: [children].flat(Infinity) }),
    PublicLayout: ({ children, className }) => ({ type: "public-layout", props: { className }, children: [children].flat(Infinity) }),
    MobileShowcase: () => ({ type: "mobile-showcase", props: {}, children: [] }),
  });

  const pageTree = pageUi.render("MobileAppPage");
  assert.equal(collectNodes(pageTree, (n) => n.type === "mobile-showcase").length, 1);
  const qrImg = collectNodes(pageTree, (n) => n.type === "img")[0];
  assert.equal(qrImg.props.width, "144");
  assert.equal(qrImg.props.height, "144");
  assert.match(textContent(pageTree), /Download Tanaw-Mobile\.apk/);
});
