import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Unified loading and error status banners for Reports pages.
 */
export default function ReportStatusBanner({
  loading,
  loadingText = 'Loading report…',
  error,
  hasData,
  onRetry,
}) {
  return (
    <>
      {loading && (
        <p
          role="status"
          className="mb-4 text-xs font-medium text-slate-600"
        >
          {loadingText}
        </p>
      )}
      {error && (
        <div
          role="alert"
          className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-medium text-[#B91C1C]"
        >
          <span className="flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
            <span>
              Unable to refresh the report.{' '}
              {hasData ? 'Showing the last loaded snapshot.' : 'Report data is unavailable.'}
            </span>
          </span>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={onRetry}
            className="min-h-[32px] border-red-300 bg-white text-[#B91C1C] hover:bg-red-100"
          >
            Retry
          </Button>
        </div>
      )}
    </>
  );
}
