import { useEffect, useId, useRef, useState } from "react";
import "./PhAddressAutocomplete.css";

const ChevronDownIcon = () => (
  <svg
    width={14}
    height={14}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const ClearIcon = () => (
  <svg
    width={14}
    height={14}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export default function PhAddressAutocomplete({
  id,
  name,
  label,
  value = "",
  onChange,
  onSelect,
  options = [],
  placeholder = "",
  disabled = false,
  required = false,
  emptyHint = "No PSGC match found — custom entry will be kept.",
  idleHint = "",
  className = "",
  autoComplete = "off",
}) {
  const generatedId = useId();
  const inputId = id || `ph-ac-${generatedId}`;
  const listboxId = `${inputId}-listbox`;

  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [openUpward, setOpenUpward] = useState(false);

  const clampedActiveIndex =
    !isOpen || options.length === 0
      ? -1
      : activeIndex >= options.length
        ? 0
        : activeIndex;

  useEffect(() => {
    if (!isOpen || typeof document === "undefined") return;
    function handleOutsidePointer(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsidePointer);
    return () => document.removeEventListener("mousedown", handleOutsidePointer);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || clampedActiveIndex < 0 || !listRef.current) return;
    const activeEl = listRef.current.children?.[clampedActiveIndex];
    if (activeEl && typeof activeEl.scrollIntoView === "function") {
      activeEl.scrollIntoView({ block: "nearest" });
    }
  }, [isOpen, clampedActiveIndex]);

  function computeDirection() {
    const el = containerRef.current;
    if (!el || typeof el.getBoundingClientRect !== "function") {
      setOpenUpward(false);
      return;
    }
    const rect = el.getBoundingClientRect();
    const scrollParent = el.closest?.(".customer-add-body");
    const boundaryBottom =
      scrollParent && typeof scrollParent.getBoundingClientRect === "function"
        ? scrollParent.getBoundingClientRect().bottom
        : typeof window !== "undefined"
          ? window.innerHeight
          : rect.bottom + 300;
    const boundaryTop =
      scrollParent && typeof scrollParent.getBoundingClientRect === "function"
        ? scrollParent.getBoundingClientRect().top
        : 0;

    const spaceBelow = boundaryBottom - rect.bottom;
    const spaceAbove = rect.top - boundaryTop;
    setOpenUpward(spaceBelow < 200 && spaceAbove > spaceBelow);
  }

  function openList(initialIndex = 0) {
    if (disabled) return;
    computeDirection();
    setIsOpen(true);
    setActiveIndex(options.length > 0 ? initialIndex : -1);
  }

  function selectOption(option) {
    if (!option || disabled) return;
    onSelect?.(option);
    setIsOpen(false);
    setActiveIndex(-1);
  }

  function handleInputChange(event) {
    const next = event.target.value;
    onChange?.(next);
    if (!isOpen) {
      computeDirection();
      setIsOpen(true);
    }
    setActiveIndex(0);
  }

  function handleKeyDown(event) {
    if (disabled) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!isOpen) {
        openList(0);
        return;
      }
      if (options.length > 0) {
        setActiveIndex((prev) => (prev < 0 ? 0 : (prev + 1) % options.length));
      }
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!isOpen) {
        openList(Math.max(0, options.length - 1));
        return;
      }
      if (options.length > 0) {
        setActiveIndex((prev) => (prev <= 0 ? options.length - 1 : prev - 1));
      }
      return;
    }

    if (event.key === "Enter") {
      if (isOpen && clampedActiveIndex >= 0 && options[clampedActiveIndex]) {
        event.preventDefault();
        selectOption(options[clampedActiveIndex]);
      }
      return;
    }

    if (event.key === "Escape") {
      if (isOpen) {
        event.preventDefault();
        event.stopPropagation();
        setIsOpen(false);
        setActiveIndex(-1);
      }
      return;
    }

    if (event.key === "Tab") {
      if (isOpen) {
        setIsOpen(false);
        setActiveIndex(-1);
      }
    }
  }

  function handleBlur(event) {
    const nextFocus = event?.relatedTarget;
    if (nextFocus && containerRef.current?.contains(nextFocus)) return;
    setIsOpen(false);
    setActiveIndex(-1);
  }

  function handleClear() {
    if (disabled) return;
    onChange?.("");
    setActiveIndex(0);
    inputRef.current?.focus?.();
    computeDirection();
    setIsOpen(true);
  }

  const trimmedValue = typeof value === "string" ? value.trim() : "";
  const showDropdown = isOpen && !disabled && (options.length > 0 || trimmedValue.length > 0 || Boolean(idleHint));

  return (
    <div
      ref={containerRef}
      className={`ph-ac-field ${className}`.trim()}
    >
      <label className="ph-ac-label" htmlFor={inputId}>
        {label}
        {required && (
          <>
            {" "}
            <span className="field-required">*</span>
          </>
        )}
      </label>

      <div className={`ph-ac-control ${isOpen ? "is-open" : ""}`}>
        <input
          ref={inputRef}
          id={inputId}
          name={name}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={Boolean(showDropdown)}
          aria-controls={listboxId}
          aria-activedescendant={
            showDropdown && clampedActiveIndex >= 0
              ? `${listboxId}-opt-${clampedActiveIndex}`
              : undefined
          }
          className="ph-ac-input"
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          autoComplete={autoComplete}
          autoCorrect="off"
          spellCheck={false}
          onFocus={() => openList(0)}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
        />

        <div className="ph-ac-adornments">
          {trimmedValue && !disabled && (
            <button
              type="button"
              className="ph-ac-clear-btn"
              tabIndex={-1}
              aria-label={`Clear ${label}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleClear}
            >
              <ClearIcon />
            </button>
          )}
          <button
            type="button"
            className={`ph-ac-toggle-btn ${showDropdown ? "is-open" : ""}`}
            tabIndex={-1}
            aria-label={`Toggle ${label} suggestions`}
            disabled={disabled}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              if (isOpen) {
                setIsOpen(false);
              } else {
                inputRef.current?.focus?.();
                openList(0);
              }
            }}
          >
            <ChevronDownIcon />
          </button>
        </div>

        {showDropdown && (
          <div className={`ph-ac-popover ${openUpward ? "is-upward" : ""}`}>
            {options.length > 0 ? (
              <ul
                ref={listRef}
                id={listboxId}
                role="listbox"
                aria-label={`${label} suggestions`}
                className="ph-ac-listbox"
              >
                {options.map((opt, index) => {
                  const isActive = index === clampedActiveIndex;
                  return (
                    <li
                      key={opt.id || `${opt.label}-${index}`}
                      id={`${listboxId}-opt-${index}`}
                      role="option"
                      aria-selected={isActive}
                      className={`ph-ac-option ${isActive ? "is-active" : ""}`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        selectOption(opt);
                      }}
                      onMouseEnter={() => setActiveIndex(index)}
                    >
                      <span className="ph-ac-option-title">{opt.label}</span>
                      {opt.subtitle && (
                        <span className="ph-ac-option-subtitle">{opt.subtitle}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div
                id={listboxId}
                role="status"
                className="ph-ac-empty"
              >
                {trimmedValue ? emptyHint : idleHint}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
