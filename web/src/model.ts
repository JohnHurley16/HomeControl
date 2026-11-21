// View models: plain functions from the entity store to what a screen shows.
// No state lives here. The device, as Home Assistant reports it, is the truth.

import type { HassEntities, HassEntity } from "home-assistant-js-websocket";
import {
  HOUSE,
  KELVIN_MAX,
  KELVIN_MIN,
  entityToStripKelvin,
  modeTargetEntity,
  num,
  roomEntities,
  type HouseMode,
  type KelvinRange,
  type RoomInfo,
  type Season,
} from "../../shared/model";

export interface Preset {
  name: string;
  brightness_pct: number;
  kelvin: number;
}

export const PRESET_ORDER = ["bright", "relax", "night", "movie"];
/** Used until sensor.cc_light_presets is available; Home Assistant's copy wins. */
export const DEFAULT_PRESETS: Record<string, Preset> = {
  bright: { name: "Bright", brightness_pct: 100, kelvin: 4500 },
  relax: { name: "Relax", brightness_pct: 45, kelvin: 2900 },
  night: { name: "Night", brightness_pct: 5, kelvin: 2700 },
  movie: { name: "Movie", brightness_pct: 15, kelvin: 2700 },
};

export function presets(e: HassEntities): { order: string[]; byKey: Record<string, Preset> } {
  const attrs = e[HOUSE.presets]?.attributes;
  const byKey = attrs?.presets as Record<string, Preset> | undefined;
  const order = attrs?.order as string[] | undefined;
  if (byKey && order?.length) return { order, byKey };
  return { order: PRESET_ORDER, byKey: DEFAULT_PRESETS };
}

/** The Kelvin printed on the strip, from Home Assistant (rooms.json strip_kelvin). */
export function stripKelvin(e: HassEntities): KelvinRange {
  const raw = e[HOUSE.presets]?.attributes.strip_kelvin as unknown;
  if (Array.isArray(raw)) {
    const [warm, cool] = raw as unknown[];
    if (typeof warm === "number" && typeof cool === "number" && cool > warm) return [warm, cool];
  }
  return [KELVIN_MIN, KELVIN_MAX];
}

export function available(entity: HassEntity | undefined): entity is HassEntity {
  return !!entity && entity.state !== "unavailable" && entity.state !== "unknown";
}

export interface LightView {
  available: boolean;
  on: boolean;
  brightnessPct: number;
  /** In the strip's Kelvin, which is what the slider and the presets use. */
  kelvin: number;
  minKelvin: number;
  maxKelvin: number;
  /** The entity's own scale, for converting what is sent to it. */
  entityRange: KelvinRange;
  /** Key of the preset the light currently matches, if any. */
  preset: string | null;
}

export function lightView(e: HassEntities, slug: string): LightView {
  const entity = e[roomEntities(slug).light];
  const ok = available(entity);
  const a = entity?.attributes ?? {};
  const strip = stripKelvin(e);
  // A light that does not say otherwise is taken to use the strip's own scale.
  const lo = num(String(a.min_color_temp_kelvin ?? "")) ?? strip[0];
  const hi = num(String(a.max_color_temp_kelvin ?? "")) ?? strip[1];
  const entityRange: KelvinRange = hi > lo ? [lo, hi] : strip;
  const brightnessPct = Math.round(((num(String(a.brightness ?? "")) ?? 0) / 255) * 100);
  const reported = num(String(a.color_temp_kelvin ?? ""));
  const kelvin = reported == null ? strip[0] : entityToStripKelvin(reported, strip, entityRange);
  const on = ok && entity.state === "on";
  const p = presets(e);
  const match = on
    ? p.order.find((key) => {
        const preset = p.byKey[key];
        return !!preset && Math.abs(preset.brightness_pct - brightnessPct) <= 2 && Math.abs(preset.kelvin - kelvin) <= 90;
      })
    : undefined;
  return {
    available: ok,
    on,
    brightnessPct: on ? Math.max(1, brightnessPct) : brightnessPct,
    kelvin,
    minKelvin: strip[0],
    maxKelvin: strip[1],
    entityRange,
    preset: match ?? null,
  };
}

export type ClimateAction = "heating" | "cooling" | "idle" | "off" | "other";

export interface ClimateView {
  available: boolean;
  mode: string;
  action: ClimateAction;
  /** What the unit is set to. */
  setpoint: number | null;
  /** The unit's own intake reading. */
  intake: number | null;
  fanMode: string | null;
  fanModes: string[];
}

export function climateView(e: HassEntities, slug: string): ClimateView {
  const entity = e[roomEntities(slug).climate];
  const ok = available(entity);
  const a = entity?.attributes ?? {};
  const raw = String(a.hvac_action ?? "");
  const action: ClimateAction = !ok
    ? "other"
    : entity.state === "off"
      ? "off"
      : raw === "heating" || raw === "preheating"
        ? "heating"
        : raw === "cooling"
          ? "cooling"
          : raw === "idle" || raw === ""
            ? "idle"
            : "other";
  return {
    available: ok,
    mode: entity?.state ?? "unavailable",
    action,
    setpoint: num(String(a.temperature ?? "")),
    intake: num(String(a.current_temperature ?? "")),
    fanMode: (a.fan_mode as string | undefined) ?? null,
    fanModes: (a.fan_modes as string[] | undefined) ?? [],
  };
}

export interface RoomView {
  room: RoomInfo;
  light: LightView;
  climate: ClimateView;
  /** Room sensor reading; falls back to the unit's intake when there is no room sensor. */
  temperature: number | null;
  temperatureFromRoomSensor: boolean;
  humidity: number | null;
  /** The room's target as the house thermostat computes it. */
  target: number | null;
  offset: number;
  emptyAdjust: number;
  /** on, off, or null when there is no presence node or it is offline. */
  occupied: boolean | null;
  occupiedSince: string | null;
  lightsAutoOff: boolean;
  lightsWalkIn: boolean;
  lightsOffAfter: number;
}

export function roomView(e: HassEntities, room: RoomInfo): RoomView {
  const ids = roomEntities(room.slug);
  const climate = climateView(e, room.slug);
  const sensor = num(e[ids.temperature]?.state);
  const occ = e[ids.occupied];
  return {
    room,
    light: lightView(e, room.slug),
    climate,
    temperature: sensor ?? climate.intake,
    temperatureFromRoomSensor: sensor != null,
    humidity: num(e[ids.humidity]?.state),
    target: num(e[ids.target]?.state) ?? climate.setpoint,
    offset: num(e[ids.offset]?.state) ?? 0,
    emptyAdjust: num(e[ids.emptyAdjust]?.state) ?? 0,
    occupied: available(occ) ? occ.state === "on" : null,
    occupiedSince: available(occ) ? occ.last_changed : null,
    lightsAutoOff: e[ids.lightsAutoOff]?.state === "on",
    lightsWalkIn: e[ids.lightsWalkIn]?.state === "on",
    lightsOffAfter: num(e[ids.lightsOffAfter]?.state) ?? 15,
  };
}

export interface HouseView {
  mode: HouseMode;
  season: Season;
  /** What the current mode runs at (the stored target, held within 3 degrees of Home when that rule is on). */
  target: number | null;
  /** Stored target per mode: what the steppers edit. */
  targets: Record<HouseMode, number | null>;
  /** What each mode runs at right now. Differs from targets only while Small setbacks holds Sleep or Away. */
  effective: Record<HouseMode, number | null>;
  insideAverage: number | null;
  humidityAverage: number | null;
  /** Number of rooms actively heating or cooling. */
  active: number;
  action: "heating" | "cooling" | "idle";
}

function average(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v != null);
  return present.length ? present.reduce((a, b) => a + b, 0) / present.length : null;
}

export function houseView(e: HassEntities, views: RoomView[]): HouseView {
  const mode = ((e[HOUSE.mode]?.state as HouseMode | undefined) ?? "Home") as HouseMode;
  const season: Season = e[HOUSE.season]?.state === "Cool" ? "Cool" : "Heat";
  const t = (m: HouseMode) => num(e[modeTargetEntity(m)]?.state);
  const heating = views.filter((v) => v.climate.action === "heating").length;
  const cooling = views.filter((v) => v.climate.action === "cooling").length;
  const targets = { Home: t("Home"), Away: t("Away"), Sleep: t("Sleep"), Vacation: t("Vacation") };
  // Home Assistant computes the held values; the front end only shows them.
  const sensor = e[HOUSE.modeTarget];
  const held = (m: "Sleep" | "Away") => num(String(sensor?.attributes[m.toLowerCase()] ?? "")) ?? targets[m];
  const effective = { Home: targets.Home, Away: held("Away"), Sleep: held("Sleep"), Vacation: targets.Vacation };
  return {
    mode,
    season,
    target: num(sensor?.state) ?? effective[mode],
    targets,
    effective,
    insideAverage: average(views.map((v) => v.temperature)),
    humidityAverage: average(views.map((v) => v.humidity)),
    active: heating + cooling,
    action: heating ? "heating" : cooling ? "cooling" : "idle",
  };
}

/** Outside temperature from a weather entity or a plain sensor. */
export function outsideTemperature(e: HassEntities, entityId: string): number | null {
  const entity = e[entityId];
  if (!available(entity)) return null;
  if (entityId.startsWith("weather.")) return num(String(entity.attributes.temperature ?? ""));
  return num(entity.state);
}

/** Room entities that exist but report unavailable, as "<room>: <what>". */
export function offlineDevices(e: HassEntities, list: RoomInfo[]): string[] {
  const out: string[] = [];
  for (const room of list) {
    const ids = roomEntities(room.slug);
    const parts: [string, string][] = [
      [ids.light, "lights"],
      [ids.climate, "mini-split"],
      [ids.temperature, "room sensor"],
      [ids.presence, "presence node"],
    ];
    for (const [id, label] of parts) {
      if (e[id] && e[id]!.state === "unavailable") out.push(`${room.name}: ${label}`);
    }
  }
  return out;
}

export function degrees(value: number | null, digits = 0): string {
  return value == null ? "--" : `${value.toFixed(digits)}°`;
}

/** "3 min", "2 h" since an ISO timestamp. */
export function since(iso: string | null, now = Date.now()): string {
  if (!iso) return "";
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h` : `${Math.round(hours / 24)} d`;
}

/** Calls fn at most once per interval while a slider is dragged; flush() sends the last value now. */
export function throttle<T>(fn: (value: T) => void, intervalMs: number): { push: (value: T) => void; flush: () => void } {
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: { value: T } | undefined;
  const send = () => {
    if (!pending) return;
    const { value } = pending;
    pending = undefined;
    last = Date.now();
    fn(value);
  };
  return {
    push(value: T) {
      pending = { value };
      const wait = intervalMs - (Date.now() - last);
      if (wait <= 0) {
        clearTimeout(timer);
        timer = undefined;
        send();
      } else if (!timer) {
        timer = setTimeout(() => {
          timer = undefined;
          send();
        }, wait);
      }
    },
    flush() {
      clearTimeout(timer);
      timer = undefined;
      send();
    },
  };
}
