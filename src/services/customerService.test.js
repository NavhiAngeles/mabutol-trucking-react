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
  vm.runInContext(source + "\nthis.api={fetchCustomers,fetchBillingCustomers,fetchCustomerBookings,subscribeCustomerBookings,clearCustomerCache,createCustomer};", context);
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

function createCustomerMock({ rpcResult, fromHandler } = {}) {
  const requests = [];
  const query = {
    select(columns) { requests.push(["select", columns]); return query; },
    eq(col, val) { requests.push(["eq", col, val]); return query; },
    ilike(col, val) { requests.push(["ilike", col, val]); return query; },
    limit(num) { requests.push(["limit", num]); return query; },
    insert(payload) { requests.push(["insert", payload]); return query; },
    single: async () => fromHandler ? fromHandler("single") : { data: { id: "new-cust-1", customer_code: "CUST-0001", name: "Acme Inc" }, error: null },
  };

  const scope = {
    supabase: {
      rpc: async (fn, params) => {
        requests.push(["rpc", fn, params]);
        if (rpcResult) return rpcResult(fn, params);
        return { data: { id: "new-cust-1", customer_code: "CUST-0001", ...params }, error: null };
      },
      from: (table) => {
        requests.push(["table", table]);
        if (fromHandler) return fromHandler(table);
        return query;
      },
    },
  };

  vm.createContext(scope);
  const source = fs.readFileSync(new URL("./customerService.js", import.meta.url), "utf8").replace(/^import .*;$/gm, "").replace(/^export /gm, "");
  vm.runInContext(source + "\nthis.api={createCustomer,clearCustomerCache,fetchCustomers,fetchBillingCustomers,AUTHORIZED_OFFICE_ROLES};", scope);
  return { ...scope.api, requests };
}

test("createCustomer enforces authorized office role (admin or staff)", async () => {
  const api = createCustomerMock();
  await assert.rejects(api.createCustomer({ name: "Valid Name" }, { callerRole: "driver" }), /Unauthorized/);
  await assert.rejects(api.createCustomer({ name: "Valid Name" }, { callerRole: "customer" }), /Unauthorized/);

  // Succeeds for staff and admin
  const staffRes = await api.createCustomer({ name: "Valid Staff Corp" }, { callerRole: "staff" });
  assert.ok(staffRes.id);

  const adminRes = await api.createCustomer({ name: "Valid Admin Corp" }, { callerRole: "admin" });
  assert.ok(adminRes.id);
});

test("createCustomer validates mandatory name and optional email/phone formats", async () => {
  const api = createCustomerMock();

  // Missing or short name
  await assert.rejects(api.createCustomer({ name: "" }), /name is required/);
  await assert.rejects(api.createCustomer({ name: "A" }), /at least 2 characters/);
  await assert.rejects(api.createCustomer({ name: "   " }), /name is required/);

  // Invalid email format
  await assert.rejects(api.createCustomer({ name: "Valid Name", email: "bad-email" }), /valid email/);
  await assert.rejects(api.createCustomer({ name: "Valid Name", email: "bad@" }), /valid email/);

  // Invalid phone format
  await assert.rejects(api.createCustomer({ name: "Valid Name", phone: "12345" }), /valid contact number/);
  await assert.rejects(api.createCustomer({ name: "Valid Name", phone: "123456789012345678" }), /valid contact number/);
});

test("createCustomer invokes office_create_customer RPC and surfaces duplicate email or phone exceptions", async () => {
  // Duplicate email from RPC
  const dupEmailApi = createCustomerMock({
    rpcResult: async () => ({ data: null, error: { code: "23505", message: 'A customer with email "dup@example.com" already exists.' } }),
  });
  await assert.rejects(
    dupEmailApi.createCustomer({ name: "Valid Co", email: "dup@example.com" }),
    /already exists/
  );

  // Duplicate phone from RPC
  const dupPhoneApi = createCustomerMock({
    rpcResult: async () => ({ data: null, error: { code: "23505", message: 'A customer with phone number "09171234567" already exists.' } }),
  });
  await assert.rejects(
    dupPhoneApi.createCustomer({ name: "Valid Co", phone: "0917-123-4567" }),
    /already exists/
  );

  // Normal successful RPC execution
  const successApi = createCustomerMock({
    rpcResult: async (fn, params) => ({
      data: { id: "cust-123", customer_code: "CUST-0088", name: params.p_name, email: params.p_email, is_active: true },
      error: null,
    }),
  });
  const created = await successApi.createCustomer({
    name: "San Miguel Logistics",
    email: "billing@smc.ph",
    phone: "0918-123-4567",
    address: "Highway 1",
    barangay: "Bgy 1",
    city: "Mandaluyong",
    province: "NCR",
    notes: "VIP corporate customer",
  });

  assert.equal(created.id, "cust-123");
  assert.equal(created.customer_code, "CUST-0088");
  assert.equal(created.name, "San Miguel Logistics");

  const rpcReq = successApi.requests.find(r => r[0] === "rpc");
  assert.ok(rpcReq);
  assert.equal(rpcReq[1], "office_create_customer");
  assert.equal(rpcReq[2].p_name, "San Miguel Logistics");
  assert.equal(rpcReq[2].p_email, "billing@smc.ph");
  assert.equal(rpcReq[2].p_phone, "0918-123-4567");
  assert.equal(rpcReq[2].p_notes, "VIP corporate customer");
});

test("createCustomer fallback path performs client-side duplicate verification before RLS insert", async () => {
  // RPC unavailable (e.g. mock or test schema missing RPC)
  let insertPayload = null;
  const existingCustomers = [
    { id: "c-old", email: "existing@example.com", phone: "0917-999-0000", is_active: true },
  ];

  const fallbackApi = createCustomerMock({
    rpcResult: async () => ({ data: null, error: { code: "42883", message: "function not found" } }),
    fromHandler: (table) => {
      if (table === "customers") {
        const q = {
          select: () => q,
          eq: () => q,
          ilike: (col, val) => ({
            limit: async () => ({
              data: existingCustomers.filter(c => c.email.toLowerCase() === val.toLowerCase()),
              error: null,
            }),
          }),
          insert: (payload) => {
            insertPayload = payload;
            return {
              select: () => ({
                single: async () => ({
                  data: { id: "cust-fb-1", customer_code: "CUST-0002", ...payload },
                  error: null,
                }),
              }),
            };
          },
        };
        // For phone query
        q.then = (resolve) => resolve({ data: existingCustomers, error: null });
        return q;
      }
    },
  });

  // Duplicate email detected in fallback
  await assert.rejects(
    fallbackApi.createCustomer({ name: "New Co", email: "existing@example.com" }),
    /already exists/
  );

  // Successful insert in fallback
  const created = await fallbackApi.createCustomer({
    name: "Brand New Co",
    email: "fresh@example.com",
    phone: "0920-111-2222",
  });
  assert.equal(created.id, "cust-fb-1");
  assert.equal(created.name, "Brand New Co");
  assert.equal(insertPayload.name, "Brand New Co");
  assert.equal(insertPayload.email, "fresh@example.com");
  assert.equal(insertPayload.is_active, true);
});

test("createCustomer validates password requirements when mobile account credentials are provided", async () => {
  const api = createCustomerMock();

  // Short password rejected
  await assert.rejects(
    api.createCustomer({
      name: "Acme Mobile Customer",
      email: "acme@mobile.test",
      password: "short",
    }),
    /at least 8 characters/
  );

  // Mismatched passwords rejected
  await assert.rejects(
    api.createCustomer({
      name: "Acme Mobile Customer",
      email: "acme@mobile.test",
      password: "validpassword123",
      confirmPassword: "differentpassword",
    }),
    /Passwords do not match/
  );

  // Missing email with password rejected
  await assert.rejects(
    api.createCustomer({
      name: "Acme Mobile Customer",
      email: "",
      password: "validpassword123",
      confirmPassword: "validpassword123",
    }),
    /Email address is required/
  );
});

test("createCustomer invokes create-customer-user Edge Function when password is provided", async () => {
  let invokedFn = null;
  let invokedBody = null;

  const context = {
    supabase: {
      functions: {
        invoke: async (fn, { body }) => {
          invokedFn = fn;
          invokedBody = body;
          return {
            data: {
              userId: "user-mobile-456",
              customerId: "cust-mobile-789",
              customerCode: "CUST-0099",
              customer: {
                id: "cust-mobile-789",
                customer_code: "CUST-0099",
                user_id: "user-mobile-456",
                name: body.fullName,
                email: body.email,
                is_active: true,
              },
            },
            error: null,
          };
        },
      },
    },
  };

  const scope = vm.createContext(context);
  const source = fs.readFileSync(new URL("./customerService.js", import.meta.url), "utf8")
    .replace(/^import .*;$/gm, "").replace(/^export /gm, "");
  vm.runInContext(source + "\nthis.api={createCustomer,clearCustomerCache};", scope);

  const res = await scope.api.createCustomer({
    name: "Juan Mobile Client",
    email: "juan@customer.ph",
    phone: "0917-555-1234",
    password: "Password123!",
    confirmPassword: "Password123!",
  });

  assert.equal(invokedFn, "create-customer-user");
  assert.equal(invokedBody.email, "juan@customer.ph");
  assert.equal(invokedBody.fullName, "Juan Mobile Client");
  assert.equal(invokedBody.password, "Password123!");
  assert.equal(res.id, "cust-mobile-789");
  assert.equal(res.user_id, "user-mobile-456");
});

test("createCustomer falls back to direct auth signup and links user_id when edge function is not deployed", async () => {
  let signedUpPayload = null;
  let customerUpdated = null;
  let rpcConfirmed = null;

  const mockCustomer = {
    id: "cust-direct-101",
    customer_code: "CUST-0101",
    user_id: null,
    name: "Maria Santos",
    email: "maria@customer.ph",
    phone: "0918-123-4567",
    is_active: true,
  };

  const context = {
    supabase: {
      supabaseUrl: "https://mock.supabase.co",
      supabaseKey: "mock-key",
      functions: {
        invoke: async () => ({
          data: null,
          error: { status: 404, message: "Function not found" },
        }),
      },
      auth: {
        signUp: async ({ email, password, options }) => {
          signedUpPayload = { email, password, options };
          return {
            data: {
              user: {
                id: "auth-user-maria-999",
                email,
                identities: [{ id: "maria-identity" }],
              },
            },
            error: null,
          };
        },
      },
      from: (table) => {
        if (table === "customers") {
          return {
            select: () => ({
              or: () => ({
                limit: async () => ({
                  data: [mockCustomer],
                  error: null,
                }),
              }),
            }),
            update: (payload) => {
              customerUpdated = payload;
              return {
                eq: () => ({
                  select: () => ({
                    single: async () => ({
                      data: { ...mockCustomer, ...payload },
                      error: null,
                    }),
                  }),
                }),
              };
            },
          };
        }
        return {};
      },
      rpc: async (fn, params) => {
        if (fn === "office_confirm_customer_user") {
          rpcConfirmed = params;
          return { data: true, error: null };
        }
        return { data: null, error: null };
      },
    },
  };

  const scope = vm.createContext(context);
  const source = fs.readFileSync(new URL("./customerService.js", import.meta.url), "utf8")
    .replace(/^import .*;$/gm, "").replace(/^export /gm, "");
  vm.runInContext(source + "\nthis.api={createCustomer,clearCustomerCache};", scope);

  const res = await scope.api.createCustomer({
    name: "Maria Santos",
    email: "maria@customer.ph",
    phone: "0918-123-4567",
    password: "Password123!",
    confirmPassword: "Password123!",
  });

  assert.equal(signedUpPayload.email, "maria@customer.ph");
  assert.equal(signedUpPayload.password, "Password123!");
  assert.equal(customerUpdated.user_id, "auth-user-maria-999");
  assert.equal(rpcConfirmed.p_user_id, "auth-user-maria-999");
  assert.equal(res.user_id, "auth-user-maria-999");
});

test("createCustomer rejects and alerts when direct auth reports duplicate email", async () => {
  const context = {
    supabase: {
      supabaseUrl: "https://mock.supabase.co",
      supabaseKey: "mock-key",
      functions: {
        invoke: async () => ({
          data: null,
          error: { status: 404, message: "Function not found" },
        }),
      },
      auth: {
        signUp: async () => ({
          data: { user: null },
          error: { message: "User already registered" },
        }),
      },
    },
  };

  const scope = vm.createContext(context);
  const source = fs.readFileSync(new URL("./customerService.js", import.meta.url), "utf8")
    .replace(/^import .*;$/gm, "").replace(/^export /gm, "");
  vm.runInContext(source + "\nthis.api={createCustomer,clearCustomerCache};", scope);

  await assert.rejects(
    scope.api.createCustomer({
      name: "Existing Client",
      email: "already@exists.com",
      password: "Password123!",
      confirmPassword: "Password123!",
    }),
    /already exists/
  );
});

test("updateCustomer provisions mobile auth user and links user_id when password is provided", async () => {
  let updatedPayload = null;
  let signedUpEmail = null;

  const existingCustomer = {
    id: "cust-edit-1",
    user_id: null,
    name: "Pedro Penduko",
    email: "pedro@test.com",
    phone: "0917-111-2222",
    updated_at: "2026-11-10T10:00:00Z",
  };

  const context = {
    supabase: {
      supabaseUrl: "https://mock.supabase.co",
      supabaseKey: "mock-key",
      functions: {
        invoke: async () => ({
          data: null,
          error: { status: 404, message: "Function not found" },
        }),
      },
      auth: {
        signUp: async ({ email }) => {
          signedUpEmail = email;
          return {
            data: { user: { id: "auth-pedro-777", identities: [{ id: "1" }] } },
            error: null,
          };
        },
      },
      from: (table) => {
        if (table === "customers") {
          return {
            update: (payload) => {
              updatedPayload = payload;
              return {
                eq: () => ({
                  eq: () => ({
                    select: () => ({
                      maybeSingle: async () => ({
                        data: { ...existingCustomer, ...payload },
                        error: null,
                      }),
                    }),
                  }),
                }),
              };
            },
          };
        }
        return {};
      },
      rpc: async () => ({ data: true, error: null }),
    },
  };

  const scope = vm.createContext(context);
  const source = fs.readFileSync(new URL("./customerService.js", import.meta.url), "utf8")
    .replace(/^import .*;$/gm, "").replace(/^export /gm, "");
  vm.runInContext(source + "\nthis.api={updateCustomer,customerEditValues};", scope);

  const res = await scope.api.updateCustomer(existingCustomer, {
    name: "Pedro Penduko",
    email: "pedro@test.com",
    phone: "0917-111-2222",
    password: "NewPassword123!",
    confirmPassword: "NewPassword123!",
  });

  assert.equal(signedUpEmail, "pedro@test.com");
  assert.equal(updatedPayload.user_id, "auth-pedro-777");
  assert.equal(res.user_id, "auth-pedro-777");
});

