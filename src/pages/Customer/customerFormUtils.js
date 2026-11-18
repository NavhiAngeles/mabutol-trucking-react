import { resolveBarangayInCity, resolveCity, resolveProvince } from "../../utils/phAddress.js";

/**
 * Format Philippine mobile input as `9XX XXX XXXX` (without the `+63` prefix badge).
 * Normalizes leading `09`, `639`, or `+639` inputs on typing or paste.
 */
export function formatPhMobileInput(raw) {
  if (typeof raw !== "string") return "";
  let digits = raw.replace(/\D/g, "");
  if (!digits) return "";

  if (digits.startsWith("639")) {
    digits = digits.slice(2);
  } else if (digits.startsWith("63") && digits.length > 2) {
    digits = digits.slice(2);
  } else if (digits.startsWith("09")) {
    digits = digits.slice(1);
  }

  if (digits.startsWith("9")) {
    const capped = digits.slice(0, 10);
    if (capped.length <= 3) return capped;
    if (capped.length <= 6) return `${capped.slice(0, 3)} ${capped.slice(3)}`;
    return `${capped.slice(0, 3)} ${capped.slice(3, 6)} ${capped.slice(6)}`;
  }

  return digits.slice(0, 10);
}

/**
 * Convert the displayed local mobile number (`9XX XXX XXXX`) into a full `+63 9XX XXX XXXX`
 * value for submission, preserving non-standard landline entries if provided.
 */
export function toFullPhPhone(displayValue) {
  const trimmed = typeof displayValue === "string" ? displayValue.trim() : "";
  if (!trimmed) return "";
  const digits = trimmed.replace(/\D/g, "");
  if (/^9\d{9}$/.test(digits)) {
    return `+63 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  }
  if (/^09\d{9}$/.test(digits)) {
    const local = digits.slice(1);
    return `+63 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
  }
  if (/^639\d{9}$/.test(digits)) {
    const local = digits.slice(2);
    return `+63 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
  }
  return trimmed;
}

/**
 * Canonical 12-digit Philippine mobile signature (`639XXXXXXXXX`) or raw digits for comparison.
 */
export function canonicalPhoneDigits(raw) {
  if (typeof raw !== "string") return "";
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (/^09\d{9}$/.test(digits)) return `63${digits.slice(1)}`;
  if (/^9\d{9}$/.test(digits)) return `63${digits}`;
  if (/^639\d{9}$/.test(digits)) return digits;
  return digits;
}

function normalizeName(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").toLowerCase() : "";
}

/**
 * Check whether the entered customer name or phone number matches an existing customer record.
 * Pass `excludeId` when editing an existing customer so it does not match itself.
 */
export function findDuplicateCustomer(existingCustomers, { name = "", phone = "", excludeId = null } = {}) {
  if (!Array.isArray(existingCustomers) || existingCustomers.length === 0) return null;

  const targetName = normalizeName(name);
  const targetPhone = canonicalPhoneDigits(phone);
  const canCheckName = targetName.length >= 2;
  const canCheckPhone = targetPhone.length >= 10;

  if (!canCheckName && !canCheckPhone) return null;

  let phoneMatch = null;
  let nameMatch = null;

  for (let i = 0; i < existingCustomers.length; i++) {
    const cust = existingCustomers[i];
    if (!cust || (excludeId && cust.id === excludeId)) continue;

    if (canCheckPhone && !phoneMatch && typeof cust.phone === "string") {
      const existingPhone = canonicalPhoneDigits(cust.phone);
      if (existingPhone && existingPhone === targetPhone) {
        phoneMatch = cust;
      }
    }

    if (canCheckName && !nameMatch && typeof cust.name === "string") {
      if (normalizeName(cust.name) === targetName) {
        nameMatch = cust;
      }
    }

    if (phoneMatch && nameMatch) break;
  }

  if (phoneMatch && nameMatch && phoneMatch.id === nameMatch.id) {
    return {
      type: "both",
      customer: phoneMatch,
      message: `Account with this contact number and name already exists (${phoneMatch.name}${phoneMatch.customer_code ? ` · ${phoneMatch.customer_code}` : ""}).`,
    };
  }

  if (phoneMatch) {
    return {
      type: "phone",
      customer: phoneMatch,
      message: `Account with this contact number already exists (${phoneMatch.name}${phoneMatch.customer_code ? ` · ${phoneMatch.customer_code}` : ""}).`,
    };
  }

  if (nameMatch) {
    return {
      type: "name",
      customer: nameMatch,
      message: `Account with this customer name already exists (${nameMatch.name}${nameMatch.customer_code ? ` · ${nameMatch.customer_code}` : ""}).`,
    };
  }

  return null;
}

/**
 * Pure hierarchical address transition helpers shared by Add and Edit customer dialogs.
 * Each operates on `{ values, provinceCode, cityCode }` so state stays atomic.
 */
export function applyProvinceTextChange(state, text) {
  const exact = resolveProvince(text);
  const nextProvinceCode = exact ? exact.code : "";
  const shouldClearStaleChildren = Boolean(
    exact && state.values.city && !resolveCity(state.cityCode || state.values.city, exact.code)
  );
  return {
    provinceCode: nextProvinceCode,
    cityCode: shouldClearStaleChildren ? "" : state.cityCode,
    values: {
      ...state.values,
      province: text,
      ...(shouldClearStaleChildren ? { city: "", barangay: "" } : {}),
    },
  };
}

export function applyProvinceSelection(state, option) {
  const currentCityMatchesProvince = Boolean(
    state.values.city && resolveCity(state.cityCode || state.values.city, option.code)
  );
  return {
    provinceCode: option.code,
    cityCode: currentCityMatchesProvince ? state.cityCode : "",
    values: {
      ...state.values,
      province: option.name,
      city: currentCityMatchesProvince ? state.values.city : "",
      barangay: currentCityMatchesProvince ? state.values.barangay : "",
    },
  };
}

export function applyCityTextChange(state, text) {
  const exact = resolveCity(text, state.provinceCode || state.values.province);
  const clearStaleBarangay = Boolean(
    exact && state.values.barangay && !resolveBarangayInCity(state.values.barangay, exact.code)
  );
  return {
    ...state,
    cityCode: exact ? exact.code : "",
    values: {
      ...state.values,
      city: text,
      ...(clearStaleBarangay ? { barangay: "" } : {}),
    },
  };
}

export function applyCitySelection(state, option) {
  const currentBarangayMatchesCity = Boolean(
    state.values.barangay && resolveBarangayInCity(state.values.barangay, option.code)
  );
  return {
    cityCode: option.code,
    provinceCode: option.provinceCode || state.provinceCode,
    values: {
      ...state.values,
      city: option.name,
      province: option.provinceName || state.values.province,
      barangay: currentBarangayMatchesCity ? state.values.barangay : "",
    },
  };
}

export function applyBarangaySelection(state, option) {
  const cityWasBlank = !state.values.city.trim();
  const provinceWasBlank = !state.values.province.trim();
  return {
    cityCode: cityWasBlank && option.cityCode ? option.cityCode : state.cityCode,
    provinceCode: provinceWasBlank && option.provinceCode ? option.provinceCode : state.provinceCode,
    values: {
      ...state.values,
      barangay: option.name,
      city: cityWasBlank ? (option.cityName || "") : state.values.city,
      province: provinceWasBlank ? (option.provinceName || "") : state.values.province,
    },
  };
}
