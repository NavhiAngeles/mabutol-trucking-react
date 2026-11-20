import { useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import PublicLayout from "../../components/PublicLayout";
import "./PublicPages.css";

const COMPARISON_ROWS = [
  {
    area: "Booking Intake",
    before: "Trip requests scattered across phone calls and SMS threads",
    after: "Pin-verified mobile bookings routed directly to the dispatch queue",
  },
  {
    area: "Rates & Compliance",
    before: "Manual toll estimates and paper-folder license or OR/CR checks",
    after: "Automated NLEX/SCTEX/TPLEX toll matrices plus expiring document alerts",
  },
  {
    area: "Transit Visibility",
    before: "Check-in calls for truck location with no unified timeline",
    after: "Foreground driver GPS sync and 4-milestone updates on the office map",
  },
  {
    area: "POD & Reconciliation",
    before: "Next-day physical receipt returns delaying billing and reports",
    after: "Same-day digital photo and signature POD in UTC+8 feeding CSV and PDF exports",
  },
];

const WORKFLOW_STAGES = [
  {
    step: "01",
    title: "Customer Booking & Quotation",
    surface: "Android App -> Web Dispatch",
    description:
      "Shippers submit scheduled Full Truckload (FTL) bookings 24 to 48 hours ahead with pickup and destination pins; office dispatchers rank candidate trucks and issue itemized, office-verified quotations.",
    artifactTitle: "Illustrative Scheduled FTL Quote Preview",
    artifactStatus: "Office Quoted",
    artifactBadgeTone: "info",
    artifactRows: [
      { label: "Corridor Route", value: "Peñaranda, NE -> Balagtas / Metro Manila" },
      { label: "Vehicle Class", value: "10-Wheeler Wing Van (Scheduled FTL)" },
      { label: "Quotation Basis", value: "Linehaul Tariff + Expressway Tolls + Optional Mobilization" },
    ],
  },
  {
    step: "02",
    title: "Automated Fleet & Compliance Check",
    surface: "Office Dispatcher -> Fleet Registry",
    description:
      "Dispatchers assign available drivers and vehicles while TANAW flags expiring driver licenses, medical/NBI clearances, or vehicle OR/CR documents.",
    artifactTitle: "Pre-Dispatch Readiness Gate",
    artifactStatus: "Checks Active",
    artifactBadgeTone: "verified",
    artifactRows: [
      { label: "Driver License & Medical/NBI", value: "Cleared before assignment" },
      { label: "Vehicle OR/CR & LTFRB", value: "Verified & within threshold" },
      { label: "Truck Maintenance Status", value: "Available (No active servicing)" },
    ],
  },
  {
    step: "03",
    title: "Live GPS Transit & Milestones",
    surface: "Driver Android -> MapLibre Console",
    description:
      "Drivers update trip stages (Heading to Pickup, Cargo Loaded, In Transit, Arrived) with foreground GPS coordinates synced to the dispatcher map.",
    artifactTitle: "Active Trip Telemetry (TRK-004 Verified)",
    artifactStatus: "In Transit",
    artifactBadgeTone: "transit",
    artifactRows: [
      { label: "Milestone Sequence", value: "Heading to Pickup -> Loaded -> In Transit -> Arrived" },
      { label: "GPS Sync Source", value: "Driver foreground telemetry + MapLibre route" },
      { label: "Trip Alerts (ALR-001)", value: "Status & arrival notifications pushed" },
    ],
  },
  {
    step: "04",
    title: "Digital Proof of Delivery (POD)",
    surface: "Driver Android -> Shipment Record",
    description:
      "Drivers capture drop-off photos and recipient signatures directly in the Android app, timestamped in Philippine Standard Time (UTC+8).",
    artifactTitle: "Verified POD Capture",
    artifactStatus: "POD Logged",
    artifactBadgeTone: "verified",
    artifactRows: [
      { label: "Evidence Attached", value: "Drop-off photo + recipient digital signature" },
      { label: "Audit Timestamp", value: "Asia/Manila (PHT, UTC+8)" },
      { label: "Customer Visibility", value: "Available in TANAW Mobile App & Web" },
    ],
  },
  {
    step: "05",
    title: "Audit Ledger & Reporting",
    surface: "Admin Console -> CSV / PDF Reports",
    description:
      "Completed trips, fuel logs, and driver allowances feed directly into immutable shipment records and exportable CSV/PDF reports.",
    artifactTitle: "Financial & Operational Reconciliation",
    artifactStatus: "Export Ready",
    artifactBadgeTone: "verified",
    artifactRows: [
      { label: "Cost Inputs", value: "Toll fees, fuel logs & driver allowances" },
      { label: "Record Integrity", value: "Immutable shipment ledger & audit trail" },
      { label: "Report Formats", value: "Formatted CSV & PDF operational exports" },
    ],
  },
];

const QA_VALIDATION_ITEMS = [
  {
    code: "IEEE 829 QA",
    metric: "49 / 51 Passed",
    detail: "End-to-end functional test cases verified across web dispatch and mobile client workflows.",
  },
  {
    code: "TRK-004 & ALR-001",
    metric: "Verified Live",
    detail: "Foreground driver GPS coordinate updates and status alert notifications validated during pilot testing.",
  },
  {
    code: "ISO/IEC 25010:2023",
    metric: "4.69 / 5.00 Mean",
    detail: "Nov 8–10, 2026 evaluation across 30 consented respondents with 98.2% Agree/Strongly Agree ratings.",
  },
];

export default function WorkflowPage() {
  const baseId = useId();
  const [activeIndex, setActiveIndex] = useState(0);
  const tabRefs = useRef([]);

  const activeStage = WORKFLOW_STAGES[activeIndex] || WORKFLOW_STAGES[0];

  const handleStageKeyDown = (event, index) => {
    const lastIndex = WORKFLOW_STAGES.length - 1;
    let nextIndex = null;

    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      nextIndex = index === lastIndex ? 0 : index + 1;
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      nextIndex = index === 0 ? lastIndex : index - 1;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = lastIndex;
    }

    if (nextIndex === null) return;
    event.preventDefault();
    setActiveIndex(nextIndex);
    tabRefs.current[nextIndex]?.focus();
  };

  return (
    <PublicLayout className="public-subpage">
      <section className="public-page-header">
        <div className="public-page-header-inner">
          <span className="public-page-eyebrow">
            DIGITAL DISPATCH PIPELINE &middot; ASIA/MANILA (UTC+8)
          </span>
          <h1>From Paper Logbooks to Real-Time Dispatch Visibility</h1>
          <p className="public-page-subtitle">
            How TANAW connects mobile shipper bookings, pre-dispatch compliance checks, highway telemetry, and financial reporting for Mabutol Trucking.
          </p>
        </div>
      </section>

      <section className="public-section" aria-labelledby="compare-heading">
        <h2 id="compare-heading" className="public-section-heading">
          Operational Shift: Manual Logbooks vs. TANAW
        </h2>
        <p className="public-section-lead">
          Each manual dispatch bottleneck mapped directly to the digital workflow inside TANAW.
        </p>

        <div className="workflow-diff-ledger">
          <div className="workflow-diff-head" aria-hidden="true">
            <span>Operational Area</span>
            <span>Before TANAW (Manual Logbooks)</span>
            <span>With TANAW (Digital Pipeline)</span>
          </div>

          {COMPARISON_ROWS.map((row) => (
            <article key={row.area} className="workflow-diff-row">
              <div className="workflow-diff-area">
                <h3>{row.area}</h3>
              </div>
              <div className="workflow-diff-cell is-before">
                <span className="workflow-diff-tag is-before">Before TANAW</span>
                <p>{row.before}</p>
              </div>
              <div className="workflow-diff-cell is-after">
                <span className="workflow-diff-tag is-after">With TANAW</span>
                <p>{row.after}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="public-section-muted" aria-labelledby="timeline-heading">
        <div className="public-section-inner">
          <h2 id="timeline-heading" className="public-section-heading">
            5-Stage End-to-End Operational Timeline
          </h2>
          <p className="public-section-lead">
            Select any stage below to inspect how data flows between shippers, dispatchers, drivers, and ledger reports.
          </p>

          <div className="workflow-explorer">
            <div
              className="workflow-stage-tablist"
              role="tablist"
              aria-label="Five operational dispatch stages"
            >
              {WORKFLOW_STAGES.map((stage, index) => {
                const isSelected = index === activeIndex;
                return (
                  <button
                    key={stage.step}
                    ref={(el) => { tabRefs.current[index] = el; }}
                    type="button"
                    role="tab"
                    id={`${baseId}-stage-tab-${stage.step}`}
                    aria-selected={isSelected}
                    aria-controls={`${baseId}-stage-panel`}
                    tabIndex={isSelected ? 0 : -1}
                    className={`workflow-stage-tab ${isSelected ? "is-selected" : ""}`}
                    onClick={() => setActiveIndex(index)}
                    onKeyDown={(e) => handleStageKeyDown(e, index)}
                  >
                    <span className="workflow-stage-num">{stage.step}</span>
                    <span className="workflow-stage-tab-text">
                      <strong>{stage.title}</strong>
                      <span>{stage.surface}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div
              role="tabpanel"
              id={`${baseId}-stage-panel`}
              aria-labelledby={`${baseId}-stage-tab-${activeStage.step}`}
              className="workflow-inspector-panel"
            >
              <div className="workflow-inspector-top">
                <div className="workflow-inspector-badges">
                  <span className="workflow-inspector-step">STAGE {activeStage.step} OF 05</span>
                  <span className="workflow-inspector-surface">{activeStage.surface}</span>
                </div>
                <h3>{activeStage.title}</h3>
                <p>{activeStage.description}</p>
              </div>

              <div className="workflow-artifact-box">
                <div className="workflow-artifact-head">
                  <span className="workflow-artifact-title">{activeStage.artifactTitle}</span>
                  <span className={`workflow-artifact-status is-${activeStage.artifactBadgeTone}`}>
                    {activeStage.artifactStatus}
                  </span>
                </div>

                <dl className="workflow-artifact-rows">
                  {activeStage.artifactRows.map((detail) => (
                    <div key={detail.label} className="workflow-artifact-row">
                      <dt>{detail.label}</dt>
                      <dd>{detail.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div className="workflow-inspector-nav">
                <button
                  type="button"
                  className="workflow-step-nav-btn"
                  disabled={activeIndex === 0}
                  onClick={() => setActiveIndex((prev) => Math.max(0, prev - 1))}
                >
                  Previous Stage
                </button>
                <button
                  type="button"
                  className="workflow-step-nav-btn"
                  disabled={activeIndex === WORKFLOW_STAGES.length - 1}
                  onClick={() => setActiveIndex((prev) => Math.min(WORKFLOW_STAGES.length - 1, prev + 1))}
                >
                  Next Stage
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="workflow-qa-band" aria-labelledby="qa-validation-heading">
        <div className="workflow-qa-band-inner">
          <div className="workflow-qa-band-header">
            <h2 id="qa-validation-heading">Pilot QA &amp; Functional Validation Summary</h2>
            <p>
              Verified prior to deployment through structured IEEE 829 functional testing and Mabutol Trucking pilot evaluation.
            </p>
          </div>

          <div className="workflow-qa-grid">
            {QA_VALIDATION_ITEMS.map((item) => (
              <article key={item.code} className="workflow-qa-card-dark">
                <span className="workflow-qa-code-dark">{item.code}</span>
                <strong className="workflow-qa-metric-dark">{item.metric}</strong>
                <p className="workflow-qa-detail-dark">{item.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="public-section" aria-label="Next actions">
        <div className="public-callout-band">
          <div className="public-callout-copy">
            <h2>Access the Dispatch Console or Field APK</h2>
            <p>
              Authorized office staff can sign in to manage live dispatches, or review the fleet specifications and Android app guide.
            </p>
          </div>
          <div className="public-callout-actions">
            <Link to="/login" className="public-btn-primary-on-dark">
              <span>Office Staff Sign In</span>
              <span aria-hidden="true">&rarr;</span>
            </Link>
            <Link to="/services" className="public-btn-secondary">
              View Fleet Matrix
            </Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
