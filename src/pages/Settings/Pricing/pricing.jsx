import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Banknote,
  CheckCircle2,
  Loader2,
  Lock,
  Package,
  RotateCcw,
  Truck,
} from "lucide-react";
import SettingsLayout from "../../../components/SettingsLayout";
import {
  fetchPricingData,
  savePricing,
} from "../../../services/pricingService";
import { getCurrentPricingUser } from "../../../services/tollGateService";
import TollGateManager from "./TollGateManager";
import CurrencyRateInput from "./CurrencyRateInput";
import { HANDLING_OPTIONS } from "../../../services/handlingPricing";
import { SkeletonBlock, SkeletonTableRows } from "../../../components/Skeleton/Skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const SURCHARGES = HANDLING_OPTIONS;

const DEFAULT_FEES = {
  minBooking: "",
  driver: "",
};

const DEFAULT_SURCHARGES = Object.fromEntries(
  SURCHARGES.map((item) => [item.id, ""])
);

const isValidAmount = (value) =>
  String(value ?? "").trim() !== "" &&
  Number.isFinite(Number(value)) &&
  Number(value) >= 0;

function getHandlingBadgeProps(id) {
  if (id === "cold") {
    return {
      variant: "outline",
      className:
        "border-sky-200/80 bg-sky-50 text-sky-700 font-medium rounded-md",
    };
  }
  if (id === "fragile" || id === "temp") {
    return {
      variant: "outline",
      className:
        "border-amber-200/80 bg-amber-50 text-amber-800 font-medium rounded-md",
    };
  }
  return {
    variant: "secondary",
    className: "font-medium rounded-md",
  };
}

export default function Pricing() {
  const [vehicles, setVehicles] = useState([]);
  const [rates, setRates] = useState({});
  const [fees, setFees] = useState(DEFAULT_FEES);
  const [surcharges, setSurcharges] = useState(DEFAULT_SURCHARGES);
  const [initialSnapshot, setInitialSnapshot] = useState({
    fees: DEFAULT_FEES,
    surcharges: DEFAULT_SURCHARGES,
    rates: {},
  });

  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadPricing = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const currentUser = await getCurrentPricingUser();
      setIsAdmin(currentUser.isAdmin);

      const data = await fetchPricingData();

      setVehicles(data.vehicles);

      const loadedRates = Object.fromEntries(
        data.vehicles.map((vehicle) => [
          vehicle.id,
          vehicle.pricing ? String(vehicle.pricing.per_km_rate) : "",
        ])
      );

      const settings = data.settings || {};

      const loadedFees = {
        minBooking:
          settings.minimum_booking_fee == null
            ? ""
            : String(settings.minimum_booking_fee),
        driver:
          settings.driver_allowance == null
            ? ""
            : String(settings.driver_allowance),
      };

      const savedSurcharges = settings.handling_surcharges || {};

      const loadedSurcharges = Object.fromEntries(
        SURCHARGES.map((item) => [
          item.id,
          savedSurcharges[item.id] == null
            ? ""
            : String(savedSurcharges[item.id]),
        ])
      );

      setRates(loadedRates);
      setFees(loadedFees);
      setSurcharges(loadedSurcharges);
      setInitialSnapshot({
        fees: loadedFees,
        surcharges: loadedSurcharges,
        rates: loadedRates,
      });
    } catch (err) {
      console.error("Pricing load error:", err);
      setIsAdmin(false);
      setError(err.message || "Unable to load pricing.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) {
        loadPricing();
      }
    });
    return () => {
      active = false;
    };
  }, [loadPricing]);

  const sortedVehicles = useMemo(() => {
    return vehicles.toSorted((a, b) => {
      const capA =
        a.default_capacity_kg != null
          ? Number(a.default_capacity_kg)
          : Number.POSITIVE_INFINITY;
      const capB =
        b.default_capacity_kg != null
          ? Number(b.default_capacity_kg)
          : Number.POSITIVE_INFINITY;
      if (capA !== capB) return capA - capB;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
  }, [vehicles]);

  const dirtyCount = useMemo(() => {
    let count = 0;

    for (const key of Object.keys(DEFAULT_FEES)) {
      if (
        String(fees[key] ?? "").trim() !==
        String(initialSnapshot.fees[key] ?? "").trim()
      ) {
        count += 1;
      }
    }

    for (const item of SURCHARGES) {
      if (
        String(surcharges[item.id] ?? "").trim() !==
        String(initialSnapshot.surcharges[item.id] ?? "").trim()
      ) {
        count += 1;
      }
    }

    for (const vehicle of vehicles) {
      if (!vehicle.pricing) continue;
      if (
        String(rates[vehicle.id] ?? "").trim() !==
        String(initialSnapshot.rates[vehicle.id] ?? "").trim()
      ) {
        count += 1;
      }
    }

    return count;
  }, [fees, surcharges, rates, vehicles, initialSnapshot]);

  const isDirty = dirtyCount > 0;

  const setFee = (key) => (event) => {
    if (!isAdmin) return;

    setFees((previous) => ({
      ...previous,
      [key]: event.target.value,
    }));

    setSuccess("");
  };

  const setRate = (id) => (event) => {
    if (!isAdmin) return;

    setRates((previous) => ({
      ...previous,
      [id]: event.target.value,
    }));

    setSuccess("");
  };

  const setSurcharge = (id) => (event) => {
    if (!isAdmin) return;

    setSurcharges((previous) => ({
      ...previous,
      [id]: event.target.value,
    }));

    setSuccess("");
  };

  const handleDiscard = () => {
    if (saving) return;
    setFees({ ...initialSnapshot.fees });
    setSurcharges({ ...initialSnapshot.surcharges });
    setRates({ ...initialSnapshot.rates });
    setError("");
    setSuccess("");
  };

  const handleSave = async () => {
    if (!isAdmin || saving) return;

    setError("");
    setSuccess("");

    const amounts = [
      ...Object.values(fees),
      ...Object.values(surcharges),
      ...vehicles
        .filter((vehicle) => vehicle.pricing)
        .map((vehicle) => rates[vehicle.id]),
    ];

    if (!amounts.every(isValidAmount)) {
      setError(
        "Please enter valid, non-negative amounts in all pricing fields."
      );
      return;
    }

    setSaving(true);

    try {
      await savePricing(vehicles, rates, fees, surcharges);

      await loadPricing();

      setSuccess("Pricing changes saved.");
    } catch (err) {
      console.error("Pricing save error:", err);

      setError(
        `${err.message || "Unable to save pricing."} ` +
        "Reload pricing before retrying if the save result is uncertain."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsLayout>
      <section className="content mx-auto w-full max-w-[1440px]">
        {/* PAGE HEADER */}
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Settings: Pricing &amp; Rates
              </h1>
              {!loading && !isAdmin && (
                <Badge
                  variant="secondary"
                  className="gap-1 rounded-md font-medium text-muted-foreground"
                >
                  <Lock className="size-3" aria-hidden="true" />
                  <span>Read-only</span>
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {!loading && !isAdmin
                ? "View-only access. Contact an administrator to modify vehicle rates, fees, or toll tariffs."
                : "Configure vehicle base rates, fixed trip fees, handling surcharges, and expressway toll tariffs."}
            </p>
          </div>
        </header>

        {/* INLINE FEEDBACK */}
        {error && (
          <div
            role="alert"
            className="mb-6 flex items-center gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div
            role="status"
            className="mb-6 flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
          >
            <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
            <span>{success}</span>
          </div>
        )}

        {loading ? (
          <>
            <p role="status" className="sr-only">
              Loading pricing configuration...
            </p>
            <div
              className="grid grid-cols-1 gap-6 xl:grid-cols-12"
              aria-hidden="true"
            >
              <div className="space-y-6 xl:col-span-5">
                <Card className="gap-0 rounded-xl border border-border/80 py-0 shadow-xs ring-0">
                  <CardHeader className="border-b border-border/60 px-6 py-5">
                    <CardTitle className="text-base font-semibold">
                      Fixed Trip Fees
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 px-6 py-5">
                    <div className="flex items-center justify-between gap-4">
                      <SkeletonBlock width="45%" height={14} />
                      <SkeletonBlock width={144} height={36} radius="sm" />
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <SkeletonBlock width="50%" height={14} />
                      <SkeletonBlock width={144} height={36} radius="sm" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="gap-0 rounded-xl border border-border/80 py-0 shadow-xs ring-0">
                  <CardHeader className="border-b border-border/60 px-6 py-5">
                    <CardTitle className="text-base font-semibold">
                      Special Handling Surcharges
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-0 py-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="px-6">Handling Type</TableHead>
                          <TableHead className="px-3 text-right">
                            Surcharge (₱)
                          </TableHead>
                          <TableHead className="px-6 text-right">
                            Applied As
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <SkeletonTableRows
                          rows={5}
                          columns={["badge", "short", "short"]}
                        />
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-6 xl:col-span-7">
                <Card className="gap-0 rounded-xl border border-border/80 py-0 shadow-xs ring-0">
                  <CardHeader className="border-b border-border/60 px-6 py-5">
                    <CardTitle className="text-base font-semibold">
                      Base Rate per Vehicle Type
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-0 py-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="px-6">Vehicle Type</TableHead>
                          <TableHead className="px-3">Max Capacity</TableHead>
                          <TableHead className="px-6 text-right">
                            Rate / km (₱)
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <SkeletonTableRows
                          rows={4}
                          columns={["text", "short", "short"]}
                        />
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                <Card className="gap-0 rounded-xl border border-border/80 py-0 shadow-xs ring-0">
                  <CardHeader className="border-b border-border/60 px-6 py-5">
                    <CardTitle className="text-base font-semibold">
                      Toll Gate Rates
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-0 py-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="px-6">Toll Gate</TableHead>
                          <TableHead className="px-3">Highway</TableHead>
                          <TableHead className="px-3">Vehicle Class</TableHead>
                          <TableHead className="px-6 text-right">
                            Fee (₱)
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <SkeletonTableRows
                          rows={4}
                          columns={["stack", "badge", "short", "short"]}
                        />
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-12">
              {/* LEFT COLUMN (xl:col-span-5) */}
              <div className="space-y-6 xl:col-span-5">
                {/* FIXED TRIP FEES */}
                <Card className="gap-0 rounded-xl border border-border/80 py-0 shadow-xs ring-0">
                  <CardHeader className="border-b border-border/60 px-6 py-5">
                    <CardTitle className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground">
                      <Banknote
                        className="size-4 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <span>Fixed Trip Fees</span>
                    </CardTitle>
                    <CardDescription className="text-sm text-muted-foreground">
                      Default booking minimums and driver trip allowances.
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="divide-y divide-border/60 px-6 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-4 py-4">
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <label
                          htmlFor="minBooking"
                          className="block text-sm font-medium text-foreground"
                        >
                          Minimum Booking Fee
                        </label>
                        <p className="text-xs text-muted-foreground">
                          Applied when the calculated base rate falls below this
                          amount.
                        </p>
                      </div>

                      <CurrencyRateInput
                        id="minBooking"
                        value={fees.minBooking}
                        onChange={setFee("minBooking")}
                        readOnly={!isAdmin}
                        isDirty={
                          String(fees.minBooking ?? "").trim() !==
                          String(initialSnapshot.fees.minBooking ?? "").trim()
                        }
                        aria-label="Minimum Booking Fee"
                      />
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-4 py-4">
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <label
                          htmlFor="driver"
                          className="block text-sm font-medium text-foreground"
                        >
                          Driver Allowance
                        </label>
                        <p className="text-xs text-muted-foreground">
                          Standard driver allowance added per dispatched trip.
                        </p>
                      </div>

                      <CurrencyRateInput
                        id="driver"
                        value={fees.driver}
                        onChange={setFee("driver")}
                        suffix="/ trip"
                        readOnly={!isAdmin}
                        isDirty={
                          String(fees.driver ?? "").trim() !==
                          String(initialSnapshot.fees.driver ?? "").trim()
                        }
                        aria-label="Driver Allowance per Trip"
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* SPECIAL HANDLING SURCHARGES */}
                <Card className="gap-0 rounded-xl border border-border/80 py-0 shadow-xs ring-0">
                  <CardHeader className="border-b border-border/60 px-6 py-5">
                    <CardTitle className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground">
                      <Package
                        className="size-4 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <span>Special Handling Surcharges</span>
                    </CardTitle>
                    <CardDescription className="text-sm text-muted-foreground">
                      Additional flat or per-kilometer charges for specialized
                      cargo.
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="px-0 py-0">
                    <Table>
                      <TableHeader className="bg-muted/40">
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="px-6 py-2.5 text-xs font-medium text-muted-foreground">
                            Handling Type
                          </TableHead>
                          <TableHead className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground">
                            Surcharge (₱)
                          </TableHead>
                          <TableHead className="px-6 py-2.5 text-right text-xs font-medium text-muted-foreground">
                            Applied As
                          </TableHead>
                        </TableRow>
                      </TableHeader>

                      <TableBody>
                        {SURCHARGES.map((item) => {
                          const badgeProps = getHandlingBadgeProps(item.id);
                          const itemDirty =
                            String(surcharges[item.id] ?? "").trim() !==
                            String(
                              initialSnapshot.surcharges[item.id] ?? ""
                            ).trim();

                          return (
                            <TableRow
                              key={item.id}
                              className="transition-colors hover:bg-muted/40"
                            >
                              <TableCell className="px-6 py-3 whitespace-normal">
                                <Badge
                                  variant={badgeProps.variant}
                                  className={badgeProps.className}
                                >
                                  {item.label}
                                </Badge>
                              </TableCell>

                              <TableCell className="px-3 py-3 text-right">
                                <label
                                  htmlFor={`surcharge-${item.id}`}
                                  className="sr-only"
                                >
                                  {item.label} surcharge
                                </label>
                                <CurrencyRateInput
                                  id={`surcharge-${item.id}`}
                                  value={surcharges[item.id] ?? ""}
                                  onChange={setSurcharge(item.id)}
                                  readOnly={!isAdmin}
                                  isDirty={itemDirty}
                                  aria-label={`${item.label} surcharge`}
                                />
                              </TableCell>

                              <TableCell className="px-6 py-3 text-right text-xs font-medium text-muted-foreground tabular-nums">
                                {item.perKm ? "+₱ / km" : "Flat / trip"}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>

              {/* RIGHT COLUMN (xl:col-span-7) */}
              <div className="space-y-6 xl:col-span-7">
                {/* BASE RATE PER VEHICLE TYPE */}
                <Card className="gap-0 rounded-xl border border-border/80 py-0 shadow-xs ring-0">
                  <CardHeader className="border-b border-border/60 px-6 py-5">
                    <CardTitle className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground">
                      <Truck
                        className="size-4 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <span>Base Rate per Vehicle Type</span>
                    </CardTitle>
                    <CardDescription className="text-sm text-muted-foreground">
                      Per-kilometer base rates ordered by maximum payload
                      capacity.
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="px-0 py-0">
                    <Table>
                      <TableHeader className="bg-muted/40">
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="px-6 py-2.5 text-xs font-medium text-muted-foreground">
                            Vehicle Type
                          </TableHead>
                          <TableHead className="px-3 py-2.5 text-xs font-medium text-muted-foreground">
                            Capacity
                          </TableHead>
                          <TableHead className="px-6 py-2.5 text-right text-xs font-medium text-muted-foreground">
                            Rate / km (₱)
                          </TableHead>
                        </TableRow>
                      </TableHeader>

                      <TableBody>
                        {sortedVehicles.map((vehicle) => {
                          const vehicleDirty =
                            vehicle.pricing &&
                            String(rates[vehicle.id] ?? "").trim() !==
                            String(
                              initialSnapshot.rates[vehicle.id] ?? ""
                            ).trim();

                          return (
                            <TableRow
                              key={vehicle.id}
                              className="transition-colors hover:bg-muted/40"
                            >
                              <TableCell className="px-6 py-3">
                                <div className="flex items-center gap-2.5">
                                  <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-muted/40 text-muted-foreground">
                                    <Truck
                                      className="size-4"
                                      aria-hidden="true"
                                    />
                                  </span>
                                  <span className="font-medium text-foreground">
                                    {vehicle.name}
                                  </span>
                                </div>
                              </TableCell>

                              <TableCell className="px-3 py-3">
                                {vehicle.default_capacity_kg != null ? (
                                  <Badge
                                    variant="secondary"
                                    className="rounded-md font-normal text-muted-foreground tabular-nums"
                                  >
                                    Up to{" "}
                                    {Number(
                                      vehicle.default_capacity_kg
                                    ).toLocaleString("en-PH")}{" "}
                                    kg
                                  </Badge>
                                ) : (
                                  <span className="text-xs text-muted-foreground">
                                    Not specified
                                  </span>
                                )}
                              </TableCell>

                              <TableCell className="px-6 py-3 text-right">
                                {vehicle.pricing ? (
                                  <>
                                    <label
                                      htmlFor={`vehicle-rate-${vehicle.id}`}
                                      className="sr-only"
                                    >
                                      {vehicle.name} rate per km
                                    </label>
                                    <CurrencyRateInput
                                      id={`vehicle-rate-${vehicle.id}`}
                                      value={rates[vehicle.id] ?? ""}
                                      onChange={setRate(vehicle.id)}
                                      suffix="/ km"
                                      readOnly={!isAdmin}
                                      isDirty={Boolean(vehicleDirty)}
                                      aria-label={`${vehicle.name} rate per km`}
                                    />
                                  </>
                                ) : (
                                  <Badge
                                    variant="outline"
                                    className="rounded-md border-amber-200 bg-amber-50 font-medium text-amber-800"
                                  >
                                    No active rate
                                  </Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}

                        {sortedVehicles.length === 0 && (
                          <TableRow className="hover:bg-transparent">
                            <TableCell
                              colSpan={3}
                              className="px-6 py-10 text-center text-sm text-muted-foreground"
                            >
                              No vehicle types found.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                {/* TOLL GATE RATES */}
                <TollGateManager />
              </div>
            </div>

            {/* STICKY DIRTY-STATE SAVE BAR */}
            {isAdmin && (isDirty || saving) && (
              <div
                role="region"
                aria-label="Unsaved pricing changes"
                className="sticky bottom-4 z-30 mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card/95 px-5 py-3.5 shadow-lg backdrop-blur-xs"
              >
                <div className="flex items-center gap-2.5 text-sm">
                  <span
                    className="size-2 rounded-full bg-amber-500"
                    aria-hidden="true"
                  />
                  <span className="font-medium text-foreground tabular-nums">
                    {dirtyCount} unsaved {dirtyCount === 1 ? "change" : "changes"}
                  </span>
                  <span className="hidden text-muted-foreground sm:inline">
                    — Review your rate updates before saving.
                  </span>
                </div>

                <div className="flex items-center gap-2.5">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleDiscard}
                    disabled={saving}
                    className="gap-1.5"
                  >
                    <RotateCcw className="size-3.5" aria-hidden="true" />
                    <span>Discard</span>
                  </Button>

                  <Button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="gap-1.5"
                  >
                    {saving && (
                      <Loader2
                        className="size-3.5 animate-spin"
                        aria-hidden="true"
                      />
                    )}
                    <span>{saving ? "Saving..." : "Save Changes"}</span>
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </SettingsLayout>
  );
}
