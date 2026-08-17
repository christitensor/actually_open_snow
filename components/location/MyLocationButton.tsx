"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// PERS-02: personalized "my location" — uses the browser Geolocation API
// and routes into the same backcountry-pin pipeline as MAP-17, since a
// device location is just another uncurated coordinate.
export default function MyLocationButton() {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  const handleClick = () => {
    if (!("geolocation" in navigator)) {
      setStatus("error");
      return;
    }
    setStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        router.push(`/location/pin?lat=${latitude.toFixed(5)}&lon=${longitude.toFixed(5)}`);
      },
      () => setStatus("error"),
      { timeout: 10_000 }
    );
  };

  return (
    <button
      onClick={handleClick}
      className="shrink-0 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium hover:border-blue-400 hover:text-blue-600 dark:border-gray-700"
    >
      {status === "loading" ? "Locating…" : "📍 My location"}
      {status === "error" && <span className="ml-1 text-xs text-red-500">(unavailable)</span>}
    </button>
  );
}
