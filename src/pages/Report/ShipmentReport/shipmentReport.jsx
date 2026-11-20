import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, FilterX, Package, TrendingUp, XCircle } from 'lucide-react';
import MainLayout from '../../../layouts/mainLayout';
import ReportTopbar from '../../../components/ReportTopbar';
import ReportExportModal from '../../../components/ReportExportModal';
import { useReportRange } from '../../../hooks/useReportRange';
import { useLiveData } from '../../../hooks/useLiveData';
import { reportRange } from '../../../services/reportOverview.js';
import { buildShipmentReport } from '../../../services/shipmentReport.js';
import {
  getShipmentReportRecords,
  SHIPMENT_REPORT_TABLES,
} from '../../../services/shipmentReportService';
import { formatManilaDateTime, REPORT_PRESET_RANGES } from '@/lib/reportFormatters';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import ReportPageHeader from '@/components/reports/ReportPageHeader';
import ReportRangeToolbar from '@/components/reports/ReportRangeToolbar';
import AccountingNoteDisclosure from '@/components/reports/AccountingNoteDisclosure';
import ReportStatusBanner from '@/components/reports/ReportStatusBanner';
import KpiStatCard from '@/components/reports/KpiStatCard';
import AnalyticsAreaChart from '@/components/reports/AnalyticsAreaChart';
import AnalyticsDonutChart from '@/components/reports/AnalyticsDonutChart';
import ReportEmptyState from '@/components/reports/ReportEmptyState';
import './shipmentReport.css';
import '../../../components/reportControls.css';

const STATUS_META = {
  completed: {
    label: 'Completed',
    color: '#15803D',
    badgeClass: 'border-emerald-200 bg-emerald-50 text-[#15803D]',
  },
  active: {
    label: 'Active',
    color: '#1D4ED8',
    badgeClass: 'border-blue-200 bg-blue-50 text-[#1E40AF]',
  },
  delayed: {
    label: 'Delayed',
    color: '#B45309',
    badgeClass: 'border-amber-200 bg-amber-50 text-[#B45309]',
  },
  cancelled: {
    label: 'Cancelled',
    color: '#B91C1C',
    badgeClass: 'border-red-200 bg-red-50 text-[#B91C1C]',
  },
  pending: {
    label: 'Pending',
    color: '#0F2A52',
    badgeClass: 'border-slate-300 bg-slate-100 text-[#0F2A52]',
  },
  booked: {
    label: 'Booked',
    color: '#475569',
    badgeClass: 'border-slate-200 bg-slate-100 text-slate-700',
  },
  other: {
    label: 'Other',
    color: '#64748B',
    badgeClass: 'border-slate-200 bg-slate-50 text-slate-600',
  },
};

const TREND_CHART_CONFIG = {
  rate: { label: 'On-Time Rate', color: '#0F2A52' },
};

const STATUS_CHART_CONFIG = Object.fromEntries(
  Object.entries(STATUS_META).map(([key, meta]) => [
    key,
    { label: meta.label, color: meta.color },
  ])
);

export default function ShipmentReport() {
  const [status, setStatus] = useState('all');
  const [customRange, setCustomRange] = useState(null);
  const [rangeError, setRangeError] = useState('');
  const [activeRange, setActiveRange] = useState('thisMonth');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [page, setPage] = useState(1);

  const range = useReportRange(activeRange, customRange);
  const memoCallback = typeof useCallback === 'function' ? useCallback : (fn) => fn;
  const loadData = memoCallback(() => getShipmentReportRecords(range), [range.start, range.end]);
  const live = useLiveData(loadData, SHIPMENT_REPORT_TABLES, {
    cacheKey: `report:shipments:${range.start || 'all'}:${range.end || 'all'}`,
    staleTime: 30000,
    pollInterval: 60000,
  });

  const handleRangeClick = (key) => {
    setActiveRange(key);
    setShowCustomPicker(false);
    setPage(1);
  };

  const handleApplyCustomRange = () => {
    try {
      setCustomRange(reportRange('custom', customStart, customEnd));
      setRangeError('');
    } catch (error) {
      setRangeError(error.message);
      return;
    }
    setActiveRange('custom');
    setShowCustomPicker(false);
    setPage(1);
  };

  const report = buildShipmentReport(
    live.data?.shipments || [],
    live.data?.deliveries || [],
    range,
    '',
    status
  );
  const hasData = !!live.data;
  const initialLoading = live.loading && !hasData;
  const b = report.breakdown;
  const total = report.total;
  const pageCount = Math.max(1, Math.ceil(total / 10));
  const currentPage = Math.min(page, pageCount);
  const visibleRows = report.rows.slice((currentPage - 1) * 10, currentPage * 10);

  const statusSlices = Object.entries(STATUS_META).map(([key, meta]) => ({
    key,
    label: meta.label,
    value: b[key] || 0,
    color: meta.color,
  }));

  const varianceClass = (v) =>
    v.startsWith('-')
      ? 'text-[#15803D] font-semibold'
      : v.startsWith('+')
        ? 'text-[#B91C1C] font-semibold'
        : 'text-slate-500';

  return (
    <MainLayout>
      <div className="reports-page min-w-0 bg-[#F8FAFC] text-slate-900">
        <ReportTopbar />

        <section className="mx-auto w-full max-w-[1600px] px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
          <ReportPageHeader
            title="Reports: Shipments"
            subtitle="Comprehensive analysis of delivery performance and volume."
            reportType="Shipments"
            onRefresh={live.refresh}
            onExport={() => setShowExportModal(true)}
            exportDisabled={!live.data || !!live.error}
            loading={live.loading}
          />

          <ReportRangeToolbar
            activeRange={activeRange}
            onSelectRange={handleRangeClick}
            range={range}
            customStart={customStart}
            customEnd={customEnd}
            onCustomStartChange={setCustomStart}
            onCustomEndChange={setCustomEnd}
            onApplyCustom={handleApplyCustomRange}
            showCustomPicker={showCustomPicker}
            onShowCustomPickerChange={setShowCustomPicker}
            rangeError={rangeError}
            startInputId="sr-start"
            endInputId="sr-end"
          />

          <AccountingNoteDisclosure
            summary={`Shipments created in selected Philippine time dates · ${hasData ? report.timed : 'N/A'} timed completed shipments`}
            notes={[
              'Shipments are filtered by creation date in Asia/Manila (PHT) and evaluated using their current status.',
              'The status filter applies to KPI totals, breakdown charts, trend series, and the Shipment Ledger.',
              `On-time rate is calculated from ${hasData ? report.timed : 'N/A'} completed shipments with both planned ETA and actual delivery timestamps.`,
            ]}
          />

          <ReportStatusBanner
            loading={live.loading}
            loadingText="Loading shipment report…"
            error={live.error}
            hasData={hasData}
            onRetry={live.refresh}
          />

          {/* KPI Summary Row */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <KpiStatCard
              label="Total Shipments"
              icon={Package}
              loading={initialLoading}
              value={hasData ? total.toLocaleString('en-PH') : 'N/A'}
              description={hasData ? `${b.completed} completed · ${b.delayed} delayed` : undefined}
            />
            <KpiStatCard
              label="On-Time Rate"
              icon={Clock}
              loading={initialLoading}
              value={hasData && report.rate != null ? `${report.rate}%` : 'N/A'}
              description={hasData ? `${report.timed} timed completed shipments` : undefined}
            />
            <KpiStatCard
              label="Cancelled Shipments"
              icon={XCircle}
              loading={initialLoading}
              value={hasData ? b.cancelled.toLocaleString('en-PH') : 'N/A'}
              tone={hasData && b.cancelled > 0 ? 'danger' : 'default'}
              description="In current selection"
            />
          </div>

          {/* Analytics Row */}
          <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-12">
            <Card className="gap-0 rounded-xl border border-slate-200 bg-white py-0 shadow-none ring-0 lg:col-span-4">
              <CardHeader className="border-b border-slate-100 px-5 py-4">
                <CardTitle className="text-base font-semibold text-slate-900">
                  Shipment Status
                </CardTitle>
                <CardDescription className="text-xs text-slate-600">
                  Distribution across current shipment states
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5">
                {initialLoading ? (
                  <Skeleton className="h-[260px] w-full rounded-lg" />
                ) : (
                  <AnalyticsDonutChart
                    data={statusSlices}
                    config={STATUS_CHART_CONFIG}
                    centerValue={total.toLocaleString('en-PH')}
                    centerLabel="Total"
                    ariaLabel={`Shipment status breakdown: ${total} total`}
                  />
                )}
              </CardContent>
            </Card>

            <Card className="gap-0 rounded-xl border border-slate-200 bg-white py-0 shadow-none ring-0 lg:col-span-8">
              <CardHeader className="border-b border-slate-100 px-5 py-4">
                <CardTitle className="text-base font-semibold text-slate-900">
                  Delivery Performance Trend
                </CardTitle>
                <CardDescription className="text-xs text-slate-600">
                  On-time rate of timed completed shipments by creation date
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5">
                {initialLoading ? (
                  <Skeleton className="h-[250px] w-full rounded-lg" />
                ) : !report.timed ? (
                  <ReportEmptyState
                    icon={TrendingUp}
                    title="No timed completed shipments"
                    description="No completed shipments with both planned ETA and actual arrival timestamps were found for this selection."
                    action={
                      status !== 'all'
                        ? {
                          label: 'Show All Statuses',
                          onClick: () => {
                            setStatus('all');
                            setPage(1);
                          },
                        }
                        : undefined
                    }
                  />
                ) : (
                  <AnalyticsAreaChart
                    data={report.trend}
                    xKey="date"
                    series={[{ key: 'rate', label: 'Actual On-Time %', color: '#0F2A52' }]}
                    config={TREND_CHART_CONFIG}
                    yDomain={[0, 100]}
                    yAxisWidth={44}
                    yAxisFormatter={(v) => `${v}%`}
                    connectNulls={false}
                    showDots
                    tooltipFormatter={(value, _name, item) => (
                      <span className="font-mono font-medium text-slate-900 tabular-nums">
                        {value}% ({item?.payload?.count ?? 0} timed)
                      </span>
                    )}
                    ariaLabel="On-time rate of timed completed shipments by creation date"
                  />
                )}
              </CardContent>
            </Card>
          </div>

          {/* Shipment Ledger */}
          <Card className="mt-5 gap-0 overflow-hidden rounded-xl border border-slate-200 bg-white py-0 shadow-none ring-0">
            <CardHeader className="flex flex-col justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center">
              <div>
                <CardTitle className="text-base font-semibold text-slate-900">
                  Shipment Ledger
                </CardTitle>
                <CardDescription className="text-xs text-slate-600">
                  Detailed shipment records matching the active date range and status
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <label
                  htmlFor="sr-status"
                  className="text-xs font-semibold text-slate-600"
                >
                  Status
                </label>
                <select
                  id="sr-status"
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value);
                    setPage(1);
                  }}
                  className="min-h-[38px] rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[13px] font-medium text-slate-900 max-sm:min-h-[44px]"
                >
                  <option value="all">All statuses</option>
                  {Object.keys(STATUS_META).map((key) => (
                    <option key={key} value={key}>
                      {STATUS_META[key].label}
                    </option>
                  ))}
                </select>
              </div>
            </CardHeader>

            <div className="overflow-x-auto">
              <Table className="min-w-[880px] text-[13px]">
                <TableHeader className="bg-slate-50">
                  <TableRow className="border-slate-200 hover:bg-slate-50">
                    <TableHead className="sticky left-0 z-10 bg-slate-50 pl-5 text-xs font-semibold tracking-wider text-slate-600 uppercase">
                      Shipment ID
                    </TableHead>
                    <TableHead className="text-xs font-semibold tracking-wider text-slate-600 uppercase">
                      Customer
                    </TableHead>
                    <TableHead className="min-w-[280px] text-xs font-semibold tracking-wider text-slate-600 uppercase">
                      Route
                    </TableHead>
                    <TableHead className="text-xs font-semibold tracking-wider text-slate-600 uppercase">
                      Status
                    </TableHead>
                    <TableHead className="text-xs font-semibold tracking-wider text-slate-600 uppercase">
                      Planned ETA
                    </TableHead>
                    <TableHead className="text-xs font-semibold tracking-wider text-slate-600 uppercase">
                      Actual Delivery
                    </TableHead>
                    <TableHead className="text-right text-xs font-semibold tracking-wider text-slate-600 uppercase">
                      Variance
                    </TableHead>
                    <TableHead className="pr-5 text-xs font-semibold tracking-wider text-slate-600 uppercase">
                      Driver
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {initialLoading ? (
                    Array.from({ length: 5 }, (_, idx) => (
                      <TableRow key={`skel-${idx}`}>
                        {Array.from({ length: 8 }, (__, cIdx) => (
                          <TableCell key={cIdx} className="py-3.5">
                            <Skeleton className="h-4 w-full max-w-[120px] rounded" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : report.rows.length === 0 ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={8} className="p-6">
                        <ReportEmptyState
                          compact
                          icon={FilterX}
                          title={
                            !hasData
                              ? 'Report data is not loaded'
                              : 'No shipments match this date range and filters'
                          }
                          description={
                            !hasData
                              ? 'Refresh the report to load shipment records.'
                              : 'Try clearing the status filter or expanding the date range.'
                          }
                          action={
                            status !== 'all'
                              ? {
                                label: 'Show All Statuses',
                                onClick: () => {
                                  setStatus('all');
                                  setPage(1);
                                },
                              }
                              : activeRange !== 'last3Months'
                                ? {
                                  label: 'View Last 3 Months',
                                  onClick: () => handleRangeClick('last3Months'),
                                }
                                : undefined
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ) : (
                    visibleRows.map((r) => {
                      const statusMeta = STATUS_META[r.group] || STATUS_META.other;
                      const [origin, ...destParts] = (r.route || '').split(' → ');
                      const dest = destParts.join(' → ');
                      return (
                        <TableRow key={r.id} className="border-slate-100 hover:bg-slate-50/80">
                          <TableCell className="sticky left-0 z-10 bg-white pl-5 font-semibold whitespace-nowrap tabular-nums">
                            <Link
                              to={'/shipment?tab=all&record=' + encodeURIComponent(r.id)}
                              className="text-[#1D4ED8] no-underline hover:underline"
                            >
                              {r.tracking_number || r.id}
                            </Link>
                          </TableCell>
                          <TableCell className="text-slate-900">{r.customerName}</TableCell>
                          <TableCell className="max-w-[420px] whitespace-normal text-slate-700" title={r.route}>
                            {dest ? (
                              <>
                                <span className="text-slate-600">{origin}</span>
                                <span className="px-1 font-semibold text-slate-400">→</span>
                                <span className="font-medium text-slate-900">{dest}</span>
                              </>
                            ) : (
                              r.route
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={`rounded px-2 py-0.5 text-[11px] font-semibold uppercase ${statusMeta.badgeClass}`}
                            >
                              {r.status ? r.status.replace(/_/g, ' ') : statusMeta.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-slate-600 tabular-nums">
                            {formatManilaDateTime(r.estimated_arrival)}
                          </TableCell>
                          <TableCell
                            className={`whitespace-nowrap tabular-nums ${r.status === 'delayed' ? 'font-semibold text-[#B91C1C]' : 'text-slate-600'
                              }`}
                          >
                            {formatManilaDateTime(r.actual_delivery_at)}
                          </TableCell>
                          <TableCell
                            className={`text-right whitespace-nowrap tabular-nums ${varianceClass(r.variance)}`}
                          >
                            {r.variance}
                          </TableCell>
                          <TableCell
                            className={`pr-5 ${r.driverName === 'Unassigned'
                              ? 'italic text-slate-500'
                              : 'text-slate-900'
                              }`}
                          >
                            {r.driverName}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-3 text-xs text-slate-600 sm:flex-row">
              <span className="tabular-nums">
                Showing {hasData && total ? (currentPage - 1) * 10 + 1 : 0} to{' '}
                {hasData ? Math.min(currentPage * 10, total) : 0} of {hasData ? total : 'N/A'} entries
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!hasData || currentPage === 1}
                  onClick={() => setPage(currentPage - 1)}
                  className="min-h-[34px] border-slate-300 bg-white text-xs text-slate-700 max-sm:min-h-[44px]"
                >
                  Prev
                </Button>
                <span className="px-1 font-medium text-slate-700 tabular-nums">
                  Page {currentPage} of {pageCount}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!hasData || currentPage === pageCount}
                  onClick={() => setPage(currentPage + 1)}
                  className="min-h-[34px] border-slate-300 bg-white text-xs text-slate-700 max-sm:min-h-[44px]"
                >
                  Next
                </Button>
              </div>
            </div>
          </Card>
        </section>

        <ReportExportModal
          open={showExportModal && !!live.data && !live.error}
          onClose={() => setShowExportModal(false)}
          reportType="Shipments"
          range={range}
          activeRangeLabel={
            REPORT_PRESET_RANGES.find(([key]) => key === activeRange)?.[1] || 'Custom Range'
          }
          reportData={report}
          filters={{ status }}
        />
      </div>
    </MainLayout>
  );
}
