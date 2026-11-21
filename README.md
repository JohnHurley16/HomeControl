# Home Control Center

Software for the apartment's control center: ceiling lights and mini-splits in four rooms, a wall
tablet, two phones, wall buttons and room presence. Home Assistant on the Raspberry Pi 4 is the hub.
Everything here either runs inside it or talks to it.

| Part | What it is | Runs on |
|---|---|---|
| `firmware/` | ESPHome configs for the presence nodes and the mini-split bridges | ESP32 boards |
| `ha/packages/` | Helpers, the house thermostat, presence rules, scenes | Home Assistant |
| `ha/blueprints/` | One blueprint that maps a wall-button press to an action | Home Assistant |
| `web/` (cc-web) | The front end for the tablet and phones | Browser |
| `core/` (cc-core) | Two thermostat rules that need arithmetic: room-sensor control, pre-heat | The `cc` container |
| `app/` | The `cc` container: serves cc-web on port 8099 and runs cc-core | Home Assistant OS app |
| `hardware/enclosure/` | 3D-printable case for a presence node, with print files and its own README | Your printer |
| `hardware/tablet-mount/` | 3D-printable wall mount for the tablet: a flat back sheet and a snap-on frame, with the charging cable hidden in it | Your printer |

Lights, buttons, presence and the basic thermostat are Home Assistant automations. Nothing in this
repository sits between a wall button and a light: stop the `cc` container and they all still work.

## What was checked, and what was not

| Checked here | How |
|---|---|
| Firmware configs | `esphome config` (ESPHome 2026.10.2) on all eight room files, with the second radar and without it, plus the LD2412 and Midea variants. The eight room files again on ESPHome 2026.11.0. Not compiled, not flashed. |
| Home Assistant packages and blueprint | Loaded into a real Home Assistant 2026.2.3 with simulated lights, mini-splits and sensors: 16 end-to-end checks (first-run defaults, thermostat, offsets, modes, small setbacks, season lock, presets, buttons, occupancy, lights-off in dry run and for real, ease, auto Away and back, scenes, the second radar's helpers and simulated people). |
| cc-core | 18 unit tests, then 4 checks against that Home Assistant: the static server, the correction path, the Mitsubishi feed path (against a stand-in for the bridge's two actions) and pre-heat. |
| cc-web | 45 unit tests, then 16 checks in headless Chrome against that Home Assistant at tablet and phone sizes: token and sign-in paths as a non-admin user, every control changing the real entity, changes made elsewhere showing up live, the room map drawn from Home Assistant's readings (which arrive in inches in a US-units house), an offline device, sign-out, and the same build served from `/local/cc/`. |
| Presence node enclosure | 40 checks on the CAD model of the ported shell, 34 on the closed one, against simple models of the two boards: fit, the slide lock, clearances, what shows through the ports, overhangs, closed meshes. Not printed. The long bar for two radars: 53 checks, and 47 on its closed version, against a partly known model of the LD2450 (its socket and thickness are not published). Not printed, and no LD2450 has been tried in it. |
| Tablet wall mount | 62 checks on the CAD model against block models of the Galaxy Tab A11+, a right-angle plug and its cable: the tablet seated and sliding in, a camera ring on the back, every snap, pin and pry slot of the frame, the plug inside the frame, spring and snap force, overhangs, bed size, closed meshes. Not printed. |

Not checked: anything on real hardware. No radar, mini-split, LED controller or Zigbee remote has
run this code. The container image was not built here (the service was run with Node 22 directly,
the way the image starts it), and the Supervisor connection inside Home Assistant OS is written from
the developer documentation, not tested. Expect to fix small things at each first contact with a
device. The install order below puts the cheapest tests first.

## Install, in order

### 1. Home Assistant

Flash Home Assistant OS to the SSD with Raspberry Pi Imager, boot the Pi from it and finish
onboarding. Set the unit system to US customary so temperatures are in °F. Plug in the Zigbee
adapter and accept the Zigbee Home Automation (ZHA) integration it offers.

### 2. Packages and blueprint

Copy these into Home Assistant's config folder (the Samba or Studio Code Server app gets you there):

```
ha/packages/*.yaml               ->  /config/packages/
ha/blueprints/automation/cc/     ->  /config/blueprints/automation/cc/
```

Add to `/config/configuration.yaml`, then restart Home Assistant:

```yaml
homeassistant:
  packages: !include_dir_named packages
```

On the first start an automation sets every helper to its default (70/68/67/60 °F, rules on,
presence in dry run) and turns on `input_boolean.cc_initialized`. The thermostat does nothing until
that is on.

To try the whole system before any hardware exists, also copy `ha/dev/cc_fake_devices.yaml` into
`/config/packages/`. It creates simulated lights, mini-splits and sensors, and two simulated people
per room for the room map: one walks a slow loop, one sits still. Delete it when the first real room
is up.

Rooms with the second radar also get three numbers and a switch for the room map
(`input_number.<room>_map_width`, `_map_depth`, `_map_radar_x`, `input_boolean.<room>_map_mirror`).
They are set from the app, not here.

### 3. Rooms

A room is a Home Assistant area with the label `cc_room`.

1. Settings > Areas, labels & zones > Labels: create `cc_room`.
2. Make sure the four areas exist with these ids: `living_room`, `kitchen`, `bedroom`, `office`.
   The id comes from the name when the area is created ("Living Room" gives `living_room`).
3. Add the label to each.

### 4. Devices and their entity ids

The naming rule is the only contract between the parts. Each room needs these five entities:

| Entity | Comes from | How it gets the name |
|---|---|---|
| `light.<room>_ceiling` | GLEDOPTO controller (WLED integration) | Rename the entity id by hand |
| `climate.<room>` | Mini-split bridge (ESPHome) | Automatic: the firmware names the device after the room |
| `sensor.<room>_temperature`, `sensor.<room>_humidity` | Sonoff SNZB-02D (ZHA) | Name the device after the room when pairing, e.g. "Living room" |
| `binary_sensor.<room>_presence` | Presence node (ESPHome) | Automatic |

Check Developer tools > States for the five ids. Rename any that differ: open the entity, the gear
icon, Entity ID.

The room map reads six more from a node with the second radar, also named automatically:
`sensor.<room>_target_1_x` and `_target_1_y`, and the same for targets 2 and 3. The line above the
map reads the first radar's `sensor.<room>_detection_distance` and `binary_sensor.<room>_moving`.
A room without them simply has no map or no line.

### 5. Firmware

On Windows, follow [docs/flashing-windows.md](docs/flashing-windows.md) instead of the lines below.
It needs Python 3.13 and one path setting before the first build.

```
pip install esphome
cp firmware/secrets.example.yaml firmware/secrets.yaml     # Wi-Fi and one API key; git ignores it
esphome run firmware/rooms/living-room-occ.yaml            # USB the first time, over the air after
esphome run firmware/rooms/living-room-ac.yaml
```

`firmware/rooms/secrets.yaml` only forwards to that file, because ESPHome looks for secrets next to
the file it compiles.

- **Presence node** (`packages/presence-ld2410.yaml`): ESP32-C3 SuperMini and HLK-LD2410C. Radar
  TX to GPIO20, radar RX to GPIO21, 5 V and ground. The case is in `hardware/enclosure/`.
  - Tune it on the wall with the case closed. The radar splits distance into gates of 0.75 m. Set
    "Max move distance gate" and "Max still distance gate" to the depth of the room. Turn on
    "Engineering mode", leave the room, and read each gate's still energy on the device page. Set
    that gate's still threshold a little above what the empty room shows. Sit where you normally
    sit and confirm the energy climbs past it. Turn engineering mode off.
  - Then turn "Radar Bluetooth" off. The module's own Bluetooth setup accepts a default password,
    so anyone in range with Hi-Link's phone app could change its settings.
  - `rooms.json` has `"radar": "ld2410"`. Set it to `"ld2412"` and run `npm run generate` for the
    HLK-LD2412 instead (`packages/presence-ld2412.yaml`, which has a one-press empty-room
    calibration). Both give Home Assistant the same `binary_sensor.<room>_presence`.
- **Second radar, for the room map** (`packages/tracker-ld2450.yaml`): an HLK-LD2450 on the same
  node. It reports where up to three people are, and the app draws them. Radar TX to GPIO1, radar
  RX to GPIO0, its 5 V and ground to the first radar's VCC and GND pins. The long case and the
  wiring picture are in `hardware/enclosure/`.
  - It does not decide whether a room is occupied. It loses people who sit still and can report
    someone where a fan or a curtain moves, so the lights and the thermostat keep reading the first
    radar. The map is for looking at.
  - `rooms.json` has `"tracker": "ld2450"` for the whole house. For a room without one, add
    `"tracker": "none"` to that room's line and run `npm run generate`. A node flashed with the
    tracker in its firmware runs normally before the LD2450 is fitted; the map says the tracking
    radar is not reporting until it is.
  - Mount the bar upright, USB end down. The LD2450 tells left from right across its short side.
  - The device page shows "Tracker firmware". ESPHome needs V2.02.23090617 or newer on the radar;
    Hi-Link's HLKRadarTool phone app updates it over Bluetooth. Then turn "Tracker Bluetooth" off, for the same
    reason as the first radar's.
  - Positions go to Home Assistant at most twice a second, and only when someone moved 5 cm.
- **Mini-split bridge**: `rooms.json` has `"minisplit": "mitsubishi"` or `"midea"`. Change it and run
  `npm run generate` once you know the brand.
  - `mitsubishi`: CN105 port, ESP32-C3 by default (override `rx_pin` and `tx_pin` in the room file
    for another board). Uses the community component `echavet/MitsubishiCN105ESPHome`.
  - `midea`: SMLIGHT SLWF-01Pro dongle in the unit's USB port. Covers Midea-built brands (MRCOOL,
    Senville, Pioneer, Carrier ductless and others).
- Home Assistant finds each device on the network. Add it and paste the API key from `secrets.yaml`.

### 6. The app

`dist/cc/` is the app folder. The release zip has it already built. Git does not track it, so in a
clone build it first with `npm install && npm run package` (Node 22). Copy it to the Pi's local apps
folder (the Samba share named `local_apps`; `addons` on older installs). Then Settings > Apps > App store, open the menu at
the top right and choose Check for updates (Reload on older versions). "Control Center" appears
under Local apps. Install, start, and open `http://homeassistant.local:8099`. The app's options hold
the pre-heat radius and the entity shown as "Outside"; `DOCS.md` lists them.

**The room map.** A room whose node has the second radar shows a map in its Presence card: the
room from above, the sensor's wall along the top, a dot for each person the radar tracks. Until the
room has a size it shows the radar's own view instead, a 120 degree fan reaching 6 m. Open "Set the
room size to draw the room" under the map and set three things: the room's width along the sensor's
wall, its depth out from that wall, and how far the sensor is from the left wall as you stand facing
it. Then walk to the left. If the dot goes right, turn on "Swap left and right": the radar is the
other way up from what the map assumes. A hollow dot on the edge is a reading past a wall, which
means a doorway, a reflection, or a room size that is off. The line above the map
("Nearest person 8 ft from the sensor, still") is the first radar's reading and is there in every
room.

To rebuild after changing code: `npm install && npm run package`, copy `dist/cc/` again, and press
Rebuild on the app page. Outside Home Assistant OS, `app/docker-compose.yml` runs the same container.

### 7. Wall tablet

1. Settings > People > Users: add a user "Tablet", not an administrator, local network only.
2. Log in as that user in any browser. Profile > Security > Long-lived access tokens: create one.
3. On the tablet open `http://homeassistant.local:8099` and paste it under "Or paste a long-lived token".
4. In Fully Kiosk Browser set that address as the start URL, keep the screen on, and turn on
   motion wake if you want the screen to sleep.
5. The printed wall mount, a frame that snaps on around the tablet with the charging cable hidden in it, is in `hardware/tablet-mount/`.

### 8. Phones

1. Open `http://homeassistant.local:8099`, tap "Sign in with Home Assistant", log in as yourself.
   The phone stays signed in.
2. Share > Add to Home Screen. It opens full screen like an app.
3. Install the Home Assistant companion app and allow location. That gives each person a device
   tracker, which auto Away and pre-heat need.
4. Settings > Devices & services > Add integration > Proximity: zone Home, track both people. That
   creates `sensor.home_nearest_distance` and `sensor.home_nearest_direction_of_travel` for pre-heat.

Pre-heat acts at the moment someone starts heading home inside the radius (3 miles by default), not
while they are home. So pressing Away at the door, with your phone still in the house, sticks.

Away from home the address above is unreachable. Two ways to fix that: the Tailscale app on the Pi
and on both phones (free), or Home Assistant Cloud. Cloud only exposes Home Assistant itself, so
with it copy `dist/cc/web/` to `/config/www/cc/` and use `https://<your-cloud-address>/local/cc/index.html`.

### 9. Wall buttons

Pair each Sonoff remote in ZHA. Then Settings > Automations & scenes > Blueprints > "CC: button
action" > Create automation, once per key and gesture: pick the remote's trigger ("first button
pressed"), what it does, and the room slug. A room remote takes six: lights on, hold to brighten,
lights off, hold to dim, warmer, cooler. The entry remote takes Home and Away; the bedside one takes
Goodnight and Night light.

### 10. Presence: dry run first

Presence rules start in dry run. They write what they would have done to the logbook (filter on
"CC presence") and change nothing. Leave it a week. When no entry is wrong, turn Dry run off on the
System screen. Lights never turn on by themselves unless you enable "Lights on when you walk in" for
a room. Auto Away leaves Home or Sleep once both phones are out and every room has been empty for
20 minutes, and returns to Home when a phone arrives.

## Changing things

- **Scenes**: edit `ha/packages/cc_scenes.yaml`, or make scenes in Home Assistant. The Scenes screen
  lists every scene; the Home screen shows the four defaults.
- **Light presets**: `sensor.cc_light_presets` in `tools/generate.mjs`. The scripts, the buttons and
  the front end all read that one list.
- **Kelvin**: `strip_kelvin` in `rooms.json` is the range printed on your LED strip (2700 to 6500).
  The screens and presets use it. Home Assistant's WLED integration reports every CCT strip as
  2000 to 6535, where 2000 means warm LEDs only, so the preset script and the front end convert:
  2700 K on the tablet is warm LEDs only. A scene is a fixed snapshot, so `cc_scenes.yaml` holds
  already-converted numbers; the table at the top of that file gives the pairs.
- **Timings** (45 minutes to ease a room, 20 to auto Away, the 2-minute occupancy hold): in
  `tools/generate.mjs`. Minutes before lights-off is per room, on the Room screen.
- **A fifth room**: add it to `rooms.json`, `npm run generate`, copy the new `cc_room_<slug>.yaml`
  and the regenerated `cc_house.yaml`, restart Home Assistant, label the area, flash its two nodes.
  The front end and cc-core read rooms from the labelled areas, so neither needs a rebuild.

## How the thermostat is put together

```
input_number.target_<mode>   --+
input_select.house_mode      --+--> sensor.cc_mode_target
                                          |  + input_number.<room>_offset
                                          |  + input_number.<room>_empty_adjust     (presence rule)
                                          v
                                   sensor.<room>_target        shown in the front end
                                          |  + input_number.<room>_sensor_correction (cc-core)
                                          v
                                   sensor.<room>_setpoint  -->  climate.<room>
```

One automation per room copies the setpoint to the unit. It is the only writer of a unit's
temperature. cc-core never writes a `climate` entity: for Mitsubishi units it feeds the room
sensor's reading to the bridge, for other brands it writes the correction helper. "Small setbacks"
holds Sleep and Away within 3 °F of Home inside `sensor.cc_mode_target`; the stored targets are
never rewritten.

## Development

```
npm install
npm run dev          # front end on http://localhost:5173 ; add ?demo for a simulated house
npm test             # cc-core and cc-web unit tests
npm run typecheck
npm run generate     # rooms.json -> firmware room files and Home Assistant packages
npm run package      # builds everything into dist/cc/
```

To run cc-core against your Home Assistant from a laptop:

```
HASS_URL=http://homeassistant.local:8123 HASS_TOKEN=<long-lived token> CC_WEB_DIR=web/dist node core/dist/cc.mjs
```

Every write cc-core makes is one log line with its reason.
