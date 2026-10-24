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
