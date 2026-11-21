// Runtime configuration. The cc container serves /cc-config.json; everything has a default,
// so the app also runs from Home Assistant's /local/cc/ folder or the Vite dev server.
// (Not "config.json": the Supervisor treats any file of that name in an app folder as an app definition.)

export interface AppConfig {
  /** Home Assistant base URL as this browser reaches it. */
  hassUrl: string;
  /** Entity shown as "Outside": a weather entity or a temperature sensor. */
  outsideEntity: string;
  /** Scenes shown on the Home screen, in order. */
  scenes: string[];
}

const DEFAULT_SCENES = ["scene.morning", "scene.relax", "scene.movie", "scene.goodnight"];

export async function loadConfig(): Promise<AppConfig> {
  let file: Partial<AppConfig> = {};
  try {
    const res = await fetch("./cc-config.json", { cache: "no-store" });
    if (res.ok) file = (await res.json()) as Partial<AppConfig>;
  } catch {
    // No config file: defaults apply.
  }
  const saved = localStorage.getItem("cc.hassUrl");
  // Served by Home Assistant itself (/local/cc/): same origin. Served by the cc container: port 8123 on this host.
  const guess = location.pathname.startsWith("/local/") ? location.origin : `${location.protocol}//${location.hostname}:8123`;
  return {
    hassUrl: (saved || file.hassUrl || guess).replace(/\/+$/, ""),
    outsideEntity: file.outsideEntity || "weather.forecast_home",
    scenes: file.scenes?.length ? file.scenes : DEFAULT_SCENES,
  };
}
