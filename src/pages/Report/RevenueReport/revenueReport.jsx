import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Banknote,
  CheckCircle2,
  Fuel,
  Receipt,
  Route,
  TrendingUp,
  Users,
  Wrench,
} from 'lucide-react';
import MainLayout from '../../../layouts/mainLayout';
import ReportTopbar from '../../../components/ReportTopbar';
import ReportExportModal from '../../../components/ReportExportModal';
import { useReportRange } from '../../../hooks/useReportRange';
import { useLiveData } from '../../../hooks/useLiveData';
import { reportRange } from '../../../services/reportOverview.js';
import { buildRevenueReport } from '../../../services/revenueReport.js';
import {
  getRevenueReportRecords,
  REVENUE_REPORT_TABLES,
} from '../../../services/revenueReportService';
import {
  formatCompactPhp,
  formatManilaDateTime,
  formatPhp,
  REPORT_PRESET_RANGES,
} from '@/lib/reportFormatters';
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
import ReportEmptyState from '@/components/reports/ReportEmptyState';
import './revenueReport.css';
import '../../../components/reportControls.css';

const EMPTY = {
  shipments: [],
  customers: [],
  payments: [],
  deliveries: [],
  expenses: [],
  fuel: [],
  maintenance: [],
};

const CHARGE_CHART_CONFIG = {
  amount: { label: 'Completed Charges', color: '#0F2A52' },
};

export default function RevenueReport() {
  const [activeRange, setActiveRange] = useState('thisMonth');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [appliedCustom, setAppliedCustom] = useState(null);
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [rangeError, setRangeError] = useState('');
  const [page, setPage] = useState(1);
  const [costPage, setCostPage] = useState(1);

  const range = useReportRange(activeRange, appliedCustom);
  const memoCallback = typeof useCallback === 'function' ? useCallback : (fn) => fn;
  const loadData = memoCallback(() => getRevenueReportRecords(range), [range.start, range.end]);
  const live = useLiveData(loadData, REVENUE_REPORT_TABLES, {
    cacheKey: `report:revenue:${range.start || 'all'}:${range.end || 'all'}`,
    staleTime: 30000,
    pollInterval: 60000,
  });

  function applyCustom() {
    try {
      setAppliedCustom(reportRange('custom', customStart, customEnd));
      setActiveRange('custom');
      setShowCustomPicker(false);
      setRangeError('');
      setPage(1);
      setCostPage(1);
    } catch (error) {
      setRangeError(error.message);
    }
  }

  const report = buildRevenueReport(live.data || EMPTY, range);
  const hasData = !!live.data;
  const initialLoading = live.loading && !hasData;
  const routes = report.routes;
  const pageCount = Math.max(1, Math.ceil(routes.length / 10));
  const currentPage = Math.min(page, pageCount);
  const visibleRoutes = routes.slice((currentPage - 1) * 10, currentPage * 10);
  const topCustomers = report.topCustomers;
  const costRecords = report.costRecords;
  const costPages = Math.max(1, Math.ceil(costRecords.length / 5));
  const currentCostPage = Math.min(costPage, costPages);
  const visibleCosts = costRecords.slice((currentCostPage - 1) * 5, currentCostPage * 5);

  const stats = [
    {
      label: 'Completed Charges',
      summary: report.charges,
      icon: Banknote,
      tooltip: 'Current completed shipments created in this period.',
    },
    {
      label: 'Verified Payments',
      summary: report.payments,
      icon: CheckCircle2,
      tooltip: 'Currently verified payments dated in this period. Excludes pending, rejected, and refunded records.',
    },
    {
      label: 'Approved Trip Expenses',
      summary: report.expenses,
      icon: Receipt,
      tooltip: 'Currently approved expenses created in this period.',
    },
    {
      label: 'Recorded Fuel Costs',
      summary: report.fuel,
      icon: Fuel,
      tooltip: 'Actual fuel purchases logged in this period. Separate from approved trip expenses.',
    },
    {
      label: 'Completed Maintenance Costs',
      summary: report.maintenance,
      icon: Wrench,
      tooltip: 'Completed service records dated in this period.',
    },
  ];

  const missing = stats.reduce((sum, item) => sum + item.summary.missing, 0);
  const warnings = [];
  if (hasData && missing > 0) {
    warnings.push({
      label: `${missing} missing/invalid amount(s) excluded (${report.charges.missing} charges)`,
      tone: 'warning',
    });
  }
  if (hasData && report.undatedPayments > 0) {
    warnings.push({
      label: `${report.undatedPayments} undated verified payment(s)`,
      tone: 'warning',
    });
  }

  return (
    <MainLayout>
      <div className="reports-page revenue-report-live min-w-0 bg-[#F8FAFC] text-slate-900">
        <ReportTopbar />

        <section className="mx-auto w-full max-w-[1600px] px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
          <ReportPageHeader
            title="Reports: Revenue"
            subtitle="Review recorded charges, payments, costs, customers, and routes."
            reportType="Revenue"
            onRefresh={live.refresh}
            onExport={() => setShowExportModal(true)}
            exportDisabled={!live.data || !!live.error}
            loading={live.loading}
          />

          <ReportRangeToolbar
            activeRange={activeRange}
            onSelectRange={(key) => {
              setActiveRange(key);
              setShowCustomPicker(false);
              setPage(1);
              setCostPage(1);
            }}
            range={range}
            customStart={customStart}
            customEnd={customEnd}
            onCustomStartChange={setCustomStart}
            onCustomEndChange={setCustomEnd}
            onApplyCustom={applyCustom}
            showCustomPicker={showCustomPicker}
            onShowCustomPickerChange={setShowCustomPicker}
            rangeError={rangeError}
            startInputId="rv-start"
            endInputId="rv-end"
          />

          <AccountingNoteDisclosure
            summary="Separate record totals (charges, verified payments, expenses, fuel, maintenance) · Net profit unavailable without reconciled costs"
            warnings={warnings}
            notes={[
              'Charges, customer rankings, and routes use shipments created in the selected dates (Asia/Manila) with current completed status.',
              'Payments use payment dates; approved expenses use creation dates; fuel logs use logged dates; maintenance uses completion dates.',
              'Fuel logs and repair expenses may overlap other cost records and are not added together. Verified payments exclude pending, rejected, and refunded records.',
            ]}
          />

          <ReportStatusBanner
            loading={live.loading}
            loadingText="Loading revenue report…"
            error={live.error}
            hasData={hasData}
            onRetry={live.refresh}
          />

          {/* 5 KPI Summary Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {stats.map((item) => (
              <KpiStatCard
                key={item.label}
                label={item.label}
                icon={item.icon}
                loading={initialLoading}
                value={hasData ? formatPhp(item.summary.amount) : 'N/A'}
                meta={
                  hasData
                    ? `${item.summary.count} records${item.summary.missing
                      ? ` · ${item.summary.missing} missing`
                      : ''
                    }`
                    : undefined
                }
                tooltip={item.tooltip}
              />
            ))}
          </div>

          {/* Trend + Recorded Costs */}
          <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-12">
            <Card className="gap-0 rounded-xl border border-slate-200 bg-white py-0 shadow-none ring-0 lg:col-span-7 xl:col-span-8">
              <CardHeader className="border-b border-slate-100 px-5 py-4">
                <CardTitle className="text-base font-semibold text-slate-900">
                  Completed Charges Over Time
                </CardTitle>
                <CardDescription className="text-xs text-slate-600 tabular-nums">
                  Average per priced completed shipment:{' '}
                  {report.averageCharge == null ? 'N/A' : formatPhp(report.averageCharge)} (missing charge amounts excluded)
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5">
                {initialLoading ? (
                  <Skeleton className="h-[260px] w-full rounded-lg" />
                ) : !report.charges.count ? (
                  <ReportEmptyState
                    icon={TrendingUp}
                    title="No completed shipments created in this period"
                    description={`No completed shipment charges were recorded between ${range.start} and ${range.end}.`}
                    action={
                      activeRange !== 'last3Months'
                        ? {
                          label: 'Switch to Last 3 Months',
                          onClick: () => {
                            setActiveRange('last3Months');
                            setPage(1);
                            setCostPage(1);
                          },
                        }
                        : undefined
                    }
                  />
                ) : (
                  <AnalyticsAreaChart
                    data={report.trend}
                    xKey="date"
                    series={[{ key: 'amount', label: 'Completed Charges', color: '#0F2A52' }]}
                    config={CHARGE_CHART_CONFIG}
                    yAxisFormatter={formatCompactPhp}
                    yAxisWidth={60}
                    tooltipFormatter={(value, _name, item) => (
                      <span className="font-mono font-medium text-slate-900 tabular-nums">
                        {formatPhp(value)} ({item?.payload?.count ?? 0} priced)
                      </span>
                    )}
                    ariaLabel="Completed shipment charges by creation date"
                  />
                )}
              </CardContent>
            </Card>

            <Card className="flex flex-col gap-0 rounded-xl border border-slate-200 bg-white py-0 shadow-none ring-0 lg:col-span-5 xl:col-span-4">
              <CardHeader className="flex flex-row items-start justify-between gap-2 border-b border-slate-100 px-5 py-4">
                <div>
                  <CardTitle className="text-base font-semibold text-slate-900">
                    Recorded Costs
                  </CardTitle>
                  <CardDescription className="mt-0.5 text-xs text-slate-600">
                    Individual fuel purchases and approved trip expenses (newest first)
                  </CardDescription>
                </div>
                <Badge
                  variant="secondary"
                  className="shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold text-slate-700 tabular-nums"
                >
                  {costRecords.length} records
                </Badge>
              </CardHeader>

              <CardContent className="flex flex-1 flex-col justify-between p-5">
                {initialLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((row) => (
                      <Skeleton key={row} className="h-24 w-full rounded-lg" />
                    ))}
                  </div>
                ) : !visibleCosts.length ? (
                  <ReportEmptyState
                    compact
                    icon={Receipt}
                    title="No costs recorded in this period"
                    description="No fuel purchases or approved trip expenses fall within the selected date range."
                    action={
                      activeRange !== 'last3Months'
                        ? {
                          label: 'Switch to Last 3 Months',
                          onClick: () => {
                            setActiveRange('last3Months');
                            setPage(1);
                            setCostPage(1);
                          },
                        }
                        : { label: 'View Shipments', to: '/shipment' }
                    }
                  />
                ) : (
                  <ol
                    className="m-0 grid list-none gap-3 p-0"
                    aria-label="Individual cost records"
                  >
                    {visibleCosts.map((record) => {
                      const isFuel = record.source === 'Fuel purchase';
                      return (
                        <li
                          key={record.id}
                          className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <Badge
                              variant="outline"
                              className={
                                isFuel
                                  ? 'rounded border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-[#1E40AF]'
                                  : 'rounded border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700'
                              }
                            >
                              {record.source}
                            </Badge>
                            <strong className="text-base font-bold text-slate-900 tabular-nums">
                              {record.amount == null
                                ? 'Amount unavailable'
                                : formatPhp(record.amount)}
                            </strong>
                          </div>

                          <p className="m-0 mt-2 text-xs font-semibold capitalize text-slate-900">
                            {record.category}
                          </p>
                          <p className="m-0 mt-0.5 text-xs text-slate-600 break-words">
                            {record.description}
                          </p>

                          {isFuel && (
                            <p className="m-0 mt-1 text-[11px] text-slate-500 tabular-nums">
                              {record.liters == null ? 'Liters unavailable' : `${record.liters} L`}
                              {' · '}
                              {record.pricePerLiter == null
                                ? 'Unit price unavailable'
                                : `${formatPhp(record.pricePerLiter)}/L`}
                              {' · '}
                              {record.odometer == null
                                ? 'Odometer unavailable'
                                : `${record.odometer} km`}
                            </p>
                          )}

                          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/80 pt-2 text-[11px] text-slate-500">
                            <span className="font-medium text-slate-600">{record.reference}</span>
                            <time dateTime={record.date} className="tabular-nums">
                              {formatManilaDateTime(record.date)}
                            </time>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}

                {costPages > 1 && (
                  <nav
                    className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3 text-xs text-slate-600"
                    aria-label="Cost record pages"
                  >
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={currentCostPage === 1}
                      onClick={() => setCostPage(currentCostPage - 1)}
                      className="min-h-[34px] border-slate-300 bg-white text-xs max-sm:min-h-[44px]"
                    >
                      Previous costs
                    </Button>
                    <span className="px-1 font-medium tabular-nums">
                      Page {currentCostPage} of {costPages}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={currentCostPage === costPages}
                      onClick={() => setCostPage(currentCostPage + 1)}
                      className="min-h-[34px] border-slate-300 bg-white text-xs max-sm:min-h-[44px]"
                    >
                      Next costs
                    </Button>
                  </nav>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Bottom Grid: Top Customers + Charges by Route */}
          <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-12">
            <Card className="gap-0 rounded-xl border border-slate-200 bg-white py-0 shadow-none ring-0 lg:col-span-4">
              <CardHeader className="flex flex-row items-start justify-between gap-2 border-b border-slate-100 px-5 py-4">
                <div>
                  <CardTitle className="text-base font-semibold text-slate-900">
                    Top Customers by Charges
                  </CardTitle>
                  <CardDescription className="mt-0.5 text-xs text-slate-600">
                    Billing customer where specified; top five by completed charges
                  </CardDescription>
                </div>
                <Link
                  to="/customer"
                  className="shrink-0 text-xs font-semibold text-[#1D4ED8] no-underline hover:underline"
                >
                  Customers
                </Link>
              </CardHeader>
              <CardContent className="p-5">
                {initialLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3, 4].map((row) => (
                      <Skeleton key={row} className="h-11 w-full rounded-lg" />
                    ))}
                  </div>
                ) : !topCustomers.length ? (
                  <ReportEmptyState
                    compact
                    icon={Users}
                    title="No customer charges for this period"
                    description="Completed shipments with recorded charges will rank customers here."
                  />
                ) : (
                  <div className="customer-list divide-y divide-slate-100">
                    {topCustomers.map((customer) => (
                      <div
                        className="customer-row flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                        key={customer.id}
                      >
                        <div className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-slate-900">
                            {customer.name}
                          </span>
                          <small className="block text-xs text-slate-500 tabular-nums">
                            {customer.priced} priced of {customer.shipments} completed shipments
                          </small>
                        </div>
                        <strong className="shrink-0 text-sm font-bold text-slate-900 tabular-nums">
                          {formatPhp(customer.revenue)}
                        </strong>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="gap-0 overflow-hidden rounded-xl border border-slate-200 bg-white py-0 shadow-none ring-0 lg:col-span-8">
              <CardHeader className="flex flex-row items-start justify-between gap-2 border-b border-slate-100 px-5 py-4">
                <div>
                  <CardTitle className="text-base font-semibold text-slate-900">
                    Charges by Route
                  </CardTitle>
                  <CardDescription className="mt-0.5 text-xs text-slate-600">
                    Exact recorded addresses. Approved expenses exclude shared costs and do not represent net margin.
                  </CardDescription>
                </div>
                <Link
                  to="/shipment"
                  className="shrink-0 text-xs font-semibold text-[#1D4ED8] no-underline hover:underline"
                >
                  Shipments
                </Link>
              </CardHeader>

              <div className="overflow-x-auto">
                <Table className="min-w-[600px] text-[13px]">
                  <TableHeader className="bg-slate-50">
                    <TableRow className="border-slate-200 hover:bg-slate-50">
                      <TableHead className="pl-5 text-xs font-semibold tracking-wider text-slate-600 uppercase">
                        Origin → Destination
                      </TableHead>
                      <TableHead className="text-right text-xs font-semibold tracking-wider text-slate-600 uppercase">
                        Completed Shipments
                      </TableHead>
                      <TableHead className="text-right text-xs font-semibold tracking-wider text-slate-600 uppercase">
                        Charges
                      </TableHead>
                      <TableHead className="pr-5 text-right text-xs font-semibold tracking-wider text-slate-600 uppercase">
                        Approved Expenses
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {initialLoading ? (
                      Array.from({ length: 5 }, (_, idx) => (
                        <TableRow key={`skel-${idx}`}>
                          {Array.from({ length: 4 }, (__, cIdx) => (
                            <TableCell key={cIdx} className="py-3.5">
                              <Skeleton className="h-4 w-full max-w-[140px] rounded" />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : !visibleRoutes.length ? (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={4} className="p-6">
                          <ReportEmptyState
                            compact
                            icon={Route}
                            title="No routes match this period"
                            description="Completed shipments in this date range will group by route here."
                          />
                        </TableCell>
                      </TableRow>
                    ) : (
                      visibleRoutes.map((route) => (
                        <TableRow key={route.id} className="border-slate-100 hover:bg-slate-50/80">
                          <TableCell className="pl-5 font-medium whitespace-normal text-slate-900">
                            {route.route}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            <span className="font-semibold text-slate-900">{route.shipments}</span>
                            <small className="block text-[11px] text-slate-500">
                              {route.priced} priced
                            </small>
                          </TableCell>
                          <TableCell className="text-right font-semibold text-slate-900 tabular-nums">
                            {formatPhp(route.revenue)}
                          </TableCell>
                          <TableCell className="pr-5 text-right text-slate-700 tabular-nums">
                            {formatPhp(route.expenses)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-3 text-xs text-slate-600 sm:flex-row">
                <span className="tabular-nums">
                  Showing {routes.length ? (currentPage - 1) * 10 + 1 : 0}–
                  {Math.min(currentPage * 10, routes.length)} of {routes.length} routes
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={currentPage === 1}
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
                    disabled={currentPage === pageCount}
                    onClick={() => setPage(currentPage + 1)}
                    className="min-h-[34px] border-slate-300 bg-white text-xs text-slate-700 max-sm:min-h-[44px]"
                  >
                    Next
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </section>

        <ReportExportModal
          open={showExportModal && !!live.data && !live.error}
          onClose={() => setShowExportModal(false)}
          reportType="Revenue"
          range={range}
          activeRangeLabel={
            REPORT_PRESET_RANGES.find(([key]) => key === activeRange)?.[1] || 'Custom Range'
          }
          reportData={{ ...report, routes, topCustomers }}
        />
      </div>
    </MainLayout>
  );
}
