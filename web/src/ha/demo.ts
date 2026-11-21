// An in-memory stand-in for Home Assistant, so the app runs with no server:
// open the app with ?demo. It implements just the services the screens call.

import type { HassEntities, HassEntity } from "home-assistant-js-websocket";
import { HOUSE, KELVIN_MAX, KELVIN_MIN, modeTargetEntity, roomEntities, stripToEntityKelvin, type HouseMode, type KelvinRange, type RoomInfo } from "../../../shared/model";
import { DEFAULT_PRESETS, PRESET_ORDER } from "../model";

type Attrs = Record<string, unknown>;

// The demo lights report Home Assistant's WLED scale, so the demo exercises the same conversion.
const STRIP: KelvinRange = [KELVIN_MIN, KELVIN_MAX];
const WLED: KelvinRange = [2000, 6535];
const wled = (stripKelvin: number) => stripToEntityKelvin(stripKelvin, STRIP, WLED);

export class DemoHass {
  private e: Record<string, HassEntity> = {};

  constructor(
    private readonly rooms: RoomInfo[],
    private readonly publish: (entities: HassEntities) => void,
  ) {
    this.seed();
    this.derive();
    this.track();
  }

  private set(id: string, state: string, attributes: Attrs = {}): void {
    const now = new Date().toISOString();
    const prev = this.e[id];
    this.e[id] = {
      entity_id: id,
      state,
      attributes: { ...(prev?.attributes ?? {}), ...attributes },
      last_changed: prev && prev.state === state ? prev.last_changed : now,
      last_updated: now,
      context: { id: "demo", user_id: null, parent_id: null },
    };
  }

  private seed(): void {
    const lights = [
      { on: true, pct: 100, k: 4500 },
      { on: true, pct: 45, k: 2900 },
      { on: false, pct: 45, k: 2900 },
      { on: true, pct: 100, k: 4500 },
    ];
    const temps = [69.4, 70.2, 67.3, 70.1];
    this.rooms.forEach((room, i) => {
      const ids = roomEntities(room.slug);
      const l = lights[i % lights.length]!;
      this.set(ids.light, l.on ? "on" : "off", {
        brightness: Math.round(l.pct * 2.55),
        color_temp_kelvin: wled(l.k),
        min_color_temp_kelvin: WLED[0],
        max_color_temp_kelvin: WLED[1],
        friendly_name: `${room.name} ceiling`,
      });
      this.set(ids.temperature, String(temps[i % temps.length]), { unit_of_measurement: "°F" });
      this.set(ids.humidity, String(41 + i), { unit_of_measurement: "%" });
      this.set(ids.presence, i === 2 ? "off" : "on");
      this.set(ids.occupied, i === 2 ? "off" : "on");
      this.set(ids.offset, room.slug === "bedroom" ? "-2" : "0", { min: -5, max: 5, step: 1 });
      this.set(ids.emptyAdjust, "0");
      this.set(ids.sensorCorrection, "0");
      this.set(ids.lightsAutoOff, "on");
      this.set(ids.lightsWalkIn, "off");
      this.set(ids.lightsOffAfter, "15", { min: 1, max: 120, step: 1 });
      // The presence radar's extras and the tracking radar, in the units a US-units Home Assistant reports.
      const present = i !== 2;
      this.set(ids.moving, present && i === 0 ? "on" : "off");
      this.set(ids.still, present ? "on" : "off");
      this.set(ids.distance, present ? String(98 - 20 * i) : "0", { unit_of_measurement: "in" });
      const size = i === 0 ? [14, 12, 5] : [0, 0, 0];
      const helper = { min: 0, max: 40, step: 0.5, unit_of_measurement: "ft" };
      this.set(ids.mapWidth, String(size[0]), helper);
      this.set(ids.mapDepth, String(size[1]), helper);
      this.set(ids.mapRadarX, String(size[2]), helper);
      this.set(ids.mapMirror, "off");
      this.set(ids.climate, "heat", {
        current_temperature: temps[i % temps.length]! + 2.7,
        temperature: 70,
        hvac_action: "idle",
        hvac_modes: ["off", "heat", "cool", "dry", "fan_only"],
        fan_mode: "auto",
        fan_modes: ["auto", "low", "medium", "high"],
        min_temp: 60,
        max_temp: 86,
      });
    });
    this.set(HOUSE.mode, "Home", { options: ["Home", "Away", "Sleep", "Vacation"] });
    this.set(HOUSE.season, "Heat", { options: ["Heat", "Cool"] });
    this.set(modeTargetEntity("Home"), "70", { min: 55, max: 85, step: 1 });
    this.set(modeTargetEntity("Sleep"), "68", { min: 55, max: 85, step: 1 });
    this.set(modeTargetEntity("Away"), "67", { min: 55, max: 85, step: 1 });
    this.set(modeTargetEntity("Vacation"), "60", { min: 45, max: 90, step: 1 });
    for (const [key, id] of Object.entries(HOUSE.rules)) this.set(id, key === "windowPause" ? "off" : "on");
    this.set(HOUSE.dryRun, "on");
    this.set(HOUSE.presets, "ok", { presets: DEFAULT_PRESETS, order: PRESET_ORDER, strip_kelvin: [...STRIP] });
    this.set("weather.forecast_home", "cloudy", { temperature: 46, temperature_unit: "°F" });
    for (const name of ["Morning", "Relax", "Movie", "Goodnight"]) {
      this.set(`scene.${name.toLowerCase()}`, "unknown", { friendly_name: name });
    }
  }

  /**
   * The tracking radar's readings at a moment: in each occupied room one person walks a slow loop
   * and one sits still. Inches, as a US-units Home Assistant reports the radar's millimetres.
   */
  track(nowMs: number = Date.now()): void {
    const t = nowMs / 1000;
    const inches = (mm: number) => String(Math.round((mm / 25.4) * 10) / 10);
    this.rooms.forEach((room, i) => {
      const ids = roomEntities(room.slug);
      const present = this.e[ids.presence]?.state === "on";
      const spots: [number, number][] = [
        [300 + 900 * Math.sin(t / 6 + i), 1900 + 900 * Math.cos(t / 9 + i)],
        [-1500, 2600 + 200 * i],
        [0, 0],
      ];
      ids.targets.forEach((target, n) => {
        const [x, y] = present ? spots[n]! : [0, 0];
        this.set(target.x, inches(x), { unit_of_measurement: "in" });
        this.set(target.y, inches(y), { unit_of_measurement: "in" });
      });
    });
    this.emit();
  }

  /** Recomputes what Home Assistant's templates and the units themselves would. */
  private derive(): void {
    const mode = (this.e[HOUSE.mode]?.state ?? "Home") as HouseMode;
    const home = Number(this.e[modeTargetEntity("Home")]?.state ?? 70);
    const small = this.e[HOUSE.rules.smallSetbacks]?.state === "on";
    const run = (m: HouseMode) => {
      const stored = Number(this.e[modeTargetEntity(m)]?.state ?? home);
      return small && (m === "Sleep" || m === "Away") ? Math.min(home + 3, Math.max(home - 3, stored)) : stored;
    };
    const modeTarget = run(mode);
    this.set(HOUSE.modeTarget, String(modeTarget), { unit_of_measurement: "°F", sleep: run("Sleep"), away: run("Away") });
    const season = this.e[HOUSE.season]?.state === "Cool" ? "cool" : "heat";
    let anyone = false;
    for (const room of this.rooms) {
      const ids = roomEntities(room.slug);
      const target =
        modeTarget + Number(this.e[ids.offset]?.state ?? 0) + Number(this.e[ids.emptyAdjust]?.state ?? 0);
      this.set(ids.target, String(target), { unit_of_measurement: "°F" });
      this.set(ids.setpoint, String(target), { unit_of_measurement: "°F" });
      const now = Number(this.e[ids.temperature]?.state ?? target);
      const action = season === "heat" ? (now < target - 0.4 ? "heating" : "idle") : now > target + 0.4 ? "cooling" : "idle";
      this.set(ids.climate, season, { temperature: target, hvac_action: action });
      if (this.e[ids.occupied]?.state === "on") anyone = true;
    }
    this.set(HOUSE.occupied, anyone ? "on" : "off");
  }

  private emit(): void {
    this.publish({ ...this.e });
  }

  call(domain: string, service: string, data: Record<string, unknown>): void {
    const ids = ([] as string[]).concat((data.entity_id as string | string[] | undefined) ?? []);
    const key = `${domain}.${service}`;
    switch (key) {
      case "light.turn_on":
        for (const id of ids) this.lightOn(id, data);
        break;
      case "light.turn_off":
        for (const id of ids) this.set(id, "off");
        break;
      case "input_number.set_value":
        for (const id of ids) this.set(id, String(data.value));
        break;
      case "input_boolean.turn_on":
      case "input_boolean.turn_off":
        for (const id of ids) this.set(id, service === "turn_on" ? "on" : "off");
        break;
      case "input_select.select_option":
        for (const id of ids) this.set(id, String(data.option));
        break;
      case "climate.set_fan_mode":
        for (const id of ids) this.set(id, this.e[id]?.state ?? "heat", { fan_mode: data.fan_mode });
        break;
      case "script.cc_light_preset": {
        const preset = DEFAULT_PRESETS[String(data.preset)];
        if (preset) {
          this.lightOn(roomEntities(String(data.room)).light, {
            brightness_pct: preset.brightness_pct,
            color_temp_kelvin: wled(preset.kelvin),
          });
        }
        break;
      }
      case "script.cc_all_off":
        for (const room of this.rooms) this.set(roomEntities(room.slug).light, "off");
        break;
      case "scene.turn_on":
        this.scene(ids[0] ?? "");
        break;
      default:
        console.info("demo: ignored", key, data);
    }
    this.derive();
    this.emit();
  }

  private lightOn(id: string, data: Record<string, unknown>): void {
    const attrs: Attrs = {};
    if (data.brightness_pct != null) attrs.brightness = Math.max(1, Math.round(Number(data.brightness_pct) * 2.55));
    if (data.color_temp_kelvin != null) attrs.color_temp_kelvin = Number(data.color_temp_kelvin);
    this.set(id, "on", attrs);
  }

  private scene(id: string): void {
    const living = roomEntities("living_room").light;
    const kitchen = roomEntities("kitchen").light;
    if (id === "scene.goodnight") {
      for (const room of this.rooms) this.set(roomEntities(room.slug).light, "off");
      this.set(HOUSE.mode, "Sleep");
    }
    if (id === "scene.movie") {
      this.lightOn(living, { brightness_pct: 15, color_temp_kelvin: wled(2700) });
      this.set(kitchen, "off");
    }
    if (id === "scene.relax") {
      this.lightOn(living, { brightness_pct: 45, color_temp_kelvin: wled(2900) });
      this.lightOn(kitchen, { brightness_pct: 35, color_temp_kelvin: wled(2900) });
    }
    if (id === "scene.morning") {
      this.set(HOUSE.mode, "Home");
      this.lightOn(kitchen, { brightness_pct: 100, color_temp_kelvin: wled(4500) });
      this.lightOn(living, { brightness_pct: 78, color_temp_kelvin: wled(4000) });
    }
  }
}
