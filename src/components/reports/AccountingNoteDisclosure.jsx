import { useState } from 'react';
import { ChevronDown, Info } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { cn } from 'cn';

/**
 * Collapsible scope and accounting rules disclosure so primary KPIs and charts stay above the fold.
 */
export default function AccountingNoteDisclosure({
  summary = 'Philippine time (Asia/Manila) cohort rules',
  notes = [],
  warnings = [],
  defaultOpen = false,
  className,
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={cn(
        'mb-5 rounded-lg border border-slate-200 bg-white',
        className
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <Info className="size-4 shrink-0 text-[#1D4ED8]" aria-hidden="true" />
          <span className="text-xs font-medium text-slate-700">{summary}</span>
          {warnings.map((warning) => (
            <Badge
              key={warning.label}
              variant="outline"
              role="status"
              className={cn(
                'rounded px-2 py-0.5 text-[11px] font-semibold',
                warning.tone === 'danger'
                  ? 'border-red-200 bg-red-50 text-[#B91C1C]'
                  : 'border-amber-200 bg-amber-50 text-[#B45309]'
              )}
            >
              {warning.label}
            </Badge>
          ))}
        </div>

        <CollapsibleTrigger
          type="button"
          className="inline-flex min-h-[32px] items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold text-[#0F2A52] transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8]"
        >
          <span>{open ? 'Hide rules' : 'Accounting & scope rules'}</span>
          <ChevronDown
            className={cn(
              'size-3.5 transition-transform duration-150',
              open && 'rotate-180'
            )}
            aria-hidden="true"
          />
        </CollapsibleTrigger>
      </div>

      <CollapsibleContent className="border-t border-slate-100 px-3.5 py-3">
        <ul className="m-0 list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-slate-600">
          {notes.map((note, idx) => (
            <li key={idx}>{note}</li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
