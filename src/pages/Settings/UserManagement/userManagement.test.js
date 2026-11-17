import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {setImmediate} from 'node:timers';
import {transformWithOxc} from 'vite';
import {normalizeOfficePhone} from '../../../../supabase/functions/_shared/officePhone.js';
const validationScope=vm.createContext({supabase:{},normalizeOfficePhone});
vm.runInContext(fs.readFileSync(new URL('../../../services/userManagementService.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replace(/^export /gm,'')+'\nthis.validate=validateOfficeCreation;',validationScope);
const row={id:'caller',full_name:'Fixture Admin',email:'fixture@example.test',phone:'',role:'admin',is_active:true,updated_at:'version'};
const find=(node,predicate)=>!node||typeof node!=='object'?[]:[...(predicate(node)?[node]:[]),...(node.children||[]).flat(Infinity).flatMap(child=>find(child,predicate))];
const textOf = node => {
  if (!node) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return (node.children || []).flat(Infinity).map(textOf).join(' ');
};
async function screen(api={}){
 const {code}=await transformWithOxc(fs.readFileSync(new URL('./userManagement.jsx',import.meta.url),'utf8'),'userManagement.jsx',{jsx:{runtime:'classic'}});
 const states=[],refs=[],effects=[];let si=0,ri=0;
 const scope=vm.createContext({React:{createElement:(type,props,...children)=>({type,props:props||{},children})},
  useState(initial){const i=si++;if(!(i in states))states[i]=initial;return[states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value;}];},useRef(value){return refs[ri++]||={current:value};},useEffect(fn){effects.push(fn);},
  validateOfficeCreation:validationScope.validate,
  userManagementApi:{load:async()=>({callerId:'caller',users:[row],provisioningReady:true}),...api},
 });
 vm.runInContext(code.replace(/^import .*;$/gm,'').replace(/export default function/g,'function')+'\nthis.Component=OfficeUsers;',scope);
 const render=()=>{si=ri=0;return scope.Component();};render();effects.slice(0,2).forEach(fn=>fn());await new Promise(resolve=>setImmediate(resolve));
 const flush=async()=>{const unrun=[...effects];effects.length=0;unrun.forEach(fn=>fn());await new Promise(resolve=>setImmediate(resolve));};
 return{
  render,
  button:(label, rowIndex = 0)=>{
    const dots = find(render(),n=>n.type==='button'&&n.props.className==='action-dots-btn');
    if (dots.length > 0 && dots[rowIndex]) {
      if (!dots[rowIndex].props['aria-expanded']) {
        dots[rowIndex].props.onClick();
      }
      const item = find(render(),n=>n.type==='button'&&textOf(n).includes(label))[0];
      if (item) return item;
    }
    return find(render(),n=>n.type==='button'&&textOf(n).includes(label))[0];
  },
  submit:()=>find(render(),n=>n.type==='form')[0].props.onSubmit({preventDefault(){}}),flush,find
 };
}
test('uses real directory data; self activation/password and permanent delete are unavailable',async()=>{
 const ui=await screen();assert.ok(JSON.stringify(ui.render()).includes('Fixture Admin'));assert.equal(ui.button('Deactivate').props.disabled,true);assert.equal(ui.button('Set Password').props.disabled,true);assert.equal(ui.button('Delete unavailable').props.disabled,true);
});
test('self role/status controls are disabled but profile edits remain available',async()=>{
 const ui=await screen();ui.button('Edit / Role').props.onClick();const selects=find(ui.render(),n=>n.type==='select');assert.equal(selects.filter(n=>n.props.disabled).length,2);
});
test('mutation waits/deduplicates, failures preserve dialog and never claim saved',async()=>{
 let reject,calls=0;const pending=new Promise((_,no)=>{reject=no;});
 const ui=await screen({save:()=>{calls++;return pending;}});ui.button('Edit / Role').props.onClick();const work=ui.submit();await ui.submit();assert.equal(calls,1);assert.equal(find(ui.render(),n=>n.type==='fieldset')[0].props.disabled,true);
 reject(Error('Account changed'));await work;assert.ok(JSON.stringify(ui.render()).includes('Account changed'));assert.ok(!JSON.stringify(ui.render()).includes('Account updated.'));
});
test('create defaults to Staff; password mismatch prevents account provisioning',async()=>{
 let calls=0;const ui=await screen({create:async()=>{calls++;}});ui.button('Add Office User').props.onClick();
 const password=find(ui.render(),n=>n.type==='input'&&n.props.type==='password')[0];password.props.onChange({target:{value:'NewPassword123!'}});await ui.submit();assert.equal(calls,0);assert.ok(JSON.stringify(ui.render()).includes('Passwords do not match'));
 const roles=find(ui.render(),n=>n.type==='select'&&n.props.value==='staff');assert.equal(roles.length,1);
});
test('load failure offers retry without fake initial users',async()=>{
 const ui=await screen({load:async()=>{throw Error('Directory unavailable');}});assert.ok(ui.button('Retry loading'));assert.ok(!JSON.stringify(ui.render()).includes('Fixture Admin'));
});

test('new user form requires recovery mobile and distinguishes contact-only editing',async()=>{
 const ui=await screen();ui.button('Add Office User').props.onClick();
 const phone=find(ui.render(),n=>n.type==='input'&&n.props.type==='tel')[0];assert.equal(phone.props.required,true);
 assert.match(JSON.stringify(ui.render()),/Recovery Mobile Number/);
 ui.button('Close').props.onClick();ui.button('Edit / Role').props.onClick();
 assert.match(JSON.stringify(ui.render()),/Contact edits do not change/);
});
test('existing user recovery phone loads from Auth, not the profile contact, and saves expected value',async()=>{
 const calls=[];const ui=await screen({recoveryPhone:async(target,form)=>{calls.push(form);return '+639171234567';}});
 await ui.button('Recovery Phone').props.onClick();
 await new Promise(r => setImmediate(r));
 assert.match(JSON.stringify(ui.render()),/SMS Recovery Phone/);
 const input=find(ui.render(),n=>n.type==='input'&&n.props.type==='tel')[0];assert.equal(input.props.value,'+639171234567');
 await ui.submit();assert.equal(calls.length,2);assert.equal(calls[1].expectedPhone,'+639171234567');
 assert.match(JSON.stringify(ui.render()),/Recovery phone registered/);
});

test('unready backend clearly blocks Add Office User instead of allowing a failed creation attempt',async()=>{
 const ui=await screen({load:async()=>({callerId:'caller',users:[row],provisioningReady:false,provisioningError:'New office accounts cannot be created yet. Backend deployment required.'})});
 assert.equal(ui.button('Add Office User').props.disabled,true);assert.match(JSON.stringify(ui.render()),/Backend deployment required/);
});
test('short initial password produces an explicit not-created error; backend errors retain entered data',async()=>{
 let calls=0;const ui=await screen({create:async()=>{calls++;throw Error('Backend unavailable. Account was not created.');}});
 ui.button('Add Office User').props.onClick();
 const values=['Fixture Staff','fixture@example.test','09171234567','short','short'];
 for(let i=0;i<values.length;i++){const form=find(ui.render(),n=>n.type==='form')[0];find(form,n=>n.type==='input')[i].props.onChange({target:{value:values[i]}});}
 await ui.submit();assert.equal(calls,0);assert.match(JSON.stringify(ui.render()),/initial password must be between 12 and 128/);
 for(const i of [3,4]){find(find(ui.render(),n=>n.type==='form')[0],n=>n.type==='input')[i].props.onChange({target:{value:'fixture-password'}});}
 await ui.submit();assert.equal(calls,1);assert.match(JSON.stringify(ui.render()),/Account was not created/);
 assert.ok(!JSON.stringify(ui.render()).includes('Office account created with'));assert.ok(find(ui.render(),n=>n.type==='input'&&n.props.value==='fixture@example.test').length);
});

test('Audit & Activity Log button opens modal, loads authorized records, and closes on Close button', async () => {
  const sampleLogs = [
    {
      id: '1',
      action: 'UPDATE',
      target: 'users #caller',
      actor: { id: 'caller', name: 'Fixture Admin', email: 'fixture@example.test', role: 'admin' },
      philippineTime: 'Oct 24, 2026, 8:00 PM',
      details: { role: 'admin', updated_at: 'version' },
    },
  ];
  let calls = 0;
  const ui = await screen({ auditLogs: async () => { calls++; return sampleLogs; } });
  assert.ok(ui.button('Audit & Activity Log'));
  ui.button('Audit & Activity Log').props.onClick();
  await ui.flush();

  assert.equal(calls, 1);
  const treeStr = JSON.stringify(ui.render());
  assert.match(treeStr, /Audit & Activity Log/);
  assert.match(treeStr, /Authorized records from system activity logs/);
  assert.match(treeStr, /Fixture Admin/);
  assert.match(treeStr, /UPDATE/);
  assert.match(treeStr, /users #caller/);
  assert.match(treeStr, /Oct 24, 2026, 8:00 PM/);

  // Close modal
  ui.button('Close').props.onClick();
  assert.ok(!JSON.stringify(ui.render()).includes('Authorized records from system activity logs'));
});

test('Audit log search filters records across actor, action, target and details', async () => {
  const sampleLogs = [
    { id: '1', action: 'CREATE', target: 'shipments #trk-100', actor: { name: 'Staff User', email: 'staff@example.test', role: 'staff' }, philippineTime: 'Oct 24, 2026, 8:00 PM', details: { tracking: 'trk-100' } },
    { id: '2', action: 'SUSPEND', target: 'customers #cust-200', actor: { name: 'Admin User', email: 'admin@example.test', role: 'admin' }, philippineTime: 'Oct 24, 2026, 8:15 PM', details: { reason: 'Overdue bill' } },
  ];
  const ui = await screen({ auditLogs: async () => sampleLogs });
  ui.button('Audit & Activity Log').props.onClick();
  await ui.flush();

  const searchInput = ui.find(ui.render(), n => n.type === 'input' && n.props.type === 'search')[0];
  assert.ok(searchInput);

  // Search by action
  searchInput.props.onChange({ target: { value: 'SUSPEND' } });
  let tree = JSON.stringify(ui.render());
  assert.match(tree, /customers #cust-200/);
  assert.ok(!tree.includes('shipments #trk-100'));

  // Search by details
  searchInput.props.onChange({ target: { value: 'Overdue bill' } });
  tree = JSON.stringify(ui.render());
  assert.match(tree, /customers #cust-200/);
  assert.ok(!tree.includes('shipments #trk-100'));

  // Search non-matching
  searchInput.props.onChange({ target: { value: 'NonexistentKeyword' } });
  tree = JSON.stringify(ui.render());
  assert.match(tree, /No matching audit logs/);
});

test('Audit log pagination displays page slices and navigates with Next and Previous', async () => {
  const sampleLogs = Array.from({ length: 15 }, (_, i) => ({
    id: String(i + 1),
    action: 'UPDATE',
    target: `shipments #s-${i + 1}`,
    actor: { name: `Staff ${i + 1}`, email: `staff${i + 1}@example.test`, role: 'staff' },
    philippineTime: 'Oct 24, 2026, 8:00 PM',
    details: { index: i + 1 },
  }));
  const ui = await screen({ auditLogs: async () => sampleLogs });
  ui.button('Audit & Activity Log').props.onClick();
  await ui.flush();

  let tree = JSON.stringify(ui.render());
  assert.match(tree, /Page.*1.*of.*2.*15.*logs/);
  assert.match(tree, /shipments #s-1/);
  assert.match(tree, /shipments #s-10/);
  assert.ok(!tree.includes('shipments #s-11'));

  // Click Next in modal
  const auditFooter = find(ui.render(), n => n.props.className && n.props.className.includes('um-audit-footer'))[0];
  const nextBtn = find(auditFooter, n => n.type === 'button' && n.children.includes('Next'))[0];
  assert.equal(nextBtn.props.disabled, false);
  nextBtn.props.onClick();
  tree = JSON.stringify(ui.render());
  assert.match(tree, /Page.*2.*of.*2.*15.*logs/);
  assert.match(tree, /shipments #s-11/);
  assert.match(tree, /shipments #s-15/);
  assert.ok(!tree.includes('shipments #s-1/'));

  // Click Previous in modal
  const prevBtn = find(find(ui.render(), n => n.props.className && n.props.className.includes('um-audit-footer'))[0], n => n.type === 'button' && n.children.includes('Previous'))[0];
  assert.equal(prevBtn.props.disabled, false);
  prevBtn.props.onClick();
  tree = JSON.stringify(ui.render());
  assert.match(tree, /Page.*1.*of.*2.*15.*logs/);
});

test('Audit log load failure displays error banner and retry button reloads records', async () => {
  let attempts = 0;
  const ui = await screen({
    auditLogs: async () => {
      attempts++;
      if (attempts === 1) throw Error('Network connection timeout');
      return [{ id: '1', action: 'LOGIN', target: 'office', actor: { name: 'Admin', email: 'admin@test' }, philippineTime: 'Oct 24, 2026', details: null }];
    },
  });
  ui.button('Audit & Activity Log').props.onClick();
  await ui.flush();

  assert.equal(attempts, 1);
  let tree = JSON.stringify(ui.render());
  assert.match(tree, /Network connection timeout/);
  const retryBtn = ui.button('Retry loading');
  assert.ok(retryBtn);

  // Click Retry
  retryBtn.props.onClick();
  await ui.flush();

  assert.equal(attempts, 2);
  tree = JSON.stringify(ui.render());
  assert.ok(!tree.includes('Network connection timeout'));
  assert.match(tree, /LOGIN/);
});

test('Audit log action filter and metadata toggle expand and collapse JSON view', async () => {
  const sampleLogs = [
    {
      id: 'log-1',
      action: 'UPDATE',
      target: 'users #u-1',
      actor: { name: 'Admin One', email: 'admin1@example.test', role: 'admin' },
      philippineTime: 'Nov 07, 2026, 04:00 PM',
      details: { new: { role: 'driver', email: 'driver@test.ph' } },
    },
    {
      id: 'log-2',
      action: 'CREATE',
      target: 'shipments #s-2',
      actor: { name: 'Staff Two', email: 'staff2@example.test', role: 'staff' },
      philippineTime: 'Nov 07, 2026, 04:05 PM',
      details: { tracking: 'TRK-999' },
    },
  ];

  const ui = await screen({ auditLogs: async () => sampleLogs });
  ui.button('Audit & Activity Log').props.onClick();
  await ui.flush();

  let tree = JSON.stringify(ui.render());
  assert.match(tree, /role:.*driver/);
  assert.match(tree, /View JSON/);
  // Collapsed: pre tag with formatted JSON not visible yet
  assert.ok(!tree.includes('{"new":{"role"'));

  // Toggle View JSON for log-1
  assert.equal(find(ui.render(), n => n.type === 'pre').length, 0);
  const viewJsonBtn = ui.button('View JSON');
  assert.ok(viewJsonBtn);
  viewJsonBtn.props.onClick();

  tree = JSON.stringify(ui.render());
  assert.match(tree, /Hide JSON/);
  assert.equal(find(ui.render(), n => n.type === 'pre').length, 1);

  // Toggle Hide JSON collapses it
  const hideJsonBtn = ui.button('Hide JSON');
  assert.ok(hideJsonBtn);
  hideJsonBtn.props.onClick();

  tree = JSON.stringify(ui.render());
  assert.match(tree, /View JSON/);
  assert.equal(find(ui.render(), n => n.type === 'pre').length, 0);

  // Test action filter
  const actionSelect = find(ui.render(), n => n.type === 'select' && n.props['aria-label'] === 'Filter by action')[0];
  assert.ok(actionSelect);
  actionSelect.props.onChange({ target: { value: 'CREATE' } });

  tree = JSON.stringify(ui.render());
  assert.match(tree, /shipments #s-2/);
  assert.ok(!tree.includes('users #u-1'));
});

test('Reset 2FA button is disabled for self with security notice and enabled for other office users', async () => {
  const staffRow = { id: 'staff-1', full_name: 'Target Staff', email: 'staff@example.test', phone: '', role: 'staff', is_active: true, updated_at: 'v1' };
  const ui = await screen({
    load: async () => ({ callerId: 'caller', users: [row, staffRow], provisioningReady: true }),
  });

  // Self button inside row 0 dropdown
  const selfBtn = ui.button('Reset 2FA', 0);
  assert.equal(selfBtn.props.disabled, true);
  assert.equal(selfBtn.props.title, 'Manage your own 2FA in Security settings');

  // Staff button inside row 1 dropdown
  const staffBtn = ui.button('Reset 2FA', 1);
  assert.equal(staffBtn.props.disabled, false);
});

test('Reset 2FA modal inspects enrolled factors, requires reason, and invokes resetMfa', async () => {
  const staffRow = { id: 'staff-1', full_name: 'Target Staff', email: 'staff@example.test', phone: '', role: 'staff', is_active: true, updated_at: 'v1' };
  const sampleFactors = [
    { id: 'factor-123', friendlyName: 'Staff Authenticator', status: 'verified' },
  ];
  let getCalls = 0;
  const resetCalls = [];

  const ui = await screen({
    load: async () => ({ callerId: 'caller', users: [row, staffRow], provisioningReady: true }),
    getMfaFactors: async () => {
      getCalls++;
      return sampleFactors;
    },
    resetMfa: async (target, reason) => {
      resetCalls.push({ target, reason });
      return { success: true };
    },
  });

  const mfaBtn = ui.button('Reset 2FA', 1);
  await mfaBtn.props.onClick();
  await new Promise(r => setImmediate(r));

  assert.equal(getCalls, 1);
  let tree = JSON.stringify(ui.render());
  assert.match(tree, /Reset 2FA \(TextBee SMS\)/);
  assert.match(tree, /Staff Authenticator/);
  assert.match(tree, /factor-123/);

  // Submit button is disabled when confirmation reason is empty
  const submitBtn = find(ui.render(), n => n.type === 'button' && textOf(n).includes('Reset 2FA'))[0];
  assert.ok(submitBtn);
  assert.equal(submitBtn.props.disabled, true);

  // Enter valid reason (>= 5 characters)
  const textarea = find(ui.render(), n => n.type === 'textarea')[0];
  assert.ok(textarea);
  textarea.props.onChange({ target: { value: 'Staff member lost mobile phone device' } });

  // Submit button is now enabled
  const updatedSubmitBtn = find(ui.render(), n => n.type === 'button' && textOf(n).includes('Reset 2FA'))[0];
  assert.equal(updatedSubmitBtn.props.disabled, false);

  // Submit reset
  await ui.submit();
  assert.equal(resetCalls.length, 1);
  assert.equal(resetCalls[0].target.id, 'staff-1');
  assert.equal(resetCalls[0].reason, 'Staff member lost mobile phone device');

  // Success notice is displayed
  tree = JSON.stringify(ui.render());
  assert.match(tree, /2FA reset for Target Staff/);
});

test('Reset 2FA modal with zero enrolled factors displays empty notice and disables submit', async () => {
  const staffRow = { id: 'staff-2', full_name: 'No MFA Staff', email: 'nomfa@example.test', phone: '', role: 'staff', is_active: true, updated_at: 'v1' };
  const ui = await screen({
    load: async () => ({ callerId: 'caller', users: [row, staffRow], provisioningReady: true }),
    getMfaFactors: async () => [],
  });

  const mfaBtn = ui.button('Reset 2FA', 1);
  await mfaBtn.props.onClick();
  await new Promise(r => setImmediate(r));

  const tree = JSON.stringify(ui.render());
  assert.match(tree, /No enrolled 2FA factors found on this account/);

  const submitBtn = find(ui.render(), n => n.type === 'button' && textOf(n).includes('Reset 2FA'))[0];
  assert.equal(submitBtn.props.disabled, true);
});

test('3-dots action menu toggles dropdown popover and closes on backdrop click', async () => {
  const ui = await screen();
  const dots = find(ui.render(), n => n.type === 'button' && n.props.className === 'action-dots-btn')[0];
  assert.ok(dots);
  assert.equal(dots.props['aria-expanded'], false);
  assert.equal(find(ui.render(), n => n.props.className === 'action-dropdown').length, 0);

  // Click 3 dots to open
  dots.props.onClick();
  let dropdown = find(ui.render(), n => n.props.className === 'action-dropdown')[0];
  assert.ok(dropdown);
  const updatedDots = find(ui.render(), n => n.type === 'button' && n.props.className === 'action-dots-btn')[0];
  assert.equal(updatedDots.props['aria-expanded'], true);

  // Click backdrop to close
  const backdrop = find(ui.render(), n => n.props.className === 'action-menu-backdrop')[0];
  assert.ok(backdrop);
  backdrop.props.onClick();

  // Menu closed
  dropdown = find(ui.render(), n => n.props.className === 'action-dropdown')[0];
  assert.equal(dropdown, undefined);
});
