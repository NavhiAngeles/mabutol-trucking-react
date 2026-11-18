import { Link } from 'react-router-dom';
import { Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from 'cn';

/**
 * Purposeful empty state with icon, concise reason, and optional recovery action.
 */
export default function ReportEmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  compact = false,
  className,
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/60 text-center',
        compact ? 'px-4 py-6' : 'px-6 py-10',
        className
      )}
    >
      <span
        className="mb-2.5 inline-flex size-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500"
        aria-hidden="true"
      >
        <Icon className="size-5" />
      </span>
      {title && (
        <p className="m-0 text-sm font-semibold text-slate-900">{title}</p>
      )}
      {description && (
        <p className="m-0 mt-1 max-w-sm text-xs leading-relaxed text-slate-600">
          {description}
        </p>
      )}
      {action && (
        <div className="mt-3">
          {action.to ? (
            <Link
              to={action.to}
              className="inline-flex min-h-[36px] items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-[#0F2A52] no-underline transition-colors hover:bg-slate-100"
            >
              {action.label}
            </Link>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-[36px] border-slate-300 bg-white text-xs font-semibold text-[#0F2A52] hover:bg-slate-100"
              onClick={action.onClick}
            >
              {action.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
