import { useId, useMemo, useRef, useState } from "react";

function customerLabel(customer) {
  return (
    customer?.company_name ||
    customer?.business_name ||
    customer?.full_name ||
    customer?.name ||
    String(customer?.id ?? "")
  );
}

function customerMeta(customer) {
  const contact = customer?.phone || customer?.contact_number;
  const location = [customer?.city, customer?.province].filter(Boolean).join(", ");
  return [customer?.customer_code, contact, location || customer?.email]
    .filter(Boolean)
    .slice(0, 2)
    .join(" · ");
}

export default function CustomerCombobox({
  inputId,
  name = "billingCustomer",
  customers = [],
  value = "",
  onChange,
  loading = false,
  error = "",
  disabled = false,
  required = false,
  ariaInvalid = false,
  ariaDescribedBy,
  onBlur,
  placeholder = "Search active customer by name or code",
}) {
  const fallbackId = useId();
  const id = inputId || `${fallbackId}-input`;
  const listId = `${id}-listbox`;

  const wrapperRef = useRef(null);
  const inputRef = useRef(null);

  const [isOpen, setIsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);

  const activeCustomers = useMemo(
    () =>
      customers.filter((customer) => {
        if (customer?.is_active !== true) return false;
        const standing = String(customer?.standing_status || "").trim().toLowerCase();
        if (standing === "suspended") return false;
        if (
          standing !== "reinstated" &&
          Number(customer?.no_show_strike_count ?? 0) >= 3
        ) {
          return false;
        }
        const cooldownMs = customer?.booking_cooldown_until
          ? Date.parse(customer.booking_cooldown_until)
          : NaN;
        if (Number.isFinite(cooldownMs) && cooldownMs > Date.now()) {
          return false;
        }
        return true;
      }),
    [customers]
  );

  const selectedCustomer = useMemo(
    () =>
      activeCustomers.find(
        (customer) => String(customer.id) === String(value)
      ) || null,
    [activeCustomers, value]
  );

  const query = isEditing ? searchText.trim().toLowerCase() : "";

  const filteredCustomers = useMemo(() => {
    if (!query) return activeCustomers;
    return activeCustomers.filter((customer) => {
      const fields = [
        customerLabel(customer),
        customer?.customer_code,
        customer?.email,
        customer?.phone,
        customer?.contact_number,
        customer?.city,
        customer?.province,
      ];
      return fields.some(
        (field) =>
          typeof field === "string" && field.toLowerCase().includes(query)
      );
    });
  }, [activeCustomers, query]);

  const visibleCustomers = filteredCustomers.slice(0, 100);
  const hasOverflow = filteredCustomers.length > visibleCustomers.length;
  const displayValue = isEditing
    ? searchText
    : selectedCustomer
      ? customerLabel(selectedCustomer)
      : searchText;

  const commitSelection = (customer) => {
    setIsOpen(false);
    setIsEditing(false);
    setSearchText("");
    setActiveIndex(-1);
    onChange?.(String(customer.id));
  };

  const handleClear = () => {
    setSearchText("");
    setIsEditing(true);
    setActiveIndex(-1);
    setIsOpen(true);
    onChange?.("");
    inputRef.current?.focus();
  };

  const handleWrapperBlur = (event) => {
    if (wrapperRef.current?.contains(event.relatedTarget)) {
      return;
    }
    setIsOpen(false);
    setIsEditing(false);
    setActiveIndex(-1);
    if (!selectedCustomer) {
      setSearchText("");
    }
    onBlur?.(event);
  };

  const handleInputKeyDown = (event) => {
    if (event.key === "Escape") {
      if (isOpen) {
        event.preventDefault();
        event.stopPropagation();
        setIsOpen(false);
        setIsEditing(false);
        setActiveIndex(-1);
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setActiveIndex(visibleCustomers.length > 0 ? 0 : -1);
      } else if (visibleCustomers.length > 0) {
        setActiveIndex((prev) => (prev + 1) % visibleCustomers.length);
      }
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setActiveIndex(
          visibleCustomers.length > 0 ? visibleCustomers.length - 1 : -1
        );
      } else if (visibleCustomers.length > 0) {
        setActiveIndex((prev) =>
          prev <= 0 ? visibleCustomers.length - 1 : prev - 1
        );
      }
      return;
    }

    if (event.key === "Enter" && isOpen) {
      if (event.nativeEvent?.isComposing || event.isComposing) return;
      const targetCustomer =
        (activeIndex >= 0 && visibleCustomers[activeIndex]) ||
        (visibleCustomers.length === 1 ? visibleCustomers[0] : null);
      if (targetCustomer) {
        event.preventDefault();
        commitSelection(targetCustomer);
      }
      return;
    }

    if (event.key === "Tab") {
      setIsOpen(false);
      setIsEditing(false);
      setActiveIndex(-1);
    }
  };

  const activeOptionId =
    isOpen && activeIndex >= 0 && visibleCustomers[activeIndex]
      ? `${id}-option-${activeIndex}`
      : undefined;

  return (
    <div
      ref={wrapperRef}
      className="customer-combobox-wrapper"
      onBlur={handleWrapperBlur}
    >
      <div className="input-search-wrapper combobox-input-shell">
        <input
          ref={inputRef}
          id={id}
          name={name}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls={listId}
          aria-activedescendant={activeOptionId}
          aria-invalid={ariaInvalid ? "true" : "false"}
          aria-describedby={ariaDescribedBy || undefined}
          aria-required={required ? "true" : undefined}
          className={ariaInvalid ? "is-field-invalid" : undefined}
          disabled={disabled}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="search"
          placeholder={loading ? "Loading active customers..." : placeholder}
          value={displayValue}
          onFocus={() => {
            setIsOpen(true);
            setActiveIndex(-1);
          }}
          onChange={(event) => {
            const nextText = event.target.value;
            setIsEditing(true);
            setSearchText(nextText);
            setIsOpen(true);
            setActiveIndex(-1);
            if (selectedCustomer && nextText !== customerLabel(selectedCustomer)) {
              onChange?.("");
            } else if (!nextText.trim() && value) {
              onChange?.("");
            }
          }}
          onKeyDown={handleInputKeyDown}
        />

        {(selectedCustomer || searchText) && !disabled && (
          <button
            type="button"
            className="input-clear-btn"
            aria-label="Clear selected customer"
            onPointerDown={(event) => event.preventDefault()}
            onClick={handleClear}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}

        <button
          type="button"
          className="combobox-toggle-btn"
          disabled={disabled}
          aria-label={isOpen ? "Hide customer list" : "Show customer list"}
          aria-expanded={isOpen}
          aria-controls={listId}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => {
            if (disabled) return;
            setIsOpen((prev) => !prev);
            inputRef.current?.focus();
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      {isOpen && !disabled && (
        <div
          id={listId}
          role="listbox"
          aria-label="Active registered billing customers"
          className="address-suggestions customer-listbox"
        >
          {loading && (
            <p className="combobox-status" role="status">
              Loading active billing customers...
            </p>
          )}

          {!loading && error && (
            <p className="combobox-status is-error" role="alert">
              {error}
            </p>
          )}

          {!loading && !error && visibleCustomers.length === 0 && (
            <p className="combobox-status" role="status">
              {activeCustomers.length === 0
                ? "No active registered customers found. Activate or add a customer in Customers first."
                : "No active registered customers match your search."}
            </p>
          )}

          {!loading &&
            !error &&
            visibleCustomers.map((customer, index) => {
              const isSelected = String(customer.id) === String(value);
              const meta = customerMeta(customer);
              return (
                <button
                  key={customer.id}
                  id={`${id}-option-${index}`}
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex || isSelected}
                  className={`customer-option-btn${isSelected ? " is-selected" : ""}`}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => commitSelection(customer)}
                >
                  <span className="customer-option-name">
                    {customerLabel(customer)}
                  </span>
                  {meta && (
                    <span className="customer-option-meta">{meta}</span>
                  )}
                </button>
              );
            })}

          {!loading && !error && hasOverflow && (
            <p className="combobox-status">
              Showing first 100 matches. Keep typing to narrow results.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
