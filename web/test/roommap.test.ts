import type { HassEntities, HassEntity } from "home-assistant-js-websocket";
import { describe, expect, it } from "vitest";
import rooms from "../../rooms.json";
import { roomEntities } from "../../shared/model";
import { DemoHass } from "../src/ha/demo";
import { HALF_ANGLE, REACH, countText, fanPath, lengthText, mapLayout, mapSetup, metres, nearestView, trackerView } from "../src/roommap";

function entity(id: string, state: string, attributes: Record<string, unknown> = {}): HassEntity {
  return { entity_id: id, state, attributes, last_changed: "2026-11-19T12:00:00Z", last_updated: "2026-11-19T12:00:00Z", context: { id: "t", user_id: null, parent_id: null } };
}

function store(...list: HassEntity[]): HassEntities {
  return Object.fromEntries(list.map((x) => [x.entity_id, x]));
}

const slug = rooms.rooms[0]!.slug;
const ids = roomEntities(slug);
const FT = 0.3048;

/** Three tracking slots in the given unit; a missing pair is an empty slot. */
function targets(unit: string, ...pairs: ([number, number] | null)[]): HassEntity[] {
  return ids.targets.flatMap((t, i) => {
    const [x, y] = pairs[i] ?? [0, 0];
    return [entity(t.x, String(x), { unit_of_measurement: unit }), entity(t.y, String(y), { unit_of_measurement: unit })];
  });
}

function helpers(width: number, depth: number, radarX: number, mirror = false): HassEntity[] {
  const a = { min: 0, max: 40, step: 0.5, unit_of_measurement: "ft" };
  return [
    entity(ids.mapWidth, String(width), a),
    entity(ids.mapDepth, String(depth), a),
    entity(ids.mapRadarX, String(radarX), a),
    entity(ids.mapMirror, mirror ? "on" : "off"),
  ];
}

describe("metres", () => {
  it("reads the unit Home Assistant reports instead of assuming one", () => {
    expect(metres(entity("sensor.a", "1500", { unit_of_measurement: "mm" }), "mm")).toBeCloseTo(1.5);
    expect(metres(entity("sensor.a", "59.0551", { unit_of_measurement: "in" }), "mm")).toBeCloseTo(1.5, 4);
    expect(metres(entity("sensor.a", "10", { unit_of_measurement: "ft" }), "mm")).toBeCloseTo(3.048);
    expect(metres(entity("sensor.a", "150"), "cm")).toBeCloseTo(1.5);
  });

  it("gives nothing for a unit it does not know or a sensor that is not reporting", () => {
    expect(metres(entity("sensor.a", "3", { unit_of_measurement: "furlong" }), "mm")).toBeNull();
    expect(metres(entity("sensor.a", "unknown", { unit_of_measurement: "mm" }), "mm")).toBeNull();
    expect(metres(entity("sensor.a", "unavailable"), "mm")).toBeNull();
    expect(metres(undefined, "mm")).toBeNull();
  });
});

describe("trackerView", () => {
  it("is not fitted in a room without the second radar", () => {
    expect(trackerView(store(), slug)).toMatchObject({ fitted: false, online: false, count: 0 });
  });

  it("is fitted but offline while the radar has never reported", () => {
    const e = store(...ids.targets.flatMap((t) => [entity(t.x, "unknown"), entity(t.y, "unavailable")]));
    expect(trackerView(e, slug)).toMatchObject({ fitted: true, online: false, count: 0 });
  });

  it("keeps each person in their slot and drops empty slots", () => {
    const v = trackerView(store(...targets("mm", null, [-900, 3200], null)), slug);
    expect(v).toMatchObject({ fitted: true, online: true, count: 1, imperial: false });
    expect(v.targets[0]).toBeNull();
    expect(v.targets[1]!.x).toBeCloseTo(-0.9);
    expect(v.targets[1]!.y).toBeCloseTo(3.2);
    expect(v.targets[2]).toBeNull();
  });

  it("converts the inches a US-units Home Assistant reports", () => {
    const v = trackerView(store(...targets("in", [39.3701, 78.7402])), slug);
    expect(v.imperial).toBe(true);
    expect(v.targets[0]!.x).toBeCloseTo(1, 3);
    expect(v.targets[0]!.y).toBeCloseTo(2, 3);
  });
});

describe("mapSetup", () => {
  it("is not ready until width and depth are both set", () => {
    expect(mapSetup(store(...helpers(14, 0, 0)), slug)).toMatchObject({ editable: true, ready: false });
    expect(mapSetup(store(), slug)).toMatchObject({ editable: false, ready: false, mirror: false });
  });

  it("turns the helpers' feet into metres and keeps their own values for the controls", () => {
    const s = mapSetup(store(...helpers(14, 12, 5, true)), slug);
    expect(s).toMatchObject({ editable: true, ready: true, mirror: true, unit: "ft" });
    expect(s.width).toBeCloseTo(14 * FT);
    expect(s.depth).toBeCloseTo(12 * FT);
    expect(s.radarX).toBeCloseTo(5 * FT);
    expect(s.raw).toEqual({ width: 14, depth: 12, radarX: 5, max: 40, step: 0.5 });
  });

  it("puts the radar mid-wall when its place is not set, and never past the side wall", () => {
    expect(mapSetup(store(...helpers(14, 12, 0)), slug).radarX).toBeCloseTo(7 * FT);
    expect(mapSetup(store(...helpers(14, 12, 30)), slug).radarX).toBeCloseTo(14 * FT);
  });
});

describe("mapLayout", () => {
  const unset = mapSetup(store(), slug);

  it("draws the radar's own fan when the room has no size yet", () => {
    const m = mapLayout(trackerView(store(...targets("in", [0, 118.11])), slug), unset);
    expect(m.room).toBeNull();
    expect(m.box.h).toBe(REACH);
    expect(m.box.w).toBeCloseTo(2 * REACH * Math.sin(HALF_ANGLE));
    expect(m.box.x).toBeCloseTo(-m.box.w / 2);
    expect(m.rings.map((r) => r.label)).toEqual(["5 ft", "10 ft", "15 ft"]);
    // Straight ahead, 3 m out: the middle of the fan, halfway down.
    expect(m.dots).toHaveLength(1);
    expect(m.dots[0]).toMatchObject({ slot: 0, outside: false });
    expect(m.dots[0]!.left).toBeCloseTo(0.5);
    expect(m.dots[0]!.top).toBeCloseTo(0.5);
  });

  it("labels the rings in metres for a metric house", () => {
    const m = mapLayout(trackerView(store(...targets("mm", [0, 3000])), slug), unset);
    expect(m.rings).toEqual([{ r: 2, label: "2 m" }, { r: 4, label: "4 m" }]);
  });

  it("puts someone on the radar's right on the viewer's left, and swaps when mirrored", () => {
    const e = (mirror: boolean) => store(...targets("mm", [1000, 2000]), ...helpers(14, 12, 7, mirror));
    const plain = mapLayout(trackerView(e(false), slug), mapSetup(e(false), slug));
    const mirrored = mapLayout(trackerView(e(true), slug), mapSetup(e(true), slug));
    const w = 14 * FT;
    expect(plain.room).toEqual({ w, h: 12 * FT });
    expect(plain.radarX).toBeCloseTo(w / 2);
    expect(plain.dots[0]!.left).toBeCloseTo((w / 2 - 1) / w);
    expect(mirrored.dots[0]!.left).toBeCloseTo((w / 2 + 1) / w);
    expect(plain.dots[0]!.top).toBeCloseTo(2 / (12 * FT));
    expect(plain.rings).toEqual([]);
  });

  it("holds a reading past the wall at the wall and marks it", () => {
    // 10 ft room, radar 2 ft from the left wall; someone 2 m to the radar's right is through that wall.
    const e = store(...targets("mm", [2000, 1500], [-1000, 1500], [0, 5000]), ...helpers(10, 10, 2));
    const m = mapLayout(trackerView(e, slug), mapSetup(e, slug));
    expect(m.dots.map((d) => d.outside)).toEqual([true, false, true]);
    expect(m.dots[0]!.left).toBeCloseTo(0.2 / (10 * FT));
    expect(m.dots[2]!.top).toBeCloseTo(1 - 0.2 / (10 * FT));
    for (const d of m.dots) {
      expect(d.left).toBeGreaterThan(0);
      expect(d.left).toBeLessThan(1);
    }
  });

  it("does not call a reading a hand's width past the wall outside", () => {
    const e = store(...targets("mm", [-(8 * FT * 1000 + 200), 1500]), ...helpers(10, 10, 2));
    const m = mapLayout(trackerView(e, slug), mapSetup(e, slug));
    expect(m.dots[0]!.outside).toBe(false);
  });
});

describe("fanPath", () => {
  it("opens 60 degrees to each side and reaches 6 m", () => {
    const n = fanPath(2).match(/-?\d+(\.\d+)?/g)!.map(Number);
    // M x 0  L x1 y1  A r r 0 0 0 x2 y2
    expect(n.slice(0, 2)).toEqual([2, 0]);
    expect(n[2]).toBeCloseTo(2 - REACH * Math.sin(HALF_ANGLE), 3);
    expect(n[3]).toBeCloseTo(REACH / 2, 3);
    expect(n[9]).toBeCloseTo(2 + REACH * Math.sin(HALF_ANGLE), 3);
    expect(Math.hypot(n[9]! - 2, n[10]!)).toBeCloseTo(REACH, 3);
  });
});

describe("nearestView", () => {
  it("gives the presence radar's distance while it sees someone", () => {
    const e = store(entity(ids.presence, "on"), entity(ids.moving, "on"), entity(ids.distance, "98", { unit_of_measurement: "in" }));
    const v = nearestView(e, slug);
    expect(v.distance).toBeCloseTo(98 * 0.0254);
    expect(v).toMatchObject({ moving: true, imperial: true });
  });

  it("gives nothing for an empty room, a zero reading or a node without the sensor", () => {
    expect(nearestView(store(entity(ids.presence, "off"), entity(ids.distance, "250", { unit_of_measurement: "cm" })), slug).distance).toBeNull();
    expect(nearestView(store(entity(ids.presence, "on"), entity(ids.distance, "0", { unit_of_measurement: "cm" })), slug).distance).toBeNull();
    expect(nearestView(store(entity(ids.presence, "on")), slug).distance).toBeNull();
  });
});

describe("text", () => {
  it("writes lengths in the house's units", () => {
    expect(lengthText(2.49, true)).toBe("8 ft");
    expect(lengthText(2.44, false)).toBe("2.4 m");
  });

  it("counts people", () => {
    expect([0, 1, 2].map(countText)).toEqual(["Nobody in view", "1 person in view", "2 people in view"]);
  });
});

describe("demo", () => {
  it("has two people in an occupied room and nobody in the empty one", () => {
    let latest: HassEntities = {};
    const demo = new DemoHass(rooms.rooms, (e) => (latest = e));
    demo.track(60_000);
    const living = trackerView(latest, "living_room");
    expect(living).toMatchObject({ fitted: true, online: true, count: 2, imperial: true });
    expect(living.targets[0]!.y).toBeGreaterThan(1);
    expect(trackerView(latest, "bedroom")).toMatchObject({ fitted: true, online: true, count: 0 });
    expect(mapSetup(latest, "living_room").ready).toBe(true);
    expect(mapSetup(latest, "kitchen").ready).toBe(false);
  });
});
