import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function service(result) {
  const requests = [];
  const removed = [];
  const channel = { on: () => channel, subscribe: () => channel };
  const context = { supabase: { from(table) {
    let request;
    const query = { select(columns) { request = { table, columns, filters: [] }; requests.push(request); return query; }, eq(column, value) { request.filters.push([column, value]); return query; }, order() { return query; }, async range(start, end) { return result(start, end, table); } };
    return query;
  }, channel: () => channel, removeChannel: value => removed.push(value) } };
  vm.createContext(context);
  const source = fs.readFileSync(new URL("./customerService.js", import.meta.url), "utf8").replace(/^import .*;$/gm, "").replace(/^export /gm, "");
  vm.runInContext(source + "\nthis.api={fetchCustomers,fetchBillingCustomers,fetchCustomerBookings,subscribeCustomerBookings,clearCustomerCache};", context);
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

test('billing excludes converted drivers, office, inactive and unresolved accounts without hiding business customers', async () => {
  const customers = [
    { id: 'customer', user_id: 'c', is_active: true, name: 'Same name' },
    { id: 'driver-history', user_id: 'd', is_active: true, name: 'Same name' },
    { id: 'office-history', user_id: 'a', is_active: true },
    { id: 'disabled-login', user_id: 'disabled', is_active: true },
    { id: 'disabled-customer', user_id: 'c', is_active: false },
    { id: 'unknown-login', user_id: 'missing', is_active: true },
    { id: 'business', user_id: null, is_active: true },
  ];
  const accounts = [{ id: 'c', role: 'customer', is_active: true }, { id: 'd', role: 'driver', is_active: true },
    { id: 'a', role: 'admin', is_active: true }, { id: 'disabled', role: 'customer', is_active: false }];
  const api = service((start, end, table) => ({ data: (table === 'users' ? accounts : customers).slice(start, end + 1) }));
  assert.deepEqual(Array.from(await api.fetchBillingCustomers(), row => row.id), ['customer', 'business']);
  assert.deepEqual(api.requests.find(request => request.table === 'users').filters, [['role', 'customer'], ['is_active', true]]);
  // General directory/history is deliberately preserved.
  assert.equal((await api.fetchCustomers()).length, customers.length);
});

test('billing fails closed on account-read errors and reads eligibility beyond the first page', async () => {
  const accounts = Array.from({ length: 501 }, (_, i) => ({ id: `u${i}`, role: 'customer', is_active: true }));
  const customer = { id: 'last', user_id: 'u500', is_active: true };
  const api = service((start, end, table) => ({ data: table === 'users' ? accounts.slice(start, end + 1) : [customer] }));
  assert.equal((await api.fetchBillingCustomers())[0].id, 'last');
  assert.equal(api.requests.filter(request => request.table === 'users').length, 2);
  await assert.rejects(service((start, end, table) => table === 'users'
    ? { error: Error('Role lookup denied') } : { data: [customer] }).fetchBillingCustomers(), /Role lookup denied/);
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

test("deduplicates concurrent in-flight fetchCustomers requests", async () => {
  let callCount = 0;
  const api = service(() => {
    callCount++;
    return { data: [{ id: "c1" }], error: null };
  });
  const [res1, res2] = await Promise.all([
    api.fetchCustomers(),
    api.fetchCustomers(),
  ]);
  assert.equal(res1.length, 1);
  assert.equal(res2.length, 1);
  assert.equal(callCount, 1);
  assert.equal(api.requests.length, 1);
});

test("clears customer cache on explicit clearCustomerCache", async () => {
  let callCount = 0;
  const api = service(() => {
    callCount++;
    return { data: [{ id: `c-${callCount}` }], error: null };
  });
  const first = await api.fetchCustomers();
  assert.equal(first[0].id, "c-1");
  const cached = await api.fetchCustomers();
  assert.equal(cached[0].id, "c-1");
  assert.equal(callCount, 1);

  api.clearCustomerCache();
  const refreshed = await api.fetchCustomers();
  assert.equal(refreshed[0].id, "c-2");
  assert.equal(callCount, 2);
});

test("updateCustomer invalidates cache so subsequent fetch queries database", async () => {
  let fetchCount = 0;
  const query = {
    select() { return query; },
    eq() { return query; },
    order() { return query; },
    range: async () => { fetchCount++; return { data: [{ id: "customer-a" }], error: null }; },
    update() { return query; },
    maybeSingle: async () => ({ data: { id: "customer-a", updated_at: "new-time" }, error: null }),
  };
  const scope = { supabase: { from: () => query } };
  vm.createContext(scope);
  const source = fs.readFileSync(new URL("./customerService.js", import.meta.url), "utf8").replace(/^import .*;$/gm, "").replace(/^export /gm, "");
  vm.runInContext(source + "\nthis.api={fetchCustomers,updateCustomer};", scope);
  await scope.api.fetchCustomers();
  assert.equal(fetchCount, 1);
  await scope.api.fetchCustomers();
  assert.equal(fetchCount, 1);
  await scope.api.updateCustomer({ id: "customer-a", updated_at: "time" }, { name: "New Name" });
  await scope.api.fetchCustomers();
  assert.equal(fetchCount, 2);
});

function statusMock(result = { data: { id: "cust-1", is_active: false, updated_at: "new-time" }, error: null }) {
  const requests = [];
  const query = {
    update(payload) { requests.push(["update", payload]); return query; },
    eq(key, value) { requests.push([key, value]); return query; },
    select(columns) { requests.push(["select", columns]); return query; },
    maybeSingle: async () => result,
  };
  const scope = { supabase: { from(table) { requests.push(["table", table]); return query; } } };
  vm.createContext(scope);
  const source = fs.readFileSync(new URL("./customerService.js", import.meta.url), "utf8").replace(/^import .*;$/gm, "").replace(/^export /gm, "");
  vm.runInContext(source + "\nthis.api={setCustomerActiveStatus,clearCustomerCache,fetchCustomers,AUTHORIZED_OFFICE_ROLES};", scope);
  return { ...scope.api, requests };
}

test("setCustomerActiveStatus enforces authorized office role (admin or staff)", async () => {
  const activeCustomer = { id: "cust-1", is_active: true, updated_at: "2026-11-01T00:00:00Z" };
  const api = statusMock();

  // Rejects unauthenticated or unauthorized callers
  await assert.rejects(api.setCustomerActiveStatus(activeCustomer, false, "Valid reason"), /Unauthorized/);
  await assert.rejects(api.setCustomerActiveStatus(activeCustomer, false, "Valid reason", { callerRole: "customer" }), /Unauthorized/);
  await assert.rejects(api.setCustomerActiveStatus(activeCustomer, false, "Valid reason", { callerRole: "driver" }), /Unauthorized/);
  await assert.rejects(api.setCustomerActiveStatus(activeCustomer, false, "Valid reason", { callerRole: null }), /Unauthorized/);

  // Allows staff and admin
  const staffRes = await api.setCustomerActiveStatus(activeCustomer, false, "Account violation reported", { callerRole: "staff" });
  assert.equal(staffRes.id, "cust-1");

  const adminApi = statusMock();
  const adminRes = await adminApi.setCustomerActiveStatus(activeCustomer, false, "Account violation reported", { callerRole: "admin" });
  assert.equal(adminRes.id, "cust-1");
});

test("setCustomerActiveStatus requires non-empty confirmation reason of at least 3 characters", async () => {
  const activeCustomer = { id: "cust-1", is_active: true, updated_at: "2026-11-01T00:00:00Z" };
  const api = statusMock();

  await assert.rejects(api.setCustomerActiveStatus(activeCustomer, false, "", { callerRole: "admin" }), /valid reason/);
  await assert.rejects(api.setCustomerActiveStatus(activeCustomer, false, "  ", { callerRole: "admin" }), /valid reason/);
  await assert.rejects(api.setCustomerActiveStatus(activeCustomer, false, "no", { callerRole: "admin" }), /valid reason/);
  await assert.rejects(api.setCustomerActiveStatus(activeCustomer, false, null, { callerRole: "admin" }), /valid reason/);
  assert.equal(api.requests.length, 0);
});

test("setCustomerActiveStatus enforces optimistic updated_at concurrency check", async () => {
  const customer = { id: "cust-1", is_active: true, updated_at: "2026-11-01T00:00:00Z" };

  // Fails when updated_at or id is missing from customer argument
  const api = statusMock();
  await assert.rejects(api.setCustomerActiveStatus({ id: "cust-1" }, false, "Valid reason", { callerRole: "admin" }), /Refresh the customer directory/);
  await assert.rejects(api.setCustomerActiveStatus({ updated_at: "time" }, false, "Valid reason", { callerRole: "admin" }), /Refresh the customer directory/);

  // Fails when record was concurrently modified in database (returns null data)
  const staleApi = statusMock({ data: null, error: null });
  await assert.rejects(staleApi.setCustomerActiveStatus(customer, false, "Valid reason", { callerRole: "admin" }), /changed or is no longer editable/);

  // Passes with exact matching id and updated_at query
  const freshApi = statusMock();
  await freshApi.setCustomerActiveStatus(customer, false, "Suspended due to repeated payment failure", { callerRole: "admin" });
  assert.ok(freshApi.requests.some(item => item[0] === "id" && item[1] === customer.id));
  assert.ok(freshApi.requests.some(item => item[0] === "updated_at" && item[1] === customer.updated_at));
});

test("setCustomerActiveStatus suspends customer and syncs linked user while preserving shipments", async () => {
  const activeCustomer = { id: "cust-1", user_id: "user-1", is_active: true, updated_at: "2026-11-01T00:00:00Z" };
  const api = statusMock({ data: { id: "cust-1", is_active: false, updated_at: "2026-11-01T01:00:00Z" }, error: null });

  const result = await api.setCustomerActiveStatus(activeCustomer, false, "Suspended by office request", { callerRole: "staff" });
  assert.equal(result.is_active, false);

  // Verify customers table update
  const customerTableReqs = api.requests.filter(r => r[0] === "table" && r[1] === "customers");
  assert.equal(customerTableReqs.length, 1);
  const updatePayload = api.requests.find(r => r[0] === "update")[1];
  assert.deepEqual(JSON.parse(JSON.stringify(updatePayload)), { is_active: false });

  // Verify users table sync
  const userTableReqs = api.requests.filter(r => r[0] === "table" && r[1] === "users");
  assert.equal(userTableReqs.length, 1);

  // Shipments table is NEVER modified or deleted
  const shipmentTableReqs = api.requests.filter(r => r[0] === "table" && r[1] === "shipments");
  assert.equal(shipmentTableReqs.length, 0);
});

test("setCustomerActiveStatus reactivates suspended customer and rejects duplicate status", async () => {
  const suspendedCustomer = { id: "cust-2", user_id: "user-2", is_active: false, updated_at: "2026-11-01T00:00:00Z" };
  const api = statusMock({ data: { id: "cust-2", is_active: true, updated_at: "2026-11-01T02:00:00Z" }, error: null });

  // Reject redundant reactivation
  await assert.rejects(api.setCustomerActiveStatus(suspendedCustomer, false, "Already suspended", { callerRole: "admin" }), /already suspended/);

  // Successful reactivation
  const result = await api.setCustomerActiveStatus(suspendedCustomer, true, "Account cleared and verified", { callerRole: "admin" });
  assert.equal(result.is_active, true);
  const updatePayload = api.requests.find(r => r[0] === "update")[1];
  assert.deepEqual(JSON.parse(JSON.stringify(updatePayload)), { is_active: true });
});
