import { Link } from "react-router-dom";
import PublicLayout from "../../components/PublicLayout";
import MobileShowcase from "../Public/MobileShowcase";
import "./Landing.css";

const HERO_TRUCK_PHOTO_URL =
  "https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=1200&q=80";

const BASELINE_METRICS = [
  {
    value: "Est. 2015",
    label: "San Josef, Peñaranda, Nueva Ecija Origin",
  },
  {
    value: "6 Truck Classes",
    label: "Wing Vans, Dropsides, Closed Vans & Elfs",
  },
  {
    value: "NLEX · SCTEX · TPLEX",
    label: "Nueva Ecija, Central Luzon & Metro Manila Routes",
  },
  {
    value: "UTC+8 Digital POD",
    label: "GPS Route Visibility & Verified Delivery Records",
  },
];

const COMPANY_PILLARS = [
  {
    title: "Rooted in Nueva Ecija since 2015",
    detail:
      "Founded in San Josef, Peñaranda, Nueva Ecija, Mabutol Trucking hauls agricultural harvests, commercial goods, and industrial cargo for clients within and outside the province.",
  },
  {
    title: "Coordinated fleet and dispatch operations",
    detail:
      "Office managers, dispatchers, and road drivers coordinate multi-class commercial trucks and closed vans to keep freight schedules dependable from pickup bay to destination.",
  },
  {
    title: "Centralized visibility through TANAW",
    detail:
      "TANAW replaces fragmented phone check-ins and paper trip logs with online schedule verification, itemized office quotations, live highway GPS monitoring, and digital Proof of Delivery.",
  },
];

const COMPANY_FACT_LEDGER = [
  { label: "Company Name", value: "Mabutol Trucking" },
  { label: "Base of Operations", value: "San Josef, Peñaranda, Nueva Ecija, Philippines" },
  { label: "Year Established", value: "2015" },
  { label: "Freight Service", value: "Scheduled Full Truckload (FTL) & Return-Load Backhaul" },
  { label: "Fleet Equipment", value: "Commercial cargo trucks & enclosed vans (2,500 kg to 12,000 kg)" },
  { label: "Route Coverage", value: "Nueva Ecija, Central Luzon & Metro Manila via NLEX, SCTEX, and TPLEX" },
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
      "Scheduled FTL booking intake, candidate truck selection, and driver assignment",
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
      "Live GPS route tracking from Nueva Ecija hubs to destination bays",
      "In-transit driver milestone updates and trip-scoped messaging",
      "Digital Proof of Delivery capture with drop-off photo and recipient signature",
    ],
    ctaLabel: "Get Mobile APK & Guide",
    to: "/mobile-app",
  },
];

export default function Landing() {
  return (
    <PublicLayout className="landing-page">
      <section className="landing-hero" id="hero">
        <div className="landing-hero-grid">
          <div className="landing-hero-content">
            <p className="landing-eyebrow">
              San Josef, Peñaranda, Nueva Ecija &middot; Est. 2015
            </p>
            <h1 className="landing-hero-title">
              Dedicated Full Truckload (FTL) Freight Dispatch
            </h1>
            <p className="landing-hero-subtitle">
              Mabutol Trucking has delivered dependable freight transport from San Josef, Peñaranda, Nueva Ecija since 2015. We coordinate scheduled Full Truckload (FTL) hauls within the province, across Central Luzon, and into Metro Manila with office-verified quotations, live GPS visibility, and digital Proof of Delivery.
            </p>

            <div className="landing-hero-ctas">
              <Link to="/login" className="landing-cta-primary">
                Office Staff Sign In
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

      <section
        className="landing-company-section"
        id="about-company"
        aria-labelledby="company-heading"
      >
        <div className="landing-company-inner">
          <div className="company-profile-grid">
            <div className="company-story-column">
              <h2 id="company-heading">About Mabutol Trucking</h2>
              <p className="company-story-lead">
                Established in 2015 in San Josef, Peñaranda, Nueva Ecija, Mabutol Trucking provides scheduled trucking and freight delivery services for agricultural, commercial, and industrial clients across Luzon.
              </p>

              <ul className="company-pillar-list">
                {COMPANY_PILLARS.map((pillar) => (
                  <li key={pillar.title} className="company-pillar-item">
                    <h3>{pillar.title}</h3>
                    <p>{pillar.detail}</p>
                  </li>
                ))}
              </ul>
            </div>

            <div className="company-ledger-card">
              <div className="company-ledger-head">
                <h3>Company &amp; Operations Profile</h3>
                <span className="company-ledger-loc">San Josef, Peñaranda, Nueva Ecija</span>
              </div>

              <dl className="company-ledger-list">
                {COMPANY_FACT_LEDGER.map((row) => (
                  <div key={row.label} className="company-ledger-row">
                    <dt>{row.label}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>

              <div className="company-ledger-actions">
                <Link to="/services" className="platform-card-link">
                  <span>Inspect Fleet &amp; Services</span>
                  <span aria-hidden="true">&rarr;</span>
                </Link>
                <Link to="/workflow" className="company-secondary-link">
                  Review Dispatch Workflow
                </Link>
              </div>
            </div>
          </div>
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
    </PublicLayout>
  );
}
