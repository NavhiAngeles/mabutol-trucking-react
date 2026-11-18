import { useEffect, useMemo, useRef, useState } from 'react';
import {
  getExcelWorkbookSheets,
  philippineTimestamp,
} from '../services/reportCsvTables.js';
import { downloadReport } from '../services/reportExport.js';
import ReportPrintDocument from './ReportPrintDocument.jsx';
import './ReportExportModal.css';

const PAPER_LABELS = {
  a4: 'A4 (210 x 297 mm)',
  letter: 'Letter (8.5" x 11")',
  legal: 'Legal / Folio (8.5" x 13")',
};

const MARGIN_LABELS = {
  compact: 'Compact',
  normal: 'Normal',
  wide: 'Wide',
};

export default function ReportExportModal(props) {
  if (!props.open) return null;
  const modalKey = `${props.reportType}-${props.range.start}-${props.range.end}-${props.initialFormat || 'pdf'}`;
  return <ReportExportModalInner key={modalKey} {...props} />;
}

function ReportExportModalInner({
  onClose,
  reportType,
  range,
  activeRangeLabel = 'Selected Range',
  reportData,
  filters = {},
  initialFormat = 'pdf',
}) {
  const [format, setFormat] = useState(initialFormat === 'csv' ? 'xlsx' : initialFormat);
  const [paperSize, setPaperSize] = useState('a4');
  const [orientation, setOrientation] = useState('portrait');
  const [margins, setMargins] = useState('normal');
  const [includedSections, setIncludedSections] = useState({ kpi: true, charts: true, table: true });
  const [customTitle, setCustomTitle] = useState(`Reports: ${reportType} (${range.start} to ${range.end})`);
  const [includeHeader, setIncludeHeader] = useState(true);
  const [activeSheetName, setActiveSheetName] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  const dialogRef = useRef(null);
  const printDocRef = useRef(null);
  const previousFocusRef = useRef(null);

  useEffect(() => {
    previousFocusRef.current = typeof document !== 'undefined' ? document.activeElement : null;
    const focusTimer = setTimeout(() => {
      const firstControl = dialogRef.current?.querySelector('button, select, input');
      firstControl?.focus();
    }, 0);

    const onKeyDown = event => {
      if (event.key === 'Escape' && !isExporting) {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKeyDown);
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
        previousFocusRef.current.focus();
      }
    };
  }, [onClose, isExporting]);

  const hasSelectedSection =
    includedSections.kpi || includedSections.charts || includedSections.table;

  const generatedAt = useMemo(
    () => philippineTimestamp(new Date().toISOString()),
    []
  );

  const excelSheets = useMemo(() => {
    if (format !== 'xlsx' || !reportData) return [];
    return getExcelWorkbookSheets(reportType, range, reportData, filters, {
      includedSections,
      customTitle,
      includeHeader,
    });
  }, [format, reportType, range, reportData, filters, includedSections, customTitle, includeHeader]);

  const currentSheet = useMemo(() => {
    if (!excelSheets.length) return null;
    return excelSheets.find(s => s.name === activeSheetName) || excelSheets[0];
  }, [excelSheets, activeSheetName]);

  const toggleSection = key => {
    setIncludedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleDownload = async () => {
    if (!hasSelectedSection || !reportData || isExporting) return;
    setIsExporting(true);
    try {
      await downloadReport(reportType, range, reportData, filters, format, {
        paperSize,
        orientation,
        margins,
        includedSections,
        customTitle,
        includeHeader,
        printElement: format === 'pdf' ? printDocRef.current : undefined,
      });
      onClose();
    } finally {
      setIsExporting(false);
    }
  };

  const formatCellDisplay = (value, sheet, colIdx) => {
    if (typeof value === 'number' && sheet.currencyCols?.includes(colIdx)) {
      return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return value ?? '';
  };

  return (
    <div
      className="modal-backdrop report-export-backdrop"
      onMouseDown={event => {
        if (event.target === event.currentTarget && !isExporting) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="modal-window report-export-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-export-modal-title"
      >
        <div className="modal-header">
          <div>
            <h2 id="report-export-modal-title">Export {reportType} Report</h2>
            <p className="modal-subtitle">
              Configure format, layout, and included sections before downloading.
            </p>
          </div>
          <button
            type="button"
            className="close-modal-btn"
            aria-label="Close export modal"
            disabled={isExporting}
            onClick={onClose}
          >
            &times;
          </button>
        </div>

        <div className="modal-body report-export-body">
          <aside className="rem-sidebar" aria-label="Export settings">
            <div className="rem-control-group">
              <span className="rem-group-label" id="rem-format-label">Export Format</span>
              <div className="rem-segmented" role="group" aria-labelledby="rem-format-label">
                <button
                  type="button"
                  className={`rem-seg-btn ${format === 'pdf' ? 'active' : ''}`}
                  aria-pressed={format === 'pdf'}
                  onClick={() => setFormat('pdf')}
                >
                  PDF Document
                </button>
                <button
                  type="button"
                  className={`rem-seg-btn ${format === 'xlsx' ? 'active' : ''}`}
                  aria-pressed={format === 'xlsx'}
                  onClick={() => setFormat('xlsx')}
                >
                  Excel (.xlsx)
                </button>
              </div>
            </div>

            {format === 'pdf' && (
              <div className="rem-control-group">
                <span className="rem-group-label">Page Setup</span>

                <div className="rem-field">
                  <label htmlFor="rem-paper-size">Paper Size</label>
                  <select
                    id="rem-paper-size"
                    value={paperSize}
                    onChange={event => setPaperSize(event.target.value)}
                  >
                    {Object.entries(PAPER_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>

                <div className="rem-field">
                  <span className="rem-sub-label" id="rem-orientation-label">Orientation</span>
                  <div className="rem-segmented" role="group" aria-labelledby="rem-orientation-label">
                    <button
                      type="button"
                      className={`rem-seg-btn ${orientation === 'portrait' ? 'active' : ''}`}
                      aria-pressed={orientation === 'portrait'}
                      onClick={() => setOrientation('portrait')}
                    >
                      Portrait
                    </button>
                    <button
                      type="button"
                      className={`rem-seg-btn ${orientation === 'landscape' ? 'active' : ''}`}
                      aria-pressed={orientation === 'landscape'}
                      onClick={() => setOrientation('landscape')}
                    >
                      Landscape
                    </button>
                  </div>
                </div>

                <div className="rem-field">
                  <span className="rem-sub-label" id="rem-margins-label">Margins</span>
                  <div className="rem-segmented rem-segmented-3" role="group" aria-labelledby="rem-margins-label">
                    {Object.entries(MARGIN_LABELS).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        className={`rem-seg-btn ${margins === key ? 'active' : ''}`}
                        aria-pressed={margins === key}
                        onClick={() => setMargins(key)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="rem-control-group">
              <span className="rem-group-label">Report Content &amp; Sections</span>

              <div className="rem-checkbox-list">
                <label className="rem-checkbox-row" htmlFor="rem-sec-kpi">
                  <input
                    id="rem-sec-kpi"
                    type="checkbox"
                    checked={includedSections.kpi}
                    onChange={() => toggleSection('kpi')}
                  />
                  <span>KPI Summary Cards</span>
                </label>

                <label className="rem-checkbox-row" htmlFor="rem-sec-charts">
                  <input
                    id="rem-sec-charts"
                    type="checkbox"
                    checked={includedSections.charts}
                    onChange={() => toggleSection('charts')}
                  />
                  <span>{format === 'pdf' ? 'Charts & Trend Visuals' : 'Trend & Breakdown Sheets'}</span>
                </label>

                <label className="rem-checkbox-row" htmlFor="rem-sec-table">
                  <input
                    id="rem-sec-table"
                    type="checkbox"
                    checked={includedSections.table}
                    onChange={() => toggleSection('table')}
                  />
                  <span>Detailed Records Table</span>
                </label>
              </div>

              {!hasSelectedSection && (
                <p className="rem-validation-note" role="alert">
                  Select at least one section to enable download.
                </p>
              )}

              <div className="rem-field">
                <label htmlFor="rem-custom-title">Report Title / Subtitle</label>
                <input
                  id="rem-custom-title"
                  type="text"
                  value={customTitle}
                  onChange={event => setCustomTitle(event.target.value)}
                  placeholder={`Reports: ${reportType}`}
                />
              </div>

              <label className="rem-checkbox-row rem-toggle-row" htmlFor="rem-include-header">
                <input
                  id="rem-include-header"
                  type="checkbox"
                  checked={includeHeader}
                  onChange={event => setIncludeHeader(event.target.checked)}
                />
                <span>Include Mabutol Trucking / Tanaw header &amp; export timestamp</span>
              </label>
            </div>
          </aside>

          <section className="rem-preview-pane" aria-label="Live export preview">
            <div className="rem-preview-toolbar">
              <span className="rem-preview-caption">
                {format === 'pdf'
                  ? `Live Print Preview (${PAPER_LABELS[paperSize]}, ${orientation}, ${MARGIN_LABELS[margins]} margins)`
                  : `Excel Workbook Preview (${excelSheets.length} worksheet${excelSheets.length === 1 ? '' : 's'})`}
              </span>
            </div>

            <div className="rem-preview-canvas">
              {format === 'pdf' ? (
                <ReportPrintDocument
                  ref={printDocRef}
                  reportType={reportType}
                  range={range}
                  activeRangeLabel={activeRangeLabel}
                  reportData={reportData}
                  filters={filters}
                  paperSize={paperSize}
                  orientation={orientation}
                  margins={margins}
                  includedSections={includedSections}
                  customTitle={customTitle}
                  includeHeader={includeHeader}
                  generatedAt={generatedAt}
                />
              ) : (
                <div className="rem-csv-preview-card">
                  {excelSheets.length > 0 && (
                    <div className="rem-sheet-tabs" role="tablist" aria-label="Excel worksheets">
                      {excelSheets.map(sheet => {
                        const isActive = currentSheet?.name === sheet.name;
                        return (
                          <button
                            key={sheet.name}
                            type="button"
                            role="tab"
                            aria-selected={isActive}
                            className={`rem-sheet-tab ${isActive ? 'active' : ''}`}
                            onClick={() => setActiveSheetName(sheet.name)}
                          >
                            {sheet.name}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {currentSheet ? (
                    <>
                      <div className="rem-csv-meta-bar">
                        <span>
                          Sheet: {currentSheet.name} · {range.start} to {range.end} (Asia/Manila)
                        </span>
                        <span>
                          {currentSheet.rows.length} rows · Header frozen · Auto-sized columns
                        </span>
                      </div>
                      <div className="rem-csv-table-wrap">
                        <table className="rem-csv-table">
                          <thead>
                            <tr>
                              {currentSheet.headers.map((header, idx) => (
                                <th
                                  key={`${header}-${idx}`}
                                  className={currentSheet.numericCols?.includes(idx) ? 'rem-num' : ''}
                                >
                                  {header}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {currentSheet.rows.length ? (
                              currentSheet.rows.slice(0, 15).map((row, rIdx) => (
                                <tr key={rIdx}>
                                  {currentSheet.headers.map((_, cIdx) => (
                                    <td
                                      key={cIdx}
                                      className={currentSheet.numericCols?.includes(cIdx) ? 'rem-num' : ''}
                                    >
                                      {formatCellDisplay(row[cIdx], currentSheet, cIdx)}
                                    </td>
                                  ))}
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={Math.max(1, currentSheet.headers.length)}>
                                  No records in this worksheet for the selected range.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </>
                  ) : (
                    <div className="rem-empty-preview">
                      Select at least one section from the left panel to preview the Excel workbook.
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="modal-footer report-export-footer">
          <span className="rem-footer-summary">
            {format === 'pdf'
              ? `PDF · ${paperSize.toUpperCase()} ${orientation} · ${MARGIN_LABELS[margins]} margins`
              : `Excel Workbook (.xlsx) · ${excelSheets.length} sheets`}
          </span>
          <div className="rem-footer-actions">
            <button type="button" className="rem-btn-secondary" disabled={isExporting} onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="rem-btn-primary"
              disabled={!hasSelectedSection || isExporting}
              onClick={handleDownload}
            >
              {isExporting
                ? 'Generating...'
                : format === 'pdf'
                  ? 'Download PDF'
                  : 'Download Excel'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
