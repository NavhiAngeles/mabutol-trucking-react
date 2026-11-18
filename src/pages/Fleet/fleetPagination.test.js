import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Fleet formats formatDate and driver location recorded_at in Philippine time Asia/Manila', () => {
  const source = fs.readFileSync(new URL('./FleetDriversView.jsx', import.meta.url), 'utf8');

  // Verify formatDate implementation
  assert.ok(
    source.includes('toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "2-digit", year: "numeric" })'),
    'formatDate should use en-PH with Asia/Manila timeZone'
  );

  // Verify driver.location.recorded_at implementation
  assert.ok(
    source.includes('toLocaleString("en-PH", { timeZone: "Asia/Manila" })'),
    'driver.location.recorded_at should use en-PH with Asia/Manila timeZone'
  );
});

test('Fleet client pagination logic slices 10 items per page and computes page count correctly', () => {
  const PAGE_SIZE = 10;
  const mockVehicles = Array.from({ length: 25 }, (_, i) => ({ id: `truck-${i + 1}`, plate_number: `TRK-${i + 1}` }));

  const vehiclePageCount = Math.max(1, Math.ceil(mockVehicles.length / PAGE_SIZE));
  assert.equal(vehiclePageCount, 3);

  // Page 1
  let currentVehiclePage = 1;
  let pagedTrucks = mockVehicles.slice((currentVehiclePage - 1) * PAGE_SIZE, currentVehiclePage * PAGE_SIZE);
  assert.equal(pagedTrucks.length, 10);
  assert.equal(pagedTrucks[0].plate_number, 'TRK-1');
  assert.equal(pagedTrucks[9].plate_number, 'TRK-10');

  // Page 2
  currentVehiclePage = 2;
  pagedTrucks = mockVehicles.slice((currentVehiclePage - 1) * PAGE_SIZE, currentVehiclePage * PAGE_SIZE);
  assert.equal(pagedTrucks.length, 10);
  assert.equal(pagedTrucks[0].plate_number, 'TRK-11');
  assert.equal(pagedTrucks[9].plate_number, 'TRK-20');

  // Page 3
  currentVehiclePage = 3;
  pagedTrucks = mockVehicles.slice((currentVehiclePage - 1) * PAGE_SIZE, currentVehiclePage * PAGE_SIZE);
  assert.equal(pagedTrucks.length, 5);
  assert.equal(pagedTrucks[0].plate_number, 'TRK-21');
  assert.equal(pagedTrucks[4].plate_number, 'TRK-25');
});

test('Fleet source contains client pagination footers and search reset triggers for Vehicles and Drivers', () => {
  const vehiclesSource = fs.readFileSync(new URL('./FleetVehiclesView.jsx', import.meta.url), 'utf8');
  const driversSource = fs.readFileSync(new URL('./FleetDriversView.jsx', import.meta.url), 'utf8');
  const paginationSource = fs.readFileSync(new URL('./PaginationFooter.jsx', import.meta.url), 'utf8');

  // PAGE_SIZE constant
  assert.ok(vehiclesSource.includes('const PAGE_SIZE = 10;'), 'Vehicles PAGE_SIZE should be 10');
  assert.ok(driversSource.includes('const PAGE_SIZE = 10;'), 'Drivers PAGE_SIZE should be 10');

  // Pagination states
  assert.ok(vehiclesSource.includes('const [vehiclePage, setVehiclePage] = useState(1);'));
  assert.ok(driversSource.includes('const [driverPage, setDriverPage] = useState(1);'));

  // Reset triggers
  assert.ok(vehiclesSource.includes('setVehiclePage(1)'), 'vehicleSearch and category click should reset vehiclePage to 1');
  assert.ok(driversSource.includes('setDriverPage(1)'), 'driverSearch should reset driverPage to 1');

  // Pagination footers present
  assert.ok(paginationSource.includes('className="table-pagination-footer"'));
  assert.ok(vehiclesSource.includes('paginationAriaLabel="Vehicles table pagination"'));
  assert.ok(driversSource.includes('paginationAriaLabel="Drivers table pagination"'));
});

