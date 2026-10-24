import test from 'node:test';
import assert from 'node:assert/strict';
import { reportCsv } from './reportExport.js';
const range = { start: '2026-10-01', end: '2026-10-24' };
test('report CSV includes selected dates, complete model, filters and unknown values', () => {
 const csv = reportCsv('Drivers', range, { total: 12, rows: Array.from({length:12}, (_,i)=>({name:'Driver '+i, rate:i?90:null})) }, {search:'Driver',status:'available'});
 assert.ok(csv.startsWith('\uFEFF')); assert.ok(csv.includes('2026-10-24')); assert.ok(csv.includes('Driver 11')); assert.ok(csv.includes('Unavailable')); assert.ok(csv.includes('available'));
});
test('CSV quotes delimiters/newlines, neutralizes formulas, preserves numeric negatives and nested identity', () => {
 const csv = reportCsv('Fixture', range, {rows:[{name:'=HYPERLINK("bad")',amount:-10,notes:'comma,quote"\nline',incidents:[{category:'A'}]},{name:'  +SUM(1,2)'}]});
 assert.ok(csv.includes("'=HYPERLINK")); assert.ok(csv.includes("'  +SUM")); assert.ok(csv.includes('"-10"')); assert.ok(csv.includes('comma,quote""\nline')); assert.ok(csv.includes('"1.1","incidents.category","A"'));
});
