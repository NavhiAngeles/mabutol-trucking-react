import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { transformWithOxc } from 'vite';
import { buildRouteGeoJSON, disperseTruckCoordinates } from '../../services/dashboardRouteGeometry.js';

test('disperseTruckCoordinates offsets overlapping trucks so every truck is distinctly visible', () => {
  // 3 trucks with identical coordinates (e.g. at the same depot/warehouse)
  const overlappingTrucks = [
    { truck_id: 'trk-01', plate: 'DEMO-01', latitude: 14.8250, longitude: 120.8950 },
    { truck_id: 'trk-02', plate: 'DEMO-02', latitude: 14.8250, longitude: 120.8950 },
    { truck_id: 'trk-03', plate: 'DEMO-03', latitude: 14.8250, longitude: 120.8950 },
  ];

  const dispersed = disperseTruckCoordinates(overlappingTrucks);
  assert.equal(dispersed.length, 3);

  // All 3 trucks preserve their original coordinates for calculations
  assert.equal(dispersed[0].latitude, 14.8250);
  assert.equal(dispersed[1].latitude, 14.8250);
  assert.equal(dispersed[2].latitude, 14.8250);

  // But display coordinates are dispersed so no two markers stack directly on top of each other
  const displayCoords = dispersed.map(t => `${t.displayLatitude},${t.displayLongitude}`);
  const uniqueDisplayCoords = new Set(displayCoords);
  assert.equal(uniqueDisplayCoords.size, 3, 'All 3 overlapping trucks must have unique display coordinates');

  // Trucks that are far apart retain their exact coordinates
  const isolatedTrucks = [
    { truck_id: 'trk-A', plate: 'ISOL-A', latitude: 14.5995, longitude: 120.9842 }, // Manila
    { truck_id: 'trk-B', plate: 'ISOL-B', latitude: 16.4023, longitude: 120.5960 }, // Baguio
  ];
  const isolatedDispersed = disperseTruckCoordinates(isolatedTrucks);
  assert.equal(isolatedDispersed[0].displayLatitude, 14.5995);
  assert.equal(isolatedDispersed[0].displayLongitude, 120.9842);
  assert.equal(isolatedDispersed[1].displayLatitude, 16.4023);
  assert.equal(isolatedDispersed[1].displayLongitude, 120.5960);
});

test('buildRouteGeoJSON handles FeatureCollection, Feature, LineString and coordinate fallback', () => {
  // 1. Direct FeatureCollection
  const fc = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [[120.9, 14.5], [121.0, 14.6]] },
        properties: {}
      }
    ]
  };
  assert.deepEqual(buildRouteGeoJSON({ route_geometry: fc }), fc);

  // 2. Feature wrapper
  const feat = {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[120.9, 14.5], [121.0, 14.6]] },
    properties: {}
  };
  assert.equal(buildRouteGeoJSON({ route_geometry: feat }).type, 'FeatureCollection');
  assert.deepEqual(buildRouteGeoJSON({ route_geometry: feat }).features[0], feat);

  // 3. LineString wrapper
  const lineString = {
    type: 'LineString',
    coordinates: [[120.9, 14.5], [121.0, 14.6]]
  };
  const wrapped = buildRouteGeoJSON({ route_geometry: lineString });
  assert.equal(wrapped.type, 'FeatureCollection');
  assert.deepEqual(wrapped.features[0].geometry, lineString);

  // 4. Coordinates array fallback
  const rawCoords = { coordinates: [[120.9, 14.5], [121.0, 14.6]] };
  const fromCoords = buildRouteGeoJSON({ route_geometry: rawCoords });
  assert.equal(fromCoords.type, 'FeatureCollection');
  assert.deepEqual(fromCoords.features[0].geometry.coordinates, rawCoords.coordinates);

  // 5. Pickup & Dropoff coordinates fallback when route_geometry is absent
  const fromEndpoints = buildRouteGeoJSON({
    pickup_coordinates: [120.9842, 14.5995],
    dropoff_coordinates: [120.5960, 16.4023]
  });
  assert.equal(fromEndpoints.type, 'FeatureCollection');
  assert.deepEqual(fromEndpoints.features[0].geometry.coordinates, [
    [120.9842, 14.5995],
    [120.5960, 16.4023]
  ]);

  // 6. Null input
  assert.equal(buildRouteGeoJSON(null), null);
  assert.equal(buildRouteGeoJSON({}), null);
});

class MockElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.attributes = {};
    this.eventListeners = {};
    this.innerHTML = '';
  }

  appendChild(child) {
    if (child.parentElement) {
      child.parentElement.removeChild(child);
    }
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentElement = null;
    }
    return child;
  }

  remove() {
    if (this.parentElement) {
      this.parentElement.removeChild(this);
    }
  }

  setAttribute(k, v) {
    this.attributes[k] = v;
  }

  getAttribute(k) {
    return this.attributes[k];
  }

  addEventListener(event, fn) {
    this.eventListeners[event] = this.eventListeners[event] || [];
    this.eventListeners[event].push(fn);
  }

  dispatchEvent(event) {
    (this.eventListeners[event.type] || []).forEach(fn => fn(event));
  }
}

class MockMapLibreMap {
  constructor(options) {
    this.options = options;
    this.sources = {};
    this.layers = {};
    this.boundsFitted = null;
    this.handlers = {};
  }

  on(event, handler) {
    this.handlers[event] = this.handlers[event] || [];
    this.handlers[event].push(handler);
  }

  addSource(id, source) {
    this.sources[id] = source;
  }

  removeSource(id) {
    delete this.sources[id];
  }

  getSource(id) {
    return this.sources[id];
  }

  addLayer(layer) {
    this.layers[layer.id] = layer;
  }

  removeLayer(id) {
    delete this.layers[id];
  }

  getLayer(id) {
    return this.layers[id];
  }

  fitBounds(bounds, options) {
    this.boundsFitted = { bounds, options };
  }

  flyTo() {}
  resize() {}
  remove() {}
}

test('DashboardTrackingMap renders truck logo marker and displays assigned route on click', async () => {
  const mapPath = new URL('./DashboardTrackingMap.jsx', import.meta.url).pathname;
  const mapSource = await readFile(new URL('./DashboardTrackingMap.jsx', import.meta.url), 'utf8');
  const mapTransformed = await transformWithOxc(mapSource, mapPath, { jsx: { runtime: 'classic' } });

  const activeTruckFixture = {
    truck_id: 'truck-01',
    delivery_id: 'delivery-01',
    plate: 'NTH-8821',
    model: 'Isuzu Elf Dropside',
    driver_name: 'Danilo Ramos',
    tracking_number: 'SHP-NE-26-002315',
    delivery_status: 'in_transit',
    leg: 'destination',
    leg_label: 'On the way to destination',
    latitude: 15.0234,
    longitude: 120.6892,
    recorded_at: new Date().toISOString(),
    stale: false,
    pickup_address: 'Warehouse A, Guiguinto, Bulacan',
    dropoff_address: 'Distribution Center, San Fernando, Pampanga',
    pickup_coordinates: [120.8800, 14.8300],
    dropoff_coordinates: [120.6892, 15.0234],
    distance_km: 42.5,
    route_duration_minutes: 58,
    route_geometry: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [
              [120.8800, 14.8300],
              [120.7800, 14.9200],
              [120.6892, 15.0234]
            ]
          },
          properties: {}
        }
      ]
    }
  };

  const markersCreated = [];
  const mapInstances = [];
  const states = [];
  let stateIndex = 0;
  const effects = [];
  const refs = [];
  let refIndex = 0;

  const MockMarker = class {
    constructor(opts) {
      this.opts = opts;
      this.element = opts?.element || new MockElement('div');
      this.lngLat = null;
      this.isRemoved = false;
      markersCreated.push(this);
    }
    setLngLat(lngLat) {
      this.lngLat = lngLat;
      return this;
    }
    addTo() {
      return this;
    }
    remove() {
      this.isRemoved = true;
    }
  };

  const scope = {
    React: {
      createElement(type, props, ...children) {
        return { type, props: props || {}, children };
      }
    },
    useState(initial) {
      const idx = stateIndex++;
      if (!(idx in states)) {
        states[idx] = typeof initial === 'function' ? initial() : initial;
      }
      return [
        states[idx],
        value => {
          states[idx] = typeof value === 'function' ? value(states[idx]) : value;
        }
      ];
    },
    useRef(initial) {
      return refs[refIndex++] || (refs[refIndex - 1] = { current: initial });
    },
    useEffect(fn) {
      effects.push(fn);
    },
    useLiveData: () => ({ data: [activeTruckFixture], loading: false, error: null }),
    getLiveTracking: () => {},
    DASHBOARD_TABLES: [],
    absoluteEventTime: () => '11:45 PM',
    snapshotStatus: () => '',
    buildRouteGeoJSON,
    disperseTruckCoordinates,
    watchTrackingFreshness: (data, cb) => {
      cb([false]);
      return () => {};
    },
    maplibregl: {
      setWorkerUrl() {},
      Map: class extends MockMapLibreMap {
        constructor(opts) {
          super(opts);
          mapInstances.push(this);
        }
      },
      Marker: MockMarker,
      LngLatBounds: class {
        constructor() {
          this.coords = [];
        }
        extend(c) {
          this.coords.push(c);
        }
      }
    },
    maplibreWorkerUrl: 'test-worker',
    LUZON_CENTER: [121, 15],
    LUZON_BOUNDS: [],
    LUZON_MIN_ZOOM: 5,
    LUZON_MAX_ZOOM: 18,
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
    document: {
      createElement: tag => new MockElement(tag)
    },
    setTimeout,
    clearTimeout,
    console: { ...console, error: () => {} }
  };

  vm.createContext(scope);

  const cleanCode = mapTransformed.code
    .replace(/^import .*;$/gm, '')
    .replace(/export\s+default\s+function/g, 'function')
    .replace(/export\s+function/g, 'function')
    .replaceAll('import.meta.env.VITE_MAPTILER_API_KEY', '"test-maptiler-key"') +
    '\nthis.DashboardTrackingMap = DashboardTrackingMap;';

  vm.runInContext(cleanCode, scope);

  // 1. Initial Render
  stateIndex = 0;
  refIndex = 0;
  scope.DashboardTrackingMap();

  // Attach container to containerRef (refs[0])
  refs[0].current = new MockElement('div');

  // Run initialization effect (effects[0])
  effects[0]();
  assert.equal(mapInstances.length, 1);
  const map = mapInstances[0];

  // Run markers effect (effects[1])
  effects[1]();
  assert.equal(markersCreated.length, 1);
  const truckMarker = markersCreated[0];

  // Verify truck logo marker contains SVG and plate number
  assert.ok(truckMarker.element.className.includes('dashboard-truck-marker'));
  assert.ok(truckMarker.element.className.includes('is-live'));
  assert.ok(truckMarker.element.innerHTML.includes('truck-marker-svg'));
  assert.ok(truckMarker.element.innerHTML.includes('NTH-8821'));
  assert.equal(truckMarker.lngLat[0], 120.6892);
  assert.equal(truckMarker.lngLat[1], 15.0234);

  // 2. Click the truck logo marker
  truckMarker.element.dispatchEvent({ type: 'click', stopPropagation() {} });

  // Re-render with selected truck ID in state[2]
  assert.equal(states[2], 'truck-01');
  stateIndex = 0;
  refIndex = 0;
  effects.length = 0; // reset for next pass
  const tree = scope.DashboardTrackingMap();

  // Run the route drawing effect (effect index 3)
  effects[3]();

  // Verify route source and layers were added to the map
  assert.ok(map.getSource('dashboard-assigned-route-source'));
  assert.ok(map.getLayer('dashboard-assigned-route-casing'));
  assert.ok(map.getLayer('dashboard-assigned-route-line'));

  // Verify bounds were fitted
  assert.ok(map.boundsFitted);
  assert.equal(map.boundsFitted.options.maxZoom, 14);

  // Verify route endpoints were added
  const endpointMarkers = markersCreated.filter(m => m !== truckMarker);
  assert.equal(endpointMarkers.length, 2); // pickup and dropoff
  assert.ok(endpointMarkers.some(m => m.element.className.includes('endpoint-pickup')));
  assert.ok(endpointMarkers.some(m => m.element.className.includes('endpoint-dropoff')));

  // Verify assigned route card is rendered in the tree
  const treeString = JSON.stringify(tree);
  assert.ok(treeString.includes('NTH-8821'));
  assert.ok(treeString.includes('SHP-NE-26-002315'));
  assert.ok(treeString.includes('Danilo Ramos'));
  assert.ok(treeString.includes('Warehouse A, Guiguinto, Bulacan'));
  assert.ok(treeString.includes('Distribution Center, San Fernando, Pampanga'));
  assert.ok(treeString.includes('Clear Route'));
});

test('getLiveTracking maps active deliveries, legs, route geometry, and synthesizes active trucks without GPS logs', async () => {
  const serviceSource = await readFile(new URL('../../services/dashboardDetailService.js', import.meta.url), 'utf8');

  const mockDb = {
    tracking_logs: [
      {
        id: 'gps-01',
        delivery_id: 'del-01',
        truck_id: 'trk-01',
        driver_id: 'drv-01',
        latitude: 14.5995,
        longitude: 120.9842,
        recorded_at: new Date().toISOString()
      }
    ],
    deliveries: [
      // Delivery 1: in_transit with GPS logs
      {
        id: 'del-01',
        shipment_id: 'shp-01',
        truck_id: 'trk-01',
        driver_id: 'drv-01',
        status: 'in_transit',
        departed_at: new Date().toISOString()
      },
      // Delivery 2: assigned (on the way to pickup) with NO GPS logs yet
      {
        id: 'del-02',
        shipment_id: 'shp-02',
        truck_id: 'trk-02',
        driver_id: 'drv-02',
        status: 'assigned',
        route_started_at: new Date().toISOString()
      },
      // Delivery 3: delivered (inactive, should be excluded)
      {
        id: 'del-03',
        shipment_id: 'shp-03',
        truck_id: 'trk-03',
        driver_id: 'drv-03',
        status: 'delivered'
      }
    ],
    trucks: [
      { id: 'trk-01', plate_number: 'NTH-1111', model: '10W Wing Van' },
      { id: 'trk-02', plate_number: 'NTH-2222', model: '6W Forward' },
      { id: 'trk-03', plate_number: 'NTH-3333', model: '4W Dropside' }
    ],
    shipments: [
      {
        id: 'shp-01',
        tracking_number: 'SHP-001',
        pickup_address: 'Manila Port',
        dropoff_address: 'Bulacan Depot',
        pickup_lat: 14.59,
        pickup_lng: 120.98,
        dropoff_lat: 14.85,
        dropoff_lng: 120.89,
        route_geometry: { type: 'FeatureCollection', features: [] },
        distance_km: 35,
        route_duration_minutes: 50
      },
      {
        id: 'shp-02',
        tracking_number: 'SHP-002',
        pickup_address: 'Pampanga Farm',
        dropoff_address: 'Quezon City Market',
        pickup_lat: 15.05,
        pickup_lng: 120.65,
        dropoff_lat: 14.65,
        dropoff_lng: 121.03,
        route_geometry: null,
        distance_km: 72,
        route_duration_minutes: 95
      }
    ],
    drivers: [
      { id: 'drv-01', full_name: 'Driver One' },
      { id: 'drv-02', full_name: 'Driver Two' }
    ]
  };

  const scope = {
    fetchOperationalRows: async (table) => mockDb[table] || [],
    calculateDashboardAnalytics: () => ({}),
    latestTracking: (rows, deliveries) => {
      const active = new Set(deliveries.filter(d => ['assigned', 'loading', 'in_transit'].includes(d.status)).map(d => d.id));
      return rows.filter(r => active.has(r.delivery_id)).map(r => ({ ...r, stale: false }));
    },
    getComplianceConfiguration: async () => ({})
  };

  vm.createContext(scope);

  const cleanServiceCode = serviceSource
    .replace(/^import .*;$/gm, '')
    .replace(/export async function/g, 'async function')
    .replace(/export const/g, 'const') +
    '\nthis.getLiveTracking = getLiveTracking;';

  vm.runInContext(cleanServiceCode, scope);

  const result = await scope.getLiveTracking();

  // Exactly 2 active trucks should be returned (trk-01 and trk-02), trk-03 delivered excluded
  assert.equal(result.length, 2);

  const truck1 = result.find(t => t.truck_id === 'trk-01');
  assert.ok(truck1);
  assert.equal(truck1.plate, 'NTH-1111');
  assert.equal(truck1.leg, 'destination');
  assert.equal(truck1.leg_label, 'On the way to destination');
  assert.equal(truck1.driver_name, 'Driver One');
  assert.equal(truck1.tracking_number, 'SHP-001');
  assert.equal(truck1.pickup_address, 'Manila Port');
  assert.equal(truck1.dropoff_address, 'Bulacan Depot');

  const truck2 = result.find(t => t.truck_id === 'trk-02');
  assert.ok(truck2);
  assert.equal(truck2.plate, 'NTH-2222');
  assert.equal(truck2.leg, 'pickup');
  assert.equal(truck2.leg_label, 'On the way to pickup location');
  assert.equal(truck2.driver_name, 'Driver Two');
  assert.equal(truck2.tracking_number, 'SHP-002');
  // Initial fallback coordinates should match pickup coordinates
  assert.equal(truck2.latitude, 15.05);
  assert.equal(truck2.longitude, 120.65);
  assert.equal(truck2.isInitialLocation, true);
});
