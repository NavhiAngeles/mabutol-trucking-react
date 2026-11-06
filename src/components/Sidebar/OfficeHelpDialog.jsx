import { useEffect, useRef } from "react";

const UNPUBLISHED = "Not yet published — company policy pending";

// Guidance mirrors guards already enforced by the booking, pricing and assignment code.
// It is reference text only; the server-side checks remain authoritative.
const HELP_SECTIONS = [
  {
    id: "booking-review",
    title: "Booking review",
    items: [
      "Only active staff and admin accounts can review, edit or assign shipments.",
      "Customer-submitted mobile requests keep their submitted terms; there is no re-consent workflow, so office staff cannot change them.",
      "Office-created pending requests may change cargo, weight, vehicle type, handling, departure and instructions. Changing terms clears the existing quote, so price it again.",
      "Booked shipments and assigned shipments whose trip has not started allow instruction changes only. Started trips are locked.",
      "If a save reports that the shipment changed, reload it and review the latest version before trying again.",
    ],
  },
  {
    id: "toll-pricing",
    title: "Toll pricing rules",
    items: [
      "Leave “Use toll roads / expressways” unchecked to avoid toll roads. Changing it recalculates the route, distance and travel time.",
      "Toll fees are matched automatically from the selected truck type’s toll class, the calculated route and rates configured by an administrator in Settings → Pricing. No manual class or fee selection is needed.",
      "“Fee pending” means no configured rate matches the exact route. Confirmation and price override stay disabled until the fee is ready; unsupported entry–exit pairs are never estimated. After a rate is saved, refresh toll rates.",
      "Rates labelled [PDF reference] are reference figures, not independently verified current tariffs.",
      "A toll fee does not confirm that the truck can physically use that road.",
    ],
  },
  {
    id: "manual-dispatch",
    title: "Manual dispatch eligibility",
    items: [
      "Assign only booked shipments without an active delivery, and record a reason.",
      "Truck: available, exact requested vehicle type, recorded capacity at least the shipment weight, no active maintenance, not reserved by another delivery and current approved compliance documents.",
      "Driver: available, not reserved by another delivery and current approved compliance documents. Mobile bookings also need an active driver account.",
      "Reassignment is allowed only before pickup or route activity begins. Active or started trips cannot be reassigned.",
      "If no eligible pair appears, review Fleet availability, maintenance, reservations and Compliance instead of bypassing the checks.",
    ],
  },
];

const SUPPORT_CONTACTS = ["Dispatch hotline", "Support email", "Office hours", "After-hours escalation"];

export default function OfficeHelpDialog({ onClose }) {
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

  return (
    <dialog ref={dialogRef} className="office-help-dialog" aria-modal="true" aria-labelledby="office-help-title" aria-describedby="office-help-summary"
      onCancel={event => { event.preventDefault(); onClose(); }}
      onKeyDown={event => {
        if (event.key !== "Tab") return;
        const focusable = [...event.currentTarget.querySelectorAll('button, [tabindex="0"]')];
        const destination = event.shiftKey && document.activeElement === focusable[0] ? focusable.at(-1)
          : !event.shiftKey && document.activeElement === focusable.at(-1) ? focusable[0] : null;
        if (destination) { event.preventDefault(); destination.focus(); }
      }}>
      <header className="office-help-header">
        <h2 id="office-help-title">Office Help &amp; Operations Guide</h2>
        <button type="button" className="office-help-close" aria-label="Close help guide" autoFocus onClick={onClose}>×</button>
      </header>
      <div className="office-help-body" tabIndex={0} role="region" aria-label="Guide contents">
        <p id="office-help-summary">Quick reference for office staff. System checks always take precedence over this guide.</p>
        {HELP_SECTIONS.map(section => (
          <section key={section.id} aria-labelledby={`office-help-${section.id}`}>
            <h3 id={`office-help-${section.id}`}>{section.title}</h3>
            <ul>{section.items.map(item => <li key={item}>{item}</li>)}</ul>
          </section>
        ))}
        <section aria-labelledby="office-help-support">
          <h3 id="office-help-support">Support contacts</h3>
          <p className="office-help-unpublished">These contacts have not been published by the company. Ask your supervisor until they are available.</p>
          <dl className="office-help-contacts">
            {SUPPORT_CONTACTS.map(label => (
              <div key={label}><dt>{label}</dt><dd className="office-help-unpublished">{UNPUBLISHED}</dd></div>
            ))}
          </dl>
        </section>
      </div>
      <div className="office-help-actions">
        <button type="button" className="btn-modal-no" onClick={onClose}>Close</button>
      </div>
    </dialog>
  );
}
