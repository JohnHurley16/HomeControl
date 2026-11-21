# Control Center

Serves the front end on port 8099 and runs the cc-core rules (room-sensor control and
pre-heat before arrival). Lights, wall buttons, presence and the basic thermostat are
Home Assistant automations; they keep working when this app is stopped.

## Options

| Option | Default | Meaning |
|---|---|---|
| `public_hass_url` | empty | Home Assistant's address as browsers reach it. Empty means the same host as the front end, port 8123. Set it if you use HTTPS or a different host name. |
| `outside_entity` | `weather.forecast_home` | Entity shown as "Outside". A weather entity or a temperature sensor. |
| `preheat_radius_mi` | `3` | Pre-heat starts when someone heading home is inside this radius. |
| `proximity_prefix` | `sensor.home_nearest` | Entity prefix of the Proximity integration. |
| `rules` | `true` | Turn off to serve the front end only. |

## Log

Every write cc-core makes is one log line with the reason in brackets.
