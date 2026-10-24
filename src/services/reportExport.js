// Export the already-filtered report model, never an unfiltered database dump.
import { reportTables, CsvNumber, philippineTimestamp } from './reportCsvTables.js';
export function reportCsv(title, range, report, filters = {}) {
  const rows = [['Report', title], ['Start date (Asia/Manila)', range.start], ['End date (inclusive)', range.end],
    ['Generated at (Philippine time)', philippineTimestamp(new Date().toISOString())],
    ...Object.entries(filters).map(([key, value]) => [key === 'search' ? 'Search filter' : key === 'status' ? 'Status filter' : key, value === '' ? 'None' : value])];
  function visit(value, section, record, field) {
    if (Array.isArray(value)) value.forEach((item, index) => visit(item, section, record ? `${record}.${index + 1}` : index + 1, field));
    else if (value && typeof value === 'object') Object.entries(value).forEach(([key, item]) => visit(item, section, record, field ? field + '.' + key : key));
    else rows.push([section, record, field, value == null ? 'Unavailable' : value]);
  }
  const tables = reportTables(title, range, report);
  if (tables) rows.push(...tables);
  else { rows.push([], ['Section', 'Record', 'Field', 'Value']); Object.entries(report).forEach(([key, value]) => visit(value, key, '', '')); }
  const cell = value => {
    let text = value instanceof CsvNumber ? value.text : String(value ?? '');
    // Protect spreadsheet users from formula injection in names/references.
    if (typeof value === 'string' && /^[\s]*[=+\-@]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  const width = Math.max(...rows.map(row => row.length));
  return '\uFEFF' + rows.map(row => Array.from({ length: width }, (_, index) => cell(row[index])).join(',')).join('\r\n') + '\r\n';
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
