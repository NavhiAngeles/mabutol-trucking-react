import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveCity,
  resolveProvince,
  searchBarangays,
  searchCities,
  searchProvinces,
} from "./phAddress.js";

test("phAddress resolves standard provinces and Metro Manila (NCR) aliases", () => {
  const bulacan = resolveProvince("Bulacan");
  assert.ok(bulacan);
  assert.equal(bulacan.name, "Bulacan");

  const ncr = resolveProvince("NCR");
  assert.ok(ncr);
  assert.equal(ncr.name, "Metro Manila");

  const provResults = searchProvinces("Nueva");
  assert.ok(provResults.some(p => p.name === "Nueva Ecija"));
  assert.ok(provResults.some(p => p.name === "Nueva Vizcaya"));
});

test("phAddress filters cities by province including Metro Manila and resolves parent province", () => {
  const ncrCities = searchCities("Pasig", { provinceName: "Metro Manila" });
  assert.ok(ncrCities.length >= 1);
  assert.equal(ncrCities[0].name, "Pasig City");
  assert.equal(ncrCities[0].provinceName, "Metro Manila");

  // Direct city search across Philippines without province selected
  const cabanatuan = searchCities("Cabanatuan");
  assert.ok(cabanatuan.some(c => c.name === "Cabanatuan City" && c.provinceName === "Nueva Ecija"));

  // Manila City aggregates district barangays cleanly
  const manilaCity = resolveCity("Manila City", "Metro Manila");
  assert.ok(manilaCity);
  const manilaBarangays = searchBarangays("Barangay 287", { cityCode: manilaCity.code });
  assert.ok(manilaBarangays.some(b => b.name === "Barangay 287"));
});

test("phAddress searches barangays nationwide and includes parent city/province metadata", () => {
  // Empty query with no city/province returns empty list
  assert.deepEqual(searchBarangays(""), []);

  const ugongs = searchBarangays("Ugong");
  assert.ok(ugongs.length >= 2);
  const pasigUgong = ugongs.find(b => b.cityName === "Pasig City" && b.provinceName === "Metro Manila");
  assert.ok(pasigUgong);
  assert.equal(pasigUgong.subtitle, "Pasig City, Metro Manila");
});
