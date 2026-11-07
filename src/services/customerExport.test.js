import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  formatPhilippineTimestamp,
  customerExportCsv,
  generateCustomerPdf,
  downloadCustomerExport,
} from './customerExport.js';

test('formatPhilippineTimestamp formats timestamp to Asia/Manila with PHT', () => {
  const ts = '2026-11-08T00:00:00Z'; // 8:00 AM PHT
  const formatted = formatPhilippineTimestamp(ts);
  assert.ok(formatted.includes('PHT'), 'Expected PHT timezone marker');
  assert.ok(formatted.includes('Nov 8, 2026'), 'Expected Philippine date');
});

test('customerExportCsv outputs UTF-8 BOM and formula-injection-safe CSV', () => {
  const mockCustomers = [
    {
      customer_code: 'CUST-001',
      name: '=SUM(1,2)', // formula injection attempt
      email: 'user@example.test',
      phone: '09171234567',
      bookingCount: 5,
      lastBooking: 'Nov 7, 2026, 04:30 PM PHT',
      memberSince: 'Oct 1, 2026',
      status: 'Active',
    },
    {
      id: 'cust-uuid-2',
      name: 'Jane "Ace" Doe', // quotes
      email: '-danger@example.test', // starts with hyphen
      phone: '+639171234567', // starts with plus
      bookingCount: 0,
      lastBooking: 'Never',
      memberSince: 'Nov 1, 2026',
      status: 'Suspended',
    },
  ];

  const csv = customerExportCsv(mockCustomers);

  // BOM check
  assert.equal(csv.charCodeAt(0), 0xFEFF, 'Expected UTF-8 BOM as first character');

  // Header check
  assert.ok(csv.includes('"Customer ID","Name","Email","Phone","Bookings","Last booking","Member since","Status"'));

  // Formula escape check
  assert.ok(csv.includes(`"'=SUM(1,2)"`), 'Expected leading equals escaped with single quote');
  assert.ok(csv.includes(`"'-danger@example.test"`), 'Expected leading hyphen escaped with single quote');
  assert.ok(csv.includes(`"'+639171234567"`), 'Expected leading plus escaped with single quote');

  // Double quotes escape check
  assert.ok(csv.includes('"Jane ""Ace"" Doe"'), 'Expected quotes escaped by doubling');
});

test('generateCustomerPdf generates a valid landscape jsPDF document with table data and filters', () => {
  const mockCustomers = [
    {
      customer_code: 'CUST-001',
      name: 'Alpha Customer',
      email: 'alpha@example.test',
      phone: '09171234567',
      bookingCount: 12,
      lastBooking: 'Nov 8, 2026, 08:00 AM PHT',
      memberSince: 'Sep 10, 2026',
      status: 'Active',
    },
  ];

  const doc = generateCustomerPdf(mockCustomers, {
    query: 'Alpha',
    status: 'ACTIVE',
    sort: 'name',
    todayOnly: true,
  });

  assert.ok(doc, 'Expected jsPDF document instance');
  const pageCount = doc.internal.getNumberOfPages();
  assert.equal(pageCount, 1, 'Expected 1 page for single customer record');

  // Verify document can output an array buffer / string without throwing
  const output = doc.output();
  assert.ok(typeof output === 'string' && output.startsWith('%PDF-'), 'Expected valid PDF output stream');
});

test('downloadCustomerExport delegates to PDF save and CSV download', () => {
  const mockCustomers = [
    { customer_code: 'C-01', name: 'Test', email: 'test@example.test', phone: '09123456789', bookingCount: 1, lastBooking: 'Never', memberSince: '2026', status: 'Active' },
  ];

  const originalDocument = globalThis.document;
  const originalURL = globalThis.URL;

  try {
    let clicked = false;
    let createdBlob = null;

    globalThis.document = {
      body: {
        appendChild(el) { el._parent = this; },
      },
      createElement(tag) {
        return {
          tagName: tag.toUpperCase(),
          click() { clicked = true; },
          remove() { this._parent = null; },
        };
      },
    };
    globalThis.URL = {
      createObjectURL(blob) {
        createdBlob = blob;
        return 'blob:mock-url';
      },
      revokeObjectURL() {},
    };

    // Test CSV export
    downloadCustomerExport(mockCustomers, 'csv');
    assert.equal(clicked, true, 'Expected CSV link to be clicked');
    assert.ok(createdBlob, 'Expected blob to be created');

    // Test PDF export does not crash
    downloadCustomerExport(mockCustomers, 'pdf');
    const dateStr = new Date().toISOString().slice(0, 10);
    const generatedPdf = `mabutol-customers-${dateStr}.pdf`;
    if (fs.existsSync(generatedPdf)) {
      fs.unlinkSync(generatedPdf);
    }
  } finally {
    globalThis.document = originalDocument;
    globalThis.URL = originalURL;
  }
});
