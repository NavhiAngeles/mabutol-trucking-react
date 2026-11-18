import {
  getAllBarangays,
  getAllMunicipalities,
  getAllProvinces,
  getAllRegions,
} from "@aivangogh/ph-address";

const NCR_REGION_CODE = "1300000000";
const MANILA_CITY_CODE = "1380600000";
const ISABELA_AREA_CODE = "0990100000";
const BARMM_SGA_CODE = "1999900000";

const METRO_MANILA_LABEL = "Metro Manila";
const METRO_MANILA_ALIASES = "metro manila ncr national capital region";

let cachedIndex = null;

function normalizeText(value) {
  return typeof value === "string"
    ? value.trim().toLowerCase().replace(/\s+/g, " ")
    : "";
}

function buildIndex() {
  if (cachedIndex) return cachedIndex;

  const regions = getAllRegions();
  const provinces = getAllProvinces();
  const municipalities = getAllMunicipalities();
  const barangays = getAllBarangays();

  const regionByCode = new Map();
  for (let i = 0; i < regions.length; i++) {
    regionByCode.set(regions[i].psgcCode, regions[i]);
  }

  const provinceOptions = [];
  const provinceByCode = new Map();
  const provinceByName = new Map();

  for (let i = 0; i < provinces.length; i++) {
    const p = provinces[i];
    const reg = regionByCode.get(p.regionCode);
    const regLabel = reg
      ? reg.designation && reg.designation !== reg.name
        ? `${reg.designation} · ${reg.name}`
        : reg.name
      : "";
    const opt = {
      id: p.psgcCode,
      code: p.psgcCode,
      label: p.name,
      name: p.name,
      subtitle: regLabel,
      regionCode: p.regionCode,
      nameLower: normalizeText(p.name),
      searchText: normalizeText(`${p.name} ${reg?.name || ""} ${reg?.designation || ""}`),
    };
    provinceOptions.push(opt);
    provinceByCode.set(opt.code, opt);
    provinceByName.set(opt.nameLower, opt);
  }

  // NCR cities sit directly under the National Capital Region without a province row.
  const ncrRegion = regionByCode.get(NCR_REGION_CODE);
  const metroManilaOpt = {
    id: NCR_REGION_CODE,
    code: NCR_REGION_CODE,
    label: METRO_MANILA_LABEL,
    name: METRO_MANILA_LABEL,
    subtitle: ncrRegion ? `${ncrRegion.name} (${ncrRegion.designation || "NCR"})` : "National Capital Region (NCR)",
    regionCode: NCR_REGION_CODE,
    nameLower: normalizeText(METRO_MANILA_LABEL),
    searchText: METRO_MANILA_ALIASES,
  };
  provinceOptions.push(metroManilaOpt);
  provinceByCode.set(NCR_REGION_CODE, metroManilaOpt);
  provinceByName.set("metro manila", metroManilaOpt);
  provinceByName.set("ncr", metroManilaOpt);
  provinceByName.set("national capital region", metroManilaOpt);
  provinceByName.set("metro manila (ncr)", metroManilaOpt);

  // Special PSGC areas outside the standard province table
  const reg9 = regionByCode.get("0900000000");
  const isabelaAreaOpt = {
    id: ISABELA_AREA_CODE,
    code: ISABELA_AREA_CODE,
    label: "Basilan (Isabela City)",
    name: "Basilan (Isabela City)",
    subtitle: reg9 ? `${reg9.designation || reg9.name} · Independent City` : "Region IX · Independent City",
    regionCode: "0900000000",
    nameLower: "basilan (isabela city)",
    searchText: "basilan isabela city region ix zamboanga peninsula",
  };
  provinceOptions.push(isabelaAreaOpt);
  provinceByCode.set(ISABELA_AREA_CODE, isabelaAreaOpt);
  provinceByName.set(isabelaAreaOpt.nameLower, isabelaAreaOpt);

  const barmmReg = regionByCode.get("1900000000");
  const sgaAreaOpt = {
    id: BARMM_SGA_CODE,
    code: BARMM_SGA_CODE,
    label: "Special Geographic Area (BARMM)",
    name: "Special Geographic Area (BARMM)",
    subtitle: barmmReg ? barmmReg.name : "Bangsamoro Autonomous Region In Muslim Mindanao",
    regionCode: "1900000000",
    nameLower: "special geographic area (barmm)",
    searchText: "special geographic area barmm cotabato",
  };
  provinceOptions.push(sgaAreaOpt);
  provinceByCode.set(BARMM_SGA_CODE, sgaAreaOpt);
  provinceByName.set(sgaAreaOpt.nameLower, sgaAreaOpt);

  provinceOptions.sort((a, b) => a.name.localeCompare(b.name));

  const municipalityOptions = [];
  const municipalityByCode = new Map();
  const municipalitiesByProvince = new Map();
  const manilaDistrictCodes = [];

  for (let i = 0; i < municipalities.length; i++) {
    const m = municipalities[i];
    const isManilaDistrict = m.provinceCode === MANILA_CITY_CODE;
    if (isManilaDistrict) {
      manilaDistrictCodes.push(m.psgcCode);
    }
    const effectiveProvinceCode = isManilaDistrict ? NCR_REGION_CODE : m.provinceCode;
    const provOpt = provinceByCode.get(effectiveProvinceCode);
    const provinceName = provOpt ? provOpt.name : "";
    const subtitle = isManilaDistrict
      ? `City of Manila, ${provinceName || METRO_MANILA_LABEL}`
      : provinceName;

    const opt = {
      id: m.psgcCode,
      code: m.psgcCode,
      label: m.name,
      name: m.name,
      subtitle,
      provinceCode: effectiveProvinceCode,
      provinceName,
      isManilaDistrict,
      nameLower: normalizeText(m.name),
      searchText: normalizeText(`${m.name} ${subtitle}`),
    };

    municipalityOptions.push(opt);
    municipalityByCode.set(opt.code, opt);

    let list = municipalitiesByProvince.get(effectiveProvinceCode);
    if (!list) {
      list = [];
      municipalitiesByProvince.set(effectiveProvinceCode, list);
    }
    list.push(opt);
  }

  for (const list of municipalitiesByProvince.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }

  const allBarangays = [];
  const barangaysByMunicipality = new Map();
  const barangaysByProvince = new Map();

  for (let i = 0; i < barangays.length; i++) {
    const b = barangays[i];
    const cityOpt = municipalityByCode.get(b.municipalCityCode);
    const cityName = cityOpt ? cityOpt.name : "";
    const provinceCode = cityOpt ? cityOpt.provinceCode : "";
    const provinceName = cityOpt ? cityOpt.provinceName : "";
    const subtitle = cityOpt?.isManilaDistrict
      ? `${cityName}, Manila, ${provinceName}`
      : [cityName, provinceName].filter(Boolean).join(", ");

    const opt = {
      id: b.psgcCode,
      code: b.psgcCode,
      label: b.name,
      name: b.name,
      subtitle,
      cityCode: b.municipalCityCode,
      cityName,
      provinceCode,
      provinceName,
      nameLower: normalizeText(b.name),
    };

    allBarangays.push(opt);

    let cityList = barangaysByMunicipality.get(b.municipalCityCode);
    if (!cityList) {
      cityList = [];
      barangaysByMunicipality.set(b.municipalCityCode, cityList);
    }
    cityList.push(opt);

    if (provinceCode) {
      let provList = barangaysByProvince.get(provinceCode);
      if (!provList) {
        provList = [];
        barangaysByProvince.set(provinceCode, provList);
      }
      provList.push(opt);
    }
  }

  // Manila City's barangays live under its 14 districts; aggregate them under Manila City too.
  if (manilaDistrictCodes.length > 0) {
    const manilaAll = [];
    for (let i = 0; i < manilaDistrictCodes.length; i++) {
      const districtList = barangaysByMunicipality.get(manilaDistrictCodes[i]);
      if (districtList) {
        for (let j = 0; j < districtList.length; j++) {
          manilaAll.push(districtList[j]);
        }
      }
    }
    manilaAll.sort((a, b) => a.name.localeCompare(b.name));
    barangaysByMunicipality.set(MANILA_CITY_CODE, manilaAll);
  }

  cachedIndex = {
    provinceOptions,
    provinceByCode,
    provinceByName,
    municipalityOptions,
    municipalityByCode,
    municipalitiesByProvince,
    allBarangays,
    barangaysByMunicipality,
    barangaysByProvince,
  };

  return cachedIndex;
}

function rankAndLimit(list, query, limit, matchField = "nameLower", secondaryField = null) {
  const q = normalizeText(query);
  if (!q) {
    return list.slice(0, limit);
  }

  const prefixMatches = [];
  const otherMatches = [];

  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    const primary = item[matchField];
    if (primary.startsWith(q)) {
      prefixMatches.push(item);
      if (prefixMatches.length >= limit) break;
    } else if (primary.includes(q) || (secondaryField && item[secondaryField].includes(q))) {
      if (prefixMatches.length + otherMatches.length < limit * 2) {
        otherMatches.push(item);
      }
    }
  }

  if (prefixMatches.length >= limit) {
    return prefixMatches.slice(0, limit);
  }
  return prefixMatches.concat(otherMatches).slice(0, limit);
}

export function resolveProvince(provinceNameOrCode) {
  const idx = buildIndex();
  if (!provinceNameOrCode) return null;
  const trimmed = String(provinceNameOrCode).trim();
  if (idx.provinceByCode.has(trimmed)) {
    return idx.provinceByCode.get(trimmed);
  }
  return idx.provinceByName.get(normalizeText(trimmed)) || null;
}

export function resolveCity(cityNameOrCode, provinceCodeOrName = "") {
  const idx = buildIndex();
  if (!cityNameOrCode) return null;
  const trimmed = String(cityNameOrCode).trim();
  const hasProvinceConstraint = Boolean(String(provinceCodeOrName || "").trim());
  const prov = hasProvinceConstraint ? resolveProvince(provinceCodeOrName) : null;
  if (hasProvinceConstraint && !prov) {
    return null;
  }

  if (idx.municipalityByCode.has(trimmed)) {
    const city = idx.municipalityByCode.get(trimmed);
    if (prov && city.provinceCode !== prov.code) {
      return null;
    }
    return city;
  }
  const normalized = normalizeText(trimmed);
  const pool = prov ? (idx.municipalitiesByProvince.get(prov.code) || []) : idx.municipalityOptions;
  return pool.find((item) => item.nameLower === normalized) || null;
}

export function resolveBarangayInCity(barangayName, cityCode) {
  const idx = buildIndex();
  if (!barangayName || !cityCode) return null;
  const normalized = normalizeText(barangayName);
  const list = idx.barangaysByMunicipality.get(cityCode);
  if (!list) return null;
  return list.find((item) => item.nameLower === normalized) || null;
}

export function searchProvinces(query = "", { limit = 85 } = {}) {
  const idx = buildIndex();
  return rankAndLimit(idx.provinceOptions, query, limit, "nameLower", "searchText");
}

export function searchCities(query = "", { provinceCode = "", provinceName = "", limit = 60 } = {}) {
  const idx = buildIndex();
  const prov = resolveProvince(provinceCode || provinceName);
  const pool = prov ? (idx.municipalitiesByProvince.get(prov.code) || []) : idx.municipalityOptions;
  return rankAndLimit(pool, query, limit, "nameLower", "searchText");
}

export function searchBarangays(
  query = "",
  { cityCode = "", cityName = "", provinceCode = "", provinceName = "", limit = 60 } = {}
) {
  const idx = buildIndex();
  const prov = resolveProvince(provinceCode || provinceName);
  const city = resolveCity(cityCode || cityName, prov?.code || "");

  if (city) {
    const pool = idx.barangaysByMunicipality.get(city.code) || [];
    return rankAndLimit(pool, query, limit, "nameLower");
  }

  if (prov) {
    const pool = idx.barangaysByProvince.get(prov.code) || [];
    return rankAndLimit(pool, query, limit, "nameLower");
  }

  // Avoid dumping thousands of un-filtered barangays before the user types or narrows by city/province.
  const q = normalizeText(query);
  if (!q) return [];
  return rankAndLimit(idx.allBarangays, q, limit, "nameLower");
}
