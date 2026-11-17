import test from 'node:test';
import assert from 'node:assert/strict';
import { complianceDirectory, complianceCounts, filterCompliance } from './complianceDirectory.js';

const row = (id, states) => ({ driver: { id, full_name: 'Driver ' + id }, docs: states.map((state, i) => ({ docType: String(i), label: ['License', 'Medical', 'NBI'][i], badge: { state, label: state }, doc: state === 'missing' ? null : { created_at: '2026-10-23', updated_at: '2026-10-24' } })) });
test('real badge states drive status priority and overlapping driver attention counts', () => {
  const rows = complianceDirectory([
    row('valid', ['valid', 'valid', 'valid']), row('mixed', ['expired', 'critical', 'pending_review']),
    row('missing', ['missing', 'valid', 'valid']), row('rejected', ['rejected', 'expired', 'valid']),
  ]);
  assert.deepEqual(rows.map(r => r.state), ['valid', 'expired', 'missing', 'rejected']);
  assert.deepEqual(complianceCounts(rows), { compliant: 1, expiring: 1, expired: 2, review: 1, incomplete: 2 });
  assert.equal(rows[0].updated, '2026-10-24');
});
test('search handles name, ID, overall and document status; empty/missing records remain honest', () => {
  const rows = complianceDirectory([row('ABC', ['missing', 'missing', 'missing']), row('DEF', ['valid', 'valid', 'valid'])]);
  assert.equal(rows[0].updated, null);
  assert.equal(filterCompliance(rows, '  driver abc  ')[0].driver.id, 'ABC');
  assert.equal(filterCompliance(rows, 'def')[0].driver.id, 'DEF');
  assert.equal(filterCompliance(rows, 'compliant')[0].driver.id, 'DEF');
  assert.equal(filterCompliance(rows, 'missing')[0].driver.id, 'ABC');
  assert.equal(filterCompliance(rows, 'unknown').length, 0);
  assert.equal(filterCompliance(rows, '').length, 2);
  assert.deepEqual(complianceCounts([]), { compliant: 0, expiring: 0, expired: 0, review: 0, incomplete: 0 });
});

test('vehicle compliance directory processes truck rows, badges, timestamps, and filters by plate/model', () => {
  const truckRow = (id, plate, model, states) => ({
    truck: { id, plate_number: plate, model, model_year: 2022 },
    docs: states.map((state, i) => ({
      docType: ['lto_registration', 'franchise_permit', 'emission_test'][i],
      label: ['OR/CR Registration', 'LTFRB Permit', 'Emission Test'][i],
      badge: { state, label: state === 'valid' ? 'Valid' : state },
      doc: state === 'missing' ? null : { created_at: '2026-11-01', updated_at: '2026-11-05' },
    })),
  });

  const rows = complianceDirectory([
    truckRow('t1', 'ABC-1234', 'Isuzu Elf', ['valid', 'valid', 'valid']),
    truckRow('t2', 'XYZ-9876', 'Hino 300', ['expired', 'critical', 'valid']),
    truckRow('t3', 'NCR-5555', 'Fuso Canter', ['missing', 'valid', 'valid']),
  ]);

  assert.equal(rows[0].state, 'valid');
  assert.equal(rows[0].status, 'Compliant');
  assert.equal(rows[0].updated, '2026-11-05');
  assert.equal(rows[1].state, 'expired');
  assert.equal(rows[1].status, 'Expired');
  assert.equal(rows[2].state, 'missing');

  const counts = complianceCounts(rows);
  assert.equal(counts.compliant, 1);
  assert.equal(counts.expiring, 1);
  assert.equal(counts.expired, 1);
  assert.equal(counts.incomplete, 1);

  // Filters by plate number
  assert.equal(filterCompliance(rows, 'ABC-1234')[0].truck.id, 't1');
  assert.equal(filterCompliance(rows, 'xyz')[0].truck.id, 't2');

  // Filters by truck model
  assert.equal(filterCompliance(rows, 'Hino')[0].truck.id, 't2');
  assert.equal(filterCompliance(rows, 'Canter')[0].truck.id, 't3');

  // Filters by document label / status
  assert.equal(filterCompliance(rows, 'Compliant').length, 1);
  assert.equal(filterCompliance(rows, 'expired').length, 1);
  assert.equal(filterCompliance(rows, 'nonexistent').length, 0);
});
