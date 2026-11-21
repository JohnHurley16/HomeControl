import type { HassEntities, HassEntity } from "home-assistant-js-websocket";
import { afterEach, describe, expect, it, vi } from "vitest";
import rooms from "../../rooms.json";
import { HOUSE, entityToStripKelvin, roomEntities, stripToEntityKelvin } from "../../shared/model";
import { DemoHass } from "../src/ha/demo";
import { climateView, degrees, houseView, lightView, offlineDevices, outsideTemperature, presets, roomView, since, throttle } from "../src/model";
import { nextMinutes } from "../src/ui/Room";

function entity(id: string, state: string, attributes: Record<string, unknown> = {}): HassEntity {
  return { entity_id: id, state, attributes, last_changed: "2026-11-14T12:00:00Z", last_updated: "2026-11-14T12:00:00Z", context: { id: "t", user_id: null, parent_id: null } };
}

function store(...list: HassEntity[]): HassEntities {
  return Object.fromEntries(list.map((x) => [x.entity_id, x]));
}

const living = rooms.rooms[0]!;
const ids = roomEntities(living.slug);

describe("lightView", () => {
  it("reports percent, Kelvin and the matching preset", () => {
    const v = lightView(store(entity(ids.light, "on", { brightness: 115, color_temp_kelvin: 2915 })), living.slug);
    expect(v).toMatchObject({ available: true, on: true, brightnessPct: 45, kelvin: 2915, preset: "relax" });
  });

  it("matches no preset when the level was set by hand", () => {
    const v = lightView(store(entity(ids.light, "on", { brightness: 160, color_temp_kelvin: 4500 })), living.slug);
    expect(v.preset).toBeNull();
    expect(v.brightnessPct).toBe(63);
  });

  it("never shows 0% for a light that is on", () => {
    expect(lightView(store(entity(ids.light, "on", { brightness: 1 })), living.slug).brightnessPct).toBe(1);
  });

  it("treats unavailable as offline, not as off", () => {
    const v = lightView(store(entity(ids.light, "unavailable")), living.slug);
    expect(v).toMatchObject({ available: false, on: false, preset: null });
  });

  it("shows the strip's Kelvin for a light that reports Home Assistant's WLED scale", () => {
    const wled = { min_color_temp_kelvin: 2000, max_color_temp_kelvin: 6535 };
    const warm = lightView(store(entity(ids.light, "on", { ...wled, brightness: 13, color_temp_kelvin: 2000 })), living.slug);
    expect(warm).toMatchObject({ kelvin: 2700, minKelvin: 2700, maxKelvin: 6500, entityRange: [2000, 6535], preset: "night" });
    const cool = lightView(store(entity(ids.light, "on", { ...wled, brightness: 255, color_temp_kelvin: 6535 })), living.slug);
    expect(cool.kelvin).toBe(6500);
    // Relax is 2900 K on the strip, which the script sends as 2239 on the WLED scale; WLED then reports 2231.
    const relax = lightView(store(entity(ids.light, "on", { ...wled, brightness: 115, color_temp_kelvin: 2231 })), living.slug);
    expect(relax.preset).toBe("relax");
    expect(Math.abs(relax.kelvin - 2900)).toBeLessThan(15);
  });

  it("takes a light with no stated range to use the strip's own scale", () => {
    const v = lightView(store(entity(ids.light, "on", { brightness: 255, color_temp_kelvin: 4500 })), living.slug);
    expect(v).toMatchObject({ kelvin: 4500, entityRange: [2700, 6500], preset: "bright" });
  });

  it("reads the strip's ends from Home Assistant", () => {
    const e = store(
      entity(HOUSE.presets, "ok", { order: ["bright"], presets: { bright: { name: "Bright", brightness_pct: 100, kelvin: 4000 } }, strip_kelvin: [3000, 6000] }),
      entity(ids.light, "on", { brightness: 255, color_temp_kelvin: 2000, min_color_temp_kelvin: 2000, max_color_temp_kelvin: 6535 }),
    );
    expect(lightView(e, living.slug)).toMatchObject({ kelvin: 3000, minKelvin: 3000, maxKelvin: 6000 });
  });

  it("uses Home Assistant's presets when the sensor is there", () => {
    const e = store(
      entity(HOUSE.presets, "ok", { order: ["cozy"], presets: { cozy: { name: "Cozy", brightness_pct: 30, kelvin: 2700 } } }),
      entity(ids.light, "on", { brightness: 77, color_temp_kelvin: 2700 }),
    );
    expect(presets(e).order).toEqual(["cozy"]);
    expect(lightView(e, living.slug).preset).toBe("cozy");
  });
});

describe("Kelvin conversion", () => {
  const strip = [2700, 6500] as const;
  const wled = [2000, 6535] as const;
  it("maps the strip's ends to the entity's ends and back", () => {
    expect(stripToEntityKelvin(2700, strip, wled)).toBe(2000);
    expect(stripToEntityKelvin(6500, strip, wled)).toBe(6535);
    expect(stripToEntityKelvin(2900, strip, wled)).toBe(2239);
    expect(stripToEntityKelvin(4500, strip, wled)).toBe(4148);
    expect(entityToStripKelvin(2000, strip, wled)).toBe(2700);
    expect(entityToStripKelvin(6535, strip, wled)).toBe(6500);
  });
  it("round-trips within a few Kelvin and clamps outside the range", () => {
    for (const k of [2700, 3000, 3350, 4000, 5200, 6500]) {
      expect(Math.abs(entityToStripKelvin(stripToEntityKelvin(k, strip, wled), strip, wled) - k)).toBeLessThanOrEqual(1);
    }
    expect(stripToEntityKelvin(1800, strip, wled)).toBe(2000);
    expect(entityToStripKelvin(9000, strip, wled)).toBe(6500);
  });
  it("is the identity when the light uses the strip's scale", () => {
    expect(stripToEntityKelvin(3550, strip, strip)).toBe(3550);
  });
});

describe("climateView", () => {
  const view = (state: string, attributes: Record<string, unknown> = {}) => climateView(store(entity(ids.climate, state, attributes)), living.slug);

  it("maps hvac_action", () => {
    expect(view("heat", { hvac_action: "heating" }).action).toBe("heating");
    expect(view("cool", { hvac_action: "cooling" }).action).toBe("cooling");
    expect(view("heat", { hvac_action: "idle" }).action).toBe("idle");
    expect(view("heat").action).toBe("idle");
    expect(view("off", { hvac_action: "off" }).action).toBe("off");
    expect(view("unavailable").action).toBe("other");
    expect(view("dry", { hvac_action: "drying" }).action).toBe("other");
  });

  it("reads the setpoint, intake and fan modes", () => {
    const v = view("heat", { temperature: 70, current_temperature: 72.5, fan_mode: "auto", fan_modes: ["auto", "low"] });
    expect(v).toMatchObject({ setpoint: 70, intake: 72.5, fanMode: "auto", fanModes: ["auto", "low"] });
  });
});

describe("roomView", () => {
  it("prefers the room sensor and falls back to the unit's intake", () => {
    const climate = entity(ids.climate, "heat", { current_temperature: 72, temperature: 70 });
    const withSensor = roomView(store(climate, entity(ids.temperature, "69.4")), living);
    expect(withSensor).toMatchObject({ temperature: 69.4, temperatureFromRoomSensor: true });
    const without = roomView(store(climate, entity(ids.temperature, "unavailable")), living);
    expect(without).toMatchObject({ temperature: 72, temperatureFromRoomSensor: false });
  });

  it("shows the thermostat's target, or the unit's setpoint before the packages are loaded", () => {
    const climate = entity(ids.climate, "heat", { temperature: 71 });
    expect(roomView(store(climate, entity(ids.target, "68")), living).target).toBe(68);
    expect(roomView(store(climate), living).target).toBe(71);
  });

  it("reports occupancy as unknown when the node is offline", () => {
    expect(roomView(store(entity(ids.occupied, "unavailable")), living).occupied).toBeNull();
    expect(roomView(store(entity(ids.occupied, "on")), living).occupied).toBe(true);
    expect(roomView(store(), living).occupied).toBeNull();
  });
});

describe("the demo house", () => {
  function demo() {
    let latest: HassEntities = {};
    const hass = new DemoHass(rooms.rooms, (next) => (latest = next));
    const views = () => rooms.rooms.map((r) => roomView(latest, r));
    return { hass, views, house: () => houseView(latest, views()), get: () => latest };
  }

  it("starts in the state the design shows", () => {
    const d = demo();
    const house = d.house();
    expect(house).toMatchObject({ mode: "Home", season: "Heat", target: 70, action: "heating", active: 2 });
    expect(Math.round(house.insideAverage!)).toBe(69);
    expect(d.views().map((v) => v.target)).toEqual([70, 70, 68, 70]);
    expect(offlineDevices(d.get(), rooms.rooms)).toEqual([]);
    expect(outsideTemperature(d.get(), "weather.forecast_home")).toBe(46);
  });

  it("moves every room when the mode changes and one room when its offset changes", () => {
    const d = demo();
    d.hass.call("input_select", "select_option", { entity_id: HOUSE.mode, option: "Sleep" });
    expect(d.views().map((v) => v.target)).toEqual([68, 68, 66, 68]);
    d.hass.call("input_number", "set_value", { entity_id: roomEntities("office").offset, value: 2 });
    expect(d.views().map((v) => v.target)).toEqual([68, 68, 66, 70]);
  });

  it("holds Sleep and Away within 3 degrees of Home without rewriting them", () => {
    const d = demo();
    d.hass.call("input_number", "set_value", { entity_id: "input_number.target_away", value: 60 });
    expect(d.house().targets.Away).toBe(60);
    expect(d.house().effective.Away).toBe(67);
    d.hass.call("input_select", "select_option", { entity_id: HOUSE.mode, option: "Away" });
    expect(d.house().target).toBe(67);
    expect(d.views().map((v) => v.target)).toEqual([67, 67, 65, 67]);
    d.hass.call("input_boolean", "turn_off", { entity_id: HOUSE.rules.smallSetbacks });
    expect(d.house().target).toBe(60);
    expect(d.house().effective.Away).toBe(60);
  });

  it("applies presets and All off", () => {
    const d = demo();
    d.hass.call("script", "cc_light_preset", { room: "bedroom", preset: "night" });
    expect(d.views()[2]!.light).toMatchObject({ on: true, brightnessPct: 5, preset: "night" });
    d.hass.call("script", "cc_all_off", {});
    expect(d.views().every((v) => !v.light.on)).toBe(true);
  });
});

describe("offlineDevices", () => {
  it("lists only entities that exist and are unavailable", () => {
    const e = store(entity(ids.light, "unavailable"), entity(ids.climate, "heat"));
    expect(offlineDevices(e, [living])).toEqual(["Living room: lights"]);
  });
});

describe("formatting", () => {
  it("degrees", () => {
    expect(degrees(69.44)).toBe("69°");
    expect(degrees(69.44, 1)).toBe("69.4°");
    expect(degrees(null)).toBe("--");
  });

  it("since", () => {
    const now = Date.parse("2026-11-14T12:00:00Z");
    expect(since("2026-11-14T11:59:50Z", now)).toBe("just now");
    expect(since("2026-11-14T11:48:00Z", now)).toBe("12 min");
    expect(since("2026-11-14T09:00:00Z", now)).toBe("3 h");
    expect(since(null, now)).toBe("");
  });

  it("minutes stepper walks 1, 5, 10 ... 120", () => {
    expect(nextMinutes(15, 1)).toBe(20);
    expect(nextMinutes(15, -1)).toBe(10);
    expect(nextMinutes(5, -1)).toBe(1);
    expect(nextMinutes(1, 1)).toBe(5);
    expect(nextMinutes(7, 1)).toBe(10);
    expect(nextMinutes(7, -1)).toBe(5);
    expect(nextMinutes(120, 1)).toBe(120);
    expect(nextMinutes(1, -1)).toBe(1);
  });
});

describe("throttle", () => {
  afterEach(() => vi.useRealTimers());

  it("sends the first value at once, then at most one per interval, always ending on the last", () => {
    vi.useFakeTimers();
    const sent: number[] = [];
    const t = throttle<number>((v) => sent.push(v), 250);
    t.push(10);
    t.push(20);
    t.push(30);
    expect(sent).toEqual([10]);
    vi.advanceTimersByTime(250);
    expect(sent).toEqual([10, 30]);
    t.push(40);
    t.flush();
    expect(sent).toEqual([10, 30, 40]);
    vi.advanceTimersByTime(1000);
    expect(sent).toEqual([10, 30, 40]);
  });
});
