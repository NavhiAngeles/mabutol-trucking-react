import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { transformWithEsbuild } from "vite";

const source = await readFile(new URL("./index.ts", import.meta.url), "utf8");
const { code } = await transformWithEsbuild(source, "index.ts", { loader: "ts" });

async function invoke({
  profile = { role: "staff", is_active: true },
  profileError = null,
  caller = { id: "caller", user_metadata: { role: "admin" }, app_metadata: { role: "admin" } },
  authError = null,
  header = true,
  method = "POST",
} = {}) {
  let handler, created = 0, upserted = 0, reads = 0;
  const scope = {
    Request,
    Response,
    Deno: { env: { get: name => name }, serve: fn => { handler = fn; } },
    createClient(url, key, options) {
      if (options) return { auth: { getUser: async () => ({ data: { user: caller }, error: authError }) } };
      return {
        auth: {
          admin: {
            createUser: async details => {
              created++;
              assert.equal(details.user_metadata.role, "customer");
              return { data: { user: { id: "new-customer" } }, error: null };
            },
          },
        },
        from(table) {
          if (table === "users") {
            return {
              select(columns) {
                reads++;
                assert.ok(columns.includes("role"));
                assert.ok(columns.includes("is_active"));
                return {
                  eq(column, id) {
                    assert.equal(column, "id");
                    assert.equal(id, "caller");
                    return { single: async () => ({ data: profile, error: profileError }) };
                  },
                };
              },
              upsert: async row => {
                upserted++;
                assert.equal(row.role, "customer");
                return { error: null };
              },
            };
          }
          if (table === "customers") {
            return {
              select() {
                return {
                  or() {
                    return {
                      limit() {
                        return {
                          single: async () => ({ data: null, error: null }),
                        };
                      },
                    };
                  },
                };
              },
              insert() {
                return {
                  select() {
                    return {
                      single: async () => ({
                        data: { id: "cust-created", customer_code: "CUST-0001", user_id: "new-customer" },
                        error: null,
                      }),
                    };
                  },
                };
              },
            };
          }
          throw new Error(`Unexpected table ${table}`);
        },
      };
    },
  };

  vm.createContext(scope);
  vm.runInContext(code.replace(/^import .*;$/gm, ""), scope);

  const response = await handler(
    new Request("https://example.test/create-customer-user", {
      method,
      headers: header ? { Authorization: "Bearer fixture", "Content-Type": "application/json" } : {},
      ...(method === "OPTIONS"
        ? {}
        : {
            body: JSON.stringify({
              email: "customer@example.test",
              password: "fixture-password-123",
              fullName: "Acme Customer",
              phone: "09171234567",
              customerData: { name: "Acme Customer", phone: "09171234567" },
            }),
          }),
    }),
  );

  return { response, created, upserted, reads };
}

for (const role of ["admin", "staff"]) {
  test(`active ${role} can provision a customer mobile account`, async () => {
    const result = await invoke({ profile: { role, is_active: true } });
    assert.equal(result.response.status, 200);
    assert.equal(result.created, 1);
    assert.equal(result.upserted, 1);
    const data = await result.response.json();
    assert.equal(data.userId, "new-customer");
    assert.equal(data.customerId, "cust-created");
  });
}

for (const role of ["driver", "customer", "unknown", null]) {
  test(`denies profile role=${role} from creating customer mobile accounts`, async () => {
    const result = await invoke({ profile: { role, is_active: true } });
    assert.equal(result.response.status, 403);
    assert.equal(result.created, 0);
  });
}

test("CORS preflight succeeds for create-customer-user", async () => {
  const result = await invoke({ method: "OPTIONS", header: false });
  assert.equal(result.response.status, 200);
  assert.equal(result.created, 0);
});

test("create-customer-user normalizes +6309/00639/dot variants and rejects partial PH mobile numbers", async () => {
  let handler;
  const createdPhones = [];
  const scope = {
    Request, Response,
    Deno: { env: { get: name => name }, serve: fn => { handler = fn; } },
    createClient: (_url, _key, options) => options
      ? { auth: { getUser: async () => ({ data: { user: { id: "caller" } }, error: null }) } }
      : {
          auth: { admin: { createUser: async details => { createdPhones.push(details.phone); return { data: { user: { id: "u1" } }, error: null }; } } },
          from: (table) => table === "users"
            ? { select: () => ({ eq: () => ({ single: async () => ({ data: { role: "admin", is_active: true }, error: null }) }) }), upsert: async () => ({ error: null }) }
            : { select: () => ({ or: () => ({ limit: () => ({ single: async () => ({ data: null, error: null }) }) }) }), insert: () => ({ select: () => ({ single: async () => ({ data: { id: "c1", customer_code: "CUST-1" }, error: null }) }) }) },
        },
  };
  vm.createContext(scope);
  vm.runInContext(code.replace(/^import .*;$/gm, ""), scope);

  for (const variant of ["0917.123.4567", "+6309171234567", "00639171234567"]) {
    const res = await handler(new Request("https://example.test/create-customer-user", {
      method: "POST",
      headers: { Authorization: "Bearer fixture", "Content-Type": "application/json" },
      body: JSON.stringify({ email: "c@example.test", password: "fixture-password", fullName: "C", phone: variant }),
    }));
    assert.equal(res.status, 200);
  }
  assert.deepEqual(createdPhones, ["+639171234567", "+639171234567", "+639171234567"]);

  const bad = await handler(new Request("https://example.test/create-customer-user", {
    method: "POST",
    headers: { Authorization: "Bearer fixture", "Content-Type": "application/json" },
    body: JSON.stringify({ email: "c@example.test", password: "fixture-password", fullName: "C", phone: "0917123" }),
  }));
  assert.equal(bad.status, 400);
  assert.equal(createdPhones.length, 3);
});

