import { roomEntities, type RoomInfo } from "../../../shared/model";
import { applyPreset, setBoolean, setBrightness, setFan, setKelvin, setLight, setNumber, setOffset } from "../actions";
import { entities } from "../ha/hass";
import { available, degrees, houseView, presets, roomView, since } from "../model";
import { ActionChip, Card, Icon, Segmented, Slider, Stepper, Toggle } from "./bits";
import { Nearest, RoomMap } from "./RoomMap";

function title(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1).replace(/_/g, " ");
}

/** "for 12 min", or "just now". */
function duration(iso: string | null): string {
  const text = since(iso);
  return text === "" || text === "just now" ? text : `for ${text}`;
}

/** Steps 1, 5, 10 ... 120 minutes. */
export function nextMinutes(current: number, delta: 1 | -1): number {
  const next = delta > 0 ? Math.floor(current / 5) * 5 + 5 : Math.ceil(current / 5) * 5 - 5;
  return Math.max(1, Math.min(120, next));
}

export function Room({ room }: { room: RoomInfo }) {
  const e = entities.value;
  const v = roomView(e, room);
  const house = houseView(e, [v]);
  const ids = roomEntities(room.slug);
  const p = presets(e);
  const slug = room.slug;
  const lightOk = v.light.available;

  const devices: { host: string; what: string; entity: string }[] = [
    { host: `ac-${room.host}`, what: "Mini-split bridge", entity: ids.climate },
    { host: `led-${room.host}`, what: "LED controller", entity: ids.light },
    { host: `env-${room.host}`, what: "Room sensor", entity: ids.temperature },
    { host: `occ-${room.host}`, what: "Presence node", entity: ids.presence },
  ];

  return (
    <div class="screen room-screen">
      <header class="topbar">
        <a class="btn outline back" href="#/" aria-label="Back to rooms">
          <Icon name="back" />
        </a>
        <h1>{room.name}</h1>
        <span class="reading big">
          <b>{degrees(v.temperature)}</b>
          <small>{v.humidity == null ? "" : `${Math.round(v.humidity)}% humidity`}</small>
        </span>
        <ActionChip action={v.climate.action} />
      </header>

      <div class="room-cols">
        <div class="col">
        <Card
          title="Ceiling lights"
          aside={<Toggle label="Ceiling lights" on={v.light.on} disabled={!lightOk} onChange={(on) => setLight(slug, on)} />}
        >
          <label class="field">
            <span>
              Brightness <b>{!lightOk ? "Offline" : v.light.on ? `${v.light.brightnessPct}%` : "Off"}</b>
            </span>
            <Slider label="Brightness" min={1} max={100} value={v.light.on ? v.light.brightnessPct : 1} disabled={!lightOk} onChange={(pct) => setBrightness(slug, pct)} />
          </label>
          <label class="field">
            <span>
              Color temperature <b>{lightOk ? `${Math.round(v.light.kelvin / 50) * 50} K` : "--"}</b>
            </span>
            <Slider
              label="Color temperature"
              tone="plain"
              min={v.light.minKelvin}
              max={v.light.maxKelvin}
              step={50}
              value={v.light.kelvin}
              disabled={!lightOk}
              onChange={(k) => setKelvin(slug, k)}
            />
            <span class="ends">
              <small>Warm {v.light.minKelvin} K</small>
              <small>Cool {v.light.maxKelvin} K</small>
            </span>
          </label>
          <div class="presets four">
            {p.order.map((key) => (
              <button type="button" key={key} class={`btn preset${v.light.preset === key ? " on" : ""}`} disabled={!lightOk} onClick={() => applyPreset(slug, key)}>
                {p.byKey[key]?.name ?? key}
              </button>
            ))}
          </div>
        </Card>

        <Card
          title="Presence"
          aside={
            <span class={`chip ${v.occupied ? "in" : ""}`}>
              <Icon name="person" size={16} />
              {v.occupied == null ? "No sensor" : `${v.occupied ? "Occupied" : "Empty"} ${duration(v.occupiedSince)}`}
            </span>
          }
        >
          <Nearest slug={slug} />
          <RoomMap key={slug} slug={slug} />
          <div class="row">
            <span>
              Lights off when empty
              <small>Dims for 30 seconds first; movement cancels it.</small>
            </span>
            <Toggle label="Lights off when empty" on={v.lightsAutoOff} onChange={(on) => setBoolean(ids.lightsAutoOff, on)} />
          </div>
          <div class="row">
            <span>Minutes empty before lights off</span>
            <Stepper label="Minutes" value={`${v.lightsOffAfter}`} onStep={(d) => setNumber(ids.lightsOffAfter, nextMinutes(v.lightsOffAfter, d))} />
          </div>
          <div class="row">
            <span>
              Lights on when you walk in
              <small>After sunset only. Off by default.</small>
            </span>
            <Toggle label="Lights on when you walk in" on={v.lightsWalkIn} onChange={(on) => setBoolean(ids.lightsWalkIn, on)} />
          </div>
        </Card>
        </div>

        <div class="col">
        <Card
          title="Mini-split"
          aside={
            <span class="muted">
              <Icon name="lock" size={16} /> {house.season} mode, set for the whole house
            </span>
          }
        >
          <div class="big-target">
            <Stepper size="lg" label="Target" value={degrees(v.target)} disabled={v.target == null} onStep={(d) => setOffset(slug, v.offset + d)} />
            <small>Target{v.emptyAdjust !== 0 ? `, eased ${Math.abs(v.emptyAdjust)}° while empty` : ""}</small>
          </div>
          <div class="stats">
            <div class={v.temperatureFromRoomSensor ? "lead" : ""}>
              <small>{v.temperatureFromRoomSensor ? "Room sensor, in control" : "Room sensor missing"}</small>
              <b>{v.temperatureFromRoomSensor ? degrees(v.temperature, 1) : "--"}</b>
            </div>
            <div>
              <small>Unit intake, near ceiling</small>
              <b>{degrees(v.climate.intake, 1)}</b>
            </div>
          </div>
          {v.climate.fanModes.length > 0 && (
            <div class="row">
              <span>Fan</span>
              <Segmented
                label="Fan"
                value={v.climate.fanMode}
                options={v.climate.fanModes.slice(0, 5).map((m) => ({ value: m, label: title(m) }))}
                disabled={!v.climate.available}
                onChange={(m) => setFan(slug, m)}
              />
            </div>
          )}
          <div class="row">
            <span>Offset from house target</span>
            <Stepper label="Offset" value={`${v.offset > 0 ? "+" : ""}${v.offset}°`} onStep={(d) => setOffset(slug, v.offset + d)} />
          </div>
        </Card>

        <Card title="Devices in this room">
          <ul class="devices">
            {devices.map((d) => {
              const entity = e[d.entity];
              const state = !entity ? "missing" : available(entity) ? "online" : "offline";
              return (
                <li key={d.host}>
                  <span class="what">
                    {d.what}
                    <code>{d.host}</code>
                  </span>
                  <span class={`status ${state === "online" ? "ok" : "warn"}`}>
                    <i />
                    {state === "online" ? "Online" : state === "offline" ? "Offline" : "Not set up"}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
        </div>
      </div>
    </div>
  );
}
