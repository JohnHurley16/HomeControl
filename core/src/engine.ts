// Turns Home Assistant state into rule inputs and rule decisions into service calls.
// Nothing is stored: everything it needs is read from Home Assistant, so a restart loses nothing.
// It never writes a climate entity. It feeds the bridge a room temperature, or writes helpers
// that the Home Assistant packages turn into setpoints.

import {
  callService,
  getServices,
  subscribeEntities,
  type Connection,
  type HassEntities,
  type HassEntity,
} from "home-assistant-js-websocket";
import {
  HOUSE,
  HOUSE_MODES,
  internalTemperatureService,
  num,
  remoteTemperatureService,
  roomEntities,
  type HouseMode,
  type RoomInfo,
} from "../../shared/model.js";
import { preheatRule, roomSensorRule, toMiles } from "./rules.js";

export interface EngineOptions {
  /** Pre-heat starts when someone heading home is inside this radius. */
  preheatRadiusMiles: number;
  /** Entity id prefix of the proximity integration, e.g. "sensor.home_nearest". */
  proximityPrefix: string;
  log: (message: string) => void;
}

/** How often an unchanged room temperature is re-sent to a bridge. */
const REFEED_MS = 5 * 60 * 1000;

function toF(entity: HassEntity | undefined): number | null {
  const value = num(entity?.state);
  if (value == null) return null;
  return entity?.attributes.unit_of_measurement === "°C" ? (value * 9) / 5 + 32 : value;
}

export class Engine {
  private entities: HassEntities = {};
  private esphomeServices = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running = false;
  private lastFeed = new Map<string, { kind: "feed" | "internal"; celsius?: number; at: number }>();
  private unsubscribe: (() => void) | undefined;
  private ticks: ReturnType<typeof setInterval>[] = [];
  /** The one thing remembered between looks: pre-heat acts on a change, not a state. */
  private wasApproaching: boolean | null = null;

  constructor(
    private readonly conn: Connection,
    private rooms: RoomInfo[],
    private readonly opts: EngineOptions,
  ) {}

  /** Replaces the room list, e.g. after an area gained the cc_room label. */
  setRooms(rooms: RoomInfo[]): void {
    const before = this.rooms.map((r) => r.slug).join(",");
    this.rooms = rooms;
    if (before !== rooms.map((r) => r.slug).join(",")) {
      this.opts.log(`rooms: ${rooms.map((r) => r.name).join(", ")}`);
      this.schedule();
    }
  }

  async start(): Promise<void> {
    await this.refreshServices();
    this.unsubscribe = subscribeEntities(this.conn, (entities) => {
      this.entities = entities;
      this.schedule();
    });
    this.ticks.push(setInterval(() => this.schedule(), 60_000));
    this.ticks.push(setInterval(() => void this.refreshServices(), 5 * 60_000));
    this.conn.addEventListener("ready", () => {
      this.lastFeed.clear(); // re-feed after a reconnect
      void this.refreshServices();
    });
  }

  stop(): void {
    this.unsubscribe?.();
    this.ticks.forEach(clearInterval);
    if (this.timer) clearTimeout(this.timer);
  }

  private async refreshServices(): Promise<void> {
    try {
      const services = await getServices(this.conn);
      this.esphomeServices = new Set(Object.keys(services.esphome ?? {}));
    } catch (err) {
      this.opts.log(`could not list services: ${JSON.stringify(err)}`);
    }
  }

  /** Coalesces bursts of state changes into one evaluation a second. */
  private schedule(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.evaluate();
    }, 1000);
  }

  private state(id: string): string | undefined {
    return this.entities[id]?.state;
  }

  private isOn(id: string): boolean {
    return this.state(id) === "on";
  }

  private async call(domain: string, service: string, data: Record<string, unknown>, why: string): Promise<void> {
    try {
      await callService(this.conn, domain, service, data);
      this.opts.log(`${domain}.${service} ${JSON.stringify(data)} (${why})`);
    } catch (err) {
      this.opts.log(`FAILED ${domain}.${service} ${JSON.stringify(data)}: ${JSON.stringify(err)}`);
    }
  }

  async evaluate(): Promise<void> {
    if (this.running) {
      this.schedule();
      return;
    }
    this.running = true;
    try {
      // Until the first-run defaults exist the helpers sit at their minimums; do nothing.
      if (!this.isOn("input_boolean.cc_initialized")) return;
      for (const room of this.rooms) await this.roomSensor(room);
      await this.preheat();
    } finally {
      this.running = false;
    }
  }

  private async roomSensor(room: RoomInfo): Promise<void> {
    const ids = roomEntities(room.slug);
    const climate = this.entities[ids.climate];
    if (!climate || climate.state === "unavailable") return; // nothing to steer
    const feedService = remoteTemperatureService(room.host);
    const canFeed = this.esphomeServices.has(feedService);
    const correctionF = num(this.state(ids.sensorCorrection)) ?? 0;

    const decision = roomSensorRule({
      enabled: this.isOn(HOUSE.rules.roomSensors),
      roomF: toF(this.entities[ids.temperature]),
      intakeF: num(String(climate.attributes.current_temperature ?? "")),
      hvacMode: climate.state,
      canFeed,
      correctionF,
    });

    const last = this.lastFeed.get(room.slug);
    const now = Date.now();
    switch (decision.kind) {
      case "feed":
        if (last?.kind !== "feed" || last.celsius !== decision.celsius || now - last.at > REFEED_MS) {
          await this.call("esphome", feedService, { temperature: decision.celsius }, `${room.name}: room sensor in control`);
          this.lastFeed.set(room.slug, { kind: "feed", celsius: decision.celsius, at: now });
        }
        if (correctionF !== 0) await this.setNumber(ids.sensorCorrection, 0, `${room.name}: bridge takes the reading directly`);
        break;
      case "internal":
        if (last?.kind !== "internal") {
          await this.call("esphome", internalTemperatureService(room.host), {}, `${room.name}: back to the unit's own sensor`);
          this.lastFeed.set(room.slug, { kind: "internal", at: now });
        }
        if (correctionF !== 0) await this.setNumber(ids.sensorCorrection, 0, `${room.name}: no correction`);
        break;
      case "correction":
        await this.setNumber(
          ids.sensorCorrection,
          decision.valueF,
          decision.valueF === 0 ? `${room.name}: correction cleared` : `${room.name}: intake reads ${decision.valueF} F off the room`,
        );
        break;
      case "none":
        break;
    }
  }

  private async preheat(): Promise<void> {
    const mode = this.state(HOUSE.mode);
    if (!mode || !(HOUSE_MODES as readonly string[]).includes(mode)) return;
    const distance = this.entities[`${this.opts.proximityPrefix}_distance`];
    const direction = this.state(`${this.opts.proximityPrefix}_direction_of_travel`);
    const decision = preheatRule({
      enabled: this.isOn(HOUSE.rules.preheat),
      mode: mode as HouseMode,
      nearestMiles: toMiles(num(distance?.state), distance?.attributes.unit_of_measurement as string | undefined),
      direction: direction ?? null,
      radiusMiles: this.opts.preheatRadiusMiles,
      wasApproaching: this.wasApproaching,
    });
    this.wasApproaching = decision.approaching;
    if (decision.action === "set_home") {
      await this.call("input_select", "select_option", { entity_id: HOUSE.mode, option: "Home" }, "pre-heat: someone is heading home");
    }
  }

  private setNumber(entityId: string, value: number, why: string): Promise<void> {
    return this.call("input_number", "set_value", { entity_id: entityId, value }, why);
  }
}
