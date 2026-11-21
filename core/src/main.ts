// Entry point of the cc container: serves cc-web and runs the cc-core rules.
//
// Settings come from the Home Assistant app's options (/data/options.json) or, outside
// Home Assistant OS, from the environment. The environment wins when both are set.
//
//   SUPERVISOR_TOKEN          set by Home Assistant OS when the app has homeassistant_api: true
//   HASS_URL, HASS_TOKEN      Docker Compose or a laptop: Home Assistant URL and a long-lived token
//   HASS_WS_URL               optional: WebSocket URL, when it is not HASS_URL + /api/websocket
//   CC_PORT                   front-end port, default 8099
//   CC_WEB_DIR                folder with the built front end, default ./web
//   CC_PUBLIC_HASS_URL        option public_hass_url: Home Assistant URL as browsers reach it;
//                             default: same host as the front end, port 8123
//   CC_OUTSIDE_ENTITY         option outside_entity, default weather.forecast_home
//   CC_PREHEAT_RADIUS_MI      option preheat_radius_mi, default 3
//   CC_PROXIMITY_PREFIX       option proximity_prefix, default sensor.home_nearest
//   CC_RULES                  option rules (true or false); "off" serves the front end only

import { Auth, createConnection, type Connection } from "home-assistant-js-websocket";
import { existsSync, readFileSync } from "node:fs";
import roomsFile from "../../rooms.json" with { type: "json" };
import { hostFromSlug, type RoomInfo } from "../../shared/model.js";
import { Engine } from "./engine.js";
import { startStaticServer } from "./static.js";

const log = (message: string) => console.log(`${new Date().toISOString()} ${message}`);

interface AppOptions {
  public_hass_url?: string;
  outside_entity?: string;
  preheat_radius_mi?: number;
  proximity_prefix?: string;
  rules?: boolean;
}

function readOptions(): AppOptions {
  const file = process.env.CC_OPTIONS_FILE ?? "/data/options.json";
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, "utf8")) as AppOptions;
  } catch (err) {
    log(`could not read ${file}: ${String(err)}`);
    return {};
  }
}

const options = readOptions();
const env: Record<string, string | undefined> = {
  ...process.env,
  CC_PUBLIC_HASS_URL: process.env.CC_PUBLIC_HASS_URL ?? options.public_hass_url,
  CC_OUTSIDE_ENTITY: process.env.CC_OUTSIDE_ENTITY ?? options.outside_entity,
  CC_PREHEAT_RADIUS_MI: process.env.CC_PREHEAT_RADIUS_MI ?? (options.preheat_radius_mi != null ? String(options.preheat_radius_mi) : undefined),
  CC_PROXIMITY_PREFIX: process.env.CC_PROXIMITY_PREFIX ?? options.proximity_prefix,
  CC_RULES: process.env.CC_RULES ?? (options.rules === false ? "off" : undefined),
};

const bundledRooms: RoomInfo[] = roomsFile.rooms;

/** Rooms are the Home Assistant areas labelled cc_room; rooms.json is the fallback. */
async function loadRooms(conn: Connection): Promise<RoomInfo[]> {
  try {
    const areas = await conn.sendMessagePromise<{ area_id: string; name: string; labels?: string[] }[]>({
      type: "config/area_registry/list",
    });
    const labelled = areas
      .filter((a) => a.labels?.includes("cc_room"))
      .map((a) => ({ slug: a.area_id, host: hostFromSlug(a.area_id), name: a.name }));
    if (labelled.length) return labelled;
  } catch (err) {
    log(`could not list areas (${JSON.stringify(err)}); using rooms.json`);
  }
  return bundledRooms;
}
const webDir = env.CC_WEB_DIR ?? "./web";

if (existsSync(webDir)) {
  startStaticServer({
    dir: webDir,
    port: Number(env.CC_PORT ?? 8099),
    config: {
      hassUrl: env.CC_PUBLIC_HASS_URL || null,
      outsideEntity: env.CC_OUTSIDE_ENTITY || "weather.forecast_home",
    },
    log,
  });
} else {
  log(`no front end at ${webDir}; running rules only`);
}

interface Credentials {
  /** For the log. */
  where: string;
  wsUrl: string;
  token: string;
}

function credentials(): Credentials | null {
  if (env.HASS_URL && env.HASS_TOKEN) {
    const url = env.HASS_URL.replace(/\/+$/, "");
    return { where: url, wsUrl: env.HASS_WS_URL ?? `ws${url.slice(4)}/api/websocket`, token: env.HASS_TOKEN };
  }
  // Inside Home Assistant OS: the Supervisor proxies Core's WebSocket API at this address.
  if (env.SUPERVISOR_TOKEN) {
    return { where: "the Supervisor proxy", wsUrl: env.HASS_WS_URL ?? "ws://supervisor/core/websocket", token: env.SUPERVISOR_TOKEN };
  }
  return null;
}

/** A never-expiring token with an explicit WebSocket URL. */
class TokenAuth extends Auth {
  constructor(
    private readonly url: string,
    token: string,
  ) {
    super({ hassUrl: "", clientId: null, expires: Date.now() + 1e11, refresh_token: "", access_token: token, expires_in: 1e11 });
  }
  override get wsUrl(): string {
    return this.url;
  }
}

async function connect(creds: Credentials): Promise<Connection> {
  for (;;) {
    try {
      const conn = await createConnection({ auth: new TokenAuth(creds.wsUrl, creds.token) });
      log(`connected to Home Assistant ${conn.haVersion} through ${creds.where}`);
      return conn;
    } catch (err) {
      log(`cannot reach Home Assistant through ${creds.where} (${JSON.stringify(err)}); retrying in 10 s`);
      await new Promise((resolve) => setTimeout(resolve, 10_000));
    }
  }
}

async function runRules(): Promise<void> {
  if (env.CC_RULES === "off") {
    log("rules are off (CC_RULES=off)");
    return;
  }
  const creds = credentials();
  if (!creds) {
    log("no Home Assistant credentials (SUPERVISOR_TOKEN, or HASS_URL + HASS_TOKEN); rules are not running");
    return;
  }
  const conn = await connect(creds);
  conn.addEventListener("disconnected", () => log("Home Assistant connection lost; reconnecting"));
  conn.addEventListener("ready", () => log("Home Assistant connection restored"));
  const rooms = await loadRooms(conn);
  const engine = new Engine(conn, rooms, {
    preheatRadiusMiles: Number(env.CC_PREHEAT_RADIUS_MI ?? 3),
    proximityPrefix: env.CC_PROXIMITY_PREFIX ?? "sensor.home_nearest",
    log,
  });
  await engine.start();
  log(`rules running for ${rooms.map((r) => r.name).join(", ")}`);
  setInterval(() => void loadRooms(conn).then((next) => engine.setRooms(next)), 5 * 60_000);
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    log(`${signal}: stopping`);
    process.exit(0);
  });
}

void runRules();
