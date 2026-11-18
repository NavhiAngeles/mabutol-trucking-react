export default function RowActionMenu({
  menuKey,
  isOpen,
  menuRef,
  menuPosition,
  buttonAriaLabel,
  editLabel,
  onOpenMenu,
  onEdit,
  onDocuments,
  onDelete,
}) {
  return (
    <div className="action-menu-wrapper" ref={isOpen ? menuRef : null}>
      <button
        type="button"
        className="action-dots-btn"
        aria-label={buttonAriaLabel}
        aria-expanded={isOpen}
        onClick={(e) => onOpenMenu(e, menuKey)}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="5" r="1.5" fill="currentColor" />
          <circle cx="12" cy="12" r="1.5" fill="currentColor" />
          <circle cx="12" cy="19" r="1.5" fill="currentColor" />
        </svg>
      </button>
      {isOpen && (
        <div
          className="action-dropdown"
          role="menu"
          style={menuPosition ? {
            position: "fixed",
            top: menuPosition.top,
            bottom: menuPosition.bottom,
            right: menuPosition.right,
            left: "auto",
            zIndex: 9999,
          } : undefined}
        >
          <button
            type="button"
            className="dropdown-item"
            role="menuitem"
            onClick={onEdit}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            <span>{editLabel}</span>
          </button>
          <button
            type="button"
            className="dropdown-item"
            role="menuitem"
            onClick={onDocuments}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            <span>Documents</span>
          </button>
          <button
            type="button"
            className="dropdown-item danger"
            role="menuitem"
            onClick={onDelete}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            <span>Delete</span>
          </button>
        </div>
      )}
    </div>
  );
}
