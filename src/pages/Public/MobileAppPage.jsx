import { Link } from "react-router-dom";
import PublicLayout from "../../components/PublicLayout";
import MobileShowcase from "./MobileShowcase";
import "./PublicPages.css";

const APK_DOWNLOAD_URL =
  "https://drive.google.com/file/d/1Vd2WSw1GeI8gfrxcvkHE2cUI3vBmWR0O/view";

const CUSTOMER_FEATURES = [
  "Pin-accurate pickup and destination map selection",
  "Instant or scheduled pickup time selection",
  "Vehicle class selection matched to cargo weight",
  "Live transit status and ETA tracking",
  "In-app notifications for dispatch updates",
  "Recorded drop-off photo and digital signature POD inspection",
];

const DRIVER_FEATURES = [
  "Assigned trip queue synced from office dispatch",
  "External turn-by-turn navigation launch with truck-ban and clearance notices",
  "6-step delivery milestone checklist from pickup to arrival",
  "Trip fuel and expense logging for office reconciliation",
  "In-transit issue and delay reporting",
  "Direct trip-scoped office message threads",
];

export default function MobileAppPage() {
  return (
    <PublicLayout className="public-subpage">
      <section className="public-page-header">
        <div className="public-page-header-inner">
          <span className="public-page-eyebrow">
            ANDROID 7.0+ &middot; MINSDK 24
          </span>
          <h1>TANAW Mobile for Customers &amp; Drivers</h1>
          <p className="public-page-subtitle">
            Built natively for Android 7.0+ (minSdk 24) to connect Mabutol Trucking shippers and road drivers directly to the dispatch console.
          </p>
        </div>
      </section>

      <section className="public-section" aria-labelledby="apk-download-heading">
        <div className="mobile-download-hero">
          <div className="mobile-download-left">
            <div className="mobile-download-info">
              <span className="mobile-download-tag">TANAW-MOBILE.APK</span>
              <h2 id="apk-download-heading">Install the Companion Android App</h2>
              <p className="mobile-download-lead">
                Install directly on your Android device or scan the QR badge with your phone camera to fetch the latest release package.
              </p>

              <ol className="mobile-install-steps">
                <li>Download <strong>Tanaw-Mobile.apk</strong> using the button below or the QR code.</li>
                <li>Allow APK installation from your browser or Android Files app when prompted.</li>
                <li>Sign in with your registered Mabutol Trucking phone number or email address.</li>
              </ol>
            </div>

            <div className="mobile-download-cta-row">
              <div className="mobile-apk-actions">
                <a
                  href={APK_DOWNLOAD_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="public-btn-primary-on-dark"
                >
                  <span>Download Tanaw-Mobile.apk</span>
                  <span aria-hidden="true">&rarr;</span>
                </a>
                <span className="mobile-apk-meta">Android 7.0+ (minSdk 24)</span>
              </div>

              <div className="mobile-qr-card">
                <div className="mobile-qr-white-box">
                  <img
                    src="/mobile-app-qr.jpg"
                    alt="QR code to download Tanaw-Mobile.apk for Android"
                    width="144"
                    height="144"
                    className="mobile-qr-img"
                    fetchPriority="high"
                  />
                </div>
                <span className="mobile-qr-caption">Scan with Android camera</span>
              </div>
            </div>
          </div>

          <div className="mobile-download-showcase">
            <MobileShowcase />
          </div>
        </div>
      </section>

      <section className="public-section-muted" aria-labelledby="roles-heading">
        <div className="public-section-inner">
          <h2 id="roles-heading" className="public-section-heading">
            Role-Specific Mobile Capabilities
          </h2>
          <p className="public-section-lead">
            One Android application adapts its workspace based on whether you sign in as a freight customer or an assigned Mabutol driver.
          </p>

          <div className="role-compare-grid">
            <article className="role-compare-card">
              <span className="role-badge is-customer">Customers &amp; Shippers</span>
              <h3>For Customers &amp; Shippers</h3>
              <ul className="role-compare-list">
                {CUSTOMER_FEATURES.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
            </article>

            <article className="role-compare-card">
              <span className="role-badge is-driver">Mabutol Drivers</span>
              <h3>For Mabutol Drivers</h3>
              <ul className="role-compare-list">
                {DRIVER_FEATURES.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
            </article>
          </div>
        </div>
      </section>

      <section className="public-section" aria-label="Additional public links">
        <div className="public-callout-band">
          <div className="public-callout-copy">
            <h2>Need Office Dispatch Access Instead?</h2>
            <p>
              Dispatchers and administrators manage bookings, fleet compliance, and financial reports from the web console.
            </p>
          </div>
          <div className="public-callout-actions">
            <Link to="/login" className="public-btn-primary-on-dark">
              <span>Office Staff Sign In</span>
              <span aria-hidden="true">&rarr;</span>
            </Link>
            <Link to="/services" className="public-btn-secondary">
              Inspect Vehicle Classes
            </Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
