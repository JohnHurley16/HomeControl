import { roomEntities } from "../../../shared/model";
import { setBoolean, setNumber } from "../actions";
import { entities } from "../ha/hass";
import { countText, fanPath, lengthText, mapLayout, mapSetup, nearestView, trackerView } from "../roommap";
import { Slider, Toggle } from "./bits";

/** The drawing is never taller than this, in CSS pixels. */
const MAX_HEIGHT = 250;

const pct = (fraction: number) => `${(fraction * 100).toFixed(2)}%`;

/** "Nearest person 8 ft from the sensor, moving", from the presence radar. Nothing when it sees nobody. */
export function Nearest({ slug }: { slug: string }) {
  const n = nearestView(entities.value, slug);
  if (n.distance == null) return null;
  return (
    <p class="note nearest">
      Nearest person {lengthText(n.distance, n.imperial)} from the sensor, {n.moving ? "moving" : "still"}.
    </p>
  );
}

/** Where the tracking radar sees people, from above. Renders nothing in a room without that radar. */
export function RoomMap({ slug }: { slug: string }) {
  const e = entities.value;
  const tracker = trackerView(e, slug);
  if (!tracker.fitted) return null;
  const setup = mapSetup(e, slug);
  const m = mapLayout(tracker, setup);
  const ids = roomEntities(slug);
  const ratio = m.box.w / m.box.h;
  const clip = `map-clip-${slug}`;
  const radarLeft = pct((m.radarX - m.box.x) / m.box.w);
  const status = !tracker.online ? "The tracking radar is not reporting" : countText(tracker.count);
  const { raw, unit } = setup;
  const shown = (value: number, unset: string) => (value > 0 ? `${value} ${unit}` : unset);

  return (
    <div class="roommap">
      <div
        class={`map ${m.room ? "room" : "fan"}${tracker.online ? "" : " offline"}`}
        style={`aspect-ratio:${ratio.toFixed(4)};width:min(100%, ${Math.round(MAX_HEIGHT * ratio)}px)`}
        role="img"
        aria-label={`Room map. ${status}.`}
      >
        <svg viewBox={`${m.box.x.toFixed(3)} 0 ${m.box.w.toFixed(3)} ${m.box.h.toFixed(3)}`} preserveAspectRatio="none" aria-hidden="true">
          <clipPath id={clip}>{m.room ? <rect x="0" y="0" width={m.room.w} height={m.room.h} /> : <path d={fanPath(m.radarX)} />}</clipPath>
          <path class="view" d={fanPath(m.radarX)} clip-path={`url(#${clip})`} />
          {m.rings.map((ring) => (
            <circle key={ring.r} class="ring" cx={m.radarX} cy="0" r={ring.r} clip-path={`url(#${clip})`} />
          ))}
        </svg>
        {m.rings.map((ring) => (
          <span key={ring.r} class="ring-label" style={`left:${radarLeft};top:${pct(ring.r / m.box.h)}`}>
            {ring.label}
          </span>
        ))}
        <i class="radar" style={`left:${radarLeft}`} />
        {m.dots.map((d) => (
          <i key={d.slot} class={`dot${d.outside ? " out" : ""}`} style={`left:${pct(d.left)};top:${pct(d.top)}`} />
        ))}
      </div>
      <p class="map-status">
        <b>{status}</b>
        <small>
          {m.room
            ? `${lengthText(m.room.w, tracker.imperial)} wide, ${lengthText(m.room.h, tracker.imperial)} deep. The sensor's wall is at the top.`
            : "Seen from above. The sensor is at the top."}
        </small>
      </p>
      <details class="map-setup">
        <summary>{setup.ready ? "Map setup" : "Set the room size to draw the room"}</summary>
        {setup.editable ? (
          <div class="map-fields">
            <label class="field">
              <span>
                Room width, along the sensor's wall <b>{shown(raw.width, "Not set")}</b>
              </span>
              <Slider label="Room width" min={0} max={raw.max} step={raw.step} value={raw.width} onChange={(v) => setNumber(ids.mapWidth, v)} />
            </label>
            <label class="field">
              <span>
                Room depth, out from that wall <b>{shown(raw.depth, "Not set")}</b>
              </span>
              <Slider label="Room depth" min={0} max={raw.max} step={raw.step} value={raw.depth} onChange={(v) => setNumber(ids.mapDepth, v)} />
            </label>
            <label class="field">
              <span>
                Sensor from the left wall, as you face it <b>{shown(raw.radarX, "Middle")}</b>
              </span>
              <Slider
                label="Sensor from the left wall"
                min={0}
                max={raw.width > 0 ? raw.width : raw.max}
                step={raw.step}
                value={Math.min(raw.radarX, raw.width > 0 ? raw.width : raw.max)}
                onChange={(v) => setNumber(ids.mapRadarX, v)}
              />
            </label>
            <div class="row">
              <span>
                Swap left and right
                <small>Turn on if you step left and the dot goes right.</small>
              </span>
              <Toggle label="Swap left and right" on={setup.mirror} onChange={(on) => setBoolean(ids.mapMirror, on)} />
            </div>
          </div>
        ) : (
          <p class="note">Copy this room's package to Home Assistant again to set the room size here.</p>
        )}
      </details>
    </div>
  );
}
