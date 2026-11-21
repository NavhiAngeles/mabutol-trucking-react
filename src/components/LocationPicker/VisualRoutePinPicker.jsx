import { useEffect, useId, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  LUZON_BOUNDS,
  LUZON_CENTER,
  LUZON_MAX_ZOOM,
  LUZON_MIN_ZOOM,
} from '../../config/mapBound';
import {
  getMapTilerKey,
  nudgeCoordinate,
  reverseGeocodeLuzon,
  searchLuzonPlaces,
  toPoint,
} from '../../services/geocodingService';
import './VisualRoutePinPicker.css';

if (typeof maplibregl?.setWorkerUrl === 'function' && maplibreWorkerUrl) {
  maplibregl.setWorkerUrl(maplibreWorkerUrl);
}

const ROUTE_SOURCE = 'vrp-route-source';
const ROUTE_LAYER = 'vrp-route-line';

const getStyleUrl = (style, key) =>
  `https://api.maptiler.com/maps/${style === 'satellite' ? 'hybrid' : 'streets-v2'}/style.json?key=${encodeURIComponent(key)}`;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const buildLineGeoJson = (routeGeometry, originPoint, destPoint) => {
  if (routeGeometry?.features?.length) {
    return { kind: 'provider', data: routeGeometry };
  }
  if (routeGeometry?.type === 'LineString' && Array.isArray(routeGeometry.coordinates) && routeGeometry.coordinates.length >= 2) {
    return {
      kind: 'provider',
      data: {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', properties: {}, geometry: routeGeometry }],
      },
    };
  }
  if (originPoint && destPoint) {
    return {
      kind: 'preview',
      data: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: [
                [originPoint.lng, originPoint.lat],
                [destPoint.lng, destPoint.lat],
              ],
            },
          },
        ],
      },
    };
  }
  return null;
};

function EndpointCard({
  slot,
  badge,
  label,
  point,
  displayAddress,
  isAdjusting,
  disabled,
  apiKey,
  idBase,
  onToggleAdjust,
  onSelectSearch,
}) {
  const inputRef = useRef(null);
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [searchState, setSearchState] = useState({ query: '', items: [], message: '' });

  const trimmed = query.trim();
  const options = searchState.query === trimmed ? searchState.items : [];
  const isSearching = Boolean(apiKey) && focused && !disabled && trimmed.length >= 3 && searchState.query !== trimmed;

  useEffect(() => {
    if (!focused || disabled || trimmed.length < 3) return;
    if (!apiKey) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const items = await searchLuzonPlaces(trimmed, {
          signal: controller.signal,
          apiKey,
          limit: 6,
        });
        if (!controller.signal.aborted) {
          setSearchState({
            query: trimmed,
            items,
            message: items.length ? '' : 'No matching Luzon places found. Try adjusting on the map.',
          });
        }
      } catch (err) {
        if (err?.name === 'AbortError' || controller.signal.aborted) return;
        setSearchState({
          query: trimmed,
          items: [],
          message: err?.message || 'Address search failed. Try again.',
        });
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed, focused, disabled, apiKey]);

  const showMissingKeyMsg = focused && !disabled && trimmed.length >= 3 && !apiKey;
  const showDropdown =
    focused &&
    !disabled &&
    trimmed.length >= 3 &&
    (showMissingKeyMsg || isSearching || options.length > 0 || (searchState.query === trimmed && searchState.message));

  const chooseOption = (option) => {
    setFocused(false);
    setActiveIndex(-1);
    setQuery(option.label);
    setSearchState({ query: '', items: [], message: '' });
    onSelectSearch(slot, option);
  };

  const listId = `${idBase}-${slot}-listbox`;
  const inputId = `${idBase}-${slot}-search`;

  return (
    <div className={`vrp-endpoint-card is-${slot}${isAdjusting ? ' is-adjusting' : ''}`}>
      <div className="vrp-endpoint-top">
        <div className="vrp-endpoint-title-row">
          <span className={`vrp-badge is-${slot}`}>
            <span className="vrp-badge-letter" aria-hidden="true">{badge}</span>
            <span>{label}</span>
          </span>
          <span className={`vrp-pin-status ${point ? 'is-placed' : 'is-needed'}`}>
            {point ? 'Pin placed' : 'Pin needed'}
          </span>
        </div>

        <button
          type="button"
          className={`vrp-adjust-btn${isAdjusting ? ' is-active' : ''}`}
          aria-pressed={isAdjusting}
          disabled={disabled}
          onClick={() => onToggleAdjust(slot)}
        >
          {isAdjusting ? 'Done adjusting' : point ? 'Adjust pin' : 'Place on map'}
        </button>
      </div>

      <p className="vrp-endpoint-address">{displayAddress}</p>

      <div className="vrp-search-box">
        <label htmlFor={inputId} className="vrp-sr-only">
          Search place for {label}
        </label>
        <div className="vrp-search-input-wrap">
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            role="combobox"
            autoComplete="off"
            spellCheck={false}
            aria-autocomplete="list"
            aria-controls={listId}
            aria-expanded={Boolean(showDropdown && options.length > 0)}
            aria-activedescendant={activeIndex >= 0 && options[activeIndex] ? `${listId}-opt-${activeIndex}` : undefined}
            className="vrp-search-input"
            placeholder="Search street, warehouse, plaza, or city in Luzon..."
            value={query}
            disabled={disabled}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              setActiveIndex(-1);
            }}
            onChange={(event) => {
              setFocused(true);
              setActiveIndex(-1);
              setQuery(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && (focused || showDropdown)) {
                event.preventDefault();
                event.stopPropagation();
                setFocused(false);
                setActiveIndex(-1);
                return;
              }
              if (focused && options.length > 0 && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
                event.preventDefault();
                setActiveIndex((prev) =>
                  event.key === 'ArrowDown'
                    ? (prev + 1) % options.length
                    : (prev <= 0 ? options.length : prev) - 1
                );
              }
              if (focused && event.key === 'Enter' && options[activeIndex]) {
                if (event.nativeEvent?.isComposing || event.isComposing) return;
                event.preventDefault();
                chooseOption(options[activeIndex]);
              }
            }}
          />
          {query && !disabled && (
            <button
              type="button"
              className="vrp-search-clear"
              aria-label={`Clear ${label} search`}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => {
                setQuery('');
                setActiveIndex(-1);
                setSearchState({ query: '', items: [], message: '' });
                inputRef.current?.focus();
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        {showDropdown && (
          <div id={listId} className="vrp-search-dropdown" role="listbox" aria-label={`${label} place suggestions`}>
            {showMissingKeyMsg && <p role="status">Map search requires a MapTiler API key.</p>}
            {!showMissingKeyMsg && isSearching && <p role="status">Searching Luzon places…</p>}
            {!showMissingKeyMsg &&
              !isSearching &&
              options.map((option, index) => (
                <button
                  key={option.id}
                  id={`${listId}-opt-${index}`}
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => chooseOption(option)}
                >
                  {option.label}
                </button>
              ))}
            {!showMissingKeyMsg && !isSearching && options.length === 0 && searchState.message && (
              <p role="status">{searchState.message}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function VisualRoutePinPicker({
  origin = {},
  destination = {},
  routeGeometry = null,
  onChangePoint,
  onClear,
  defaultMapStyle = 'streets',
  compact = false,
  disabled = false,
  idPrefix,
  apiKey,
}) {
  const generatedId = useId();
  const idBase = idPrefix || generatedId;
  const resolvedApiKey = apiKey !== undefined ? apiKey : getMapTilerKey();

  const originPoint = useMemo(() => toPoint(origin?.lat, origin?.lng), [origin?.lat, origin?.lng]);
  const destPoint = useMemo(() => toPoint(destination?.lat, destination?.lng), [destination?.lat, destination?.lng]);

  const [mapStyle, setMapStyle] = useState(defaultMapStyle === 'satellite' ? 'satellite' : 'streets');
  const [activeSlot, setActiveSlot] = useState(null);
  const [largeSteps, setLargeSteps] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [styleVersion, setStyleVersion] = useState(0);
  const [mapError, setMapError] = useState(() => (resolvedApiKey ? '' : 'missing-key'));
  const [resolvedPlaces, setResolvedPlaces] = useState({ origin: null, destination: null });
  const [searchLabels, setSearchLabels] = useState({ origin: null, destination: null });

  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({ origin: null, destination: null });
  const activeStyleRef = useRef(mapStyle);
  const activeSlotRef = useRef(activeSlot);
  const disabledRef = useRef(disabled);
  const onChangePointRef = useRef(onChangePoint);
  const initialFitRef = useRef(false);

  useEffect(() => {
    activeSlotRef.current = activeSlot;
  }, [activeSlot]);

  useEffect(() => {
    disabledRef.current = disabled;
    if (disabled && activeSlot) {
      setActiveSlot(null);
    }
  }, [disabled, activeSlot]);

  useEffect(() => {
    onChangePointRef.current = onChangePoint;
  }, [onChangePoint]);

  // Reverse-geocode points when no addressHint exists or after user moves a pin
  useEffect(() => {
    const controller = new AbortController();
    const targets = [
      { slot: 'origin', point: originPoint, hint: origin?.addressHint },
      { slot: 'destination', point: destPoint, hint: destination?.addressHint },
    ];

    targets.forEach(({ slot, point, hint }) => {
      if (!point || !resolvedApiKey) return;
      const pointKey = `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`;
      const existingSearch = searchLabels[slot];
      if (existingSearch?.key === pointKey) return;
      const existingResolved = resolvedPlaces[slot];
      if (existingResolved?.key === pointKey) return;
      if (hint && hint !== 'Address not specified' && !existingResolved) {
        // Keep initial hint until user explicitly moves the pin or when no hint is provided.
        return;
      }

      reverseGeocodeLuzon(point.lat, point.lng, {
        signal: controller.signal,
        apiKey: resolvedApiKey,
      })
        .then((place) => {
          if (controller.signal.aborted || !place) return;
          setResolvedPlaces((prev) => ({
            ...prev,
            [slot]: { key: pointKey, label: place.fullAddress || place.shortLabel },
          }));
        })
        .catch(() => {});
    });

    return () => controller.abort();
  }, [originPoint, destPoint, origin?.addressHint, destination?.addressHint, resolvedApiKey, resolvedPlaces, searchLabels]);

  // Initialize MapLibre
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !resolvedApiKey) return;

    let map;
    let resizeObserver;
    const initialStyle = activeStyleRef.current;

    try {
      map = new maplibregl.Map({
        container,
        style: getStyleUrl(initialStyle, resolvedApiKey),
        center: LUZON_CENTER,
        zoom: 7,
        minZoom: LUZON_MIN_ZOOM,
        maxZoom: LUZON_MAX_ZOOM,
        maxBounds: LUZON_BOUNDS,
        renderWorldCopies: false,
      });

      mapRef.current = map;

      if (typeof maplibregl.NavigationControl === 'function') {
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      }

      map.on('load', () => {
        setMapError('');
        setMapReady(true);
        map.resize?.();
      });

      map.on('style.load', () => {
        setStyleVersion((v) => v + 1);
      });

      map.on('click', (event) => {
        const slot = activeSlotRef.current;
        if (!slot || disabledRef.current || !event?.lngLat) return;
        const next = { lat: event.lngLat.lat, lng: event.lngLat.lng };
        setSearchLabels((prev) => ({ ...prev, [slot]: null }));
        setResolvedPlaces((prev) => ({ ...prev, [slot]: { key: 'pending', label: 'Locating area…' } }));
        onChangePointRef.current?.(slot, next);
      });

      map.on('error', (event) => {
        if (!map.loaded?.()) {
          setMapError(event?.error?.message || 'Unable to load map preview.');
        }
      });

      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => {
          mapRef.current?.resize?.();
        });
        resizeObserver.observe(container);
      }
    } catch (err) {
      Promise.resolve().then(() => {
        setMapError(err?.message || 'Unable to initialize map preview.');
      });
    }

    return () => {
      resizeObserver?.disconnect();
      markersRef.current.origin?.remove?.();
      markersRef.current.destination?.remove?.();
      markersRef.current = { origin: null, destination: null };
      mapRef.current = null;
      map?.remove?.();
    };
  }, [resolvedApiKey]);

  // Switch Streets / Satellite style cleanly
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !resolvedApiKey) return;
    if (activeStyleRef.current === mapStyle) return;
    activeStyleRef.current = mapStyle;
    map.setStyle?.(getStyleUrl(mapStyle, resolvedApiKey));
  }, [mapStyle, mapReady, resolvedApiKey]);

  // Sync markers for origin & destination
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const specs = [
      { slot: 'origin', point: originPoint, badge: origin?.badge || 'P', label: origin?.label || 'Pickup' },
      { slot: 'destination', point: destPoint, badge: destination?.badge || 'D', label: destination?.label || 'Destination' },
    ];

    specs.forEach(({ slot, point, badge, label }) => {
      const existing = markersRef.current[slot];
      if (!point) {
        existing?.remove?.();
        markersRef.current[slot] = null;
        return;
      }

      if (existing) {
        existing.setLngLat?.([point.lng, point.lat]);
        existing.setDraggable?.(!disabled);
        const el = existing.getElement?.();
        if (el) {
          el.classList.toggle('is-active', activeSlot === slot);
        }
        return;
      }

      if (typeof document === 'undefined' || typeof maplibregl.Marker !== 'function') return;

      const el = document.createElement('div');
      el.className = `vrp-pin-marker is-${slot}${activeSlot === slot ? ' is-active' : ''}`;
      el.setAttribute('aria-label', `${label} pin`);
      el.textContent = badge;

      const marker = new maplibregl.Marker({
        element: el,
        anchor: 'center',
        draggable: !disabled,
      })
        .setLngLat([point.lng, point.lat])
        .addTo(map);

      marker.on?.('dragend', () => {
        const ll = marker.getLngLat?.();
        if (!ll) return;
        setSearchLabels((prev) => ({ ...prev, [slot]: null }));
        setResolvedPlaces((prev) => ({ ...prev, [slot]: { key: 'pending', label: 'Locating area…' } }));
        onChangePointRef.current?.(slot, { lat: ll.lat, lng: ll.lng });
      });

      markersRef.current[slot] = marker;
    });
  }, [originPoint, destPoint, origin?.badge, origin?.label, destination?.badge, destination?.label, mapReady, disabled, activeSlot]);

  // Draw road route or dashed preview connector, re-applying on style.load
  const linePayload = useMemo(
    () => buildLineGeoJson(routeGeometry, originPoint, destPoint),
    [routeGeometry, originPoint, destPoint]
  );

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const cleanup = () => {
      try {
        if (map.getLayer?.(ROUTE_LAYER)) map.removeLayer(ROUTE_LAYER);
        if (map.getSource?.(ROUTE_SOURCE)) map.removeSource(ROUTE_SOURCE);
      } catch {
        // Ignore cleanup errors during style teardown.
      }
    };

    cleanup();
    if (!linePayload) return;

    try {
      map.addSource?.(ROUTE_SOURCE, {
        type: 'geojson',
        data: linePayload.data,
      });

      map.addLayer?.({
        id: ROUTE_LAYER,
        type: 'line',
        source: ROUTE_SOURCE,
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint:
          linePayload.kind === 'provider'
            ? {
                'line-color': '#1D4ED8',
                'line-width': 5,
                'line-opacity': 0.92,
              }
            : {
                'line-color': '#64748B',
                'line-width': 2.5,
                'line-dasharray': [2, 2],
                'line-opacity': 0.85,
              },
      });
    } catch {
      // Style may still be loading; next style.load will re-add.
    }

    return () => {
      if (mapRef.current === map) cleanup();
    };
  }, [linePayload, mapReady, styleVersion]);

  const fitPinsOnMap = (animate = true) => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const duration = !animate || prefersReducedMotion() ? 0 : 500;

    if (originPoint && destPoint && typeof maplibregl.LngLatBounds === 'function') {
      const bounds = new maplibregl.LngLatBounds();
      bounds.extend([originPoint.lng, originPoint.lat]);
      bounds.extend([destPoint.lng, destPoint.lat]);
      map.fitBounds?.(bounds, {
        padding: compact ? 48 : 64,
        maxZoom: 14,
        duration,
      });
      return;
    }

    const single = originPoint || destPoint;
    if (single) {
      map.flyTo?.({
        center: [single.lng, single.lat],
        zoom: 15,
        duration,
      });
    }
  };

  // Auto-fit once when map becomes ready with existing pins
  useEffect(() => {
    if (!mapReady || initialFitRef.current) return;
    if (!originPoint && !destPoint) return;
    initialFitRef.current = true;
    fitPinsOnMap(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, originPoint, destPoint]);

  const handleToggleAdjust = (slot) => {
    setActiveSlot((prev) => {
      const next = prev === slot ? null : slot;
      if (next && mapRef.current && mapReady) {
        const pt = next === 'origin' ? originPoint : destPoint;
        if (pt) {
          mapRef.current.flyTo?.({
            center: [pt.lng, pt.lat],
            zoom: Math.max(mapRef.current.getZoom?.() || 14, 16),
            duration: prefersReducedMotion() ? 0 : 400,
          });
        }
      }
      return next;
    });
  };

  const handleSelectSearch = (slot, option) => {
    const pointKey = `${option.lat.toFixed(4)},${option.lng.toFixed(4)}`;
    setSearchLabels((prev) => ({ ...prev, [slot]: { key: pointKey, label: option.label } }));
    setResolvedPlaces((prev) => ({ ...prev, [slot]: { key: pointKey, label: option.label } }));
    onChangePoint?.(slot, { lat: option.lat, lng: option.lng });
    setActiveSlot(slot);

    if (mapRef.current && mapReady) {
      mapRef.current.flyTo?.({
        center: [option.lng, option.lat],
        zoom: 16,
        duration: prefersReducedMotion() ? 0 : 500,
      });
    }
  };

  const handleNudge = (direction) => {
    if (!activeSlot || disabled) return;
    const current = activeSlot === 'origin' ? originPoint : destPoint;
    if (!current) return;
    const next = nudgeCoordinate(current.lat, current.lng, direction, largeSteps ? 100 : 25);
    if (!next) return;
    setSearchLabels((prev) => ({ ...prev, [activeSlot]: null }));
    setResolvedPlaces((prev) => ({ ...prev, [activeSlot]: { key: 'pending', label: 'Locating area…' } }));
    onChangePoint?.(activeSlot, next);
    mapRef.current?.panTo?.([next.lng, next.lat], {
      duration: prefersReducedMotion() ? 0 : 200,
    });
  };

  const getAddressDisplay = (slot, point, hint) => {
    if (!point) {
      return hint || 'Pin needed on map or search below';
    }
    const pointKey = `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`;
    if (searchLabels[slot]?.key === pointKey) {
      return searchLabels[slot].label;
    }
    if (resolvedPlaces[slot]?.key === pointKey) {
      return resolvedPlaces[slot].label;
    }
    if (resolvedPlaces[slot]?.key === 'pending') {
      return 'Locating area…';
    }
    return hint || 'Pin placed';
  };

  const activePoint = activeSlot === 'origin' ? originPoint : activeSlot === 'destination' ? destPoint : null;
  const activeLabel =
    activeSlot === 'origin'
      ? origin?.label || 'Pickup'
      : activeSlot === 'destination'
        ? destination?.label || 'Destination'
        : '';

  return (
    <div className={`vrp-container${compact ? ' is-compact' : ''}`}>
      <div className="vrp-endpoints-grid">
        <EndpointCard
          slot="origin"
          badge={origin?.badge || 'P'}
          label={origin?.label || 'Pickup'}
          point={originPoint}
          displayAddress={getAddressDisplay('origin', originPoint, origin?.addressHint)}
          isAdjusting={activeSlot === 'origin'}
          disabled={disabled}
          apiKey={resolvedApiKey}
          idBase={idBase}
          onToggleAdjust={handleToggleAdjust}
          onSelectSearch={handleSelectSearch}
        />

        <EndpointCard
          slot="destination"
          badge={destination?.badge || 'D'}
          label={destination?.label || 'Destination'}
          point={destPoint}
          displayAddress={getAddressDisplay('destination', destPoint, destination?.addressHint)}
          isAdjusting={activeSlot === 'destination'}
          disabled={disabled}
          apiKey={resolvedApiKey}
          idBase={idBase}
          onToggleAdjust={handleToggleAdjust}
          onSelectSearch={handleSelectSearch}
        />
      </div>

      {activeSlot && !disabled && (
        <div className="vrp-nudge-bar" role="region" aria-label={`${activeLabel} pin controls`}>
          <div className="vrp-nudge-header">
            <span>
              <strong>Adjusting {activeLabel}:</strong> Click on the map, drag the marker, or nudge by direction.
            </span>
            <label className="vrp-step-toggle" htmlFor={`${idBase}-large-steps`}>
              <input
                id={`${idBase}-large-steps`}
                type="checkbox"
                checked={largeSteps}
                onChange={(event) => setLargeSteps(event.target.checked)}
              />
              <span>Larger steps (100 m)</span>
            </label>
          </div>
          <div className="vrp-nudge-actions">
            {['North', 'South', 'East', 'West'].map((dir) => (
              <button
                key={dir}
                type="button"
                className="vrp-nudge-btn"
                disabled={!activePoint}
                onClick={() => handleNudge(dir)}
              >
                {dir}
              </button>
            ))}
            <button
              type="button"
              className="vrp-nudge-done"
              onClick={() => setActiveSlot(null)}
            >
              Done adjusting
            </button>
          </div>
        </div>
      )}

      {mapError ? (
        <div role="alert" className="vrp-map-alert">
          Map preview unavailable. Use place search to set each pin.
        </div>
      ) : (
        <div className={`vrp-map-shell${activeSlot && !disabled ? ' is-crosshair' : ''}`}>
          <div ref={containerRef} className="vrp-map-canvas" />

          <div className="vrp-map-toolbar-left" role="group" aria-label="Map layer">
            <button
              type="button"
              className={`vrp-style-btn${mapStyle === 'streets' ? ' is-active' : ''}`}
              aria-pressed={mapStyle === 'streets'}
              disabled={disabled}
              onClick={() => setMapStyle('streets')}
            >
              Streets
            </button>
            <button
              type="button"
              className={`vrp-style-btn${mapStyle === 'satellite' ? ' is-active' : ''}`}
              aria-pressed={mapStyle === 'satellite'}
              disabled={disabled}
              onClick={() => setMapStyle('satellite')}
            >
              Satellite
            </button>
          </div>

          <div className="vrp-map-toolbar-bottom">
            <button
              type="button"
              className="vrp-utility-btn"
              disabled={disabled || (!originPoint && !destPoint)}
              onClick={() => fitPinsOnMap(true)}
            >
              Fit both pins
            </button>
            {onClear && (
              <button
                type="button"
                className="vrp-utility-btn"
                disabled={disabled || (!originPoint && !destPoint)}
                onClick={() => {
                  setActiveSlot(null);
                  setSearchLabels({ origin: null, destination: null });
                  setResolvedPlaces({ origin: null, destination: null });
                  onClear();
                }}
              >
                Clear pins
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
