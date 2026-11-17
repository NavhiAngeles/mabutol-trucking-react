import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function setup(options = {}) {
  let calledRpc = null;
  let calledParams = null;
  const client = {
    rpc: async (fn, params) => {
      calledRpc = fn;
      calledParams = params;
      if (options.error) return { data: null, error: options.error };
      return { data: options.data ?? 4, error: null };
    },
  };
  const scope = vm.createContext({ supabase: client });
  vm.runInContext(
    fs.readFileSync(new URL('./complianceNotificationService.js', import.meta.url), 'utf8')
      .replace(/^import .*;$/gm, '')
      .replace(/^export /gm, '') +
      '\nthis.api = complianceNotificationService(supabase);',
    scope
  );
  return {
    api: scope.api,
    getCall: () => ({ calledRpc, calledParams }),
  };
}

test('produceNotifications calls produce_compliance_notifications RPC with optional timestamp and returns count', async () => {
  const { api, getCall } = setup({ data: 6 });
  const count = await api.produceNotifications('2026-11-07T08:00:00Z');

  const { calledRpc, calledParams } = getCall();
  assert.equal(calledRpc, 'produce_compliance_notifications');
  assert.equal(calledParams.p_now, '2026-11-07T08:00:00Z');
  assert.equal(count, 6);
});

test('produceNotifications passes empty params when no timestamp provided and handles error', async () => {
  const { api, getCall } = setup({ error: { message: 'Office access required' } });
  await assert.rejects(
    api.produceNotifications(),
    /Office access required/
  );
  const { calledRpc, calledParams } = getCall();
  assert.equal(calledRpc, 'produce_compliance_notifications');
  assert.equal(Object.keys(calledParams).length, 0);
});
