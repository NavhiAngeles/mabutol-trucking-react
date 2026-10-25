// Explicitly invoked Dev acceptance helper. Credentials stay in process environment.
import { readFile } from 'node:fs/promises';
const env = await readFile(new URL('../.env', import.meta.url), 'utf8');
const value = key => env.match(new RegExp(`^${key}\\s*=\\s*["']?([^\\r\\n"']+)`, 'm'))?.[1].trim();
const url = value('VITE_SUPABASE_URL'), key = value('VITE_SUPABASE_ANON_KEY');
if (url !== 'https://wrcrxsvppehuaqennrla.supabase.co') throw Error('Dev project required');
const sessions = {};
async function login(role) {
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, { method:'POST', headers:{ apikey:key, 'Content-Type':'application/json' }, body:JSON.stringify({email:process.env[`TANAW_${role}_EMAIL`],password:process.env[`TANAW_${role}_PASSWORD`]}) });
  const data = await response.json();
  if (!response.ok) throw Error(`${role} login failed: ${data.error_code || response.status}`);
  sessions[role]=data;
  console.log(`${role} password login: PASS`);
}
async function api(role, path, body) {
  const response=await fetch(url+path,{method:body===undefined?'GET':'POST',headers:{apikey:key,Authorization:`Bearer ${sessions[role].access_token}`,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data=await response.json(); if(!response.ok)throw Error(`${path}: ${data.message||data.error||response.status}`); return data;
}
await login('CUSTOMER'); await login('ADMIN');
const workspace=await api('CUSTOMER','/rest/v1/rpc/mobile_workspace',{});
if(workspace.profile.role!=='customer')throw Error('Wrong customer role');
console.log(`Customer workspace: PASS (${workspace.shipments.length} permitted shipments)`);
if(process.env.TANAW_PROVISION_DRIVER==='1') {
  const existing=await api('ADMIN','/rest/v1/drivers?select=id&notes=like.*shared-dev-e2e*');
  if(!existing.length) {
    const result=await api('ADMIN','/functions/v1/create-driver-user',{
      email:process.env.TANAW_DRIVER_EMAIL,password:process.env.TANAW_DRIVER_PASSWORD,fullName:'Tanaw Dev Workflow Driver',
      registration:{payload:{full_name:'Tanaw Dev Workflow Driver',contact_number:'+639000000001',license_number:'SYN-DEV-WORKFLOW-01',status:'available',notes:'Fictional dedicated shared-dev-e2e test driver; not verified personnel.'},documents:[]}
    });
    if(!result.driverId)throw Error('Driver registration not confirmed');
    console.log('Dedicated driver provisioned through authenticated office function: PASS');
  } else console.log('Dedicated test driver already present; preserved.');
}
if(process.env.TANAW_DRIVER_PASSWORD){await login('DRIVER');const w=await api('DRIVER','/rest/v1/rpc/mobile_workspace',{});if(w.profile.role!=='driver')throw Error('Wrong driver role');console.log('Driver workspace: PASS');}
// Read-only list verification; a booking is created through the actual mobile UI.
const requests=await api('ADMIN','/rest/v1/shipments?select=id,status,booking_source&booking_source=eq.mobile');
console.log(`Office can read ${requests.length} mobile request(s).`);
if(process.env.TANAW_CHECK_ROUTING==='1') {
  // Synthetic route only. Report status, never provider payloads or credentials.
  for(const role of ['ANONYMOUS','CUSTOMER','ADMIN']) {
    const response=await fetch(`${url}/functions/v1/calculate-route`,{method:'POST',headers:{apikey:key,'Content-Type':'application/json',...(sessions[role]?{Authorization:`Bearer ${sessions[role].access_token}`}:{})},body:JSON.stringify({pickup:{lng:120.98,lat:14.60},destination:{lng:120.99,lat:14.65}})});
    console.log(`Routing ${role}: HTTP ${response.status}`);
    if(role==='ADMIN' && response.ok) {
      const route=await response.json();
      console.log(`Provider route response fields: ${Object.keys(route).join(', ')}`);
      console.log(`Road-only verified: ${route.roadOnlyVerified===true}`);
    }
  }
}
