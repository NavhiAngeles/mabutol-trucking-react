import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isDemoVehicleName,
  getOfficialVehicleModel,
  sanitizePlateNumber,
  sanitizeFleetCode,
  sanitizeTruck,
  OFFICIAL_MODELS_BY_CATEGORY,
} from './officialVehicleModels.js';

test('isDemoVehicleName identifies demo and synthetic vehicle names', () => {
  assert.equal(isDemoVehicleName('TANAW Demo 01'), true);
  assert.equal(isDemoVehicleName('Demo Truck'), true);
  assert.equal(isDemoVehicleName('Demo Vehicle'), true);
  assert.equal(isDemoVehicleName('Fixture Truck'), true);
  assert.equal(isDemoVehicleName('placeholder vehicle'), true);
  assert.equal(isDemoVehicleName('test truck'), true);
  assert.equal(isDemoVehicleName(''), true);
  assert.equal(isDemoVehicleName(null), true);
  assert.equal(isDemoVehicleName(undefined), true);

  assert.equal(isDemoVehicleName('Isuzu Giga CYH52 Wing Van'), false);
  assert.equal(isDemoVehicleName('Hino 500 Series Dropside'), false);
  assert.equal(isDemoVehicleName('Mitsubishi Fuso Canter'), false);
  assert.equal(isDemoVehicleName('Isuzu Elf NLR77 Aluminum Van'), false);
});

test('getOfficialVehicleModel returns existing official model unchanged', () => {
  const truck = { model: 'Isuzu Forward FRR90 6-Wheeler' };
  assert.equal(getOfficialVehicleModel(truck), 'Isuzu Forward FRR90 6-Wheeler');
});

test('getOfficialVehicleModel resolves official model based on vehicle type', () => {
  // 10-Wheeler Wing Van
  const wingVan = {
    model: 'TANAW Demo 10W',
    vehicle_types: { name: '10-Wheeler Wing Van' },
  };
  assert.equal(getOfficialVehicleModel(wingVan, 0), OFFICIAL_MODELS_BY_CATEGORY.wing_van_10w[0]);
  assert.equal(getOfficialVehicleModel(wingVan, 1), OFFICIAL_MODELS_BY_CATEGORY.wing_van_10w[1]);

  // 6-Wheeler
  const sixWheeler = {
    model: 'Demo Truck 6W',
    vehicle_types: { name: 'Medium Truck (4,000 kg)' },
  };
  assert.equal(getOfficialVehicleModel(sixWheeler, 0), OFFICIAL_MODELS_BY_CATEGORY.forward_6w[0]);

  // Dropside
  const dropside = {
    model: '',
    vehicle_types: { name: 'Dropside' },
  };
  assert.equal(getOfficialVehicleModel(dropside, 0), OFFICIAL_MODELS_BY_CATEGORY.dropside[0]);

  // Elf 4-Wheeler
  const elf = {
    model: null,
    vehicle_types: { name: 'Elf / 4-Wheeler' },
  };
  assert.equal(getOfficialVehicleModel(elf, 0), OFFICIAL_MODELS_BY_CATEGORY.elf_4w[0]);

  // Closed Van
  const van = {
    model: 'Demo Van',
    vehicle_types: { name: 'Closed Van' },
  };
  assert.equal(getOfficialVehicleModel(van, 0), OFFICIAL_MODELS_BY_CATEGORY.closed_van[0]);
});

test('getOfficialVehicleModel infers category from capacity when type is generic or missing', () => {
  const heavy = { model: 'Demo', capacity_kg: 12000 };
  assert.equal(getOfficialVehicleModel(heavy), OFFICIAL_MODELS_BY_CATEGORY.wing_van_10w[0]);

  const medium = { model: 'Demo', capacity_kg: 5000 };
  assert.equal(getOfficialVehicleModel(medium), OFFICIAL_MODELS_BY_CATEGORY.forward_6w[0]);

  const light = { model: 'Demo', capacity_kg: 2000 };
  assert.equal(getOfficialVehicleModel(light), OFFICIAL_MODELS_BY_CATEGORY.elf_4w[0]);
});

test('sanitizePlateNumber converts demo plates to official commercial plates', () => {
  assert.equal(sanitizePlateNumber('DEMO-VAN-01'), 'NBC 1024');
  assert.equal(sanitizePlateNumber('DEMO-6W-02'), 'NDB 5821');
  assert.equal(sanitizePlateNumber('DEMO-ELF-01'), 'CAH 7392');
  assert.equal(sanitizePlateNumber('DEMO-WING-02'), 'RFA 2841');

  // Realistic plate numbers preserved
  assert.equal(sanitizePlateNumber('NBC 1234'), 'NBC 1234');
  assert.equal(sanitizePlateNumber('NDB-5821'), 'NDB-5821');
});

test('sanitizeFleetCode converts demo fleet codes to official MAB-TRK-XX format', () => {
  assert.equal(sanitizeFleetCode('TANAW-DEMO-01', 1), 'MAB-TRK-01');
  assert.equal(sanitizeFleetCode('DEMO-02', 2), 'MAB-TRK-02');
  assert.equal(sanitizeFleetCode(null, 5), 'MAB-TRK-05');
  assert.equal(sanitizeFleetCode('MAB-TRK-07', 7), 'MAB-TRK-07');
});

test('sanitizeTruck transforms entire truck record into official presentation', () => {
  const demoTruck = {
    id: 'trk-01',
    plate_number: 'DEMO-VAN-01',
    fleet_code: 'TANAW-DEMO-01',
    model: 'TANAW Demo Closed Van',
    capacity_kg: 3000,
    vehicle_types: { name: 'Closed Van' },
  };

  const cleanTruck = sanitizeTruck(demoTruck, 0);
  assert.equal(cleanTruck.model, 'Isuzu Elf NLR77 Aluminum Van');
  assert.equal(cleanTruck.plate_number, 'NBC 1024');
  assert.equal(cleanTruck.fleet_code, 'MAB-TRK-01');
});

