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
