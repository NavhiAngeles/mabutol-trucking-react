// @ts-nocheck
// supabase/functions/create-driver-user/index.ts
// Creates a Supabase Auth user for a newly registered driver.
// Uses the service_role key so the calling admin's session is unaffected.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

  try {
    // ---- 1. Verify the caller is an authenticated admin/staff ----
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

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

    // Check caller's role in public.users using adminClient
    const { data: callerProfile, error: profileErr } = await adminClient
      .from("users")
      .select("role")
      .eq("id", caller.id)
      .single();

    const userRole =
      callerProfile?.role ||
      caller.app_metadata?.role ||
      caller.user_metadata?.role;

    if (!userRole) {
      const detail = profileErr
        ? `: ${profileErr.message} (code: ${profileErr.code})`
        : `: Profile not found for caller ID ${caller.id}`;
      throw new Error(`Could not verify caller role in users table${detail}`);
    }

    if (!["admin", "staff"].includes(userRole)) {
      throw new Error(`Only admin/staff can create driver accounts (current role: ${userRole})`);
    }

    // ---- 2. Parse request body ----
    const { email, password, fullName } = await req.json();
    if (!email || !password) {
      throw new Error("Email and password are required");
    }

    // ---- 3. Create auth user with service role key ----
    const { data: newUser, error: createErr } =
      await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // Skip email verification for admin-provisioned accounts
        user_metadata: {
          full_name: fullName || "",
          role: "driver",
        },
      });

    if (createErr) throw createErr;

    // ---- 4. Ensure public.users row has role='driver' and full_name ----
    // Upsert handles both cases: if a DB trigger already created the row or not.
    const { error: upsertErr } = await adminClient
      .from("users")
      .upsert({
        id: newUser.user.id,
        email: email,
        role: "driver",
        full_name: fullName || "",
        is_active: true,
      });

    if (upsertErr) throw upsertErr;

    // ---- 5. Return the new user's UUID ----
    return new Response(
      JSON.stringify({ userId: newUser.user.id }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      },
    );
  }
});
