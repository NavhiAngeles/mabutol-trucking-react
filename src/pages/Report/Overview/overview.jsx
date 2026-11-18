import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Banknote,
  Clock,
  Package,
  ShieldCheck,
  TrendingUp,
  Users,
} from 'lucide-react';
import MainLayout from '../../../layouts/mainLayout';
import ReportTopbar from '../../../components/ReportTopbar';
import ReportExportModal from '../../../components/ReportExportModal';
import OperationsFeed from '../../Dashboard/OperationsFeed';
import { useReportRange } from '../../../hooks/useReportRange';
import { useLiveData } from '../../../hooks/useLiveData';
import { getReportOverview, REPORT_TABLES } from '../../../services/reportOverviewService';
import { reportRange, summarizeOverview } from '../../../services/reportOverview.js';
import { formatCompactPhp, formatPhp, REPORT_PRESET_RANGES } from '@/lib/reportFormatters';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import ReportPageHeader from '@/components/reports/ReportPageHeader';
import ReportRangeToolbar from '@/components/reports/ReportRangeToolbar';
import AccountingNoteDisclosure from '@/components/reports/AccountingNoteDisclosure';
import ReportStatusBanner from '@/components/reports/ReportStatusBanner';
import KpiStatCard from '@/components/reports/KpiStatCard';
import AnalyticsAreaChart from '@/components/reports/AnalyticsAreaChart';
import AnalyticsBarChart from '@/components/reports/AnalyticsBarChart';
import AnalyticsDonutChart from '@/components/reports/AnalyticsDonutChart';
import ReportEmptyState from '@/components/reports/ReportEmptyState';
import './overview.css';
import '../../../components/reportControls.css';

const VOLUME_CHART_CONFIG = {
  completed: { label: 'Completed', color: '#0F2A52' },
  delayed: { label: 'Delayed', color: '#B45309' },
};

const REVENUE_CHART_CONFIG = {
  revenue: { label: 'Completed Charges', color: '#0F2A52' },
};

const COMPLIANCE_CHART_CONFIG = {
  verified: { label: 'Verified', color: '#15803D' },
  expiring: { label: 'Expiring Soon', color: '#B45309' },
  attention: { label: 'Missing / Expired / Rejected', color: '#B91C1C' },
  pending: { label: 'Pending Review', color: '#64748B' },
};

export default function Overview() {
  const [activeRange, setActiveRange] = useState('thisMonth');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [custom, setCustom] = useState(null);
  const [showCustom, setShowCustom] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [rangeError, setRangeError] = useState('');

  const range = useReportRange(activeRange, custom);
  const memoCallback = typeof useCallback === 'function' ? useCallback : (fn) => fn;
  const loadData = memoCallback(() => getReportOverview(range), [range.start, range.end]);
  const live = useLiveData(loadData, REPORT_TABLES);

  const report = live.data && summarizeOverview(live.data, range);
  const initialLoading = live.loading && !report;
  const percent = report?.complianceTotal
    ? Math.round((report.compliance.verified / report.complianceTotal) * 100)
    : null;

  function applyRange() {
    try {
      setCustom(reportRange('custom', customStart, customEnd));
      setActiveRange('custom');
      setShowCustom(false);
      setRangeError('');
    } catch (error) {
      setRangeError(error.message);
    }
  }

  const warnings = report?.missingAmounts
    ? [{ label: `${report.missingAmounts} missing charge amount(s) excluded`, tone: 'warning' }]
    : [];

  const complianceSlices = report
    ? [
      { key: 'verified', label: 'Verified', value: report.compliance.verified, color: '#15803D' },
      { key: 'expiring', label: 'Expiring Soon', value: report.compliance.expiring, color: '#B45309' },
      { key: 'attention', label: 'Missing / Expired / Rejected', value: report.compliance.attention, color: '#B91C1C' },
      { key: 'pending', label: 'Pending Review', value: report.compliance.pending, color: '#64748B' },
    ]
    : [];

  return (
    <MainLayout>
      <div className="reports-page min-w-0 bg-[#F8FAFC] text-slate-900">
        <ReportTopbar />

        <section className="mx-auto w-full max-w-[1600px] px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
          <ReportPageHeader
            title="Reports: Overview"
            subtitle="Track operational performance and key logistics metrics."
            reportType="Overview"
            onRefresh={live.refresh}
            onExport={() => setShowExportModal(true)}
            exportDisabled={!live.data || !!live.error}
            loading={live.loading}
          />

          <ReportRangeToolbar
            activeRange={activeRange}
            onSelectRange={(key) => {
              setActiveRange(key);
              setShowCustom(false);
            }}
            range={range}
            customStart={customStart}
            customEnd={customEnd}
            onCustomStartChange={setCustomStart}
            onCustomEndChange={setCustomEnd}
            onApplyCustom={applyRange}
            showCustomPicker={showCustom}
            onShowCustomPickerChange={setShowCustom}
            rangeError={rangeError}
            startInputId="ov-start"
            endInputId="ov-end"
          />

          <AccountingNoteDisclosure
            summary="Period metrics use shipments created in the selected Philippine time dates; fleet and compliance show current snapshot."
            warnings={warnings}
            notes={[
              'Shipments are grouped by creation date (Asia/Manila) using their current status.',
              'Completed Charges sum recorded final_amount values on completed shipments; they are not cash receipts or net profit.',
              'Compliance and Fleet Summary reflect current live records regardless of the selected date range.',
            ]}
          />

          <ReportStatusBanner
            loading={live.loading}
            loadingText="Loading report…"
            error={live.error}
            hasData={!!live.data}
            onRetry={live.refresh}
          />

          {/* KPI Summary Row */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiStatCard
              label="Total Shipments"
              icon={Package}
              loading={initialLoading}
              value={report ? report.total.toLocaleString('en-PH') : 'N/A'}
              description={
                report
                  ? `${report.completed} completed · ${report.delayed} currently delayed`
                  : undefined
              }
            />
            <KpiStatCard
              label="On-Time Rate"
              icon={Clock}
              loading={initialLoading}
              value={report ? (report.onTime == null ? 'N/A' : `${report.onTime}%`) : 'N/A'}
              description={
                report
                  ? `${report.timed} timed completed shipments`
                  : undefined
              }
              tooltip="Share of completed shipments with both planned ETA and actual arrival timestamps delivered on or before ETA."
            />
            <KpiStatCard
              label="Completed Charges"
              icon={Banknote}
              loading={initialLoading}
              value={report ? formatPhp(report.revenue) : 'N/A'}
              description="Recorded final amounts"
              meta={
                report?.missingAmounts
                  ? `${report.missingAmounts} missing amounts excluded`
                  : 'Not payments or net profit'
              }
              tooltip="Recorded final_amount on completed shipments created in this range. Excludes shipments without a recorded amount."
            />
            <KpiStatCard
              label="Current Compliance"
              icon={ShieldCheck}
              loading={initialLoading}
              value={report ? (percent == null ? 'N/A' : `${percent}%`) : 'N/A'}
              description={
                report
                  ? `${report.compliance.verified} of ${report.complianceTotal} drivers and vehicles verified`
                  : undefined
              }
              tone={percent != null && percent < 80 ? 'warning' : 'default'}
            />
          </div>

          {/* Primary Charts */}
          <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card className="gap-0 rounded-xl border border-slate-200 bg-white py-0 shadow-none ring-0">
              <CardHeader className="border-b border-slate-100 px-5 py-4">
                <CardTitle className="text-base font-semibold text-slate-900">
                  Shipment Volume
                </CardTitle>
                <CardDescription className="text-xs text-slate-600">
                  Completed and currently delayed shipments by creation date
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5">
                {initialLoading ? (
                  <Skeleton className="h-[250px] w-full rounded-lg" />
                ) : !report?.total ? (
                  <ReportEmptyState
                    icon={Package}
                    title="No shipments created in this period"
                    description={`No shipment records fall between ${range.start} and ${range.end}.`}
                    action={
                      activeRange !== 'last3Months'
                        ? { label: 'View Last 3 Months', onClick: () => setActiveRange('last3Months') }
                        : undefined
                    }
                  />
                ) : (
                  <AnalyticsAreaChart
                    data={report.buckets}
                    xKey="date"
                    series={[
                      { key: 'completed', label: 'Completed', color: '#0F2A52' },
                      { key: 'delayed', label: 'Delayed', color: '#B45309', strokeDasharray: '4 4' },
                    ]}
                    config={VOLUME_CHART_CONFIG}
                    allowDecimals={false}
                    yAxisWidth={36}
                    showLegend
                    ariaLabel="Completed and currently delayed shipments by creation date"
                  />
                )}
              </CardContent>
            </Card>

            <Card className="gap-0 rounded-xl border border-slate-200 bg-white py-0 shadow-none ring-0">
              <CardHeader className="border-b border-slate-100 px-5 py-4">
                <CardTitle className="text-base font-semibold text-slate-900">
                  Completed Shipment Charges
                </CardTitle>
                <CardDescription className="text-xs text-slate-600">
                  Recorded final amounts by creation date (no revenue target configured)
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5">
                {initialLoading ? (
                  <Skeleton className="h-[250px] w-full rounded-lg" />
                ) : !report?.total ? (
                  <ReportEmptyState
                    icon={TrendingUp}
                    title="No shipment charges in this period"
                    description="Completed shipment charges will appear here once shipments are created and completed."
                    action={
                      activeRange !== 'last3Months'
                        ? { label: 'View Last 3 Months', onClick: () => setActiveRange('last3Months') }
                        : undefined
                    }
                  />
                ) : (
                  <AnalyticsBarChart
                    data={report.buckets}
                    xKey="date"
                    dataKey="revenue"
                    color="#0F2A52"
                    config={REVENUE_CHART_CONFIG}
                    valueFormatter={formatCompactPhp}
                    yAxisWidth={60}
                    tooltipFormatter={(value) => (
                      <span className="font-mono font-medium text-slate-900 tabular-nums">
                        {formatPhp(value)}
                      </span>
                    )}
                    ariaLabel="Completed shipment charges by creation date"
                  />
                )}
              </CardContent>
            </Card>
          </div>

          {/* Operational Breakdowns */}
          <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-3">
            {/* Top Performing Drivers */}
            <Card className="gap-0 rounded-xl border border-slate-200 bg-white py-0 shadow-none ring-0 xl:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 px-5 py-4">
                <div>
                  <CardTitle className="text-base font-semibold text-slate-900">
                    Top Performing Drivers
                  </CardTitle>
                  <CardDescription className="mt-0.5 text-xs text-slate-600">
                    On-time share of completed shipments with recorded arrival times in this cohort
                  </CardDescription>
                </div>
                <Link
                  to="/fleet?view=drivers"
                  className="shrink-0 text-xs font-semibold text-[#1D4ED8] no-underline hover:underline"
                >
                  View Fleet
                </Link>
              </CardHeader>
              <CardContent className="p-5">
                {initialLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((row) => (
                      <Skeleton key={row} className="h-12 w-full rounded-lg" />
                    ))}
                  </div>
                ) : !report?.drivers?.length ? (
                  <ReportEmptyState
                    compact
                    icon={Users}
                    title="No eligible driver performance records"
                    description="Drivers appear here once they complete timed deliveries in the selected period."
                  />
                ) : (
                  <ul className="m-0 divide-y divide-slate-100 p-0 list-none">
                    {report.drivers.map((d) => (
                      <li
                        key={d.id}
                        className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-blue-200 bg-[#E8EEF8] text-xs font-bold text-[#0F2A52]">
                            {d.full_name.slice(0, 2).toUpperCase()}
                          </span>
                          <div className="min-w-0">
                            <p className="m-0 truncate text-sm font-semibold text-slate-900">
                              {d.full_name}
                            </p>
                            <p className="m-0 text-xs text-slate-500 tabular-nums">
                              {d.trips} timed completed shipments
                            </p>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <span className="block text-sm font-bold text-slate-900 tabular-nums">
                            {d.pct}%
                          </span>
                          <span className="text-[11px] font-medium tracking-wide text-slate-500 uppercase">
                            On-Time
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Current Compliance */}
            <Card className="gap-0 rounded-xl border border-slate-200 bg-white py-0 shadow-none ring-0">
              <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 px-5 py-4">
                <div>
                  <CardTitle className="text-base font-semibold text-slate-900">
                    Current Compliance
                  </CardTitle>
                  <CardDescription className="mt-0.5 text-xs text-slate-600">
                    Drivers and vehicles including missing documents
                  </CardDescription>
                </div>
                <Link
                  to="/fleet?view=compliance"
                  className="shrink-0 text-xs font-semibold text-[#1D4ED8] no-underline hover:underline"
                >
                  View Compliance
                </Link>
              </CardHeader>
              <CardContent className="p-5">
                {initialLoading ? (
                  <Skeleton className="mx-auto h-[220px] w-full rounded-lg" />
                ) : (
                  <AnalyticsDonutChart
                    data={complianceSlices}
                    config={COMPLIANCE_CHART_CONFIG}
                    centerValue={percent == null ? 'N/A' : `${percent}%`}
                    centerLabel="Compliant"
                    legendColumns={1}
                    ariaLabel={`Current compliance: ${percent == null ? 'N/A' : `${percent}%`}`}
                  />
                )}
              </CardContent>
            </Card>

            {/* Current Fleet Summary */}
            <Card className="gap-0 rounded-xl border border-slate-200 bg-white py-0 shadow-none ring-0 xl:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 px-5 py-4">
                <CardTitle className="text-base font-semibold text-slate-900">
                  Current Fleet Summary
                </CardTitle>
                <Link
                  to="/fleet"
                  className="shrink-0 text-xs font-semibold text-[#1D4ED8] no-underline hover:underline"
                >
                  Manage Fleet
                </Link>
              </CardHeader>
              <CardContent className="p-5">
                {initialLoading ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {[1, 2, 3, 4, 5, 6].map((tile) => (
                      <Skeleton key={tile} className="h-20 w-full rounded-lg" />
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {[
                      ['Total Fleet', live.data?.resources?.total ?? 0, false],
                      ['Dispatch Ready', live.data?.resources?.available ?? 0, false],
                      ['On Trip / Reserved', live.data?.resources?.inUse ?? 0, false],
                      ['Maintenance', live.data?.resources?.maintenance ?? 0, false],
                      ['Other', live.data?.resources?.other ?? 0, false],
                      ['Overdue Service Records', live.data?.overdue ?? 0, (live.data?.overdue ?? 0) > 0],
                    ].map(([label, value, highlight]) => (
                      <div
                        key={label}
                        className={
                          highlight
                            ? 'flex flex-col justify-between rounded-lg border border-amber-200 bg-amber-50/70 p-3.5'
                            : 'flex flex-col justify-between rounded-lg border border-slate-200 bg-slate-50/70 p-3.5'
                        }
                      >
                        <span
                          className={
                            highlight
                              ? 'text-[11px] font-semibold tracking-wide text-[#B45309] uppercase'
                              : 'text-[11px] font-semibold tracking-wide text-slate-600 uppercase'
                          }
                        >
                          {label}
                        </span>
                        <strong
                          className={
                            highlight
                              ? 'mt-2 text-2xl font-bold text-[#B45309] tabular-nums'
                              : 'mt-2 text-2xl font-bold text-slate-900 tabular-nums'
                          }
                        >
                          {value}
                        </strong>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Operations Feed (mounted directly without a redundant outer card wrapper) */}
            <div className="min-w-0">
              <OperationsFeed />
            </div>
          </div>
        </section>

        <ReportExportModal
          open={showExportModal && !!live.data && !live.error}
          onClose={() => setShowExportModal(false)}
          reportType="Overview"
          range={range}
          activeRangeLabel={
            REPORT_PRESET_RANGES.find(([key]) => key === activeRange)?.[1] || 'Custom Range'
          }
          reportData={
            report
              ? {
                ...report,
                fleet: live.data.resources,
                overdueServiceRecords: live.data.overdue,
              }
              : null
          }
        />
      </div>
    </MainLayout>
  );
}
