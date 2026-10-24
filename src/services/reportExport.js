// Export the already-filtered report model, never an unfiltered database dump.
export function reportCsv(title, range, report, filters = {}) {
  const rows = [['Report', title], ['Start date (Asia/Manila)', range.start], ['End date (inclusive)', range.end],
    ['Generated at', new Date().toISOString()], ...Object.entries(filters), [], ['Section', 'Record', 'Field', 'Value']];
  function visit(value, section, record, field) {
    if (Array.isArray(value)) value.forEach((item, index) => visit(item, section, record ? `${record}.${index + 1}` : index + 1, field));
    else if (value && typeof value === 'object') Object.entries(value).forEach(([key, item]) => visit(item, section, record, field ? field + '.' + key : key));
    else rows.push([section, record, field, value == null ? 'Unavailable' : value]);
  }
  Object.entries(report).forEach(([key, value]) => visit(value, key, '', ''));
  const cell = value => {
    let text = String(value ?? '');
    // Protect spreadsheet users from formula injection in names/references.
    if (typeof value === 'string' && /^[\s]*[=+\-@]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  return '\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n');
}

export function downloadReport(title, range, report, filters = {}) {
  const blob = new Blob([reportCsv(title, range, report, filters)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `mabutol-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${range.start}-${range.end}.csv`;
  document.body.appendChild(link);
  try { link.click(); }
  finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
