import { useEffect, useState } from "preact/hooks";
import { HOUSE_MODES, type HouseMode } from "../../../shared/model";
import { allOff, applyPreset, runScene, setBrightness, setHouseMode, setLight, setModeTarget, setOffset } from "../actions";
import type { AppConfig } from "../config";
import { entities, rooms } from "../ha/hass";
import { degrees, houseView, offlineDevices, outsideTemperature, presets, roomView, type HouseView, type RoomView } from "../model";
import { ActionChip, Card, Icon, Segmented, Slider, Stepper, Toggle } from "./bits";

function useClock(): Date {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

const MODE_OPTIONS: { value: HouseMode; label: string; icon: string }[] = [
  { value: "Home", label: "Home", icon: "home" },
  { value: "Away", label: "Away", icon: "away" },
  { value: "Sleep", label: "Sleep", icon: "sleep" },
];

export function Home({ config }: { config: AppConfig }) {
  const e = entities.value;
  const views = rooms.value.map((r) => roomView(e, r));
  const house = houseView(e, views);
  const now = useClock();
  const outside = outsideTemperature(e, config.outsideEntity);
  const offline = offlineDevices(e, rooms.value);
  const scenes = config.scenes.filter((id) => e[id]);

  return (
    <div class="screen home">
      <header class="topbar">
        <div class="clock">
          <strong>{now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).replace(/\s?[AP]M/i, "")}</strong>
          <div>
            <span>{now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}</span>
            <small>{outside == null ? "" : `Outside ${degrees(outside)}`}</small>
          </div>
        </div>
        <h1 class="phone-title">Home</h1>
        <Segmented
          label="House mode"
          value={(HOUSE_MODES as readonly string[]).includes(house.mode) ? house.mode : null}
          options={MODE_OPTIONS}
          onChange={setHouseMode}
        />
        <button type="button" class="btn outline all-off" aria-label="All off" onClick={allOff}>
          <Icon name="power" />
          <span>All off</span>
        </button>
      </header>

      <div class="home-grid">
        <HouseCard house={house} views={views} />
        <div class="rooms">
          <h2 class="section-title">Rooms</h2>
          <div class="room-grid">
            {views.map((v) => (
              <RoomCard key={v.room.slug} v={v} />
            ))}
          </div>
        </div>
      </div>

      <footer class="scenes">
        {scenes.map((id) => (
          <button type="button" class="btn scene" key={id} onClick={() => runScene(id)}>
            {String(e[id]?.attributes.friendly_name ?? id.replace("scene.", ""))}
          </button>
        ))}
        <span class={`status ${offline.length ? "warn" : "ok"}`}>
          <i />
          {offline.length ? `${offline.length} offline: ${offline.slice(0, 2).join(", ")}` : "All devices online"}
        </span>
      </footer>
    </div>
  );
}

function HouseCard({ house, views }: { house: HouseView; views: RoomView[] }) {
  return (
    <Card class="house" title="House climate" aside={<ActionChip action={house.action} />}>
      <div class="big-target">
        <Stepper
          size="lg"
          label="House target"
          value={degrees(house.target)}
          disabled={house.target == null}
          onStep={(d) => house.target != null && setModeTarget(house.mode, house.target + d)}
        />
        <small>House target, {house.mode} mode</small>
      </div>
      <div class="stats">
        <div>
          <small>Inside average</small>
          <b>{degrees(house.insideAverage)}</b>
        </div>
        <div>
          <small>Humidity</small>
          <b>{house.humidityAverage == null ? "--" : `${Math.round(house.humidityAverage)}%`}</b>
        </div>
      </div>
      <table class="zones">
        <thead>
          <tr>
            <th>Zone</th>
            <th>Now</th>
            <th>State</th>
            <th>Target</th>
          </tr>
        </thead>
        <tbody>
          {views.map((v) => (
            <tr key={v.room.slug}>
              <td>
                <a href={`#/room/${v.room.slug}`}>{v.room.name}</a>
              </td>
              <td>{degrees(v.temperature)}</td>
              <td class={v.climate.action}>{label(v.climate.action)}</td>
              <td>
                <b>{degrees(v.target)}</b>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div class="card-foot">
        <span>
          <Icon name="lock" size={16} /> {house.season} mode, all zones
        </span>
        <a href="#/climate">Details</a>
      </div>
    </Card>
  );
}

function label(action: string): string {
  return action === "heating" ? "Heating" : action === "cooling" ? "Cooling" : action === "off" ? "Off" : action === "other" ? "Offline" : "Idle";
}

function RoomCard({ v }: { v: RoomView }) {
  const p = presets(entities.value);
  const slug = v.room.slug;
  const verb = v.climate.action === "heating" ? "Heating to" : v.climate.action === "cooling" ? "Cooling to" : v.climate.action === "off" ? "Off, set to" : "Idle at";
  return (
    <section class={`card room${v.light.available ? "" : " no-light"}`}>
      <header class="card-head">
        <h2>
          <a href={`#/room/${slug}`}>{v.room.name}</a>
          {v.occupied != null && <i class={`presence ${v.occupied ? "in" : "out"}`} title={v.occupied ? "Occupied" : "Empty"} />}
        </h2>
        <span class="reading">
          <b>{degrees(v.temperature)}</b>
          <small>{v.humidity == null ? "" : `${Math.round(v.humidity)}%`}</small>
        </span>
      </header>
      <div class="light-row">
        <Toggle label={`${v.room.name} lights`} on={v.light.on} disabled={!v.light.available} onChange={(on) => setLight(slug, on)} />
        <span class="light-label">Lights</span>
        <Slider
          label={`${v.room.name} brightness`}
          min={1}
          max={100}
          value={v.light.on ? v.light.brightnessPct : 1}
          disabled={!v.light.available}
          onChange={(pct) => setBrightness(slug, pct)}
        />
        <span class="pct">{!v.light.available ? "Offline" : v.light.on ? `${v.light.brightnessPct}%` : "Off"}</span>
      </div>
      <div class="presets three">
        {p.order.slice(0, 3).map((key) => (
          <button
            type="button"
            key={key}
            class={`btn preset${v.light.preset === key ? " on" : ""}`}
            disabled={!v.light.available}
            onClick={() => applyPreset(slug, key)}
          >
            {p.byKey[key]?.name ?? key}
          </button>
        ))}
      </div>
      <div class={`climate-row ${v.climate.action}`}>
        <span class="verb">
          <Icon name={v.climate.action === "heating" ? "flame" : v.climate.action === "cooling" ? "snow" : "thermo"} size={18} />
          <span class="long">{v.climate.available ? verb : "Mini-split offline"}</span>
          <span class="short">{label(v.climate.action)}</span>
        </span>
        <Stepper
          label={`${v.room.name} target`}
          value={degrees(v.target)}
          disabled={v.target == null}
          onStep={(d) => setOffset(slug, v.offset + d)}
        />
      </div>
    </section>
  );
}
