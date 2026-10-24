const PRIORITY = ['rejected', 'expired', 'missing', 'pending_review', 'critical', 'expiring_soon', 'valid'];
const LABELS = { rejected: 'Rejected', expired: 'Expired', missing: 'Missing documents', pending_review: 'Pending Review', critical: 'Critical — Due Soon', expiring_soon: 'Expiring Soon', valid: 'Compliant' };

export function complianceDirectory(rows) {
  return rows.map(row => {
    const states = row.docs.map(item => item.badge.state);
    const state = PRIORITY.find(value => states.includes(value)) || 'missing';
    const dates = row.docs.flatMap(item => [item.doc?.updated_at, item.doc?.created_at])
      .filter(value => value && Number.isFinite(Date.parse(value)));
    const updated = dates.sort((a, b) => Date.parse(b) - Date.parse(a))[0] || null;
    return { ...row, state, status: LABELS[state], updated };
  });
}

export function complianceCounts(rows) {
  const has = (row, states) => row.docs.some(item => states.includes(item.badge.state));
  return {
    compliant: rows.filter(row => row.state === 'valid').length,
    expiring: rows.filter(row => has(row, ['critical', 'expiring_soon'])).length,
    expired: rows.filter(row => has(row, ['expired'])).length,
    review: rows.filter(row => has(row, ['pending_review'])).length,
    incomplete: rows.filter(row => has(row, ['missing', 'rejected'])).length,
  };
}

export function filterCompliance(rows, query) {
  const term = query.trim().toLowerCase();
  return rows.filter(row => [row.driver.id, row.driver.full_name, row.status,
    ...row.docs.flatMap(item => [item.label, item.badge.label])]
    .some(value => String(value || '').toLowerCase().includes(term)));
}
