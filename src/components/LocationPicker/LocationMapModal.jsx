import { useEffect, useId, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  LUZON_BOUNDS,
  LUZON_MAX_ZOOM,
  LUZON_MIN_ZOOM,
} from '../../config/mapBound';
import {
  getMapTilerKey,
  reverseGeocodeLuzon,
  toPoint,
} from '../../services/geocodingService';
import './LocationMapModal.css';

if (typeof maplibregl?.setWorkerUrl === 'function' && maplibreWorkerUrl) {
  maplibregl.setWorkerUrl(maplibreWorkerUrl);
}

const getStyleUrl = (style, key) =>
  `https://api.maptiler.com/maps/${style === 'satellite' ? 'hybrid' : 'streets-v2'}/style.json?key=${encodeURIComponent(key)}`;

function formatManilaTime(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export default function LocationMapModal({
  open,
  onClose,
  title,
  subtitle = '',
  lat,
  lng,
  recordedAt = null,
  stale = false,
  apiKey,
}) {
  const titleId = useId();
  const dialogRef = useRef(null);
  const closeBtnRef = useRef(null);
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const previousFocusRef = useRef(null);
  const activeStyleRef = useRef('streets');

  const resolvedApiKey = apiKey !== undefined ? apiKey : getMapTilerKey();
  const point = useMemo(() => toPoint(lat, lng), [lat, lng]);

  const [mapStyle, setMapStyle] = useState('streets');
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(() => (resolvedApiKey ? '' : 'Map preview unavailable.'));
  const [placeState, setPlaceState] = useState({ key: '', status: 'idle', label: '' });

  // Capture launcher focus & restore on close; lock body scroll while open
  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    previousFocusRef.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const timer = setTimeout(() => {
      closeBtnRef.current?.focus?.();
    }, 0);

    return () => {
      clearTimeout(timer);
      document.body.style.overflow = prevOverflow;
      const launcher = previousFocusRef.current;
      previousFocusRef.current = null;
      if (launcher && typeof launcher.focus === 'function' && launcher.isConnected) {
        launcher.focus();
      }
    };
  }, [open]);

  // Reverse geocode place label
  useEffect(() => {
    if (!open || !point) return;
    if (!resolvedApiKey) {
      setPlaceState({ key: `${point.lat},${point.lng}`, status: 'unavailable', label: 'Area name unavailable' });
      return;
    }
    const key = `${point.lat.toFixed(3)},${point.lng.toFixed(3)}`;
    setPlaceState({ key, status: 'loading', label: 'Locating area…' });
    const controller = new AbortController();

    reverseGeocodeLuzon(point.lat, point.lng, {
      signal: controller.signal,
      apiKey: resolvedApiKey,
    })
      .then((place) => {
        if (controller.signal.aborted) return;
        if (place) {
          setPlaceState({
            key,
            status: 'ready',
            label: place.fullAddress || place.shortLabel,
          });
        } else {
          setPlaceState({
            key,
            status: 'unavailable',
            label: 'Area name unavailable',
          });
        }
      })
      .catch((err) => {
        if (err?.name === 'AbortError' || controller.signal.aborted) return;
        setPlaceState({
          key,
          status: 'unavailable',
          label: 'Area name unavailable',
        });
      });

    return () => controller.abort();
  }, [open, point, resolvedApiKey]);

  // Initialize MapLibre while modal is open
  useEffect(() => {
    if (!open || !point || !containerRef.current || !resolvedApiKey) return;

    let map;
    let resizeObserver;
    activeStyleRef.current = mapStyle;

    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: getStyleUrl(mapStyle, resolvedApiKey),
        center: [point.lng, point.lat],
        zoom: 15,
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

      map.on('error', (event) => {
        if (!map.loaded?.()) {
          setMapError(event?.error?.message || 'Map preview unavailable.');
        }
      });

      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => {
          mapRef.current?.resize?.();
        });
        resizeObserver.observe(containerRef.current);
      }
    } catch (err) {
      Promise.resolve().then(() => {
        setMapError(err?.message || 'Map preview unavailable.');
      });
    }

    return () => {
      resizeObserver?.disconnect();
      markerRef.current?.remove?.();
      markerRef.current = null;
      mapRef.current = null;
      setMapReady(false);
      map?.remove?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, point?.lat, point?.lng, resolvedApiKey]);

  // Update map style on toggle
  useEffect(() => {
    const map = mapRef.current;
    if (!open || !map || !mapReady || !resolvedApiKey) return;
    if (activeStyleRef.current === mapStyle) return;
    activeStyleRef.current = mapStyle;
    map.setStyle?.(getStyleUrl(mapStyle, resolvedApiKey));
  }, [open, mapStyle, mapReady, resolvedApiKey]);

  // Add single read-only marker
  useEffect(() => {
    const map = mapRef.current;
    if (!open || !map || !mapReady || !point) return;

    markerRef.current?.remove?.();
    markerRef.current = null;

    if (typeof document === 'undefined' || typeof maplibregl.Marker !== 'function') return;

    const el = document.createElement('div');
    el.className = 'lmm-pin-marker';
    el.setAttribute('aria-label', `${title || 'Location'} pin`);
    el.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>';

    markerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat([point.lng, point.lat])
      .addTo(map);

    return () => {
      markerRef.current?.remove?.();
      markerRef.current = null;
    };
  }, [open, mapReady, point, title]);

  if (!open) return null;

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose?.();
      return;
    }
    if (event.key !== 'Tab' || !dialogRef.current) return;
    const controls = Array.from(
      dialogRef.current.querySelectorAll(
        'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
      )
    );
    if (controls.length === 0) {
      event.preventDefault();
      dialogRef.current.focus();
      return;
    }
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (
      event.shiftKey &&
      (document.activeElement === first ||
        document.activeElement === dialogRef.current ||
        !dialogRef.current.contains(document.activeElement))
    ) {
      event.preventDefault();
      last.focus();
    } else if (
      !event.shiftKey &&
      (document.activeElement === last ||
        document.activeElement === dialogRef.current ||
        !dialogRef.current.contains(document.activeElement))
    ) {
      event.preventDefault();
      first.focus();
    }
  };

  const timeStr = formatManilaTime(recordedAt);
  const googleMapsUrl = point
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${point.lat},${point.lng}`)}`
    : null;

  return (
    <div
      className="lmm-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        ref={dialogRef}
        className="lmm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <div className="lmm-header">
          <div className="lmm-header-text">
            <h2 id={titleId}>{title || 'Driver Location'}</h2>
            {subtitle && <p className="lmm-subtitle">{subtitle}</p>}
            <p className="lmm-place-label" role="status">
              {placeState.label || 'Locating area…'}
            </p>
            <div className="lmm-meta-row">
              <span className={`lmm-freshness-badge ${stale ? 'is-stale' : 'is-live'}`}>
                {stale ? 'Last known GPS' : 'Live GPS'}
              </span>
              {timeStr && <span className="lmm-timestamp">{timeStr} PHT</span>}
            </div>
          </div>

          <button
            ref={closeBtnRef}
            type="button"
            className="lmm-close-icon"
            aria-label="Close location map"
            onClick={onClose}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="lmm-body">
          {!point ? (
            <div role="alert" className="lmm-alert">
              Location unavailable for this driver.
            </div>
          ) : mapError ? (
            <div role="alert" className="lmm-alert">
              {mapError}
            </div>
          ) : (
            <div className="lmm-map-shell">
              <div ref={containerRef} className="lmm-map-canvas" />
              <div className="lmm-style-toggle" role="group" aria-label="Map layer">
                <button
                  type="button"
                  className={`lmm-style-btn${mapStyle === 'streets' ? ' is-active' : ''}`}
                  aria-pressed={mapStyle === 'streets'}
                  onClick={() => setMapStyle('streets')}
                >
                  Streets
                </button>
                <button
                  type="button"
                  className={`lmm-style-btn${mapStyle === 'satellite' ? ' is-active' : ''}`}
                  aria-pressed={mapStyle === 'satellite'}
                  onClick={() => setMapStyle('satellite')}
                >
                  Satellite
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="lmm-footer">
          {googleMapsUrl && (
            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="lmm-external-link"
            >
              Open in Google Maps
            </a>
          )}
          <button type="button" className="lmm-close-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
