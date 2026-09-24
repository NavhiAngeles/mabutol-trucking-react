import { supabase } from "./supabaseClient";

export async function getDashboardStats() {
  const { count: activeShipments, error: activeError } =
    await supabase
      .from("shipments")
      .select("*", { count: "exact", head: true })
      .eq("status", "in_transit");

  const { count: delayedShipments, error: delayedError } =
    await supabase
      .from("shipments")
      .select("*", { count: "exact", head: true })
      .eq("status", "delayed");

  const { count: pendingDispatch, error: pendingError } =
    await supabase
      .from("shipments")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");

  const { count: availableTrucks, error: truckError } =
    await supabase
      .from("trucks")
      .select("*", { count: "exact", head: true })
      .eq("status", "available");

  if (activeError || delayedError || pendingError || truckError) {
    throw new Error("Failed to fetch dashboard statistics");
  }

  return {
    activeShipments: activeShipments ?? 0,
    delayedShipments: delayedShipments ?? 0,
    pendingDispatch: pendingDispatch ?? 0,
    availableTrucks: availableTrucks ?? 0,
  };
}

export function subscribeToDashboardChanges(callback) {
  const channel = supabase
    .channel("dashboard-stats")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "shipments",
      },
      callback
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "trucks",
      },
      callback
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
