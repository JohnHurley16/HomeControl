import { describe, expect, it } from "vitest";
import { preheatRule, roomSensorRule, toMiles, type RoomSensorInput } from "../src/rules.js";
import { hostFromSlug, modeTargetEntity, num, remoteTemperatureService, roomEntities } from "../../shared/model.js";

const base: RoomSensorInput = {
  enabled: true,
  roomF: 69.4,
  intakeF: 72.1,
  hvacMode: "heat",
  canFeed: false,
  correctionF: 0,
};

describe("room-sensor control", () => {
  it("feeds the room reading in Celsius, to the half degree, when the bridge can take it", () => {
    expect(roomSensorRule({ ...base, canFeed: true })).toEqual({ kind: "feed", celsius: 21 });
  });
  it("hands control back to the unit when the rule is off or the sensor is gone", () => {
    expect(roomSensorRule({ ...base, canFeed: true, enabled: false })).toEqual({ kind: "internal" });
    expect(roomSensorRule({ ...base, canFeed: true, roomF: null })).toEqual({ kind: "internal" });
  });
  it("raises the setpoint by the gap when the intake reads warmer than the room", () => {
    expect(roomSensorRule(base)).toEqual({ kind: "correction", valueF: 2.5 });
  });
  it("lowers the setpoint when the intake reads cooler than the room", () => {
    expect(roomSensorRule({ ...base, roomF: 72, intakeF: 70.9 })).toEqual({ kind: "correction", valueF: -1 });
  });
  it("clamps the correction to the helper's range", () => {
    expect(roomSensorRule({ ...base, roomF: 60, intakeF: 75 })).toEqual({ kind: "correction", valueF: 4 });
  });
  it("leaves a correction alone until the gap moves three quarters of a degree", () => {
    expect(roomSensorRule({ ...base, correctionF: 2.5 })).toEqual({ kind: "none" });
    expect(roomSensorRule({ ...base, intakeF: 72.3, correctionF: 2.5 })).toEqual({ kind: "none" });
    expect(roomSensorRule({ ...base, intakeF: 72.7, correctionF: 2.5 })).toEqual({ kind: "correction", valueF: 3.5 });
    expect(roomSensorRule({ ...base, roomF: 60, intakeF: 75, correctionF: 4 })).toEqual({ kind: "none" });
  });
  it("clears the correction when the rule is off, the sensor is gone or the unit is off", () => {
    expect(roomSensorRule({ ...base, enabled: false, correctionF: 2.5 })).toEqual({ kind: "correction", valueF: 0 });
    expect(roomSensorRule({ ...base, roomF: null, correctionF: 2.5 })).toEqual({ kind: "correction", valueF: 0 });
    expect(roomSensorRule({ ...base, hvacMode: "off", correctionF: 2.5 })).toEqual({ kind: "correction", valueF: 0 });
    expect(roomSensorRule({ ...base, enabled: false })).toEqual({ kind: "none" });
  });
});

describe("pre-heat before arrival", () => {
  const away = { enabled: true, mode: "Away" as const, nearestMiles: 2, direction: "towards", radiusMiles: 3, wasApproaching: false };
  it("switches to Home when someone heading home comes inside the radius", () => {
    expect(preheatRule(away)).toEqual({ approaching: true, action: "set_home" });
  });
  it("waits while they are still far, stationary or heading away", () => {
    expect(preheatRule({ ...away, nearestMiles: 8 }).action).toBe("none");
    expect(preheatRule({ ...away, direction: "stationary" }).action).toBe("none");
    expect(preheatRule({ ...away, direction: "away_from" }).action).toBe("none");
    expect(preheatRule({ ...away, nearestMiles: null }).action).toBe("none");
  });
  it("only acts in Away mode and when enabled", () => {
    expect(preheatRule({ ...away, mode: "Vacation" }).action).toBe("none");
    expect(preheatRule({ ...away, mode: "Home" }).action).toBe("none");
    expect(preheatRule({ ...away, enabled: false }).action).toBe("none");
  });
  it("treats an arrival as heading home", () => {
    expect(preheatRule({ ...away, direction: "arrived", nearestMiles: 0 })).toEqual({ approaching: true, action: "set_home" });
  });
  it("leaves the house Away when you press Away at the door with your phone still home", () => {
    // Already approaching (arrived) at the last look: nothing changed, so nothing happens.
    expect(preheatRule({ ...away, direction: "arrived", nearestMiles: 0, wasApproaching: true })).toEqual({ approaching: true, action: "none" });
  });
  it("does nothing on the first look after a restart", () => {
    expect(preheatRule({ ...away, wasApproaching: null })).toEqual({ approaching: true, action: "none" });
  });
  it("keeps tracking while the rule is off or the mode is Home", () => {
    expect(preheatRule({ ...away, enabled: false }).approaching).toBe(true);
    expect(preheatRule({ ...away, mode: "Home", direction: "away_from" }).approaching).toBe(false);
  });
});
describe("shared model", () => {
  it("builds entity ids from the naming rule", () => {
    const ids = roomEntities("living_room");
    expect(ids.light).toBe("light.living_room_ceiling");
    expect(ids.climate).toBe("climate.living_room");
    expect(ids.occupied).toBe("binary_sensor.living_room_occupied");
    expect(ids.offset).toBe("input_number.living_room_offset");
    expect(modeTargetEntity("Vacation")).toBe("input_number.target_vacation");
  });
  it("derives host names and ESPHome action names", () => {
    expect(hostFromSlug("living_room")).toBe("living-room");
    expect(remoteTemperatureService("living-room")).toBe("ac_living_room_set_remote_temperature");
  });
  it("parses Home Assistant states as numbers", () => {
    expect(num("69.4")).toBe(69.4);
    expect(num("unavailable")).toBeNull();
    expect(num("unknown")).toBeNull();
    expect(num(undefined)).toBeNull();
  });
  it("converts proximity distances to miles", () => {
    expect(toMiles(1609.344, "m")).toBeCloseTo(1);
    expect(toMiles(3.2, "km")).toBeCloseTo(1.988, 2);
    expect(toMiles(2, "mi")).toBe(2);
    expect(toMiles(null, "m")).toBeNull();
  });
});
