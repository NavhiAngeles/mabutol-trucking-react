// Browser checks use isolated API fixtures: no real accounts, uploads or records are changed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const ROOT = process.env.APP_URL || 'http://127.0.0.1:5178';
const OUTPUT = process.env.CHECK_OUTPUT || path.join(process.env.TEMP || '.', 'mabutol-browser-check');
const userId = '00000000-0000-4000-8000-000000000001';
const truckId = '00000000-0000-4000-8000-000000000002';
const typeId = '00000000-0000-4000-8000-000000000003';
const user = { id: userId, email: 'browser-fixture@example.test', role: 'authenticated', aud: 'authenticated', user_metadata: {}, app_metadata: { provider: 'email' } };
const token = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url') + '.' + Buffer.from(JSON.stringify({ sub: userId, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now()/1000)+3600 })).toString('base64url') + '.test-fixture';
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const stamp = new Date().toISOString();
const tables = {
  users: [{ ...user, full_name: 'Browser Fixture', role: 'admin', is_active: true }],
  trucks: [{ id: truckId, plate_number: 'FIXTURE-001', model: 'Fixture truck', status: 'available', capacity_kg: 4000, vehicle_type_id: typeId, model_year: 2025, updated_at: stamp, created_at: stamp, vehicle_types: { id: typeId, name: 'Fixture type' }, drivers: null, truck_cargo_categories: [] }],
  vehicle_types: [{ id: typeId, name: 'Fixture type' }], drivers: [], cargo_categories: [], maintenance_records: [], compliance_documents: [],
  shipments: [], deliveries: [], tracking_logs: [], notifications: [], shipment_status_history: [], activity_logs: [], delivery_incidents: [],
};
let failReads = false, failSaves = false;
const saves = [], uploads = [], errors = [];
async function main() {
  fs.mkdirSync(OUTPUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1365, height: 1000 } });
    await context.addInitScript(({ token, user }) => localStorage.setItem('sb-wrcrxsvppehuaqennrla-auth-token', JSON.stringify({ access_token: token, refresh_token: 'browser-fixture-only', expires_at: Math.floor(Date.now()/1000)+3600, expires_in: 3600, token_type: 'bearer', user })), { token, user });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    if (page.routeWebSocket) await page.routeWebSocket('**/realtime/**', ws => ws.close());
    await page.route('https://api.maptiler.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version: 8, sources: {}, layers: [] }) }));
    await page.route('https://wrcrxsvppehuaqennrla.supabase.co/**', async route => {
      const request = route.request(), url = new URL(request.url()), method = request.method();
      const reply = body => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      if (url.pathname.includes('/auth/v1/user')) return reply({ ...user, identities: [] });
      if (url.pathname.includes('/rest/v1/rpc/fleet_save')) {
        const args = request.postDataJSON(); saves.push(args);
        if (failSaves) return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ code: 'P0001', message: 'Record changed. Refresh and reopen before saving.' }) });
        const table = { truck: 'trucks', driver: 'drivers', maintenance: 'maintenance_records', document: 'compliance_documents' }[args.p_kind];
        const id = args.p_id || crypto.randomUUID();
        const existing = tables[table].find(row => row.id === id);
        if (existing) Object.assign(existing, args.p_data, { updated_at: new Date().toISOString() });
        else tables[table].push({ ...args.p_data, id, created_at: stamp, updated_at: stamp, trucks: { plate_number: 'FIXTURE-001' } });
        return reply(id);
      }
      if (url.pathname.includes('/storage/v1/object/sign/')) return reply({ signedURL: '/object/sign/compliance-documents/fixture?token=fixture' });
      if (url.pathname.includes('/storage/v1/object/')) { uploads.push(url.pathname); return reply({ Key: 'fixture-file' }); }
      const table = url.pathname.split('/rest/v1/')[1];
      if (!table) return reply({});
      if (failReads && table === 'trucks') return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Fixture unavailable' }) });
      let rows = tables[table] || [];
      for (const [key, value] of url.searchParams) {
        if (value.startsWith('eq.')) rows = rows.filter(row => String(row[key]) === value.slice(3));
        if (value === 'not.is.null') rows = rows.filter(row => row[key] != null);
      }
      if (method === 'PATCH') { rows.forEach(row => Object.assign(row, request.postDataJSON())); }
      if ((request.headers().accept || '').includes('vnd.pgrst.object')) return reply(rows[0] || null);
      return reply(rows);
    });
    await page.goto(ROOT + '/dashboard');
    await page.getByText('No operational alerts.', { exact: true }).waitFor();
    await page.getByText('No GPS positions for active deliveries.', { exact: true }).waitFor();
    assert.equal(await page.getByText('87.0%', { exact: true }).count(), 0);
    assert.equal(await page.getByText('SHP-NE-8039 is delayed +4hrs on NLEX', { exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Notifications', exact: true }).click();
    await page.getByText('No notifications.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.screenshot({ path: path.join(OUTPUT, 'dashboard-empty.png'), fullPage: true });
    tables.notifications.push({ id: 'fixture-notification', user_id: userId, title: 'Fixture operational update', body: 'Database-backed notification fixture', read_at: null, created_at: stamp });
    await page.reload();
    await page.getByRole('button', { name: 'Notifications (1)', exact: true }).click();
    await page.getByText('Fixture operational update', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Mark read', exact: true }).click();
    await page.getByRole('button', { name: 'Read', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.goto(ROOT + '/fleet');
    await page.getByText('FIXTURE-001', { exact: true }).first().waitFor();
    await page.getByRole('button', { name: 'Edit vehicle', exact: true }).first().click();
    const editor = page.locator('dialog[open]');
    await editor.getByLabel('Model', { exact: true }).fill('Saved fixture model');
    await editor.getByRole('button', { name: 'Save changes' }).click();
    await editor.waitFor({ state: 'hidden' });
    assert.equal(saves.at(-1).p_kind, 'truck'); assert.equal(saves.at(-1).p_data.model, 'Saved fixture model'); assert.ok(saves.at(-1).p_expected);
    await page.getByText('2025 Saved fixture model', { exact: true }).first().waitFor();
    await page.getByRole('button', { name: 'Documents', exact: true }).first().click();
    const docs = page.locator('dialog[open]');
    await docs.getByRole('button', { name: 'Add document', exact: true }).click();
    await docs.getByLabel('Document number', { exact: true }).fill('OR-FIXTURE');
    await docs.locator('input[type=file]').setInputFiles({ name: 'fixture.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 fixture') });
    await docs.getByRole('button', { name: 'Save document', exact: true }).click();
    await docs.getByRole('button', { name: 'Add document', exact: true }).waitFor();
    assert.equal(saves.at(-1).p_kind, 'document'); assert.ok(saves.at(-1).p_data.file_path); assert.equal(uploads.length, 1);
    await docs.getByRole('button', { name: 'View file', exact: true }).click();
    await docs.getByRole('link', { name: /Open private document/ }).waitFor();
    await docs.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'Schedule service', exact: true }).click();
    const maintenance = page.locator('dialog[open]');
    await maintenance.getByLabel('Vehicle', { exact: true }).selectOption(truckId);
    await maintenance.getByLabel('Scheduled date', { exact: true }).fill(today);
    await maintenance.getByLabel('Workshop', { exact: true }).fill('Fixture workshop');
    await maintenance.getByRole('button', { name: 'Save changes' }).click();
    await maintenance.waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'Edit service', exact: true }).waitFor();
    assert.equal(saves.at(-1).p_kind, 'maintenance');
    await page.getByRole('button', { name: 'Calendar view', exact: true }).click();
    await page.locator('.fleet-calendar-day button').filter({ hasText: 'FIXTURE-001' }).waitFor();
    await page.screenshot({ path: path.join(OUTPUT, 'fleet-calendar.png'), fullPage: true });
    await page.getByRole('button', { name: '+ Add Vehicle', exact: true }).click();
    const registration = page.locator('.modal-window').first();
    await registration.getByPlaceholder('e.g. ABC 1234', { exact: true }).fill('FIXTURE-NEW');
    await registration.getByPlaceholder('e.g. Isuzu Giga', { exact: true }).fill('New fixture truck');
    await registration.locator('select').first().selectOption(typeId);
    await registration.getByPlaceholder('15000', { exact: true }).fill('4000');
    await registration.getByText('No cargo categories configured.', { exact: true }).waitFor();
    assert.equal(await registration.getByRole('button', { name: 'General', exact: true }).count(), 0);
    await registration.getByRole('button', { name: 'NEXT STEP →', exact: true }).click();
    await registration.getByLabel('Official receipt file', { exact: true }).setInputFiles({ name: 'or.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 OR fixture') });
    await registration.getByLabel('Registration file', { exact: true }).setInputFiles({ name: 'cr.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 CR fixture') });
    await registration.getByRole('button', { name: 'Complete Registration ✓', exact: true }).click();
    await page.getByRole('button', { name: 'View Vehicle Information', exact: true }).click();
    const createdTruck = saves.find(args => args.p_kind === 'truck' && args.p_data.plate_number === 'FIXTURE-NEW');
    assert.ok(createdTruck); assert.equal(createdTruck.p_documents.length, 2); assert.ok(createdTruck.p_documents.every(d => d.file_path));
    await page.getByText('FIXTURE-NEW', { exact: true }).first().waitFor();

    failSaves = true;
    await page.getByRole('button', { name: 'Edit vehicle', exact: true }).first().click();
    await page.locator('dialog[open]').getByRole('button', { name: 'Save changes' }).click();
    await page.locator('dialog[open]').getByRole('alert').filter({ hasText: 'Record changed' }).waitFor();
    await page.locator('dialog[open]').getByRole('button', { name: 'Cancel', exact: true }).click();
    failSaves = false; failReads = true;
    await page.getByRole('button', { name: 'Refresh fleet', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Showing last loaded data.' }).waitFor();
    assert.ok(await page.getByText('FIXTURE-001', { exact: true }).count());
    failReads = false;
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Showing last loaded data.' }).waitFor({ state: 'hidden' });
    await page.setViewportSize({ width: 768, height: 1000 });
    await page.getByRole('button', { name: 'Edit vehicle', exact: true }).first().click();
    const bounds = await page.locator('dialog[open]').boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 769, 'dialog fits tablet width');
    await page.screenshot({ path: path.join(OUTPUT, 'fleet-editor-tablet.png'), fullPage: true });
    await page.locator('dialog[open]').getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.setViewportSize({ width: 1365, height: 1000 });
    tables.shipments.push({ id: 'completed-fixture', status: 'completed', created_at: stamp, actual_delivery_at: stamp, estimated_arrival: new Date(Date.now() + 60000).toISOString() },
      { id: 'delayed-fixture', status: 'delayed', created_at: stamp });
    tables.deliveries.push({ id: 'gps-delivery', truck_id: truckId, driver_id: 'gps-driver', status: 'in_transit' });
    tables.tracking_logs.push({ id: 1, delivery_id: 'gps-delivery', truck_id: truckId, driver_id: 'gps-driver', latitude: 15.49, longitude: 120.97, recorded_at: new Date().toISOString() });
    await page.goto(ROOT + '/dashboard');
    await page.getByText('100%', { exact: true }).waitFor();
    await page.getByText('Delayed shipments', { exact: true }).waitFor();
    await page.getByText('1 tracked vehicle(s); select a marker for its timestamp.', { exact: true }).waitFor();
    await page.locator('.maplibregl-marker').waitFor();
    await page.screenshot({ path: path.join(OUTPUT, 'dashboard-populated.png'), fullPage: true });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ result: 'PASS', scope: 'isolated browser API fixtures; no real login or data mutation', checks: ['empty dashboard', 'GPS empty state', 'real notification empty state', 'vehicle edit/save/refetch', 'private file upload/link', 'maintenance create/calendar', 'stale edit error', 'refresh failure preserves data', 'retry recovery', 'tablet dialog bounds', 'notification mark-read', 'two-file vehicle registration', 'populated analytics', 'GPS marker'], saves: saves.length, screenshots: OUTPUT }));
  } catch (error) {
    console.error(error);
    console.error('page errors', errors);
    throw error;
  } finally { await browser.close(); }
}
main().catch(() => { process.exitCode = 1; });
