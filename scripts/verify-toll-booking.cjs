// All remote traffic is intercepted; no real booking, login or provider calls.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/MABUTOL/outputs/login-02-tools/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ROOT = process.env.APP_URL || 'http://127.0.0.1:5191';
const OUT = process.env.OUT_DIR || 'C:/MABUTOL/outputs/toll-booking';
const now = Date.now();
const user = { id: '00000000-0000-4000-8000-000000000004', email: 'fixture@example.test', role: 'authenticated', aud: 'authenticated', factors: [], app_metadata: { provider: 'email' }, user_metadata: {} };
const token = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url') + '.' + Buffer.from(JSON.stringify({ sub: user.id, role: 'authenticated', aud: 'authenticated', aal: 'aal1', exp: Math.floor(now / 1000) + 7200 })).toString('base64url') + '.fixture';
const rates = [
  { id: 'toll1', highway: 'NLEX', gate_name: 'Balagtas → Balintawak', vehicle_class: 'Class 2', fee: 250, entry_lat:14.817,entry_lng:120.906,exit_lat:14.72,exit_lng:121 },
  { id: 'toll2', highway: 'SKYWAY', gate_name: 'Balintawak → Buendia', vehicle_class: 'Class 2', fee: 400, entry_lat:14.72,entry_lng:121,exit_lat:14.555,exit_lng:120.985 },
  { id: 'toll3', highway: 'NLEX', gate_name: 'Balagtas → Balintawak', vehicle_class: 'Class 3', fee: 500, entry_lat:14.817,entry_lng:120.906,exit_lat:14.72,exit_lng:121 },
  { id: 'toll4', highway: 'SKYWAY', gate_name: 'Balintawak → Buendia', vehicle_class: 'Class 3', fee: 600, entry_lat:14.72,entry_lng:121,exit_lat:14.555,exit_lng:120.985 },
];
const tables = {
  users: [{ ...user, role: 'admin', is_active: true, full_name: 'Fixture Office' },
    { id: 'customer-login', role: 'customer', is_active: true },
    { id: 'driver-login', role: 'driver', is_active: true }],
  customers: [{ id: 'customer', user_id: 'customer-login', name: 'Fixture Customer', is_active: true },
    { id: 'driver-history', user_id: 'driver-login', name: 'Fixture Driver', is_active: true },
    { id: 'office-history', user_id: user.id, name: 'Fixture Office', is_active: true },
    { id: 'inactive', user_id: 'customer-login', name: 'Inactive Customer', is_active: false },
    { id: 'business', user_id: null, name: 'Fixture Business', is_active: true }],
  vehicle_types: [{ id: 'vehicle', name: 'Fixture Truck', toll_class:'Class 2', is_active: true, default_capacity_kg: 4000 },{ id:'heavy', name:'Fixture Heavy Truck', toll_class:'Class 3', is_active:true, default_capacity_kg:4000 }],
  pricing_rates: [{ id: 'rate', name: 'Fixture rate', vehicle_type_id: 'vehicle', is_active: true, effective_from: '2026-01-01', per_km_rate: 100, min_charge: 2500 },{ id:'heavy-rate',name:'Heavy rate',vehicle_type_id:'heavy',is_active:true,effective_from:'2026-01-01',per_km_rate:100,min_charge:2500 }],
  trucks: [{ id: 'truck', vehicle_type_id: 'vehicle', capacity_kg: 4000, status: 'available' }],
  system_settings: [{ key: 'minimum_booking_fee', value: 2500 }, { key: 'driver_allowance', value: 100 }, { key: 'handling_surcharges', value: { none: 0 } }],
};
let changeFee = false, emptyRates = false, failRates = false, rejectToll = false, delayed = false, incidentalToll = false, unmappedRates = false, fixedSystem = false;
const fixedRates = [
 {id:'harbor-flat',highway:'NLEX_HARBOR_LINK',gate_name:'Karuhatan to C3',vehicle_class:'Class 2',fee:199,pricing_scope:'flat'},
 {id:'connector-flat',highway:'NLEX_CONNECTOR',gate_name:'Caloocan to España',vehicle_class:'Class 2',fee:299,pricing_scope:'flat'},
];
const requests = [], saved = [], errors = [], checks = [];
const geometry = usesTollRoad => ({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: usesTollRoad ? { expressway: { verified: true, distanceKm: 25, tollDistanceKm: 24, roadNames: ['NLEX'], sections:[{highway:'NLEX',entry:[120.906,14.817],exit:[121,14.72]},{highway:'SKYWAY',entry:[121,14.72],exit:[120.985,14.555]}] } } : {}, geometry: { type: 'LineString', coordinates: usesTollRoad ? [[120.906, 14.817], [121.0, 14.72], [120.985, 14.555]] : [[120.906, 14.817], [120.94, 14.7], [120.985, 14.555]] } }] });
async function main() {
 fs.mkdirSync(OUT, { recursive: true });
 const browser = await chromium.launch({ channel: 'msedge', headless: true });
 try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  await context.addInitScript(({ token, user, now }) => localStorage.setItem('sb-wrcrxsvppehuaqennrla-auth-token', JSON.stringify({ access_token: token, refresh_token: 'fixture', expires_at: Math.floor(now / 1000) + 7200, expires_in: 7200, token_type: 'bearer', user })), { token, user, now });
  await context.route('**/*', async route => {
   const req = route.request(), url = new URL(req.url());
   if (url.origin === ROOT) return route.continue();
   const reply = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
   if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
   if (url.hostname === 'api.maptiler.com') {
    if (url.pathname.includes('/geocoding/')) {
     const pickup = url.pathname.includes('Balagtas');
     return reply({ features: [{ id: pickup ? 'p' : 'd', place_name: pickup ? 'Balagtas, Philippines' : 'Star City, Philippines', center: pickup ? [120.906, 14.817] : [120.985, 14.555] }] });
    }
    return reply({ version: 8, sources: {}, layers: [] });
   }
   if (url.hostname !== 'wrcrxsvppehuaqennrla.supabase.co') { errors.push('Unexpected remote ' + url.origin); return route.abort(); }
   if (url.pathname === '/auth/v1/user') return reply(user);
   if (url.pathname === '/functions/v1/calculate-route') {
    const body = req.postDataJSON(); requests.push(body);
    if (delayed) await new Promise(resolve => setTimeout(resolve, body.usesTollRoad ? 600 : 50));
    if (rejectToll && body.usesTollRoad) return reply({ error: 'The provider could not verify a toll expressway route between these pins.' }, 422);
    const geojson = geometry(body.usesTollRoad);
    if (fixedSystem && body.usesTollRoad) geojson.features[0].properties.expressway.sections = [
     {highway:'NLEX_HARBOR_LINK',entry:[120.96966,14.684589],exit:[120.975568,14.649357]},
     {highway:'NLEX_CONNECTOR',entry:[120.975568,14.649357],exit:[120.992064,14.61744]},
    ];
    if (incidentalToll && body.usesTollRoad) geojson.features[0].properties = {};
    return reply({ roadOnlyVerified: true, usesTollRoad: body.usesTollRoad, tollPreference: body.usesTollRoad ? 'expressway' : 'avoid', geojson, distanceKm: body.usesTollRoad ? 50 : 35, estimatedMinutes: body.usesTollRoad ? 40 : 60 });
   }
   if (req.method() === 'HEAD') return route.fulfill({ status: 200, headers: { 'content-range': '*/0' }, body: '' });
   if (url.pathname.includes('/rpc/')) return reply([]);
   const table = url.pathname.split('/rest/v1/')[1];
   if (table === 'shipments' && req.method() === 'POST') {
    const body = req.postDataJSON(); saved.push(body); return reply({ ...body, id: 'saved', tracking_number: 'FIXTURE-1' });
   }
   if (req.method() !== 'GET') { errors.push(req.method() + ' ' + url.pathname); return route.abort(); }
   if (table === 'toll_gate_rates') return failRates ? reply({ message: 'Injected toll rates failure' }, 503) : reply(emptyRates ? [] : fixedSystem ? fixedRates : rates.map(row => ({...row,...(changeFee && row.id === 'toll1'?{fee:300}:{}),...(unmappedRates?{entry_lat:null,entry_lng:null,exit_lat:null,exit_lng:null}:{})})));
   let rows = tables[table] || [];
   if (req.headers().accept?.includes('application/vnd.pgrst.object+json')) rows = rows[0] || null;
   return reply(rows);
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(12000);
  await page.goto(ROOT + '/shipment');
  await page.getByRole('button', { name: 'ADD SHIPMENT' }).click();
  await page.locator('.select-dropdown-wrapper select option[value="customer"]').waitFor({ state: 'attached' });
  assert.deepEqual(await page.locator('.select-dropdown-wrapper select option').allTextContents(),
    ['Select registered customer', 'Fixture Customer', 'Fixture Business']);
  checks.push('Customer Billing excludes linked drivers, office accounts and inactive customers');
  const pickup = page.getByRole('combobox', { name: 'Search pickup address or landmark' });
  await pickup.fill('Balagtas'); await pickup.press('ArrowDown');
  await page.getByRole('option', { name: 'Balagtas, Philippines' }).click();
  const destination = page.getByRole('combobox').nth(1);
  await destination.fill('Star City'); await page.getByRole('option', { name: 'Star City, Philippines' }).click();
  await page.getByText('Driving route calculated successfully.', { exact: false }).waitFor();
  assert.equal(requests.at(-1).usesTollRoad, false);
  const toggle = page.getByRole('checkbox', { name: 'Use toll roads / expressways' });
  incidentalToll = true;
  await toggle.check();
  await page.getByText('The service did not verify substantial expressway travel.', { exact: false }).first().waitFor();
  assert.equal(await page.locator('.route-summary-card .toll-badge').count(), 0);
  checks.push('A checked box and legacy toll flag cannot label an unverified route as an expressway');
  incidentalToll = false;
  await toggle.uncheck();
  await toggle.check();
  await page.getByText('50.0 km', { exact: false }).count();
  await page.waitForFunction(() => document.querySelector('.route-summary-card')?.textContent.includes('50') || document.body.textContent.includes('50 km'));
  assert.equal(requests.at(-1).usesTollRoad, true);
  await page.getByText('25 km on expressways').waitFor();
  await page.locator('.route-summary-card .toll-badge').filter({ hasText: 'EXPRESSWAY' }).waitFor();
  checks.push('Checkbox reroutes with toll preference and updates distance/time');
  delayed = true;
  await toggle.uncheck(); await toggle.check(); await toggle.uncheck();
  await page.waitForFunction(() => document.body.textContent.includes('35 km'));
  await page.waitForTimeout(750);
  assert.equal(await toggle.isChecked(), false);
  checks.push('Rapid toggles retain latest toll-free route');
  delayed = false; rejectToll = true;
  await toggle.check(); await page.getByText('The provider could not verify a toll expressway route between these pins.', { exact: true }).first().waitFor();
  await page.getByRole('button', { name: 'Cargo & Vehicle' }).click();
  await page.getByText('Calculate a valid route for the selected toll-road option first.').waitFor();
  checks.push('Failed expressway lookup clears route and prevents progression');
  rejectToll = false; await toggle.uncheck(); await toggle.check();
  await page.getByText('Driving route calculated successfully.', { exact: false }).waitFor();
  await page.locator('input[type=date]').fill('2026-12-01');
  await page.locator('input[type=time]').fill('10:00');
  await page.locator('.select-dropdown-wrapper select').selectOption('customer');
  await page.getByRole('button', { name: 'Cargo & Vehicle' }).click();
  await page.getByPlaceholder('Enter cargo description').fill('Fixture cargo');
  await page.getByPlaceholder('Weight', { exact: true }).fill('3000');
  await page.locator('.vehicle-card').filter({ hasText: 'Fixture Truck' }).click();
  await page.getByRole('button', { name: 'Review & Confirm', exact: true }).click();
  const confirm = page.locator('.btn-full-confirm');
  assert.equal(await confirm.isDisabled(), false);
  assert.equal(saved.length, 0);
  assert.equal(await page.locator('.shipment-toll-rates select, .shipment-toll-rates input[type=checkbox]').count(), 0);
  assert.match(await page.locator('.toll-auto-summary').textContent(), /Class 2.*NLEX → SKYWAY/s);
  assert.match(await page.locator('.cost-charge-blue .financial-total-row').textContent(), /5,650/);
  assert.match(await page.locator('.operational-grey .financial-total-row').textContent(), /750/);
  checks.push('Truck class and NLEX/SKYWAY fees selected automatically with no class or fee controls');
  const nativeDialogs=[];
  page.on('dialog', async dialog=>{nativeDialogs.push(dialog.message());await dialog.dismiss();});
  const discardTrigger=page.getByRole('button',{name:'Cancel and discard shipment',exact:true});
  await discardTrigger.click();
  const discardDialog=page.getByRole('alertdialog',{name:'Discard this shipment?'});
  await discardDialog.waitFor();
  assert.equal(await page.getByRole('button',{name:'Keep editing',exact:true}).evaluate(el=>el===document.activeElement),true);
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.getByRole('button',{name:'Discard shipment',exact:true}).evaluate(el=>el===document.activeElement),true);
  await page.keyboard.press('Tab');
  assert.equal(await page.getByRole('button',{name:'Keep editing',exact:true}).evaluate(el=>el===document.activeElement),true);
  await page.keyboard.press('Escape');
  await discardDialog.waitFor({state:'detached'});
  assert.equal(await discardTrigger.evaluate(el=>el===document.activeElement),true);
  await discardTrigger.click();
  await page.setViewportSize({width:390,height:844});
  const discardBounds=await discardDialog.boundingBox();
  assert.ok(discardBounds.x>=0 && discardBounds.x+discardBounds.width<=390);
  assert.ok(discardBounds.y>=0 && discardBounds.y+discardBounds.height<=844);
  await page.screenshot({path:OUT+'/discard-mobile.png'});
  await page.setViewportSize({width:1440,height:1100});
  await page.screenshot({path:OUT+'/discard-desktop.png'});
  await page.getByRole('button',{name:'Keep editing',exact:true}).click();
  await discardDialog.waitFor({state:'detached'});
  assert.match(await page.locator('.cost-charge-blue .financial-total-row').textContent(),/5,650/);
  assert.equal(await confirm.isDisabled(),false);
  assert.equal(saved.length,0);
  checks.push('Discard dialog fits desktop/mobile, traps focus, restores trigger and preserves review on Keep editing/Escape');
  await page.getByRole('button', { name: 'Back to Step 2', exact: false }).click();
  await page.locator('.vehicle-card').filter({ hasText: 'Fixture Heavy Truck' }).click();
  await page.getByRole('button', { name: 'Review & Confirm', exact: true }).click();
  assert.match(await page.locator('.toll-auto-summary').textContent(), /Class 3/);
  assert.match(await page.locator('.cost-charge-blue .financial-total-row').textContent(), /6,100/);
  await page.getByRole('button', { name: 'Back to Step 2', exact: false }).click();
  await page.locator('.vehicle-card').filter({ hasText: 'Fixture Truck' }).click();
  await page.getByRole('button', { name: 'Review & Confirm', exact: true }).click();
  assert.match(await page.locator('.cost-charge-blue .financial-total-row').textContent(), /5,650/);
  checks.push('Changing the Step2 truck automatically changes class, fees and quote; switching back restores Class2 fees');
  fixedSystem = true;
  await page.getByRole('button', { name: 'Back to Step 2', exact: false }).click();
  await page.getByRole('button', { name: 'Back to Step 1', exact: false }).click();
  await toggle.uncheck(); await toggle.check();
  await page.getByText('Driving route calculated successfully.', { exact: false }).waitFor();
  await page.getByRole('button', { name: 'Cargo & Vehicle', exact: true }).click();
  await page.getByRole('button', { name: 'Review & Confirm', exact: true }).click();
  await page.getByRole('button', { name: 'Refresh toll rates', exact: true }).click();
  await page.waitForFunction(()=>document.querySelector('.toll-price-chip')?.textContent.includes('498'));
  assert.match(await page.locator('.toll-auto-summary').textContent(), /NLEX HARBOR LINK → NLEX CONNECTOR/);
  assert.equal(await confirm.isDisabled(),false);
  assert.equal((await page.locator('.shipment-toll-rates').textContent()).includes('Fee pending'),false);
  await page.setViewportSize({width:390,height:844});
  await page.locator('.shipment-toll-rates').scrollIntoViewIfNeeded();
  await page.screenshot({path:OUT+'/fixed-system-mobile.png'});
  checks.push('Harbor Link/Connector show named expressways, fixed PHP498 and enabled confirmation without plaza placeholders');
  await page.setViewportSize({width:1440,height:1100});
  fixedSystem = false;
  await page.getByRole('button', { name: 'Back to Step 2', exact: false }).click();
  await page.getByRole('button', { name: 'Back to Step 1', exact: false }).click();
  await toggle.uncheck(); await toggle.check();
  await page.getByText('Driving route calculated successfully.', { exact: false }).waitFor();
  await page.getByRole('button', { name: 'Cargo & Vehicle', exact: true }).click();
  await page.getByRole('button', { name: 'Review & Confirm', exact: true }).click();
  await page.getByRole('button', { name: 'Refresh toll rates', exact: true }).click();
  await page.waitForFunction(()=>document.querySelector('.toll-price-chip')?.textContent.includes('650'));
  await page.screenshot({ path: OUT + '/review-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.shipment-toll-rates').scrollIntoViewIfNeeded();
  const bounds = await page.locator('.shipment-toll-rates').boundingBox(); console.log('Mobile toll bounds', bounds); assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 391);
  await page.screenshot({ path: OUT + '/review-mobile.png' });
  checks.push('Toll rate controls fit mobile viewport');
  await page.setViewportSize({ width: 1440, height: 1100 });
  changeFee = true;
  await confirm.click(); await page.getByText('Toll rates have changed. Review the updated total and submit again.').waitFor();
  assert.equal(saved.length, 0);
  assert.match(await page.locator('.cost-charge-blue .financial-total-row').textContent(), /5,700/);
  checks.push('Changed toll rates stop insertion and update review total');
  unmappedRates = true; await page.getByRole('button', { name: 'Refresh toll rates', exact: true }).click();
  await page.getByText('Matching toll rate needed', { exact: true }).waitFor();
  assert.equal(await confirm.isDisabled(), true);
  assert.match(await page.locator('.toll-auto-summary').textContent(), /Class 2.*NLEX → SKYWAY/s);
  assert.equal(saved.length,0);
  unmappedRates = false;
  checks.push('Unmapped representative fares remain pending rather than charging a full highway fare');
  failRates = true; await page.getByRole('button', { name: 'Refresh toll rates', exact: true }).click();
  await page.getByText('Unable to load toll rates.', { exact: false }).waitFor();
  assert.equal(await confirm.isDisabled(), true); assert.equal(saved.length, 0);
  failRates = false; emptyRates = true; await page.getByRole('button', { name: 'Retry toll rates', exact: true }).click();
  await page.getByText('No toll rates configured.', { exact: false }).waitFor();
  assert.match(await page.locator('.cost-charge-blue .financial-total-row').textContent(), /Subtotal before tolls.*5,000/s);
  assert.match(await page.locator('.operational-grey .financial-total-row').textContent(), /Allowance subtotal.*100/s);
  assert.equal(await page.getByPlaceholder('Waiting for matching toll fee').isDisabled(), true);
  await page.getByText('Profit estimate pending', { exact: true }).waitFor();
  assert.equal((await page.locator('.cost-charge-blue').textContent()).includes('Unavailable'), false);
  const pricingLink = page.getByRole('link', { name: /Open toll pricing/ });
  assert.equal(await pricingLink.getAttribute('href'), '/Settings/pricing#toll-gates');
  assert.equal(await pricingLink.getAttribute('target'), '_blank');
  await page.locator('.shipment-toll-rates').scrollIntoViewIfNeeded();
  await page.screenshot({ path: OUT + '/empty-rates-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.shipment-toll-rates').scrollIntoViewIfNeeded();
  const emptyBounds = await page.locator('.shipment-toll-rates').boundingBox();
  assert.ok(emptyBounds.x >= 0 && emptyBounds.x + emptyBounds.width <= 391);
  await page.screenshot({ path: OUT + '/empty-rates-mobile.png' });
  await page.setViewportSize({ width: 1440, height: 1100 });
  checks.push('Missing toll fees show known subtotals, clear pending state and draft-preserving Pricing link');
  assert.equal(await confirm.isDisabled(), true); assert.equal(saved.length, 0);
  checks.push('Failed or empty rate catalog cannot produce a zero-fee toll booking');
  emptyRates = false; await page.getByRole('button', { name: 'Refresh toll rates', exact: true }).click();
  await page.locator('.shipment-toll-rate').filter({hasText:'NLEX'}).waitFor();
  await confirm.click(); await page.waitForFunction(() => document.body.textContent.includes('FIXTURE-1'));
  assert.equal(saved.length, 1); assert.equal(saved[0].quoted_amount, 5700);
  assert.equal(saved[0].route_geometry.booking_pricing.toll_amount, 700);
  assert.equal(saved[0].route_geometry.booking_pricing.toll_class,'Class 2');
  assert.equal(saved[0].route_geometry.booking_pricing.toll_rates.length, 2);
  assert.deepEqual(saved[0].route_geometry.features, geometry(true).features);
  checks.push('Booking saves toll-inclusive quote, exact chosen route and historical rate snapshot');
  await page.getByRole('button',{name:'Go back to Shipment Overview',exact:true}).click();
  await page.getByRole('button',{name:'ADD SHIPMENT',exact:true}).click();
  await pickup.fill('Unsaved draft');
  await page.getByRole('button',{name:'BACK TO SHIPMENTS',exact:false}).click();
  await discardDialog.waitFor();
  await page.getByRole('button',{name:'Discard shipment',exact:true}).click();
  await page.locator('.drawer-overlay').waitFor({state:'detached'});
  assert.equal(saved.length,1);
  assert.deepEqual(nativeDialogs,[]);
  checks.push('Explicit Discard closes dirty drawer without creating a booking or invoking a browser popup');
  assert.deepEqual(errors, []);
  fs.writeFileSync(OUT + '/results.json', JSON.stringify({ checks, requests, saved, errors }, null, 2));
  console.log(checks.join('\n'));
 } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
