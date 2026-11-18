export default function PaginationFooter({
  entityLabel,
  paginationAriaLabel,
  pagesAriaLabel,
  previousAriaLabel,
  nextAriaLabel,
  totalItems,
  currentPage,
  pageCount,
  pageSize,
  disabled,
  onPageChange,
}) {
  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalItems);

  return (
    <div className="table-pagination-footer" role="navigation" aria-label={paginationAriaLabel}>
      <span className="pagination-summary">
        {totalItems === 0
          ? `Showing 0 of 0 ${entityLabel}`
          : `Showing ${start}–${end} of ${totalItems} ${entityLabel}`}
      </span>
      <nav className="pagination-controls-group" aria-label={pagesAriaLabel}>
        <button
          type="button"
          className="page-nav-btn page-nav-prev"
          disabled={disabled || currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
          aria-label={previousAriaLabel}
        >
          Previous
        </button>
        <span className="pagination-page-indicator" aria-live="polite">
          {`Page ${currentPage} of ${pageCount}`}
        </span>
        <button
          type="button"
          className="page-nav-btn page-nav-next"
          disabled={disabled || currentPage >= pageCount}
          onClick={() => onPageChange(currentPage + 1)}
          aria-label={nextAriaLabel}
        >
          Next
        </button>
      </nav>
    </div>
  );
}
