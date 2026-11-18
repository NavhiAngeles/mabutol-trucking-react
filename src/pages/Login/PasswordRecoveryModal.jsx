import { useCallback, useEffect, useRef, useState } from "react";
import { PhoneRecovery } from "./PasswordRecovery";

function isOutsideDialog(event, dialog) {
  const rect = dialog.getBoundingClientRect();
  return (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  );
}

export default function PasswordRecoveryModal({ onClose }) {
  const dialogRef = useRef(null);
  const mountedRef = useRef(false);
  const busyRef = useRef(false);
  const pressedOutsideRef = useRef(false);
  const [busy, setBusy] = useState(false);

  const handleBusyChange = useCallback((nextBusy) => {
    busyRef.current = nextBusy;
    setBusy(nextBusy);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    if (!dialog.open) {
      dialog.showModal();
      dialog.querySelector("input:not([disabled])")?.focus();
    }
    return () => {
      mountedRef.current = false;
      if (dialog.open) {
        dialog.close();
      }
    };
  }, []);

  function handleCancel(event) {
    event.preventDefault();
    if (!busyRef.current) {
      onClose();
    }
  }

  function handleDialogClose(event) {
    // Ignore queued close events from React StrictMode cleanup while the dialog is still open or unmounted.
    if (!mountedRef.current || event.currentTarget.open || busyRef.current) {
      return;
    }
    onClose();
  }

  function handlePointerDown(event) {
    const dialog = dialogRef.current;
    if (!dialog || busyRef.current) {
      pressedOutsideRef.current = false;
      return;
    }
    pressedOutsideRef.current = isOutsideDialog(event, dialog);
  }

  function handlePointerUp(event) {
    const dialog = dialogRef.current;
    if (!dialog || busyRef.current || !pressedOutsideRef.current) {
      pressedOutsideRef.current = false;
      return;
    }
    pressedOutsideRef.current = false;
    if (isOutsideDialog(event, dialog)) {
      onClose();
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="recovery-modal-dialog"
      aria-labelledby="recovery-title"
      closedby={busy ? "none" : "any"}
      onCancel={handleCancel}
      onClose={handleDialogClose}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    >
      <PhoneRecovery inModal onClose={onClose} onBusyChange={handleBusyChange} />
    </dialog>
  );
}
