import { Info } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from 'cn';

const TONE_ICON_CLASS = {
  default: 'bg-slate-100 text-[#0F2A52]',
  info: 'bg-blue-50 text-[#1D4ED8]',
  warning: 'bg-amber-50 text-[#B45309]',
  danger: 'bg-red-50 text-[#B91C1C]',
  success: 'bg-emerald-50 text-[#15803D]',
};

/**
 * Structured KPI summary card with tabular-nums value, optional definition tooltip,
 * and real contextual metadata.
 */
export default function KpiStatCard({
  label,
  value,
  icon: Icon,
  description,
  meta,
  tooltip,
  tone = 'default',
  loading = false,
  className,
}) {
  return (
    <Card
      className={cn(
        'gap-0 rounded-xl border border-slate-200 bg-white py-0 shadow-none ring-0',
        className
      )}
    >
      <CardContent className="flex h-full flex-col justify-between gap-3 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-xs font-semibold tracking-wide text-slate-600 uppercase">
              {label}
            </span>
            {tooltip && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger
                    type="button"
                    aria-label={`${label} definition`}
                    className="inline-flex size-5 shrink-0 items-center justify-center rounded text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8]"
                  >
                    <Info className="size-3.5" aria-hidden="true" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
                    {tooltip}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          {Icon && (
            <span
              className={cn(
                'inline-flex size-8 shrink-0 items-center justify-center rounded-lg',
                TONE_ICON_CLASS[tone] || TONE_ICON_CLASS.default
              )}
              aria-hidden="true"
            >
              <Icon className="size-4" />
            </span>
          )}
        </div>

        <div className="min-w-0">
          {loading ? (
            <Skeleton className="h-8 w-28 rounded-md" />
          ) : (
            <div className="text-2xl font-bold tracking-tight text-slate-900 tabular-nums break-words">
              {value}
            </div>
          )}
        </div>

        {(description || meta || loading) && (
          <div className="space-y-1 text-xs leading-relaxed text-slate-600">
            {loading ? (
              <Skeleton className="h-3.5 w-3/4 rounded" />
            ) : (
              <>
                {description && <p className="m-0 text-slate-600">{description}</p>}
                {meta && <p className="m-0 font-medium text-slate-500 tabular-nums">{meta}</p>}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
