import { RefreshCw, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ReportSchedule from '@/components/ReportSchedule';

/**
 * Shared header for all Reports routes (title, subtitle, Refresh, Export Report, Schedule).
 */
export default function ReportPageHeader({
  title,
  subtitle,
  reportType,
  onRefresh,
  onExport,
  exportDisabled = false,
  loading = false,
}) {
  return (
    <div className="mb-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
      <div className="min-w-0">
        <h1 className="m-0 text-[clamp(1.375rem,1.8vw,1.625rem)] leading-tight font-bold tracking-tight text-slate-900">
          {title}
        </h1>
        {subtitle && (
          <p className="m-0 mt-1 text-sm text-slate-600">{subtitle}</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <Button
          type="button"
          variant="outline"
          onClick={onRefresh}
          disabled={loading}
          className="min-h-[40px] border-slate-300 bg-white px-3.5 text-[13px] font-semibold text-slate-900 hover:bg-slate-100 max-sm:min-h-[44px] max-sm:flex-1"
        >
          <RefreshCw
            className={`size-3.5 ${loading ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
          Refresh
        </Button>

        <Button
          type="button"
          disabled={exportDisabled}
          onClick={onExport}
          className="report-export-main min-h-[40px] bg-[#0F2A52] px-4 text-[13px] font-semibold text-white hover:bg-[#0B1F3D] max-sm:min-h-[44px] max-sm:flex-1"
        >
          <Download className="size-3.5" aria-hidden="true" />
          Export Report
        </Button>

        <ReportSchedule type={reportType} />
      </div>
    </div>
  );
}
