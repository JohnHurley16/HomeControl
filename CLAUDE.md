# Home Control Center: hand-off notes

`README.md` describes the whole project and the order to install it in. This file is the short
version for picking the work up: where it stands, what comes next, and the traps already found.
Keep it current as things change.

## Where things stand (21 November 2026, version 0.1.7)

Nothing in this repository has run on real hardware yet. The README's "What was checked, and what
was not" lists what has been tested in software.

**Next task: flash the first presence node from a Windows laptop.** Follow
`docs/flashing-windows.md`.

- The ESP32-C3 SuperMini boards have arrived. The radars (HLK-LD2410C and HLK-LD2450) have not.
  The firmware runs without them.
- The firmware has passed `esphome config` on ESPHome 2026.10.2 and 2026.11.0. It has never been
  compiled, so expect the first `esphome run` to find something.
- The Windows guide was written from ESPHome 2026.11.0's source code on Linux. No step of it has
  been run on Windows. When a step turns out wrong, fix the guide.

## Traps already found

- **Python 3.13 on Windows, not 3.15.** ESPHome 2026.11.0 pins ruamel.yaml.clib 0.2.15,
  PyYAML 6.0.3 and, through py7zr, inflate64 1.0.4, pybcj 1.0.8 and pyppmd 1.3.1. None of them had
  a Windows wheel for Python 3.15 on 21 November 2026, so `pip install esphome` needs a C compiler
  there. Python 3.14 also has every wheel. 3.13 is what these configs were checked with.
- **Short paths.** ESPHome's ESP-IDF tools sit about 245 characters below their folder, and Windows
  stops at 260 unless long paths are enabled. Set `ESPHOME_ESP_IDF_PREFIX=C:\ESPHome\idf` before
  the first build and keep the clone near the top of the drive. The symptoms do not mention paths:
  `bits/c++config.h: No such file or directory`, `cannot execute 'as'`.
- **Download mode.** A blank SuperMini connects and disconnects about once a second until it is in
  download mode: hold BOOT, tap RST, release BOOT. After a flash from download mode, press RST
  once to start the firmware.
- **No log over USB.** `logger: baud_rate: 0` in `firmware/packages/base.yaml` leaves the serial
  pins to the radar. Read the log over Wi-Fi with `esphome logs`.
- **First build is slow and large.** ESPHome 2026.11 builds ESP32 targets with its own ESP-IDF
  5.5.6 toolchain, downloaded on the first build. Budget about 5 GB of disk; that figure is rough.
- **Mini-split room files need Git.** The `*-ac.yaml` files fetch a component from GitHub while
  building.

## Rules for changes

- `rooms.json` is the source for the rooms and the device choices. `npm run generate` writes
  `firmware/rooms/*.yaml`, `ha/packages/cc_house.yaml`, `ha/packages/cc_room_*.yaml` and
  `ha/dev/cc_fake_devices.yaml`. Do not edit those by hand. Change `tools/generate.mjs` or the
  shared `firmware/packages/*.yaml`, then regenerate.
- `firmware/secrets.yaml` holds the Wi-Fi password and the API key. Git ignores it. Never commit
  it and never print its contents. `firmware/rooms/secrets.yaml` only forwards to it and is safe.
- Before a commit: `npm test` (18 cc-core and 45 cc-web tests), `npm run typecheck`, and
  `npm run generate` leaves no diff.
- The cases are CadQuery 2.x scripts in `hardware/`. `python enclosure.py` rebuilds
  `hardware/enclosure/print/`. `python check.py ports`, `closed`, `duo` and `duo-closed` report
  40, 34, 53 and 47 passing checks. The tablet mount's `python check.py` reports 62.
- Parts are printed on a Bambu Lab P1S. No TPU.
- Text files are stored with LF line endings (`.gitattributes`), on Windows too.

## Commands

```
npm install
npm test             # cc-core and cc-web unit tests
npm run typecheck
npm run generate     # rooms.json -> firmware room files and Home Assistant packages
npm run dev          # front end on http://localhost:5173 ; add ?demo for a simulated house
npm run package      # builds everything into dist/cc/
```

Developed with Node 22. Firmware commands are in the README (section 5) and, for Windows, in
`docs/flashing-windows.md`.

## Presence node hardware

One ESP32-C3 SuperMini per room, named `occ-<room>` on the network.

| Part | Connection |
|---|---|
| HLK-LD2410C, decides whether the room is occupied | Radar TX to GPIO20, radar RX to GPIO21, 5 V, ground |
| HLK-LD2450, positions for the room map only | Radar TX to GPIO1, radar RX to GPIO0, 256000 baud. Its 5 V and ground go to the LD2410C's VCC and GND pins. |

The bar mounts upright, USB end down. The LD2450 needs radar firmware V2.02.23090617 or newer.
`hardware/enclosure/README.md` has the wiring pictures and the case details.

## Open items

- **ESP32-C3 fit in the case.** In the model the board is trapped but loose: 0.30 mm of play each
  side, and the antenna end can rock 0.84 mm toward the front with a 1.0 mm board (0.21 mm with a
  1.6 mm board). The rails assume 1.6 mm: `rail_top = p.c3_top_z - 1.6 - 0.2` in
  `hardware/enclosure/enclosure.py`. Measure a real board, add a thickness parameter, and re-run
  all four checks.
- **LD2450 unknowns until one arrives.** Its socket type and direction (side entry assumed), its
  board thickness (1.2 mm assumed) and which end carries the antennas. The long bar is a first
  fit-test version for that reason.
- **Radar through plastic.** The closed shells put 0.8 mm of plastic 2 mm in front of the radar.
  Range through it is untested, and so are two 24 GHz radars side by side in one bar.
- **Long bar lock.** All three hook pairs reach their stops at the same travel. If the slide is
  stiff, start the upper two stop blocks 0.3 to 0.4 mm later.
- **Fifth presence node.** Five boards were bought and `rooms.json` has four rooms. The README's
  "A fifth room" says how to add one.
- **README flashing commands.** Section 5 of the README still shows the plain `pip install esphome`
  form, which suits Linux and macOS. Windows users are pointed to the guide.

## Documents that are not in this repository

The presence node build guide, the software design, the parts list with prices and the 3D viewer of
the case are private claude.ai artifacts in the owner's account.
