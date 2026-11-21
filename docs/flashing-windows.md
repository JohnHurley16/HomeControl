# Flashing the ESP32 boards on Windows

How to put this project's firmware on the ESP32-C3 presence nodes from a Windows 10 or 11 laptop.
Written on 21 November 2026 for ESPHome 2026.11.0. "How this guide was checked", at the end, says
what has been tried and what has not.

## What you are about to do

Each ESP32 board is a tiny computer with nothing useful on it yet. **Flashing** means copying a
program, called firmware, onto it through the USB cable. The firmware here is built by **ESPHome**,
a free tool that turns this project's settings files into a program for the board.

Once a board has its firmware it joins your Wi-Fi on its own and never needs the cable again. Later
updates go over Wi-Fi.

Steps 1 to 4 set up the laptop and are done once. Steps 5 to 7 are done once per board.

| Topic | What to expect |
|---|---|
| Time | The first board takes the longest, because ESPHome downloads its build tools once. Allow up to an hour, most of it waiting. Not timed on Windows. Each later board skips the download. |
| Disk space | About 5 GB free for the build tools. This is a rough figure. |
| Radars | Not needed yet. The boards run without them. |

**Have ready**

- A laptop with Windows 10 or 11.
- The ESP32-C3 boards and a USB-C cable that carries data. Many charging cables do not.
- Git for Windows, to fetch this repository.
- Your Wi-Fi name and password. The boards only use 2.4 GHz Wi-Fi.

**Where commands go.** Every command in this guide is typed into a terminal. Right-click the Start
button and choose **Terminal** (on Windows 10 it is called **Windows PowerShell**). Paste or type
one line, press Enter, and wait for it to finish before the next.

## Step 1: Install Python 3.13

ESPHome is written in Python, so Python goes on first. Use version **3.13**, even if you already
have a different one. Python 3.15 came out in October 2026, and five of the parts ESPHome depends
on have no ready-made Windows builds for it yet, so the install in Step 2 fails there with compiler
errors. Python versions sit side by side without disturbing each other.

1. Check whether you already have it. In the terminal:

   ```
   py -3.13 --version
   ```

   If it prints `Python 3.13` and one more number, skip to Step 2.
2. If not, open the **Microsoft Store**, search for **Python Install Manager**, and install it. It
   is the Python team's own installer for Windows.
3. Close the terminal, open a new one, and install Python 3.13:

   ```
   pymanager install 3.13
   ```

   If it asks setup questions, accept what it suggests.
4. Run the check from step 1 again. It should now print the version.

Every Python command in this guide starts with `py -3.13`. That picks version 3.13 whichever other
versions are installed.

## Step 2: Install ESPHome

1. Give ESPHome a short folder for its build tools:

   ```
   mkdir C:\ESPHome
   setx ESPHOME_ESP_IDF_PREFIX C:\ESPHome\idf
   ```

   The second line answers `SUCCESS: Specified value was saved.`

   Why this matters: Windows limits a file's full path to 260 characters, and the tools ESPHome
   downloads sit about 245 characters deep inside their folder. In the default place, under your
   user folder, they run past the limit and the build fails with errors that do not mention paths
   at all.
2. Close the terminal and open a new one. The setting only reaches terminals opened after it was
   made.
3. Install ESPHome:

   ```
   py -3.13 -m pip install esphome
   ```

   It prints many lines and takes a few minutes.
4. Check it:

   ```
   py -3.13 -m esphome version
   ```

   It should print `Version: 2026.11.0` or newer.

Every ESPHome command in this guide starts with `py -3.13 -m esphome`. That form works whether or
not Windows can find the `esphome` command by itself.

## Step 3: Get the project

1. Clone this repository into a short folder name, close to the top of the drive, for the same
   path-length reason as in Step 2:

   ```
   git clone https://github.com/JohnHurley16/HomeControl C:\home-control
   ```

2. Go into it:

   ```
   cd C:\home-control
   ```

   Every later command assumes the terminal is in this folder. Whenever you open a new terminal,
   run this line first. If you cloned somewhere else, use that folder instead.

The part that matters today is the `firmware` folder. Inside it, `firmware\rooms` holds one small
settings file per board, such as `living-room-occ.yaml`. The `occ` stands for occupancy: these are
the presence nodes. You do not need to open or edit those files.

## Step 4: Fill in your Wi-Fi details

The firmware needs four private values. They live in one file, `firmware\secrets.yaml`, which stays
on your laptop and is shared by every board, so you do this once. Git ignores that file.

1. Make your copy of the template:

   ```
   copy firmware\secrets.example.yaml firmware\secrets.yaml
   ```

2. Make a key:

   ```
   py -3.13 -c "import secrets,base64;print(base64.b64encode(secrets.token_bytes(32)).decode())"
   ```

   It prints one line of 44 characters ending in `=`. Select that line with the mouse and press
   Ctrl+C to copy it.
3. Open your copy in Notepad:

   ```
   notepad firmware\secrets.yaml
   ```

4. On each line, replace the text between the quotes and keep the quotes. Then save with Ctrl+S
   and close Notepad.

| Line | What goes between the quotes |
|---|---|
| `wifi_ssid` | Your Wi-Fi network's name, exactly as your phone shows it. Capital letters and spaces count. |
| `wifi_password` | Your Wi-Fi password. |
| `fallback_password` | A password you make up, 8 characters or more. It protects the hotspot a board opens when it cannot reach your Wi-Fi. |
| `api_key` | The key from step 2. Home Assistant asks for it when you add each board. |

Good to know:

- The boards only use 2.4 GHz Wi-Fi. Most routers send 2.4 and 5 GHz under one name, and that works
  as it is. If yours has two names, use the 2.4 GHz one.
- If a password contains a double quote or a backslash, put single quotes around it instead of
  double quotes.
- Leave the lines that start with `#` alone. They are notes.

## Step 5: Plug in the board

1. Plug one ESP32-C3 into the laptop with the USB-C cable. Do one board at a time, so there is only
   one to choose from later.
2. A brand-new board usually makes Windows play its connect and disconnect sounds over and over,
   about once a second. That is normal. The board has no program yet, so it restarts in a loop. Put
   it in **download mode** to stop the loop:
   - Find the two tiny buttons on the board, labelled **BOOT** and **RST** in very small print.
     With the buttons facing up and the USB socket pointing away from you, BOOT is usually the left
     one.
   - Hold **BOOT**. While holding it, press and release **RST**. Then let go of **BOOT**.
   - Another way to the same place: unplug the board, hold **BOOT**, plug it in, then let go.

   The sounds stop and the board stays connected. It now waits for firmware for as long as it has
   power.
3. Check that Windows sees it. Right-click the Start button, choose **Device Manager**, and open
   **Ports (COM & LPT)**. There should be a line like **USB Serial Device (COM5)**. The number
   varies, and you do not need to remember it.

Windows 10 and 11 need no driver for this board. A second entry named **USB JTAG/serial debug
unit** may show up elsewhere in the list, sometimes with a warning icon. Flashing does not use it,
so ignore it.

If no COM line appears, suspect the cable first. Try one you know carries data, then a different
USB port.

## Step 6: Build the firmware and flash it

1. With the terminal in `C:\home-control`, run:

   ```
   py -3.13 -m esphome run firmware\rooms\living-room-occ.yaml
   ```

   This one command checks the settings, builds the firmware and sends it to the board.
2. Wait. On the first run ESPHome downloads its build tools, with lines such as
   `Downloading ESP-IDF 5.5.6 framework ...`, and then compiles. This is the long wait from the
   table at the top, and the screen can sit still for minutes at a time. If Windows asks whether
   Python may use the network, allow it on private networks.
3. When the build is done it prints `Successfully compiled program.` and asks where to send it:

   ```
   Found multiple options for uploading, please choose one:
     [1] COM5 (USB Serial Device (COM5))
     [2] Over The Air (occ-living-room.local)
   (number):
   ```

   Type the number of the **COM** line and press Enter.
4. A percentage counts up to 100, and then it prints `Successfully uploaded program.`
5. Press **RST** on the board once. The flashing tool says it has reset the board, but a board that
   was put in download mode by hand usually stays there until you press the button.
6. The board starts its new firmware and joins your Wi-Fi within about half a minute.

One line at the end looks like a problem and is not:
`UART logging is disabled (baud_rate=0). Not starting UART logs.` This firmware keeps the board's
serial pins for the radar, so its log travels over Wi-Fi instead. Step 7 shows how to read it.

A caution: this firmware has passed ESPHome's settings check on version 2026.11.0, but it has never
been through a full build. The first build may stop with an error. The last 20 lines of the output
are the ones that say why.

## Step 7: Check the board, then add it to Home Assistant

1. Leave the board plugged in so it has power, and read its log over Wi-Fi:

   ```
   py -3.13 -m esphome logs firmware\rooms\living-room-occ.yaml
   ```

   If it asks, choose **Over The Air**. A working board answers with
   `Successfully connected to occ-living-room` and then a stream of lines about its Wi-Fi and
   sensors. With no radar wired yet, the radar readings stay empty. Press Ctrl+C to stop watching.
2. If it cannot find the board, wait two minutes and look at the Wi-Fi networks on your phone. A
   board that cannot join your Wi-Fi opens its own hotspot after about 90 seconds, named
   `occ-living-room setup`. Join it with your `fallback_password`, and a page opens where you pick
   your network and type its password. If no page opens, go to `192.168.4.1` in the phone's
   browser. That fixes this board. Correct `secrets.yaml` as well, so the next boards get it right.
3. Add the board to Home Assistant. This can wait until Home Assistant is running on the Pi. The
   board keeps working in the meantime.
   - In Home Assistant, open **Settings > Devices & services**.
   - The board shows up under **Discovered** as an ESPHome device. Choose **Add**. Older versions
     say **Configure**.
   - When it asks for the encryption key, paste the `api_key` from `secrets.yaml`.
   - Pick the room it lives in.

## Step 8: Flash the other boards

Each board gets its own room file. Repeat Step 5 and Step 6 with the next board, changing only the
file name in the command.

| Room | File in `firmware\rooms` | Name on your network |
|---|---|---|
| Living room | `living-room-occ.yaml` | `occ-living-room` |
| Kitchen | `kitchen-occ.yaml` | `occ-kitchen` |
| Bedroom | `bedroom-occ.yaml` | `occ-bedroom` |
| Office | `office-occ.yaml` | `occ-office` |

For example, the kitchen board:

```
py -3.13 -m esphome run firmware\rooms\kitchen-occ.yaml
```

- Label each board as soon as it is flashed. They look identical, and each one now belongs to one
  room.
- Each room's first build compiles from the start, so it still takes a while. Nothing is downloaded
  again.
- A fifth board has no file yet, because `rooms.json` has four rooms. The README's "A fifth room"
  says how to add one.
- Later updates need no cable and no buttons. Run the same command with the board powered anywhere
  in the house, and choose **Over The Air**.
- The files ending in `-ac` are for the mini-split bridges, later. They fetch a component from
  GitHub while building, so Git has to be installed.

## If something goes wrong

| What you see | What to do |
|---|---|
| Windows keeps playing its connect and disconnect sounds | Normal for a board with no firmware. Put it in download mode (Step 5). |
| `py` or `pymanager` is not recognized | The Python Install Manager is missing, or the terminal was open before you installed it. Do Step 1, then open a new terminal. |
| `py -3.13` cannot find that version | Run `pymanager install 3.13`. |
| `pip` ends in red errors that mention Microsoft Visual C++ or building a wheel | The command ran on a Python other than 3.13. Start it with `py -3.13`. |
| `No module named esphome` | The command ran on a Python that does not have ESPHome. Start it with `py -3.13`. If it already does, run the install in Step 2 again. |
| `Error reading file` with `secrets.yaml` in it | The copy in Step 4 was missed, or the terminal is not in `C:\home-control`. |
| `Invalid key format, please check it's using base64` | The `api_key` line still holds the placeholder, or lost a character. Make a new key (Step 4). |
| `WPA password must be at least 8 characters long` | A password in `secrets.yaml` is too short. It is usually `fallback_password`. |
| `ESP-IDF tools path is too long`, `bits/c++config.h: No such file or directory`, or `cannot execute 'as'` | The setting from Step 2 did not take, or the tools were downloaded before you made it. Run the `setx` line again and open a new terminal. Paste `%LOCALAPPDATA%\esphome\Cache` into File Explorer's address bar and delete the `idf` folder there if you see one. Then build again. |
| The upload list has no COM line, or it skips the question and fails to reach `occ-living-room.local` | Windows does not see the board. Go through Step 5 again: cable, USB port, download mode. |
| `Failed to connect to ESP32-C3: No serial data received.` | Put the board in download mode (Step 5) and run the command again. |
| `Could not open COM5, the port is busy or doesn't exist.` | Another program is holding the port, or the board dropped off. Close any serial monitor, Arduino IDE or browser flashing page. Unplug the board, plug it back in, put it in download mode, and try again. |
| Uploaded, but the board never joins Wi-Fi | Press **RST** once. If that changes nothing, use the hotspot in Step 7 and check the name and password you typed. |
| `logs` cannot find the board, yet your router shows it | Put the laptop on the same Wi-Fi as the board, not a guest network, and turn off any VPN. Failing that, add the board's address from the router's list to the end of the command: `--device 192.168.1.50`. |
| Home Assistant never shows it under Discovered | Choose **Add integration**, pick **ESPHome**, and enter host `occ-living-room.local` and port 6053. |
| The build stops with a long error | Read the last 20 lines. A fix belongs in `firmware\packages\*.yaml` or `tools\generate.mjs`, not in the generated room files. |

## Words used here

- **Firmware**: the program that runs on the board.
- **Flash**: to copy firmware onto the board's storage.
- **ESPHome**: the tool that turns a settings file into firmware and flashes it.
- **YAML**: the plain-text format of ESPHome's settings files. Their names end in `.yaml`.
- **Terminal**: the window where you type commands.
- **COM port**: Windows' name for a serial connection over USB, such as COM5.
- **Download mode**: the state in which the board waits to receive firmware instead of running any.
- **BOOT and RST**: the two buttons on the board. RST restarts it. BOOT held down during a restart
  means "wait for firmware".
- **OTA**: over the air. Updating a board over Wi-Fi, with no cable.
- **API key**: the secret that lets Home Assistant and the board talk privately.
- **Fallback hotspot**: the Wi-Fi network a board opens by itself when it cannot reach yours.

## How this guide was checked

The commands, file names and quoted messages come from ESPHome 2026.11.0 itself, installed on
Linux, where the room files pass its settings check (`esphome config`). The Python advice comes
from comparing ESPHome's dependency list with the Windows builds on PyPI on 21 November 2026.

Not checked: a run on a Windows laptop, and a full firmware build.

## Sources

- [Installing ESPHome manually](https://esphome.io/guides/installing_esphome/), ESPHome
- ESPHome 2026.11.0 source code: `esphome/espidf/framework.py` for the Windows path limit and
  `ESPHOME_ESP_IDF_PREFIX`, and `esphome/__main__.py` for the upload and log messages
- [Share the Windows ESP-IDF toolchain at C:\esphb\idf to fit MAX_PATH](https://github.com/esphome/device-builder/pull/2281),
  ESPHome Device Builder pull request
- [Using Python on Windows](https://docs.python.org/3/using/windows.html), Python documentation
- [Python install manager](https://www.python.org/downloads/latest/pymanager/), python.org
- [Python 3.15.0 (final) is here!](https://discuss.python.org/t/python-3-15-0-final-is-here/109415),
  Python discussion forum
- PyPI file lists for ruamel.yaml.clib 0.2.15, PyYAML 6.0.3, inflate64 1.0.4, pybcj 1.0.8 and
  pyppmd 1.3.1: Windows builds stop at Python 3.14
- [Establish Serial Connection with ESP32-C3](https://docs.espressif.com/projects/esp-idf/en/v5.2.8/esp32c3/get-started/establish-serial-connection.html),
  Espressif
- [Cannot connect ESP32-C3 Super Mini to Windows 11 desktop](https://community.home-assistant.io/t/cannot-connect-esp32-c3-super-mini-to-windows-11-desktop/965850),
  Home Assistant community
- [ESP32-C3 repeatedly disconnecting from USB](https://esp32.com/viewtopic.php?p=154833), ESP32
  forum
- [Getting Started with the ESP32-C3 Super Mini](https://randomnerdtutorials.com/getting-started-esp32-c3-super-mini),
  Random Nerd Tutorials
