// The room map: where the tracking radar sees people, drawn from above.
// Pure functions from the entity store to what the map draws. Lengths are metres in here.

import type { HassEntities, HassEntity } from "home-assistant-js-websocket";
import { clamp, num, roomEntities } from "../../shared/model";
import { available } from "./model";

const METRES: Record<string, number> = { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344 };
const IMPERIAL = new Set(["in", "ft", "yd", "mi"]);

function unitOf(entity: HassEntity | undefined, fallback: string): string {
  return String(entity?.attributes.unit_of_measurement ?? fallback);
}

/**
 * A length entity in metres. Home Assistant converts lengths to the house's unit system
 * (a radar's millimetres arrive as inches in a US-units house), so the unit is read, never assumed.
 */
export function metres(entity: HassEntity | undefined, fallbackUnit: string): number | null {
  if (!available(entity)) return null;
  const value = num(entity.state);
  const k = METRES[unitOf(entity, fallbackUnit)];
  return value == null || k == null ? null : value * k;
}

/** "8 ft" or "2.4 m". */
export function lengthText(m: number, imperial: boolean): string {
  return imperial ? `${Math.round(m / METRES.ft!)} ft` : `${(Math.round(m * 10) / 10).toFixed(1)} m`;
}

// ---------------------------------------------------------------- the presence radar's distance

export interface NearestView {
  /** Distance to the nearest person the presence radar sees, or null when it sees nobody or does not report one. */
  distance: number | null;
  moving: boolean;
  imperial: boolean;
}

export function nearestView(e: HassEntities, slug: string): NearestView {
  const ids = roomEntities(slug);
  const entity = e[ids.distance];
  const d = metres(entity, "cm");
  const seen = e[ids.presence]?.state === "on" && d != null && d > 0;
  return { distance: seen ? d : null, moving: e[ids.moving]?.state === "on", imperial: IMPERIAL.has(unitOf(entity, "cm")) };
}

// ---------------------------------------------------------------- the tracking radar

/** x: metres to the radar's right (+) or left (-), as the radar looks into the room. y: metres out from its wall. */
export interface Target {
  x: number;
  y: number;
}

export interface TrackerView {
  /** The room's node has the second radar in its firmware: the entities exist. */
  fitted: boolean;
  /** The radar is reporting. */
  online: boolean;
  /** One entry per tracking slot; null where the slot is empty. */
  targets: (Target | null)[];
  count: number;
  imperial: boolean;
}

/** An empty slot reports 0, 0. Nobody stands inside the wall, so y decides. */
const NEAREST_REAL = 0.05;

export function trackerView(e: HassEntities, slug: string): TrackerView {
  const ids = roomEntities(slug).targets;
  const fitted = ids.some((t) => e[t.x] !== undefined || e[t.y] !== undefined);
  let online = false;
  const targets = ids.map((t) => {
    const x = metres(e[t.x], "mm");
    const y = metres(e[t.y], "mm");
    if (x == null || y == null) return null;
    online = true;
    return y > NEAREST_REAL ? { x, y } : null;
  });
  return {
    fitted,
    online,
    targets,
    count: targets.filter((t) => t != null).length,
    imperial: IMPERIAL.has(unitOf(e[ids[0]!.y], "mm")),
  };
}

// ---------------------------------------------------------------- the room's size and where the radar is

export interface MapSetup {
  /** The helpers exist, so the map can be set up from the screen. */
  editable: boolean;
  /** Width and depth are both set. */
  ready: boolean;
  /** Along the radar's wall. */
  width: number;
  /** Out from the radar's wall. */
  depth: number;
  /** The radar's distance from the left wall, for someone in the room facing the radar. */
  radarX: number;
  /** Swap left and right, for a radar mounted the other way up. */
  mirror: boolean;
  /** The helpers' own unit and values, for the controls. */
  unit: string;
  raw: { width: number; depth: number; radarX: number; max: number; step: number };
}

export function mapSetup(e: HassEntities, slug: string): MapSetup {
  const ids = roomEntities(slug);
  const w = e[ids.mapWidth];
  const width = metres(w, "ft") ?? 0;
  const depth = metres(e[ids.mapDepth], "ft") ?? 0;
  const ready = width > 0 && depth > 0;
  const radarX = metres(e[ids.mapRadarX], "ft") ?? 0;
  const raw = (id: string) => num(e[id]?.state) ?? 0;
  return {
    editable: available(w) && available(e[ids.mapDepth]) && available(e[ids.mapRadarX]),
    ready,
    width,
    depth,
    // Not set yet: the middle of the wall.
    radarX: ready ? (radarX > 0 ? Math.min(radarX, width) : width / 2) : 0,
    mirror: e[ids.mapMirror]?.state === "on",
    unit: unitOf(w, "ft"),
    raw: {
      width: raw(ids.mapWidth),
      depth: raw(ids.mapDepth),
      radarX: raw(ids.mapRadarX),
      max: num(String(w?.attributes.max ?? "")) ?? 40,
      step: num(String(w?.attributes.step ?? "")) ?? 0.5,
    },
  };
}

// ---------------------------------------------------------------- layout

/** How far the tracking radar reaches, and how wide it sees to each side. From its data sheet. */
export const REACH = 6;
export const HALF_ANGLE = Math.PI / 3;

/** A person is drawn this far inside the walls at least, so a dot on a wall stays whole. */
const INSET = 0.2;
/** Readings this far past a wall still count as inside: the radar is good to a few inches, a tape measure too. */
const SLACK = 0.3;

export interface Dot {
  /** Tracking slot, 0 to 2: keeps a dot the same element while it moves. */
  slot: number;
  /** Position as a fraction of the drawing, left to right and top to bottom. */
  left: number;
  top: number;
  /** Past a wall of the room as set up: through a doorway, or the room's size is off. */
  outside: boolean;
}

export interface MapLayout {
  /** The drawing's extent in metres. The radar's wall is the top edge, y = 0. */
  box: { x: number; w: number; h: number };
  /** The room, from x = 0 to its width, when it has been set up. */
  room: { w: number; h: number } | null;
  /** Where the radar sits on the top edge. */
  radarX: number;
  /** Range rings, in metres from the radar, with their labels. Only without a room. */
  rings: { r: number; label: string }[];
  dots: Dot[];
}

export function mapLayout(tracker: TrackerView, setup: MapSetup): MapLayout {
  const room = setup.ready ? { w: setup.width, h: setup.depth } : null;
  const reachX = REACH * Math.sin(HALF_ANGLE);
  const box = room ? { x: 0, w: room.w, h: room.h } : { x: -reachX, w: 2 * reachX, h: REACH };
  const radarX = room ? setup.radarX : 0;
  // Seen from above with the radar looking down the screen, the radar's right is the viewer's left.
  const side = setup.mirror ? 1 : -1;
  const dots: Dot[] = [];
  tracker.targets.forEach((t, slot) => {
    if (!t) return;
    const x = radarX + side * t.x;
    const y = t.y;
    const outside = room != null && (x < -SLACK || x > room.w + SLACK || y > room.h + SLACK);
    dots.push({
      slot,
      left: (clamp(x, box.x + INSET, box.x + box.w - INSET) - box.x) / box.w,
      top: clamp(y, INSET, box.h - INSET) / box.h,
      outside,
    });
  });
  const rings = room
    ? []
    : (tracker.imperial ? [5, 10, 15] : [2, 4]).map((n) => ({
        r: tracker.imperial ? n * METRES.ft! : n,
        label: tracker.imperial ? `${n} ft` : `${n} m`,
      }));
  return { box, room, radarX, rings, dots };
}

/** SVG path of the radar's field of view: a 120 degree fan, REACH long, from (radarX, 0). */
export function fanPath(radarX: number): string {
  const dx = REACH * Math.sin(HALF_ANGLE);
  const dy = REACH * Math.cos(HALF_ANGLE);
  const f = (n: number) => n.toFixed(3);
  return `M${f(radarX)} 0 L${f(radarX - dx)} ${f(dy)} A${REACH} ${REACH} 0 0 0 ${f(radarX + dx)} ${f(dy)} Z`;
}

/** "Nobody in view", "1 person in view", "2 people in view". */
export function countText(count: number): string {
  return count === 0 ? "Nobody in view" : `${count} ${count === 1 ? "person" : "people"} in view`;
}
