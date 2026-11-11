import { createClient } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";

const CUSTOMER_COLUMNS = "id, customer_code, user_id, name, email, phone, address, barangay, city, province, notes, is_active, created_at, updated_at";
const BOOKING_COLUMNS = "id, customer_id, tracking_number, pickup_address, dropoff_address, cargo_description, status, created_at, estimated_arrival, actual_delivery_at";

async function fetchAll(table, columns, filter = query => query) {
  const rows = [];
  const size = 500;
  for (let offset = 0; ; offset += size) {
    const { data, error } = await filter(supabase.from(table).select(columns))
      .order("created_at", { ascending: false }).order("id").range(offset, offset + size - 1);
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error(`Invalid ${table} response.`);
    if (data.some(row => !row || typeof row.id !== "string" || !row.id.trim())) {
      throw new Error(`Invalid ${table} record returned from the database.`);
    }
    rows.push(...data);
    if (data.length < size) return [...new Map(rows.map(row => [row.id, row])).values()];
  }
}

let customerInFlight = null;
let bookingInFlight = null;
let customerCachedData = null;
let bookingCachedData = null;
let customerCacheExpiry = 0;
let bookingCacheExpiry = 0;
const CACHE_TTL_MS = 2500;

export function clearCustomerCache() {
  customerInFlight = null;
  bookingInFlight = null;
  customerCachedData = null;
  bookingCachedData = null;
  customerCacheExpiry = 0;
  bookingCacheExpiry = 0;
}

export function fetchCustomers({ force = false } = {}) {
  const now = Date.now();
  if (!force && customerCachedData && now < customerCacheExpiry) {
    return Promise.resolve(customerCachedData);
  }
  if (!force && customerInFlight) {
    return customerInFlight;
  }
  customerInFlight = (async () => {
    try {
      const data = await fetchAll("customers", CUSTOMER_COLUMNS);
      customerCachedData = data;
      customerCacheExpiry = Date.now() + CACHE_TTL_MS;
      return data;
    } finally {
      customerInFlight = null;
    }
  })();
  return customerInFlight;
}

export function fetchCustomerBookings({ force = false } = {}) {
  const now = Date.now();
  if (!force && bookingCachedData && now < bookingCacheExpiry) {
    return Promise.resolve(bookingCachedData);
  }
  if (!force && bookingInFlight) {
    return bookingInFlight;
  }
  bookingInFlight = (async () => {
    try {
      const data = await fetchAll("shipments", BOOKING_COLUMNS);
      bookingCachedData = data;
      bookingCacheExpiry = Date.now() + CACHE_TTL_MS;
      return data;
    } finally {
      bookingInFlight = null;
    }
  })();
  return bookingInFlight;
}

// Historical customer records survive role conversions. Billing must use the
// linked account's current role, while retaining staff-managed business rows.
export async function fetchBillingCustomers({ force = false } = {}) {
  const [customers, accounts] = await Promise.all([
    fetchCustomers({ force }),
    fetchAll('users', 'id,role,is_active,created_at', query => query.eq('role', 'customer').eq('is_active', true)),
  ]);
  const eligible = new Set(accounts.filter(account => account.role === 'customer' && account.is_active === true).map(account => account.id));
  return customers.filter(customer => customer.is_active === true &&
    (customer.user_id == null || eligible.has(customer.user_id)));
}

// Only directory details may be changed here; identity, status and bookings stay intact.
export function customerEditValues(customer) {
  return Object.fromEntries(["name", "email", "phone", "address", "barangay", "city", "province"]
    .map(key => [key, typeof customer?.[key] === "string" ? customer[key] : ""]));
}

export const AUTHORIZED_OFFICE_ROLES = ["admin", "staff"];

export async function createCustomerAuthUser({ email, password, fullName, phone, customerData = null }) {
  if (supabase?.functions?.invoke) {
    try {
      const { data: fnData, error: fnError } = await supabase.functions.invoke("create-customer-user", {
        body: {
          email,
          password,
          fullName,
          phone: phone || null,
          customerData,
        },
      });

      if (!fnError && fnData) {
        return {
          userId: fnData.userId,
          customer: fnData.customer || null,
          customerId: fnData.customerId || null,
          customerCode: fnData.customerCode || null,
        };
      }

      if (fnError) {
        let msg = fnError.message || "";
        try {
          msg = (await fnError.context?.json?.())?.error || msg;
        } catch { /* ignore */ }

        const isNotDeployed = fnError.status === 404
          || msg.toLowerCase().includes("not found")
          || msg.toLowerCase().includes("failed to send");

        if (!isNotDeployed) {
          throw new Error(msg || "Failed to create customer mobile account.");
        }
      }
    } catch (invokeErr) {
      const errMsg = invokeErr.message || "";
      const isNotDeployed = errMsg.toLowerCase().includes("not found")
        || errMsg.toLowerCase().includes("failed to send")
        || errMsg.toLowerCase().includes("functions")
        || errMsg.toLowerCase().includes("fetch");

      if (!isNotDeployed) {
        throw invokeErr;
      }
    }
  }

  // Fallback: Direct Auth creation via isolated client so caller session is preserved
  let signUpRes;
  const clientFactory = typeof createClient === "function" ? createClient : null;
  const supabaseUrl = supabase?.supabaseUrl || "https://wrcrxsvppehuaqennrla.supabase.co";
  const supabaseAnonKey = supabase?.supabaseKey || "";

  if (clientFactory && supabaseUrl && supabaseAnonKey) {
    const isolatedClient = clientFactory(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: `tanaw_isolated_${Date.now()}_${Math.random()}`,
        storage: {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
        },
      },
    });
    signUpRes = await isolatedClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          role: "customer",
          phone: phone || "",
        },
      },
    });
  } else if (supabase?.auth?.signUp) {
    signUpRes = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          role: "customer",
          phone: phone || "",
        },
      },
    });
  } else {
    throw new Error("Authentication service is unavailable to provision customer credentials.");
  }

  const { data: signUpData, error: signUpError } = signUpRes;
  if (signUpError) {
    const msg = signUpError.message || "Failed to create customer mobile credentials.";
    if (msg.toLowerCase().includes("already registered") || msg.toLowerCase().includes("already exists")) {
      throw new Error(`An account with email "${email}" already exists. Please choose a different email or sign in with existing credentials.`);
    }
    throw new Error(msg);
  }

  if (signUpData?.user && Array.isArray(signUpData.user.identities) && signUpData.user.identities.length === 0) {
    throw new Error(`An account with email "${email}" already exists. Please choose a different email or sign in with existing credentials.`);
  }

  const userId = signUpData?.user?.id;
  if (!userId) {
    throw new Error("Unable to create customer mobile account. Please retry.");
  }

  return { userId, user: signUpData.user };
}

export async function createCustomer(values, { callerRole } = {}) {
  if (callerRole && !AUTHORIZED_OFFICE_ROLES.includes(callerRole)) {
    throw new Error("Unauthorized: Only office staff and administrators can register customers.");
  }

  const name = typeof values?.name === "string" ? values.name.trim() : "";
  if (name.length < 2) {
    throw new Error("Customer name is required and must be at least 2 characters.");
  }

  const emailRaw = typeof values?.email === "string" ? values.email.trim().toLowerCase() : "";
  if (emailRaw && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
    throw new Error("Enter a valid email address.");
  }

  const phoneRaw = typeof values?.phone === "string" ? values.phone.trim() : "";
  const phoneDigits = phoneRaw.replace(/\D/g, "");
  if (phoneRaw && (phoneDigits.length < 7 || phoneDigits.length > 15)) {
    throw new Error("Enter a valid contact number (7–15 digits).");
  }

  const address = typeof values?.address === "string" ? values.address.trim() || null : null;
  const barangay = typeof values?.barangay === "string" ? values.barangay.trim() || null : null;
  const city = typeof values?.city === "string" ? values.city.trim() || null : null;
  const province = typeof values?.province === "string" ? values.province.trim() || null : null;
  const notes = typeof values?.notes === "string" ? values.notes.trim() || null : null;

  const password = typeof values?.password === "string" ? values.password : "";
  const confirmPassword = typeof values?.confirmPassword === "string" ? values.confirmPassword : "";
  const effectiveEmail = (typeof values?.loginEmail === "string" && values.loginEmail.trim())
    ? values.loginEmail.trim().toLowerCase()
    : emailRaw;

  if (password) {
    if (password.length < 8) {
      throw new Error("Password must be at least 8 characters.");
    }
    if (confirmPassword && password !== confirmPassword) {
      throw new Error("Passwords do not match.");
    }
    if (!effectiveEmail) {
      throw new Error("Email address is required to create a mobile application account.");
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(effectiveEmail)) {
      throw new Error("Enter a valid email address for mobile login.");
    }

    const authRes = await createCustomerAuthUser({
      email: effectiveEmail,
      password,
      fullName: name,
      phone: phoneRaw || null,
      customerData: {
        name,
        email: effectiveEmail,
        phone: phoneRaw || null,
        address,
        barangay,
        city,
        province,
        notes,
      },
    });

    if (authRes?.customer) {
      clearCustomerCache();
      return authRes.customer;
    }

    const userId = authRes?.userId;
    if (!userId) {
      throw new Error("Unable to confirm mobile user creation. Please retry.");
    }

    // Check if customer row already exists (e.g. from trigger or pre-created customer)
    let savedCustomer = null;
    const { data: existingRows } = await supabase
      .from("customers")
      .select(CUSTOMER_COLUMNS)
      .or(`user_id.eq.${userId},email.eq.${effectiveEmail}`)
      .limit(1);

    const existingCustomer = Array.isArray(existingRows) && existingRows.length > 0 ? existingRows[0] : null;

    if (existingCustomer) {
      const { data: updated, error: updateErr } = await supabase
        .from("customers")
        .update({
          user_id: userId,
          name,
          email: effectiveEmail,
          phone: phoneRaw || null,
          address,
          barangay,
          city,
          province,
          notes,
          is_active: true,
        })
        .eq("id", existingCustomer.id)
        .select(CUSTOMER_COLUMNS)
        .single();

      if (!updateErr && updated) {
        savedCustomer = updated;
      }
    }

    if (!savedCustomer) {
      const { data: inserted, error: insertErr } = await supabase
        .from("customers")
        .insert({
          user_id: userId,
          name,
          email: effectiveEmail,
          phone: phoneRaw || null,
          address,
          barangay,
          city,
          province,
          notes,
          is_active: true,
        })
        .select(CUSTOMER_COLUMNS)
        .single();

      if (insertErr) {
        throw new Error(insertErr.message || "Failed to create customer record.");
      }
      savedCustomer = inserted;
    }

    // Attempt to confirm the user in auth.users via RPC so mobile login is instantaneous
    try {
      await supabase.rpc("office_confirm_customer_user", {
        p_user_id: userId,
        p_customer_id: savedCustomer?.id || null,
      });
    } catch {
      // Non-blocking if migration pending
    }

    clearCustomerCache();
    return savedCustomer;
  }

  // Try RPC first (atomic check and audit logging on database)
  const { data: rpcData, error: rpcError } = await supabase.rpc("office_create_customer", {
    p_name: name,
    p_email: emailRaw || null,
    p_phone: phoneRaw || null,
    p_address: address,
    p_barangay: barangay,
    p_city: city,
    p_province: province,
    p_notes: notes,
  });

  if (!rpcError && rpcData) {
    clearCustomerCache();
    return rpcData;
  }

  // If error was a duplicate or validation error raised by the database, rethrow it directly
  if (rpcError) {
    const msg = rpcError.message || "";
    if (
      rpcError.code === "23505" ||
      msg.toLowerCase().includes("already exists") ||
      msg.toLowerCase().includes("must be at least") ||
      msg.toLowerCase().includes("valid email") ||
      msg.toLowerCase().includes("valid contact")
    ) {
      throw new Error(msg);
    }
  }

  // Direct RLS Fallback with client duplicate checks (e.g. for mock test environments)
  if (emailRaw) {
    const { data: existingEmail } = await supabase
      .from("customers")
      .select("id")
      .eq("is_active", true)
      .ilike("email", emailRaw)
      .limit(1);
    if (existingEmail && existingEmail.length > 0) {
      throw new Error(`A customer with email "${emailRaw}" already exists.`);
    }
  }

  if (phoneDigits) {
    const { data: existingPhone } = await supabase
      .from("customers")
      .select("id, phone")
      .eq("is_active", true);
    if (
      Array.isArray(existingPhone) &&
      existingPhone.some(
        (c) => typeof c.phone === "string" && c.phone.replace(/\D/g, "") === phoneDigits
      )
    ) {
      throw new Error(`A customer with phone number "${phoneRaw}" already exists.`);
    }
  }

  const { data: insertData, error: insertError } = await supabase
    .from("customers")
    .insert({
      name,
      email: emailRaw || null,
      phone: phoneRaw || null,
      address,
      barangay,
      city,
      province,
      notes,
      is_active: true,
    })
    .select(CUSTOMER_COLUMNS)
    .single();

  if (insertError) {
    throw new Error(insertError.message || "Failed to create customer.");
  }

  clearCustomerCache();
  return insertData;
}

export async function setCustomerActiveStatus(customer, isActive, reason, { callerRole } = {}) {
  if (!callerRole || !AUTHORIZED_OFFICE_ROLES.includes(callerRole)) {
    throw new Error("Unauthorized: Only office staff and administrators can change customer account status.");
  }
  if (!customer?.id || !customer.updated_at) {
    throw new Error("Refresh the customer directory before changing account status.");
  }
  if (typeof isActive !== "boolean") {
    throw new Error("A valid target status (active or suspended) must be specified.");
  }
  if (customer.is_active === isActive) {
    throw new Error(isActive ? "Customer account is already active." : "Customer account is already suspended.");
  }
  const trimmedReason = typeof reason === "string" ? reason.trim() : "";
  if (!trimmedReason || trimmedReason.length < 3) {
    throw new Error("A valid reason (at least 3 characters) is required to change account status.");
  }

  const { data, error } = await supabase.from("customers").update({ is_active: isActive })
    .eq("id", customer.id).eq("updated_at", customer.updated_at).select(CUSTOMER_COLUMNS).maybeSingle();
  if (error) throw new Error("Unable to update customer status. Check your connection and account permissions, then refresh before retrying.");
  if (!data) throw new Error("This customer changed or is no longer editable. Close this form and refresh before retrying.");

  if (customer.user_id) {
    await supabase.from("users").update({ is_active: isActive }).eq("id", customer.user_id);
  }

  clearCustomerCache();
  return data;
}

export async function updateCustomer(customer, values) {
  if (!customer?.id || !customer.updated_at) throw new Error("Refresh the customer directory before editing.");
  const fields = customerEditValues(values);
  for (const key of Object.keys(fields)) fields[key] = fields[key].trim();
  if (!fields.name) throw new Error("Customer name is required.");
  if (fields.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) throw new Error("Enter a valid email address.");
  if (fields.phone && (!/^[+\d\s().-]+$/.test(fields.phone) || fields.phone.replace(/\D/g, "").length < 7 || fields.phone.replace(/\D/g, "").length > 15)) {
    throw new Error("Enter a valid contact number (7–15 digits).");
  }

  let assignedUserId = customer.user_id || null;
  const newPassword = typeof values?.password === "string" ? values.password : "";
  const confirmPassword = typeof values?.confirmPassword === "string" ? values.confirmPassword : "";
  const loginEmail = (typeof values?.loginEmail === "string" && values.loginEmail.trim())
    ? values.loginEmail.trim().toLowerCase()
    : (fields.email || customer.email || "").toLowerCase();

  if (newPassword) {
    if (newPassword.length < 8) {
      throw new Error("Password must be at least 8 characters.");
    }
    if (confirmPassword && newPassword !== confirmPassword) {
      throw new Error("Passwords do not match.");
    }
    if (!loginEmail) {
      throw new Error("Email address is required to create a mobile application account.");
    }

    const authRes = await createCustomerAuthUser({
      email: loginEmail,
      password: newPassword,
      fullName: fields.name,
      phone: fields.phone || null,
      customerData: {
        id: customer.id,
        name: fields.name,
        email: loginEmail,
        phone: fields.phone || null,
      },
    });

    if (authRes?.userId) {
      assignedUserId = authRes.userId;
      try {
        await supabase.rpc("office_confirm_customer_user", {
          p_user_id: assignedUserId,
          p_customer_id: customer.id,
        });
      } catch {
        // Safe fallback
      }
    }
  }

  const payload = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, value || null]));
  if (assignedUserId && assignedUserId !== customer.user_id) {
    payload.user_id = assignedUserId;
  }

  const { data, error } = await supabase.from("customers").update(payload)
    .eq("id", customer.id).eq("updated_at", customer.updated_at).select(CUSTOMER_COLUMNS).maybeSingle();
  if (error) throw new Error("Unable to save customer details. Check your connection and account permissions, then refresh before retrying.");
  if (!data) throw new Error("This customer changed or is no longer editable. Close this form and refresh before editing again.");
  clearCustomerCache();
  return data;
}

let channelId = 0;
export function subscribeCustomerBookings(onChange) {
  const channel = supabase.channel(`customer-bookings-${++channelId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "shipments" }, onChange)
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}
