/**
 * OverpassClient – fetches street geometry from the Overpass API and assembles
 * it into the same `{ segments, intersections }` shape used by the Redux store.
 *
 * This module is the **only** place that touches the network.  Everything it
 * returns is plain data; no Redux dispatching happens here.
 *
 * TODO (before production use):
 *   - Retry with exponential back-off on transient errors
 *   - Cache responses keyed on (centre, radius) with a short TTL
 *   - Expose an offline fallback path (e.g. bundled tile data)
 */

import type { StreetSegment, Intersection, StreetPoint } from '../types/street';
import { computeSegmentLength, makeNodeKey } from './StreetDataService';

const OVERPASS_API_URL = 'https://overpass-api.de/api/interpreter';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface OverpassElement {
  type: string;
  id: number;
  tags?: { highway?: string; name?: string; [key: string]: string | undefined };
  geometry?: { lat: number; lon: number }[];
}

interface ParsedWay {
  id: string;
  name: string;
  points: StreetPoint[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function fetchFromOverpassAPI(
  center: StreetPoint,
  radiusMeters: number
): Promise<OverpassElement[]> {
  const q = [
    '[out:json][timeout:25];(',
    'way["highway"~"^(residential|primary|secondary|tertiary|unclassified|living_street|service)$"]',
    `(around:${radiusMeters},${center.latitude},${center.longitude});`,
    ');out geom;',
  ].join('');

  const res = await fetch(OVERPASS_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(q)}`,
  });
  if (!res.ok) throw new Error(`Overpass API ${res.status}`);
  const data = (await res.json()) as { elements: OverpassElement[] };
  return data.elements;
}

function parseWays(elements: OverpassElement[]): ParsedWay[] {
  return elements
    .filter((el) => el.type === 'way' && el.geometry && el.geometry.length >= 2)
    .map((el) => ({
      id: String(el.id),
      name: el.tags?.name ?? 'Unnamed Road',
      points: (el.geometry ?? []).map((g) => ({ latitude: g.lat, longitude: g.lon })),
    }));
}

function buildStreetGraph(ways: ParsedWay[]): {
  segments: StreetSegment[];
  intersections: Intersection[];
} {
  // Collect first / last point of every way keyed by rounded coord
  const epMap: Record<string, { wayIds: string[]; point: StreetPoint }> = {};

  for (const way of ways) {
    const first = way.points[0];
    const last = way.points[way.points.length - 1];
    for (const ep of [first, last]) {
      if (!ep) continue;
      const key = makeNodeKey(ep.latitude, ep.longitude);
      if (!epMap[key]) epMap[key] = { wayIds: [], point: ep };
      epMap[key]!.wayIds.push(way.id);
    }
  }

  // Every endpoint becomes an intersection node
  const intersections: Intersection[] = Object.entries(epMap).map(([key, data]) => ({
    id: key,
    latitude: data.point.latitude,
    longitude: data.point.longitude,
    streetNames: [...new Set(ways.filter((w) => data.wayIds.includes(w.id)).map((w) => w.name))],
    connectedSegmentIds: [], // filled below
  }));

  // Build one segment per way; wire up connected-segment lists
  const segments: StreetSegment[] = ways.map((way) => {
    const first = way.points[0];
    const last = way.points[way.points.length - 1];
    const startId = first ? makeNodeKey(first.latitude, first.longitude) : '';
    const endId = last ? makeNodeKey(last.latitude, last.longitude) : '';

    const seg: StreetSegment = {
      id: `seg_${way.id}`,
      name: way.name,
      points: way.points,
      startNodeId: startId,
      endNodeId: endId,
      lengthMeters: computeSegmentLength(way.points),
    };

    const startInt = intersections.find((i) => i.id === startId);
    if (startInt) startInt.connectedSegmentIds.push(seg.id);
    const endInt = intersections.find((i) => i.id === endId);
    if (endInt) endInt.connectedSegmentIds.push(seg.id);

    return seg;
  });

  return { segments, intersections };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch street data around `centre` within `radiusMeters` from the Overpass
 * API and return the assembled graph.
 *
 * The caller is responsible for dispatching the result into Redux.
 */
export async function fetchStreetGraph(
  centre: StreetPoint,
  radiusMeters: number
): Promise<{ segments: StreetSegment[]; intersections: Intersection[] }> {
  const elements = await fetchFromOverpassAPI(centre, radiusMeters);
  const ways = parseWays(elements);
  return buildStreetGraph(ways);
}
