import {
  chooseExpresswayRoute,
  expresswayCoverage,
  tollSections,
  valhallaResponseToOrsResult,
} from "../../supabase/functions/calculate-route/tollRoute.js";
import { metroManilaRoads } from "../../supabase/functions/calculate-route/metroManilaRoads.js";
import { northLuzonRoads } from "../../supabase/functions/calculate-route/northLuzonRoads.js";
import { southLuzonRoads } from "../../supabase/functions/calculate-route/southLuzonRoads.js";

const luzonRoads = [
  ...metroManilaRoads,
  ...northLuzonRoads,
  ...southLuzonRoads,
];

function validPoint(point) {
  return (
    point &&
    typeof point.lat === "number" &&
    typeof point.lng === "number" &&
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    point.lat >= -90 &&
    point.lat <= 90 &&
    point.lng >= -180 &&
    point.lng <= 180
  );
}

export function decodePolyline(encoded, precision = 5) {
  const coordinates = [];
  const factor = Math.pow(10, precision);
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  while (index < encoded.length) {
    const values = [];
    for (let dimension = 0; dimension < 2; dimension += 1) {
      let result = 0;
      let shift = 0;
      let byte;
      do {
        if (index >= encoded.length) {
          throw new Error("Invalid encoded route geometry.");
        }
        byte = encoded.charCodeAt(index++) - 63;
        result += (byte & 0x1f) * Math.pow(2, shift);
        shift += 5;
      } while (byte >= 0x20);
      values.push(result & 1 ? ~(result >> 1) : result >> 1);
    }
    latitude += values[0];
    longitude += values[1];
    coordinates.push([longitude / factor, latitude / factor]);
  }
  return coordinates;
}

export async function calculateFallbackTruckRoute({
  pickup,
  destination,
  usesTollRoad,
  signal,
  fetcher = fetch,
}) {
  if (!validPoint(pickup) || !validPoint(destination)) {
    throw new Error("Invalid pickup or destination coordinates.");
  }

  const tollPreference =
    typeof usesTollRoad === "boolean" ? usesTollRoad : undefined;

  const valhallaBody = {
    locations: [
      { lon: pickup.lng, lat: pickup.lat },
      { lon: destination.lng, lat: destination.lat },
    ],
    costing: "truck",
    costing_options: {
      truck: {
        use_ferry: 0,
        use_tolls: tollPreference === false ? 0 : 1,
        use_highways: tollPreference === false ? 0.5 : 1,
      },
    },
    ...(tollPreference === true ? { alternates: 2 } : {}),
    units: "kilometers",
  };

  const response = await fetcher("https://valhalla1.openstreetmap.de/route", {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(valhallaBody),
  });

  const rawText = await response.text();
  let valhallaJson;
  try {
    valhallaJson = JSON.parse(rawText);
  } catch {
    throw new Error(
      "Truck routing service (OpenRouteService) is temporarily unreachable. Wait a moment and retry, or adjust your pins."
    );
  }

  if (!response.ok) {
    const errText = String(valhallaJson?.error || "");
    if (
      response.status === 400 &&
      /no route|ferry|island|unreachable/i.test(errText)
    ) {
      throw new Error(
        "No road-only truck route was returned. Select the port's truck entrance or access road."
      );
    }
    throw new Error(
      errText ||
        "Truck routing service (OpenRouteService) is temporarily unreachable. Wait a moment and retry, or adjust your pins."
    );
  }

  const result = valhallaResponseToOrsResult(
    valhallaJson,
    decodePolyline,
    luzonRoads
  );

  const verifiedCategories = (candidate) => {
    const values = candidate?.extras?.waycategory?.values;
    return (
      Array.isArray(values) &&
      values.length > 0 &&
      values.every(
        (segment) =>
          Array.isArray(segment) &&
          Number.isInteger(segment[2]) &&
          (segment[2] & 8) === 0
      )
    );
  };
  const hasToll = (candidate) =>
    candidate.extras.waycategory.values.some(
      (segment) => (segment[2] & 2) !== 0
    );

  const expresswaySelection =
    tollPreference === true
      ? chooseExpresswayRoute(result.routes, decodePolyline)
      : null;

  let ordinaryRoute = null;
  if (tollPreference === false) {
    ordinaryRoute = (result.routes || [])
      .filter(
        (candidate) =>
          verifiedCategories(candidate) &&
          !hasToll(candidate) &&
          Number.isFinite(candidate.summary?.duration) &&
          candidate.summary.duration > 0 &&
          Number.isFinite(candidate.summary?.distance) &&
          candidate.summary.distance > 0
      )
      .sort((a, b) => a.summary.duration - b.summary.duration)[0];

    if (!ordinaryRoute) {
      ordinaryRoute = (result.routes || [])
        .filter(
          (candidate) =>
            verifiedCategories(candidate) &&
            !expresswayCoverage(candidate, decodePolyline)?.verified &&
            Number.isFinite(candidate.summary?.duration) &&
            candidate.summary.duration > 0 &&
            Number.isFinite(candidate.summary?.distance) &&
            candidate.summary.distance > 0
        )
        .sort((a, b) => a.summary.duration - b.summary.duration)[0];
    }
  }

  const route =
    tollPreference === true
      ? expresswaySelection?.route
      : tollPreference === false
        ? ordinaryRoute
        : result.routes?.[0];

  if (!route && tollPreference !== undefined) {
    throw new Error(
      tollPreference
        ? "The provider returned no route with substantial toll expressway travel. Short ramps or toll links are not accepted. Adjust the entrances or uncheck Toll Road for ordinary roads."
        : "The provider could not verify a route avoiding toll roads. Adjust the entrances or enable Toll Road."
    );
  }

  const summary = route?.summary;
  if (
    !route ||
    !summary ||
    !Number.isFinite(summary.distance) ||
    !Number.isFinite(summary.duration) ||
    typeof route.geometry !== "string"
  ) {
    throw new Error("No valid truck route was returned.");
  }

  const wayCategories = route.extras?.waycategory?.values;
  if (!Array.isArray(wayCategories) || wayCategories.length === 0) {
    throw new Error("Unable to verify a road-only route. Please try again.");
  }
  if (wayCategories.some((segment) => (segment[2] & 8) !== 0)) {
    throw new Error(
      "No road-only truck route was returned. Select the port's truck entrance or access road."
    );
  }

  const coordinates = decodePolyline(route.geometry, 5);
  if (coordinates.length < 2) {
    throw new Error("Route geometry has insufficient points.");
  }

  const geojson = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          summary,
          ...(expresswaySelection
            ? {
                expressway: {
                  verified: true,
                  distanceKm: Number(
                    (expresswaySelection.coverage.highwayMeters / 1000).toFixed(
                      1
                    )
                  ),
                  tollDistanceKm: Number(
                    (expresswaySelection.coverage.tollMeters / 1000).toFixed(1)
                  ),
                  roadNames: expresswaySelection.coverage.roadNames,
                  sections: tollSections(route, decodePolyline, luzonRoads),
                },
              }
            : {}),
        },
        geometry: {
          type: "LineString",
          coordinates,
        },
      },
    ],
  };

  return {
    roadOnlyVerified: true,
    ...(tollPreference !== undefined
      ? {
          tollPreference: tollPreference ? "expressway" : "avoid",
          usesTollRoad: Boolean(tollPreference),
        }
      : {}),
    geojson,
    distanceKm: Number((summary.distance / 1000).toFixed(1)),
    estimatedMinutes: Math.ceil(summary.duration / 60),
  };
}
