// @ts-nocheck
// supabase/functions/create-driver-user/index.ts
// Creates a Supabase Auth user for a newly registered driver.
// Uses the service_role key so the calling admin's session is unaffected.
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

    // Initialize admin client with service_role key to bypass RLS for administrative checks & actions
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    cleanupClient = adminClient;

    // Check caller's role in public.users using adminClient
    const { data: callerProfile, error: profileErr } = await adminClient
      .from("users")
      .select("role, is_active")
      .eq("id", caller.id)
      .single();

    // Authorization comes exclusively from a successfully loaded, active database profile.
    if (
      profileErr ||
      !callerProfile ||
      callerProfile.is_active !== true ||
      !["admin", "staff"].includes(callerProfile.role)
    ) {
      return new Response(
        JSON.stringify({ error: "Only active admin/staff can create driver accounts." }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 403,
        },
      );
    }

    // ---- 2. Parse request body ----
    const { email, password, fullName, phone: reqPhone, registration } = await req.json();
    if (!email || !password) {
      throw new Error("Email and password are required");
    }

    const rawPhone = reqPhone || registration?.payload?.contact_number;
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

    // ---- 3. Create auth user with service role key ----
    const createPayload = {
      email,
      password,
      email_confirm: true, // Skip email verification for admin-provisioned accounts
      app_metadata: { role: "driver" },
      user_metadata: {
        full_name: fullName || "",
        role: "driver",
        ...(phone ? { phone } : {}),
      },
      ...(phone ? { phone, phone_confirm: true } : {}),
    };

    let newUser = null;
    const { data: createdData, error: createErr } =
      await adminClient.auth.admin.createUser(createPayload);

    if (createErr) {
      // If driver auth account already exists, update their phone credentials and password
      const isExisting = createErr.message?.toLowerCase().includes("already") || createErr.status === 422;
      if (isExisting) {
        const { data: existingProfile } = await adminClient
          .from("users")
          .select("id, role")
          .eq("email", email)
          .single();
        if (existingProfile?.id && existingProfile.role === "driver") {
          const updatePayload = { password };
          if (phone) {
            updatePayload.phone = phone;
            updatePayload.phone_confirm = true;
          }
          const { error: updateErr } = await adminClient.auth.admin.updateUserById(
            existingProfile.id,
            updatePayload
          );
          if (updateErr) throw updateErr;

          await adminClient
            .from("users")
            .update({
              ...(phone ? { phone } : {}),
              full_name: fullName || undefined,
            })
            .eq("id", existingProfile.id);

          let driverId = null;
          if (registration) {
            const pData = {
              ...registration.payload,
              user_id: existingProfile.id,
              ...(phone ? { contact_number: phone } : {}),
            };
            const { data, error } = await callerClient.rpc("fleet_save", {
              p_kind: "driver", p_id: null,
              p_data: pData,
              p_categories: null, p_documents: registration.documents || [], p_expected: null,
            });
            if (error || !data) throw error || new Error("Driver registration was not confirmed.");
            driverId = data;
          }

          return new Response(
            JSON.stringify({ userId: existingProfile.id, ...(driverId ? { driverId } : {}) }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 200,
            },
          );
        }
      }
      throw createErr;
    }

    newUser = createdData;
    createdUserId = newUser.user.id;

    // ---- 4. Ensure public.users row has role='driver', full_name, and phone ----
    // Upsert handles both cases: if a DB trigger already created the row or not.
    const { error: upsertErr } = await adminClient
      .from("users")
      .upsert({
        id: newUser.user.id,
        email: email,
        ...(phone ? { phone } : {}),
        role: "driver",
        full_name: fullName || "",
        is_active: true,
      });

    if (upsertErr) throw upsertErr;

    // Register the roster, optional vehicle and documents in one database transaction.
    // Use the caller JWT so fleet_save enforces the active office role and RLS.
    let driverId = null;
    if (registration) {
      const pData = {
        ...registration.payload,
        user_id: newUser.user.id,
        ...(phone ? { contact_number: phone } : {}),
      };
      const { data, error } = await callerClient.rpc("fleet_save", {
        p_kind: "driver", p_id: null,
        p_data: pData,
        p_categories: null, p_documents: registration.documents || [], p_expected: null,
      });
      if (error || !data) throw error || new Error("Driver registration was not confirmed.");
      driverId = data;
    }

    // ---- 5. Return confirmed IDs ----
    return new Response(
      JSON.stringify({ userId: newUser.user.id, ...(driverId ? { driverId } : {}) }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (err) {
    // Registration failure must not leave a working, unlinked login account.
    if (createdUserId && cleanupClient) {
      const { error: cleanupError } = await cleanupClient.auth.admin.deleteUser(createdUserId);
      if (cleanupError) return new Response(JSON.stringify({ error: "Registration failed and account cleanup needs administrator attention. Do not retry yet." }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
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
