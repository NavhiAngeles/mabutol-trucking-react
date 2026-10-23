import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { transformWithOxc } from "vite";

const source = await readFile(new URL("./index.ts", import.meta.url), "utf8");
const { code } = await transformWithOxc(source, "index.ts");
async function invoke({ profile = { role: "staff", is_active: true }, profileError = null, caller = { id: "caller", user_metadata: { role: "admin" }, app_metadata: { role: "admin" } }, authError = null, header = true, method = "POST" } = {}) {
  let handler, created = 0, upserted = 0, reads = 0;
  const scope = {
    Request, Response,
    Deno: { env: { get: name => name }, serve: fn => { handler = fn; } },
    createClient(url, key, options) {
      if (options) return { auth: { getUser: async () => ({ data: { user: caller }, error: authError }) } };
      return {
        auth: { admin: { createUser: async details => { created++; assert.equal(details.user_metadata.role, "driver"); return { data: { user: { id: "new-driver" } }, error: null }; } } },
        from(table) {
          assert.equal(table, "users");
          return {
            select(columns) { reads++; assert.ok(columns.includes("role")); assert.ok(columns.includes("is_active")); return { eq(column, id) { assert.equal(column, "id"); assert.equal(id, "caller"); return { single: async () => ({ data: profile, error: profileError }) }; } }; },
            upsert: async row => { upserted++; assert.equal(row.role, "driver"); return { error: null }; },
          };
        },
      };
    },
  };
  vm.createContext(scope);
  vm.runInContext(code.replace(/^import .*;$/gm, ""), scope);
  const response = await handler(new Request("https://example.test/create-driver-user", {
    method, headers: header ? { Authorization: "Bearer fixture", "Content-Type": "application/json" } : {},
    ...(method === "OPTIONS" ? {} : { body: JSON.stringify({ email: "driver@example.test", password: "fixture-password" }) }),
  }));
  return { response, created, upserted, reads };
}
for (const role of ["admin", "staff"]) {
  test(`active ${role} can provision a driver`, async () => {
    const result = await invoke({ profile: { role, is_active: true } });
    assert.equal(result.response.status, 200); assert.equal(result.created, 1); assert.equal(result.upserted, 1);
    assert.equal((await result.response.json()).userId, "new-driver");
  });
}
for (const role of ["admin", "staff", "driver", "customer", "unknown", null]) {
  for (const is_active of role === "admin" || role === "staff" ? [false, null, undefined, "true", 1] : [true]) {
    test(`denies profile role=${role} active=${is_active} despite privileged metadata`, async () => {
      const result = await invoke({ profile: { role, is_active } });
      assert.equal(result.response.status, 403); assert.equal(result.created, 0); assert.equal(result.upserted, 0);
    });
  }
}
for (const options of [
  { profile: null },
  { profile: {}, profileError: null },
  { profile: null, profileError: { message: "sensitive database details" } },
  { profile: { role: "admin", is_active: true }, profileError: { message: "query failed" } },
]) {
  test(`profile failure fails closed: ${JSON.stringify(options)}`, async () => {
    const result = await invoke(options);
    assert.equal(result.response.status, 403); assert.equal(result.created, 0); assert.equal(result.upserted, 0);
    assert.equal((await result.response.json()).error, "Only active admin/staff can create driver accounts.");
  });
}
for (const options of [{ caller: null }, { authError: { message: "bad JWT" } }, { header: false }]) {
  test(`unauthenticated caller cannot reach provisioning: ${JSON.stringify(options)}`, async () => {
    const result = await invoke(options);
    assert.notEqual(result.response.status, 200); assert.equal(result.created, 0); assert.equal(result.upserted, 0); assert.equal(result.reads, 0);
  });
}
test("CORS preflight succeeds without reading profiles or provisioning", async () => {
  const result = await invoke({ method: "OPTIONS", header: false });
  assert.equal(result.response.status, 200); assert.equal(result.created, 0); assert.equal(result.reads, 0);
});
