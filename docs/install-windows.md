# Installing on Windows

> **Not tested on Windows yet.** The steps below follow what the tools need and
> how Windows handles USB and audio devices, but nobody has run them end to end on
> a Windows machine. If a step fails, open an issue with the output of
> `python tools\cli.py doctor`; that is usually enough to find the cause.

Everything here runs in **PowerShell** on Windows 10 (1703 or later) or Windows 11.
Do not use WSL: it cannot see USB devices such as the pedal without extra setup.

## 1. Install Python and Git

1. Install Python 3.9 or newer from <https://www.python.org/downloads/windows/>.
   On the first screen of the installer, tick **Add python.exe to PATH**.
2. Install Git for Windows from <https://git-scm.com/download/win>. Claude Code
   needs it too.
3. Open a new PowerShell window and check both:

   ```powershell
   py --version
   git --version
   ```

## 2. Get the project and its packages

```powershell
git clone https://github.com/basster6/anagram-tone-maker.git
cd anagram-tone-maker
py -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install hidapi numpy scipy sounddevice python-rtmidi
```

If `Activate.ps1` is refused with "running scripts is disabled on this system",
allow scripts you run yourself, then activate again:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
.venv\Scripts\Activate.ps1
```

The prompt starts with `(.venv)` while the environment is active. Activate it again
in every new PowerShell window before using the tools.

All of these packages ship ready-built for Windows, so nothing needs compiling.
`numpy scipy sounddevice` are only needed for measuring, `python-rtmidi` only for
switching presets over MIDI.

## 3. Connect the pedal

1. Connect the Anagram with a USB data cable and wait until it has booted.
2. **Quit Darkglass Suite**, including from the system tray. While it runs it holds
   the pedal's control interface and the tools cannot open it. Close any browser
   tab that connected to the pedal for the same reason.
3. The pedal needs no extra driver for control: Windows talks to it as a standard
   USB HID device.

## 4. Check everything with doctor

```powershell
python tools\cli.py doctor
```

`doctor` reads, it never writes to the pedal. It checks, in order:

| Section | What it checks |
|---|---|
| Python | version 3.9 or newer, and whether the virtual environment is active |
| Packages | hidapi, numpy, scipy, sounddevice, python-rtmidi, each with its version |
| Pedal control | Darkglass Suite not running, the pedal on USB, the control interface opens, firmware and preset count |
| Pedal audio | every audio device named Anagram, per Windows audio API, with its channel counts, and which one measuring will use |
| Skill files | the Claude Code and Codex entries, and whether `rig.yaml` exists yet |

Each line is `OK`, `INFO`, `WARN` or `FAIL`. A `FAIL` comes with an arrow line that
says what to do. `WARN` lines are optional features.

## 5. Start the assistant

Start Claude Code or Codex **in the project folder**, so the skill is found:

```powershell
claude      # Claude Code
codex       # Codex CLI
```

Install them from their own pages first: Claude Code needs a Claude Pro plan or
above, Codex CLI a ChatGPT Plus plan or above, or an OpenAI API key.

Then ask for a tone. `SKILL.md` writes its commands as `python3 tools/cli.py ...`;
on Windows the command is `python tools\cli.py ...` inside the activated
environment. The assistants usually adapt on their own; if one does not, tell it
once: "On this machine use `python`, not `python3`."

## Troubleshooting

**`pedal: not found on USB`.** Try another cable: many USB cables carry power only.
Check that the pedal appears in Device Manager under *Human Interface Devices*
while it is plugged in.

**`control interface: ... would not open`.** Something else holds the pedal: Darkglass
Suite (check the tray), a browser tab, or occasionally a vendor control panel that
polls HID devices. Close it and run `doctor` again.

**`measuring: no Anagram device with enough channels`.** Measuring sends its test
signals to the pedal's reamp input, which is **output 9** of its USB audio
interface, and records inputs 1 to 3. Windows lists the same device once per audio
API (MME, Windows DirectSound, Windows WASAPI, Windows WDM-KS), and the older APIs
often show only 2 channels. `doctor` prints them all; measuring uses the first one
with 9 outputs and 3 inputs. If none has, check the pedal's input and output
channel count in **Sound settings > More sound settings**, and whether Darkglass
provides a Windows audio driver for it. Pedal control works without any of this.

**`python` is not recognised.** Python was installed without *Add python.exe to
PATH*. Run the installer again, choose *Modify*, and tick it; or use `py` instead of
`python` before the environment is created.
