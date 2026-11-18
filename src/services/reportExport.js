// Export the already-filtered report model, never an unfiltered database dump.
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import ExcelJS from 'exceljs';
import {
  reportTables,
  reportStructuredSections,
  filterReportSections,
  getCsvDataset,
  getExcelWorkbookSheets,
  CsvNumber,
  philippineTimestamp,
} from './reportCsvTables.js';

const PAPER_FORMATS = {
  a4: 'a4',
  letter: 'letter',
  legal: [215.9, 330.2],
};

const MARGIN_MM = {
  compact: 8,
  normal: 14,
  wide: 22,
};

function buildFilteredStructuredRows(title, range, report, includedSections) {
  const structured = reportStructuredSections(title, range, report);
  if (!structured) return null;
  const filtered = filterReportSections(structured.sections, includedSections);
  const rows = [];
  if (structured.scope) rows.push(['Scope', structured.scope]);
  for (const section of filtered) {
    rows.push([], [section.title], section.headers, ...(section.records.length ? section.records : [['No records in this section.']]));
  }
  return rows;
}

export function reportCsv(title, range, report, filters = {}, options = {}) {
  const cell = value => {
    let text = value instanceof CsvNumber ? value.text : String(value ?? '');
    // Protect spreadsheet users from formula injection in names/references.
    if (typeof value === 'string' && /^[\s]*[=+\-@]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };

  if (options.dataset) {
    const dataset = getCsvDataset(title, range, report, options.dataset);
    const csvRows = [dataset.headers, ...dataset.rows];
    const width = csvRows.length ? Math.max(...csvRows.map(r => r.length)) : 1;
    return '\uFEFF' + csvRows.map(row => Array.from({ length: width }, (_, index) => cell(row[index])).join(',')).join('\r\n') + '\r\n';
  }

  const includeHeader = options.includeHeader !== false;
  const reportLabel = options.customTitle?.trim() || title;
  const rows = includeHeader
    ? [
        ['Report', reportLabel],
        ['Start date (Asia/Manila)', range.start],
        ['End date (inclusive)', range.end],
        ['Generated at (Philippine time)', philippineTimestamp(new Date().toISOString())],
        ...Object.entries(filters).map(([key, value]) => [key === 'search' ? 'Search filter' : key === 'status' ? 'Status filter' : key, value === '' ? 'None' : value]),
      ]
    : [];
  function visit(value, section, record, field) {
    if (Array.isArray(value)) value.forEach((item, index) => visit(item, section, record ? `${record}.${index + 1}` : index + 1, field));
    else if (value && typeof value === 'object') Object.entries(value).forEach(([key, item]) => visit(item, section, record, field ? field + '.' + key : key));
    else rows.push([section, record, field, value == null ? 'Unavailable' : value]);
  }
  const tables = options.includedSections
    ? buildFilteredStructuredRows(title, range, report, options.includedSections)
    : reportTables(title, range, report);
  if (tables) rows.push(...tables);
  else { rows.push([], ['Section', 'Record', 'Field', 'Value']); Object.entries(report).forEach(([key, value]) => visit(value, key, '', '')); }
  const width = rows.length ? Math.max(...rows.map(row => row.length)) : 1;
  return '\uFEFF' + rows.map(row => Array.from({ length: width }, (_, index) => cell(row[index])).join(',')).join('\r\n') + '\r\n';
}

export function generateReportPdf(title, range, report, filters = {}, options = {}) {
  const orientation = options.orientation === 'portrait' ? 'portrait' : 'landscape';
  const format = PAPER_FORMATS[options.paperSize] || 'a4';
  const margin = MARGIN_MM[options.margins] ?? 14;
  const includeHeader = options.includeHeader !== false;
  const customTitle = options.customTitle?.trim();

  const doc = new jsPDF({ orientation, unit: 'mm', format });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - margin * 2;
  const structured = reportStructuredSections(title, range, report);

  let startY = margin + 4;

  if (includeHeader) {
    doc.setFontSize(15);
    doc.setTextColor(15, 23, 42);
    const headingText = customTitle || `Mabutol Trucking Logistics: ${title} Report`;
    const splitTitle = doc.splitTextToSize(headingText, contentWidth);
    doc.text(splitTitle, margin, startY);
    startY += splitTitle.length * 6;

    doc.setFontSize(9.5);
    doc.setTextColor(71, 85, 105);
    doc.text(`Date range: ${range.start} to ${range.end} (Asia/Manila)`, margin, startY);
    startY += 5;
    doc.text(`Generated at (Philippine time): ${philippineTimestamp(new Date().toISOString())}`, margin, startY);
    startY += 5;
  } else if (customTitle) {
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    const splitTitle = doc.splitTextToSize(customTitle, contentWidth);
    doc.text(splitTitle, margin, startY);
    startY += splitTitle.length * 6 + 2;
  }

  const filterEntries = Object.entries(filters).filter(([, v]) => v !== undefined && v !== '');
  if (filterEntries.length) {
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    const filterText = 'Filters: ' + filterEntries.map(([k, v]) => (k === 'search' ? 'Search: ' : k === 'status' ? 'Status: ' : k + ': ') + v).join('; ');
    const splitFilters = doc.splitTextToSize(filterText, contentWidth);
    doc.text(splitFilters, margin, startY);
    startY += splitFilters.length * 4.5 + 2;
  }

  startY += 2;

  if (structured) {
    if (structured.scope) {
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      const splitScope = doc.splitTextToSize('Scope: ' + structured.scope, contentWidth);
      doc.text(splitScope, margin, startY);
      startY += splitScope.length * 4 + 3;
    }

    const sections = filterReportSections(structured.sections, options.includedSections);

    for (const section of sections) {
      if (startY > pageHeight - margin - 20) {
        doc.addPage();
        startY = margin + 4;
      }
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.text(section.title, margin, startY);
      startY += 3;

      autoTable(doc, {
        head: [section.headers],
        body: section.records.length ? section.records : [['No records in this section.']],
        startY,
        margin: { left: margin, right: margin, top: margin, bottom: margin + 8 },
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
      margin: { left: margin, right: margin, top: margin, bottom: margin + 8 },
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [30, 58, 138], textColor: 255 },
    });
  }

  // Footer on all pages
  const pageCount = doc.internal.getNumberOfPages();
  const footerY = pageHeight - Math.max(6, margin * 0.5);
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    const footerText = includeHeader
      ? `Page ${i} of ${pageCount} | Mabutol Trucking Logistics | Confidential Internal Document`
      : `Page ${i} of ${pageCount}`;
    doc.text(footerText, margin, footerY);
  }

  return doc;
}

export async function downloadReportPdfFromElement(element, filename, options = {}, fallbackArgs = null) {
  const orientation = options.orientation === 'portrait' ? 'portrait' : 'landscape';
  const format = PAPER_FORMATS[options.paperSize] || 'a4';
  const margin = MARGIN_MM[options.margins] ?? 14;

  if (!element || typeof element.querySelectorAll !== 'function') {
    if (fallbackArgs) {
      const doc = generateReportPdf(...fallbackArgs);
      doc.save(filename);
    }
    return;
  }

  const doc = new jsPDF({ orientation, unit: 'mm', format });
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - margin * 2;

  try {
    await doc.html(element, {
      margin: [margin, margin, margin, margin],
      autoPaging: 'text',
      width: contentWidth,
      windowWidth: element.scrollWidth || 820,
      html2canvas: {
        scale: 2,
        useCORS: true,
        backgroundColor: '#FFFFFF',
      },
    });
    doc.save(filename);
  } catch {
    if (fallbackArgs) {
      const fallbackDoc = generateReportPdf(...fallbackArgs);
      fallbackDoc.save(filename);
    }
  }
}

export async function generateExcelWorkbook(title, range, report, filters = {}, options = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TANAW - Mabutol Trucking Logistics';
  workbook.created = new Date();

  const sheets = getExcelWorkbookSheets(title, range, report, filters, options);
  const safeSheets = sheets.length ? sheets : [{ name: 'Report', headers: ['Status'], rows: [['No sections selected']], currencyCols: [], numericCols: [], colWidths: [24] }];

  for (const def of safeSheets) {
    const sheet = workbook.addWorksheet(def.name, {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    sheet.columns = def.headers.map((header, idx) => ({
      header,
      key: `col_${idx}`,
      width: def.colWidths?.[idx] || 18,
    }));

    const headerRow = sheet.getRow(1);
    headerRow.height = 24;
    headerRow.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF222831' } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
      cell.border = {
        bottom: { style: 'medium', color: { argb: 'FF00ADB5' } },
      };
    });

    def.rows.forEach((rowData, rIdx) => {
      const row = sheet.addRow(rowData);
      row.eachCell((cell, colNumber) => {
        const colIdx = colNumber - 1;
        if (def.currencyCols?.includes(colIdx) && typeof cell.value === 'number') {
          cell.numFmt = '#,##0.00';
        }
        if (def.numericCols?.includes(colIdx)) {
          cell.alignment = { vertical: 'middle', horizontal: typeof cell.value === 'number' ? 'right' : 'left' };
        } else {
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
        }
        if (rIdx % 2 === 1) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAF8F0' } };
        }
        cell.border = {
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };
      });
    });
  }

  return workbook;
}

export async function downloadReport(title, range, report, filters = {}, format = 'csv', options = {}) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const baseName = `tanaw-${slug}-${range.start}-to-${range.end}`;

  if (format === 'pdf') {
    if (options.printElement) {
      return downloadReportPdfFromElement(
        options.printElement,
        `${baseName}.pdf`,
        options,
        [title, range, report, filters, options]
      );
    }
    const doc = generateReportPdf(title, range, report, filters, options);
    doc.save(`${baseName}.pdf`);
    return;
  }

  if (format === 'xlsx') {
    const workbook = await generateExcelWorkbook(title, range, report, filters, options);
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${baseName}.xlsx`;
    document.body.appendChild(link);
    try { link.click(); }
    finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    return;
  }

  const legacyBase = `mabutol-${slug}-${range.start}-${range.end}`;
  const blob = new Blob([reportCsv(title, range, report, filters, options)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${legacyBase}.csv`;
  document.body.appendChild(link);
  try { link.click(); }
  finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
