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
  const effects = [];
  let stateIndex = 0;
  let refIndex = 0;

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
    useEffect(fn) {
      effects.push(fn);
    },
    ...dependencies,
  };

  vm.createContext(scope);
  const transformed =
    code
      .replace(/^import .*;$/gm, "")
      .replace(/export default function/g, "function")
      .replace(/export function/g, "function") +
    "\n" +
    exportNames.map((name) => `this.${name}=${name};`).join("\n");
  vm.runInContext(transformed, scope);

  return {
    render: (name, props = {}) => {
      stateIndex = 0;
      refIndex = 0;
      effects.length = 0;
      return scope[name](props);
    },
    effects,
    refs,
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

test("TanawLogo uses attached /tanaw-logo.png with explicit dimensions and priority support", async () => {
  const ui = await loadModule("../../components/TanawLogo.jsx", ["TanawLogo"]);
  const tree = ui.render("TanawLogo", { subtitle: "Mabutol Trucking", size: "md", priority: true });
  const img = collectNodes(tree, (n) => n.type === "img")[0];
  assert.ok(img);
  assert.equal(img.props.src, "/tanaw-logo.png");
  assert.equal(img.props.alt, "");
  assert.equal(img.props.width, 38);
  assert.equal(img.props.height, 38);
  assert.equal(img.props.fetchPriority, "high");
});

test("PublicNavbar and PublicFooter render shared routes, location, notice, and Escape mobile menu close", async () => {
  let focusedToggle = false;
  const keyListeners = {};

  const ui = await loadModule(
    "../../components/PublicLayout.jsx",
    ["PublicNavbar", "PublicFooter", "PublicLayout"],
    {
      Link: ({ to, children, ...rest }) => ({ type: "a", props: { href: to, ...rest }, children: [children].flat(Infinity) }),
      NavLink: ({ to, className, children, ...rest }) => ({
        type: "a",
        props: {
          href: to,
          className: typeof className === "function" ? className({ isActive: to === "/services" }) : className,
          "aria-current": to === "/services" ? "page" : undefined,
          ...rest,
        },
        children: [children].flat(Infinity),
      }),
      useAuth: () => ({ user: null, role: null }),
      TanawLogo: ({ subtitle, size, priority }) => ({
        type: "tanaw-logo",
        props: { subtitle, size, priority },
        children: [],
      }),
      document: {
        addEventListener: (name, fn) => {
          keyListeners[name] = fn;
        },
        removeEventListener: (name) => {
          delete keyListeners[name];
        },
      },
    }
  );

  let navTree = ui.render("PublicNavbar");
  ui.refs[0].current = { focus: () => { focusedToggle = true; } };

  const navLinks = collectNodes(navTree, (n) => n.type === "a" && ["/services", "/workflow", "/mobile-app"].includes(n.props.href));
  assert.equal(navLinks.length, 3);
  assert.equal(navLinks[0].props["aria-current"], "page");

  const signInLinks = collectNodes(navTree, (n) => n.type === "a" && n.props.href === "/login");
  assert.ok(signInLinks.length >= 1);
  assert.match(textContent(signInLinks[0]), /Office Sign In/);

  const menuBtn = collectNodes(navTree, (n) => n.type === "button" && n.props["aria-controls"] === "public-primary-nav")[0];
  menuBtn.props.onClick();
  navTree = ui.render("PublicNavbar");
  assert.equal(collectNodes(navTree, (n) => n.props.id === "public-primary-nav")[0].props.className.includes("open"), true);

  ui.effects[0]();
  keyListeners.keydown({ key: "Escape" });
  navTree = ui.render("PublicNavbar");
  assert.equal(focusedToggle, true);
  assert.equal(collectNodes(navTree, (n) => n.props.id === "public-primary-nav")[0].props.className.includes("open"), false);

  const footerTree = ui.render("PublicFooter");
  const footerText = textContent(footerTree);
  assert.match(footerText, /San Josef, Peñaranda, Nueva Ecija/);
  assert.match(footerText, /Est\. 2015/);
  assert.match(footerText, /Restricted Portal Notice/);
});

test("Landing renders company-focused hero, freight photo, 4-column baseline bar, About Mabutol Trucking ledger, and 2-column platform split without thesis docs", async () => {
  const ui = await loadModule("./Landing.jsx", ["Landing"], {
    Link: ({ to, children, ...rest }) => ({ type: "a", props: { href: to, ...rest }, children: [children].flat(Infinity) }),
    PublicLayout: ({ children, className }) => ({ type: "public-layout", props: { className }, children: [children].flat(Infinity) }),
    MobileShowcase: ({ variant }) => ({ type: "mobile-showcase", props: { variant }, children: [] }),
  });

  const tree = ui.render("Landing");
  const text = textContent(tree);

  // Track Your Load form is removed
  assert.equal(collectNodes(tree, (n) => n.type === "form").length, 0);
  assert.equal(text.includes("Track Your Load"), false);

  // Hero content & dual CTAs
  assert.match(text, /San Josef, Peñaranda, Nueva Ecija/);
  assert.match(text, /Est\. 2015/);
  assert.match(text, /Dedicated Full Truckload \(FTL\) Freight Dispatch/);
  assert.match(text, /Full Truckload \(FTL\) hauls/);
  assert.equal(/\bltl\b/i.test(text), false);
  assert.ok(collectNodes(tree, (n) => n.type === "a" && n.props.href === "/login" && textContent(n) === "Office Staff Sign In").length === 1);
  assert.ok(collectNodes(tree, (n) => n.type === "a" && n.props.href === "/mobile-app" && textContent(n) === "Get Mobile APK").length === 1);

  // Hero 16:10 truck photograph + bottom-left corridor pill
  const heroImg = collectNodes(tree, (n) => n.type === "img")[0];
  assert.ok(heroImg);
  assert.match(heroImg.props.src, /^https:\/\/images\.unsplash\.com\/photo-/);
  assert.equal(heroImg.props.width, "1200");
  assert.equal(heroImg.props.height, "750");
  assert.equal(heroImg.props.fetchPriority, "high");
  assert.match(text, /NLEX · SCTEX · TPLEX CORRIDOR/);
  assert.match(text, /GPS & Digital POD Enabled/);

  // 4-column company baseline bar
  assert.match(text, /Est\. 2015/);
  assert.match(text, /6 Truck Classes/);
  assert.match(text, /NLEX · SCTEX · TPLEX/);
  assert.match(text, /UTC\+8 Digital POD/);

  // Company profile section & structured fact ledger (<dl>)
  assert.match(text, /About Mabutol Trucking/);
  assert.match(text, /Rooted in Nueva Ecija since 2015/);
  assert.match(text, /Coordinated fleet and dispatch operations/);
  assert.match(text, /Centralized visibility through TANAW/);
  assert.match(text, /Company & Operations Profile/);
  assert.equal(collectNodes(tree, (n) => n.type === "dl").length, 1);
  assert.ok(collectNodes(tree, (n) => n.type === "a" && n.props.href === "/services").length === 1);

  // 2-column platform split preview & compact mobile showcase
  assert.match(text, /Web Dispatch Console/);
  assert.match(text, /TANAW Android App/);
  assert.ok(collectNodes(tree, (n) => n.type === "mobile-showcase" && n.props.variant === "compact").length === 1);
  assert.ok(collectNodes(tree, (n) => n.type === "a" && n.props.href === "/workflow").length >= 2);
  assert.ok(collectNodes(tree, (n) => n.type === "a" && n.props.href === "/mobile-app").length >= 2);

  // Capstone/thesis documentation and sensitive internal counts are absent
  for (const forbidden of [
    "ISO/IEC 25010",
    "4.69 / 5.00",
    "IEEE 829",
    "TRK-004",
    "Anonymous Survey Export",
    "Q21",
    "23 Units",
    "26 Personnel",
    "18 trucks",
    "5 closed vans",
    "2 managers",
    "6 dispatchers",
    "18 drivers",
  ]) {
    assert.equal(text.includes(forbidden), false, `Unexpected string found: ${forbidden}`);
  }
});
