import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import * as vite from "vite";

async function loadPage(relativePath, exportName, dependencies = {}) {
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
    useId() {
      return `uid-${++idCounter}`;
    },
    Link: ({ to, children, ...rest }) => ({
      type: "a",
      props: { href: to, ...rest },
      children: [children].flat(Infinity),
    }),
    PublicLayout: ({ children, className }) => ({
      type: "public-layout",
      props: { className },
      children: [children].flat(Infinity),
    }),
    VehicleSilhouette: ({ category, size, decorative }) => ({
      type: "vehicle-silhouette",
      props: { category, size, decorative },
      children: [],
    }),
    ...dependencies,
  };

  vm.createContext(scope);
  const transformed =
    code
      .replace(/^import .*;$/gm, "")
      .replace(/export default function/g, "function") + `\nthis.Component=${exportName};`;
  vm.runInContext(transformed, scope);
  return {
    render: () => {
      stateIndex = 0;
      refIndex = 0;
      idCounter = 0;
      return scope.Component();
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

test("ServicesPage renders FTL with its own truck image, Return-Load tier, 6 TANAW vehicle classes, and /mobile-app CTA", async () => {
  const page = await loadPage("./ServicesPage.jsx", "ServicesPage");
  const tree = page.render();
  const text = textContent(tree);

  assert.match(text, /Freight Services & Fleet Specifications/);
  assert.match(text, /Full Truckload \(FTL\)/);
  assert.match(text, /Return-Load & Backhaul Optimization/);
  assert.equal(/\bltl\b|less-than-truckload/i.test(text), false);

  const imgs = collectNodes(tree, (n) => n.type === "img");
  assert.equal(imgs.length, 2);
  assert.match(imgs[0].props.src, /photo-1591768793355-74d04bb6608f/);
  assert.notEqual(imgs[0].props.src, imgs[1].props.src);

  const rows = collectNodes(tree, (n) => n.type === "tr");
  assert.equal(rows.length, 7);

  for (const label of [
    "10-Wheeler Wing Van",
    "Heavy Truck",
    "6-Wheeler / Forward Dropside",
    "Medium Truck",
    "Closed Van",
    "Elf / 4-Wheeler",
  ]) {
    assert.ok(text.includes(label), `Missing vehicle class: ${label}`);
  }

  assert.ok(
    collectNodes(tree, (n) => n.type === "a" && n.props.href === "/mobile-app").length === 1
  );
});

test("WorkflowPage renders interactive 5-stage inspector and diff ledger without documentation/QA band", async () => {
  const page = await loadPage("./WorkflowPage.jsx", "WorkflowPage");
  let tree = page.render();
  let text = textContent(tree);

  assert.match(text, /From Paper Logbooks to Real-Time Dispatch Visibility/);
  assert.match(text, /Before TANAW/);
  assert.match(text, /With TANAW/);

  const tabs = collectNodes(tree, (n) => n.type === "button" && n.props.role === "tab");
  assert.equal(tabs.length, 5);
  assert.equal(tabs[0].props["aria-selected"], true);
  assert.match(text, /STAGE 01 OF 05/);

  // Advance with ArrowDown keyboard navigation to Stage 02
  let prevented = false;
  tabs[0].props.onKeyDown({
    key: "ArrowDown",
    preventDefault: () => {
      prevented = true;
    },
  });
  assert.equal(prevented, true);
  tree = page.render();
  text = textContent(tree);
  assert.match(text, /STAGE 02 OF 05/);
  assert.match(text, /Pre-Dispatch Readiness Gate/);

  // Advance via Next Stage button to Stage 03
  const nextBtn = collectNodes(tree, (n) => n.type === "button" && textContent(n) === "Next Stage")[0];
  nextBtn.props.onClick();
  tree = page.render();
  text = textContent(tree);
  assert.match(text, /STAGE 03 OF 05/);
  assert.match(text, /Active Trip Telemetry/);

  for (const forbidden of ["TRK-004", "ALR-001", "49 / 51 Passed", "4.69 / 5.00 Mean", "ISO/IEC 25010"]) {
    assert.equal(text.includes(forbidden), false, `Unexpected documentation string: ${forbidden}`);
  }
});

test("MobileAppPage renders APK download link, 144x144 QR code, and Customer/Driver breakdown", async () => {
  const page = await loadPage("./MobileAppPage.jsx", "MobileAppPage", {
    MobileShowcase: () => ({ type: "mobile-showcase", props: {}, children: [] }),
  });
  const tree = page.render();
  const text = textContent(tree);

  assert.match(text, /TANAW Mobile for Customers & Drivers/);
  assert.match(text, /minSdk 24/);

  const apkLink = collectNodes(
    tree,
    (n) =>
      n.type === "a" &&
      n.props.href === "https://drive.google.com/file/d/1Vd2WSw1GeI8gfrxcvkHE2cUI3vBmWR0O/view"
  )[0];
  assert.ok(apkLink);
  assert.equal(apkLink.props.target, "_blank");
  assert.equal(apkLink.props.rel, "noopener noreferrer");

  const qrImg = collectNodes(tree, (n) => n.type === "img" && n.props.src === "/mobile-app-qr.jpg")[0];
  assert.ok(qrImg);
  assert.equal(qrImg.props.width, "144");
  assert.equal(qrImg.props.height, "144");

  assert.match(text, /For Customers & Shippers/);
  assert.match(text, /For Mabutol Drivers/);
});

test("AppRouter registers /services, /workflow, and /mobile-app with React.lazy while keeping ProtectedRoute paths", async () => {
  const routerSource = await readFile(new URL("../../router/AppRouter.jsx", import.meta.url), "utf8");
  assert.match(routerSource, /lazy\(\(\) => import\("\.\.\/pages\/Public\/ServicesPage"\)\)/);
  assert.match(routerSource, /lazy\(\(\) => import\("\.\.\/pages\/Public\/WorkflowPage"\)\)/);
  assert.match(routerSource, /lazy\(\(\) => import\("\.\.\/pages\/Public\/MobileAppPage"\)\)/);
  assert.match(routerSource, /path="\/services"/);
  assert.match(routerSource, /path="\/workflow"/);
  assert.match(routerSource, /path="\/mobile-app"/);
  assert.match(routerSource, /path="\/dashboard" element=\{<ProtectedRoute><Dashboard \/><\/ProtectedRoute>\}/);
});
