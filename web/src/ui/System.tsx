import { useState } from "preact/hooks";
import { HOUSE } from "../../../shared/model";
import { runScene, setBoolean } from "../actions";
import type { AppConfig } from "../config";
import { entities, hassUrl, haVersion, isDemo, problem, rooms, setHassUrl, signIn, signOut, startDemo, status, connectWithToken } from "../ha/hass";
import { offlineDevices } from "../model";
import { Card, Toggle } from "./bits";

export function Scenes({ config }: { config: AppConfig }) {
  const e = entities.value;
  const all = Object.keys(e)
    .filter((id) => id.startsWith("scene."))
    .sort((a, b) => {
      const ia = config.scenes.indexOf(a);
      const ib = config.scenes.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
    });
  return (
    <div class="screen">
      <header class="topbar">
        <h1>Scenes</h1>
      </header>
      <div class="scene-grid">
        {all.map((id) => (
          <button type="button" class="btn scene big" key={id} onClick={() => runScene(id)}>
            {String(e[id]?.attributes.friendly_name ?? id.replace("scene.", ""))}
          </button>
        ))}
        {all.length === 0 && <p class="note">No scenes yet. Add them in Home Assistant, or edit ha/packages/cc_scenes.yaml.</p>}
      </div>
    </div>
  );
}

export function System() {
  const e = entities.value;
  const offline = offlineDevices(e, rooms.value);
  return (
    <div class="screen">
      <header class="topbar">
        <h1>System</h1>
      </header>
      <div class="system-cols">
        <Card title="Connection">
          <div class="row">
            <span>Home Assistant</span>
            <span class="muted">{isDemo() ? "Demo data, no server" : `${hassUrl()} · ${haVersion.value}`}</span>
          </div>
          <div class="row">
            <span>Status</span>
            <span class={`status ${status.value === "connected" || status.value === "demo" ? "ok" : "warn"}`}>
              <i />
              {status.value === "demo" ? "Demo" : status.value === "connected" ? "Connected" : "Reconnecting"}
            </span>
          </div>
          {!isDemo() && (
            <div class="row">
              <span>
                Admin
                <small>Add devices, edit automations, see the logbook.</small>
              </span>
              <a class="btn outline" href={hassUrl()} target="_blank" rel="noreferrer">
                Open Home Assistant
              </a>
            </div>
          )}
          <div class="row">
            <span>This device</span>
            <button type="button" class="btn outline" onClick={signOut}>
              {isDemo() ? "Leave demo" : "Sign out"}
            </button>
          </div>
        </Card>
        <Card title="Presence rules">
          <div class="row rule">
            <span>
              Dry run
              <small>Rules write what they would do to the logbook and change nothing. Turn it off after a week of clean entries.</small>
            </span>
            <Toggle label="Dry run" on={e[HOUSE.dryRun]?.state === "on"} disabled={!e[HOUSE.dryRun]} onChange={(on) => setBoolean(HOUSE.dryRun, on)} />
          </div>
        </Card>
        <Card title="Devices">
          {offline.length === 0 ? (
            <p class="status ok">
              <i />
              All devices online
            </p>
          ) : (
            <ul class="devices">
              {offline.map((d) => (
                <li key={d}>
                  <span class="what">{d}</span>
                  <span class="status warn">
                    <i />
                    Offline
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

/** First run on a device: pick how this browser signs in. */
export function Connect() {
  const [token, setToken] = useState("");
  const [url, setUrl] = useState(hassUrl());
  return (
    <div class="connect">
      <Card title="Connect to Home Assistant">
        <label class="field">
          <span>Home Assistant address</span>
          <input type="url" value={url} onInput={(ev) => setUrl((ev.currentTarget as HTMLInputElement).value)} onChange={() => setHassUrl(url)} />
        </label>
        {problem.value && <p class="problem">{problem.value}</p>}
        <button
          type="button"
          class="btn primary"
          onClick={() => {
            setHassUrl(url);
            void signIn();
          }}
        >
          Sign in with Home Assistant
        </button>
        <p class="note">Use this on phones. It opens Home Assistant's own login page.</p>
        <label class="field">
          <span>Or paste a long-lived token (wall tablet)</span>
          <input type="password" value={token} placeholder="Token for the tablet's user" onInput={(ev) => setToken((ev.currentTarget as HTMLInputElement).value)} />
        </label>
        <button
          type="button"
          class="btn outline"
          disabled={token.trim().length < 20}
          onClick={() => {
            setHassUrl(url);
            void connectWithToken(token);
          }}
        >
          Use token on this device
        </button>
        <button type="button" class="btn link" onClick={startDemo}>
          Look around with demo data
        </button>
      </Card>
    </div>
  );
}
