import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { pinToLocation, pinHref } from "@/data/resorts";
import { getLocationDashboardData } from "@/lib/location-dashboard";
import LocationDashboard from "@/components/location/LocationDashboard";
import LocationUnavailable from "@/components/location/LocationUnavailable";

// MAP-17: dashboard for a dropped backcountry pin — same component and
// data pipeline as a resort page, just an uncurated coordinate.
//
// `name` (optional) is the saved spot's name, added by the links in "Your
// backcountry spots", so the server-rendered page (heading, conditions
// summary sentence, tab title) already says "Tony Grove Lake" rather than
// "Custom Pin". LocationTitle also looks the pin up among the person's
// saved spots in the browser, which covers every other way of arriving.
export default async function PinPage({
  searchParams,
}: {
  searchParams: Promise<{ lat?: string; lon?: string; name?: string }>;
}) {
  const { lat: latStr, lon: lonStr, name: rawName } = await searchParams;
  const lat = Number(latStr);
  const lon = Number(lonStr);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) notFound();

  const location = pinToLocation(lat, lon, cleanName(rawName));

  let data;
  try {
    data = await getLocationDashboardData(location);
  } catch {
    data = null;
  }

  if (!data) return <LocationUnavailable retryHref={pinHref(lat, lon, location.name === "Custom Pin" ? undefined : location.name)} />;
  return <LocationDashboard data={data} />;
}

function cleanName(raw: string | undefined): string | undefined {
  const name = raw?.replace(/\s+/g, " ").trim().slice(0, 60);
  return name || undefined;
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ name?: string }> }): Promise<Metadata> {
  const name = cleanName((await searchParams).name);
  return { title: `${name ?? "Backcountry pin"} · Actually Open Snow` };
}
