import { Input } from "@/components/ui/input";
import { cn } from "cn";

/**
 * Reusable currency rate input with an embedded ₱ prefix, right-aligned
 * tabular numerals, and an optional trailing unit suffix (e.g. "/ km", "/ trip").
 */
export default function CurrencyRateInput({
  id,
  value,
  onChange,
  placeholder = "0.00",
  suffix,
  readOnly = false,
  disabled = false,
  isDirty = false,
  className,
  inputClassName,
  "aria-label": ariaLabel,
  ...props
}) {
  const paddingRight = suffix
    ? suffix.length > 4
      ? "pr-13"
      : "pr-11"
    : "pr-2.5";

  return (
    <div className={cn("relative inline-flex w-36 items-center", className)}>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-2.5 text-sm font-medium text-muted-foreground select-none"
      >
        ₱
      </span>

      <Input
        id={id}
        type="text"
        inputMode="decimal"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        readOnly={readOnly}
        disabled={disabled}
        aria-label={ariaLabel}
        className={cn(
          "h-9 w-full pl-7 text-right font-medium tabular-nums shadow-none",
          paddingRight,
          isDirty && !readOnly && "border-primary/60 bg-primary/[0.02]",
          readOnly &&
            "cursor-default bg-muted/40 text-muted-foreground focus-visible:border-input focus-visible:ring-0",
          inputClassName
        )}
        {...props}
      />

      {suffix && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-2.5 text-xs font-normal text-muted-foreground select-none"
        >
          {suffix}
        </span>
      )}
    </div>
  );
}
