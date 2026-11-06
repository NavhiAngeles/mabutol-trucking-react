import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import VehicleSilhouette, { resolveVehicleCategory, getVehicleCategoryLabel } from './VehicleSilhouette.js';

test('resolveVehicleCategory maps all standard vehicle categories, case-insensitively', () => {
  // Closed Van
  assert.equal(resolveVehicleCategory('Closed Van'), 'closed_van');
  assert.equal(resolveVehicleCategory('closed van'), 'closed_van');
  assert.equal(resolveVehicleCategory('closed_van'), 'closed_van');
  assert.equal(resolveVehicleCategory('CLOSED-VAN'), 'closed_van');
  assert.equal(resolveVehicleCategory('Van'), 'closed_van');
  assert.equal(resolveVehicleCategory({ name: 'Closed Van' }), 'closed_van');

  // Dropside
  assert.equal(resolveVehicleCategory('Dropside'), 'dropside');
  assert.equal(resolveVehicleCategory('dropside'), 'dropside');
  assert.equal(resolveVehicleCategory('drop side'), 'dropside');
  assert.equal(resolveVehicleCategory('drop-side'), 'dropside');
  assert.equal(resolveVehicleCategory('flatbed'), 'dropside');
  assert.equal(resolveVehicleCategory({ name: 'Dropside Truck' }), 'dropside');

  // Elf 4W / Light Truck
  assert.equal(resolveVehicleCategory('Elf / 4-Wheeler'), 'elf_4w');
  assert.equal(resolveVehicleCategory('Elf 4W'), 'elf_4w');
  assert.equal(resolveVehicleCategory('Elf'), 'elf_4w');
  assert.equal(resolveVehicleCategory('4-Wheeler'), 'elf_4w');
  assert.equal(resolveVehicleCategory('4W'), 'elf_4w');
  assert.equal(resolveVehicleCategory('Light Truck'), 'elf_4w');
  assert.equal(resolveVehicleCategory({ name: 'Elf (4-Wheeler)' }), 'elf_4w');

  // 6W Forward / Medium Truck
  assert.equal(resolveVehicleCategory('6W Forward'), 'forward_6w');
  assert.equal(resolveVehicleCategory('6-Wheeler'), 'forward_6w');
  assert.equal(resolveVehicleCategory('6W'), 'forward_6w');
  assert.equal(resolveVehicleCategory('Forward'), 'forward_6w');
  assert.equal(resolveVehicleCategory('Medium Truck (4,000 kg)'), 'forward_6w');
  assert.equal(resolveVehicleCategory({ name: '6W Forward Truck' }), 'forward_6w');

  // 10W Wing Van / Heavy Truck
  assert.equal(resolveVehicleCategory('10W Wing Van'), 'wing_van_10w');
  assert.equal(resolveVehicleCategory('10-Wheeler Wing Van'), 'wing_van_10w');
  assert.equal(resolveVehicleCategory('10-Wheeler'), 'wing_van_10w');
  assert.equal(resolveVehicleCategory('Wing Van'), 'wing_van_10w');
  assert.equal(resolveVehicleCategory('10W'), 'wing_van_10w');
  assert.equal(resolveVehicleCategory('Heavy Truck (10,000 kg)'), 'wing_van_10w');
  assert.equal(resolveVehicleCategory('Heavy Truck'), 'wing_van_10w');
  assert.equal(resolveVehicleCategory({ name: '10W Wing Van' }), 'wing_van_10w');
});

test('resolveVehicleCategory falls back gracefully for custom or unmapped types and edge cases', () => {
  assert.equal(resolveVehicleCategory('Custom Refrigerated Reefer'), 'fallback');
  assert.equal(resolveVehicleCategory('Motorcycle Delivery'), 'fallback');
  assert.equal(resolveVehicleCategory('Dump Truck 55'), 'fallback');
  assert.equal(resolveVehicleCategory('Unknown Type'), 'fallback');
  assert.equal(resolveVehicleCategory(''), 'fallback');
  assert.equal(resolveVehicleCategory('   '), 'fallback');
  assert.equal(resolveVehicleCategory(null), 'fallback');
  assert.equal(resolveVehicleCategory(undefined), 'fallback');
  assert.equal(resolveVehicleCategory({}), 'fallback');
});

test('getVehicleCategoryLabel returns accurate human-readable labels', () => {
  assert.equal(getVehicleCategoryLabel('closed_van'), 'Closed Van');
  assert.equal(getVehicleCategoryLabel('dropside'), 'Dropside');
  assert.equal(getVehicleCategoryLabel('elf_4w'), 'Elf 4W');
  assert.equal(getVehicleCategoryLabel('forward_6w'), '6W Forward');
  assert.equal(getVehicleCategoryLabel('wing_van_10w'), '10W Wing Van');
  assert.equal(getVehicleCategoryLabel('fallback'), 'Commercial Vehicle');
  assert.equal(getVehicleCategoryLabel('unknown_key'), 'Commercial Vehicle');
});

test('VehicleSilhouette renders accessible SVG elements with role="img" and title when accessible', () => {
  const html = renderToStaticMarkup(
    React.createElement(VehicleSilhouette, { category: 'Closed Van', ariaLabel: 'Closed Van illustration' })
  );

  assert.ok(html.includes('<svg'));
  assert.ok(html.includes('viewBox="0 0 64 32"'));
  assert.ok(html.includes('role="img"'));
  assert.ok(html.includes('aria-label="Closed Van illustration"'));
  assert.ok(html.includes('<title>Closed Van illustration</title>'));
  assert.ok(html.includes('vehicle-silhouette-closed_van'));
});

test('VehicleSilhouette renders with aria-hidden="true" when decorative alongside text', () => {
  const html = renderToStaticMarkup(
    React.createElement(VehicleSilhouette, { category: '10W Wing Van', 'aria-hidden': true, size: 'sm' })
  );

  assert.ok(html.includes('<svg'));
  assert.ok(html.includes('aria-hidden="true"'));
  assert.ok(!html.includes('role="img"'));
  assert.ok(html.includes('vehicle-silhouette-wing_van_10w'));
  assert.ok(html.includes('width="36"'));
  assert.ok(html.includes('height="18"'));
});

test('VehicleSilhouette renders distinctive geometry for each vehicle category and fallback', () => {
  const categories = [
    { key: 'closed_van', input: 'Closed Van' },
    { key: 'dropside', input: 'Dropside' },
    { key: 'elf_4w', input: 'Elf 4W' },
    { key: 'forward_6w', input: '6W Forward' },
    { key: 'wing_van_10w', input: '10W Wing Van' },
    { key: 'fallback', input: 'Custom Tanker' },
  ];

  for (const { key, input } of categories) {
    const html = renderToStaticMarkup(React.createElement(VehicleSilhouette, { category: input }));
    assert.ok(html.includes(`vehicle-silhouette-${key}`), `renders vehicle-silhouette-${key}`);
    assert.ok(html.includes('<circle'), 'renders wheels');
    assert.ok(html.includes('<path'), 'renders body path');
  }
});

test('VehicleSilhouette supports size presets and custom width/height', () => {
  const smHtml = renderToStaticMarkup(React.createElement(VehicleSilhouette, { category: 'Elf', size: 'sm' }));
  assert.ok(smHtml.includes('width="36"') && smHtml.includes('height="18"'));

  const mdHtml = renderToStaticMarkup(React.createElement(VehicleSilhouette, { category: 'Elf', size: 'md' }));
  assert.ok(mdHtml.includes('width="54"') && mdHtml.includes('height="27"'));

  const lgHtml = renderToStaticMarkup(React.createElement(VehicleSilhouette, { category: 'Elf', size: 'lg' }));
  assert.ok(lgHtml.includes('width="72"') && lgHtml.includes('height="36"'));

  const customHtml = renderToStaticMarkup(React.createElement(VehicleSilhouette, { category: 'Elf', width: 80, height: 40 }));
  assert.ok(customHtml.includes('width="80"') && customHtml.includes('height="40"'));
});
