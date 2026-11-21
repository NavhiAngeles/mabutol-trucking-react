import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  Info,
  RefreshCw,
} from 'lucide-react';
import SettingsLayout from '../../../components/SettingsLayout';
import { useAuth } from '../../../context/AuthContext';
import { notificationPreferencesApi } from '../../../services/notificationPreferencesService';
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
import './notification.css';

const GROUPS = [
  ['Shipment Alerts', [
    ['shipment_status', 'Status Changes', 'Shipment lifecycle updates, including pickup and cancellation notices.'],
    ['delay', 'Delays & Incidents', 'Shipment delays and reported delivery incidents.'],
    ['booking_confirmed', 'Booking Confirmations', 'Confirmation notices for bookings associated with your account.'],
  ]],
  ['Fleet & Compliance', [
    ['assignment', 'Trip Assignments', 'Assignment notices sent to your account.'],
    ['compliance_expiry', 'Compliance & Maintenance Expiry', 'Receive compliance document, permit expiry, and scheduled maintenance notices when generated. Separate warning and critical filters are not available.'],
  ]],
  ['Other Notifications', [
    ['payment', 'Payments', 'Payment notices when generated.'],
    ['message', 'Messages', 'Message notices when generated.'],
    ['system', 'System Notices', 'System notices when generated.'],
  ]],
];

export default function Notifications() {
  const { user } = useAuth();
  return <SettingsLayout><NotificationPreferences key={user?.id} /></SettingsLayout>;
}

function NotificationPreferences() {
  const [snapshot, setSnapshot] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);
  const [saving, setSaving] = useState(null);
  const [saveError, setSaveError] = useState('');
  const [notice, setNotice] = useState('');
  const [failed, setFailed] = useState(null);
  const operation = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let disposed = false;
    notificationPreferencesApi.load().then(value => {
      if (!disposed) { setSnapshot(value); setLoadError(''); }
    }).catch(error => { if (!disposed) setLoadError(error.message); });
    return () => { disposed = true; };
  }, [reload]);

  function refresh() {
    if (operation.current) return;
    setSnapshot(null); setLoadError(''); setSaveError(''); setFailed(null); setNotice('');
    setReload(value => value + 1);
  }

  async function save(type, enabled) {
    if (operation.current || !snapshot) return;
    operation.current = true; setSaving(type); setSaveError(''); setNotice(''); setFailed(null);
    try {
      const confirmed = await notificationPreferencesApi.save(snapshot.userId, type, enabled);
      if (mounted.current) {
        setSnapshot(previous => ({ ...previous, preferences: { ...previous.preferences, [type]: confirmed } }));
        setNotice('Preference saved. Applies to future in-app notifications.');
      }
    } catch (error) {
      if (mounted.current) { setSaveError(error.message); setFailed({ type, enabled }); }
    } finally { operation.current = false; if (mounted.current) setSaving(null); }
  }

  return (
    <section className="content notification-settings space-y-6">
      <div className="page-header flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Settings: Notifications
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose which future in-app notifications your account receives. Changes save automatically.
          </p>
        </div>
        {snapshot && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="notification-refresh self-start sm:self-auto"
            disabled={!!saving}
            onClick={refresh}
          >
            <RefreshCw className="size-3.5" data-icon="inline-start" aria-hidden="true" />
            Reload preferences
          </Button>
        )}
      </div>

      <p className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
        These preferences do not remove existing notifications or hide operational warnings on the Dashboard and Fleet pages. Enabling a category does not create new alert monitors.
      </p>

      {notice && (
        <div
          role="status"
          className="notification-success flex items-center gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900"
        >
          <CheckCircle2 className="size-4 shrink-0 text-emerald-700" aria-hidden="true" />
          <span>{notice}</span>
        </div>
      )}

      {saveError && (
        <div
          role="alert"
          className="notification-error flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
            <p className="m-0 font-medium">{saveError}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!!saving}
              onClick={() => save(failed.type, failed.enabled)}
            >
              Retry save
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!!saving}
              onClick={refresh}
            >
              Reload preferences
            </Button>
          </div>
        </div>
      )}

      {loadError ? (
        <div
          role="alert"
          className="notification-error flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
            <p className="m-0 font-medium">{loadError}</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={refresh}>
            Retry loading
          </Button>
        </div>
      ) : !snapshot ? (
        <>
          <p role="status" className="text-sm text-muted-foreground">
            Loading notification preferences…
          </p>
          <div className="notification-grid" aria-hidden="true">
            {['Delivery Channels', 'Shipment Alerts', 'Fleet & Compliance', 'Other Notifications'].map((title) => (
              <Card className="settings-card bg-white ring-border" key={title}>
                <CardHeader className="border-b border-border/60 pb-4">
                  <CardTitle>{title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 pt-4">
                  {[0, 1, 2].map((rowIdx) => (
                    <div className="tanaw-skeleton-toggle-row" key={`${title}-${rowIdx}`}>
                      <div className="tanaw-skeleton-stack">
                        <Skeleton className="h-3.5 w-2/5" />
                        <Skeleton className="h-3 w-4/5" />
                      </div>
                      <Skeleton className="h-6 w-12 rounded-full" />
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      ) : (
        <div className="notification-grid">
          <Card className="settings-card bg-white ring-border">
            <CardHeader className="border-b border-border/60 pb-4">
              <div className="flex items-center gap-2">
                <Bell className="size-4 text-muted-foreground" aria-hidden="true" />
                <CardTitle>Delivery Channels</CardTitle>
              </div>
              <CardDescription>Active notification channel for this account.</CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="toggle-row">
                <div>
                  <strong className="text-sm font-semibold text-foreground">In-app Notifications</strong>
                  <p className="text-xs text-muted-foreground">Available through the notification bell. Choose categories below.</p>
                </div>
                <Badge variant="secondary" className="rounded-sm bg-emerald-50 text-emerald-800 border border-emerald-200">
                  Available
                </Badge>
              </div>
            </CardContent>
          </Card>

          {GROUPS.map(([title, items]) => (
            <Card className="settings-card bg-white ring-border" key={title}>
              <CardHeader className="border-b border-border/60 pb-4">
                <CardTitle>{title}</CardTitle>
              </CardHeader>
              <CardContent className="pt-2">
                {items.map(([type, label, description]) => (
                  <div className="toggle-row" key={type}>
                    <div>
                      <strong className="text-sm font-semibold text-foreground">{label}</strong>
                      <p className="text-xs text-muted-foreground">{description}</p>
                      {saving === type && (
                        <span role="status" className="mt-1 inline-block text-xs font-medium text-muted-foreground">
                          Saving…
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-label={label}
                      aria-checked={snapshot.preferences[type]}
                      disabled={!!saving}
                      className={`toggle ${snapshot.preferences[type] ? 'active' : 'inactive'}`}
                      onClick={() => save(type, !snapshot.preferences[type])}
                    >
                      <span className="toggle-circle" />
                    </button>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}

          <Card className="settings-card bg-white ring-border">
            <CardHeader className="border-b border-border/60 pb-4">
              <div className="flex items-center gap-2">
                <Info className="size-4 text-muted-foreground" aria-hidden="true" />
                <CardTitle>Additional Alerts</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <p className="text-sm leading-relaxed text-muted-foreground">
                Off-route, cold-chain temperature and live tracking alerts are not connected to notification delivery. Maintenance and compliance notices are managed under Fleet &amp; Compliance. Their separate controls are unavailable.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </section>
  );
}
