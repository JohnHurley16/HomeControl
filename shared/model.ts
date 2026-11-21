// The entity model shared by cc-web and cc-core: one naming rule, no other coupling.
// A room is a Home Assistant area labelled `cc_room`; everything in it is found by name.

export interface RoomInfo {
  /** Home Assistant area id, e.g. "living_room". */
  slug: string;
  /** Hyphenated form used in device hostnames, e.g. "living-room". */
  host: string;
  /** Display name. */
  name: string;
}

export const HOUSE_MODES = ["Home", "Away", "Sleep", "Vacation"] as const;
export type HouseMode = (typeof HOUSE_MODES)[number];
export type Season = "Heat" | "Cool";

/** Default Kelvin printed on the LED strip (rooms.json strip_kelvin): warm-only and cool-only ends. */
export const KELVIN_MIN = 2700;
export const KELVIN_MAX = 6500;

/** A Kelvin range as [warm end, cool end]. */
export type KelvinRange = readonly [number, number];

/**
 * Screens and presets speak the strip's Kelvin. A light entity may report another scale:
 * Home Assistant's WLED integration calls any CCT strip 2000 to 6535 K, where 2000 means
 * "warm LEDs only". The entity's ends are the strip's ends, so the two convert linearly.
 */
export function stripToEntityKelvin(kelvin: number, strip: KelvinRange, entity: KelvinRange): number {
  const span = strip[1] - strip[0];
  const f = span > 0 ? clamp((kelvin - strip[0]) / span, 0, 1) : 0;
  return Math.round(entity[0] + f * (entity[1] - entity[0]));
}

export function entityToStripKelvin(kelvin: number, strip: KelvinRange, entity: KelvinRange): number {
  const span = entity[1] - entity[0];
  const f = span > 0 ? clamp((kelvin - entity[0]) / span, 0, 1) : 0;
  return Math.round(strip[0] + f * (strip[1] - strip[0]));
}

/** Entity ids for one room, built from the naming rule. */
export function roomEntities(slug: string) {
  return {
    light: `light.${slug}_ceiling`,
    climate: `climate.${slug}`,
    temperature: `sensor.${slug}_temperature`,
    humidity: `sensor.${slug}_humidity`,
    presence: `binary_sensor.${slug}_presence`,
    occupied: `binary_sensor.${slug}_occupied`,
    target: `sensor.${slug}_target`,
    setpoint: `sensor.${slug}_setpoint`,
    offset: `input_number.${slug}_offset`,
    emptyAdjust: `input_number.${slug}_empty_adjust`,
    sensorCorrection: `input_number.${slug}_sensor_correction`,
    lightsAutoOff: `input_boolean.${slug}_lights_auto_off`,
    lightsWalkIn: `input_boolean.${slug}_lights_walk_in`,
    lightsOffAfter: `input_number.${slug}_lights_off_after`,
    // More from the presence radar, when the node reports it.
    moving: `binary_sensor.${slug}_moving`,
    still: `binary_sensor.${slug}_still`,
    distance: `sensor.${slug}_detection_distance`,
    // The optional second radar: where up to three people are.
    targets: TARGETS.map((n) => ({ x: `sensor.${slug}_target_${n}_x`, y: `sensor.${slug}_target_${n}_y` })),
    // The room map's helpers. 0 means not set.
    mapWidth: `input_number.${slug}_map_width`,
    mapDepth: `input_number.${slug}_map_depth`,
    mapRadarX: `input_number.${slug}_map_radar_x`,
    mapMirror: `input_boolean.${slug}_map_mirror`,
  } as const;
}

/** The tracking radar follows at most this many people. */
const TARGETS = [1, 2, 3] as const;

export const HOUSE = {
  mode: "input_select.house_mode",
  season: "input_select.house_season",
  modeTarget: "sensor.cc_mode_target",
  presets: "sensor.cc_light_presets",
  occupied: "binary_sensor.house_occupied",
  dryRun: "input_boolean.rule_presence_dry_run",
  rules: {
    oneMode: "input_boolean.rule_one_mode",
    roomSensors: "input_boolean.rule_room_sensors",
    preheat: "input_boolean.rule_preheat",
    smallSetbacks: "input_boolean.rule_small_setbacks",
    windowPause: "input_boolean.rule_window_pause",
    easeEmpty: "input_boolean.rule_ease_empty",
    autoAway: "input_boolean.rule_auto_away",
  },
} as const;

export function modeTargetEntity(mode: HouseMode): string {
  return `input_number.target_${mode.toLowerCase()}`;
}

export function hostFromSlug(slug: string): string {
  return slug.replace(/_/g, "-");
}

/** Name of the ESPHome action a Mitsubishi bridge exposes for remote temperature. */
export function remoteTemperatureService(host: string): string {
  return `ac_${host.replace(/-/g, "_")}_set_remote_temperature`;
}
export function internalTemperatureService(host: string): string {
  return `ac_${host.replace(/-/g, "_")}_use_internal_temperature`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function fToC(f: number): number {
  return ((f - 32) * 5) / 9;
}

export function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/** Parses a Home Assistant state string as a number; unavailable and unknown become null. */
export function num(state: string | undefined | null): number | null {
  if (state == null || state === "unavailable" || state === "unknown" || state === "") return null;
  const n = Number(state);
  return Number.isFinite(n) ? n : null;
}
