const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

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

// Decode OpenRouteService's encoded polyline.
// Coordinates are returned in [longitude, latitude] order.
function decodePolyline(encoded, precision = 5) {
  const coordinates = [];
  const factor = Math.pow(10, precision);

  let index = 0;
  let latitude = 0;
  let longitude = 0;

  while (index < encoded.length) {
    const values = [];

    for (let dimension = 0; dimension < 2; dimension++) {
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

      values.push(
        result & 1 ? ~(result >> 1) : result >> 1
      );
    }

    latitude += values[0];
    longitude += values[1];

    coordinates.push([
      longitude / factor,
      latitude / factor,
    ]);
  }

  return coordinates;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (request.method !== "POST") {
    return jsonResponse(
      { error: "Method not allowed." },
      405
    );
  }

  try {
    let apiKey = Deno.env.get("ORS_API_KEY")?.trim();

    // The provider's example URL includes the key as a query parameter.
    // Accept that copied format without sending the entire URL as a credential.
    if (apiKey?.startsWith("https://")) {
      const example = new URL(apiKey);
      if (["api.heigit.org", "api.openrouteservice.org"].includes(example.hostname)) {
        apiKey = example.searchParams.get("api_key")?.trim();
      } else {
        return jsonResponse({ error: "Configure ORS_API_KEY with your OpenRouteService API key, not a URL." }, 500);
      }
    }

    if (!apiKey) {
      return jsonResponse(
        { error: "ORS_API_KEY is not configured." },
        500
      );
    }

    const { pickup, destination } = await request.json();

    if (!validPoint(pickup) || !validPoint(destination)) {
      return jsonResponse(
        { error: "Invalid pickup or destination coordinates." },
        400
      );
    }

    // Use the standard JSON endpoint instead of /geojson.
    const response = await fetch(
      "https://api.heigit.org/openrouteservice/v2/directions/driving-hgv",
      {
        method: "POST",
        headers: {
          Authorization: apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          coordinates: [
            [pickup.lng, pickup.lat],
            [destination.lng, destination.lat],
          ],
          instructions: false,
          geometry: true,
          extra_info: ["waycategory"],
          // Keep truck routes on land, including when a port is selected.
          options: {
            avoid_features: ["ferries", "fords"],
          },
        }),
      }
    );

    const rawResponse = await response.text();

    let result;

    try {
      result = JSON.parse(rawResponse);
    } catch {
      return jsonResponse(
        {
          error: rawResponse ||
            "Invalid response from OpenRouteService.",
          upstreamStatus: response.status,
        },
        502
      );
    }

    if (!response.ok) {
      console.error("OpenRouteService error:", result);

      return jsonResponse(
        {
          error:
            result?.error?.message ||
            (typeof result?.error === "string" ? result.error : null) ||
            result?.message ||
            `Routing failed (${response.status}).`,
          upstreamStatus: response.status,
          details: result,
        },
        response.status
      );
    }

    const route = result.routes?.[0];
    const summary = route?.summary;

    console.log("ORS route summary:", summary);
    console.log("ORS geometry type:", typeof route?.geometry);
    console.log("ORS requested coordinates:", { pickup, destination });

    if (
      !route ||
      !summary ||
      !Number.isFinite(summary.distance) ||
      !Number.isFinite(summary.duration)
    ) {
      return jsonResponse(
        { error: "No valid truck route was returned." },
        502
      );
    }

    if (typeof route.geometry !== "string") {
      return jsonResponse(
        { error: "Missing encoded route geometry." },
        502
      );
    }

    const wayCategories = route.extras?.waycategory?.values;
    if (!Array.isArray(wayCategories) || wayCategories.length === 0) {
      return jsonResponse(
        { error: "Unable to verify a road-only route. Please try again." },
        502
      );
    }

    // ORS waycategory is a bitmask: 8 = ferry, 16 = ford.
    if (wayCategories.some((segment) => (segment[2] & 24) !== 0)) {
      return jsonResponse(
        { error: "No road-only truck route was returned. Select the port's truck entrance or access road." },
        422
      );
    }

    const coordinates = decodePolyline(route.geometry, 5);

    if (coordinates.length < 2) {
      return jsonResponse(
        { error: "Route geometry has insufficient points." },
        502
      );
    }

    // Convert the route into GeoJSON for MapLibre.
    const geojson = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {
            summary,
          },
          geometry: {
            type: "LineString",
            coordinates,
          },
        },
      ],
    };

    return jsonResponse({
      roadOnlyVerified: true,
      geojson,
      distanceKm: Number(
        (summary.distance / 1000).toFixed(1)
      ),
      estimatedMinutes: Math.ceil(
        summary.duration / 60
      ),
    });
  } catch (error) {
    console.error("Routing function error:", error);

    return jsonResponse(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to calculate route.",
      },
      500
    );
  }
});
