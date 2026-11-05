// Isolated API fixtures only; every remote request is intercepted.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const ROOT = process.env.APP_URL || 'http://127.0.0.1:5180';
const OUT = '../outputs/dash-04-browser';
const now = Date.now(), stamp = new Date(now).toISOString();
const user = { id:'00000000-0000-4000-8000-000000000004', email:'dash04@example.test', role:'authenticated', aud:'authenticated', factors:[], app_metadata:{provider:'email'}, user_metadata:{} };
const token = Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:user.id,role:'authenticated',aud:'authenticated',aal:'aal1',exp:Math.floor(now/1000)+7200})).toString('base64url')+'.fixture';
const shipments = ['assigned','loading','in_transit','delayed','completed','completed','completed','booked','cancelled','pending'].map((status,i)=>({id:`s${i}`,tracking_number:`DASH04-${i}`,status,created_at:stamp,updated_at:stamp,pickup_address:'Fixture origin',dropoff_address:'Fixture destination',estimated_arrival:new Date(now-600000).toISOString(),actual_delivery_at:i===4?new Date(now-1200000).toISOString():i===5?new Date(now-300000).toISOString():null}));
const trucks = Array.from({length:8},(_,i)=>({id:`t${i}`,plate_number:`D04-${i}`,model:'Controlled truck',status:i===6?'maintenance':i===7?'inactive':'available',capacity_kg:4000,vehicle_type_id:'type',created_at:stamp,updated_at:stamp,vehicle_types:{id:'type',name:'Fixture type'},truck_cargo_categories:[]}));
const deliveries = ['assigned','loading','in_transit','in_transit','delivered','cancelled'].map((status,i)=>({id:`d${i}`,shipment_id:`s${i}`,truck_id:`t${i}`,driver_id:`driver${i}`,status,departed_at:i>0&&i<5?new Date(now-3600000).toISOString():null,arrived_at:i===4?new Date(now-1200000).toISOString():null}));
const tables = {users:[{...user,role:'admin',is_active:true,full_name:'DASH04 Fixture'}],shipments,trucks,deliveries,
  maintenance_records:[{id:'m1',truck_id:'t4',status:'in_progress',scheduled_date:'2026-01-01',trucks:{plate_number:'D04-4'}},{id:'m2',truck_id:'t5',status:'scheduled',scheduled_date:'2026-01-01',trucks:{plate_number:'D04-5'}}],
  tracking_logs:[{id:1,delivery_id:'d0',truck_id:'t0',latitude:15,longitude:121,recorded_at:stamp}],
  vehicle_types:[{id:'type',name:'Fixture type'}]};
let fail = false, providerFail = false;
const checks=[], errors=[], unexpected=[];
const pushCheck=checks.push.bind(checks);
checks.push=(...items)=>{const result=pushCheck(...items);console.log(items.join('\n'));return result;};
async function main(){
  fs.mkdirSync(OUT,{recursive:true});
  const browser = await chromium.launch({channel:'msedge',headless:true});
  try {
    const context=await browser.newContext({viewport:{width:1440,height:1000}});
    await context.addInitScript(({token,user,now})=>localStorage.setItem('sb-wrcrxsvppehuaqennrla-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture',expires_at:Math.floor(now/1000)+7200,expires_in:7200,token_type:'bearer',user})),{token,user,now});
    await context.route('**/*',async route=>{
      const req=route.request(),url=new URL(req.url());
      if(url.origin===new URL(ROOT).origin)return route.continue();
      if(url.hostname==='fonts.googleapis.com')return route.fulfill({status:200,contentType:'text/css',body:''});
      const reply=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
      if(url.hostname==='api.maptiler.com')return providerFail?reply({message:'Injected map provider failure'},503):reply({version:8,sources:{},layers:[]});
      if(url.hostname!=='wrcrxsvppehuaqennrla.supabase.co'){unexpected.push(url.origin);return route.abort();}
      if(req.method()==='HEAD')return route.fulfill({status:200,headers:{'content-range':'*/0'},body:''});
      if(url.pathname==='/rest/v1/rpc/delivery_conversation_unread')return reply([]);
      if(req.method()!=='GET'){unexpected.push(req.method()+' '+url.pathname);return route.abort();}
      if(url.pathname==='/auth/v1/user')return reply(user);
      const table=url.pathname.split('/rest/v1/')[1];
      if(fail&&['shipments','trucks','tracking_logs'].includes(table))return reply({message:'Injected network failure'},503);
      let rows=tables[table]||[];
      for(const [key,val] of url.searchParams)if(val.startsWith('eq.'))rows=rows.filter(r=>String(r[key])===val.slice(3));
      if(req.headers().accept?.includes('vnd.pgrst.object'))return reply(rows[0]||null);
      return reply(rows);
    });
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.routeWebSocket('**/realtime/**',ws=>ws.close());
    await page.clock.install({time:new Date(now)});
    await page.goto(ROOT+'/dashboard');
    await page.getByRole('heading',{name:'Dashboard - Fleet Operations Overview'}).waitFor();
    await page.locator('.stat-card h2').filter({hasText:'3'}).waitFor();
    assert.deepEqual(await page.locator('.stat-card h2').allTextContents(),['3','1','1','2']);checks.push('Rendered totals 3 active / 1 delayed / 1 ready / 2 pending');
    await page.locator('.maplibregl-marker').click();
    await page.getByText(/Recent GPS/).waitFor();
    const popup=await page.locator('.maplibregl-popup-content').innerText();
    const refreshed=await page.locator('.dashboard-refresh-status').allTextContents();
    fail=true;await page.clock.fastForward(310000);
    await page.getByText(/Unable to refresh GPS positions/).waitFor();
    await page.locator('.dashboard-refresh-status').filter({hasText:'Operational statistics:'}).filter({hasText:'retained snapshot'}).waitFor();
    await page.locator('.dashboard-refresh-status').filter({hasText:'Details ('}).filter({hasText:'retained snapshot'}).waitFor();
    await page.getByText(/Last known position \(older than 5 minutes\)/).waitFor();
    assert.equal((await page.locator('.maplibregl-popup-content').innerText()).split(' · ')[1],popup.split(' · ')[1]);
    assert.deepEqual(await page.locator('.stat-card h2').allTextContents(),['3','1','1','2']);
    for(const [i,line]of (await page.locator('.dashboard-refresh-status').allTextContents()).entries())if(i>0){assert.ok(line.includes('retained snapshot'));assert.equal(line.split(' PHT.')[0],refreshed[i].split(' PHT.')[0]);}
    checks.push('Failed refresh retains counts/times; open GPS popup ages to stale without changing recorded time');
    await page.screenshot({path:OUT+'/retained-stale.png',fullPage:true});
    fail=false;await page.getByRole('button',{name:'Retry GPS',exact:true}).click({timeout:5000});checks.push('Retry GPS accepts normal pointer click');
    await page.getByText(/Unable to refresh GPS positions/).waitFor({state:'hidden'});
    checks.push('Manual Retry GPS clears failure; old fix remains stale');
    await page.clock.fastForward(16000);
    for(const [name,expected]of [['Active Shipments',['DASH04-0','DASH04-1','DASH04-2']],['Delayed Shipments',['DASH04-3']],['Pending Dispatch',['DASH04-0','DASH04-7']]]){
      await page.getByRole('link').filter({has:page.getByRole('heading',{name,exact:true})}).click();
      await page.locator('.pagination-summary').filter({hasText:new RegExp(`Showing .*of ${expected.length} `)}).waitFor();
      const text=await page.locator('tbody').innerText();
      for(const id of expected)assert.ok(text.includes(id));
      for(const s of shipments.filter(s=>!expected.includes(s.tracking_number)))assert.ok(!text.includes(s.tracking_number));
      checks.push(name+' click yields exact IDs '+expected.join(','));
      await page.getByRole('button',{name:'Dashboard',exact:true}).click();await page.locator('.stat-card h2').filter({hasText:'3'}).waitFor();
    }
    await page.getByRole('link').filter({has:page.getByRole('heading',{name:'Available Trucks',exact:true})}).click();
    try { await page.locator('tbody').first().getByText('D04-5',{exact:true}).waitFor({timeout:10000}); }
    catch(e) { await page.screenshot({path:OUT+'/fleet-diagnostic.png',fullPage:true});fs.writeFileSync(OUT+'/fleet-diagnostic.txt',await page.locator('body').innerText());throw e; }
    const fleet=[await page.locator('tbody').first().innerText()];
    assert.ok(fleet.join(' ').includes('D04-5'));for(let i=0;i<8;i++)if(i!==5)assert.ok(!fleet.join(' ').includes('D04-'+i));
    checks.push('Available Trucks click yields only t5 despite assignments and maintenance');
    providerFail=true;await page.goto(ROOT+'/dashboard');
    await page.locator('.dashboard-tracking-error').waitFor();
    await page.locator('.stat-card h2').filter({hasText:'3'}).waitFor();
    assert.deepEqual(await page.locator('.stat-card h2').allTextContents(),['3','1','1','2']);
    checks.push('Provider 503 displays map error while operational counts remain available');
    await page.screenshot({path:OUT+'/provider-failure.png',fullPage:true});
    assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
    fs.writeFileSync(OUT+'/results.json',JSON.stringify({checks,errors,unexpected,scope:'Rendered browser UI with all remote traffic mocked; no live records'},null,2));console.log(JSON.stringify({checks},null,2));
  } finally {await browser.close();}
}
main().catch(e=>{fs.writeFileSync(OUT+'/failure.txt',String(e.stack));console.error(e);process.exitCode=1;});
