import { Link } from "react-router-dom";
import PublicLayout from "../../components/PublicLayout";
import MobileShowcase from "../Public/MobileShowcase";
import "./Landing.css";

const HERO_TRUCK_PHOTO_URL =
  "https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=1200&q=80";

const BASELINE_METRICS = [
  {
    value: "Est. 2015",
    label: "Peñaranda, Nueva Ecija Freight Operations",
  },
  {
    value: "6 Truck Classes",
    label: "Wing Vans, Dropsides, Closed Vans & Elfs",
  },
  {
    value: "4 User Roles",
    label: "Admin, Dispatcher, Driver & Customer Access",
  },
  {
    value: "4.69 / 5.00",
    label: "ISO/IEC 25010 Pilot Rating (n = 30)",
  },
];

const PLATFORM_HALVES = [
  {
    id: "web-console",
    audience: "Office & Admin",
    audienceTone: "navy",
    title: "Web Dispatch Console",
    description:
      "Manage daily freight operations from one browser workspace built for dispatchers, fleet coordinators, and administrators.",
    highlights: [
      "Scheduled FTL booking intake, ranked candidate truck selection, and driver assignment",
      "Office-verified quotation builder separating linehaul tariffs, expressway tolls, and mobilization fees",
      "Driver and vehicle compliance tracking across LTFRB, OR/CR, and license expiry",
      "Operational and financial summaries exported directly to CSV and PDF",
    ],
    ctaLabel: "Explore Operations Workflow",
    to: "/workflow",
  },
  {
    id: "android-app",
    audience: "Customers & Drivers",
    audienceTone: "orange",
    title: "TANAW Android App",
    description:
      "Connect shippers and road drivers directly to office dispatch through one companion Android APK.",
    highlights: [
      "Scheduled Full Truckload (FTL) bookings with 24h to 48h equipment lead times and office-verified quotes",
      "Live GPS route tracking from Cabanatuan hub to destination bays",
      "In-transit driver milestone updates and trip-scoped messaging",
      "Digital Proof of Delivery capture with drop-off photo and recipient signature",
    ],
    ctaLabel: "Get Mobile APK & Guide",
    to: "/mobile-app",
  },
];

const ISO_EVALUATION_SCORES = [
  { label: "Functional Suitability", score: 4.75, formatted: "4.75 / 5.00", isOverall: false },
  { label: "Safety", score: 4.75, formatted: "4.75 / 5.00", isOverall: false },
  { label: "Performance Efficiency", score: 4.73, formatted: "4.73 / 5.00", isOverall: false },
  { label: "Interaction Capability", score: 4.73, formatted: "4.73 / 5.00", isOverall: false },
  { label: "Compatibility", score: 4.72, formatted: "4.72 / 5.00", isOverall: false },
  { label: "Security", score: 4.72, formatted: "4.72 / 5.00", isOverall: false },
  { label: "Reliability", score: 4.68, formatted: "4.68 / 5.00", isOverall: false },
  { label: "Overall System Mean", score: 4.69, formatted: "4.69 / 5.00", isOverall: true },
];

const RESPONDENT_COMPOSITION = [
  "18 Staff",
  "5 Drivers",
  "5 IT Evaluators",
  "2 External",
];

const VERBATIM_FEEDBACK = [
  {
    id: "q21-1",
    topic: "UI Speed",
    verbatim: "Super bilis mag-response ng UI at maganda.",
    translation: "Very fast UI response and clean visual design.",
  },
  {
    id: "q21-2",
    topic: "Button Clarity",
    verbatim: "Good UI and clean, good button actions, no delay, and hindi gaano mahirap intindihin.",
    translation: "Clean UI with responsive button actions, zero lag, and easy to understand.",
  },
  {
    id: "q21-3",
    topic: "Zero Lag",
    verbatim: "Ayos ang UI, hindi gaanong delay ang pag-click, wala namang error.",
    translation: "Well-structured UI, responsive clicks with minimal delay, and error-free operation.",
  },
];

export default function Landing() {
  return (
    <PublicLayout className="landing-page">
      <section className="landing-hero" id="hero">
        <div className="landing-hero-grid">
          <div className="landing-hero-content">
            <span className="landing-eyebrow">
              PEÑARANDA, NUEVA ECIJA &middot; EST. 2015
            </span>
            <h1 className="landing-hero-title">
              Dedicated Full Truckload (FTL) Freight Dispatch
            </h1>
            <p className="landing-hero-subtitle">
              Mabutol Trucking coordinates scheduled Full Truckload (FTL) hauls from Peñaranda, Nueva Ecija across Central Luzon and Metro Manila with office-verified quotations, real-time GPS visibility, and digital Proof of Delivery.
            </p>

            <div className="landing-hero-ctas">
              <Link to="/login" className="landing-cta-primary">
                <span>Office Staff Sign In</span>
                <span aria-hidden="true">&rarr;</span>
              </Link>
              <Link to="/mobile-app" className="landing-cta-secondary">
                Get Mobile APK
              </Link>
            </div>
          </div>

          <div className="landing-hero-media">
            <figure className="hero-photo-frame">
              <img
                src={HERO_TRUCK_PHOTO_URL}
                alt="Commercial cargo freight truck operating along an open highway corridor"
                width="1200"
                height="750"
                className="hero-photo-img"
                fetchPriority="high"
                decoding="sync"
              />
              <figcaption className="hero-corridor-pill">
                <span className="hero-corridor-pin" aria-hidden="true" />
                <span className="hero-corridor-primary">NLEX &middot; SCTEX &middot; TPLEX CORRIDOR</span>
                <span className="hero-corridor-sep" aria-hidden="true">|</span>
                <span className="hero-corridor-secondary">GPS &amp; Digital POD Enabled</span>
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      <section className="landing-baseline-bar" aria-label="Mabutol Trucking Operational Baseline">
        <div className="landing-baseline-grid">
          {BASELINE_METRICS.map((item) => (
            <div key={item.value} className="baseline-metric-item">
              <strong className="baseline-metric-value">{item.value}</strong>
              <span className="baseline-metric-label">{item.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-platform-section" aria-labelledby="platform-heading">
        <div className="landing-platform-inner">
          <div className="landing-platform-header">
            <h2 id="platform-heading">Two Connected Surfaces for Mabutol Trucking</h2>
            <p>
              Office staff coordinate routes, tolls, and compliance on the web while drivers and freight clients track every trip on Android.
            </p>
          </div>

          <div className="platform-split-grid">
            {PLATFORM_HALVES.map((card) => (
              <article key={card.id} className="platform-card">
                <div className="platform-card-top">
                  <span className={`platform-audience-badge is-${card.audienceTone}`}>
                    {card.audience}
                  </span>
                  <h3>{card.title}</h3>
                  <p>{card.description}</p>
                </div>

                <ul className="platform-card-list">
                  {card.highlights.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>

                <div className="platform-card-footer">
                  <Link to={card.to} className="platform-card-link">
                    <span>{card.ctaLabel}</span>
                    <span aria-hidden="true">&rarr;</span>
                  </Link>
                </div>
              </article>
            ))}
          </div>

          <MobileShowcase variant="compact" />
        </div>
      </section>

      <section className="landing-evaluation-section" aria-labelledby="evaluation-heading">
        <div className="landing-evaluation-inner">
          <div className="landing-evaluation-header">
            <span className="landing-eyebrow">
              ISO/IEC 25010:2023 QUALITY EVALUATION &middot; NOV 8&ndash;10, 2026
            </span>
            <h2 id="evaluation-heading">
              Validated by Mabutol Trucking Staff, Drivers &amp; Technical Evaluators
            </h2>
            <p>
              Evaluated across 30 consented respondents (18 operations staff, 5 drivers, 5 IT evaluators, and 2 external users), with 98.2% of 549 eligible item ratings scoring Agree or Strongly Agree.
            </p>
          </div>

          <div className="evaluation-grid">
            <div className="evaluation-card evaluation-scores-card">
              <div className="evaluation-scores-main">
                <div className="evaluation-card-head">
                  <h3>ISO/IEC 25010 Category Scores</h3>
                  <span className="evaluation-scale-note">Mean Score out of 5.00 (n = 30)</span>
                </div>

                <ul className="evaluation-score-list">
                  {ISO_EVALUATION_SCORES.map((item) => {
                    const widthPct = `${(item.score / 5) * 100}%`;
                    return (
                      <li
                        key={item.label}
                        className={`evaluation-score-item ${item.isOverall ? "is-overall" : ""}`}
                      >
                        <div className="evaluation-score-row">
                          <span className="evaluation-score-label">{item.label}</span>
                          <span className="evaluation-score-value">{item.formatted}</span>
                        </div>
                        <div className="evaluation-bar-track" aria-hidden="true">
                          <div className="evaluation-bar-fill" style={{ width: widthPct }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="evaluation-composition-strip" aria-label="Respondent Composition">
                <span className="evaluation-composition-label">Respondent Mix</span>
                <div className="evaluation-composition-pills">
                  {RESPONDENT_COMPOSITION.map((group) => (
                    <span key={group} className="evaluation-composition-pill">
                      {group}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="evaluation-card evaluation-feedback-card">
              <div className="evaluation-card-head">
                <h3>Verbatim Respondent Feedback</h3>
                <span className="evaluation-disclosure-tag">
                  Anonymous Survey Export &middot; Q21: &ldquo;What did you like most about TANAW?&rdquo; (Nov 8&ndash;10, 2026)
                </span>
              </div>

              <div className="evaluation-quote-list">
                {VERBATIM_FEEDBACK.map((entry) => (
                  <figure key={entry.id} className="evaluation-quote-item">
                    <div className="evaluation-quote-top">
                      <blockquote className="evaluation-quote-verbatim">
                        <p>&ldquo;{entry.verbatim}&rdquo;</p>
                      </blockquote>
                      <span className="evaluation-quote-topic">{entry.topic}</span>
                    </div>
                    <figcaption className="evaluation-quote-translation">
                      <em>&ldquo;{entry.translation}&rdquo;</em>
                    </figcaption>
                  </figure>
                ))}
              </div>

              <p className="evaluation-qa-footnote">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                <span>
                  IEEE 829 Functional Verification: 49 / 51 Test Cases Passed (TRK-004 GPS &amp; ALR-001 Alerts Verified)
                </span>
              </p>
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
