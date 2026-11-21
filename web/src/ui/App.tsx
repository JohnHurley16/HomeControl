import { useEffect, useState } from "preact/hooks";
import type { AppConfig } from "../config";
import { problem, rooms, status } from "../ha/hass";
import { Icon } from "./bits";
import { Climate } from "./Climate";
import { Home } from "./Home";
import { Room } from "./Room";
import { Connect, Scenes, System } from "./System";

function useRoute(): string {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const onChange = () => {
      setHash(location.hash);
      window.scrollTo(0, 0);
    };
    addEventListener("hashchange", onChange);
    return () => removeEventListener("hashchange", onChange);
  }, []);
  return hash.replace(/^#\/?/, "");
}

const TABS = [
  { route: "", label: "Rooms", icon: "rooms" },
  { route: "climate", label: "Climate", icon: "climate" },
  { route: "scenes", label: "Scenes", icon: "scenes" },
  { route: "system", label: "System", icon: "system" },
];

export function App({ config }: { config: AppConfig }) {
  const route = useRoute();
  const state = status.value;

  if (state === "loading" || state === "connecting") {
    return <div class="splash">{state === "connecting" ? "Connecting to Home Assistant" : ""}</div>;
  }
  if (state === "signed-out") return <Connect />;

  const [section, slug] = route.split("/");
  const room = section === "room" ? rooms.value.find((r) => r.slug === slug) : undefined;
  const active = section === "room" ? "" : (section ?? "");

  return (
    <div class="shell">
      <nav class="nav" aria-label="Sections">
        {TABS.map((tab) => (
          <a key={tab.route} href={`#/${tab.route}`} class={active === tab.route ? "on" : ""} aria-current={active === tab.route ? "page" : undefined}>
            <Icon name={tab.icon} size={24} />
            <span>{tab.label}</span>
          </a>
        ))}
      </nav>
      <main>
        {(state === "reconnecting" || problem.value) && (
          <div class="banner" role="status">
            {state === "reconnecting" ? "Home Assistant is unreachable. Showing the last known state; reconnecting." : problem.value}
          </div>
        )}
        {room ? (
          <Room room={room} />
        ) : section === "climate" ? (
          <Climate config={config} />
        ) : section === "scenes" ? (
          <Scenes config={config} />
        ) : section === "system" ? (
          <System />
        ) : (
          <Home config={config} />
        )}
      </main>
    </div>
  );
}
