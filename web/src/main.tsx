import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/space-grotesk/latin-500.css";
import "@fontsource/space-grotesk/latin-600.css";
import { render } from "preact";
import { loadConfig } from "./config";
import { start } from "./ha/hass";
import "./styles.css";
import { App } from "./ui/App";

async function boot(): Promise<void> {
  const config = await loadConfig();
  render(<App config={config} />, document.getElementById("app")!);
  await start(config);
}

void boot();
