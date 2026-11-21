import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  KeyRound,
  LogOut,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react';
import SettingsLayout from '../../../components/SettingsLayout';
import { useAuth } from '../../../context/AuthContext';
import { accountApi } from '../../../services/accountService';
import { securityApi } from '../../../services/securityService';
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
import './security.css';
import '../../../components/accountSecurityDesign.css';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]):not(:disabled), input:not([disabled]):not(:disabled):not([type="hidden"]), select:not([disabled]):not(:disabled), textarea:not([disabled]):not(:disabled), [tabindex]:not([tabindex="-1"])';

export default function Security() {
  const { user } = useAuth();
  return <SettingsLayout><SecurityDetails key={user?.id} /></SettingsLayout>;
}

function SecurityDetails() {
  const [snapshot, setSnapshot] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);
  const [modal, setModal] = useState(null);
  const [target, setTarget] = useState(null);
  const [setup, setSetup] = useState(null);
  const [phone, setPhone] = useState('');
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const guard = useRef(false);
  const mounted = useRef(true);
  const modalRef = useRef(null);
  const previousFocusRef = useRef(null);
  const cancelRef = useRef(null);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let disposed = false;
    securityApi.load().then(data => { if (!disposed) { setSnapshot(data); setLoadError(''); } })
      .catch(err => { if (!disposed) setLoadError(err.message); });
    return () => { disposed = true; };
  }, [reload]);

  function refresh() { setSnapshot(null); setLoadError(''); setReload(n => n + 1); }
  function restoreFocus() {
    const prev = previousFocusRef.current;
    previousFocusRef.current = null;
    if (prev && typeof prev.focus === 'function') {
      prev.focus();
    }
  }
  function clear() { setModal(null); setTarget(null); setSetup(null); setPhone(''); setCurrent(''); setPassword(''); setConfirm(''); setCode(''); setError(''); restoreFocus(); }
  function open(kind, factor) {
    if (guard.current) return;
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    clear();
    previousFocusRef.current = active;
    setNotice('');
    setModal(kind);
    setTarget(factor || null);
    if (kind === 'enroll') {
      setPhone(snapshot?.twoFactorPhone || snapshot?.phone || '');
    }
  }

  async function perform(action) {
    if (guard.current) return;
    guard.current = true; setBusy(true); setError(''); setNotice('');
    try { await action(); }
    catch (err) { if (mounted.current) setError(err.message); }
    finally { guard.current = false; if (mounted.current) setBusy(false); }
  }

  function finish(message) { if (!mounted.current) return; clear(); setNotice(message); refresh(); }

  async function submit(event) {
    event.preventDefault();
    await perform(async () => {
      if (modal === 'password') {
        if (password !== confirm) throw new Error('Passwords do not match.');
        await accountApi.changePassword(current, password);
        finish('Password updated successfully.');
      } else if (modal === 'sessions') {
        await accountApi.revokeOthers();
        finish('Other sessions revoked. Existing access tokens may remain valid until expiry. This session remains signed in.');
      } else if (modal === 'enroll' && !setup) {
        // Step 1: Send SMS verification code via TextBee
        const data = securityApi.sendSms2fa ? await securityApi.sendSms2fa(phone) : await securityApi.enroll(phone);
        if (mounted.current) setSetup(data || { phone });
      } else if (modal === 'enroll') {
        // Step 2: Verify SMS OTP code and enable 2FA
        if (securityApi.verifySms2fa) {
          await securityApi.verifySms2fa(setup?.phone || phone, code);
        } else {
          await securityApi.verify(setup?.id || phone, code);
        }
        finish('2FA verified and enabled via TextBee SMS.');
      } else if (modal === 'remove') {
        const isTotpTarget = target?.factor_type === 'totp';
        if (target?.status === 'verified' && isTotpTarget && code) {
          await securityApi.verify(target.id, code);
        }
        if (isTotpTarget && securityApi.remove) {
          await securityApi.remove(target.id);
          finish('Authenticator removed.');
        } else if (securityApi.disable2fa) {
          await securityApi.disable2fa(isTotpTarget ? target?.id : null);
          finish('2FA disabled.');
        } else {
          await securityApi.remove(target?.id);
          finish('2FA disabled.');
        }
      }
    });
  }

  async function cancel() {
    if (guard.current) return;
    const pendingFactorId = setup?.id;
    if (!pendingFactorId) {
      clear();
      return;
    }
    guard.current = true;
    setBusy(true);
    try {
      if (securityApi.remove) await securityApi.remove(pendingFactorId);
    } catch {
      // Best-effort cleanup of unverified factor; never trap user in modal on cancel.
    } finally {
      guard.current = false;
      if (mounted.current) {
        setBusy(false);
        clear();
        refresh();
      }
    }
  }

  useEffect(() => {
    cancelRef.current = cancel;
  });

  useEffect(() => {
    if (!modal || typeof document === 'undefined') return;
    const dialog = modalRef.current;
    if (dialog) {
      const firstInput = dialog.querySelector?.('input:not([readonly]):not([disabled]):not(:disabled)');
      const firstFocusable = firstInput || dialog.querySelector?.('button:not([disabled]):not(:disabled)');
      if (firstFocusable && typeof firstFocusable.focus === 'function') {
        firstFocusable.focus();
      } else if (typeof dialog.focus === 'function') {
        dialog.focus();
      }
    }
    const onKeyDown = event => {
      if (event.key === 'Escape' && !guard.current) {
        event.preventDefault();
        cancelRef.current?.();
      } else if (event.key === 'Tab' && dialog) {
        const focusable = Array.from(dialog.querySelectorAll?.(FOCUSABLE_SELECTOR) || []);
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
  }, [modal, setup]);

  const isSms2faActive = Boolean(snapshot?.twoFactorEnabled);
  const hasVerifiedTotp = Boolean(snapshot?.factors && snapshot.factors.some(f => f.status === 'verified'));
  const is2faActive = isSms2faActive || hasVerifiedTotp;
  const phoneDisplay = snapshot?.twoFactorPhone || snapshot?.phone || '';
  const isRemovingTotp = modal === 'remove' && target?.factor_type === 'totp';

  return (
    <section className="content security-settings space-y-6">
      <div className="page-header flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Settings: Security
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your password, Two-Factor Authentication (2FA), and signed-in sessions.
          </p>
        </div>
        {snapshot && (
          <Button type="button" variant="outline" size="sm" onClick={refresh} disabled={busy}>
            <RefreshCw className="size-3.5" data-icon="inline-start" aria-hidden="true" />
            Refresh security settings
          </Button>
        )}
      </div>

      {notice && (
        <div
          role="status"
          className="pw-success flex items-center gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900"
        >
          <CheckCircle2 className="size-4 shrink-0 text-emerald-700" aria-hidden="true" />
          <span>{notice}</span>
        </div>
      )}

      {loadError && (
        <div
          role="alert"
          className="pw-error flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
            <span>{loadError}</span>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={refresh}>
            Retry
          </Button>
        </div>
      )}

      {!snapshot && !loadError && (
        <>
          <p role="status" className="text-sm text-muted-foreground">
            Loading security settings...
          </p>
          <div className="security-card-grid" aria-hidden="true">
            <Card className="settings-card bg-white ring-border">
              <CardHeader className="border-b border-border/60 pb-4">
                <CardTitle>Authentication</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                <div className="security-row">
                  <div className="tanaw-skeleton-stack">
                    <Skeleton className="h-3.5 w-2/5" />
                    <Skeleton className="h-3 w-3/4" />
                  </div>
                  <Skeleton className="h-9 w-32 rounded-md" />
                </div>
                <div className="security-row">
                  <div className="tanaw-skeleton-stack">
                    <Skeleton className="h-3.5 w-3/5" />
                    <Skeleton className="h-3 w-4/5" />
                  </div>
                  <Skeleton className="h-9 w-28 rounded-md" />
                </div>
              </CardContent>
            </Card>
            <Card className="settings-card bg-white ring-border">
              <CardHeader className="border-b border-border/60 pb-4">
                <CardTitle>Sessions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-4">
                <Skeleton className="h-3.5 w-3/5" />
                <Skeleton className="h-3.5 w-5/6" />
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="mt-2 h-9 w-44 rounded-md" />
              </CardContent>
            </Card>
            <Card className="settings-card bg-white ring-border">
              <CardHeader className="border-b border-border/60 pb-4">
                <CardTitle>Login Activity</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-4">
                <Skeleton className="h-3.5 w-2/3" />
                <Skeleton className="h-3.5 w-4/5" />
                <Skeleton className="mt-2 h-9 w-40 rounded-md" />
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {error && !modal && (
        <p role="alert" className="pw-error">
          {error}
        </p>
      )}

      {snapshot && (
        <div className="security-card-grid">
          <Card className="settings-card bg-white ring-border">
            <CardHeader className="border-b border-border/60 pb-4">
              <div className="flex items-center justify-between gap-2">
                <CardTitle>Authentication</CardTitle>
                <Badge
                  variant="secondary"
                  className={
                    is2faActive
                      ? 'rounded-sm border border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'rounded-sm border border-amber-200 bg-amber-50 text-amber-800'
                  }
                >
                  {is2faActive ? (
                    <>
                      <ShieldCheck className="size-3" data-icon="inline-start" aria-hidden="true" />
                      2FA Active
                    </>
                  ) : (
                    <>
                      <ShieldAlert className="size-3" data-icon="inline-start" aria-hidden="true" />
                      2FA Off
                    </>
                  )}
                </Badge>
              </div>
              <CardDescription>Manage sign-in credentials and SMS verification.</CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="security-row">
                <div>
                  <strong>Password</strong>
                  <p>Password change date is unavailable.</p>
                </div>
                <Button type="button" disabled={busy} onClick={() => open('password')}>
                  <KeyRound className="size-4" data-icon="inline-start" aria-hidden="true" />
                  Update Password
                </Button>
              </div>
              <div className="security-row">
                <div>
                  <strong>Two-Factor Authentication (2FA)</strong>
                  <p>{isSms2faActive ? `TextBee SMS 2FA is active${phoneDisplay ? ` (${phoneDisplay})` : ''}` : 'No verified 2FA phone'}</p>
                  <p>SMS verification codes delivered via TextBee are requested before office pages on future sign-ins.</p>
                </div>
                {isSms2faActive ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={busy}
                    onClick={() => open('remove', { id: 'sms', factor_type: 'sms' })}
                  >
                    Disable 2FA
                  </Button>
                ) : (
                  <Button type="button" disabled={busy} onClick={() => open('enroll')}>
                    Set Up 2FA
                  </Button>
                )}
              </div>
              {snapshot.unsupported && <p>Another verified authentication method exists. Manage that method with your administrator.</p>}
              {snapshot.factors && snapshot.factors.filter(f => f.status === 'verified' && f.factor_type === 'totp').map(factor => (
                <div className="security-row" key={factor.id}>
                  <div>
                    <strong>{factor.friendly_name || 'Authenticator app'}</strong>
                    <p>Verified</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={busy}
                    onClick={() => open('remove', factor)}
                  >
                    Remove authenticator
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="settings-card bg-white ring-border">
            <CardHeader className="border-b border-border/60 pb-4">
              <CardTitle>Sessions</CardTitle>
              <CardDescription>Signed in as {snapshot.email}.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <p>Device, location, IP address, and individual session history are unavailable here.</p>
              <p>Signing out other sessions revokes their refresh tokens. Existing access tokens may remain valid until expiry.</p>
              <Button
                type="button"
                variant="outline"
                className="w-full border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={busy}
                onClick={() => open('sessions')}
              >
                <LogOut className="size-4" data-icon="inline-start" aria-hidden="true" />
                Sign Out Other Sessions
              </Button>
            </CardContent>
          </Card>

          <Card className="settings-card bg-white ring-border">
            <CardHeader className="border-b border-border/60 pb-4">
              <CardTitle>Login Activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
              <p className="tabular-nums">
                Last sign-in: {snapshot.lastSignIn ? new Date(snapshot.lastSignIn).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }) : 'Unavailable'}
              </p>
              <p>Failed sign-ins and full login history are unavailable here.</p>
            </CardContent>
          </Card>
        </div>
      )}

      {modal && (
        <div
          className="pw-backdrop"
          onClick={event => {
            if (event.target === event.currentTarget && !busy) cancel();
          }}
        >
          <form
            ref={modalRef}
            tabIndex={-1}
            className="pw-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="security-dialog-title"
            onClick={event => event.stopPropagation()}
            onSubmit={submit}
          >
            <fieldset disabled={busy}>
              <div className="pw-modal-header flex items-center justify-between gap-4">
                <h2 id="security-dialog-title">
                  {modal === 'password'
                    ? 'Update Password'
                    : modal === 'sessions'
                      ? 'Sign Out Other Sessions'
                      : isRemovingTotp
                        ? 'Remove Authenticator'
                        : modal === 'remove'
                          ? 'Disable 2FA'
                          : 'Set Up 2FA (TextBee SMS)'}
                </h2>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground hover:text-foreground"
                  disabled={busy}
                  onClick={cancel}
                  aria-label="Close"
                >
                  <X className="size-4" aria-hidden="true" />
                </Button>
              </div>
              <div className="pw-modal-body">
                {modal === 'password' && (
                  <>
                    <label htmlFor="sec-pw-current">
                      Current password
                      <input id="sec-pw-current" className="pw-input" type="password" autoComplete="current-password" required value={current} onChange={e => setCurrent(e.target.value)} />
                    </label>
                    <label htmlFor="sec-pw-new">
                      New password
                      <input id="sec-pw-new" className="pw-input" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} />
                    </label>
                    <label htmlFor="sec-pw-confirm">
                      Confirm new password
                      <input id="sec-pw-confirm" className="pw-input" type="password" autoComplete="new-password" required value={confirm} onChange={e => setConfirm(e.target.value)} />
                    </label>
                  </>
                )}
                {modal === 'sessions' && (
                  <p>Revoke other sessions for your account? This session will remain signed in. Existing access tokens may remain valid until expiry.</p>
                )}
                {modal === 'enroll' && !setup && (
                  <>
                    <p>Protect your account with SMS verification codes delivered via TextBee. Enter your Philippine mobile phone number below.</p>
                    <label htmlFor="sec-mfa-phone">
                      Philippine Mobile Number
                      <input
                        id="sec-mfa-phone"
                        className="pw-input"
                        type="tel"
                        autoComplete="tel"
                        required
                        placeholder="09XXXXXXXXX or +639XXXXXXXXX"
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                      />
                    </label>
                    <p className="security-subtext">A 6-digit verification code will be sent to this phone via TextBee SMS.</p>
                  </>
                )}
                {modal === 'enroll' && setup && (
                  <>
                    <p>We sent a 6-digit verification code via TextBee SMS to <strong>{setup.phone || phone}</strong>. Enter the code below to complete 2FA setup.</p>
                    {setup.qr && (
                      <>
                        <img className="security-qr" width="220" height="220" src={setup.qr} alt="Authenticator enrollment QR code" />
                        <label htmlFor="sec-mfa-secret">
                          Manual setup key
                          <input id="sec-mfa-secret" className="pw-input" readOnly value={setup.secret || ''} autoComplete="off" />
                        </label>
                      </>
                    )}
                    <label htmlFor="sec-mfa-code">
                      Verification code
                      <input
                        id="sec-mfa-code"
                        className="pw-input"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        pattern="[0-9]{6}"
                        maxLength={6}
                        required
                        placeholder="123456"
                        value={code}
                        onChange={e => setCode(e.target.value)}
                      />
                    </label>
                  </>
                )}
                {modal === 'remove' && (
                  isRemovingTotp ? (
                    <p>Remove <strong>{target?.friendly_name || 'Authenticator app'}</strong> from your account? You will no longer be able to use this authenticator to verify sign-ins.</p>
                  ) : (
                    <p>Disable SMS Two-Factor Authentication for <strong>{phoneDisplay || 'your account'}</strong>? Your account will no longer require SMS verification codes when signing in.</p>
                  )
                )}
                {error && <p role="alert" className="pw-error">{error}</p>}
              </div>
              <div className="pw-modal-footer">
                <Button type="button" variant="outline" disabled={busy} onClick={cancel}>
                  Cancel
                </Button>
                <Button type="submit" disabled={busy} variant={modal === 'remove' || modal === 'sessions' ? 'destructive' : 'default'}>
                  {busy
                    ? 'Working...'
                    : modal === 'enroll' && !setup
                      ? 'Send Verification SMS'
                      : modal === 'enroll'
                        ? 'Verify & Enable 2FA'
                        : isRemovingTotp
                          ? 'Remove Authenticator'
                          : modal === 'remove'
                            ? 'Disable 2FA'
                            : 'Confirm'}
                </Button>
              </div>
            </fieldset>
          </form>
        </div>
      )}
    </section>
  );
}
