import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export function formatPhilippineTimestamp(isoString = new Date().toISOString()) {
  try {
    const d = new Date(isoString);
    return d.toLocaleString('en-US', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }) + ' PHT';
  } catch {
    return isoString;
  }
}

export function customerExportCsv(customers) {
  const cell = value => {
    const text = String(value ?? '');
    const safe = /^[=+\-@\t\r]/.test(text.trimStart()) ? `'${text}` : text;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  const headers = ['Customer ID', 'Name', 'Email', 'Phone', 'Bookings', 'Last booking', 'Member since', 'Status'];
  const lines = [
    headers,
    ...customers.map(row => [
      row.customer_code || row.id || '',
      row.name || '',
      row.email || '',
      row.phone || '',
      row.bookingCount ?? row.bookings ?? 0,
      row.lastBooking || 'Never',
      row.memberSince || '',
      row.status || 'Active',
    ]),
  ];
  return '\uFEFF' + lines.map(line => line.map(cell).join(',')).join('\r\n') + '\r\n';
}

export function generateCustomerPdf(customers, filters = {}) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const generatedAt = formatPhilippineTimestamp();

  // Document Header
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text('Mabutol Trucking Logistics — Registered Customers', 14, 15);

  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105); // slate-600
  doc.text(`Total Customers: ${customers.length}  |  Generated at (Philippine time): ${generatedAt}`, 14, 22);

  const filterParts = [];
  if (filters.query) filterParts.push(`Search: "${filters.query}"`);
  if (filters.status && filters.status !== 'ALL') filterParts.push(`Status: ${filters.status}`);
  if (filters.todayOnly) filterParts.push('Bookings Today Only');
  if (filters.sort && filters.sort !== 'newest') filterParts.push(`Sort: ${filters.sort}`);

  let startY = 27;
  if (filterParts.length > 0) {
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`Filters: ${filterParts.join('; ')}`, 14, startY);
    startY += 6;
  } else {
    startY += 2;
  }

  const tableHeaders = ['CUSTOMER ID', 'NAME', 'EMAIL', 'CONTACT NUMBER', 'TOTAL BOOKINGS', 'LAST BOOKING', 'MEMBER SINCE', 'STATUS'];
  const tableRows = customers.map(row => [
    row.customer_code || row.id || '',
    row.name || '',
    row.email || '—',
    row.phone || '—',
    String(row.bookingCount ?? row.bookings ?? 0),
    row.lastBooking || 'Never',
    row.memberSince || '—',
    row.status || 'Active',
  ]);

  autoTable(doc, {
    head: [tableHeaders],
    body: tableRows,
    startY,
    margin: { left: 14, right: 14 },
    styles: { fontSize: 8.5, cellPadding: 3, textColor: [30, 41, 59] },
    headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold', fontSize: 9 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 32 },
      1: { cellWidth: 42 },
      2: { cellWidth: 50 },
      3: { cellWidth: 35 },
      4: { cellWidth: 26, halign: 'center' },
      5: { cellWidth: 32 },
      6: { cellWidth: 26 },
      7: { cellWidth: 26, halign: 'center' },
    },
  });

  // Footer on all pages
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text(
      `Page ${i} of ${pageCount} — Mabutol Trucking Logistics — Confidential Internal Document`,
      14,
      202
    );
  }

  return doc;
}

export function downloadCustomerExport(customers, format = 'csv', filters = {}) {
  const dateStr = new Date().toISOString().slice(0, 10);
  const baseName = `mabutol-customers-${dateStr}`;

  if (format === 'pdf') {
    const doc = generateCustomerPdf(customers, filters);
    doc.save(`${baseName}.pdf`);
    return;
  }

  const csvContent = customerExportCsv(customers);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${baseName}.csv`;
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

