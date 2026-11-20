import { Fragment, useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  FilterX,
  ShieldAlert,
  Users,
} from 'lucide-react';
import MainLayout from '../../../layouts/mainLayout';
import ReportTopbar from '../../../components/ReportTopbar';
import ReportExportModal from '../../../components/ReportExportModal';
import { useReportRange } from '../../../hooks/useReportRange';
import { useLiveData } from '../../../hooks/useLiveData';
import { reportRange } from '../../../services/reportOverview.js';
import {
  buildDriverReport,
  DRIVER_STATUSES,
} from '../../../services/driverReport.js';
import {
  DRIVER_REPORT_TABLES,
  getDriverReportRecords,
} from '../../../services/driverReportService';
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
import AnalyticsBarChart from '@/components/reports/AnalyticsBarChart';
import ReportEmptyState from '@/components/reports/ReportEmptyState';
import './driverReport.css';
import '../../../components/reportControls.css';

const DRIVER_RATE_CONFIG = {
  rate: { label: 'On-Time Rate', color: '#0F2A52' },
};

const INCIDENT_CHART_CONFIG = {
  count: { label: 'Incidents', color: '#B91C1C' },
};

const DRIVER_STATUS_BADGE = {
  available: 'border-emerald-200 bg-emerald-50 text-[#15803D]',
  on_trip: 'border-blue-200 bg-blue-50 text-[#1E40AF]',
  off_duty: 'border-slate-200 bg-slate-100 text-slate-700',
  on_leave: 'border-amber-200 bg-amber-50 text-[#B45309]',
  inactive: 'border-red-200 bg-red-50 text-[#B91C1C]',
};

export default function DriverReport() {
  const [status, setStatus] = useState('all');
  const [rangeError, setRangeError] = useState('');
  const [activeRange, setActiveRange] = useState('thisMonth');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [appliedCustom, setAppliedCustom] = useState(null);
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [page, setPage] = useState(1);

  const range = useReportRange(activeRange, appliedCustom);
  const memoCallback = typeof useCallback === 'function' ? useCallback : (fn) => fn;
  const loadData = memoCallback(() => getDriverReportRecords(range), [range.start, range.end]);
  const live = useLiveData(loadData, DRIVER_REPORT_TABLES, {
    cacheKey: `report:drivers:${range.start || 'all'}:${range.end || 'all'}`,
    staleTime: 30000,
    pollInterval: 60000,
  });

  const handleRangeClick = (key) => {
    setActiveRange(key);
    setPage(1);
    setExpandedId(null);
    setShowCustomPicker(false);
  };

  const handleApplyCustomRange = () => {
    try {
      setAppliedCustom(reportRange('custom', customStart, customEnd));
      setRangeError('');
    } catch (error) {
      setRangeError(error.message);
      return;
    }
    setPage(1);
    setExpandedId(null);
    setActiveRange('custom');
    setShowCustomPicker(false);
  };

  const report = buildDriverReport(
    live.data || { drivers: [], shipments: [], deliveries: [], incidents: [] },
    range,
    '',
    status
  );
  const hasData = !!live.data;
  const initialLoading = live.loading && !hasData;
  const pageCount = Math.max(1, Math.ceil(report.rows.length / 10));
  const currentPage = Math.min(page, pageCount);
  const visibleRows = report.rows.slice((currentPage - 1) * 10, currentPage * 10);

  const warnings =
    hasData && report.unattributedIncidents > 0
      ? [
        {
          label: `${report.unattributedIncidents} unattributed incident(s) excluded`,
          tone: 'warning',
        },
      ]
      : [];

  return (
    <MainLayout>
      <div className="reports-page dr-page dr-report-live min-w-0 bg-[#F8FAFC] text-slate-900">
        <ReportTopbar />

        <section className="mx-auto w-full max-w-[1600px] px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
          <ReportPageHeader
            title="Reports: Drivers"
            subtitle="Analyze individual driver performance, reliability, and delivery metrics."
            reportType="Drivers"
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
            startInputId="dr-start"
            endInputId="dr-end"
          />

          <AccountingNoteDisclosure
            summary={`Non-cancelled delivery assignments for shipments created in Philippine time · ${hasData ? report.timed : 'N/A'} timed trips`}
            warnings={warnings}
            notes={[
              `Trips count non-cancelled delivery assignments for shipments created in the selected dates (Asia/Manila). On-time rate compares delivered arrival with shipment ETA across ${hasData ? report.timed : 'N/A'} timed trips.`,
              'Kilometres sum valid odometer differences (odometer_end >= odometer_start) on delivered trips.',
              'Incidents use their reported dates and the linked delivery driver, independently of shipment creation date. Driver status is current; drivers without trips remain in the roster. Ratings are unavailable.',
            ]}
          />

          <ReportStatusBanner
            loading={live.loading}
            loadingText="Loading driver report…"
            error={live.error}
            hasData={hasData}
            onRetry={live.refresh}
          />

          {/* KPI Summary Row */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <KpiStatCard
              label="Drivers with Trips"
              icon={Users}
              loading={initialLoading}
              value={hasData ? report.driversWithTrips.toLocaleString('en-PH') : 'N/A'}
              description={hasData ? `${report.rows.length} drivers in filtered roster` : undefined}
            />
            <KpiStatCard
              label="On-Time Rate"
              icon={Clock}
              loading={initialLoading}
              value={hasData && report.rate != null ? `${report.rate}%` : 'N/A'}
              description={hasData ? `${report.timed} timed deliveries` : undefined}
            />
            <KpiStatCard
              label="Assigned Trips"
              icon={ArrowUpDown}
              loading={initialLoading}
              value={hasData ? report.totalTrips.toLocaleString('en-PH') : 'N/A'}
              description="Non-cancelled assignments"
            />
          </div>

          {/* Analytics Row */}
          <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card className="gap-0 rounded-xl border border-slate-200 bg-white py-0 shadow-none ring-0">
              <CardHeader className="border-b border-slate-100 px-5 py-4">
                <CardTitle className="text-base font-semibold text-slate-900">
                  On-Time Rate by Driver
                </CardTitle>
                <CardDescription className="text-xs text-slate-600">
                  Top five drivers with timed completed trips
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5">
                {initialLoading ? (
                  <Skeleton className="h-[240px] w-full rounded-lg" />
                ) : report.driverRates.length === 0 ? (
                  <ReportEmptyState
                    icon={Users}
                    title={
                      hasData
                        ? 'No drivers have timed completed trips'
                        : 'Report data is not loaded'
                    }
                    description="Timed completed deliveries with both planned ETA and arrival timestamps are required to rank driver on-time rates."
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
                  <AnalyticsBarChart
                    data={report.driverRates}
                    layout="vertical"
                    xKey="name"
                    dataKey="rate"
                    color="#0F2A52"
                    config={DRIVER_RATE_CONFIG}
                    valueDomain={[0, 100]}
                    valueFormatter={(v) => `${v}%`}
                    yAxisWidth={120}
                    className="h-[230px]"
                    tooltipFormatter={(value, _name, item) => (
                      <span className="font-mono font-medium text-slate-900 tabular-nums">
                        {value}% ({item?.payload?.timed ?? 0} timed)
                      </span>
                    )}
                    ariaLabel="Top five drivers by on-time delivery rate"
                  />
                )}
              </CardContent>
            </Card>

            <Card className="gap-0 rounded-xl border border-slate-200 bg-white py-0 shadow-none ring-0">
              <CardHeader className="flex flex-row items-start justify-between gap-2 border-b border-slate-100 px-5 py-4">
                <div>
                  <CardTitle className="text-base font-semibold text-slate-900">
                    Reported Incidents
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-600">
                    Attributed delivery incidents by category
                  </CardDescription>
                </div>
                {hasData && report.unattributedIncidents > 0 && (
                  <Badge
                    variant="outline"
                    className="shrink-0 rounded border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-[#B45309]"
                  >
                    {report.unattributedIncidents} unattributed
                  </Badge>
                )}
              </CardHeader>
              <CardContent className="p-5">
                {initialLoading ? (
                  <Skeleton className="h-[240px] w-full rounded-lg" />
                ) : report.incidents.length === 0 ? (
                  <ReportEmptyState
                    icon={ShieldAlert}
                    title={
                      hasData
                        ? 'No attributed incidents for this selection'
                        : 'Report data is not loaded'
                    }
                    description="No driver-attributed delay incidents were reported in the selected dates."
                  />
                ) : (
                  <AnalyticsBarChart
                    data={report.incidents}
                    layout="vertical"
                    xKey="label"
                    dataKey="count"
                    color="#B91C1C"
                    config={INCIDENT_CHART_CONFIG}
                    allowDecimals={false}
                    yAxisWidth={120}
                    className="h-[230px]"
                    ariaLabel="Reported incidents by category"
                  />
                )}
              </CardContent>
            </Card>
          </div>

          {/* Driver Performance Table */}
          <Card className="mt-5 gap-0 overflow-hidden rounded-xl border border-slate-200 bg-white py-0 shadow-none ring-0">
            <CardHeader className="flex flex-col justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center">
              <div>
                <CardTitle className="text-base font-semibold text-slate-900">
                  Driver Performance
                </CardTitle>
                <CardDescription className="text-xs text-slate-600">
                  Expand a driver row to inspect recorded incidents in this period
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <label
                  htmlFor="dr-status"
                  className="text-xs font-semibold text-slate-600"
                >
                  Current status
                </label>
                <select
                  id="dr-status"
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value);
                    setPage(1);
                    setExpandedId(null);
                  }}
                  className="min-h-[38px] rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[13px] font-medium text-slate-900 max-sm:min-h-[44px]"
                >
                  <option value="all">All statuses</option>
                  {DRIVER_STATUSES.map((key) => (
                    <option key={key} value={key}>
                      {key.replaceAll('_', ' ')}
                    </option>
                  ))}
                </select>
              </div>
            </CardHeader>

            <div className="overflow-x-auto">
              <Table className="min-w-[860px] text-[13px]">
                <TableHeader className="bg-slate-50">
                  <TableRow className="border-slate-200 hover:bg-slate-50">
                    <TableHead className="w-12 pl-4" aria-label="Expand" />
                    <TableHead className="text-xs font-semibold tracking-wider text-slate-600 uppercase">
                      Driver
                    </TableHead>
                    <TableHead className="text-right text-xs font-semibold tracking-wider text-slate-600 uppercase">
                      Total Trips
                    </TableHead>
                    <TableHead className="text-xs font-semibold tracking-wider text-slate-600 uppercase">
                      On-Time Rate
                    </TableHead>
                    <TableHead className="text-right text-xs font-semibold tracking-wider text-slate-600 uppercase">
                      Timed Trips
                    </TableHead>
                    <TableHead className="text-right text-xs font-semibold tracking-wider text-slate-600 uppercase">
                      Reported Incidents
                    </TableHead>
                    <TableHead className="text-right text-xs font-semibold tracking-wider text-slate-600 uppercase">
                      Recorded KM
                    </TableHead>
                    <TableHead className="pr-5 text-xs font-semibold tracking-wider text-slate-600 uppercase">
                      Status
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {initialLoading ? (
                    Array.from({ length: 5 }, (_, idx) => (
                      <TableRow key={`skel-${idx}`}>
                        {Array.from({ length: 8 }, (__, cIdx) => (
                          <TableCell key={cIdx} className="py-3.5">
                            <Skeleton className="h-4 w-full max-w-[110px] rounded" />
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
                              : 'No matching driver data for this selection'
                          }
                          description="Try resetting the driver status filter or selecting another date range."
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
                      </TableCell>
                    </TableRow>
                  ) : (
                    visibleRows.map((row) => {
                      const initials = row.name
                        .split(/\s+/)
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((p) => p[0])
                        .join('')
                        .toUpperCase();
                      const open = expandedId === row.id;
                      const toggle = () => setExpandedId(open ? null : row.id);
                      const badgeStyle =
                        DRIVER_STATUS_BADGE[row.status] ||
                        'border-slate-200 bg-slate-100 text-slate-700';

                      return (
                        <Fragment key={row.id}>
                          <TableRow
                            className={`cursor-pointer border-slate-100 ${open ? 'bg-blue-50/40 hover:bg-blue-50/50' : 'hover:bg-slate-50/80'
                              }`}
                            onClick={toggle}
                          >
                            <TableCell className="pl-4">
                              <button
                                type="button"
                                className="inline-flex size-9 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 max-sm:size-11"
                                aria-expanded={open}
                                aria-label={`${open ? 'Collapse' : 'Expand'} ${row.name}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggle();
                                }}
                              >
                                <ChevronRight
                                  className={`size-4 transition-transform duration-150 ${open ? 'rotate-90 text-[#0F2A52]' : ''
                                    }`}
                                  aria-hidden="true"
                                />
                              </button>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#0F2A52] text-[11px] font-bold text-blue-100">
                                  {initials || 'DR'}
                                </span>
                                <div className="min-w-0">
                                  <div className="font-semibold text-slate-900">
                                    {row.name}
                                  </div>
                                  <div className="text-[11px] text-slate-500 break-all">
                                    ID: {row.id}
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-semibold text-slate-900 tabular-nums">
                              {row.trips}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2.5">
                                <span className="w-11 font-semibold text-slate-900 tabular-nums">
                                  {row.rate == null ? 'N/A' : `${row.rate}%`}
                                </span>
                                <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                                  <div
                                    className="h-full rounded-full bg-[#0F2A52]"
                                    style={{ width: `${row.rate ?? 0}%` }}
                                  />
                                </div>
                              </div>
                            </TableCell>
                            <TableCell
                              className="text-right text-slate-700 tabular-nums"
                              title="Delivered trips with both arrival and ETA timestamps"
                            >
                              {row.timed}
                            </TableCell>
                            <TableCell className="text-right font-semibold text-slate-900 tabular-nums">
                              {row.incidents.length}
                            </TableCell>
                            <TableCell
                              className="text-right text-slate-600 tabular-nums"
                              title={`${row.measuredTrips} of ${row.completed} delivered trips have valid odometer readings`}
                            >
                              {row.km == null ? 'N/A' : `${row.km.toLocaleString()} km`}
                            </TableCell>
                            <TableCell className="pr-5">
                              <Badge
                                variant="outline"
                                className={`rounded px-2 py-0.5 text-[11px] font-semibold uppercase ${badgeStyle}`}
                              >
                                {row.status.replaceAll('_', ' ')}
                              </Badge>
                            </TableCell>
                          </TableRow>

                          {open && (
                            <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                              <TableCell colSpan={8} className="p-4 sm:px-8">
                                <div className="grid grid-cols-1 gap-4 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-[1fr_240px]">
                                  <div>
                                    <h3 className="m-0 mb-2.5 text-xs font-bold tracking-wider text-slate-700 uppercase">
                                      Recorded Incidents in Period
                                    </h3>
                                    {row.incidents.length === 0 ? (
                                      <p className="m-0 text-xs text-slate-600">
                                        No incidents recorded for this period.
                                      </p>
                                    ) : (
                                      <ul className="m-0 space-y-2 p-0 list-none">
                                        {row.incidents.map((item) => (
                                          <li
                                            key={item.id}
                                            className="flex flex-wrap items-center gap-2 text-xs text-slate-700"
                                          >
                                            <AlertTriangle
                                              className="size-3.5 shrink-0 text-[#B91C1C]"
                                              aria-hidden="true"
                                            />
                                            <strong className="capitalize text-slate-900">
                                              {String(item.category || 'other').replaceAll('_', ' ')}
                                            </strong>
                                            <span className="text-slate-600">
                                              {formatManilaDateTime(item.created_at)}
                                              {item.delay_minutes != null
                                                ? ` · ${item.delay_minutes} min reported delay`
                                                : ''}
                                              {' · '}
                                              <Link
                                                to={
                                                  '/shipment?tab=all&record=' +
                                                  encodeURIComponent(item.shipmentId)
                                                }
                                                className="font-semibold text-[#1D4ED8] no-underline hover:underline"
                                              >
                                                View shipment
                                              </Link>
                                            </span>
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                  <div className="flex flex-col justify-between border-t border-slate-200 pt-3 md:border-t-0 md:border-l md:pt-0 md:pl-4">
                                    <div>
                                      <h3 className="m-0 mb-2 text-xs font-bold tracking-wider text-slate-700 uppercase">
                                        Fleet
                                      </h3>
                                      <Link
                                        to="/fleet?view=drivers"
                                        className="inline-flex min-h-[36px] w-full items-center justify-center rounded-md border border-slate-300 bg-slate-50 px-3 text-xs font-semibold text-[#0F2A52] no-underline transition-colors hover:bg-slate-100"
                                      >
                                        View Drivers
                                      </Link>
                                    </div>
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {report.rows.length > 0 && (
              <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-3 text-xs text-slate-600 sm:flex-row">
                <span className="tabular-nums">
                  Showing {(currentPage - 1) * 10 + 1}-
                  {Math.min(currentPage * 10, report.rows.length)} of {report.rows.length} Drivers
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    aria-label="Previous page"
                    disabled={currentPage === 1}
                    onClick={() => setPage(currentPage - 1)}
                    className="border-slate-300 bg-white max-sm:size-11"
                  >
                    <ChevronLeft className="size-4" aria-hidden="true" />
                  </Button>
                  <span className="px-1 font-medium text-slate-700 tabular-nums">
                    Page {currentPage} of {pageCount}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    aria-label="Next page"
                    disabled={currentPage === pageCount}
                    onClick={() => setPage(currentPage + 1)}
                    className="border-slate-300 bg-white max-sm:size-11"
                  >
                    <ChevronRight className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </section>

        <ReportExportModal
          open={showExportModal && !!live.data && !live.error}
          onClose={() => setShowExportModal(false)}
          reportType="Drivers"
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
