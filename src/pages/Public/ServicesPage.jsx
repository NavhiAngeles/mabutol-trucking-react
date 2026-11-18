import { Link } from "react-router-dom";
import PublicLayout from "../../components/PublicLayout";
import VehicleSilhouette from "../../components/VehicleSilhouette/VehicleSilhouette";
import "./PublicPages.css";

const SERVICE_TIERS = [
  {
    id: "ftl",
    tag: "DEDICATED UNIT ALLOCATION",
    title: "Full Truckload (FTL)",
    description:
      "Dedicated unit allocation for agricultural, industrial, and commercial cargo with direct point-to-point scheduling from Cabanatuan and Peñaranda across Luzon expressways.",
    imageUrl:
      "https://images.unsplash.com/photo-1591768793355-74d04bb6608f?auto=format&fit=crop&w=1200&q=80",
    imageAlt: "Heavy flatbed cargo truck hauling wrapped agricultural and industrial freight along a highway",
  },
  {
    id: "backhaul",
    tag: "BACKHAUL & EMPTY-MILE REDUCTION",
    title: "Return-Load & Backhaul Optimization",
    description:
      "Match completed outbound Full Truckload (FTL) deliveries with return freight toward Nueva Ecija to minimize empty return miles across Central Luzon and Metro Manila corridors.",
    imageUrl:
      "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=1200&q=80",
    imageAlt: "Palletized return-load cargo staged inside a regional distribution warehouse",
  },
];

const FLEET_VEHICLE_CLASSES = [
  {
    name: "10-Wheeler Wing Van",
    category: "wing_van_10w",
    configuration: "Enclosed",
    capacity: "Up to 12,000 kg",
    usage: "High-volume palletized cargo and regional trunk deliveries",
  },
  {
    name: "Heavy Truck",
    category: "Heavy Truck",
    configuration: "Heavy Cargo",
    capacity: "Up to 10,000 kg",
    usage: "Bulk agricultural harvests, industrial supplies, and long-haul FTL",
  },
  {
    name: "6-Wheeler / Forward Dropside",
    category: "dropside",
    configuration: "Open / Enclosed",
    capacity: "6,000 to 8,000 kg",
    usage: "Side-loaded materials, machinery, and flexible regional drops",
  },
  {
    name: "Medium Truck",
    category: "Medium Truck",
    configuration: "Regional Linehaul",
    capacity: "Up to 4,000 kg",
    usage: "Inter-province retail restocking across Central Luzon corridors",
  },
  {
    name: "Closed Van",
    category: "closed_van",
    configuration: "Enclosed",
    capacity: "Up to 3,000 kg",
    usage: "Weather-protected dry goods, boxed parcels, and commercial stock",
  },
  {
    name: "Elf / 4-Wheeler",
    category: "elf_4w",
    configuration: "Enclosed",
    capacity: "Up to 2,500 kg",
    usage: "Urban Metro Manila delivery windows and narrow-access drop-offs",
  },
];

export default function ServicesPage() {
  return (
    <PublicLayout className="public-subpage">
      <section className="public-page-header">
        <div className="public-page-header-inner">
          <span className="public-page-eyebrow">
            NLEX &middot; SCTEX &middot; TPLEX ARTERIAL COVERAGE
          </span>
          <h1>Freight Services &amp; Fleet Specifications</h1>
          <p className="public-page-subtitle">
            Serving Peñaranda, Cabanatuan, Nueva Ecija, Bulacan, Pampanga, and Metro Manila via NLEX, SCTEX, and TPLEX.
          </p>
        </div>
      </section>

      <section className="public-section" aria-labelledby="service-tiers-heading">
        <h2 id="service-tiers-heading" className="public-section-heading">
          Service Tiers
        </h2>
        <p className="public-section-lead">
          Dedicated Full Truckload (FTL) unit dispatch paired with return-load backhaul planning across Central Luzon and Metro Manila.
        </p>

        <div className="services-tier-grid">
          {SERVICE_TIERS.map((tier, index) => (
            <article key={tier.id} className="service-tier-card">
              <div className="service-tier-media">
                <img
                  src={tier.imageUrl}
                  alt={tier.imageAlt}
                  width="1200"
                  height="750"
                  className="service-tier-img"
                  fetchPriority={index === 0 ? "high" : undefined}
                  loading={index === 0 ? "eager" : "lazy"}
                />
              </div>
              <div className="service-tier-body">
                <span className="service-tier-tag">{tier.tag}</span>
                <h2>{tier.title}</h2>
                <p>{tier.description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="public-section-muted" aria-labelledby="fleet-matrix-heading">
        <div className="public-section-inner">
          <h2 id="fleet-matrix-heading" className="public-section-heading">
            Fleet Vehicle Matrix
          </h2>
          <p className="public-section-lead">
            Six vehicle classes configured in TANAW to match cargo payload limits, expressway toll tiers, and body enclosure requirements.
          </p>

          <div
            tabIndex={0}
            role="region"
            aria-labelledby="fleet-matrix-caption"
            className="fleet-table-wrapper"
          >
            <table className="fleet-matrix-table">
              <caption id="fleet-matrix-caption">
                TANAW six configured vehicle classes with enclosure configuration and payload capacities
              </caption>
              <thead>
                <tr>
                  <th scope="col">Vehicle Class</th>
                  <th scope="col">Configuration</th>
                  <th scope="col">Payload Capacity</th>
                  <th scope="col">Operational Use</th>
                </tr>
              </thead>
              <tbody>
                {FLEET_VEHICLE_CLASSES.map((vehicle) => (
                  <tr key={vehicle.name}>
                    <th scope="row">
                      <span className="fleet-class-cell">
                        <span className="fleet-silhouette-wrap">
                          <VehicleSilhouette category={vehicle.category} size="sm" decorative />
                        </span>
                        <span>{vehicle.name}</span>
                      </span>
                    </th>
                    <td>
                      <span className="fleet-config-badge">{vehicle.configuration}</span>
                    </td>
                    <td>
                      <span className="fleet-capacity-mono">{vehicle.capacity}</span>
                    </td>
                    <td>{vehicle.usage}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="public-section" aria-label="Book freight via mobile app">
        <div className="public-callout-band">
          <div className="public-callout-copy">
            <h2>Ready to Book a Shipment with Mabutol Trucking?</h2>
            <p>
              Select your vehicle class, pin pickup and destination coordinates, and track active freight directly in the TANAW Android app.
            </p>
          </div>
          <div className="public-callout-actions">
            <Link to="/mobile-app" className="public-btn-primary-on-dark">
              <span>Book via TANAW Mobile App</span>
              <span aria-hidden="true">&rarr;</span>
            </Link>
            <Link to="/workflow" className="public-btn-secondary">
              View Dispatch Workflow
            </Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
