// Export the already-filtered report model, never an unfiltered database dump.
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { reportTables, reportStructuredSections, CsvNumber, philippineTimestamp } from './reportCsvTables.js';

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

export function generateReportPdf(title, range, report, filters = {}) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const structured = reportStructuredSections(title, range, report);

  // Document Header
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text('Mabutol Trucking Logistics — ' + title + ' Report', 14, 15);

  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105); // slate-600
  doc.text('Date range: ' + range.start + ' to ' + range.end + ' (Asia/Manila)', 14, 22);
  doc.text('Generated at (Philippine time): ' + philippineTimestamp(new Date().toISOString()), 14, 27);

  const filterEntries = Object.entries(filters).filter(([, v]) => v !== undefined && v !== '');
  if (filterEntries.length) {
    const filterText = 'Filters: ' + filterEntries.map(([k, v]) => (k === 'search' ? 'Search: ' : k === 'status' ? 'Status: ' : k + ': ') + v).join('; ');
    doc.text(filterText, 14, 32);
  }

  let startY = filterEntries.length ? 36 : 31;

  if (structured) {
    if (structured.scope) {
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139); // slate-500
      const splitScope = doc.splitTextToSize('Scope: ' + structured.scope, 270);
      doc.text(splitScope, 14, startY);
      startY += splitScope.length * 4 + 3;
    }

    for (const section of structured.sections) {
      if (startY > 180) {
        doc.addPage();
        startY = 15;
      }
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.text(section.title, 14, startY);
      startY += 3;

      autoTable(doc, {
        head: [section.headers],
        body: section.records,
        startY,
        margin: { left: 14, right: 14 },
        styles: { fontSize: 8, cellPadding: 2, textColor: [30, 41, 59] },
        headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
      });

      startY = doc.lastAutoTable.finalY + 8;
    }
  } else {
    // Fallback model representation
    const fallbackRows = [];
    function visit(value, section, record, field) {
      if (Array.isArray(value)) value.forEach((item, index) => visit(item, section, record ? `${record}.${index + 1}` : String(index + 1), field));
      else if (value && typeof value === 'object') Object.entries(value).forEach(([key, item]) => visit(item, section, record, field ? field + '.' + key : key));
      else fallbackRows.push([section, record, field, value == null ? 'Unavailable' : String(value)]);
    }
    Object.entries(report).forEach(([key, value]) => visit(value, key, '', ''));

    autoTable(doc, {
      head: [['Section', 'Record', 'Field', 'Value']],
      body: fallbackRows,
      startY: startY + 3,
      margin: { left: 14, right: 14 },
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [30, 58, 138], textColor: 255 },
    });
  }

  // Footer on all pages
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text('Page ' + i + ' of ' + pageCount + ' — Mabutol Trucking Logistics — Confidential Internal Document', 14, 202);
  }

  return doc;
}

export function downloadReport(title, range, report, filters = {}, format = 'csv') {
  const baseName = `mabutol-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${range.start}-${range.end}`;

  if (format === 'pdf') {
    const doc = generateReportPdf(title, range, report, filters);
    doc.save(`${baseName}.pdf`);
    return;
  }

  const blob = new Blob([reportCsv(title, range, report, filters)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${baseName}.csv`;
  document.body.appendChild(link);
  try { link.click(); }
  finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
