import { useEffect, useRef } from 'react';

export default function ShipmentDiscardDialog({ onKeepEditing, onDiscard }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const trigger = document.activeElement;
    const dialog = dialogRef.current;
    dialog.showModal();
    return () => {
      dialog.close();
      if (trigger?.isConnected) trigger.focus();
    };
  }, []);

  return <dialog ref={dialogRef} className="shipment-discard-dialog" role="alertdialog"
    aria-modal="true" aria-labelledby="shipment-discard-title" aria-describedby="shipment-discard-description"
    onCancel={event => { event.preventDefault(); onKeepEditing(); }}
    onKeyDown={event => {
      if (event.key !== 'Tab') return;
      const buttons = [...event.currentTarget.querySelectorAll('button')];
      const destination = event.shiftKey && document.activeElement === buttons[0] ? buttons.at(-1)
        : !event.shiftKey && document.activeElement === buttons.at(-1) ? buttons[0] : null;
      if (destination) { event.preventDefault(); destination.focus(); }
    }}>
    <div className="shipment-discard-icon" aria-hidden="true">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" />
      </svg>
    </div>
    <h2 id="shipment-discard-title">Discard this shipment?</h2>
    <p id="shipment-discard-description">Your shipment hasn’t been saved. Discarding it will remove the details you’ve entered.</p>
    <div className="shipment-discard-actions">
      <button type="button" className="shipment-discard-keep" autoFocus onClick={onKeepEditing}>Keep editing</button>
      <button type="button" className="shipment-discard-confirm" onClick={onDiscard}>Discard shipment</button>
    </div>
  </dialog>;
}
