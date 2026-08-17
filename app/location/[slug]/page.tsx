import { notFound } from "next/navigation";
import { getResortById, resortToLocation } from "@/data/resorts";
import { getLocationDashboardData } from "@/lib/location-dashboard";
import LocationDashboard from "@/components/location/LocationDashboard";

export default async function ResortPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const resort = getResortById(slug);
  if (!resort) notFound();

  const location = resortToLocation(resort);
  const data = await getLocationDashboardData(location);

  return <LocationDashboard data={data} />;
}
