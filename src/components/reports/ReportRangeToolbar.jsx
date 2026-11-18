import { Calendar, ChevronDown } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { REPORT_PRESET_RANGES } from '@/lib/reportFormatters';
import { cn } from 'cn';

/**
 * Shared date-range preset bar + accessible Custom Range popover + active Philippine time pill.
 */
export default function ReportRangeToolbar({
  activeRange,
  onSelectRange,
  range,
  customStart,
  customEnd,
  onCustomStartChange,
  onCustomEndChange,
  onApplyCustom,
  showCustomPicker,
  onShowCustomPickerChange,
  rangeError,
  startInputId = 'report-start-date',
  endInputId = 'report-end-date',
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div
        className="flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 bg-white p-1"
        role="group"
        aria-label="Report date range presets"
      >
        {REPORT_PRESET_RANGES.map(([key, label]) => {
          const active = activeRange === key;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => onSelectRange(key)}
              className={cn(
                'inline-flex min-h-[34px] items-center rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors max-sm:min-h-[44px]',
                active
                  ? 'bg-[#0F2A52] font-semibold text-white'
                  : 'bg-transparent text-slate-700 hover:bg-slate-100 hover:text-slate-900'
              )}
            >
              {label}
            </button>
          );
        })}

        <Popover open={showCustomPicker} onOpenChange={onShowCustomPickerChange}>
          <PopoverTrigger
            type="button"
            aria-pressed={activeRange === 'custom'}
            aria-expanded={showCustomPicker}
            className={cn(
              'inline-flex min-h-[34px] items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors max-sm:min-h-[44px]',
              activeRange === 'custom'
                ? 'bg-[#0F2A52] font-semibold text-white'
                : 'bg-transparent text-slate-700 hover:bg-slate-100 hover:text-slate-900'
            )}
          >
            <span>Custom Range</span>
            <ChevronDown className="size-3.5" aria-hidden="true" />
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-3.5">
            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                onApplyCustom();
              }}
            >
              <div className="flex flex-col gap-1">
                <label
                  htmlFor={startInputId}
                  className="text-xs font-semibold text-slate-700"
                >
                  Start date
                </label>
                <input
                  id={startInputId}
                  type="date"
                  value={customStart}
                  onChange={(e) => onCustomStartChange(e.target.value)}
                  className="min-h-[38px] rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[13px] text-slate-900"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label
                  htmlFor={endInputId}
                  className="text-xs font-semibold text-slate-700"
                >
                  End date
                </label>
                <input
                  id={endInputId}
                  type="date"
                  value={customEnd}
                  min={customStart || undefined}
                  onChange={(e) => onCustomEndChange(e.target.value)}
                  className="min-h-[38px] rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[13px] text-slate-900"
                />
              </div>

              {rangeError && (
                <p role="alert" className="m-0 text-xs font-medium text-[#B91C1C]">
                  {rangeError}
                </p>
              )}

              <Button
                type="submit"
                className="min-h-[38px] w-full bg-[#0F2A52] text-[13px] font-semibold text-white hover:bg-[#0B1F3D]"
              >
                Apply
              </Button>
            </form>
          </PopoverContent>
        </Popover>
      </div>

      <div className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 tabular-nums">
        <Calendar className="size-3.5 text-slate-500" aria-hidden="true" />
        <span>
          {range.start} – {range.end} · Philippine time
        </span>
      </div>
    </div>
  );
}
