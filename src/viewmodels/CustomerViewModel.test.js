import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { setImmediate } from "node:timers";
// Isolate the pure mapping/selector exports without requiring a browser or live database.
const source = fs.readFileSync(new URL("./CustomerViewModel.js", import.meta.url), "utf8")
  .replace(/^import .*;$/gm, "").replace(/^export /gm, "");
const context = {};
vm.createContext(context);
vm.runInContext(source + "\nthis.api={buildCustomerRows,customerStatistics,filterCustomerRows};", context);
const { buildCustomerRows, customerStatistics, filterCustomerRows } = context.api;
const customers = [
  { id: "customer-a", customer_code: "C-001", name: "Alpha Logistics", email: "alpha@example.test", phone: "09123456789", is_active: true, created_at: "2026-10-12T16:30:00Z" },
  { id: "customer-b", name: "Beta", is_active: false, created_at: "2026-10-01T00:00:00Z" },
  { id: "customer-c", name: null, email: null, phone: null, is_active: true, created_at: null },
];
const bookings = [
  { id: "shipment-a", customer_id: "customer-a", status: "completed", created_at: "2026-10-13T01:00:00Z", pickup_address: "Pickup", dropoff_address: "Destination" },
  { id: "shipment-b", customer_id: "customer-a", status: "booked", created_at: "2026-10-12T01:00:00Z" },
  { id: "shipment-c", customer_id: "customer-b", status: "cancelled", created_at: "2026-10-13T02:00:00Z" },
];
const now = Date.parse("2026-10-13T12:00:00+08:00");

test("maps actual customer IDs, nullable contacts and real booking summaries", () => {
  const rows = buildCustomerRows(customers, bookings);
  assert.equal(rows[0].id, "customer-a");
  assert.equal(rows[0].profile.id, "C-001");
  assert.equal(rows[0].profile.bookingSummary.total, 2);
  assert.equal(rows[0].profile.bookingSummary.completed, 1);
  assert.equal(rows[0].profile.bookingSummary.activeNow, 1);
  assert.equal(rows[1].status, "SUSPENDED");
  assert.equal(rows[1].profile.bookingSummary.cancelled, 1);
  assert.equal(rows[2].name, "Unnamed customer");
  assert.equal(rows[2].email, "—");
  assert.equal(rows[2].lastBooking, "No bookings");
  const address = buildCustomerRows([{ id: "address-test", address: "13 Sample St", barangay: "Sample Barangay", city: "Pandi", province: "Bulacan" }], [])[0];
  assert.equal(address.profile.address, "13 Sample St, Sample Barangay, Pandi, Bulacan");
});

test("statistics use full database rows and Philippine week/month boundaries", () => {
  const stats = customerStatistics(buildCustomerRows(customers, bookings), now);
  assert.equal(stats.total, 3);
  assert.equal(stats.activeThisMonth, 1);
  assert.equal(stats.newThisWeek, 1);
  assert.equal(stats.suspended, 1);
});

test("search, status, latest-booking today and sorting use real mapped values", () => {
  const rows = buildCustomerRows(customers, bookings);
  assert.equal(filterCustomerRows(rows, { query: "C-001", now })[0].id, "customer-a");
  assert.equal(filterCustomerRows(rows, { query: "ALPHA@", now })[0].id, "customer-a");
  assert.equal(filterCustomerRows(rows, { query: "091234", now })[0].id, "customer-a");
  assert.equal(filterCustomerRows(rows, { status: "SUSPENDED", now })[0].id, "customer-b");
  assert.equal(filterCustomerRows(rows, { todayOnly: true, now }).length, 2);
  assert.equal(filterCustomerRows(rows, { sort: "bookings", now })[0].id, "customer-a");
  assert.equal(filterCustomerRows(rows, { query: "not-present", now }).length, 0);
});

test("empty dataset and changed/deleted customers do not resurrect samples", () => {
  assert.equal(buildCustomerRows([], bookings).length, 0);
  const changed = buildCustomerRows([{ ...customers[0], name: "Updated", is_active: false }], bookings);
  assert.equal(changed[0].name, "Updated");
  assert.equal(changed[0].status, "SUSPENDED");
  assert.equal(changed.length, 1);
});

test("unknown statuses and missing customer fields do not invent active bookings", () => {
  const rows = buildCustomerRows([{ id: "x", name: 12, is_active: null }], [{ id: "b", customer_id: "x", status: "unknown", created_at: null }]);
  assert.equal(rows[0].status, "UNKNOWN");
  assert.equal(rows[0].name, "Unnamed customer");
  assert.equal(rows[0].profile.bookingSummary.activeNow, 0);
});

test("directory loads, refreshes changed/deleted records, exposes errors, and cleans up", async () => {
  let state = [], refs = [], effects = [], stateIndex = 0, refIndex = 0, effectIndex = 0;
  let currentRows = customers, fail = false, subscriptions = 0, unsubscribed = 0;
  let timerId = 0;
  const timeouts = new Map(), intervals = new Map(), listeners = new Set();
  const scope = {
    useState(initial) { const i = stateIndex++; if (!(i in state)) state[i] = initial; return [state[i], value => state[i] = typeof value === "function" ? value(state[i]) : value]; },
    useRef(initial) { return refs[refIndex++] ||= { current: initial }; }, useCallback: fn => fn,
    useEffect(fn, dependencies) { const i = effectIndex++; if (!effects[i] || dependencies.some((value, index) => value !== effects[i].dependencies[index])) { effects[i]?.cleanup?.(); effects[i] = { dependencies, cleanup: fn() }; } },
    fetchCustomers: async () => { if (fail) throw new Error("Permission denied"); return currentRows; },
    fetchCustomerBookings: async () => bookings,
    subscribeCustomerBookings: () => { subscriptions++; return () => unsubscribed++; },
    setTimeout(fn) { timeouts.set(++timerId, fn); return timerId; }, clearTimeout: id => timeouts.delete(id),
    setInterval(fn) { intervals.set(++timerId, fn); return timerId; }, clearInterval: id => intervals.delete(id),
    window: { addEventListener: (name, fn) => listeners.add(fn), removeEventListener: (name, fn) => listeners.delete(fn) },
    document: { visibilityState: "visible", addEventListener: (name, fn) => listeners.add(fn), removeEventListener: (name, fn) => listeners.delete(fn) },
  };
  vm.createContext(scope);
  vm.runInContext(source + "\nthis.directory=useCustomerDirectory;", scope);
  const render = (enabled = true) => { stateIndex = refIndex = effectIndex = 0; return scope.directory({ enabled, includeBookings: true }); };
  const flush = () => new Promise(resolve => setImmediate(resolve));
  assert.equal(render().loading, true);
  [...timeouts.values()][0](); await flush();
  assert.equal(render().customers.length, 3);
  render(); assert.equal(subscriptions, 1); assert.equal(intervals.size, 1);
  currentRows = [{ ...customers[0], name: "Updated live customer" }];
  [...intervals.values()][0](); await flush();
  assert.equal(render().customers[0].name, "Updated live customer");
  assert.equal(render().customers.length, 1);
  currentRows = []; [...intervals.values()][0](); await flush();
  assert.equal(render().customers.length, 0);
  fail = true; [...intervals.values()][0](); await flush();
  assert.equal(render().error, "Permission denied");
  assert.equal(render().customers.length, 0);
  render(false);
  assert.equal(unsubscribed, 1); assert.equal(intervals.size, 0); assert.equal(listeners.size, 0);
});

test("customer page renders loading/empty/error/live states and real profile actions", async () => {
  const { transformWithOxc } = await import("vite");
  let states = [], cursor = 0;
  let officeRole = "staff";
  let directory = { customers: [], bookings: [], loading: true, error: "", refresh() {} };
  const scope = {
    ...context.api, useCustomerDirectory: () => directory,
    useNavigate: () => () => {}, MainLayout: "Layout", OfficeTools: "OfficeTools", CustomerEditDialog: "CustomerEditDialog",
    useAuth: () => ({ user: { id: "office-a" }, role: officeRole }),
    useState(initial) { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], value => states[i] = typeof value === "function" ? value(states[i]) : value]; },
    useMemo: fn => fn(), useRef: () => ({ current: null }), useEffect() {},
    React: { createElement: (type, props, ...children) => ({ type, props: props || {}, children }) },
  };
  vm.createContext(scope);
  const path = new URL("../pages/Customer/customer.jsx", import.meta.url);
  const { code } = await transformWithOxc(fs.readFileSync(path, "utf8"), path.pathname, { jsx: { runtime: "classic" } });
  vm.runInContext(code.replace(/^import .*;$/gm, "").replace("export default function", "function") + "\nthis.Page=Customer;", scope);
  const render = () => { cursor = 0; return scope.Page(); };
  const find = (node, type) => !node || typeof node !== "object" ? [] : [ ...(node.type === type ? [node] : []), ...(node.children || []).flat(Infinity).flatMap(child => find(child, type)) ];
  assert.ok(JSON.stringify(render()).includes("Loading customers..."));
  directory = { ...directory, loading: false };
  assert.ok(JSON.stringify(render()).includes("No registered customers yet."));
  directory = { ...directory, error: "Permission denied" };
  assert.ok(JSON.stringify(render()).includes("Permission denied"));
  directory = { ...directory, error: "", customers, bookings };
  let tree = render();
  assert.ok(JSON.stringify(tree).includes("Alpha Logistics"));
  assert.ok(!JSON.stringify(tree).includes("Reyna Pascual"));
  find(tree, "select")[0].props.onChange({ target: { value: "SUSPENDED" } });
  tree = render(); assert.equal(find(tree, "tr").length, 2);
  find(tree, "button").find(button => button.props.className === "action-dots-btn").props.onClick();
  tree = render();
  officeRole = "customer";
  assert.ok(!find(render(), "button").some(button => button.children.includes("Edit Customer")));
  officeRole = "admin";
  assert.ok(find(render(), "button").some(button => button.children.includes("Edit Customer")));
  officeRole = "staff";
  find(tree, "button").find(button => button.children.includes("Edit Customer")).props.onClick();
  tree = render();
  const editor = find(tree, "CustomerEditDialog")[0];
  assert.equal(editor.props.customer.id, "customer-b");
  assert.equal(editor.props.customer.email, customers[1].email);
  editor.props.onSaved();
  assert.ok(JSON.stringify(render()).includes("Customer details saved successfully."));
  find(render(), "button").find(button => button.props.className === "action-dots-btn").props.onClick();
  tree = render();
  find(tree, "button").find(button => button.children.includes("View Profile")).props.onClick();
  tree = render(); assert.ok(JSON.stringify(tree).includes("Customer Profile"));
  assert.ok(JSON.stringify(tree).includes("shipment-c"));
  // Deleting the selected customer removes the stale modal on the next snapshot.
  directory = { ...directory, customers: customers.filter(customer => customer.id !== "customer-b") };
  assert.ok(!JSON.stringify(render()).includes("Customer Profile"));
});
