import { HOUSE, HOUSE_MODES, type Season } from "../../../shared/model";
import { setBoolean, setModeTarget, setOffset, setSeason } from "../actions";
import type { AppConfig } from "../config";
import { entities, rooms } from "../ha/hass";
import { degrees, houseView, outsideTemperature, roomView, type RoomView } from "../model";
import { Card, Segmented, Stepper, Toggle } from "./bits";

const SCALE_MIN = 62;
const SCALE_MAX = 78;
const pos = (value: number) => `${Math.max(0, Math.min(100, ((value - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100))}%`;

const RULES: { id: string; title: string; text: string; later?: boolean }[] = [
  { id: HOUSE.rules.oneMode, title: "One mode for all zones", text: "Every unit heats or cools together." },
  { id: HOUSE.rules.roomSensors, title: "Control to room sensors", text: "Use each room's sensor, not the unit's intake." },
  { id: HOUSE.rules.preheat, title: "Pre-heat before arrival", text: "Start when a phone heads home." },
  { id: HOUSE.rules.smallSetbacks, title: "Small setbacks only", text: "Sleep and Away run within 3° of Home." },
  { id: HOUSE.rules.easeEmpty, title: "Ease empty rooms", text: "A room empty for 45 minutes shifts 2°." },
  { id: HOUSE.rules.autoAway, title: "Auto Away", text: "Away when both phones are out and every room is empty." },
  { id: HOUSE.rules.windowPause, title: "Pause a zone on open window", text: "Not built yet. Needs a window sensor in each room.", later: true },
];

export function Climate({ config }: { config: AppConfig }) {
  const e = entities.value;
  const views = rooms.value.map((r) => roomView(e, r));
  const house = houseView(e, views);
  const outside = outsideTemperature(e, config.outsideEntity);

  return (
    <div class="screen climate-screen">
      <header class="topbar">
        <h1>House climate</h1>
        <span class="muted outside">{outside == null ? "" : `Outside ${degrees(outside)}`}</span>
        <Segmented<Season>
          label="Season"
          value={house.season}
          options={[
            { value: "Heat", label: "Heat", icon: "flame" },
            { value: "Cool", label: "Cool", icon: "snow" },
          ]}
          onChange={setSeason}
        />
      </header>

      <div class="climate-cols">
        <Card title="House target">
          <div class="big-target">
            <Stepper
              size="lg"
              label="House target"
              value={degrees(house.target)}
              disabled={house.target == null}
              onStep={(d) => house.target != null && setModeTarget(house.mode, house.target + d)}
            />
            <small>{house.mode} mode</small>
          </div>
          <div class="stats">
            <div>
              <small>Inside average</small>
              <b>{degrees(house.insideAverage)}</b>
            </div>
            <div>
              <small>Zones {house.season === "Heat" ? "heating" : "cooling"}</small>
              <b>
                {house.active} of {views.length}
              </b>
            </div>
          </div>
          <h3>Target by mode</h3>
          {HOUSE_MODES.map((mode) => (
            <div class="row" key={mode}>
              <span>
                <span>
                  {mode} {mode === house.mode && <em class="now">Now</em>}
                </span>
                {house.effective[mode] !== house.targets[mode] && <small>Runs at {degrees(house.effective[mode])}, within 3° of Home</small>}
              </span>
              <Stepper
                label={`${mode} target`}
                value={degrees(house.targets[mode])}
                disabled={house.targets[mode] == null}
                onStep={(d) => house.targets[mode] != null && setModeTarget(mode, (house.targets[mode] as number) + d)}
              />
            </div>
          ))}
          <p class="note">Each room adds its own offset to the mode's target.</p>
        </Card>

        <Card
          title="Zones"
          aside={
            <span class="legend">
              <i class="dot" /> Now <i class="tick" /> Target
            </span>
          }
        >
          <div class="scale">
            <small>{SCALE_MIN}°</small>
            <small>{(SCALE_MIN + SCALE_MAX) / 2}°</small>
            <small>{SCALE_MAX}°</small>
          </div>
          {views.map((v) => (
            <Zone key={v.room.slug} v={v} />
          ))}
        </Card>

        <Card title="Rules">
          {RULES.map((rule) => (
            <div class="row rule" key={rule.id}>
              <span>
                {rule.title}
                <small>{rule.text}</small>
              </span>
              <Toggle label={rule.title} on={!rule.later && e[rule.id]?.state === "on"} disabled={rule.later || !e[rule.id]} onChange={(on) => setBoolean(rule.id, on)} />
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

function Zone({ v }: { v: RoomView }) {
  const action = v.climate.action;
  return (
    <div class="zone">
      <div class="zone-head">
        <a href={`#/room/${v.room.slug}`}>{v.room.name}</a>
        <span class={action}>{action === "heating" ? "Heating" : action === "cooling" ? "Cooling" : action === "off" ? "Off" : action === "other" ? "Offline" : "Idle"}</span>
      </div>
      <div class="bar" aria-hidden="true">
        {v.temperature != null && <i class={`dot ${action}`} style={`left:${pos(v.temperature)}`} />}
        {v.target != null && <i class="tick" style={`left:${pos(v.target)}`} />}
      </div>
      <div class="row">
        <span class="muted">
          Now {degrees(v.temperature)} · Target {degrees(v.target)}
        </span>
        <span class="offset">
          <small>Offset</small>
          <Stepper label={`${v.room.name} offset`} value={`${v.offset > 0 ? "+" : ""}${v.offset}°`} onStep={(d) => setOffset(v.room.slug, v.offset + d)} />
        </span>
      </div>
    </div>
  );
}
