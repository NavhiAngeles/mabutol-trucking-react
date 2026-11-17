import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('./ShipmentEditDialog.jsx',import.meta.url),'utf8');

test('edit dialog exposes save/reload feedback and unsaved-change protection',()=>{
 assert.match(source,/Shipment changed\. Reload before saving|Reload/);
 assert.match(source,/Discard shipment changes\?/);
 assert.match(source,/quotation was cleared/);
 assert.match(source,/disabled=\{saving\|\|loading\|\|!record\?\.policy\.editable\|\|!dirty\}/);
});

test('edit dialog uses Philippine departure validation and only policy fields',()=>{
 assert.match(source,/validateDeparture\(draft\.date,draft\.time\)/);
 assert.match(source,/for\(const key of record\.policy\.fields\)/);
 assert.match(source,/parsePhilippineDeparture/);
});
