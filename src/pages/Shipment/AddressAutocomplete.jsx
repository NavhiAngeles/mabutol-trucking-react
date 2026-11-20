import { useEffect, useId, useRef, useState } from "react";
import { LUZON_BOUNDS } from "../../config/mapBound";

export default function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  onClear,
  onBlur,
  disabled,
  placeholder,
  inputId,
  name,
  required = false,
  ariaInvalid = false,
  ariaDescribedBy,
  enterKeyHint = "search",
  clearLabel = "Clear address",
}) {
  const id = useId();
  const inputRef = useRef(null);
  const [focused, setFocused] = useState(false);
  const [results, setResults] = useState({ query: "", features: [], message: "" });
  const [active, setActive] = useState(-1);
  const query = value.trim();
  const features = results.query === query ? results.features : [];
  const isSearching = focused && !disabled && query.length >= 3 && results.query !== query;

  useEffect(() => {
    if (!focused || disabled || query.length < 3) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const key = import.meta.env.VITE_MAPTILER_API_KEY;
        if (!key) throw new Error("Address search is unavailable. Use the map picker.");
        const params = new URLSearchParams({
          key, country: "ph", language: "en", limit: "8", autocomplete: "true",
          types: "address,road,poi,place,locality,neighbourhood,municipality",
          fuzzyMatch: "true",
          bbox: LUZON_BOUNDS.flat().join(","),
        });
        const response = await fetch(`https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Address search failed. Try again or use the map picker.");
        const data = await response.json();
        const matches = (data.features || []).filter(feature =>
          typeof feature.place_name === "string" && feature.place_name.trim() &&
          Array.isArray(feature.center) && Number.isFinite(feature.center[0]) && Number.isFinite(feature.center[1]) &&
          feature.center[0] >= LUZON_BOUNDS[0][0] && feature.center[0] <= LUZON_BOUNDS[1][0] &&
          feature.center[1] >= LUZON_BOUNDS[0][1] && feature.center[1] <= LUZON_BOUNDS[1][1]
        );
        if (!controller.signal.aborted) {
          setResults({
            query,
            features: matches,
            message: matches.length ? "" : "No matching addresses in Luzon. Try another search or pin on the map.",
          });
        }
      } catch (error) {
        if (!controller.signal.aborted) setResults({ query, features: [], message: error.message });
      }
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, focused, disabled]);

  const select = (feature) => {
    setFocused(false);
    setActive(-1);
    setResults({ query: "", features: [], message: "" });
    onSelect(feature);
  };

  const showDropdown =
    focused &&
    !disabled &&
    query.length >= 3 &&
    (isSearching || features.length > 0 || (results.query === query && results.message));

  return (
    <div className="input-search-wrapper address-autocomplete-wrapper">
      <input
        ref={inputRef}
        id={inputId || `${id}-input`}
        name={name}
        type="text"
        role="combobox"
        aria-required={required ? "true" : undefined}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        enterKeyHint={enterKeyHint}
        aria-autocomplete="list"
        aria-controls={`${id}-list`}
        aria-expanded={Boolean(showDropdown && features.length > 0)}
        aria-activedescendant={active >= 0 && features[active] ? `${id}-${active}` : undefined}
        aria-invalid={ariaInvalid ? "true" : "false"}
        aria-describedby={ariaDescribedBy || undefined}
        className={ariaInvalid ? "is-field-invalid" : undefined}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onBlur={(event) => {
          setFocused(false);
          setActive(-1);
          onBlur?.(event);
        }}
        onChange={event => {
          setFocused(true);
          setActive(-1);
          onChange(event.target.value);
        }}
        onKeyDown={event => {
          if (event.key === "Escape" && (focused || showDropdown)) {
            event.preventDefault();
            event.stopPropagation();
            setFocused(false);
            setActive(-1);
            return;
          }
          if (focused && features.length && ["ArrowDown", "ArrowUp"].includes(event.key)) {
            event.preventDefault();
            setActive(index => event.key === "ArrowDown" ? (index + 1) % features.length : (index <= 0 ? features.length : index) - 1);
          }
          if (focused && event.key === "Enter" && features[active]) {
            if (event.nativeEvent?.isComposing || event.isComposing) return;
            event.preventDefault();
            select(features[active]);
          }
        }}
      />
      {value && !disabled ? (
        <button
          type="button"
          className="input-clear-btn address-clear-btn"
          aria-label={clearLabel}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => {
            setFocused(false);
            setActive(-1);
            setResults({ query: "", features: [], message: "" });
            if (onClear) onClear();
            else onChange("");
            inputRef.current?.focus();
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      ) : (
        <span className="trailing-search-icon" aria-hidden="true">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
            <circle cx="9" cy="9" r="6" />
            <path d="M13.5 13.5L18 18" strokeLinecap="round" />
          </svg>
        </span>
      )}
      {showDropdown && (
        <div className="address-suggestions" id={`${id}-list`} role="listbox" aria-label="Address suggestions">
          {isSearching && (
            <p role="status">Searching Luzon addresses...</p>
          )}
          {!isSearching && features.map((feature, index) => (
            <button
              key={feature.id || `${feature.place_name}-${index}`}
              id={`${id}-${index}`}
              type="button"
              role="option"
              aria-selected={index === active}
              onPointerDown={event => event.preventDefault()}
              onClick={() => select(feature)}
            >
              {feature.place_name}
            </button>
          ))}
          {!isSearching && !features.length && results.message && (
            <p role="status">{results.message}</p>
          )}
        </div>
      )}
    </div>
  );
}
