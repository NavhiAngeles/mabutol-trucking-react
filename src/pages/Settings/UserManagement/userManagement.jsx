import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  History,
  KeyRound,
  MoreHorizontal,
  Pencil,
  RotateCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  UserCheck,
  UserPlus,
  UserX,
  X,
} from 'lucide-react';
import SettingsLayout from '../../../components/SettingsLayout';
import { useAuth } from '../../../context/AuthContext';
import { userManagementApi, validateOfficeCreation } from '../../../services/userManagementService';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import './userManagement.css';

const PAGE_SIZE = 20;
const AUDIT_PAGE_SIZE = 10;

function formatCreatedDate(value) {
  if (!value) return { date: 'Unavailable', time: '', full: 'Unavailable' };
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return { date: 'Unavailable', time: '', full: 'Unavailable' };
  const date = parsed.toLocaleDateString('en-US', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const time = `${parsed.toLocaleTimeString('en-US', {
    timeZone: 'Asia/Manila',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })} PHT`;
  return { date, time, full: `${date}, ${time}` };
}

function getInitials(name, email) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return String(email || '?').slice(0, 2).toUpperCase();
}

function formatDetailsSummary(details) {
  if (!details || typeof details !== 'object') return String(details ?? 'N/A');
  const targetObj = details.new && typeof details.new === 'object' ? details.new : details;
  const entries = Object.entries(targetObj).filter(([k]) => k !== 'id' && !k.endsWith('_id'));
  if (entries.length === 0) {
    const keys = Object.keys(details);
    return keys.length ? keys.join(', ') : 'Empty payload';
  }
  return (
    entries
      .slice(0, 3)
      .map(([k, v]) => `${k}: ${typeof v === 'object' ? '{…}' : JSON.stringify(v)}`)
      .join(' · ') + (entries.length > 3 ? ` (+${entries.length - 3} more)` : '')
  );
}

function getAuditActionBadgeClass(action) {
  switch (String(action || '').toUpperCase()) {
    case 'CREATE':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'UPDATE':
      return 'border-sky-200 bg-sky-50 text-sky-700';
    case 'DELETE':
    case 'SUSPEND':
      return 'border-rose-200 bg-rose-50 text-rose-700';
    case 'LOGIN':
      return 'border-slate-200 bg-slate-100 text-slate-700';
    default:
      return 'border-border bg-muted text-foreground';
  }
}

export default function UserManagement() {
  const { user, role } = useAuth();
  return (
    <SettingsLayout>
      {role === 'admin' ? (
        <OfficeUsers key={user?.id} />
      ) : (
        <section className="content office-user-management w-full space-y-6">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Settings: User Management
            </h1>
            <p className="text-sm text-muted-foreground">
              Manage Admin and Staff accounts. Driver and customer records remain in their existing workflows.
            </p>
          </div>
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">
              Only active administrators can manage office accounts.
            </CardContent>
          </Card>
        </section>
      )}
    </SettingsLayout>
  );
}

function OfficeUsers() {
  const [snapshot, setSnapshot] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(0);
  const [modal, setModal] = useState(null);
  const [target, setTarget] = useState(null);
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    role: 'staff',
    active: true,
    password: '',
    confirm: '',
    mfaReason: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [recoveryLoaded, setRecoveryLoaded] = useState(false);
  const [mfaLoaded, setMfaLoaded] = useState(false);
  const [mfaFactors, setMfaFactors] = useState([]);
  const [auditLogs, setAuditLogs] = useState(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState('');
  const [auditSearch, setAuditSearch] = useState('');
  const [auditPage, setAuditPage] = useState(0);
  const [expandedAuditRows, setExpandedAuditRows] = useState({});
  const [auditActionFilter, setAuditActionFilter] = useState('all');
  const guard = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    userManagementApi
      .load()
      .then(value => {
        if (!disposed) {
          setSnapshot(value);
          setLoadError('');
        }
      })
      .catch(cause => {
        if (!disposed) setLoadError(cause.message);
      });
    return () => {
      disposed = true;
    };
  }, [reload]);

  function refresh() {
    if (guard.current) return;
    setSnapshot(null);
    setLoadError('');
    setReload(value => value + 1);
  }

  function close() {
    if (guard.current) return;
    setModal(null);
    setTarget(null);
    setForm(previous => ({ ...previous, password: '', confirm: '', mfaReason: '' }));
    setError('');
    setExpandedAuditRows({});
    setMfaLoaded(false);
    setMfaFactors([]);
  }

  function open(kind, row = null) {
    if (guard.current) return;
    setTarget(row);
    setError('');
    setForm({
      fullName: row?.full_name || '',
      email: row?.email || '',
      phone: row?.phone || '',
      role: row?.role || 'staff',
      active: row?.is_active ?? true,
      password: '',
      confirm: '',
      mfaReason: '',
    });
    setModal(kind);
  }

  async function openMfa(row) {
    if (guard.current) return;
    open('mfa', row);
    setMfaLoaded(false);
    setMfaFactors([]);
    guard.current = true;
    setBusy(true);
    try {
      const factors = await userManagementApi.getMfaFactors(row);
      if (mounted.current) {
        setMfaFactors(Array.isArray(factors) ? factors : []);
        setForm(previous => ({ ...previous, mfaReason: '' }));
        setMfaLoaded(true);
      }
    } catch (cause) {
      if (mounted.current) setError(cause.message || 'Unable to load authenticator factors.');
    } finally {
      guard.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function openAudit() {
    if (guard.current) return;
    setModal('audit');
    setAuditSearch('');
    setAuditActionFilter('all');
    setExpandedAuditRows({});
    setAuditPage(0);
    setAuditLoading(true);
    setAuditError('');
    try {
      const data = await userManagementApi.auditLogs();
      if (mounted.current) setAuditLogs(Array.isArray(data) ? data : []);
    } catch (cause) {
      if (mounted.current) setAuditError(cause.message || 'Unable to load audit logs.');
    } finally {
      if (mounted.current) setAuditLoading(false);
    }
  }

  function toggleAuditRow(rowId) {
    setExpandedAuditRows(prev => ({ ...prev, [rowId]: !prev[rowId] }));
  }

  async function refreshAudit() {
    setAuditLoading(true);
    setAuditError('');
    try {
      const data = await userManagementApi.auditLogs();
      if (mounted.current) setAuditLogs(Array.isArray(data) ? data : []);
    } catch (cause) {
      if (mounted.current) setAuditError(cause.message || 'Unable to load audit logs.');
    } finally {
      if (mounted.current) setAuditLoading(false);
    }
  }

  async function openRecovery(row) {
    if (guard.current) return;
    open('recovery', row);
    setRecoveryLoaded(false);
    guard.current = true;
    setBusy(true);
    try {
      const phone = await userManagementApi.recoveryPhone(row);
      if (mounted.current) {
        setForm(previous => ({ ...previous, recoveryPhone: phone || '', expectedPhone: phone }));
        setRecoveryLoaded(true);
      }
    } catch (cause) {
      if (mounted.current) setError(cause.message);
    } finally {
      guard.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (guard.current) return;
    if (['create', 'password'].includes(modal) && form.password !== form.confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (modal === 'create') {
      if (!snapshot?.provisioningReady) {
        setError('Account was not created. Refresh users after the SMS account-management backend is ready.');
        return;
      }
      try {
        validateOfficeCreation(form);
      } catch (cause) {
        setError(cause.message);
        return;
      }
    }
    guard.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (modal === 'create') {
        await userManagementApi.create(form);
      } else if (modal === 'password') {
        await userManagementApi.setPassword({ userId: target.id, password: form.password });
      } else if (modal === 'recovery') {
        if (!recoveryLoaded) throw new Error('Close and reopen recovery enrollment before saving.');
        await userManagementApi.recoveryPhone(target, form);
      } else if (modal === 'mfa') {
        if (!mfaLoaded) throw new Error('Wait for enrolled factors to load before resetting.');
        if (mfaFactors.length === 0) throw new Error('No enrolled authenticator factors to reset.');
        if (!form.mfaReason?.trim() || form.mfaReason.trim().length < 5) {
          throw new Error('Provide a confirmation reason (at least 5 characters).');
        }
        await userManagementApi.resetMfa(target, form.mfaReason.trim());
      } else {
        await userManagementApi.save(
          target,
          modal === 'activation' ? { ...form, active: !target.is_active } : form
        );
      }

      if (mounted.current) {
        setNotice(
          modal === 'create'
            ? 'Office account created with an SMS recovery phone. No email was sent; share the initial credentials securely.'
            : modal === 'password'
            ? 'Password changed. No email was sent.'
            : modal === 'recovery'
            ? 'Recovery phone registered. SMS code verification is required when resetting the password.'
            : modal === 'mfa'
            ? '2FA reset for ' +
              (target.full_name || target.email) +
              '. The user can now sign in with their password and enroll a new device.'
            : 'Account updated. Office permissions refresh on focus or within 30 seconds. Existing Auth access tokens may remain valid until expiry.'
        );
        setModal(null);
        setTarget(null);
        setForm(previous => ({ ...previous, password: '', confirm: '', mfaReason: '' }));
        setSnapshot(null);
        setReload(value => value + 1);
      }
    } catch (cause) {
      if (mounted.current) setError(cause.message);
    } finally {
      guard.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (snapshot?.users || []).filter(row => {
      const matchesQuery =
        !query ||
        [row.full_name, row.email].some(value =>
          String(value || '')
            .toLowerCase()
            .includes(query)
        );
      const matchesRole = roleFilter === 'all' || row.role === roleFilter;
      const matchesStatus = status === 'all' || row.is_active === (status === 'active');
      return matchesQuery && matchesRole && matchesStatus;
    });
  }, [snapshot?.users, search, roleFilter, status]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const pageRows = filtered.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);
  const self = target?.id === snapshot?.callerId;
  const isFetching = !snapshot && !loadError;

  const searchAuditLower = auditSearch.trim().toLowerCase();
  const filteredAuditLogs = (auditLogs || []).filter(row => {
    if (
      auditActionFilter !== 'all' &&
      String(row.action || '').toUpperCase() !== auditActionFilter.toUpperCase()
    ) {
      return false;
    }
    if (!searchAuditLower) return true;
    return (
      (row.actor?.name && String(row.actor.name).toLowerCase().includes(searchAuditLower)) ||
      (row.actor?.email && String(row.actor.email).toLowerCase().includes(searchAuditLower)) ||
      (row.action && String(row.action).toLowerCase().includes(searchAuditLower)) ||
      (row.target && String(row.target).toLowerCase().includes(searchAuditLower)) ||
      (row.philippineTime && String(row.philippineTime).toLowerCase().includes(searchAuditLower)) ||
      (row.details && JSON.stringify(row.details).toLowerCase().includes(searchAuditLower))
    );
  });
  const auditPages = Math.max(1, Math.ceil(filteredAuditLogs.length / AUDIT_PAGE_SIZE));
  const currentAuditPage = Math.min(auditPage, auditPages - 1);
  const visibleAuditLogs = filteredAuditLogs.slice(
    currentAuditPage * AUDIT_PAGE_SIZE,
    currentAuditPage * AUDIT_PAGE_SIZE + AUDIT_PAGE_SIZE
  );

  const rangeStart = filtered.length === 0 ? 0 : currentPage * PAGE_SIZE + 1;
  const rangeEnd = Math.min((currentPage + 1) * PAGE_SIZE, filtered.length);

  const dialogTitleMap = {
    create: 'Add Office User',
    edit: 'Edit Office Account',
    password: 'Set New Password',
    activation: target?.is_active ? 'Deactivate Account?' : 'Activate Account?',
    details: 'Account Details',
    roles: 'Role Summary',
    recovery: 'SMS Recovery Phone',
    mfa: 'Reset 2FA (TextBee SMS)',
  };

  return (
    <TooltipProvider>
      <section className="content office-user-management w-full space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Settings: User Management
            </h1>
            <p className="text-sm text-muted-foreground">
              Manage Admin and Staff accounts. Driver and customer records remain in their existing workflows.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={() => open('roles')}>
              <ShieldCheck className="size-4" data-icon="inline-start" aria-hidden="true" />
              Role Summary
            </Button>
            <Button type="button" variant="outline" onClick={openAudit}>
              <History className="size-4" data-icon="inline-start" aria-hidden="true" />
              Audit &amp; Activity Log
            </Button>
            <Button
              type="button"
              disabled={!snapshot?.provisioningReady || busy}
              onClick={() => open('create')}
            >
              <UserPlus className="size-4" data-icon="inline-start" aria-hidden="true" />
              Add Office User
            </Button>
          </div>
        </div>

        {notice && (
          <div
            role="status"
            className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
          >
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />
              <p>{notice}</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => setNotice('')}
              aria-label="Dismiss notice"
              className="text-emerald-700 hover:bg-emerald-100 hover:text-emerald-900"
            >
              <X className="size-3.5" aria-hidden="true" />
            </Button>
          </div>
        )}

        {snapshot?.provisioningError && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden="true" />
            <p>{snapshot.provisioningError}</p>
          </div>
        )}

        {loadError && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          >
            <div className="flex items-center gap-2.5">
              <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
              <p>{loadError}</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={refresh}>
              Retry loading
            </Button>
          </div>
        )}

        <Card className="bg-white ring-border">
          <CardHeader className="border-b border-border/60 pb-4">
            <CardTitle>Office accounts</CardTitle>
            <CardDescription>Manage access for your office team.</CardDescription>
            <CardAction>
              {isFetching ? (
                <Skeleton className="h-5 w-20 rounded-full" />
              ) : snapshot ? (
                <Badge variant="secondary" className="tabular-nums">
                  {snapshot.users.length} {snapshot.users.length === 1 ? 'account' : 'accounts'}
                </Badge>
              ) : null}
            </CardAction>
          </CardHeader>

          <CardContent className="space-y-4 pt-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:max-w-sm">
                <Search
                  className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="um-search-input"
                  aria-label="Search users"
                  placeholder="Search by name or email..."
                  value={search}
                  onChange={event => {
                    setSearch(event.target.value);
                    setPage(0);
                  }}
                  className="pr-8 pl-8"
                />
                {search && (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => {
                      setSearch('');
                      setPage(0);
                    }}
                    className="absolute top-1/2 right-2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={roleFilter}
                  onValueChange={value => {
                    setRoleFilter(value);
                    setPage(0);
                  }}
                >
                  <SelectTrigger aria-label="Filter by role" className="w-[130px]">
                    <SelectValue placeholder="All roles" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All roles</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="staff">Staff</SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={status}
                  onValueChange={value => {
                    setStatus(value);
                    setPage(0);
                  }}
                >
                  <SelectTrigger aria-label="Account status" className="w-[140px]">
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>

                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        disabled={busy || isFetching}
                        onClick={refresh}
                        aria-label="Refresh users"
                      />
                    }
                  >
                    <RotateCw
                      className={`size-4 ${isFetching ? 'animate-spin' : ''}`}
                      aria-hidden="true"
                    />
                  </TooltipTrigger>
                  <TooltipContent>Refresh users</TooltipContent>
                </Tooltip>
              </div>
            </div>

            {isFetching && (
              <div className="space-y-2">
                <p role="status" className="sr-only">
                  Loading office users…
                </p>
                <div className="rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead>User / Login Email</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Created (PHT)</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Array.from({ length: 5 }).map((_, index) => (
                        <TableRow key={index}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Skeleton className="size-9 rounded-full" />
                              <div className="space-y-1.5">
                                <Skeleton className="h-4 w-32" />
                                <Skeleton className="h-3 w-44" />
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Skeleton className="h-5 w-16 rounded-full" />
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <Skeleton className="h-4 w-24" />
                              <Skeleton className="h-3 w-16" />
                            </div>
                          </TableCell>
                          <TableCell>
                            <Skeleton className="h-5 w-16 rounded-full" />
                          </TableCell>
                          <TableCell className="text-right">
                            <Skeleton className="ml-auto size-7 rounded-md" />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {snapshot && (
              <div
                tabIndex={0}
                role="region"
                aria-label="Office accounts directory"
                className="overflow-x-auto rounded-lg border border-border"
              >
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead>User / Login Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Created (PHT)</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!filtered.length && (
                      <TableRow>
                        <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                          No matching office users.
                        </TableCell>
                      </TableRow>
                    )}
                    {pageRows.map(row => {
                      const isSelf = row.id === snapshot.callerId;
                      const created = formatCreatedDate(row.created_at);
                      return (
                        <TableRow key={row.id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <span
                                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700 ring-1 ring-border"
                                aria-hidden="true"
                              >
                                {getInitials(row.full_name, row.email)}
                              </span>
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="truncate font-semibold text-foreground">
                                    {row.full_name || 'Name not set'}
                                  </span>
                                  {isSelf && (
                                    <Badge
                                      variant="outline"
                                      className="h-4 px-1.5 text-[10px] font-medium text-muted-foreground"
                                    >
                                      You
                                    </Badge>
                                  )}
                                </div>
                                <p className="truncate text-xs text-muted-foreground">{row.email}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {row.role === 'admin' ? (
                              <Badge className="bg-slate-900 text-white hover:bg-slate-900">
                                <Shield
                                  className="size-3"
                                  data-icon="inline-start"
                                  aria-hidden="true"
                                />
                                Admin
                              </Badge>
                            ) : (
                              <Badge variant="secondary">Staff</Badge>
                            )}
                          </TableCell>
                          <TableCell title={created.full}>
                            <div className="space-y-0.5">
                              <div className="text-sm text-foreground tabular-nums">
                                {created.date}
                              </div>
                              {created.time && (
                                <div className="text-xs text-muted-foreground tabular-nums">
                                  {created.time}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {row.is_active ? (
                              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                                <span
                                  className="size-1.5 rounded-full bg-emerald-500"
                                  aria-hidden="true"
                                />
                                Active
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                                <span
                                  className="size-1.5 rounded-full bg-slate-400"
                                  aria-hidden="true"
                                />
                                Inactive
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                render={
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={`Actions for ${row.full_name || row.email}`}
                                  />
                                }
                              >
                                <MoreHorizontal className="size-4" aria-hidden="true" />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-52">
                                <DropdownMenuGroup>
                                  <DropdownMenuLabel>Account</DropdownMenuLabel>
                                  <DropdownMenuItem onClick={() => open('details', row)}>
                                    <Eye className="size-4" aria-hidden="true" />
                                    View Details
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => open('edit', row)}>
                                    <Pencil className="size-4" aria-hidden="true" />
                                    Edit Role
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    disabled={isSelf}
                                    title={
                                      isSelf ? 'Change your password in Account settings' : undefined
                                    }
                                    onClick={() => open('password', row)}
                                  >
                                    <KeyRound className="size-4" aria-hidden="true" />
                                    Reset Password
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    disabled={busy}
                                    onClick={() => openRecovery(row)}
                                  >
                                    <Smartphone className="size-4" aria-hidden="true" />
                                    Recovery Phone
                                  </DropdownMenuItem>
                                </DropdownMenuGroup>
                                <DropdownMenuSeparator />
                                <DropdownMenuGroup>
                                  <DropdownMenuLabel>Security &amp; Status</DropdownMenuLabel>
                                  <DropdownMenuItem
                                    variant="destructive"
                                    disabled={busy || isSelf}
                                    title={
                                      isSelf
                                        ? 'Manage your own 2FA in Security settings'
                                        : undefined
                                    }
                                    onClick={() => openMfa(row)}
                                  >
                                    <ShieldAlert className="size-4" aria-hidden="true" />
                                    Reset 2FA
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    variant={row.is_active ? 'destructive' : 'default'}
                                    disabled={isSelf}
                                    title={
                                      isSelf
                                        ? 'Your own account cannot be deactivated here'
                                        : undefined
                                    }
                                    onClick={() => open('activation', row)}
                                  >
                                    {row.is_active ? (
                                      <UserX className="size-4" aria-hidden="true" />
                                    ) : (
                                      <UserCheck className="size-4" aria-hidden="true" />
                                    )}
                                    {row.is_active ? 'Deactivate Account' : 'Activate Account'}
                                  </DropdownMenuItem>
                                </DropdownMenuGroup>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>

          {snapshot && (
            <CardFooter className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 bg-muted/20 py-3 text-xs text-muted-foreground">
              <span className="tabular-nums">
                {filtered.length === 0
                  ? '0 matching users'
                  : totalPages > 1
                  ? `Showing ${rangeStart}–${rangeEnd} of ${filtered.length} users · Page ${currentPage + 1} of ${totalPages}`
                  : `${filtered.length} ${filtered.length === 1 ? 'user' : 'users'}`}
              </span>
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={currentPage === 0}
                    onClick={() => setPage(currentPage - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={currentPage + 1 >= totalPages}
                    onClick={() => setPage(currentPage + 1)}
                  >
                    Next
                  </Button>
                </div>
              )}
            </CardFooter>
          )}
        </Card>

        {/* Audit & Activity Log Dialog */}
        <Dialog open={modal === 'audit'} onOpenChange={openState => !openState && close()}>
          <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-4xl">
            <DialogHeader>
              <DialogTitle>Audit &amp; Activity Log</DialogTitle>
              <DialogDescription>
                Authorized records from system activity logs (Philippine time)
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-1 flex-col gap-4 overflow-hidden py-1">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Search
                    className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    id="um-audit-search-input"
                    type="search"
                    placeholder="Search actor, action, target, metadata..."
                    aria-label="Search audit logs"
                    value={auditSearch}
                    onChange={e => {
                      setAuditSearch(e.target.value);
                      setAuditPage(0);
                    }}
                    className="pl-8"
                  />
                </div>
                <Select
                  value={auditActionFilter}
                  onValueChange={val => {
                    setAuditActionFilter(val);
                    setAuditPage(0);
                  }}
                >
                  <SelectTrigger aria-label="Filter by action" className="w-[150px]">
                    <SelectValue placeholder="All actions" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All actions</SelectItem>
                    <SelectItem value="UPDATE">UPDATE</SelectItem>
                    <SelectItem value="CREATE">CREATE</SelectItem>
                    <SelectItem value="DELETE">DELETE</SelectItem>
                    <SelectItem value="SUSPEND">SUSPEND</SelectItem>
                    <SelectItem value="LOGIN">LOGIN</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={auditLoading}
                  onClick={refreshAudit}
                >
                  <RotateCw
                    className={`size-3.5 ${auditLoading ? 'animate-spin' : ''}`}
                    data-icon="inline-start"
                    aria-hidden="true"
                  />
                  Refresh logs
                </Button>
              </div>

              {auditLoading && !auditLogs && (
                <div className="space-y-2 overflow-auto rounded-lg border border-border">
                  <p role="status" className="sr-only">
                    Loading audit logs…
                  </p>
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead>Timestamp (PHT)</TableHead>
                        <TableHead>Actor</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Target</TableHead>
                        <TableHead>Metadata</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell>
                            <Skeleton className="h-4 w-28" />
                          </TableCell>
                          <TableCell>
                            <Skeleton className="h-4 w-32" />
                          </TableCell>
                          <TableCell>
                            <Skeleton className="h-5 w-16 rounded-full" />
                          </TableCell>
                          <TableCell>
                            <Skeleton className="h-4 w-24" />
                          </TableCell>
                          <TableCell>
                            <Skeleton className="h-4 w-40" />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {auditError && (
                <div
                  role="alert"
                  className="flex items-center justify-between gap-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
                >
                  <p>{auditError}</p>
                  <Button type="button" variant="outline" size="sm" onClick={refreshAudit}>
                    Retry loading
                  </Button>
                </div>
              )}

              {auditLogs && (
                <div className="flex-1 overflow-auto rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead>Timestamp (PHT)</TableHead>
                        <TableHead>Actor</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Target</TableHead>
                        <TableHead>Metadata</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {!filteredAuditLogs.length && (
                        <TableRow>
                          <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                            No matching audit logs.
                          </TableCell>
                        </TableRow>
                      )}
                      {visibleAuditLogs.map(row => {
                        const isExpanded = !!expandedAuditRows[row.id];
                        return (
                          <TableRow key={row.id}>
                            <TableCell className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
                              {row.philippineTime}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2.5">
                                <span
                                  className="flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-700 ring-1 ring-border"
                                  aria-hidden="true"
                                >
                                  {getInitials(row.actor?.name, row.actor?.email)}
                                </span>
                                <div className="min-w-0">
                                  <div className="truncate text-xs font-semibold text-foreground">
                                    {row.actor?.name || 'System'}
                                  </div>
                                  {row.actor?.email && (
                                    <div className="truncate text-[11px] text-muted-foreground">
                                      {row.actor.email}
                                    </div>
                                  )}
                                  {row.actor?.role && (
                                    <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                      {row.actor.role}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <span
                                className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${getAuditActionBadgeClass(row.action)}`}
                              >
                                {row.action}
                              </span>
                            </TableCell>
                            <TableCell>
                              <code
                                title={row.target}
                                className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground"
                              >
                                {row.target}
                              </code>
                            </TableCell>
                            <TableCell className="max-w-xs">
                              {row.details &&
                              typeof row.details === 'object' &&
                              Object.keys(row.details).length > 0 ? (
                                <div className="space-y-1.5">
                                  <div className="flex items-center justify-between gap-2">
                                    <span
                                      className="truncate text-xs text-muted-foreground"
                                      title={JSON.stringify(row.details)}
                                    >
                                      {formatDetailsSummary(row.details)}
                                    </span>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="xs"
                                      onClick={() => toggleAuditRow(row.id)}
                                      aria-expanded={isExpanded}
                                    >
                                      {isExpanded ? 'Hide JSON' : 'View JSON'}
                                    </Button>
                                  </div>
                                  {isExpanded && (
                                    <pre className="max-h-40 overflow-auto rounded-md border border-border bg-muted/50 p-2 font-mono text-[11px] text-foreground">
                                      {JSON.stringify(row.details, null, 2)}
                                    </pre>
                                  )}
                                </div>
                              ) : row.details != null && typeof row.details !== 'object' ? (
                                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                                  {String(row.details)}
                                </code>
                              ) : (
                                <span className="text-xs text-muted-foreground">N/A</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            <DialogFooter className="items-center justify-between sm:justify-between">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={currentAuditPage === 0 || auditLoading}
                  onClick={() => setAuditPage(p => Math.max(0, p - 1))}
                >
                  Previous
                </Button>
                <span className="tabular-nums">
                  Page {currentAuditPage + 1} of {auditPages} · {filteredAuditLogs.length}{' '}
                  {filteredAuditLogs.length === 1 ? 'log' : 'logs'}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={currentAuditPage + 1 >= auditPages || auditLoading}
                  onClick={() => setAuditPage(p => p + 1)}
                >
                  Next
                </Button>
              </div>
              <Button type="button" variant="outline" onClick={close}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Account & Role Dialogs */}
        <Dialog
          open={Boolean(modal && modal !== 'audit')}
          onOpenChange={openState => !openState && close()}
        >
          <DialogContent className="sm:max-w-lg">
            <form noValidate={modal === 'create'} onSubmit={submit} className="space-y-4">
              <DialogHeader>
                <DialogTitle>{dialogTitleMap[modal] || 'Office Account'}</DialogTitle>
                {modal === 'roles' && (
                  <DialogDescription>
                    Office role permissions and account lifecycle policy.
                  </DialogDescription>
                )}
              </DialogHeader>

              <fieldset disabled={busy} className="space-y-4">
                {modal === 'roles' && (
                  <div className="space-y-3 text-sm">
                    <div className="rounded-lg border border-border bg-muted/30 p-3.5 space-y-1">
                      <div className="flex items-center gap-2 font-semibold text-foreground">
                        <Shield className="size-4 text-slate-900" aria-hidden="true" />
                        Admin
                      </div>
                      <p className="text-muted-foreground">
                        Manages office users, role assignments, shared settings, and operational workflows governed by database policies.
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/30 p-3.5 space-y-1">
                      <div className="font-semibold text-foreground">Staff</div>
                      <p className="text-muted-foreground">
                        Uses operational workflows under existing backend permissions; cannot manage office accounts or admin-only settings.
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Accounts are deactivated rather than permanently deleted to preserve operational and audit history.
                    </p>
                  </div>
                )}

                {modal === 'details' && target && (
                  <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                    <div className="sm:col-span-2 space-y-0.5">
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Account ID
                      </dt>
                      <dd className="break-all font-mono text-xs text-foreground">{target.id}</dd>
                    </div>
                    <div className="space-y-0.5">
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Name
                      </dt>
                      <dd className="text-foreground">{target.full_name || 'Not set'}</dd>
                    </div>
                    <div className="space-y-0.5">
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Email
                      </dt>
                      <dd className="break-all text-foreground">{target.email}</dd>
                    </div>
                    <div className="space-y-0.5">
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Contact
                      </dt>
                      <dd className="text-foreground tabular-nums">{target.phone || 'Not set'}</dd>
                    </div>
                    <div className="space-y-0.5">
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Role
                      </dt>
                      <dd className="capitalize text-foreground">{target.role}</dd>
                    </div>
                    <div className="space-y-0.5">
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Created
                      </dt>
                      <dd className="text-foreground tabular-nums">
                        {formatCreatedDate(target.created_at).full}
                      </dd>
                    </div>
                    <div className="space-y-0.5">
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Updated
                      </dt>
                      <dd className="text-foreground tabular-nums">
                        {formatCreatedDate(target.updated_at).full}
                      </dd>
                    </div>
                  </dl>
                )}

                {['create', 'edit'].includes(modal) && (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label htmlFor="um-fullname-input" className="text-sm font-medium text-foreground">
                        Full Name
                      </label>
                      <Input
                        id="um-fullname-input"
                        required
                        maxLength={200}
                        value={form.fullName}
                        onChange={event => setForm({ ...form, fullName: event.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="um-email-input" className="text-sm font-medium text-foreground">
                        Login Email
                      </label>
                      <Input
                        id="um-email-input"
                        type="email"
                        required
                        value={form.email}
                        readOnly={modal === 'edit'}
                        onChange={event => setForm({ ...form, email: event.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="um-phone-input" className="text-sm font-medium text-foreground">
                        {modal === 'create' ? 'Recovery Mobile Number' : 'Contact Number'}
                      </label>
                      <Input
                        id="um-phone-input"
                        type="tel"
                        autoComplete="tel"
                        required={modal === 'create'}
                        maxLength={40}
                        placeholder="09XXXXXXXXX or +639XXXXXXXXX"
                        value={form.phone}
                        onChange={event => setForm({ ...form, phone: event.target.value })}
                      />
                      <p className="text-xs text-muted-foreground">
                        {modal === 'create'
                          ? 'Use this user’s own Philippine mobile number. Whoever receives its SMS codes can reset this account’s password.'
                          : 'Contact edits do not change the authentication recovery number. Use Recovery Phone to enroll or replace it.'}
                      </p>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <label htmlFor="um-role-select" className="text-sm font-medium text-foreground">
                          Role
                        </label>
                        <Select
                          value={form.role}
                          disabled={self}
                          onValueChange={val => setForm({ ...form, role: val })}
                        >
                          <SelectTrigger id="um-role-select" className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="staff">Staff</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {modal === 'edit' && (
                        <div className="space-y-1.5">
                          <label htmlFor="um-status-modal-select" className="text-sm font-medium text-foreground">
                            Status
                          </label>
                          <Select
                            value={form.active ? 'active' : 'inactive'}
                            disabled={self}
                            onValueChange={val => setForm({ ...form, active: val === 'active' })}
                          >
                            <SelectTrigger id="um-status-modal-select" className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="active">Active</SelectItem>
                              <SelectItem value="inactive">Inactive</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                    {self && (
                      <p className="text-xs text-muted-foreground">
                        Use Account settings for your password. Your own role and activation status cannot be changed here.
                      </p>
                    )}
                  </div>
                )}

                {modal === 'recovery' && target && (
                  <div className="space-y-3 text-sm">
                    <p className="text-muted-foreground">
                      Register the recovery number for <strong className="text-foreground">{target.email}</strong>. Whoever receives its SMS codes can reset this account’s password. Confirm this is the user’s own number before saving.
                    </p>
                    {!recoveryLoaded && !error && (
                      <p role="status" className="text-muted-foreground">
                        Loading registered recovery phone…
                      </p>
                    )}
                    {recoveryLoaded && (
                      <div className="space-y-1.5">
                        <label
                          htmlFor="um-recovery-phone-input"
                          className="text-sm font-medium text-foreground"
                        >
                          Recovery Mobile Number
                        </label>
                        <Input
                          id="um-recovery-phone-input"
                          type="tel"
                          autoComplete="tel"
                          required
                          maxLength={40}
                          placeholder="09XXXXXXXXX or +639XXXXXXXXX"
                          value={form.recoveryPhone || ''}
                          onChange={event =>
                            setForm({ ...form, recoveryPhone: event.target.value })
                          }
                        />
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      This changes the Auth recovery number. The profile’s contact number remains separate. No SMS is sent when an administrator registers a number; possession is checked during recovery.
                    </p>
                  </div>
                )}

                {modal === 'mfa' && target && (
                  <div className="space-y-3 text-sm">
                    <p className="text-muted-foreground">
                      Inspect and reset enrolled 2FA factors for{' '}
                      <strong className="text-foreground">{target.full_name || target.email}</strong> ({target.email}). Use this when a staff member loses access to their phone or 2FA device.
                    </p>
                    {!mfaLoaded && !error && (
                      <p role="status" className="text-muted-foreground">
                        Loading enrolled authenticator factors…
                      </p>
                    )}
                    {mfaLoaded && (
                      <>
                        <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Enrolled 2FA Factors
                          </h3>
                          {mfaFactors.length === 0 ? (
                            <p className="text-xs text-muted-foreground">
                              No enrolled 2FA factors found on this account.
                            </p>
                          ) : (
                            <ul className="space-y-2">
                              {mfaFactors.map(f => (
                                <li
                                  key={f.id}
                                  className="rounded-md border border-border bg-background px-3 py-2 text-xs"
                                >
                                  <div className="font-semibold text-foreground">
                                    {f.friendlyName || f.friendly_name || 'SMS 2FA (TextBee)'}
                                  </div>
                                  <div className="mt-0.5 text-muted-foreground">
                                    ID: <code>{f.id}</code> · Status:{' '}
                                    <span className="font-medium text-foreground">{f.status}</span>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        <div className="space-y-1.5">
                          <label
                            htmlFor="um-mfa-reason-input"
                            className="text-sm font-medium text-foreground"
                          >
                            Confirmation Reason *
                          </label>
                          <textarea
                            id="um-mfa-reason-input"
                            required
                            rows={3}
                            minLength={5}
                            maxLength={500}
                            placeholder="e.g. Staff member lost their mobile phone / 2FA device."
                            value={form.mfaReason || ''}
                            onChange={event =>
                              setForm({ ...form, mfaReason: event.target.value })
                            }
                            className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Resetting 2FA removes all enrolled factors for this user and records an audit log. The user can sign in with their password and enroll a new device via TextBee SMS.
                        </p>
                      </>
                    )}
                  </div>
                )}

                {modal === 'activation' && target && (
                  <div className="space-y-2 text-sm">
                    <p>
                      {target.is_active ? 'Deactivate' : 'Activate'}{' '}
                      <strong>{target.full_name || target.email}</strong> ({target.email})?
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Deactivation blocks office access after the next permission refresh. Existing Auth access tokens may remain valid until expiry. Operational records are retained.
                    </p>
                  </div>
                )}

                {['create', 'password'].includes(modal) && (
                  <div className="space-y-3">
                    {target && (
                      <p className="text-sm text-muted-foreground">
                        Change the login password for{' '}
                        <strong className="text-foreground">{target.email}</strong>. No reset email will be sent.
                      </p>
                    )}
                    <div className="space-y-1.5">
                      <label htmlFor="um-password-input" className="text-sm font-medium text-foreground">
                        {modal === 'create' ? 'Initial' : 'New'} Password
                      </label>
                      <Input
                        id="um-password-input"
                        type="password"
                        autoComplete="new-password"
                        minLength={12}
                        maxLength={128}
                        required
                        value={form.password}
                        onChange={event => setForm({ ...form, password: event.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="um-confirm-input" className="text-sm font-medium text-foreground">
                        Confirm Password
                      </label>
                      <Input
                        id="um-confirm-input"
                        type="password"
                        autoComplete="new-password"
                        minLength={12}
                        maxLength={128}
                        required
                        value={form.confirm}
                        onChange={event => setForm({ ...form, confirm: event.target.value })}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Use 12–128 characters. Share credentials securely; the user can change them under Account settings.
                    </p>
                  </div>
                )}

                {error && (
                  <p role="alert" className="text-sm font-medium text-destructive">
                    {error}
                  </p>
                )}

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={close}>
                    Close
                  </Button>
                  {!['details', 'roles'].includes(modal) && (
                    <Button
                      type="submit"
                      variant={
                        modal === 'mfa' || (modal === 'activation' && target?.is_active)
                          ? 'destructive'
                          : 'default'
                      }
                      disabled={
                        (modal === 'recovery' && !recoveryLoaded) ||
                        (modal === 'mfa' &&
                          (!mfaLoaded ||
                            mfaFactors.length === 0 ||
                            !form.mfaReason?.trim() ||
                            form.mfaReason.trim().length < 5))
                      }
                    >
                      {busy
                        ? 'Saving…'
                        : modal === 'create'
                        ? 'Create Account'
                        : modal === 'password'
                        ? 'Set New Password'
                        : modal === 'activation'
                        ? 'Confirm'
                        : modal === 'mfa'
                        ? 'Reset 2FA'
                        : 'Save Changes'}
                    </Button>
                  )}
                </DialogFooter>
              </fieldset>
            </form>
          </DialogContent>
        </Dialog>
      </section>
    </TooltipProvider>
  );
}
