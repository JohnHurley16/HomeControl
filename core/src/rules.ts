// The cc-core rules. Each is a pure function from readings to a decision,
// so it unit-tests without a house. engine.ts turns decisions into service calls.

import { clamp, fToC, roundTo, type HouseMode } from "../../shared/model.js";

// ------------------------------------------------------------------ room-sensor control

export interface RoomSensorInput {
  /** input_boolean.rule_room_sensors */
  enabled: boolean;
  /** Room sensor reading in Fahrenheit, or null when the sensor is missing or unavailable. */
  roomF: number | null;
  /** The unit's own intake reading in Fahrenheit, or null when missing. */
  intakeF: number | null;
  /** climate state: heat, cool, off, unavailable ... */
  hvacMode: string;
  /** True when the bridge exposes a remote-temperature action (Mitsubishi CN105). */
  canFeed: boolean;
  /** Current value of input_number.<room>_sensor_correction. */
  correctionF: number;
}

export type RoomSensorDecision =
  | { kind: "feed"; celsius: number }
  | { kind: "internal" }
  | { kind: "correction"; valueF: number }
  | { kind: "none" };

/** The correction helper's range. */
export const MAX_CORRECTION_F = 4;
/** The gap must move this far from the current correction before the correction changes. */
export const CORRECTION_HYSTERESIS_F = 0.75;

export function roomSensorRule(i: RoomSensorInput): RoomSensorDecision {
  const usable = i.enabled && i.roomF != null;
  const running = i.hvacMode === "heat" || i.hvacMode === "cool";

  if (i.canFeed) {
    // The unit can regulate on our reading directly; no setpoint trickery needed.
    if (!usable) return { kind: "internal" };
    return { kind: "feed", celsius: roundTo(fToC(i.roomF as number), 0.5) };
  }

  // No remote-temperature input: shift the setpoint by how far the intake reads from the room.
  // Intake warmer than the room means the unit stops early, so the setpoint goes up by the gap.
  if (!(usable && running && i.intakeF != null)) {
    return i.correctionF === 0 ? { kind: "none" } : { kind: "correction", valueF: 0 };
  }
  const gap = i.intakeF - (i.roomF as number);
  // Hysteresis: a reading that wobbles around a half-degree boundary must not flap the setpoint.
  if (Math.abs(gap - i.correctionF) < CORRECTION_HYSTERESIS_F) return { kind: "none" };
  const wanted = clamp(roundTo(gap, 0.5), -MAX_CORRECTION_F, MAX_CORRECTION_F);
  if (wanted === i.correctionF) return { kind: "none" };
  return { kind: "correction", valueF: wanted };
}

// ------------------------------------------------------------------ pre-heat before arrival

export interface PreheatInput {
  /** input_boolean.rule_preheat */
  enabled: boolean;
  mode: HouseMode;
  /** Distance of the nearest person from home in miles, or null when unknown. */
  nearestMiles: number | null;
  /** Home Assistant proximity direction: towards, away_from, stationary, arrived. */
  direction: string | null;
  /** Start when someone heading home is inside this radius. */
  radiusMiles: number;
  /** Whether someone was already approaching at the last look; null on the first look after a start. */
  wasApproaching: boolean | null;
}

export interface PreheatDecision {
  /** Someone is at home, or heading home inside the radius. Feed this back in as wasApproaching. */
  approaching: boolean;
  action: "set_home" | "none";
}

/**
 * Switches Away to Home at the moment someone starts approaching, and only then.
 * Acting on the change, not the state, is what lets you press Away at the door while your
 * phone still counts as home: nothing new happened, so the house stays Away.
 */
export function preheatRule(i: PreheatInput): PreheatDecision {
  const approaching =
    i.direction === "arrived" || (i.direction === "towards" && i.nearestMiles != null && i.nearestMiles <= i.radiusMiles);
  const started = approaching && i.wasApproaching === false;
  return { approaching, action: i.enabled && i.mode === "Away" && started ? "set_home" : "none" };
}

// ------------------------------------------------------------------ helpers

const METERS_PER_MILE = 1609.344;

/** Converts a proximity sensor reading to miles using its unit attribute. */
export function toMiles(value: number | null, unit: string | undefined): number | null {
  if (value == null) return null;
  switch (unit) {
    case "mi":
      return value;
    case "km":
      return (value * 1000) / METERS_PER_MILE;
    case "ft":
      return value / 5280;
    case "m":
    default:
      return value / METERS_PER_MILE;
  }
}
