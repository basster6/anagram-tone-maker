# Anagram Tone Maker

A skill that lets an AI assistant design tones for the **Darkglass Anagram**, check
them against the real preset format, and play them on the pedal over USB.

Everything it knows about the device's blocks was read from the device itself, so
no parameter, range or enumeration in here is guessed.

## What is in it

```
SKILL.md                      what the assistant reads
rig.example.yaml              template for your rig
rig.yaml                      your own copy, kept out of git
reference/
  blocks-factory-catalog.md   stock blocks, on every Anagram
  blocks-factory.json         the same, for tools
  what-blocks-model.md        what each factory block emulates, plus every
                              cabinet, microphone and artist IR
  choosing-blocks.md          how to pick a chain for a given request
  blocks-user-catalog.md      blocks this device has on top (generated locally)
  blocks-user.json            the same, for tools
  rig-profile.md              how this player actually uses their pedal (generated)
  preset-format.md            the preset file format
  examples/                   real presets pulled off a device
tools/
  anagram.py                  USB protocol library
  cli.py                      command line
  validate.py                 preset validator
  analyze.py                  profiles how you use the pedal
  midi.py                     preset/scene/mode switching over USB MIDI
  market.py                   fetches descriptions for installed blocks
  build_reference.py          re-reads the catalogue from a device
```

## Setup

```sh
pip install hidapi          # the only dependency, and only for talking to the pedal
```

Then `cp rig.example.yaml rig.yaml` and fill it in. Designing and validating tones works with nothing plugged
in; `info`, `presets`, `get` and `audition` need the pedal attached.

> **Quit Darkglass Suite before using the device commands.** It holds the pedal's
> control interface exclusively, and so does a browser tab that has connected to it.

### Claude Code

Drop this folder into `.claude/skills/anagram-tone-maker/` in your project, or
`~/.claude/skills/` to have it everywhere. It is picked up by name.

### Codex / Cursor / other agents

Point the agent at `SKILL.md`. For Codex, reference it from `AGENTS.md`; for
Cursor, from a rule in `.cursor/rules/`. One line is enough:

```
For Darkglass Anagram tone requests, follow anagram-tone-maker/SKILL.md.
```

### Web chat (ChatGPT, Gemini, Claude.ai)

Upload `SKILL.md`, `reference/blocks-factory-catalog.md`,
`reference/what-blocks-model.md`, `reference/choosing-blocks.md` and
`reference/preset-format.md`.
That is the whole knowledge side — you get tone design and valid preset JSON, just
without the device commands. Paste the JSON into an editor or audition it from a
machine that has this folder.

## Using it

Ask in plain language:

> a warm fingerstyle tone for the Jazz Bass, light compression, no cab sim

The assistant reads your rig, picks blocks from the catalogue, writes the preset,
validates it, and offers to play it:

```sh
python3 tools/cli.py audition tone.json
```

Auditioning loads the tone into the pedal's live chain and saves nothing. When you
like it, write it into a slot:

```sh
python3 tools/cli.py save 17A tone.json
```

Slots run `01A` to `42C` — three per bank, 126 in all. Saving refuses to clobber an
occupied slot unless you pass `--force`.

### Commands

| | |
|---|---|
| `cli.py info` | firmware, plugin and preset counts |
| `cli.py blocks [category]` | list blocks |
| `cli.py block <uri>` | one block's full parameter spec |
| `cli.py presets` | stored presets, in the pedal's own order |
| `cli.py get <file>` | read one preset document |
| `cli.py validate <file>` | check a document, no device needed |
| `cli.py audition <file>` | play it on the pedal, saving nothing |
| `cli.py save <slot> <file>` | write into a slot, e.g. `save 17A tone.json` |
| `cli.py analyze` | profile what you own and how you use it |
| `cli.py market` | what the shop says about your installed blocks |
| `cli.py goto <slot>` | switch preset over MIDI |
| `cli.py mode <1\|2\|3>` | switch between stomp, scene and binding modes |
| `cli.py scene <1\|2\|3>` | switch scene |
| `cli.py tuner` / `cli.py tap` | toggle the tuner, tap tempo |
| `cli.py refresh-blocks` | re-read the catalogue after a firmware update |

## Privacy

`rig.yaml`, `blocks-user.*` and `rig-profile.md` describe you, your device and
your purchases, so they stay on your machine and out of git. What is meant to be
shared is the skill itself plus the factory tier, which is the same on every
Anagram.

## Credits and sources

The block catalogue — every parameter, range, default and enumeration — was read
from a device over USB, not transcribed, so it is accurate for firmware
v1.18.1.23 and refreshable with `cli.py refresh-blocks`.

`reference/what-blocks-model.md` says what each factory block *emulates*. The
device does not carry that information and Darkglass does not publish it, so it
comes from the community-maintained **Darkglass Anagram Block List** on the
TalkBass wiki — <https://www.talkbass.com/wiki/anagram-block-list/> — and the
per-block detail at
<https://anagramanswers.com/categories/anagram-block-reference.18/>. Thanks to
whoever keeps those up to date. Those attributions are community research, not
statements from Darkglass, and the file marks them as such.

The USB protocol was worked out by observing Darkglass Suite's own HID traffic
and the device's logs.

## Disclaimer

Not made by, affiliated with, or endorsed by Darkglass Electronics, Mod Audio, or
any of the manufacturers named in the reference files. Product names appear only
to describe what a block sounds like and belong to their respective owners.

This talks to a pedal plugged into your own machine and nothing else. It writes
presets, which replaces what is in the slot you name — back up anything you care
about from Darkglass Suite first.

## Licence

MIT. See [LICENSE](LICENSE).
