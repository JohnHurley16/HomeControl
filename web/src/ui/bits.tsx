// Small shared controls and icons.

import type { ComponentChildren } from "preact";
import { useRef, useState } from "preact/hooks";
import { throttle } from "../model";

const PATHS: Record<string, string> = {
  rooms: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  climate: "M12 3a2 2 0 0 0-2 2v9.5a4 4 0 1 0 4 0V5a2 2 0 0 0-2-2z",
  scenes: "M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4",
  system: "M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3M6 6h12v12H6zM10 10h4v4h-4z",
  home: "M4 11l8-7 8 7M6 10v9h12v-9",
  away: "M14 4h5v16h-5M14 12H4M8 8l-4 4 4 4",
  sleep: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z",
  power: "M12 3v9M6.3 6.8a8 8 0 1 0 11.4 0",
  flame: "M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-6 1-9z",
  snow: "M12 2v20M4 6l16 12M20 6L4 18M9 3l3 3 3-3M9 21l3-3 3 3",
  lock: "M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0v3",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  back: "M15 5l-7 7 7 7",
  person: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 20a7 7 0 0 1 14 0",
  thermo: "M12 3a2 2 0 0 0-2 2v9.5a4 4 0 1 0 4 0V5a2 2 0 0 0-2-2z",
};

export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  return (
    <svg class="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d={PATHS[name] ?? ""} />
    </svg>
  );
}

export function Toggle(props: { on: boolean; disabled?: boolean; label: string; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.on}
      aria-label={props.label}
      class={`toggle${props.on ? " on" : ""}`}
      disabled={props.disabled}
      onClick={() => props.onChange(!props.on)}
    >
      <span />
    </button>
  );
}

/**
 * A range input that shows its own value while dragged, sends a few commands a second at most,
 * and sends the final value on release.
 */
export function Slider(props: {
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  label: string;
  tone?: "light" | "plain";
  onChange: (value: number) => void;
}) {
  const [drag, setDrag] = useState<number | null>(null);
  const latest = useRef(props.onChange);
  latest.current = props.onChange;
  const sender = useRef(throttle<number>((v) => latest.current(v), 250)).current;
  const release = useRef<ReturnType<typeof setTimeout>>();
  const shown = drag ?? props.value;
  const fill = ((shown - props.min) / (props.max - props.min)) * 100;
  return (
    <input
      type="range"
      class={`slider ${props.tone ?? "light"}`}
      style={`--fill:${Math.max(0, Math.min(100, fill))}%`}
      min={props.min}
      max={props.max}
      step={props.step ?? 1}
      value={shown}
      disabled={props.disabled}
      aria-label={props.label}
      onInput={(ev) => {
        const v = Number((ev.currentTarget as HTMLInputElement).value);
        clearTimeout(release.current);
        setDrag(v);
        sender.push(v);
      }}
      onChange={(ev) => {
        sender.push(Number((ev.currentTarget as HTMLInputElement).value));
        sender.flush();
        // Hold the local value briefly so the thumb does not snap back before the device reports.
        release.current = setTimeout(() => setDrag(null), 1500);
      }}
    />
  );
}

export function Stepper(props: {
  value: string;
  label: string;
  disabled?: boolean;
  size?: "sm" | "lg";
  onStep: (delta: 1 | -1) => void;
}) {
  return (
    <div class={`stepper ${props.size ?? "sm"}`}>
      <button type="button" aria-label={`${props.label} down`} disabled={props.disabled} onClick={() => props.onStep(-1)}>
        <Icon name="minus" />
      </button>
      <output aria-label={props.label}>{props.value}</output>
      <button type="button" aria-label={`${props.label} up`} disabled={props.disabled} onClick={() => props.onStep(1)}>
        <Icon name="plus" />
      </button>
    </div>
  );
}

export function Segmented<T extends string>(props: {
  value: T | null;
  options: { value: T; label: string; icon?: string }[];
  label: string;
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <div class="segmented" role="radiogroup" aria-label={props.label}>
      {props.options.map((o) => (
        <button
          type="button"
          role="radio"
          aria-checked={props.value === o.value}
          class={props.value === o.value ? "on" : ""}
          disabled={props.disabled}
          onClick={() => props.onChange(o.value)}
        >
          {o.icon && <Icon name={o.icon} size={18} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Card(props: { title?: string; aside?: ComponentChildren; class?: string; children: ComponentChildren }) {
  return (
    <section class={`card ${props.class ?? ""}`}>
      {(props.title || props.aside) && (
        <header class="card-head">
          {props.title && <h2>{props.title}</h2>}
          {props.aside}
        </header>
      )}
      {props.children}
    </section>
  );
}

export function ActionChip({ action }: { action: "heating" | "cooling" | "idle" | "off" | "other" }) {
  if (action === "heating") return <span class="chip heat"><Icon name="flame" size={16} />Heating</span>;
  if (action === "cooling") return <span class="chip cool"><Icon name="snow" size={16} />Cooling</span>;
  if (action === "off") return <span class="chip">Off</span>;
  if (action === "other") return <span class="chip">Offline</span>;
  return <span class="chip">Idle</span>;
}
