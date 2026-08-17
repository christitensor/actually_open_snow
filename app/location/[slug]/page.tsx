import { notFound } from "next/navigation";
import { getResortById, resortToLocation } from "@/data/resorts";
import { getLocationDashboardData } from "@/lib/location-dashboard";
import LocationDashboard from "@/components/location/LocationDashboard";
import LocationUnavailable from "@/components/location/LocationUnavailable";

export default async function ResortPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const resort = getResortById(slug);
  if (!resort) notFound();

  const location = resortToLocation(resort);

  let data;
  try {
    data = await getLocationDashboardData(location);
  } catch {
    data = null;
  }

  if (!data) return <LocationUnavailable retryHref={`/location/${slug}`} />;
  return <LocationDashboard data={data} />;
}
