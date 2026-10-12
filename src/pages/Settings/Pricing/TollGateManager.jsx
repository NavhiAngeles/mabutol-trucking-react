import { useCallback, useEffect, useState } from "react";
import {
  getTollGates,
  addTollGate,
  updateTollGate,
  deleteTollGate,
  getCurrentPricingUser,
} from "../../../services/tollGateService";

const EMPTY_FORM = {
  gate_name: "",
  highway: "NLEX",
  vehicle_class: "Class 2",
  fee: "",
};

const formatPeso = (value) =>
  Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const buttonStyle = {
  border: "1px solid #cbd5e1",
  borderRadius: 6,
  padding: "8px 12px",
  cursor: "pointer",
  fontWeight: 600,
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
  fontSize: 13,
  fontWeight: 600,
};

export default function TollGateManager() {
  const [tolls, setTolls] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

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
      gate_name: toll.gate_name,
      highway: toll.highway,
      vehicle_class: toll.vehicle_class,
      fee: String(toll.fee),
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

  const handleDelete = async (toll) => {
    if (!isAdmin || saving) return;

    const confirmed = window.confirm(
      `Delete "${toll.gate_name}" permanently?`
    );

    if (!confirmed) return;

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      await deleteTollGate(toll.id);
      await loadTolls();
      setSuccess("Toll gate deleted successfully.");
    } catch (err) {
      setError(err.message || "Unable to delete toll gate.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-card">
      <div className="card-header">
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
              {isAdmin && <th>ACTIONS</th>}
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
                    {toll.gate_name}
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
                    <td>
                      <div
                        style={{
                          display: "flex",
                          gap: 6,
                          flexWrap: "wrap",
                        }}
                      >
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => openEditModal(toll)}
                          style={{
                            ...buttonStyle,
                            background: "#eff6ff",
                            color: "#1d4ed8",
                          }}
                        >
                          ✎ Edit Price
                        </button>

                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => handleDelete(toll)}
                          style={{
                            ...buttonStyle,
                            background: "#fef2f2",
                            color: "#b91c1c",
                          }}
                        >
                          Delete
                        </button>
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
                  placeholder="Enter toll gate name"
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
                  <option value="SLEX">SLEX</option>
                  <option value="SCTEX">SCTEX</option>
                  <option value="TPLEX">TPLEX</option>
                  <option value="CALAX">CALAX</option>
                  <option value="CAVITEX">CAVITEX</option>
                  <option value="STAR">STAR</option>
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
                    updateField(
                      "vehicle_class",
                      event.target.value
                    )
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
    </div>
  );
}