import { useCallback, useEffect, useRef, useState } from "react";
import {
  getTollGates,
  addTollGate,
  updateTollGate,
  deleteTollGate,
  getCurrentPricingUser,
} from "../../../services/tollGateService";
import { VERIFIED_TOLL_PRESETS, cleanGateName } from "../../../services/tollPricing";

const TollIcon = ({ size = 22 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M4 19V5" />
    <path d="M20 19V5" />
    <path d="M4 10h16" />
    <path d="M9 10l-5 5" />
    <path d="M15 10l-5 5" />
    <circle cx="12" cy="7" r="1.5" />
  </svg>
);

const EMPTY_FORM = {
  gate_name: "",
  highway: "NLEX",
  vehicle_class: "Class 2",
  fee: "",
  pricing_scope: 'entry_exit',
  entry_lat: '', entry_lng: '', exit_lat: '', exit_lng: '', bidirectional: false,
};

const formatPeso = (value) =>
  Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const buttonStyle = {
  border: "1px solid #cbd5e1",
  borderRadius: 6,
  padding: "7px 12px",
  cursor: "pointer",
  fontWeight: 500,
  fontSize: 13,
  whiteSpace: "nowrap",
};

const inputStyle = {
  width: "100%",
  padding: "11px 12px",
  border: "1px solid #cbd5e1",
  borderRadius: 6,
  boxSizing: "border-box",
  marginTop: 6,
};

const labelStyle = {
  display: "block",
  marginBottom: 16,
  fontSize: 14,
  fontWeight: 500,
  color: "#334155",
};

export default function TollGateManager() {
  const [tolls, setTolls] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

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
        setError(
          err.message || "Unable to load toll gate information."
        );
      } finally {
        if (active) setLoading(false);
      }
    }

    initialize();

    return () => {
      active = false;
    };
  }, []);

  const openAddModal = () => {
    if (!isAdmin) return;

    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setModalError("");
    setSuccess("");
    setModalOpen(true);
  };

  const openEditModal = (toll) => {
    if (!isAdmin) return;

    setEditingId(toll.id);

    setForm({
      gate_name: cleanGateName(toll.gate_name),
      highway: toll.highway,
      vehicle_class: toll.vehicle_class,
      fee: String(toll.fee),
      pricing_scope: toll.pricing_scope || 'entry_exit',
      entry_lat: String(toll.entry_lat ?? ''), entry_lng: String(toll.entry_lng ?? ''),
      exit_lat: String(toll.exit_lat ?? ''), exit_lng: String(toll.exit_lng ?? ''), bidirectional: toll.bidirectional === true,
    });

    setModalError("");
    setSuccess("");
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;

    setModalOpen(false);
    setEditingId(null);
    setModalError("");
  };

  const updateField = (field, value) => {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const applyPreset = (presetName) => {
    const preset = VERIFIED_TOLL_PRESETS.find(p => p.gate_name === presetName || cleanGateName(p.gate_name) === cleanGateName(presetName));
    if (!preset) return;
    setForm(prev => ({
      ...prev,
      gate_name: cleanGateName(preset.gate_name),
      highway: preset.highway,
      fee: String(prev.vehicle_class === 'Class 3' ? preset.class3_fee : preset.class2_fee),
      pricing_scope: preset.pricing_scope,
      entry_lat: preset.entry_lat != null ? String(preset.entry_lat) : '',
      entry_lng: preset.entry_lng != null ? String(preset.entry_lng) : '',
      exit_lat: preset.exit_lat != null ? String(preset.exit_lat) : '',
      exit_lng: preset.exit_lng != null ? String(preset.exit_lng) : '',
      bidirectional: preset.bidirectional === true,
    }));
  };

  const handleVehicleClassChange = (newClass) => {
    setForm(prev => {
      const preset = VERIFIED_TOLL_PRESETS.find(p => cleanGateName(p.gate_name) === cleanGateName(prev.gate_name));
      const fee = preset
        ? String(newClass === 'Class 3' ? preset.class3_fee : newClass === 'Class 2' ? preset.class2_fee : prev.fee)
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

      setModalOpen(false);
      setEditingId(null);

      setSuccess(
        isEditing
          ? "Toll gate price updated successfully."
          : "Toll gate added successfully."
      );
    } catch (err) {
      setModalError(
        err.message || "Unable to save toll gate."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClick = (toll, event) => {
    if (!isAdmin || saving || deleting) return;
    deleteTriggerRef.current = event?.currentTarget || (typeof document !== "undefined" ? document.activeElement : null);
    setDeleteError("");
    setDeleteTarget(toll);
  };

  const handleCancelDelete = useCallback(() => {
    if (deleting) return;
    setDeleteTarget(null);
    setDeleteError("");
    if (deleteTriggerRef.current && typeof deleteTriggerRef.current.focus === "function") {
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
      setSuccess(`Toll gate "${deleteTarget.gate_name}" deleted successfully.`);
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
          if (document.activeElement === first || !deleteDialogRef.current.contains(document.activeElement)) {
            event.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
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

  const handleOpenMenu = useCallback((e, tollId) => {
    e.stopPropagation();
    if (openMenuId === tollId) {
      setOpenMenuId(null);
      setMenuPosition(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const winHeight = typeof window !== "undefined" ? window.innerHeight : 800;
    const winWidth = typeof window !== "undefined" ? window.innerWidth : 1200;
    const spaceBelow = winHeight - rect.bottom;
    const openUpward = spaceBelow < 110 && rect.top > 110;

    setMenuPosition({
      top: openUpward ? "auto" : `${rect.bottom + 4}px`,
      bottom: openUpward ? `${winHeight - rect.top + 4}px` : "auto",
      right: `${Math.max(12, winWidth - rect.right)}px`,
    });
    setOpenMenuId(tollId);
  }, [openMenuId]);

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
    <div className="settings-card" id="toll-gates">
      <div className="card-header">
        <TollIcon />
        <h3>Toll Gate Rates</h3>
      </div>

      <p className="card-desc card-desc-tight">
        View and manage toll gate prices stored in Supabase.
      </p>

      {error && (
        <div
          role="alert"
          style={{
            padding: 12,
            marginBottom: 12,
            borderRadius: 6,
            background: "#fee2e2",
            color: "#991b1b",
          }}
        >
          {error}
        </div>
      )}

      {success && (
        <div
          role="status"
          style={{
            padding: 12,
            marginBottom: 12,
            borderRadius: 6,
            background: "#dcfce7",
            color: "#166534",
          }}
        >
          {success}
        </div>
      )}

      <div className="toll-table-wrapper">
        <table className="pricing-table toll-table">
          <thead>
            <tr>
              <th>TOLL GATE</th>
              <th>HIGHWAY</th>
              <th>VEHICLE CLASS</th>
              <th className="ta-right">FEE (₱)</th>
              {isAdmin && <th className="text-center" style={{ width: 80 }}>ACTIONS</th>}
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={isAdmin ? 5 : 4}>
                  Loading toll gates...
                </td>
              </tr>
            ) : tolls.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 5 : 4}>
                  No toll gates found.
                </td>
              </tr>
            ) : (
              tolls.map((toll) => (
                <tr key={toll.id}>
                  <td className="toll-name">
                    <span className="toll-title">{cleanGateName(toll.gate_name)}</span>
                    <span className="toll-subtitle">
                      {toll.pricing_scope === 'flat'
                        ? 'Fixed fee for this toll system'
                        : toll.entry_lat != null && toll.exit_lat != null
                        ? 'Automatic route matching ready'
                        : 'Entry and exit plaza locations needed for automatic pricing'}
                    </span>
                  </td>

                  <td>
                    <span
                      className={`hwy hwy-${toll.highway.toLowerCase()}`}
                    >
                      {toll.highway}
                    </span>
                  </td>

                  <td className="muted-cell">
                    {toll.vehicle_class}
                  </td>

                  <td className="ta-right toll-fee">
                    ₱{formatPeso(toll.fee)}
                  </td>

                  {isAdmin && (
                    <td className="text-center" style={{ width: 80 }}>
                      <div
                        className="toll-action-menu-wrapper"
                        ref={openMenuId === toll.id ? menuRef : null}
                      >
                        <button
                          type="button"
                          className="toll-action-dots-btn"
                          aria-label={`Actions for toll gate ${toll.gate_name}`}
                          aria-expanded={openMenuId === toll.id}
                          disabled={saving || deleting}
                          onClick={(e) => handleOpenMenu(e, toll.id)}
                        >
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <circle cx="12" cy="5" r="1.5" fill="currentColor" />
                            <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                            <circle cx="12" cy="19" r="1.5" fill="currentColor" />
                          </svg>
                        </button>

                        {openMenuId === toll.id && (
                          <div
                            className="toll-action-dropdown"
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
                              className="toll-dropdown-item"
                              role="menuitem"
                              onClick={() => {
                                setOpenMenuId(null);
                                setMenuPosition(null);
                                openEditModal(toll);
                              }}
                            >
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                              >
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                              <span>Edit Price</span>
                            </button>

                            <button
                              type="button"
                              className="toll-dropdown-item danger"
                              role="menuitem"
                              onClick={(e) => {
                                const dotsBtn = e.currentTarget
                                  .closest(".toll-action-menu-wrapper")
                                  ?.querySelector(".toll-action-dots-btn");
                                setOpenMenuId(null);
                                setMenuPosition(null);
                                handleDeleteClick(toll, { currentTarget: dotsBtn || e.currentTarget });
                              }}
                            >
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                              >
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              </svg>
                              <span>Delete</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="toll-footer">
        <p>
          {isAdmin
            ? "Edit toll gate prices or add new toll gates."
            : "Toll gate rates are read-only for your account."}
        </p>

        {isAdmin && (
          <button
            type="button"
            className="add-toll-btn"
            onClick={openAddModal}
            disabled={saving}
          >
            + Add Toll Gate
          </button>
        )}
      </div>

      {/* ADD / EDIT POPUP */}
      {modalOpen && isAdmin && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(15, 23, 42, 0.65)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="toll-dialog-title"
            style={{
              width: "100%",
              maxWidth: 460,
              maxHeight: "90vh",
              overflowY: "auto",
              padding: 28,
              borderRadius: 12,
              background: "#fff",
              boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 20,
              }}
            >
              <h3
                id="toll-dialog-title"
                style={{ margin: 0 }}
              >
                {editingId
                  ? "Edit Toll Gate Price"
                  : "Add New Toll Gate"}
              </h3>

              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                aria-label="Close popup"
                style={{
                  border: "none",
                  background: "transparent",
                  fontSize: 26,
                  cursor: "pointer",
                }}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              {!editingId && (
                <div style={{ marginBottom: 16, background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                  <label style={{ ...labelStyle, marginBottom: 6 }}>
                    Verified Expressway Preset
                    <select
                      style={inputStyle}
                      defaultValue=""
                      onChange={(e) => {
                        applyPreset(e.target.value);
                      }}
                    >
                      <option value="">— Select a verified preset to auto-fill —</option>
                      <optgroup label="South Luzon Corridors (SLEX, STAR, CALAX, CAVITEX, Skyway, MCX)">
                        {VERIFIED_TOLL_PRESETS.filter(p => ['SLEX', 'STAR', 'CALAX', 'CAVITEX', 'MCX'].includes(p.highway) || (p.highway === 'SKYWAY' && p.gate_name.includes('Alabang'))).map(p => (
                          <option key={p.gate_name} value={p.gate_name}>
                            {p.gate_name} ({p.highway}) — Class 2: ₱{p.class2_fee} / Class 3: ₱{p.class3_fee}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Metro Manila & North Luzon Corridors (NLEX, SCTEX, TPLEX, Skyway)">
                        {VERIFIED_TOLL_PRESETS.filter(p => ['NLEX', 'NLEX_CONNECTOR', 'NLEX_HARBOR_LINK', 'SCTEX', 'TPLEX'].includes(p.highway) || (p.highway === 'SKYWAY' && !p.gate_name.includes('Alabang'))).map(p => (
                          <option key={p.gate_name} value={p.gate_name}>
                            {p.gate_name} ({p.highway}) — Class 2: ₱{p.class2_fee} / Class 3: ₱{p.class3_fee}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </label>
                  <p style={{ margin: 0, fontSize: 11, color: '#64748b' }}>
                    Auto-fills exact entry & exit plaza coordinates, confirmed Class 2/3 tariffs, and bidirectional route matching.
                  </p>
                </div>
              )}

              <label style={labelStyle}>
                Toll Gate Name
                <input
                  required
                  autoFocus={!editingId}
                  style={inputStyle}
                  value={form.gate_name}
                  readOnly={Boolean(editingId)}
                  onChange={(event) =>
                    updateField(
                      "gate_name",
                      event.target.value
                    )
                  }
                  placeholder="Entry → Exit (e.g. Balagtas → Bocaue)"
                />
              </label>

              <label style={labelStyle}>
                Highway
                <select
                  required
                  style={inputStyle}
                  value={form.highway}
                  disabled={Boolean(editingId)}
                  onChange={(event) =>
                    updateField(
                      "highway",
                      event.target.value
                    )
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

              <label style={labelStyle}>
                Vehicle Class
                <select
                  required
                  style={inputStyle}
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

              <label style={labelStyle}>
                Toll Fee (₱)
                <input
                  required
                  autoFocus={Boolean(editingId)}
                  type="number"
                  min="0"
                  step="0.01"
                  style={inputStyle}
                  value={form.fee}
                  onChange={(event) =>
                    updateField("fee", event.target.value)
                  }
                  placeholder="Enter toll fee"
                />
              </label>

              <fieldset style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: 14, marginBottom: 16 }}>
                <legend>Automatic route matching</legend>
                <label style={labelStyle}>Tariff basis
                  <select style={inputStyle} value={form.pricing_scope} onChange={event => updateField('pricing_scope', event.target.value)}>
                    <option value="entry_exit">Exact entry and exit</option>
                    {['NLEX_CONNECTOR', 'NLEX_HARBOR_LINK'].includes(form.highway) && <option value="flat">Fixed toll system fee</option>}
                  </select>
                </label>
                <p style={{ fontSize: 12, lineHeight: 1.6, color: '#64748b' }}>Set the actual toll entry and exit plaza locations. The calculated route must match both before this fee can be added automatically.</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {['entry_lat', 'entry_lng', 'exit_lat', 'exit_lng'].map(key => <label key={key} style={{ ...labelStyle, marginBottom: 6 }}>
                    {({ entry_lat: 'Entry latitude', entry_lng: 'Entry longitude', exit_lat: 'Exit latitude', exit_lng: 'Exit longitude' })[key]}
                    <input type="number" step="any" min={key.endsWith('lat') ? -90 : -180} max={key.endsWith('lat') ? 90 : 180}
                      style={inputStyle} value={form[key]} onChange={event => updateField(key, event.target.value)} placeholder={key.endsWith('lat') ? 'e.g. 14.800000' : 'e.g. 120.950000'} />
                  </label>)}
                </div>
                <label style={{ fontSize: 12, display: 'flex', gap: 8, marginTop: 10 }}>
                  <input type="checkbox" checked={form.bidirectional} onChange={event => updateField('bidirectional', event.target.checked)} />
                  This same fee is confirmed for both directions
                </label>
              </fieldset>
              {modalError && (
                <p
                  role="alert"
                  style={{
                    color: "#b91c1c",
                    marginBottom: 16,
                  }}
                >
                  {modalError}
                </p>
              )}

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 10,
                  marginTop: 20,
                }}
              >
                <button
                  type="button"
                  disabled={saving}
                  onClick={closeModal}
                  style={buttonStyle}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    ...buttonStyle,
                    background: "#0b2a4a",
                    borderColor: "#0b2a4a",
                    color: "#fff",
                  }}
                >
                  {saving
                    ? "Saving..."
                    : editingId
                      ? "Save New Price"
                      : "Add Toll Gate"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION DIALOG */}
      {deleteTarget && isAdmin && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(15, 23, 42, 0.65)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
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
            style={{
              width: "100%",
              maxWidth: 420,
              padding: 28,
              borderRadius: 12,
              background: "#fff",
              boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: "#fee2e2",
                color: "#dc2626",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 16,
              }}
              aria-hidden="true"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 6h18" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
            </div>

            <h3
              id="toll-delete-dialog-title"
              style={{
                margin: "0 0 8px 0",
                fontSize: 18,
                fontWeight: 700,
                color: "#0f172a",
              }}
            >
              Delete toll gate?
            </h3>

            <p
              id="toll-delete-dialog-desc"
              style={{
                margin: "0 0 20px 0",
                fontSize: 14,
                color: "#64748b",
                lineHeight: 1.5,
              }}
            >
              Are you sure you want to delete{" "}
              <strong style={{ color: "#0f172a" }}>{deleteTarget.gate_name}</strong>{" "}
              ({deleteTarget.highway} - {deleteTarget.vehicle_class})? This action cannot be undone.
            </p>

            {deleteError && (
              <p
                role="alert"
                style={{
                  color: "#b91c1c",
                  fontSize: 13,
                  marginBottom: 16,
                  background: "#fee2e2",
                  padding: "8px 12px",
                  borderRadius: 6,
                  textAlign: "left",
                }}
              >
                {deleteError}
              </p>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: 12,
                marginTop: 20,
              }}
            >
              <button
                ref={deleteCancelBtnRef}
                type="button"
                disabled={deleting}
                onClick={handleCancelDelete}
                style={{
                  ...buttonStyle,
                  minWidth: 100,
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={deleting}
                onClick={handleConfirmDelete}
                style={{
                  ...buttonStyle,
                  background: "#dc2626",
                  borderColor: "#dc2626",
                  color: "#fff",
                  fontWeight: 600,
                  minWidth: 100,
                }}
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
