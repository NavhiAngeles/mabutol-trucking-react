import { useEffect, useRef, useState } from 'react';
import {
  Check,
  Copy,
  KeyRound,
  Laptop,
  LogOut,
  MapPin,
  Pencil,
  ShieldCheck,
  Smartphone,
  Tablet,
  X,
} from 'lucide-react';
import SettingsLayout from '../../../components/SettingsLayout';
import { useAuth } from '../../../context/AuthContext';
import { accountApi } from '../../../services/accountService';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import './account.css';
import '../../../components/accountSecurityDesign.css';

const dateLabel = value => (
  value
    ? new Date(value).toLocaleString('en-PH', {
        timeZone: 'Asia/Manila',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'Not recorded'
);

function DeviceIcon({ type }) {
  if (type === 'mobile') return <Smartphone className="size-4 text-muted-foreground" aria-hidden="true" />;
  if (type === 'tablet') return <Tablet className="size-4 text-muted-foreground" aria-hidden="true" />;
  return <Laptop className="size-4 text-muted-foreground" aria-hidden="true" />;
}

export default function Account() {
  const { user } = useAuth();
  return <SettingsLayout><AccountDetails key={user?.id} /></SettingsLayout>;
}

function AccountDetails() {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [modal, setModal] = useState(null);
  const [targetSession, setTargetSession] = useState(null);
  const [form, setForm] = useState({ fullName: '', contact: '' });
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [success, setSuccess] = useState('');
  const [copiedId, setCopiedId] = useState(false);
  const operation = useRef(false);
  const mounted = useRef(true);
  const modalRef = useRef(null);
  const previousFocusRef = useRef(null);
  const copyTimerRef = useRef(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    const load = () => accountApi.load().then(value => {
      if (!disposed) { setProfile(value); setError(''); }
    }).catch(cause => { if (!disposed) setError(cause.message); });
    load();
    // Refresh signed photo URLs and recover changes made in another tab.
    const timer = setInterval(load, 30 * 60 * 1000);
    window.addEventListener('focus', load);
    return () => { disposed = true; clearInterval(timer); window.removeEventListener('focus', load); };
  }, [reload]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function restoreFocus() {
    const prev = previousFocusRef.current;
    previousFocusRef.current = null;
    if (prev && typeof prev.focus === 'function') {
      prev.focus();
    }
  }

  function open(kind, session = null) {
    previousFocusRef.current = typeof document !== 'undefined' ? document.activeElement : null;
    setForm({ fullName: profile.full_name || '', contact: profile.phone || '' });
    setFile(null);
    setPreview(null);
    setPasswords({ current: '', next: '', confirm: '' });
    setTargetSession(session);
    setActionError('');
    setSuccess('');
    setModal(kind);
  }

  function close() {
    if (operation.current) return;
    setModal(null);
    setTargetSession(null);
    setFile(null);
    setPreview(null);
    setPasswords({ current: '', next: '', confirm: '' });
    setActionError('');
    restoreFocus();
  }

  useEffect(() => {
    if (!modal || typeof document === 'undefined') return;
    const dialog = modalRef.current;
    if (dialog) {
      const firstFocusable = dialog.querySelector?.('input:not([readonly]):not([disabled]), button:not([disabled])');
      if (firstFocusable && typeof firstFocusable.focus === 'function') {
        firstFocusable.focus();
      } else if (typeof dialog.focus === 'function') {
        dialog.focus();
      }
    }
    const onKeyDown = event => {
      if (event.key === 'Escape' && !operation.current) {
        event.preventDefault();
        setModal(null);
        setTargetSession(null);
        setFile(null);
        setPreview(null);
        setPasswords({ current: '', next: '', confirm: '' });
        setActionError('');
        restoreFocus();
      } else if (event.key === 'Tab' && dialog) {
        const focusable = Array.from(
          dialog.querySelectorAll?.(
            'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          ) || []
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey) {
          if (document.activeElement === first || !dialog.contains?.(document.activeElement)) {
            event.preventDefault();
            last.focus?.();
          }
        } else if (document.activeElement === last || !dialog.contains?.(document.activeElement)) {
          event.preventDefault();
          first.focus?.();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [modal]);

  async function handleCopyAccountId() {
    if (!profile?.id) return;
    try {
      await navigator.clipboard?.writeText(profile.id);
      if (mounted.current) {
        setCopiedId(true);
        if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
        copyTimerRef.current = setTimeout(() => {
          if (mounted.current) setCopiedId(false);
        }, 2000);
      }
    } catch {
      // Ignore clipboard permission errors
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (operation.current) return;
    if (modal === 'password' && passwords.next !== passwords.confirm) {
      setActionError('Passwords do not match.');
      return;
    }
    operation.current = true;
    setBusy(true);
    setActionError('');
    try {
      if (modal === 'profile') {
        const saved = await accountApi.save(form, file, profile.updated_at);
        if (mounted.current) {
          setProfile(prev => ({
            ...prev,
            ...saved,
            sessions: saved.sessions ?? prev?.sessions,
            currentSession: saved.currentSession ?? prev?.currentSession,
          }));
        }
      } else if (modal === 'password') {
        await accountApi.changePassword(passwords.current, passwords.next);
      } else if (modal === 'revoke-one' && targetSession) {
        const res = await accountApi.revokeSession(targetSession.id);
        if (mounted.current && res?.sessions) {
          setProfile(prev => ({ ...prev, sessions: res.sessions }));
        }
      } else {
        const res = await accountApi.revokeOthers();
        if (mounted.current && res?.sessions) {
          setProfile(prev => ({ ...prev, sessions: res.sessions }));
        }
      }
      if (mounted.current) {
        setSuccess(
          modal === 'profile'
            ? 'Profile saved.'
            : modal === 'password'
              ? 'Password updated.'
              : modal === 'revoke-one'
                ? 'Device session removed.'
                : 'Other sessions revoked. Existing access may continue until their access tokens expire.'
        );
        setModal(null);
        setTargetSession(null);
        setFile(null);
        setPreview(null);
        setPasswords({ current: '', next: '', confirm: '' });
        restoreFocus();
      }
    } catch (cause) {
      if (mounted.current) setActionError(cause.message);
    } finally {
      operation.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  if (!profile) {
    return (
      <section className="content account-settings">
        <div className="page-header">
          <div>
            <h1>Settings: Account</h1>
            <p>Manage your personal details and account security.</p>
          </div>
        </div>
        {error ? (
          <div role="alert" className="flex items-center justify-between gap-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={() => setReload(value => value + 1)}>Retry</Button>
          </div>
        ) : (
          <>
            <p role="status" className="sr-only">Loading account…</p>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start" aria-hidden="true">
              <div className="flex flex-col gap-6 lg:col-span-7">
                <Card>
                  <CardHeader>
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-4 w-56" />
                    <CardAction><Skeleton className="h-8 w-28" /></CardAction>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="flex items-center gap-4">
                      <Skeleton className="size-16 rounded-full" />
                      <div className="space-y-2">
                        <Skeleton className="h-5 w-44" />
                        <Skeleton className="h-4 w-52" />
                        <Skeleton className="h-5 w-16 rounded-full" />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-4 border-t border-border pt-4 sm:grid-cols-2">
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full sm:col-span-2" />
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="h-4 w-64" />
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-8 w-40" />
                  </CardContent>
                </Card>
              </div>
              <div className="flex flex-col gap-6 lg:col-span-5">
                <Card>
                  <CardHeader>
                    <Skeleton className="h-5 w-36" />
                    <Skeleton className="h-4 w-48" />
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Skeleton className="h-20 w-full rounded-lg" />
                    <Skeleton className="h-16 w-full rounded-lg" />
                    <Skeleton className="h-9 w-full rounded-lg" />
                  </CardContent>
                </Card>
              </div>
            </div>
          </>
        )}
      </section>
    );
  }

  const initials = (profile.full_name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join('')
    .toUpperCase() || '?';

  const sessions = Array.isArray(profile.sessions) ? profile.sessions : [];
  const currentSession = profile.currentSession || sessions.find(item => item.isCurrent) || sessions[0] || null;
  const otherSessionsCount = sessions.filter(item => !item.isCurrent).length;

  return (
    <section className="content account-settings">
      <div className="page-header">
        <div>
          <h1>Settings: Account</h1>
          <p>Manage your personal details and account security.</p>
        </div>
      </div>

      {error && (
        <div role="alert" className="mb-5 flex items-center justify-between gap-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={() => setReload(value => value + 1)}>Retry</Button>
        </div>
      )}

      {success && (
        <div role="status" className="mb-5 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <ShieldCheck className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />
          <span>{success}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-7">
          <Card className="bg-white ring-border">
            <CardHeader className="border-b border-border/60 pb-4">
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>Your office identity and contact details.</CardDescription>
              <CardAction>
                <Button onClick={() => open('profile')}>
                  <Pencil className="size-3.5" data-icon="inline-start" aria-hidden="true" />
                  Edit Profile
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="space-y-6 pt-2">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-lg font-semibold text-slate-800 ring-1 ring-border">
                  {profile.photo ? (
                    <img
                      src={profile.photo}
                      alt="Your profile"
                      width="64"
                      height="64"
                      className="size-full object-cover"
                    />
                  ) : (
                    initials
                  )}
                </div>
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-base font-semibold text-foreground">
                      {profile.full_name || 'Not set'}
                    </h2>
                    <Badge variant="secondary" className="capitalize">
                      {profile.role}
                    </Badge>
                  </div>
                  <p className="truncate text-sm text-muted-foreground">{profile.email}</p>
                  <p className="text-xs text-muted-foreground">Contact support to change your email.</p>
                </div>
              </div>

              <dl className="grid grid-cols-1 gap-4 border-t border-border/70 pt-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Contact Number
                  </dt>
                  <dd className="text-sm font-medium text-foreground tabular-nums">
                    {profile.phone || 'Not set'}
                  </dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Member Since
                  </dt>
                  <dd className="text-sm font-medium text-foreground tabular-nums">
                    {dateLabel(profile.created_at)}
                  </dd>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Account ID
                  </dt>
                  <dd className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
                    <code className="break-all font-mono text-xs text-foreground">
                      {profile.id}
                    </code>
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={handleCopyAccountId}
                      aria-label={copiedId ? 'Account ID copied' : 'Copy Account ID'}
                    >
                      {copiedId ? (
                        <>
                          <Check className="size-3 text-emerald-600" data-icon="inline-start" aria-hidden="true" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="size-3" data-icon="inline-start" aria-hidden="true" />
                          Copy
                        </>
                      )}
                    </Button>
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card className="bg-white ring-border">
            <CardHeader className="border-b border-border/60 pb-4">
              <CardTitle>Password &amp; Authentication</CardTitle>
              <CardDescription>Keep your office account protected with a strong password.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-start justify-between gap-4 pt-2 sm:flex-row sm:items-center">
              <p className="text-sm leading-relaxed text-muted-foreground">
                Use a unique password of at least 8 characters. Your current password is verified before updating.
              </p>
              <Button variant="outline" className="shrink-0" onClick={() => open('password')}>
                <KeyRound className="size-4" data-icon="inline-start" aria-hidden="true" />
                Change Password
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-6 lg:col-span-5">
          <Card className="bg-white ring-border">
            <CardHeader className="border-b border-border/60 pb-4">
              <CardTitle>Login &amp; Security</CardTitle>
              <CardDescription>Last sign-in and active browser sessions.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5 pt-2">
              <div className="space-y-2">
                <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Last Account Sign-in
                </div>
                <div className="rounded-lg border border-border bg-muted/40 p-3.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground tabular-nums">
                      {dateLabel(profile.lastSignIn || currentSession?.signedInAt)}
                    </span>
                    <span className="text-[11px] font-medium text-muted-foreground">PHT</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      {currentSession
                        ? `${currentSession.deviceName} · ${currentSession.browser}`
                        : 'Current browser session'}
                    </span>
                    {currentSession?.location && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="size-3 shrink-0" aria-hidden="true" />
                        {currentSession.location}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Active Sessions
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {sessions.length || 1} {sessions.length === 1 || sessions.length === 0 ? 'device' : 'devices'}
                  </span>
                </div>

                <ul className="space-y-2.5">
                  {(sessions.length > 0 ? sessions : [
                    {
                      id: 'current',
                      deviceType: 'desktop',
                      deviceName: 'Current Browser',
                      os: 'Active',
                      browser: 'Current session',
                      location: null,
                      lastActiveAt: profile.lastSignIn,
                      isCurrent: true,
                    },
                  ]).map(session => (
                    <li
                      key={session.id}
                      className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card p-3"
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
                          <DeviceIcon type={session.deviceType} />
                        </div>
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-sm font-medium text-foreground">
                              {session.deviceName}
                            </span>
                            {session.isCurrent && (
                              <Badge
                                variant="outline"
                                className="border-emerald-200 bg-emerald-50 text-emerald-700"
                              >
                                Current session
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {session.browser}
                            {session.os && !session.deviceName.includes(session.os) ? ` · ${session.os}` : ''}
                          </p>
                          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-muted-foreground tabular-nums">
                            {session.location && (
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="size-3 shrink-0" aria-hidden="true" />
                                {session.location}
                              </span>
                            )}
                            {session.lastActiveAt && (
                              <span>Active {dateLabel(session.lastActiveAt)}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {!session.isCurrent && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => open('revoke-one', session)}
                          aria-label={`Log out ${session.deviceName}`}
                        >
                          Log out
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="border-t border-border/70 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => open('sessions')}
                >
                  <LogOut className="size-4" data-icon="inline-start" aria-hidden="true" />
                  Log out other devices{otherSessionsCount > 0 ? ` (${otherSessionsCount})` : ''}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {modal && (
        <div className="ep-backdrop" onClick={close}>
          <form
            ref={modalRef}
            tabIndex={-1}
            className="ep-modal"
            role="dialog"
            aria-modal="true"
            aria-label={
              modal === 'profile'
                ? 'Edit profile'
                : modal === 'password'
                  ? 'Change password'
                  : modal === 'revoke-one'
                    ? 'Log out device session'
                    : 'Log out other devices'
            }
            onClick={event => event.stopPropagation()}
            onSubmit={submit}
          >
            <div className="ep-modal-header">
              <h2 className="ep-modal-title">
                {modal === 'profile'
                  ? 'Edit Profile Information'
                  : modal === 'password'
                    ? 'Change Password'
                    : modal === 'revoke-one'
                      ? 'Log Out This Device?'
                      : 'Log Out Other Devices?'}
              </h2>
              <button type="button" className="ep-close-btn" disabled={busy} onClick={close} aria-label="Close">
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
            <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0 }}>
              <div className="ep-modal-body">
                {modal === 'profile' && (
                  <>
                    <div className="ep-photo-row">
                      {(preview || profile.photo) && (
                        <img
                          className="ep-photo-preview rounded-full"
                          width="64"
                          height="64"
                          style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: '9999px' }}
                          src={preview || profile.photo}
                          alt="Profile preview"
                        />
                      )}
                      <label className="ep-label" htmlFor="ep-photo-input">
                        PHOTO (JPG OR PNG, MAX 2MB)
                        <input
                          id="ep-photo-input"
                          type="file"
                          accept="image/jpeg,image/png"
                          onChange={event => {
                            const selected = event.target.files[0];
                            if (selected && (!['image/jpeg', 'image/png'].includes(selected.type) || selected.size <= 0 || selected.size > 2097152)) {
                              setActionError('Choose a JPG or PNG photo under 2MB.');
                              event.target.value = '';
                              return;
                            }
                            setFile(selected || null);
                            setPreview(selected ? URL.createObjectURL(selected) : null);
                            setActionError('');
                          }}
                        />
                      </label>
                    </div>
                    <label className="ep-field-group" htmlFor="ep-fullname-input">
                      <span className="ep-label">FULL NAME</span>
                      <input
                        id="ep-fullname-input"
                        className="ep-input"
                        required
                        maxLength={200}
                        value={form.fullName}
                        onChange={event => setForm({ ...form, fullName: event.target.value })}
                      />
                    </label>
                    <label className="ep-field-group" htmlFor="ep-email-input">
                      <span className="ep-label">EMAIL ADDRESS</span>
                      <input
                        id="ep-email-input"
                        className="ep-input ep-input--muted"
                        value={profile.email || ''}
                        readOnly
                      />
                    </label>
                    <label className="ep-field-group" htmlFor="ep-contact-input">
                      <span className="ep-label">CONTACT NUMBER</span>
                      <input
                        id="ep-contact-input"
                        className="ep-input"
                        type="tel"
                        maxLength={40}
                        value={form.contact}
                        onChange={event => setForm({ ...form, contact: event.target.value })}
                      />
                    </label>
                    <label className="ep-field-group" htmlFor="ep-role-input">
                      <span className="ep-label">ROLE</span>
                      <input
                        id="ep-role-input"
                        className="ep-input ep-input--role"
                        value={profile.role}
                        readOnly
                      />
                    </label>
                  </>
                )}

                {modal === 'password' && (
                  <>
                    {[
                      ['current', 'CURRENT PASSWORD'],
                      ['next', 'NEW PASSWORD'],
                      ['confirm', 'CONFIRM NEW PASSWORD'],
                    ].map(([key, label]) => (
                      <label key={key} className="ep-field-group" htmlFor={`ep-pw-${key}`}>
                        <span className="ep-label">{label}</span>
                        <input
                          id={`ep-pw-${key}`}
                          type="password"
                          className="ep-input"
                          required
                          minLength={key === 'current' ? undefined : 8}
                          autoComplete={key === 'current' ? 'current-password' : 'new-password'}
                          value={passwords[key]}
                          onChange={event => setPasswords({ ...passwords, [key]: event.target.value })}
                        />
                      </label>
                    ))}
                    <p className="field-hint">
                      Use at least 8 characters. Your current password is verified before the update.
                    </p>
                  </>
                )}

                {modal === 'revoke-one' && targetSession && (
                  <p className="text-sm text-muted-foreground">
                    Remove <strong className="text-foreground">{targetSession.deviceName}</strong> ({targetSession.browser}) from your active sessions list.
                  </p>
                )}

                {modal === 'sessions' && (
                  <p className="text-sm text-muted-foreground">
                    This signs out all devices and browsers except this session. Other devices may retain access until their current access tokens expire.
                  </p>
                )}

                {actionError && <p className="pw-error" role="alert">{actionError}</p>}
              </div>
              <div className="ep-modal-footer">
                <Button type="button" variant="outline" onClick={close}>Cancel</Button>
                <Button
                  type="submit"
                  variant={modal === 'sessions' || modal === 'revoke-one' ? 'destructive' : 'default'}
                >
                  {busy
                    ? 'Saving…'
                    : modal === 'profile'
                      ? 'Save Changes'
                      : modal === 'password'
                        ? 'Update Password'
                        : modal === 'revoke-one'
                          ? 'Log Out Device'
                          : 'Log Out Other Devices'}
                </Button>
              </div>
            </fieldset>
          </form>
        </div>
      )}
    </section>
  );
}
