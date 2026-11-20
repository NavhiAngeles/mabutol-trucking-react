import { useMemo, useState } from "react";
import StrikeStatusIndicator from "../../components/StrikeStatusIndicator/StrikeStatusIndicator";
import { SkeletonTableRows } from "../../components/Skeleton/Skeleton";
import { formatManilaDateTime } from "../../services/customerStandingService";

const STATUS_TABS = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All Appeals" },
];

export default function CustomerAppealsTab({
  appeals = [],
  customersById = new Map(),
  loading = false,
  error = "",
  query = "",
  canEdit = false,
  onRefresh,
  onOpenProfile,
  onSelectReview,
}) {
  const [statusFilter, setStatusFilter] = useState("pending");

  const counts = useMemo(() => {
    const map = { pending: 0, approved: 0, rejected: 0, all: appeals.length };
    for (const appeal of appeals) {
      const s = String(appeal?.status || "pending").toLowerCase();
      if (s === "pending") map.pending++;
      else if (s === "approved") map.approved++;
      else if (s === "rejected") map.rejected++;
    }
    return map;
  }, [appeals]);

  const filteredAppeals = useMemo(() => {
    const q = query.trim().toLowerCase();
    return appeals.filter((appeal) => {
      const status = String(appeal?.status || "pending").toLowerCase();
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (!q) return true;
      const cust = customersById.get(appeal.customer_id);
      return (
        (cust?.name && cust.name.toLowerCase().includes(q)) ||
        (cust?.customer_code && cust.customer_code.toLowerCase().includes(q)) ||
        (cust?.email && cust.email.toLowerCase().includes(q)) ||
        (appeal.contact_number && appeal.contact_number.toLowerCase().includes(q)) ||
        (appeal.reason && appeal.reason.toLowerCase().includes(q))
      );
    });
  }, [appeals, customersById, query, statusFilter]);

  return (
    <div className="appeals-queue-panel">
      <div className="appeals-filter-row" role="group" aria-label="Filter suspension appeals by status">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`strike-chip ${statusFilter === tab.key ? "is-active" : ""}`}
            aria-pressed={statusFilter === tab.key}
            onClick={() => setStatusFilter(tab.key)}
          >
            <span>{tab.label}</span>
            <span className="strike-chip-count tabular-nums">{counts[tab.key]}</span>
          </button>
        ))}
      </div>

      {error && (
        <div className="customer-load-error" role="alert">
          Unable to load suspension appeals: {error}{" "}
          <button type="button" className="filter-btn" onClick={onRefresh}>
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="customer-table-card" aria-busy="true">
          <p className="sr-only" role="status">Loading suspension appeals...</p>
          <div className="customer-table-scroll">
            <table className="customer-table">
              <tbody>
                <SkeletonTableRows
                  rows={4}
                  columns={["avatar-stack", "short", "text", "short", "action"]}
                />
              </tbody>
            </table>
          </div>
        </div>
      ) : filteredAppeals.length === 0 ? (
        <div className="appeals-empty-state">
          <p className="appeals-empty-title">
            {statusFilter === "pending"
              ? "No pending suspension appeals."
              : "No appeals match the selected filter."}
          </p>
          <p className="appeals-empty-hint">
            {statusFilter === "pending"
              ? "Customers suspended after 3 confirmed no-show strikes can submit an appeal from Tanaw Mobile."
              : "Switch back to All Appeals or clear your search query to view historical reviews."}
          </p>
          {statusFilter !== "all" && (
            <button
              type="button"
              className="filter-btn"
              onClick={() => setStatusFilter("all")}
            >
              Show All Appeals
            </button>
          )}
        </div>
      ) : (
        <div className="appeals-list">
          {filteredAppeals.map((appeal) => {
            const cust = customersById.get(appeal.customer_id);
            const status = String(appeal.status || "pending").toLowerCase();
            const strikeHistory = cust?.strikeHistory || [];
            return (
              <article key={appeal.id} className="appeal-card">
                <div className="appeal-card-header">
                  <div className="appeal-card-customer">
                    <div className="appeal-card-title-row">
                      <h3 className="appeal-customer-name">{cust?.name || "Customer account"}</h3>
                      {cust?.customer_code && (
                        <span className="appeal-customer-code tabular-nums">{cust.customer_code}</span>
                      )}
                      <span className={`appeal-status-pill is-${status}`}>
                        {status === "pending" ? "Pending review" : status === "approved" ? "Approved (Reinstated)" : "Rejected"}
                      </span>
                    </div>
                    <div className="appeal-meta-line">
                      <span className="tabular-nums">Submitted: {formatManilaDateTime(appeal.created_at)}</span>
                      {appeal.contact_number && (
                        <span className="tabular-nums">Contact: {appeal.contact_number}</span>
                      )}
                      {cust?.suspended_at && (
                        <span className="tabular-nums">Suspended: {formatManilaDateTime(cust.suspended_at)}</span>
                      )}
                    </div>
                  </div>
                  <div className="appeal-card-strikes">
                    <span className="appeal-strikes-label">Strike standing</span>
                    <StrikeStatusIndicator
                      customer={cust}
                      strikeCount={cust?.noShowStrikeCount ?? strikeHistory.length}
                      size="sm"
                      onClick={cust ? () => onOpenProfile?.(cust) : null}
                    />
                  </div>
                </div>

                <div className="appeal-reason-box">
                  <div className="appeal-section-kicker">Customer Reason</div>
                  <p className="appeal-reason-text">{appeal.reason}</p>
                </div>

                {strikeHistory.length > 0 && (
                  <div className="appeal-strikes-strip">
                    <div className="appeal-section-kicker">Confirmed No-Show Strikes ({strikeHistory.length})</div>
                    <div className="appeal-strike-chips">
                      {strikeHistory.map((strike) => (
                        <span key={strike.id} className="appeal-strike-pill tabular-nums">
                          Strike #{strike.strike_number}
                          {strike.trackingNumber ? ` (${strike.trackingNumber})` : ""}
                          {" : "}
                          {formatManilaDateTime(strike.confirmed_at)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {appeal.reviewed_at && (
                  <div className="appeal-review-meta">
                    <span className="tabular-nums">
                      Reviewed: {formatManilaDateTime(appeal.reviewed_at)}
                    </span>
                    {appeal.admin_notes && (
                      <p className="appeal-admin-notes">Admin notes: {appeal.admin_notes}</p>
                    )}
                  </div>
                )}

                <div className="appeal-card-actions">
                  {cust && (
                    <button
                      type="button"
                      className="filter-btn"
                      onClick={() => onOpenProfile?.(cust)}
                    >
                      View Profile & Strikes
                    </button>
                  )}
                  {canEdit && status === "pending" && (
                    <div className="appeal-decision-btns">
                      <button
                        type="button"
                        className="btn-appeal-reject"
                        onClick={() => onSelectReview?.(appeal, cust, "reject")}
                      >
                        Reject Appeal
                      </button>
                      <button
                        type="button"
                        className="btn-appeal-approve"
                        onClick={() => onSelectReview?.(appeal, cust, "approve")}
                      >
                        Approve & Reinstate
                      </button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
