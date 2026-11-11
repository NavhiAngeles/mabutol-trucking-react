// @ts-nocheck
// supabase/functions/create-customer-user/index.ts
// Creates a Supabase Auth user for a newly registered customer.
// Uses the service_role key so the calling admin/staff's session is unaffected.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizeOfficePhone } from "../_shared/officePhone.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let createdUserId = null;
  let cleanupClient = null;
  try {
    // ---- 1. Verify the caller is an authenticated admin/staff ----
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";

    // Verify caller's JWT using the anon key
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user: caller },
      error: callerErr,
    } = await callerClient.auth.getUser();
    if (callerErr || !caller) throw new Error("Unauthorized");

    // Initialize admin client with service_role key
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    cleanupClient = adminClient;

    // Check caller's role in public.users using adminClient
    const { data: callerProfile, error: profileErr } = await adminClient
      .from("users")
      .select("role, is_active")
      .eq("id", caller.id)
      .single();

    if (
      profileErr ||
      !callerProfile ||
      callerProfile.is_active !== true ||
      !["admin", "staff"].includes(callerProfile.role)
    ) {
      return new Response(
        JSON.stringify({ error: "Only active admin/staff can create customer accounts." }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 403,
        },
      );
    }

    // ---- 2. Parse request body ----
    const { email, password, fullName, phone: reqPhone, customerData } = await req.json();
    if (!email || !password) {
      throw new Error("Email and password are required to create a mobile customer account");
    }

    const rawPhone = reqPhone || customerData?.phone;
    let phone = null;
    if (rawPhone) {
      try {
        phone = normalizeOfficePhone(rawPhone);
      } catch {
        const cleaned = String(rawPhone).trim().replace(/[ ()-]/g, "");
        if (/^09\d{9}$/.test(cleaned)) phone = `+63${cleaned.slice(1)}`;
        else if (/^9\d{9}$/.test(cleaned)) phone = `+63${cleaned}`;
        else if (/^639\d{9}$/.test(cleaned)) phone = `+${cleaned}`;
        else if (/^\+639\d{9}$/.test(cleaned)) phone = cleaned;
      }
    }

    // ---- 3. Create or update auth user with service role key ----
    const createPayload = {
      email,
      password,
      email_confirm: true, // Pre-confirm for office-provisioned accounts
      app_metadata: { role: "customer" },
      user_metadata: {
        full_name: fullName || customerData?.name || "",
        role: "customer",
        ...(phone ? { phone } : {}),
      },
      ...(phone ? { phone, phone_confirm: true } : {}),
    };

    let targetUserId = null;
    const { data: createdData, error: createErr } =
      await adminClient.auth.admin.createUser(createPayload);

    if (createErr) {
      // If customer auth account already exists, update their password and phone
      const isExisting =
        createErr.message?.toLowerCase().includes("already") ||
        createErr.status === 422;

      if (isExisting) {
        const { data: existingProfile } = await adminClient
          .from("users")
          .select("id, role")
          .eq("email", email)
          .single();

        if (existingProfile?.id) {
          targetUserId = existingProfile.id;
          const updatePayload = { password };
          if (phone) {
            updatePayload.phone = phone;
            updatePayload.phone_confirm = true;
          }
          await adminClient.auth.admin.updateUserById(targetUserId, updatePayload);

          await adminClient
            .from("users")
            .update({
              role: "customer",
              full_name: fullName || customerData?.name || undefined,
              ...(phone ? { phone } : {}),
            })
            .eq("id", targetUserId);
        } else {
          throw createErr;
        }
      } else {
        throw createErr;
      }
    } else {
      targetUserId = createdData.user.id;
      createdUserId = targetUserId;
    }

    // ---- 4. Ensure public.users row has role='customer' ----
    await adminClient.from("users").upsert({
      id: targetUserId,
      email,
      ...(phone ? { phone } : {}),
      role: "customer",
      full_name: fullName || customerData?.name || "",
      is_active: true,
    });

    // ---- 5. Insert or link customer record in public.customers ----
    let customerRecord = null;
    if (customerData) {
      const custName = customerData.name || fullName;
      const custPhone = customerData.phone || phone;
      const custAddress = customerData.address || null;
      const custBarangay = customerData.barangay || null;
      const custCity = customerData.city || null;
      const custProvince = customerData.province || null;
      const custNotes = customerData.notes || null;

      // Check if customer already exists by user_id or email
      const { data: existingCust } = await adminClient
        .from("customers")
        .select("id, customer_code, user_id")
        .or(`user_id.eq.${targetUserId},email.eq.${email}`)
        .limit(1)
        .single();

      if (existingCust?.id) {
        const { data: updatedCust, error: updateCustErr } = await adminClient
          .from("customers")
          .update({
            user_id: targetUserId,
            name: custName,
            email,
            phone: custPhone,
            address: custAddress,
            barangay: custBarangay,
            city: custCity,
            province: custProvince,
            notes: custNotes,
            is_active: true,
          })
          .eq("id", existingCust.id)
          .select()
          .single();
        if (updateCustErr) throw updateCustErr;
        customerRecord = updatedCust;
      } else {
        const { data: newCust, error: insertCustErr } = await adminClient
          .from("customers")
          .insert({
            user_id: targetUserId,
            name: custName,
            email,
            phone: custPhone,
            address: custAddress,
            barangay: custBarangay,
            city: custCity,
            province: custProvince,
            notes: custNotes,
            is_active: true,
          })
          .select()
          .single();
        if (insertCustErr) throw insertCustErr;
        customerRecord = newCust;
      }
    }

    return new Response(
      JSON.stringify({
        userId: targetUserId,
        customerId: customerRecord?.id || null,
        customerCode: customerRecord?.customer_code || null,
        customer: customerRecord,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (err) {
    if (createdUserId && cleanupClient) {
      try {
        await cleanupClient.from("users").delete().eq("id", createdUserId);
      } catch {
        /* proceed to auth deletion */
      }
      try {
        await cleanupClient.auth.admin.deleteUser(createdUserId);
      } catch {
        /* ignore */
      }
    }
    return new Response(
      JSON.stringify({ error: (err && err.message) || String(err) }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      },
    );
  }
});

