import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  MoreVertical,
  Pencil,
  Plus,
  Route,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  getTollGates,
  addTollGate,
  updateTollGate,
  deleteTollGate,
  getCurrentPricingUser,
  syncLuzonStandardTollGates,
} from "../../../services/tollGateService";
import {
  VERIFIED_TOLL_PRESETS,
  buildLuzonStandardTollRows,
  cleanGateName,
} from "../../../services/tollPricing";
import { SkeletonTableRows } from "../../../components/Skeleton/Skeleton";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const EMPTY_FORM = {
  gate_name: "",
  highway: "NLEX",
  vehicle_class: "Class 2",
  fee: "",
  pricing_scope: "entry_exit",
  entry_lat: "",
  entry_lng: "",
  exit_lat: "",
  exit_lng: "",
  bidirectional: false,
};

const formatPeso = (value) =>
  Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const selectClassName =
  "mt-1.5 h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-muted/50 disabled:opacity-60";

const fieldInputClassName = "mt-1.5 h-9";

const fieldLabelClassName = "block text-xs font-medium text-foreground";

export default function TollGateManager() {
  const [tolls, setTolls] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const editTriggerRef = useRef(null);
  const editDialogRef = useRef(null);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const deleteTriggerRef = useRef(null);
  const deleteCancelBtnRef = useRef(null);
  const deleteDialogRef = useRef(null);

  const [openMenuId, setOpenMenuId] = useState(null);
  const [menuPosition, setMenuPosition] = useState(null);
  const menuRef = useRef(null);

  const [error, setError] = useState("");
  const [modalError, setModalError] = useState("");
  const [success, setSuccess] = useState("");

  const loadTolls = useCallback(async () => {
    try {
      const records = await getTollGates();
      setTolls(records);
      setError("");
    } catch (err) {
      setError(err.message || "Unable to load toll gates.");
    }
  }, []);

  useEffect(() => {
    let active = true;

    async function initialize() {
      setLoading(true);

      try {
        const [user, records] = await Promise.all([
          getCurrentPricingUser(),
          getTollGates(),
        ]);

        if (!active) return;

        setIsAdmin(user.isAdmin === true);
        setTolls(records);
        setError("");
      } catch (err) {
        if (!active) return;

        setIsAdmin(false);
        setError(err.message || "Unable to load toll gate information.");
      } finally {
        if (active) setLoading(false);
      }
    }

    initialize();

    return () => {
      active = false;
    };
  }, []);

  const filteredTolls = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return tolls;
    return tolls.filter((toll) => {
      const name = cleanGateName(toll.gate_name).toLowerCase();
      const highway = String(toll.highway || "").toLowerCase();
      const vehicleClass = String(toll.vehicle_class || "").toLowerCase();
      return (
        name.includes(query) ||
        highway.includes(query) ||
        vehicleClass.includes(query)
      );
    });
  }, [tolls, searchQuery]);

  const handleApplyLuzonStandardTolls = async () => {
    if (!isAdmin || saving || loading) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const standardRows = buildLuzonStandardTollRows(VERIFIED_TOLL_PRESETS);
      const summary = await syncLuzonStandardTollGates(standardRows, tolls);
      await loadTolls();
      setSuccess(
        `Applied Luzon FTL standard toll rates (${summary.updated} updated, ${summary.inserted} added, ${summary.unchanged} already up to date).`
      );
    } catch (err) {
      setError(err.message || "Unable to apply Luzon FTL standard toll rates.");
    } finally {
      setSaving(false);
    }
  };

  const openAddModal = (event) => {
    if (!isAdmin) return;
    editTriggerRef.current =
      event?.currentTarget ||
      (typeof document !== "undefined" ? document.activeElement : null);

    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setModalError("");
    setSuccess("");
    setModalOpen(true);
  };

  const openEditModal = (toll, event) => {
    if (!isAdmin) return;
    editTriggerRef.current =
      event?.currentTarget ||
      (typeof document !== "undefined" ? document.activeElement : null);

    setEditingId(toll.id);

    setForm({
      gate_name: cleanGateName(toll.gate_name),
      highway: toll.highway,
      vehicle_class: toll.vehicle_class,
      fee: String(toll.fee),
      pricing_scope: toll.pricing_scope || "entry_exit",
      entry_lat: String(toll.entry_lat ?? ""),
      entry_lng: String(toll.entry_lng ?? ""),
      exit_lat: String(toll.exit_lat ?? ""),
      exit_lng: String(toll.exit_lng ?? ""),
      bidirectional: toll.bidirectional === true,
    });

    setModalError("");
    setSuccess("");
    setModalOpen(true);
  };

  const closeModal = useCallback(() => {
    if (saving) return;

    setModalOpen(false);
    setEditingId(null);
    setModalError("");
    const trigger = editTriggerRef.current;
    editTriggerRef.current = null;
    if (trigger && typeof trigger.focus === "function") {
      trigger.focus();
    }
  }, [saving]);

  useEffect(() => {
    if (!modalOpen || typeof document === "undefined") return;
    const timer = setTimeout(() => {
      const dialog = editDialogRef.current;
      if (!dialog) return;
      const firstFocusable = dialog.querySelector?.(
        'select:not([disabled]), input:not([disabled]), button:not([disabled])'
      );
      if (firstFocusable && typeof firstFocusable.focus === "function") {
        firstFocusable.focus();
      } else if (typeof dialog.focus === "function") {
        dialog.focus();
      }
    }, 0);
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (!saving) {
          closeModal();
        }
      } else if (event.key === "Tab" && editDialogRef.current) {
        const focusable = Array.from(
          editDialogRef.current.querySelectorAll?.(
            'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          ) || []
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey) {
          if (
            document.activeElement === first ||
            !editDialogRef.current.contains(document.activeElement)
          ) {
            event.preventDefault();
            last.focus();
          }
        } else if (
          document.activeElement === last ||
          !editDialogRef.current.contains(document.activeElement)
        ) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [modalOpen, saving, closeModal]);

  const updateField = (field, value) => {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const applyPreset = (presetName) => {
    const preset = VERIFIED_TOLL_PRESETS.find(
      (p) =>
        p.gate_name === presetName ||
        cleanGateName(p.gate_name) === cleanGateName(presetName)
    );
    if (!preset) return;
    setForm((prev) => ({
      ...prev,
      gate_name: cleanGateName(preset.gate_name),
      highway: preset.highway,
      fee: String(
        prev.vehicle_class === "Class 3" ? preset.class3_fee : preset.class2_fee
      ),
      pricing_scope: preset.pricing_scope,
      entry_lat: preset.entry_lat != null ? String(preset.entry_lat) : "",
      entry_lng: preset.entry_lng != null ? String(preset.entry_lng) : "",
      exit_lat: preset.exit_lat != null ? String(preset.exit_lat) : "",
      exit_lng: preset.exit_lng != null ? String(preset.exit_lng) : "",
      bidirectional: preset.bidirectional === true,
    }));
  };

  const handleVehicleClassChange = (newClass) => {
    setForm((prev) => {
      const preset = VERIFIED_TOLL_PRESETS.find(
        (p) => cleanGateName(p.gate_name) === cleanGateName(prev.gate_name)
      );
      const fee = preset
        ? String(
          newClass === "Class 3"
            ? preset.class3_fee
            : newClass === "Class 2"
              ? preset.class2_fee
              : prev.fee
        )
        : prev.fee;
      return { ...prev, vehicle_class: newClass, fee };
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!isAdmin || saving) return;

    setModalError("");
    setSuccess("");

    const fee = Number(form.fee);

    if (
      String(form.fee).trim() === "" ||
      !Number.isFinite(fee) ||
      fee < 0
    ) {
      setModalError("Please enter a valid toll fee.");
      return;
    }

    setSaving(true);

    try {
      const payload = {
        ...form,
        gate_name: cleanGateName(form.gate_name),
        fee,
      };

      const isEditing = Boolean(editingId);

      if (isEditing) {
        await updateTollGate(editingId, payload);
      } else {
        await addTollGate(payload);
      }

      await loadTolls();

      const trigger = editTriggerRef.current;
      editTriggerRef.current = null;
      setModalOpen(false);
      setEditingId(null);

      setSuccess(
        isEditing
          ? "Toll gate rate updated."
          : "Toll gate added."
      );
      if (trigger && typeof trigger.focus === "function") {
        trigger.focus();
      }
    } catch (err) {
      setModalError(err.message || "Unable to save toll gate.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClick = (toll, event) => {
    if (!isAdmin || saving || deleting) return;
    deleteTriggerRef.current =
      event?.currentTarget ||
      (typeof document !== "undefined" ? document.activeElement : null);
    setDeleteError("");
    setDeleteTarget(toll);
  };

  const handleCancelDelete = useCallback(() => {
    if (deleting) return;
    setDeleteTarget(null);
    setDeleteError("");
    if (
      deleteTriggerRef.current &&
      typeof deleteTriggerRef.current.focus === "function"
    ) {
      deleteTriggerRef.current.focus();
    }
  }, [deleting]);

  const handleConfirmDelete = async () => {
    if (!isAdmin || !deleteTarget || deleting) return;

    setDeleting(true);
    setDeleteError("");
    setError("");
    setSuccess("");

    try {
      await deleteTollGate(deleteTarget.id);
      await loadTolls();
      setSuccess(`Toll gate "${deleteTarget.gate_name}" deleted.`);
      const trigger = deleteTriggerRef.current;
      setDeleteTarget(null);
      if (trigger && typeof trigger.focus === "function") {
        trigger.focus();
      }
    } catch (err) {
      setDeleteError(err.message || "Unable to delete toll gate.");
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    if (!deleteTarget) return;

    const timer = setTimeout(() => {
      if (deleteCancelBtnRef.current) {
        deleteCancelBtnRef.current.focus();
      }
    }, 0);

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (!deleting) {
          handleCancelDelete();
        }
      } else if (event.key === "Tab" && deleteDialogRef.current) {
        const buttons = Array.from(
          deleteDialogRef.current.querySelectorAll("button:not([disabled])")
        );
        if (buttons.length === 0) return;
        const first = buttons[0];
        const last = buttons[buttons.length - 1];

        if (event.shiftKey) {
          if (
            document.activeElement === first ||
            !deleteDialogRef.current.contains(document.activeElement)
          ) {
            event.preventDefault();
            last.focus();
          }
        } else {
          if (
            document.activeElement === last ||
            !deleteDialogRef.current.contains(document.activeElement)
          ) {
            event.preventDefault();
            first.focus();
          }
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [deleteTarget, deleting, handleCancelDelete]);

  const handleOpenMenu = useCallback(
    (e, tollId) => {
      e.stopPropagation();
      if (openMenuId === tollId) {
        setOpenMenuId(null);
        setMenuPosition(null);
        return;
      }
      const rect = e.currentTarget.getBoundingClientRect();
      const winHeight =
        typeof window !== "undefined" ? window.innerHeight : 800;
      const winWidth = typeof window !== "undefined" ? window.innerWidth : 1200;
      const spaceBelow = winHeight - rect.bottom;
      const openUpward = spaceBelow < 110 && rect.top > 110;

      setMenuPosition({
        top: openUpward ? "auto" : `${rect.bottom + 4}px`,
        bottom: openUpward ? `${winHeight - rect.top + 4}px` : "auto",
        right: `${Math.max(12, winWidth - rect.right)}px`,
      });
      setOpenMenuId(tollId);
    },
    [openMenuId]
  );

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpenMenuId(null);
        setMenuPosition(null);
      }
    }
    function handleDismiss() {
      setOpenMenuId(null);
      setMenuPosition(null);
    }
    function handleKeyDown(e) {
      if (e.key === "Escape" && !deleteTarget) {
        setOpenMenuId(null);
        setMenuPosition(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleDismiss, true);
    window.addEventListener("resize", handleDismiss);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleDismiss, true);
      window.removeEventListener("resize", handleDismiss);
    };
  }, [deleteTarget]);

  return (
    <Card
      id="toll-gates"
      className="gap-0 rounded-xl border border-border/80 py-0 shadow-xs ring-0"
    >
      <CardHeader className="border-b border-border/60 px-6 py-5">
        <CardTitle className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground">
          <Route className="size-4 text-muted-foreground" aria-hidden="true" />
          <span>Toll Gate Rates</span>
        </CardTitle>
        <CardDescription className="text-sm text-muted-foreground">
          Expressway toll tariffs used for automated route calculation.
        </CardDescription>
        {isAdmin && (
          <CardAction className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleApplyLuzonStandardTolls}
              disabled={saving || loading}
            >
              Apply Luzon FTL Standard
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={openAddModal}
              disabled={saving || loading}
              className="gap-1.5"
            >
              <Plus className="size-3.5" aria-hidden="true" />
              <span>Add Toll Gate</span>
            </Button>
          </CardAction>
        )}
      </CardHeader>

      <CardContent className="px-0 py-0">
        {(error || success) && (
          <div className="space-y-2 px-6 pt-4">
            {error && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
              >
                <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div
                role="status"
                className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-800"
              >
                <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
                <span>{success}</span>
              </div>
            )}
          </div>
        )}

        {!loading && tolls.length > 0 && (
          <div className="flex items-center justify-between gap-3 border-b border-border/60 px-6 py-3">
            <div className="relative w-full max-w-xs">
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by gate, highway, or class..."
                aria-label="Filter toll gates"
                className="h-8 pl-8 pr-7 text-xs shadow-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  aria-label="Clear toll gate filter"
                  className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {filteredTolls.length} of {tolls.length}
            </span>
          </div>
        )}

        <div className="max-h-[420px] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted/40 backdrop-blur-xs">
              <TableRow className="hover:bg-transparent">
                <TableHead className="px-6 py-2.5 text-xs font-medium text-muted-foreground">
                  Toll Gate
                </TableHead>
                <TableHead className="px-3 py-2.5 text-xs font-medium text-muted-foreground">
                  Highway
                </TableHead>
                <TableHead className="px-3 py-2.5 text-xs font-medium text-muted-foreground">
                  Vehicle Class
                </TableHead>
                <TableHead className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground">
                  Fee (₱)
                </TableHead>
                {isAdmin && (
                  <TableHead className="w-16 px-4 py-2.5 text-center text-xs font-medium text-muted-foreground">
                    Actions
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>

            <TableBody>
              {loading ? (
                <SkeletonTableRows
                  rows={4}
                  columns={
                    isAdmin
                      ? ["stack", "badge", "short", "short", "action"]
                      : ["stack", "badge", "short", "short"]
                  }
                />
              ) : filteredTolls.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={isAdmin ? 5 : 4}
                    className="px-6 py-10 text-center text-sm text-muted-foreground"
                  >
                    {tolls.length === 0
                      ? "No toll gates configured."
                      : "No toll gates match your filter."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredTolls.map((toll) => (
                  <TableRow
                    key={toll.id}
                    className="transition-colors hover:bg-muted/40"
                  >
                    <TableCell className="px-6 py-3 whitespace-normal">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium text-foreground">
                          {cleanGateName(toll.gate_name)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {toll.pricing_scope === "flat"
                            ? "Fixed toll system fee"
                            : toll.entry_lat != null && toll.exit_lat != null
                              ? "Auto route matching ready"
                              : "Coordinates needed for auto pricing"}
                        </span>
                      </div>
                    </TableCell>

                    <TableCell className="px-3 py-3">
                      <Badge
                        variant="secondary"
                        className="rounded-md font-medium tracking-tight"
                      >
                        {toll.highway}
                      </Badge>
                    </TableCell>

                    <TableCell className="px-3 py-3 text-sm text-muted-foreground">
                      {toll.vehicle_class}
                    </TableCell>

                    <TableCell className="px-3 py-3 text-right font-medium text-foreground tabular-nums">
                      ₱{formatPeso(toll.fee)}
                    </TableCell>

                    {isAdmin && (
                      <TableCell className="w-16 px-4 py-3 text-center">
                        <div
                          className="toll-action-menu-wrapper relative inline-flex justify-center"
                          ref={openMenuId === toll.id ? menuRef : null}
                          onKeyDown={(e) => {
                            if (openMenuId !== toll.id) return;
                            const items = Array.from(
                              e.currentTarget.querySelectorAll?.('[role="menuitem"]:not([disabled])') || []
                            );
                            if (items.length === 0) return;
                            const currentIndex = items.indexOf(document.activeElement);
                            if (e.key === "ArrowDown") {
                              e.preventDefault();
                              items[(currentIndex + 1) % items.length]?.focus();
                            } else if (e.key === "ArrowUp") {
                              e.preventDefault();
                              items[(currentIndex - 1 + items.length) % items.length]?.focus();
                            } else if (e.key === "Home") {
                              e.preventDefault();
                              items[0]?.focus();
                            } else if (e.key === "End") {
                              e.preventDefault();
                              items[items.length - 1]?.focus();
                            } else if (e.key === "Escape") {
                              e.preventDefault();
                              const dotsBtn = e.currentTarget.querySelector?.(".toll-action-dots-btn");
                              setOpenMenuId(null);
                              setMenuPosition(null);
                              dotsBtn?.focus?.();
                            }
                          }}
                        >
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="toll-action-dots-btn text-muted-foreground hover:text-foreground"
                            aria-label={`Actions for toll gate ${toll.gate_name}`}
                            aria-haspopup="menu"
                            aria-expanded={openMenuId === toll.id}
                            disabled={saving || deleting}
                            onClick={(e) => handleOpenMenu(e, toll.id)}
                          >
                            <MoreVertical className="size-4" aria-hidden="true" />
                          </Button>

                          {openMenuId === toll.id && (
                            <div
                              className="toll-action-dropdown min-w-40 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
                              role="menu"
                              style={
                                menuPosition
                                  ? {
                                    position: "fixed",
                                    top: menuPosition.top,
                                    bottom: menuPosition.bottom,
                                    right: menuPosition.right,
                                    left: "auto",
                                    zIndex: 9999,
                                  }
                                  : undefined
                              }
                            >
                              <button
                                type="button"
                                className="toll-dropdown-item flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-muted"
                                role="menuitem"
                                onClick={(e) => {
                                  const dotsBtn = e.currentTarget
                                    .closest(".toll-action-menu-wrapper")
                                    ?.querySelector(".toll-action-dots-btn");
                                  setOpenMenuId(null);
                                  setMenuPosition(null);
                                  openEditModal(toll, {
                                    currentTarget: dotsBtn || e.currentTarget,
                                  });
                                }}
                              >
                                <Pencil className="size-3.5 text-muted-foreground" aria-hidden="true" />
                                <span>Edit Price</span>
                              </button>

                              <button
                                type="button"
                                className="toll-dropdown-item danger flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-destructive transition-colors hover:bg-destructive/10"
                                role="menuitem"
                                onClick={(e) => {
                                  const dotsBtn = e.currentTarget
                                    .closest(".toll-action-menu-wrapper")
                                    ?.querySelector(".toll-action-dots-btn");
                                  setOpenMenuId(null);
                                  setMenuPosition(null);
                                  handleDeleteClick(toll, {
                                    currentTarget: dotsBtn || e.currentTarget,
                                  });
                                }}
                              >
                                <Trash2 className="size-3.5" aria-hidden="true" />
                                <span>Delete</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      {/* ADD / EDIT DIALOG */}
      {modalOpen && isAdmin && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !saving) {
              closeModal();
            }
          }}
        >
          <div
            ref={editDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="toll-dialog-title"
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-border bg-background p-6 shadow-xl"
          >
            <div className="mb-5 flex items-center justify-between gap-4">
              <h2
                id="toll-dialog-title"
                className="text-lg font-semibold tracking-tight text-foreground"
              >
                {editingId ? "Edit Toll Gate Price" : "Add New Toll Gate"}
              </h2>

              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={closeModal}
                disabled={saving}
                aria-label="Close dialog"
              >
                <X className="size-4" aria-hidden="true" />
              </Button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {!editingId && (
                <div className="rounded-lg border border-border bg-muted/40 p-3">
                  <label
                    htmlFor="toll-preset-select"
                    className={fieldLabelClassName}
                  >
                    Verified Expressway Preset
                    <select
                      id="toll-preset-select"
                      className={selectClassName}
                      defaultValue=""
                      onChange={(e) => applyPreset(e.target.value)}
                    >
                      <option value="">
                        Select a verified preset to auto-fill
                      </option>
                      <optgroup label="South Luzon Corridors (SLEX, STAR, CALAX, CAVITEX, Skyway, MCX)">
                        {VERIFIED_TOLL_PRESETS.filter(
                          (p) =>
                            ["SLEX", "STAR", "CALAX", "CAVITEX", "MCX"].includes(
                              p.highway
                            ) ||
                            (p.highway === "SKYWAY" &&
                              p.gate_name.includes("Alabang"))
                        ).map((p) => (
                          <option key={p.gate_name} value={p.gate_name}>
                            {p.gate_name} ({p.highway}) : Class 2: ₱{p.class2_fee}{" "}
                            / Class 3: ₱{p.class3_fee}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Metro Manila & North Luzon Corridors (NLEX, SCTEX, TPLEX, Skyway)">
                        {VERIFIED_TOLL_PRESETS.filter(
                          (p) =>
                            [
                              "NLEX",
                              "NLEX_CONNECTOR",
                              "NLEX_HARBOR_LINK",
                              "SCTEX",
                              "TPLEX",
                            ].includes(p.highway) ||
                            (p.highway === "SKYWAY" &&
                              !p.gate_name.includes("Alabang"))
                        ).map((p) => (
                          <option key={p.gate_name} value={p.gate_name}>
                            {p.gate_name} ({p.highway}) : Class 2: ₱{p.class2_fee}{" "}
                            / Class 3: ₱{p.class3_fee}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </label>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Auto-fills entry &amp; exit plaza coordinates, confirmed Class
                    2/3 tariffs, and bidirectional matching.
                  </p>
                </div>
              )}

              <label
                htmlFor="toll-gate-name-input"
                className={fieldLabelClassName}
              >
                Toll Gate Name
                <Input
                  id="toll-gate-name-input"
                  required
                  autoFocus={!editingId}
                  className={fieldInputClassName}
                  value={form.gate_name}
                  readOnly={Boolean(editingId)}
                  onChange={(event) =>
                    updateField("gate_name", event.target.value)
                  }
                  placeholder="Entry → Exit (e.g. Balagtas → Bocaue)"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label
                  htmlFor="toll-highway-select"
                  className={fieldLabelClassName}
                >
                  Highway
                  <select
                    id="toll-highway-select"
                    required
                    className={selectClassName}
                    value={form.highway}
                    disabled={Boolean(editingId)}
                    onChange={(event) =>
                      updateField("highway", event.target.value)
                    }
                  >
                    <option value="NLEX">NLEX</option>
                    <option value="NLEX_CONNECTOR">NLEX Connector</option>
                    <option value="NLEX_HARBOR_LINK">NLEX Harbor Link</option>
                    <option value="SLEX">SLEX</option>
                    <option value="SKYWAY">SKYWAY</option>
                    <option value="SCTEX">SCTEX</option>
                    <option value="TPLEX">TPLEX</option>
                    <option value="CALAX">CALAX</option>
                    <option value="CAVITEX">CAVITEX</option>
                    <option value="STAR">STAR</option>
                    <option value="MCX">MCX</option>
                    <option value="NAIAX">NAIAX</option>
                    <option value="C5 SOUTHLINK">C5 SOUTHLINK</option>
                    <option value="OTHER">OTHER</option>
                  </select>
                </label>

                <label
                  htmlFor="toll-vehicle-class-select"
                  className={fieldLabelClassName}
                >
                  Vehicle Class
                  <select
                    id="toll-vehicle-class-select"
                    required
                    className={selectClassName}
                    value={form.vehicle_class}
                    disabled={Boolean(editingId)}
                    onChange={(event) =>
                      handleVehicleClassChange(event.target.value)
                    }
                  >
                    <option value="Class 1">Class 1</option>
                    <option value="Class 2">Class 2</option>
                    <option value="Class 3">Class 3</option>
                  </select>
                </label>
              </div>

              <label htmlFor="toll-fee-input" className={fieldLabelClassName}>
                Toll Fee (₱)
                <Input
                  id="toll-fee-input"
                  required
                  autoFocus={Boolean(editingId)}
                  type="number"
                  min="0"
                  step="0.01"
                  className={`${fieldInputClassName} tabular-nums font-medium`}
                  value={form.fee}
                  onChange={(event) => updateField("fee", event.target.value)}
                  placeholder="0.00"
                />
              </label>

              <fieldset className="rounded-lg border border-border p-3.5">
                <legend className="px-1 text-xs font-medium text-foreground">
                  Automatic route matching
                </legend>
                <label
                  htmlFor="toll-pricing-scope-select"
                  className={fieldLabelClassName}
                >
                  Tariff basis
                  <select
                    id="toll-pricing-scope-select"
                    className={selectClassName}
                    value={form.pricing_scope}
                    onChange={(event) =>
                      updateField("pricing_scope", event.target.value)
                    }
                  >
                    <option value="entry_exit">Exact entry and exit</option>
                    {["NLEX_CONNECTOR", "NLEX_HARBOR_LINK"].includes(
                      form.highway
                    ) && <option value="flat">Fixed toll system fee</option>}
                  </select>
                </label>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  Set the entry and exit plaza coordinates so automated routing
                  can match this tariff.
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2.5">
                  {["entry_lat", "entry_lng", "exit_lat", "exit_lng"].map(
                    (key) => (
                      <label
                        key={key}
                        htmlFor={`toll-${key}-input`}
                        className="block text-xs font-medium text-muted-foreground"
                      >
                        {
                          {
                            entry_lat: "Entry latitude",
                            entry_lng: "Entry longitude",
                            exit_lat: "Exit latitude",
                            exit_lng: "Exit longitude",
                          }[key]
                        }
                        <Input
                          id={`toll-${key}-input`}
                          type="number"
                          step="any"
                          min={key.endsWith("lat") ? -90 : -180}
                          max={key.endsWith("lat") ? 90 : 180}
                          className="mt-1 h-8 text-xs tabular-nums"
                          value={form[key]}
                          onChange={(event) =>
                            updateField(key, event.target.value)
                          }
                          placeholder={
                            key.endsWith("lat")
                              ? "e.g. 14.800000"
                              : "e.g. 120.950000"
                          }
                        />
                      </label>
                    )
                  )}
                </div>
                <label
                  htmlFor="toll-bidirectional-checkbox"
                  className="mt-3 flex items-center gap-2 text-xs text-foreground"
                >
                  <input
                    id="toll-bidirectional-checkbox"
                    type="checkbox"
                    checked={form.bidirectional}
                    onChange={(event) =>
                      updateField("bidirectional", event.target.checked)
                    }
                  />
                  <span>Same fee applies in both directions</span>
                </label>
              </fieldset>

              {modalError && (
                <p
                  role="alert"
                  className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
                >
                  {modalError}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving}
                  onClick={closeModal}
                >
                  Cancel
                </Button>

                <Button type="submit" disabled={saving}>
                  {saving
                    ? "Saving..."
                    : editingId
                      ? "Save New Price"
                      : "Add Toll Gate"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION DIALOG */}
      {deleteTarget && isAdmin && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !deleting) {
              handleCancelDelete();
            }
          }}
        >
          <div
            ref={deleteDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="toll-delete-dialog-title"
            aria-describedby="toll-delete-dialog-desc"
            tabIndex={-1}
            className="w-full max-w-sm rounded-xl border border-border bg-background p-6 text-center shadow-xl"
          >
            <div
              className="mx-auto mb-4 inline-flex size-11 items-center justify-center rounded-full bg-destructive/10 text-destructive"
              aria-hidden="true"
            >
              <Trash2 className="size-5" />
            </div>

            <h2
              id="toll-delete-dialog-title"
              className="text-base font-semibold text-foreground"
            >
              Delete toll gate?
            </h2>

            <p
              id="toll-delete-dialog-desc"
              className="mt-2 text-sm leading-relaxed text-muted-foreground"
            >
              Are you sure you want to delete{" "}
              <strong className="font-medium text-foreground">
                {deleteTarget.gate_name}
              </strong>{" "}
              ({deleteTarget.highway} - {deleteTarget.vehicle_class})? This
              action cannot be undone.
            </p>

            {deleteError && (
              <p
                role="alert"
                className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-left text-xs text-destructive"
              >
                {deleteError}
              </p>
            )}

            <div className="mt-6 flex justify-center gap-2.5">
              <Button
                ref={deleteCancelBtnRef}
                type="button"
                variant="outline"
                disabled={deleting}
                onClick={handleCancelDelete}
                className="min-w-24"
              >
                Cancel
              </Button>

              <Button
                type="button"
                variant="destructive"
                disabled={deleting}
                onClick={handleConfirmDelete}
                className="min-w-24 bg-destructive text-white hover:bg-destructive/90"
              >
                {deleting ? "Deleting…" : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
