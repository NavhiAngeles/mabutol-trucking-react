import { useEffect, useId, useState } from "react";
import { LUZON_BOUNDS } from "../../config/mapBound";

export default function AddressAutocomplete({ value, onChange, onSelect, disabled, placeholder, iconClass }) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  const [results, setResults] = useState({ query: "", features: [], message: "" });
  const [active, setActive] = useState(-1);
  const query = value.trim();
  const features = results.query === query ? results.features : [];

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
        if (!controller.signal.aborted) setResults({ query, features: matches, message: matches.length ? "" : "No matching addresses. Try another search or use the map picker." });
      } catch (error) {
        if (!controller.signal.aborted) setResults({ query, features: [], message: error.message });
      }
    }, 400);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, focused, disabled]);

  const select = (feature) => {
    setFocused(false);
    setActive(-1);
    setResults({ query: "", features: [], message: "" });
    onSelect(feature);
  };

  return (
    <div className="input-search-wrapper">
      <i className={iconClass} />
      <input
        type="text" role="combobox" aria-label={placeholder} autoComplete="off"
        aria-autocomplete="list" aria-controls={`${id}-list`} aria-expanded={focused && features.length > 0}
        aria-activedescendant={active >= 0 && features[active] ? `${id}-${active}` : undefined}
        value={value} disabled={disabled} placeholder={placeholder}
        onFocus={() => setFocused(true)} onBlur={() => { setFocused(false); setActive(-1); }}
        onChange={event => { setFocused(true); setActive(-1); onChange(event.target.value); }}
        onKeyDown={event => {
          if (event.key === "Escape") { setFocused(false); setActive(-1); }
          if (focused && features.length && ["ArrowDown", "ArrowUp"].includes(event.key)) {
            event.preventDefault();
            setActive(index => event.key === "ArrowDown" ? (index + 1) % features.length : (index <= 0 ? features.length : index) - 1);
          }
          if (focused && event.key === "Enter" && features[active]) { event.preventDefault(); select(features[active]); }
        }}
      />
      {focused && !disabled && query.length >= 3 && (features.length > 0 || (results.query === query && results.message)) && (
        <div className="address-suggestions" id={`${id}-list`} role="listbox" aria-label="Address suggestions">
          {features.map((feature, index) => (
            <button key={feature.id || `${feature.place_name}-${index}`} id={`${id}-${index}`} type="button" role="option"
              aria-selected={index === active} onPointerDown={event => event.preventDefault()} onClick={() => select(feature)}>
              {feature.place_name}
            </button>
          ))}
          {!features.length && <p role="status">{results.message}</p>}
        </div>
      )}
    </div>
  );
}
