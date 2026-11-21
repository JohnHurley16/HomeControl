// Every write the front end makes, in one place.

import { HOUSE, clamp, modeTargetEntity, roomEntities, stripToEntityKelvin, type HouseMode, type Season } from "../../shared/model";
import { callService, entities } from "./ha/hass";
import { lightView } from "./model";

export function setLight(slug: string, on: boolean): void {
  callService("light", on ? "turn_on" : "turn_off", { entity_id: roomEntities(slug).light, transition: 1 });
}

export function setBrightness(slug: string, pct: number): void {
  callService("light", "turn_on", { entity_id: roomEntities(slug).light, brightness_pct: clamp(Math.round(pct), 1, 100) });
}

/** kelvin is the strip's; the light gets it in its own scale. */
export function setKelvin(slug: string, kelvin: number): void {
  const v = lightView(entities.value, slug);
  callService("light", "turn_on", {
    entity_id: roomEntities(slug).light,
    color_temp_kelvin: stripToEntityKelvin(kelvin, [v.minKelvin, v.maxKelvin], v.entityRange),
  });
}

export function applyPreset(slug: string, preset: string): void {
  callService("script", "cc_light_preset", { room: slug, preset });
}

export function allOff(): void {
  callService("script", "cc_all_off");
}

export function setNumber(entityId: string, value: number): void {
  callService("input_number", "set_value", { entity_id: entityId, value });
}

export function setBoolean(entityId: string, on: boolean): void {
  callService("input_boolean", on ? "turn_on" : "turn_off", { entity_id: entityId });
}

export function setOffset(slug: string, value: number): void {
  setNumber(roomEntities(slug).offset, clamp(value, -5, 5));
}

export function setModeTarget(mode: HouseMode, value: number): void {
  setNumber(modeTargetEntity(mode), clamp(value, mode === "Vacation" ? 45 : 55, mode === "Vacation" ? 90 : 85));
}

export function setHouseMode(mode: HouseMode): void {
  callService("input_select", "select_option", { entity_id: HOUSE.mode, option: mode });
}

export function setSeason(season: Season): void {
  callService("input_select", "select_option", { entity_id: HOUSE.season, option: season });
}

export function setFan(slug: string, fanMode: string): void {
  callService("climate", "set_fan_mode", { entity_id: roomEntities(slug).climate, fan_mode: fanMode });
}

export function runScene(entityId: string): void {
  callService("scene", "turn_on", { entity_id: entityId });
}
