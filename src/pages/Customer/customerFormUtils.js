import { resolveBarangayInCity, resolveCity, resolveProvince } from "../../utils/phAddress.js";

/**
 * Format Philippine mobile input as `9XX XXX XXXX` (without the `+63` prefix badge).
 * Normalizes leading `09`, `639`, or `+639` inputs on typing or paste.
 */
export function formatPhMobileInput(raw) {
  if (typeof raw !== "string") return "";
  let digits = raw.replace(/\D/g, "");
  if (!digits) return "";

  if (digits.startsWith("006309")) {
    digits = digits.slice(5);
  } else if (digits.startsWith("00639")) {
    digits = digits.slice(4);
  } else if (digits.startsWith("0063") && digits.length > 4) {
    digits = digits.slice(4);
  } else if (digits.startsWith("6309")) {
    digits = digits.slice(3);
  } else if (digits.startsWith("639")) {
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

  let local = null;
  if (/^9\d{9}$/.test(digits)) local = digits;
  else if (/^09\d{9}$/.test(digits)) local = digits.slice(1);
  else if (/^639\d{9}$/.test(digits)) local = digits.slice(2);
  else if (/^6309\d{9}$/.test(digits)) local = digits.slice(3);
  else if (/^00630?9\d{9}$/.test(digits)) local = digits.replace(/^00630?/, "");

  if (local) {
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
  if (/^6309\d{9}$/.test(digits)) return `63${digits.slice(3)}`;
  if (/^00630?9\d{9}$/.test(digits)) return `63${digits.replace(/^00630?/, "")}`;
  return digits;
}

/**
 * Validate a customer contact number (optional).
 * Accepts complete Philippine mobile numbers (`09XX`, `+639XX`, `6309XX`, `00639XX`)
 * or valid 7–15 digit landline numbers, while rejecting partial/malformed mobile numbers.
 */
export function isValidCustomerPhone(raw) {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed) return true;
  if (!/^[\d+\s()\-–—.]+$/.test(trimmed)) return false;
  const cleaned = trimmed.replace(/[\s()\-–—.]/g, "");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return false;
  const looksLikePhMobile =
    /^(\+?63|0063|09|9)/.test(cleaned) &&
    !/^(\+?63|0063|0)[2-8]/.test(cleaned);
  if (looksLikePhMobile) {
    return /^639\d{9}$/.test(canonicalPhoneDigits(trimmed));
  }
  return true;
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
