import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { transformWithOxc } from "vite";

function find(node, predicate) {
  if (!node || typeof node !== "object") return [];
  const children = Array.isArray(node.children) ? node.children.flat(Infinity) : [];
  return [...(predicate(node) ? [node] : []), ...children.flatMap((child) => find(child, predicate))];
}

async function loadSkeletonModule() {
  const source = fs.readFileSync(new URL("./Skeleton.jsx", import.meta.url), "utf8");
  const { code } = await transformWithOxc(source, "Skeleton.jsx", { jsx: { runtime: "classic" } });
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
    .replace(/^import .*;$/gm, "")
    .replace(/^export function /gm, "function ")
    + "\nthis.api = { SkeletonBlock, SkeletonTableRows, SkeletonStatValue, SkeletonListRows, SkeletonTrendBars, SkeletonDonut };";
  vm.runInContext(sanitized, scope);
  return scope.api;
}

test("SkeletonBlock renders decorative aria-hidden span with dimension and radius classes", async () => {
  const { SkeletonBlock } = await loadSkeletonModule();
  const block = SkeletonBlock({ width: 120, height: 20, radius: "md" });
  assert.equal(block.type, "span");
  assert.equal(block.props["aria-hidden"], "true");
  assert.ok(block.props.className.includes("tanaw-skeleton"));
  assert.ok(block.props.className.includes("is-md"));
  assert.equal(block.props.style.width, "120px");
  assert.equal(block.props.style.height, "20px");
});

test("SkeletonTableRows renders exact row and column count with aria-hidden rows", async () => {
  const { SkeletonTableRows } = await loadSkeletonModule();
  const rows = SkeletonTableRows({
    rows: 4,
    columns: ["avatar-stack", "text", "badge", "action"],
  });
  assert.equal(rows.length, 4);
  for (const row of rows) {
    assert.equal(row.type, "tr");
    assert.equal(row.props["aria-hidden"], "true");
    assert.equal(find(row, (n) => n.type === "td").length, 4);
  }
});

test("SkeletonListRows supports alert, feed, and bar variants", async () => {
  const { SkeletonListRows } = await loadSkeletonModule();
  const alerts = SkeletonListRows({ rows: 3, variant: "alert" });
  assert.equal(alerts.props["aria-hidden"], "true");
  assert.equal(find(alerts, (n) => n.props?.className === "tanaw-skeleton-alert-card").length, 3);

  const feed = SkeletonListRows({ rows: 2, variant: "feed" });
  assert.equal(find(feed, (n) => n.props?.className === "tanaw-skeleton-feed-item").length, 2);

  const bars = SkeletonListRows({ rows: 4, variant: "bar" });
  assert.equal(find(bars, (n) => n.props?.className === "tanaw-skeleton-bar-row").length, 4);
});

test("SkeletonTrendBars renders 7 daily columns", async () => {
  const { SkeletonTrendBars } = await loadSkeletonModule();
  const trend = SkeletonTrendBars({});
  assert.equal(trend.props["aria-hidden"], "true");
  assert.equal(find(trend, (n) => n.props?.className === "tanaw-skeleton-trend-col").length, 7);
});

test("SkeletonDonut renders aria-hidden circular ring with requested size", async () => {
  const { SkeletonDonut } = await loadSkeletonModule();
  const donut = SkeletonDonut({ size: 160 });
  assert.equal(donut.props["aria-hidden"], "true");
  const ring = find(donut, (n) => n.props?.className === "tanaw-skeleton-donut-ring")[0];
  assert.ok(ring);
  assert.equal(ring.props.style.width, "160px");
  assert.equal(ring.props.style.height, "160px");
});
