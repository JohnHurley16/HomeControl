// The one place that talks to Home Assistant. Screens read the signals below and call
// callService(); they never touch the connection. One subscribeEntities feed fills the store.

import { signal } from "@preact/signals";
import {
  callService as haCallService,
  createConnection,
  createLongLivedTokenAuth,
  ERR_INVALID_AUTH,
  getAuth,
  subscribeEntities,
  type Auth,
  type AuthData,
  type Connection,
  type HassEntities,
} from "home-assistant-js-websocket";
import roomsFile from "../../../rooms.json";
import { hostFromSlug, type RoomInfo } from "../../../shared/model";
import type { AppConfig } from "../config";
import { DemoHass } from "./demo";

export type Status = "loading" | "signed-out" | "connecting" | "connected" | "reconnecting" | "demo";

export const entities = signal<HassEntities>({});
export const status = signal<Status>("loading");
export const rooms = signal<RoomInfo[]>(roomsFile.rooms);
export const problem = signal<string | null>(null);
export const haVersion = signal<string>("");

const TOKEN_KEY = "cc.token";
const OAUTH_KEY = "cc.tokens";
const DEMO_KEY = "cc.demo";

let conn: Connection | null = null;
let demo: DemoHass | null = null;
let config: AppConfig;

export function isDemo(): boolean {
  return demo !== null;
}

/** Fire-and-forget service call. The UI never waits: the device's reported state is the truth. */
export function callService(domain: string, service: string, data: Record<string, unknown> = {}): void {
  if (demo) {
    demo.call(domain, service, data);
    return;
  }
  if (!conn) return;
  haCallService(conn, domain, service, data).catch((err: unknown) => {
    problem.value = `${domain}.${service} failed: ${describe(err)}`;
    setTimeout(() => (problem.value = null), 6000);
  });
}

function describe(err: unknown): string {
  if (typeof err === "object" && err && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

function saveTokens(data: AuthData | null): void {
  if (data) localStorage.setItem(OAUTH_KEY, JSON.stringify(data));
  else localStorage.removeItem(OAUTH_KEY);
}

async function loadTokens(): Promise<AuthData | null | undefined> {
  const raw = localStorage.getItem(OAUTH_KEY);
  return raw ? (JSON.parse(raw) as AuthData) : undefined;
}

export async function start(appConfig: AppConfig): Promise<void> {
  config = appConfig;
  const params = new URLSearchParams(location.search);
  if (params.has("demo") || localStorage.getItem(DEMO_KEY)) {
    startDemo();
    return;
  }
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    await connect(createLongLivedTokenAuth(config.hassUrl, token));
    return;
  }
  if (localStorage.getItem(OAUTH_KEY) || params.has("auth_callback")) {
    await signIn();
    return;
  }
  status.value = "signed-out";
}

/** Phones: Home Assistant's own login page. Redirects away on first use. */
export async function signIn(): Promise<void> {
  status.value = "connecting";
  try {
    const auth = await getAuth({ hassUrl: config.hassUrl, saveTokens, loadTokens });
    if (location.search.includes("auth_callback")) {
      history.replaceState(null, "", location.pathname + location.hash);
    }
    await connect(auth);
  } catch (err) {
    saveTokens(null);
    problem.value = `Sign-in failed (${describe(err)}). Check the Home Assistant address.`;
    status.value = "signed-out";
  }
}

/** Wall tablet: a long-lived token for a dedicated non-admin user, pasted once. */
export async function connectWithToken(token: string): Promise<void> {
  localStorage.setItem(TOKEN_KEY, token.trim());
  await connect(createLongLivedTokenAuth(config.hassUrl, token.trim()));
}

export function setHassUrl(url: string): void {
  localStorage.setItem("cc.hassUrl", url.trim().replace(/\/+$/, ""));
  config.hassUrl = url.trim().replace(/\/+$/, "");
}

export function hassUrl(): string {
  return config?.hassUrl ?? "";
}

export function startDemo(): void {
  localStorage.setItem(DEMO_KEY, "1");
  demo = new DemoHass(roomsFile.rooms, (next) => (entities.value = next));
  // The demo's people keep walking, twice a second like the real radar reports.
  setInterval(() => demo?.track(), 500);
  rooms.value = roomsFile.rooms;
  status.value = "demo";
}

export function signOut(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(OAUTH_KEY);
  localStorage.removeItem(DEMO_KEY);
  conn?.close();
  conn = null;
  demo = null;
  entities.value = {};
  status.value = "signed-out";
}

async function connect(auth: Auth): Promise<void> {
  status.value = "connecting";
  problem.value = null;
  try {
    conn = await createConnection({ auth });
  } catch (err) {
    if (err === ERR_INVALID_AUTH) {
      localStorage.removeItem(TOKEN_KEY);
      saveTokens(null);
      problem.value = "Home Assistant rejected the sign-in. Sign in again.";
    } else {
      problem.value = `Cannot reach Home Assistant at ${config.hassUrl}.`;
    }
    status.value = "signed-out";
    return;
  }
  haVersion.value = conn.haVersion;
  conn.addEventListener("disconnected", () => (status.value = "reconnecting"));
  conn.addEventListener("ready", () => (status.value = "connected"));
  conn.addEventListener("reconnect-error", (_c, code) => {
    if (code === ERR_INVALID_AUTH) signOut();
  });
  subscribeEntities(conn, (next) => (entities.value = next));
  status.value = "connected";
  void loadRooms();
}

interface AreaEntry {
  area_id: string;
  name: string;
  labels?: string[];
}

/** Rooms are the areas labelled cc_room, in Home Assistant's order. Falls back to rooms.json. */
async function loadRooms(): Promise<void> {
  if (!conn) return;
  try {
    const areas = await conn.sendMessagePromise<AreaEntry[]>({ type: "config/area_registry/list" });
    const labelled = areas
      .filter((a) => a.labels?.includes("cc_room"))
      .map((a) => ({ slug: a.area_id, host: hostFromSlug(a.area_id), name: a.name }));
    if (labelled.length) rooms.value = labelled;
  } catch {
    // Older Home Assistant or a restricted user: keep the bundled list.
  }
}
