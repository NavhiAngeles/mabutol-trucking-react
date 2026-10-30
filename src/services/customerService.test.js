import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function service(result) {
  const requests = [];
  const removed = [];
  const channel = { on: () => channel, subscribe: () => channel };
  const context = { supabase: { from(table) {
    const query = { select(columns) { requests.push({ table, columns }); return query; }, order() { return query; }, async range(start, end) { return result(start, end); } };
    return query;
  }, channel: () => channel, removeChannel: value => removed.push(value) } };
  vm.createContext(context);
  const source = fs.readFileSync(new URL("./customerService.js", import.meta.url), "utf8").replace(/^import .*;$/gm, "").replace(/^export /gm, "");
  vm.runInContext(source + "\nthis.api={fetchCustomers,fetchCustomerBookings,subscribeCustomerBookings};", context);
  return { ...context.api, requests, removed, channel };
}

test("fetches exact customer schema and reads beyond the first 500 records", async () => {
  const rows = Array.from({ length: 501 }, (_, index) => ({ id: `customer-${index}` }));
  const api = service((start, end) => ({ data: rows.slice(start, end + 1), error: null }));
  assert.equal((await api.fetchCustomers()).length, 501);
  assert.equal(api.requests.length, 2);
  assert.equal(api.requests[0].table, "customers");
  assert.ok(api.requests[0].columns.includes("customer_code"));
  assert.ok(!api.requests[0].columns.includes("company_name"));
});

test("propagates permission errors and rejects malformed records", async () => {
  await assert.rejects(service(() => ({ data: null, error: new Error("Permission denied") })).fetchCustomers(), /Permission denied/);
  await assert.rejects(service(() => ({ data: [{}], error: null })).fetchCustomers(), /Invalid customers record/);
  assert.equal((await service(() => ({ data: [], error: null })).fetchCustomers()).length, 0);
});

test("booking subscription cleanup removes its own channel", () => {
  const api = service(() => ({ data: [], error: null }));
  const cleanup = api.subscribeCustomerBookings(() => {});
  cleanup();
  assert.equal(api.removed[0], api.channel);
});

function editor(result = { data: { id: "customer-a", name: "Updated" }, error: null }) {
  const requests = [];
  const query = {
    update(payload) { requests.push(["update", payload]); return query; },
    eq(key, value) { requests.push([key, value]); return query; },
    select() { return query; },
    maybeSingle: async () => result,
  };
  const scope = { supabase: { from(table) { requests.push(["table", table]); return query; } } };
  vm.createContext(scope);
  const source = fs.readFileSync(new URL("./customerService.js", import.meta.url), "utf8").replace(/^import .*;$/gm, "").replace(/^export /gm, "");
  vm.runInContext(source + "\nthis.updateCustomer=updateCustomer;this.customerEditValues=customerEditValues;", scope);
  return { ...scope, requests };
}
const original = { id: "customer-a", updated_at: "2026-10-30T10:00:00Z" };

test("customer edit updates only allowed fields, guards version and returns confirmed row", async () => {
  const api = editor();
  const result = await api.updateCustomer(original, { name: " Updated ", phone: "+63 917 123 4567", email: "", barangay: " Sample Barangay ", city: " Manila ", user_id: "attacker", is_active: false });
  assert.equal(result.name, "Updated");
  const payload = api.requests.find(item => item[0] === "update")[1];
  assert.deepEqual(JSON.parse(JSON.stringify(payload)), { name: "Updated", email: null, phone: "+63 917 123 4567", address: null, barangay: "Sample Barangay", city: "Manila", province: null });
  assert.ok(api.requests.some(item => item[0] === "id" && item[1] === original.id));
  assert.ok(api.requests.some(item => item[0] === "updated_at" && item[1] === original.updated_at));
});

test("customer edit rejects invalid input before sending requests", async () => {
  const api = editor();
  await assert.rejects(api.updateCustomer(original, { name: " " }), /name is required/);
  await assert.rejects(api.updateCustomer(original, { name: "Valid", email: "broken" }), /valid email/);
  await assert.rejects(api.updateCustomer(original, { name: "Valid", phone: "abc1234" }), /valid contact/);
  await assert.rejects(api.updateCustomer({ id: "customer-a" }, { name: "Valid" }), /Refresh/);
  assert.equal(api.requests.length, 0);
});

test("customer edit never reports success for conflicts, deleted rows or permission failures", async () => {
  await assert.rejects(editor({ data: null, error: null }).updateCustomer(original, { name: "Valid" }), /changed or is no longer editable/);
  await assert.rejects(editor({ data: null, error: { message: "private database details" } }).updateCustomer(original, { name: "Valid" }), /Unable to save customer details/);
});

test("customer edit uses raw nullable fields rather than display placeholders or joined addresses", () => {
  const values = editor().customerEditValues({ name: "Name", email: null, phone: null, address: "Street", city: "City", province: "Province", is_active: true });
  assert.equal(values.email, "");
  assert.equal(values.address, "Street");
  assert.equal(Object.hasOwn(values, "is_active"), false);
});
