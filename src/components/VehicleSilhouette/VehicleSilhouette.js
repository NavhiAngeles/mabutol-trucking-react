import React from 'react';
import { resolveVehicleCategory, getVehicleCategoryLabel } from './vehicleCategoryResolver.js';

export { resolveVehicleCategory, getVehicleCategoryLabel };

const h = React.createElement;

const SIZE_MAP = {
  sm: { width: 36, height: 18 },
  md: { width: 54, height: 27 },
  lg: { width: 72, height: 36 },
};

function renderClosedVan() {
  return h('g', { fill: 'currentColor', fillRule: 'evenodd' },
    h('path', {
      d: 'M5 25h4a5 5 0 0 1 10 0h24a5 5 0 0 1 10 0h6v-3a2 2 0 0 0-2-2h-1V7a2 2 0 0 0-2-2H22a2 2 0 0 0-2 2v2.5L14 11l-7 8v6h-2z',
      opacity: '0.9',
    }),
    h('path', { d: 'M8 18.5 13.5 12h5.5v6.5z', fill: '#fff', fillOpacity: '0.85' }),
    h('line', { x1: '41', y1: '7', x2: '41', y2: '23', stroke: '#fff', strokeWidth: '1.2', strokeOpacity: '0.5', strokeDasharray: '1 1' }),
    h('circle', { cx: '14', cy: '25', r: '4.2', fill: '#1e293b' }),
    h('circle', { cx: '14', cy: '25', r: '1.8', fill: '#e2e8f0' }),
    h('circle', { cx: '48', cy: '25', r: '4.2', fill: '#1e293b' }),
    h('circle', { cx: '48', cy: '25', r: '1.8', fill: '#e2e8f0' })
  );
}

function renderDropside() {
  return h('g', { fill: 'currentColor', fillRule: 'evenodd' },
    h('path', {
      d: 'M5 25h4a5 5 0 0 1 10 0h24a5 5 0 0 1 10 0h6v-3a2 2 0 0 0-2-2h-1v-4h-37v4h-1l-2-7L14 9H7a2 2 0 0 0-2 2v14z',
      opacity: '0.9',
    }),
    h('rect', { x: '22', y: '10', width: '2', height: '7', fill: 'currentColor', opacity: '0.75' }),
    h('path', { d: 'M26 18h10v3H26zm12 0h10v3H38zm12 0h8v3h-8z', fill: '#fff', fillOpacity: '0.45' }),
    h('path', { d: 'M7 16l4.5-5h6.5v5z', fill: '#fff', fillOpacity: '0.85' }),
    h('circle', { cx: '14', cy: '25', r: '4.2', fill: '#1e293b' }),
    h('circle', { cx: '14', cy: '25', r: '1.8', fill: '#e2e8f0' }),
    h('circle', { cx: '48', cy: '25', r: '4.2', fill: '#1e293b' }),
    h('circle', { cx: '48', cy: '25', r: '1.8', fill: '#e2e8f0' })
  );
}

function renderElf4W() {
  return h('g', { fill: 'currentColor', fillRule: 'evenodd' },
    h('path', {
      d: 'M6 25h4a4.5 4.5 0 0 1 9 0h22a4.5 4.5 0 0 1 9 0h5v-3a2 2 0 0 0-2-2h-1V9a2 2 0 0 0-2-2H23a2 2 0 0 0-2 2v2h-1l-2-1H8a2 2 0 0 0-2 2v13z',
      opacity: '0.9',
    }),
    h('path', { d: 'M8 17.5 10 11.5h8.5v6z', fill: '#fff', fillOpacity: '0.85' }),
    h('line', { x1: '24', y1: '10', x2: '24', y2: '21', stroke: '#fff', strokeWidth: '1', strokeOpacity: '0.4' }),
    h('line', { x1: '39', y1: '10', x2: '39', y2: '21', stroke: '#fff', strokeWidth: '1', strokeOpacity: '0.4' }),
    h('circle', { cx: '14.5', cy: '25', r: '3.8', fill: '#1e293b' }),
    h('circle', { cx: '14.5', cy: '25', r: '1.6', fill: '#e2e8f0' }),
    h('circle', { cx: '45.5', cy: '25', r: '3.8', fill: '#1e293b' }),
    h('circle', { cx: '45.5', cy: '25', r: '1.6', fill: '#e2e8f0' })
  );
}

function renderForward6W() {
  return h('g', { fill: 'currentColor', fillRule: 'evenodd' },
    h('path', {
      d: 'M5 25h4a5 5 0 0 1 10 0h24a5 5 0 0 1 10 0h6v-3a2 2 0 0 0-2-2h-1V6a2 2 0 0 0-2-2H23l-3 4h-2l-3 4-7 6v7z',
      opacity: '0.9',
    }),
    h('path', { d: 'M8.5 17.5l4-5h6.5v5z', fill: '#fff', fillOpacity: '0.85' }),
    h('rect', { x: '25', y: '21.5', width: '10', height: '3', rx: '1', fill: '#fff', fillOpacity: '0.5' }),
    h('line', { x1: '34', y1: '7', x2: '34', y2: '21', stroke: '#fff', strokeWidth: '1', strokeOpacity: '0.35' }),
    h('line', { x1: '47', y1: '7', x2: '47', y2: '21', stroke: '#fff', strokeWidth: '1', strokeOpacity: '0.35' }),
    h('circle', { cx: '14', cy: '25', r: '4.2', fill: '#1e293b' }),
    h('circle', { cx: '14', cy: '25', r: '1.8', fill: '#e2e8f0' }),
    h('circle', { cx: '48', cy: '25', r: '4.2', fill: '#1e293b' }),
    h('circle', { cx: '48', cy: '25', r: '1.8', fill: '#e2e8f0' })
  );
}

function renderWingVan10W() {
  return h('g', { fill: 'currentColor', fillRule: 'evenodd' },
    h('path', {
      d: 'M4 25h3.5a4.8 4.8 0 0 1 9.5 0h17a4.8 4.8 0 0 1 9.5 0h.5a4.8 4.8 0 0 1 9.5 0h4v-3a2 2 0 0 0-2-2h-1V5a2 2 0 0 0-2-2H22l-4 3h-2l-4 5-7 7v7z',
      opacity: '0.9',
    }),
    h('path', { d: 'M8 17.5 12 11h6v6.5z', fill: '#fff', fillOpacity: '0.85' }),
    h('line', { x1: '22', y1: '12', x2: '60', y2: '12', stroke: '#fff', strokeWidth: '1.2', strokeOpacity: '0.6' }),
    h('rect', { x: '29', y: '4', width: '3', height: '1.5', rx: '0.5', fill: '#fff', fillOpacity: '0.8' }),
    h('rect', { x: '42', y: '4', width: '3', height: '1.5', rx: '0.5', fill: '#fff', fillOpacity: '0.8' }),
    h('rect', { x: '53', y: '4', width: '3', height: '1.5', rx: '0.5', fill: '#fff', fillOpacity: '0.8' }),
    h('circle', { cx: '12.5', cy: '25', r: '4', fill: '#1e293b' }),
    h('circle', { cx: '12.5', cy: '25', r: '1.7', fill: '#e2e8f0' }),
    h('circle', { cx: '43.5', cy: '25', r: '4', fill: '#1e293b' }),
    h('circle', { cx: '43.5', cy: '25', r: '1.7', fill: '#e2e8f0' }),
    h('circle', { cx: '53', cy: '25', r: '4', fill: '#1e293b' }),
    h('circle', { cx: '53', cy: '25', r: '1.7', fill: '#e2e8f0' })
  );
}

function renderFallback() {
  return h('g', { fill: 'currentColor', fillRule: 'evenodd' },
    h('path', {
      d: 'M5 25h4a5 5 0 0 1 10 0h24a5 5 0 0 1 10 0h6v-3a2 2 0 0 0-2-2h-1V8a2 2 0 0 0-2-2H21l-4 4h-2l-3 4-6 5v6z',
      opacity: '0.88',
    }),
    h('path', { d: 'M8 17.5 12 12h6v5.5z', fill: '#fff', fillOpacity: '0.85' }),
    h('line', { x1: '22', y1: '8', x2: '22', y2: '21', stroke: '#fff', strokeWidth: '1', strokeOpacity: '0.4' }),
    h('circle', { cx: '14', cy: '25', r: '4.2', fill: '#1e293b' }),
    h('circle', { cx: '14', cy: '25', r: '1.8', fill: '#e2e8f0' }),
    h('circle', { cx: '48', cy: '25', r: '4.2', fill: '#1e293b' }),
    h('circle', { cx: '48', cy: '25', r: '1.8', fill: '#e2e8f0' })
  );
}

/**
 * Clean, accessible SVG vehicle silhouettes mapped to vehicle categories.
 */
export default function VehicleSilhouette({
  category,
  name,
  vehicle,
  size = 'md',
  width,
  height,
  className = '',
  ariaLabel,
  title,
  style = {},
  ...props
}) {
  const resolvedKey = resolveVehicleCategory(category || name || vehicle);
  const defaultLabel = getVehicleCategoryLabel(resolvedKey);
  const accessibleLabel = ariaLabel || title || (props['aria-hidden'] ? undefined : defaultLabel);

  const dimensions = SIZE_MAP[size] || SIZE_MAP.md;
  const svgWidth = width || dimensions.width;
  const svgHeight = height || dimensions.height;

  const isAccessible = Boolean(accessibleLabel && !props['aria-hidden']);

  let content;
  switch (resolvedKey) {
    case 'closed_van':
      content = renderClosedVan();
      break;
    case 'dropside':
      content = renderDropside();
      break;
    case 'elf_4w':
      content = renderElf4W();
      break;
    case 'forward_6w':
      content = renderForward6W();
      break;
    case 'wing_van_10w':
      content = renderWingVan10W();
      break;
    default:
      content = renderFallback();
      break;
  }

  return h(
    'svg',
    {
      viewBox: '0 0 64 32',
      width: svgWidth,
      height: svgHeight,
      className: `vehicle-silhouette vehicle-silhouette-${resolvedKey} ${className}`.trim(),
      role: isAccessible ? 'img' : undefined,
      'aria-label': isAccessible ? accessibleLabel : undefined,
      'aria-hidden': !isAccessible ? true : undefined,
      style: { display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style },
      ...props,
    },
    isAccessible ? h('title', null, accessibleLabel) : null,
    content
  );
}

