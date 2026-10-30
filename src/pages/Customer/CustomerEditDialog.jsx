import { useEffect, useRef, useState } from "react";
import { customerEditValues, updateCustomer } from "../../services/customerService";

const labels = { name: "Customer name", email: "Contact email", phone: "Contact number", address: "Street address", barangay: "Barangay", city: "City / municipality", province: "Province" };

export default function CustomerEditDialog({ customer, onClose, onSaved }) {
  const dialogRef = useRef(null);
  const locked = useRef(false);
  const alive = useRef(true);
  const [values, setValues] = useState(() => customerEditValues(customer));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dirty = JSON.stringify(values) !== JSON.stringify(customerEditValues(customer));

  useEffect(() => {
    alive.current = true;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current.showModal();
    return () => {
      alive.current = false;
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);

  function close() {
    if (!locked.current && (!dirty || window.confirm("Discard unsaved customer changes?"))) onClose();
  }

  async function submit(event) {
    event.preventDefault();
    if (locked.current) return;
    locked.current = true;
    setSaving(true); setError("");
    try {
      const saved = await updateCustomer(customer, values);
      if (alive.current) onSaved(saved);
    } catch (err) {
      if (alive.current) setError(err.message);
    } finally {
      locked.current = false;
      if (alive.current) setSaving(false);
    }
  }

  return <dialog ref={dialogRef} className="customer-edit-dialog" aria-labelledby="customer-edit-title" aria-describedby="customer-edit-description" onCancel={event => { event.preventDefault(); close(); }}>
    <form onSubmit={submit} aria-busy={saving}>
      <div className="cp-modal-header">
        <h2 id="customer-edit-title" className="cp-modal-title">Edit Customer</h2>
        <button type="button" className="cp-close-btn" aria-label="Close edit customer" disabled={saving} onClick={close}>✕</button>
      </div>
      <div className="customer-edit-body">
        <p id="customer-edit-description">Update this customer’s contact details and address.</p>
        <div className="customer-edit-fields">
          {Object.entries(labels).map(([key, label]) => <label key={key} htmlFor={`customer-edit-${key}`}>
            {label}{key === "name" ? " *" : ""}
            <input id={`customer-edit-${key}`} name={key} type={key === "email" ? "email" : key === "phone" ? "tel" : "text"} required={key === "name"} autoFocus={key === "name"} disabled={saving} value={values[key]} onChange={event => setValues(current => ({ ...current, [key]: event.target.value }))} />
          </label>)}
        </div>
        {error && <p className="customer-edit-error" role="alert">{error}</p>}
      </div>
      <div className="customer-edit-footer">
        <button type="button" className="filter-btn" disabled={saving} onClick={close}>Cancel</button>
        <button type="submit" className="btn-export" disabled={saving || !dirty}>{saving ? "Saving…" : "Save Changes"}</button>
      </div>
    </form>
  </dialog>;
}
