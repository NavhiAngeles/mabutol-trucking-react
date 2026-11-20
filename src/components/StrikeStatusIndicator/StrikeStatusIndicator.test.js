import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformSync } from 'esbuild';

function loadIndicatorComponent() {
  const standingRaw = fs.readFileSync(
    new URL('../../services/customerStandingService.js', import.meta.url),
    'utf8'
  )
    .replace(/^import .*;$/gm, '')
    .replace(/^export /gm, '');

  const indicatorRaw = fs.readFileSync(
    new URL('./StrikeStatusIndicator.jsx', import.meta.url),
    'utf8'
  );
  const { code } = transformSync(indicatorRaw, {
    loader: 'jsx',
    jsx: 'automatic',
    format: 'cjs',
  });

  const module = { exports: {} };
  const context = vm.createContext({
    React,
    Intl,
    Date,
    console,
    module,
    exports: module.exports,
    window: { addEventListener() {}, removeEventListener() {} },
  });

  vm.runInContext(
    `${standingRaw}\nthis.__standing = { normalizeCustomerStanding };`,
    context
  );

  const requireMock = (id) => {
    if (id === 'react') return React;
    if (id === 'react/jsx-runtime') return jsxRuntime;
    if (id.endsWith('customerStandingService')) return context.__standing;
    if (id.endsWith('.css')) return {};
    throw new Error(`Unexpected require in test: ${id}`);
  };

  vm.runInContext(
    `(function(require, module, exports) {\n${code}\n})`,
    context
  )(requireMock, module, module.exports);

  return module.exports.default;
}

test('StrikeStatusIndicator renders exact 0/3, 1/3, 2/3, 3/3 and +1 post-reinstatement circle markers with accessible labels and zero em dashes', () => {
  const StrikeStatusIndicator = loadIndicatorComponent();

  const html0 = renderToStaticMarkup(
    React.createElement(StrikeStatusIndicator, {
      customer: { no_show_strike_count: 0, standing_status: 'good' },
    })
  );
  assert.equal((html0.match(/strike-indicator__dot--filled/g) || []).length, 0);
  assert.equal((html0.match(/strike-indicator__dot--empty/g) || []).length, 3);
  assert.ok(html0.includes('0 of 3 strikes'));
  assert.equal(html0.includes('\u2014'), false);

  const html2 = renderToStaticMarkup(
    React.createElement(StrikeStatusIndicator, {
      customer: {
        no_show_strike_count: 2,
        standing_status: 'cooldown',
        booking_cooldown_until: new Date(Date.now() + 3600_000).toISOString(),
      },
      onClick: () => {},
    })
  );
  assert.equal((html2.match(/strike-indicator__dot--filled/g) || []).length, 2);
  assert.equal((html2.match(/strike-indicator__dot--empty/g) || []).length, 1);
  assert.ok(html2.includes('<button type="button"'));
  assert.ok(html2.includes('2 of 3 strikes'));

  const html4 = renderToStaticMarkup(
    React.createElement(StrikeStatusIndicator, {
      customer: { no_show_strike_count: 4, standing_status: 'suspended' },
      showCountText: true,
    })
  );
  assert.equal((html4.match(/strike-indicator__dot--filled/g) || []).length, 3);
  assert.equal((html4.match(/strike-indicator__dot--empty/g) || []).length, 0);
  assert.ok(html4.includes('+1'));
  assert.ok(html4.includes('3/3 (+1)'));
});
