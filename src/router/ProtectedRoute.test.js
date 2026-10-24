import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Navigate } from "react-router-dom";
import { transformWithOxc } from "vite";

// Compile actual JSX, retaining real React/router imports and mocking only auth.
const authUrl = `data:text/javascript,${encodeURIComponent("export const state = {}; export const useAuth = () => state.current;")}`;
const { state } = await import(authUrl);
const gateUrl = `data:text/javascript,${encodeURIComponent('export default function MfaGate() {}')}`;
const { default: MfaGate } = await import(gateUrl);
const source = await readFile(new URL("./ProtectedRoute.jsx", import.meta.url), "utf8");
const { code } = await transformWithOxc(source, "ProtectedRoute.jsx", { jsx: { runtime: "automatic" } });
const executable = code.replace(/from\s+(["'])([^"']+)\1/g, (_, quote, specifier) =>
  `from ${quote}${specifier === "../context/AuthContext" ? authUrl : specifier === "../components/MfaGate" ? gateUrl : import.meta.resolve(specifier)}${quote}`,
);
const { default: ProtectedRoute } = await import(`data:text/javascript,${encodeURIComponent(executable)}`);
const children = { marker: "protected content" };

for (const role of [null, "admin"]) {
  test(`loading hides protected content (role=${role})`, () => {
    state.current = { loading: true, user: role ? { id: "office" } : null, role };
    assert.equal(ProtectedRoute({ children }), null);
  });
}
for (const current of [
  { user: null, role: null },
  { user: null, role: "admin" },
  ...[null, undefined, "customer", "driver", "ADMIN", "unknown"].map(role => ({ user: { id: "denied" }, role })),
]) {
  test(`anonymous/denied redirects home with replace (user=${!!current.user}, role=${current.role})`, () => {
    state.current = { loading: false, ...current };
    const result = ProtectedRoute({ children });
    assert.equal(result.type, Navigate);
    assert.equal(result.props.to, "/");
    assert.equal(result.props.replace, true);
  });
}
for (const role of ["admin", "staff"]) {
  test(`${role} receives protected children`, () => {
    state.current = { loading: false, user: { id: "office" }, role };
    const result = ProtectedRoute({ children });
    assert.equal(result.type, MfaGate);
    assert.equal(result.props.children, children);
    assert.equal(result.key, 'office');
  });
}
