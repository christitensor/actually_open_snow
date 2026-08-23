import { NextResponse } from "next/server";
import { KEY_STATIONS_BY_ZONE } from "@/data/key-stations";
import { getStationMeta, getStationObservation } from "@/lib/data-sources/nws";
import { getAllPhase1StationsWithReadings } from "@/lib/data-sources/snotel";
import { serverError } from "@/lib/util/api";

export interface KeyStationPoint {
  id: string;
  name: string;
  lat: number;
  lon: number;
  elevationFt: number | null;
  tempF: number | null;
  windSpeedMph: number | null;
  windDirectionDeg: number | null;
  observedAt: string | null;
}

export interface SnotelStationPoint {
  id: string;
  name: string;
  lat: number;
  lon: number;
  elevationFt: number;
  snowDepthIn: number | null;
  sweIn: number | null;
  date: string;
}

// DATA-01: "any weather station" on the map, not just the nearest few a
// location page shows in text. Two curated sources rather than one raw
// nearest-station dump — see data/key-stations.ts's doc comment on why
// NWS's plain nearest-station lookup is mostly airport ASOS stations that
// don't tell a backcountry skier anything: (1) the same hand-vetted
// mountain/RAWS stations already used elsewhere in this app, and (2)
// every SNOTEL station in the Phase-1 (UT/ID) region, which already have
// real coordinates from NRCS and need no per-station lookup.
export async function GET() {
  try {
    const uniqueKeyStations = new Map(KEY_STATIONS_BY_ZONE.flatMap((z) => z.stations).map((s) => [s.nwsId, s]));

    const [keyStationResults, snotelReadings] = await Promise.all([
      Promise.all(
        Array.from(uniqueKeyStations.values()).map(async (s): Promise<KeyStationPoint | null> => {
          try {
            const [meta, obs] = await Promise.all([getStationMeta(s.nwsId), getStationObservation(s.nwsId)]);
            return {
              id: s.nwsId,
              name: s.name,
              lat: meta.lat,
              lon: meta.lon,
              elevationFt: meta.elevationFt ?? s.elevationFt,
              tempF: obs?.tempF ?? null,
              windSpeedMph: obs?.windSpeedMph ?? null,
              windDirectionDeg: obs?.windDirectionDeg ?? null,
              observedAt: obs?.timestamp ?? null,
            };
          } catch {
            // One station's metadata/observation failing (e.g. temporarily
            // offline) shouldn't drop the whole layer.
            return null;
          }
        })
      ),
      getAllPhase1StationsWithReadings().catch(() => []),
    ]);

    const keyStations: KeyStationPoint[] = keyStationResults.filter((s): s is KeyStationPoint => s !== null);
    const snotel: SnotelStationPoint[] = snotelReadings.map((r) => ({
      id: r.station.stationTriplet,
      name: r.station.name,
      lat: r.station.lat,
      lon: r.station.lon,
      elevationFt: r.station.elevationFt,
      snowDepthIn: r.snowDepthIn,
      sweIn: r.sweIn,
      date: r.date,
    }));

    return NextResponse.json({ keyStations, snotel });
  } catch (err) {
    return serverError(err);
  }
}
