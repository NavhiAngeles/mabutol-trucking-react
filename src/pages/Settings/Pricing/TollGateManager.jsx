import { useCallback, useEffect, useState } from "react";
import {
  getTollGates,
  addTollGate,
  updateTollGate,
  deleteTollGate,
} from "../../../services/tollGateService";

const EMPTY_FORM = {
  gate_name: "",
  highway: "NLEX",
  vehicle_class: "Class 2",
  fee: "",
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
  fontSize: 13,
  fontWeight: 600,
  marginBottom: 16,
};

const buttonStyle = {
  border: "1px solid #cbd5e1",
  borderRadius: 6,
  padding: "8px 12px",
  cursor: "pointer",
  fontWeight: 600,
};

const formatPeso = (amount) =>
  Number(amount).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export default function TollGateManager({ isAdmin = false }) {
  const [tolls, setTolls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const [error, setError] = useState("");
  const [modalError, setModalError] = useState("");
  const [success, setSuccess] = useState("");

  const loadTolls = useCallback(async () => {
    setLoading(true);

    try {
      const records = await getTollGates();
      setTolls(records);
      setError("");
    } catch (err) {
      setError(err.message || "Failed to load toll gates.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTolls();
  }, [loadTolls]);

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

  const changeField = (field, value) => {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!isAdmin || saving) return;

    setSaving(true);
    setModalError("");
    setSuccess("");

    try {
      if (editingId) {
        await updateTollGate(editingId, form);
      } else {
        await addTollGate(form);
      }

      await loadTolls();

      setSuccess(
        editingId
          ? "Toll gate updated successfully."
          : "Toll gate added successfully."
      );

      setModalOpen(false);
      setEditingId(null);
    } catch (err) {
      setModalError(err.message || "Unable to save toll gate.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (toll) => {
    if (!isAdmin || saving) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete "${toll.gate_name}"?`
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
        Toll gate locations, vehicle classes, and fees stored
        directly in Supabase.
      </p>

      {error && (
        <p
          role="alert"
          style={{
            color: "#b91c1c",
            background: "#fef2f2",
            padding: 12,
            borderRadius: 6,
            marginBottom: 12,
          }}
        >
          {error}
        </p>
      )}

      {success && (
        <p
          role="status"
          style={{
            color: "#166534",
            background: "#f0fdf4",
            padding: 12,
            borderRadius: 6,
            marginBottom: 12,
          }}
        >
          {success}
        </p>
      )}

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
                Loading toll gate rates...
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
                        Edit
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

      <div className="toll-footer">
        <p>
          {isAdmin
            ? "Manage toll gate rates and locations."
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
            aria-labelledby="toll-modal-title"
            style={{
              width: "100%",
              maxWidth: 480,
              maxHeight: "90vh",
              overflowY: "auto",
              background: "#fff",
              borderRadius: 12,
              padding: 28,
              boxShadow: "0 20px 60px rgba(0,0,0,.25)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 22,
              }}
            >
              <h3
                id="toll-modal-title"
                style={{ margin: 0 }}
              >
                {editingId
                  ? "Edit Toll Gate"
                  : "Add New Toll Gate"}
              </h3>

              <button
                type="button"
                aria-label="Close popup"
                disabled={saving}
                onClick={closeModal}
                style={{
                  background: "transparent",
                  border: "none",
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
                  autoFocus
                  style={inputStyle}
                  placeholder="e.g. NLEX Bocaue"
                  value={form.gate_name}
                  onChange={(event) =>
                    changeField(
                      "gate_name",
                      event.target.value
                    )
                  }
                />
              </label>

              <label style={labelStyle}>
                Highway
                <select
                  required
                  style={inputStyle}
                  value={form.highway}
                  onChange={(event) =>
                    changeField(
                      "highway",
                      event.target.value
                    )
                  }
                >
                  {![
                    "NLEX",
                    "SLEX",
                    "SCTEX",
                    "TPLEX",
                    "CALAX",
                    "CAVITEX",
                    "STAR",
                    "OTHER",
                  ].includes(form.highway) && (
                    <option value={form.highway}>
                      {form.highway}
                    </option>
                  )}

                  <option value="NLEX">NLEX</option>
                  <option value="SLEX">SLEX</option>
                  <option value="SCTEX">SCTEX</option>
                  <option value="TPLEX">TPLEX</option>
                  <option value="CALAX">CALAX</option>
                  <option value="CAVITEX">CAVITEX</option>
                  <option value="STAR">STAR Tollway</option>
                  <option value="OTHER">Other</option>
                </select>
              </label>

              <label style={labelStyle}>
                Vehicle Class
                <select
                  required
                  style={inputStyle}
                  value={form.vehicle_class}
                  onChange={(event) =>
                    changeField(
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
                  type="number"
                  min="0"
                  step="0.01"
                  style={inputStyle}
                  placeholder="0.00"
                  value={form.fee}
                  onChange={(event) =>
                    changeField("fee", event.target.value)
                  }
                />
              </label>

              {modalError && (
                <p role="alert" style={{ color: "#b91c1c" }}>
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
                  onClick={closeModal}
                  disabled={saving}
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
                    color: "#fff",
                    borderColor: "#0b2a4a",
                  }}
                >
                  {saving
                    ? "Saving..."
                    : editingId
                      ? "Update Toll Gate"
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