import { notFound } from "next/navigation";
import { pinToLocation } from "@/data/resorts";
import { getLocationDashboardData } from "@/lib/location-dashboard";
import LocationDashboard from "@/components/location/LocationDashboard";
import LocationUnavailable from "@/components/location/LocationUnavailable";

// MAP-17: dashboard for a dropped backcountry pin — same component and
// data pipeline as a resort page, just an uncurated coordinate.
export default async function PinPage({
  searchParams,
}: {
  searchParams: Promise<{ lat?: string; lon?: string }>;
}) {
  const { lat: latStr, lon: lonStr } = await searchParams;
  const lat = Number(latStr);
  const lon = Number(lonStr);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) notFound();

  const location = pinToLocation(lat, lon);

  let data;
  try {
    data = await getLocationDashboardData(location);
  } catch {
    data = null;
  }

  if (!data) return <LocationUnavailable retryHref={`/location/pin?lat=${lat}&lon=${lon}`} />;
  return <LocationDashboard data={data} />;
}
