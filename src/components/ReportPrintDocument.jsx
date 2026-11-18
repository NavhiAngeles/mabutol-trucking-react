import { forwardRef, useMemo } from 'react';
import {
  classifyReportSection,
  filterReportSections,
  getReportKpiCards,
  reportStructuredSections,
} from '../services/reportCsvTables.js';
import './ReportPrintDocument.css';

const PAGE_SPECS = {
  a4: {
    portrait: { widthPx: 660, minHeightPx: 933, cssSize: 'A4 portrait' },
    landscape: { widthPx: 860, minHeightPx: 608, cssSize: 'A4 landscape' },
  },
  letter: {
    portrait: { widthPx: 678, minHeightPx: 878, cssSize: 'letter portrait' },
    landscape: { widthPx: 878, minHeightPx: 678, cssSize: 'letter landscape' },
  },
  legal: {
    portrait: { widthPx: 678, minHeightPx: 1038, cssSize: '8.5in 13in' },
    landscape: { widthPx: 940, minHeightPx: 608, cssSize: '13in 8.5in' },
  },
};

const MARGIN_PX = {
  compact: 24,
  normal: 38,
  wide: 54,
};

function SvgChartBlock({ section }) {
  const numericColIndex = section.headers.findIndex((_, idx) =>
    idx > 0 && section.records.some(r => Number.isFinite(parseFloat(String(r[idx]).replace(/[^0-9.-]/g, ''))))
  );
  if (numericColIndex === -1 || !section.records.length) return null;

  const items = section.records.slice(0, 10).map(r => {
    const raw = parseFloat(String(r[numericColIndex]).replace(/[^0-9.-]/g, ''));
    const label = String(r[0] ?? '');
    return {
      label: label.length > 12 ? label.slice(0, 11) + '..' : label,
      fullLabel: label,
      value: Number.isFinite(raw) ? Math.max(0, raw) : 0,
      display: String(r[numericColIndex] ?? ''),
    };
  });

  const max = Math.max(1, ...items.map(i => i.value));
  const chartW = 600;
  const chartH = 160;
  const padL = 52;
  const padR = 16;
  const padT = 18;
  const padB = 34;
  const plotW = chartW - padL - padR;
  const plotH = chartH - padT - padB;
  const slotW = plotW / Math.max(1, items.length);
  const barW = Math.min(26, Math.max(10, slotW * 0.45));

  return (
    <div className="rpd-chart-block">
      <svg
        className="rpd-svg-chart"
        viewBox={`0 0 ${chartW} ${chartH}`}
        role="img"
        aria-label={`${section.title} chart`}
      >
        {[0, 0.5, 1].map(tick => {
          const y = padT + plotH * (1 - tick);
          const val = Math.round(max * tick);
          return (
            <g key={tick}>
              <line x1={padL} x2={chartW - padR} y1={y} y2={y} stroke="#E2E8F0" strokeWidth="1" />
              <text x={padL - 6} y={y + 3} textAnchor="end" className="rpd-axis-text">
                {val.toLocaleString('en-US')}
              </text>
            </g>
          );
        })}

        {items.map((item, idx) => {
          const h = Math.max(2, (item.value / max) * plotH);
          const x = padL + idx * slotW + (slotW - barW) / 2;
          const y = padT + plotH - h;
          return (
            <g key={`${item.fullLabel}-${idx}`}>
              <rect x={x} y={y} width={barW} height={h} rx="2" fill="#00ADB5">
                <title>{`${item.fullLabel}: ${item.display}`}</title>
              </rect>
              <text x={x + barW / 2} y={y - 4} textAnchor="middle" className="rpd-bar-val">
                {item.display}
              </text>
              <text x={x + barW / 2} y={chartH - 12} textAnchor="middle" className="rpd-axis-text">
                {item.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function paginateBlocks(blocks, rowsPerPage) {
  const pages = [[]];
  let weight = 0;

  for (const block of blocks) {
    if (block.kind === 'table' && block.section.records.length > rowsPerPage) {
      const records = block.section.records;
      for (let i = 0; i < records.length; i += rowsPerPage) {
        const chunk = records.slice(i, i + rowsPerPage);
        const chunkBlock = {
          ...block,
          key: `${block.key}-p${i}`,
          partLabel: i > 0 ? `${block.section.title} (continued)` : block.section.title,
          section: { ...block.section, records: chunk },
        };
        if (weight > 0 && weight + chunk.length > rowsPerPage + 4) {
          pages.push([]);
          weight = 0;
        }
        pages[pages.length - 1].push(chunkBlock);
        weight += chunk.length + 3;
        if (i + rowsPerPage < records.length) {
          pages.push([]);
          weight = 0;
        }
      }
      continue;
    }

    const blockWeight = block.kind === 'kpi' ? 5 : block.kind === 'chart' ? 7 : Math.max(4, (block.section?.records?.length || 1) + 2);
    if (weight > 0 && weight + blockWeight > rowsPerPage + 5) {
      pages.push([]);
      weight = 0;
    }
    pages[pages.length - 1].push(block);
    weight += blockWeight;
  }

  return pages.filter(p => p.length > 0);
}

const ReportPrintDocument = forwardRef(function ReportPrintDocument(
  {
    reportType,
    range,
    activeRangeLabel = 'Selected Range',
    reportData,
    filters = {},
    paperSize = 'a4',
    orientation = 'portrait',
    margins = 'normal',
    includedSections = { kpi: true, charts: true, table: true },
    customTitle = '',
    includeHeader = true,
    generatedAt = '',
  },
  ref
) {
  const spec = PAGE_SPECS[paperSize]?.[orientation] || PAGE_SPECS.a4.portrait;
  const paddingPx = MARGIN_PX[margins] ?? MARGIN_PX.normal;

  const kpiCards = useMemo(
    () => (includedSections.kpi ? getReportKpiCards(reportType, reportData) : []),
    [includedSections.kpi, reportType, reportData]
  );

  const structured = useMemo(
    () => (reportData ? reportStructuredSections(reportType, range, reportData) : null),
    [reportType, range, reportData]
  );

  const filteredSections = useMemo(() => {
    if (!structured) return [];
    return filterReportSections(structured.sections, includedSections).filter(
      sec => classifyReportSection(sec.title) !== 'kpi'
    );
  }, [structured, includedSections]);

  const blocks = useMemo(() => {
    const list = [];
    if (includedSections.kpi && kpiCards.length > 0) {
      list.push({ kind: 'kpi', key: 'kpi-summary' });
    }
    for (const sec of filteredSections) {
      const kind = classifyReportSection(sec.title);
      list.push({
        kind: kind === 'charts' ? 'chart' : 'table',
        key: sec.title,
        partLabel: sec.title,
        section: sec,
      });
    }
    return list;
  }, [includedSections.kpi, kpiCards, filteredSections]);

  const rowsPerPage = orientation === 'landscape' ? 12 : 18;
  const pages = useMemo(() => {
    const paginated = paginateBlocks(blocks, rowsPerPage);
    return paginated.length ? paginated : [[]];
  }, [blocks, rowsPerPage]);

  const activeFiltersList = Object.entries(filters).filter(
    ([, v]) => v !== undefined && v !== '' && v !== 'all'
  );
  const titleText = customTitle.trim() || `Reports: ${reportType}`;

  const isNumericHeader = header => {
    const lower = String(header || '').toLowerCase();
    return (
      lower.includes('(php)') ||
      lower.includes('charges') ||
      lower.includes('amount') ||
      lower.includes('expenses') ||
      lower.includes('rate') ||
      lower.includes('shipments') ||
      lower.includes('trips') ||
      lower.includes('count') ||
      lower.includes('incidents') ||
      lower.includes('distance') ||
      lower.includes('delay') ||
      lower.includes('vehicles')
    );
  };

  const formatCardValue = value => String(value ?? '').replace(/^PHP\s+/, '₱');

  return (
    <div ref={ref} className="rpd-document" data-paper={paperSize} data-orientation={orientation}>
      <style>{`@media print { @page { size: ${spec.cssSize}; margin: 0; } }`}</style>

      {pages.map((pageBlocks, pageIndex) => (
        <article
          key={`page-${pageIndex}`}
          className={`rpd-page rpd-page-${orientation}`}
          style={{
            width: `${spec.widthPx}px`,
            minHeight: `${spec.minHeightPx}px`,
            padding: `${paddingPx}px`,
          }}
        >
          {pageIndex === 0 && (
            <>
              {includeHeader ? (
                <header className="rpd-brand-banner">
                  <div className="rpd-brand-left">
                    <img src="/tanaw-logo.png" alt="" width="28" height="28" className="rpd-logo-mark" />
                    <div>
                      <div className="rpd-brand-name">TANAW</div>
                      <div className="rpd-brand-sub">MABUTOL TRUCKING LOGISTICS</div>
                    </div>
                  </div>
                  <div className="rpd-brand-right">
                    <h3 className="rpd-banner-title">{titleText}</h3>
                    <div className="rpd-banner-meta">
                      <span>{activeRangeLabel}: {range.start} to {range.end} (Asia/Manila)</span>
                      <span>Generated: {generatedAt}</span>
                    </div>
                    {activeFiltersList.length > 0 && (
                      <div className="rpd-banner-filters">
                        Filters: {activeFiltersList.map(([k, v]) => `${k}: ${v}`).join(' · ')}
                      </div>
                    )}
                  </div>
                </header>
              ) : (
                customTitle.trim() && (
                  <header className="rpd-header rpd-header-compact">
                    <h3 className="rpd-title">{customTitle.trim()}</h3>
                  </header>
                )
              )}

              {structured?.scope && (
                <p className="rpd-scope">Scope: {structured.scope}</p>
              )}
            </>
          )}

          {pageBlocks.length === 0 ? (
            <div className="rpd-empty">
              Select at least one report section from the left panel to preview the document.
            </div>
          ) : (
            <div className="rpd-blocks">
              {pageBlocks.map(block => {
                if (block.kind === 'kpi') {
                  return (
                    <section key={block.key} className="rpd-section rpd-kpi-section">
                      <h4 className="rpd-section-heading">Executive Summary</h4>
                      <div className="rpd-kpi-grid">
                        {kpiCards.map(card => {
                          const isPositiveMetric = card.label.includes('On-Time') || card.label.includes('Compliance');
                          return (
                            <div className="rpd-kpi-card" key={card.label}>
                              <div className="rpd-kpi-top">
                                <span className="rpd-kpi-label">{card.label}</span>
                                {isPositiveMetric && card.value !== 'N/A' && (
                                  <span className="rpd-positive-badge">Verified</span>
                                )}
                              </div>
                              <strong className="rpd-kpi-value">{formatCardValue(card.value)}</strong>
                              <span className="rpd-kpi-sub">{card.sub}</span>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  );
                }

                if (block.kind === 'chart') {
                  return (
                    <section key={block.key} className="rpd-section rpd-chart-section">
                      <h4 className="rpd-section-heading">{block.partLabel}</h4>
                      <SvgChartBlock section={block.section} />
                      <div className="rpd-table-card">
                        <table className="rpd-table">
                          <thead>
                            <tr>
                              {block.section.headers.map((h, i) => (
                                <th key={`${h}-${i}`} className={isNumericHeader(h) ? 'rpd-num' : ''}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {block.section.records.length ? (
                              block.section.records.map((rec, rIdx) => (
                                <tr key={rIdx}>
                                  {rec.map((cell, cIdx) => (
                                    <td key={cIdx} className={isNumericHeader(block.section.headers[cIdx]) ? 'rpd-num' : ''}>{cell}</td>
                                  ))}
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={block.section.headers.length}>No records in this section.</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  );
                }

                return (
                  <section key={block.key} className="rpd-section rpd-table-section">
                    <h4 className="rpd-section-heading">{block.partLabel}</h4>
                    <div className="rpd-table-card">
                      <table className="rpd-table">
                        <thead>
                          <tr>
                            {block.section.headers.map((h, i) => (
                              <th key={`${h}-${i}`} className={isNumericHeader(h) ? 'rpd-num' : ''}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {block.section.records.length ? (
                            block.section.records.map((rec, rIdx) => (
                              <tr key={rIdx}>
                                {rec.map((cell, cIdx) => (
                                  <td key={cIdx} className={isNumericHeader(block.section.headers[cIdx]) ? 'rpd-num' : ''}>{cell}</td>
                                ))}
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={block.section.headers.length}>No records in this section.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </section>
                );
              })}
            </div>
          )}

          {includeHeader && (
            <footer className="rpd-footer">
              <span>Mabutol Trucking Logistics · Confidential Internal Document</span>
              <span>Page {pageIndex + 1} of {pages.length}</span>
            </footer>
          )}
        </article>
      ))}
    </div>
  );
});

export default ReportPrintDocument;
