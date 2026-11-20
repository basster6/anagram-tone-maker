# Anagram Tone Maker

A skill that lets an AI assistant design tones for the **Darkglass Anagram**, check
them against the real preset format, and play them on the pedal over USB.

Everything it knows about the device's blocks was read from the device itself, so
no parameter, range or enumeration in here is guessed.

## What you need

- A **Darkglass Anagram** and a USB cable. Saving and deleting presets is allowed on
  firmware 1.18 and 1.19; other versions can read and audition only. Without a
  pedal you can still design and validate presets.
- **Python 3** and `pip install hidapi`. Measuring tones through the pedal also needs
  `numpy scipy sounddevice`.
- An agent that reads skills:
  - **Claude Code**, included with Claude Pro and above.
  - **Codex CLI**, included with ChatGPT Plus and above, or run with an OpenAI API key.

  Measuring and refining a tone takes many steps, so the entry plans can reach their
  usage limits within a long session.
- **Darkglass Suite quit** while you work: it holds the pedal exclusively.

| Platform | Pedal control | Measuring |
|---|---|---|
| macOS | tested | tested; reamp routing is set in Audio MIDI Setup |
| Linux | tested on Pop!_OS 24.04 | not tested; routing steps not written yet |
| Windows | not tested | not tested |

If something does not work on yours, an issue with the error output is very welcome.

## Quick start

```sh
git clone https://github.com/basster6/anagram-tone-maker.git
cd anagram-tone-maker
python3 -m venv .venv && . .venv/bin/activate
pip install hidapi numpy scipy sounddevice
```

Then start `claude` or `codex` in that folder and ask for a tone, for example
"a warm Motown tone with a verse and a chorus scene". Both pick up the skill from
the repository (`.claude/skills/` and `.agents/skills/`). On the first run the
assistant reads your blocks and presets off the pedal and asks a few questions
about your rig before it designs anything.

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
  onboarding.md               the first-run interview, with its question set
  measuring-tone.md           measuring a tone through the pedal's reamp input
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
  setup_rig.py                infers your rig from the presets on the pedal
  measure.py                  frequency response, distortion, dynamics, effects
  studio.py, studio.html      the local studio page and its server
  analyze.py                  profiles how you use the pedal
  midi.py                     preset/scene/mode switching over USB MIDI
  market.py                   optional: fetches block descriptions from the marketplace
  tonelab.py                  optional: community detail on shop blocks (anagramblocks.com)
  build_reference.py          re-reads the catalogue from a device
  build_web.py                copies the reference material into web/data
  serve_web.py                serves web/ and relays AI calls for hosts without CORS
.claude/skills/, .agents/skills/
                              entry points that point Claude Code and Codex at SKILL.md
web/
  index.html                  the browser app (experimental, see below)
  js/, css/, data/            its code and bundled reference
  test/                       node tests (validator, USB framing, DSP, AI layer)
```

## Setup

```sh
pip install hidapi                      # talking to the pedal
pip install numpy scipy sounddevice     # optional: measuring tones through it
```

Then just ask the assistant for a tone. On the first run it notices `rig.yaml` is
missing, reads your blocks and presets off the pedal, works out what it can about
your rig, and asks you the rest as multiple-choice questions — so the file gets
written for you. If you would rather do it by hand, `cp rig.example.yaml rig.yaml`
and fill it in.

Designing and validating tones works with nothing plugged in; `info`, `presets`,
`get` and `audition` need the pedal attached.

> **Quit Darkglass Suite before using the device commands.** It holds the pedal's
> control interface exclusively, and so does a browser tab that has connected to it.

### Claude Code and Codex

Run them from this folder and the skill is found on its own: Claude Code reads
`.claude/skills/`, Codex reads `.agents/skills/`. Both entries point at `SKILL.md`
at the root. In Codex you can also call it directly with `$anagram-tone-maker`.

To use it from another project, copy or link this folder to
`~/.claude/skills/anagram-tone-maker/` (Claude Code) or
`~/.agents/skills/anagram-tone-maker/` (Codex).

### Cursor and other agents

Point the agent at `SKILL.md`, for Cursor from a rule in `.cursor/rules/`. One line
is enough:

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

## The studio

With the pedal plugged in, `python3 tools/cli.py studio` opens a local page at
<http://localhost:8765>. Measure a preset and see its real frequency response,
distortion and dynamics; record yourself and reamp that same take through other
presets to compare them; and leave notes for the assistant, which reads them,
changes the tone, measures again and answers on the page. Nothing leaves your
machine.

Every reamp of a recording is grouped under it in **Compare takes**: one play
button for all versions, switched with `1`–`9` while it plays, level-matched so
the louder preset doesn't win by default. The page is in English and Korean.

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
occupied slot unless you pass `--force`, and whatever a slot held before it is
replaced or deleted is kept in `backups/` first. Writes are refused on a firmware
line other than 1.18 or 1.19 unless you pass `--any-firmware`.

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
| `cli.py setup` | first run: infer your rig and draft `rig.yaml` |
| `cli.py studio` | local page to measure, record, listen and talk to the assistant |
| `cli.py measure` | measure the current preset: EQ curve, distortion, dynamics, noise |
| `cli.py compare a b` | what changed between two measurements |
| `cli.py capture <s>` | record yourself playing, dry and wet |
| `cli.py reamp <wav>` | send a dry take through a preset and analyse the result |
| `cli.py analyze` | profile what you own and how you use it |
| `cli.py market` | optional: what the shop says about your installed blocks; `--all` searches the whole shop |
| `cli.py goto <slot>` | switch preset over MIDI |
| `cli.py mode <1\|2\|3>` | switch between stomp, scene and binding modes |
| `cli.py scene <1\|2\|3>` | switch scene |
| `cli.py tuner` / `cli.py tap` | toggle the tuner, tap tempo |
| `cli.py refresh-blocks` | re-read the catalogue after a firmware update |

## The browser app (experimental)

**Not ready for everyday use yet.** The page runs end to end, but its workflow,
layout and wording are still changing, and it is tested on macOS with Chrome only.
Use the skill with Claude Code or Codex for real work.

`web/` does what the skill does without Python, a terminal or an AI agent: open
it in **Chrome or Edge** from a web address, plug the pedal in, press **Connect**,
and talk to the assistant in the page. Any static host works, or locally:

```sh
python3 tools/serve_web.py   # then open http://localhost:8080
```

Opening `index.html` straight from disk (`file://`) is not enough: Chrome keeps no
permissions for such a page and hides the audio devices' names and ids, so the
page cannot send audio to the pedal and measuring fails.

- **The assistant** runs on your own API key, entered under Setup: Gemini (free
  key from Google AI Studio), OpenAI, Anthropic or Qwen Cloud. **Add provider**
  registers any other endpoint that speaks the OpenAI Chat Completions or the
  Anthropic Messages API, such as a local Ollama or LM Studio server (no key needed).
  A server that does not allow calls from a browser (CORS), such as the Qwen Token
  Plan address, is reached through `tools/serve_web.py`: when a direct call
  fails, the page retries it through that server. The key stays in this browser and goes only to that
  provider. Web research needs a key that includes search; Gemini's free tier, Qwen
  and custom endpoints fall back to the optional Tavily key.
- **Without an API key**, use the chat assistant you already have: upload the files
  listed under "Web chat" below, copy a preset from the Pedal tab with **Copy**,
  and paste the JSON it answers with under **Preset JSON** to audition or save it.
  **Copy measurement** gives the assistant what the pedal actually sounded like.
- **Pedal control** goes over WebHID: presets, audition, save with a backup of
  what the slot held, and a firmware check before any write. Quit Darkglass Suite
  first; it holds the pedal exclusively.
- **Measuring** goes over Web Audio. Browsers open the Anagram as a stereo device,
  so once, in Audio MIDI Setup, select Anagram, Configure Speakers, and set the
  stereo Left channel to "Virtual Input" (channel 9, the reamp input); the page's
  Check button confirms it. Browsers cannot read the
  dry instrument input, so a take to reamp is either an uploaded DI file or the
  experimental dry capture, which records through a near-transparent preset.
- Measurements, takes, targets and the conversation stay in the browser
  (IndexedDB). Nothing is uploaded anywhere.

Run `python3 tools/build_web.py` after editing the reference files the app uses.

## Privacy

`rig.yaml`, `blocks-user.*`, `rig-profile.md` and `backups/` describe you, your
device and your purchases, so they stay on your machine and out of git. What is meant to be
shared is the skill itself plus the factory tier, which is the same on every
Anagram.

## Credits and sources

The block catalogue — every parameter, range, default and enumeration — was read
from a device over USB, not transcribed, so it is accurate for firmware
v1.19.2.24 and refreshable with `cli.py refresh-blocks`.

What a paid block is and what it is for comes from the **Darkglass Anagram
Marketplace** itself. `tools/market.py` reads the product catalogue behind the
shop (`https://api-v2.darkglass.com/shopify/products`) and matches each product to
a block by the plugin URI in its variant SKU. It fetches on demand and caches the
result in `reference/.market-cache.json` (gitignored) for a week, so the vendors'
descriptions are never shipped in this repo. Factory blocks are not sold, so the
shop has nothing on them.

`reference/what-blocks-model.md` says what each factory block *emulates*. The
device does not carry that information and Darkglass does not publish it, so it
comes from the community-maintained **Darkglass Anagram Block List** on the
TalkBass wiki — <https://www.talkbass.com/wiki/anagram-block-list/> — and the
per-block detail at
<https://anagramanswers.com/categories/anagram-block-reference.18/>. Thanks to
whoever keeps those up to date. Those attributions are community research, not
statements from Darkglass, and the file marks them as such.

For blocks you don't own, `cli.py market --all` and `cli.py block` add what
**Anagram Tone Lab** — <https://www.anagramblocks.com>, a community review site —
says each block is based on, its rating and its controls as read off a player's
pedal. `tools/tonelab.py` reads the site's pages on demand, credits it in the
output and caches what it read in `reference/.tonelab-cache.json` (gitignored)
for a week. Its "based on" lines are the site's reading, not vendor statements,
and the skill hedges them accordingly.

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
