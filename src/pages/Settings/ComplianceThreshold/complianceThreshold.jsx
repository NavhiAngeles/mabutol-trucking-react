import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Info,
  RotateCcw,
  ShieldAlert,
  Truck,
  UserCheck,
} from 'lucide-react';
import SettingsLayout from '../../../components/SettingsLayout';
import { useAuth } from '../../../context/AuthContext';
import { complianceThresholdApi } from '../../../services/complianceThresholdService';
import { THRESHOLD_FIELDS, DEFAULT_THRESHOLDS, validateThresholds } from '../../../services/complianceThresholds.js';
import { SkeletonBlock } from '../../../components/Skeleton/Skeleton';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import './complianceThreshold.css';

const THRESHOLD_SECTIONS = [
  {
    key: 'driver',
    title: 'Driver Documentation',
    description: 'License, medical, and clearance renewal lead times.',
    icon: UserCheck,
    fields: THRESHOLD_FIELDS.slice(0, 3),
  },
  {
    key: 'vehicle',
    title: 'Vehicle Documentation',
    description: 'Registration, permits, emissions, and maintenance schedules.',
    icon: Truck,
    fields: THRESHOLD_FIELDS.slice(3),
  },
];

function getRowValidation(rule) {
  const first = rule?.first;
  const critical = rule?.critical;
  const firstInvalid = first === '' || !Number.isInteger(first) || first < 1 || first > 365;
  const criticalInvalid = critical === '' || !Number.isInteger(critical) || critical < 0 || critical > 365;
  const orderInvalid = !firstInvalid && !criticalInvalid && critical >= first;

  let message = '';
  if (firstInvalid) {
    message = 'First Alert must be a whole number from 1 to 365 days.';
  } else if (criticalInvalid) {
    message = 'Critical Alert must be a whole number from 0 to 365 days.';
  } else if (orderInvalid) {
    message = 'Critical Alert must be fewer days than First Alert.';
  }

  return {
    firstInvalid,
    criticalInvalid: criticalInvalid || orderInvalid,
    message,
  };
}

function ThresholdInput({
  id,
  label,
  ariaLabel,
  dotClassName,
  value,
  min,
  max = 365,
  invalid,
  onChange,
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
      >
        <span className={`size-2 shrink-0 rounded-full ${dotClassName}`} aria-hidden="true" />
        <span>{label}</span>
      </label>
      <div className="relative flex items-center">
        <Input
          id={id}
          aria-label={ariaLabel}
          aria-invalid={invalid || undefined}
          type="number"
          min={min}
          max={max}
          step={1}
          required
          value={value}
          onChange={onChange}
          className={`h-9 w-28 pr-11 text-right font-semibold tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${
            invalid
              ? 'border-destructive focus-visible:border-destructive focus-visible:ring-destructive/20'
              : ''
          }`}
        />
        <span className="pointer-events-none absolute right-2.5 select-none text-xs font-medium text-muted-foreground">
          days
        </span>
      </div>
    </div>
  );
}

function ThresholdTimeline({ first, critical, invalid }) {
  const validWindow =
    Number.isInteger(first) &&
    Number.isInteger(critical) &&
    first >= 1 &&
    critical >= 0 &&
    critical < first;

  const warningPct = validWindow ? ((first - critical) / first) * 100 : 0;
  const criticalPct = validWindow ? (critical / first) * 100 : 0;

  return (
    <div className="mt-2.5 flex items-center gap-2.5" aria-hidden="true">
      <div className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        {validWindow ? (
          <>
            <div
              className="h-full bg-amber-400 transition-all duration-200"
              style={{ width: `${warningPct}%` }}
            />
            <div
              className="h-full bg-rose-500 transition-all duration-200"
              style={{ width: `${criticalPct}%` }}
            />
          </>
        ) : (
          <div className={`h-full w-full ${invalid ? 'bg-destructive/30' : 'bg-muted'}`} />
        )}
      </div>
      <span className="shrink-0 text-[11px] font-medium text-muted-foreground tabular-nums">
        {validWindow ? `${first}d → ${critical}d → 0d` : 'Invalid window'}
      </span>
    </div>
  );
}

export default function ComplianceThresholds() {
  const { user, role } = useAuth();
  return (
    <SettingsLayout>
      <ThresholdForm key={user?.id} role={role} />
    </SettingsLayout>
  );
}

function ThresholdForm({ role }) {
  const [snapshot, setSnapshot] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const operation = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    complianceThresholdApi
      .load()
      .then((value) => {
        if (!disposed) {
          setSnapshot(value);
          setForm(value.thresholds || DEFAULT_THRESHOLDS);
          setLoadError('');
        }
      })
      .catch((cause) => {
        if (!disposed) setLoadError(cause.message);
      });
    return () => {
      disposed = true;
    };
  }, [reload]);

  const dirty = Boolean(
    snapshot &&
      JSON.stringify(form) !== JSON.stringify(snapshot.thresholds || DEFAULT_THRESHOLDS)
  );

  const rowValidations = form
    ? Object.fromEntries(
        THRESHOLD_FIELDS.map(([key]) => [key, getRowValidation(form[key])])
      )
    : {};
  const hasValidationErrors = Object.values(rowValidations).some((item) => Boolean(item.message));

  function refresh() {
    if (operation.current) return;
    if (dirty && typeof window !== 'undefined' && typeof window.confirm === 'function') {
      if (!window.confirm('Discard unsaved threshold changes and reload saved values?')) return;
    }
    setSnapshot(null);
    setForm(null);
    setError('');
    setLoadError('');
    setNotice('');
    setReload((value) => value + 1);
  }

  async function submit(event) {
    event.preventDefault();
    if (operation.current || role !== 'admin') return;
    let value;
    try {
      value = validateThresholds(form);
    } catch (cause) {
      setError(cause.message);
      return;
    }
    operation.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const saved = await complianceThresholdApi.save(value, snapshot);
      if (mounted.current) {
        setSnapshot(saved);
        setForm(saved.thresholds);
        setNotice(
          'Compliance thresholds saved. Dashboard, Fleet, standalone Compliance, and Reports use these on their next refresh.'
        );
      }
    } catch (cause) {
      if (mounted.current) setError(cause.message);
    } finally {
      operation.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <section className="content compliance-threshold-settings">
      <div className="page-header">
        <div>
          <h1>Settings: Compliance Thresholds</h1>
          <p>
            Configure warning lead times for driver documents, vehicle documents, and scheduled
            maintenance.
          </p>
        </div>
      </div>

      {loadError ? (
        <div
          className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-destructive/30 bg-destructive/5 px-5 py-4 text-destructive"
          role="alert"
        >
          <div className="flex items-center gap-2.5 text-sm font-medium">
            <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
            <p className="m-0">{loadError}</p>
          </div>
          <Button type="button" variant="outline" onClick={refresh}>
            Retry loading
          </Button>
        </div>
      ) : !snapshot ? (
        <div className="space-y-4">
          <p role="status" className="text-sm text-muted-foreground">
            Loading compliance thresholds…
          </p>
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2" aria-hidden="true">
            {THRESHOLD_SECTIONS.map((section) => (
              <Card key={section.key}>
                <CardHeader className="border-b pb-4">
                  <div className="flex items-center gap-2.5">
                    <SkeletonBlock width={32} height={32} radius="md" />
                    <div className="space-y-1.5">
                      <SkeletonBlock width="160px" height={16} />
                      <SkeletonBlock width="220px" height={12} />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="divide-y divide-border">
                  {section.fields.map(([key]) => (
                    <div
                      className="flex flex-col gap-3 py-3.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                      key={key}
                    >
                      <SkeletonBlock width="150px" height={16} />
                      <div className="flex items-center gap-3">
                        <SkeletonBlock width={112} height={36} radius="md" />
                        <SkeletonBlock width={112} height={36} radius="md" />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          {/* Compact Legend & Scope Bar */}
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-xl border bg-card px-4 py-3 text-xs">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                <span className="size-2 rounded-full bg-amber-500" aria-hidden="true" />
                First Alert
              </span>
              <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden="true" />
              <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                <span className="size-2 rounded-full bg-rose-500" aria-hidden="true" />
                Critical Alert
              </span>
              <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden="true" />
              <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                <span className="size-2 rounded-full bg-slate-400" aria-hidden="true" />
                Overdue / Expired
              </span>
              <span className="text-muted-foreground">· Philippine Time (UTC+8)</span>
            </div>
            <p className="m-0 text-muted-foreground">
              Dashboard, Fleet, standalone Compliance, and Reports all consume these shared
              thresholds on refresh.
            </p>
          </div>

          {/* Contextual Notices */}
          {!snapshot.thresholds && (
            <div
              role="status"
              className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-xs leading-relaxed text-amber-900"
            >
              <Info className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden="true" />
              <p className="m-0">
                No per-document thresholds are saved. Documents currently use the existing{' '}
                {snapshot.legacyDays}-day warning window; maintenance warnings currently cover
                overdue work only. The values below are suggested settings and take effect only
                after an administrator saves them.
              </p>
            </div>
          )}

          {role !== 'admin' && (
            <div
              role="status"
              className="flex items-center gap-2.5 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-xs font-medium text-destructive"
            >
              <ShieldAlert className="size-4 shrink-0" aria-hidden="true" />
              <p className="m-0">Only administrators can edit these shared settings.</p>
            </div>
          )}

          {/* Threshold Cards */}
          <fieldset
            disabled={busy || role !== 'admin'}
            className="m-0 border-0 p-0 disabled:opacity-80"
          >
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              {THRESHOLD_SECTIONS.map((section) => {
                const Icon = section.icon;
                return (
                  <Card key={section.key} className="gap-0 py-0">
                    <CardHeader className="border-b py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                          <Icon className="size-4" aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                          <CardTitle className="text-base font-semibold">
                            {section.title}
                          </CardTitle>
                          <CardDescription className="text-xs">
                            {section.description}
                          </CardDescription>
                        </div>
                      </div>
                      <CardAction>
                        <Badge variant="secondary" className="tabular-nums">
                          {section.fields.length} items
                        </Badge>
                      </CardAction>
                    </CardHeader>

                    <CardContent className="divide-y divide-border py-2">
                      {section.fields.map(([key, label]) => {
                        const rule = form[key];
                        const validation = rowValidations[key] || {};
                        return (
                          <div key={key} className="py-3.5 first:pt-2 last:pb-2">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-foreground">
                                  {label}
                                </div>
                              </div>

                              <div className="flex shrink-0 items-end gap-3">
                                <ThresholdInput
                                  id={`${key}-first`}
                                  label="First Alert"
                                  ariaLabel={`${label} First Alert`}
                                  dotClassName="bg-amber-500"
                                  min={1}
                                  value={rule.first}
                                  invalid={validation.firstInvalid}
                                  onChange={(event) => {
                                    const raw = event.target.value;
                                    setForm((previous) => ({
                                      ...previous,
                                      [key]: {
                                        ...previous[key],
                                        first: raw === '' ? '' : Number(raw),
                                      },
                                    }));
                                    setNotice('');
                                    setError('');
                                  }}
                                />
                                <ThresholdInput
                                  id={`${key}-critical`}
                                  label="Critical Alert"
                                  ariaLabel={`${label} Critical Alert`}
                                  dotClassName="bg-rose-500"
                                  min={0}
                                  value={rule.critical}
                                  invalid={validation.criticalInvalid}
                                  onChange={(event) => {
                                    const raw = event.target.value;
                                    setForm((previous) => ({
                                      ...previous,
                                      [key]: {
                                        ...previous[key],
                                        critical: raw === '' ? '' : Number(raw),
                                      },
                                    }));
                                    setNotice('');
                                    setError('');
                                  }}
                                />
                              </div>
                            </div>

                            <ThresholdTimeline
                              first={rule.first}
                              critical={rule.critical}
                              invalid={Boolean(validation.message)}
                            />

                            {validation.message && (
                              <p
                                role="alert"
                                className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-destructive"
                              >
                                <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
                                <span>{validation.message}</span>
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </fieldset>

          {/* Action & Status Bar */}
          <div className="flex flex-col gap-3 rounded-xl border bg-card px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2.5">
              {error ? (
                <p
                  role="alert"
                  className="m-0 inline-flex items-center gap-2 text-sm font-medium text-destructive"
                >
                  <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
                  <span>{error}</span>
                </p>
              ) : notice ? (
                <p
                  role="status"
                  className="m-0 inline-flex items-center gap-2 text-sm font-medium text-emerald-700"
                >
                  <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
                  <span>{notice}</span>
                </p>
              ) : dirty ? (
                <Badge
                  variant="outline"
                  role="status"
                  className="border-amber-300 bg-amber-50 text-amber-800"
                >
                  Unsaved changes
                </Badge>
              ) : (
                <span className="text-xs text-muted-foreground">
                  Thresholds are up to date.
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2.5 sm:ml-auto">
              <Button type="button" variant="outline" disabled={busy} onClick={refresh}>
                <RotateCcw className="size-4" data-icon="inline-start" aria-hidden="true" />
                Reload Saved Values
              </Button>
              <Button
                type="submit"
                disabled={busy || role !== 'admin' || hasValidationErrors}
              >
                {busy ? 'Saving…' : 'Save Thresholds'}
              </Button>
            </div>
          </div>
        </form>
      )}
    </section>
  );
}
