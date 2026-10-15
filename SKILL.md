---
name: anagram-tone-maker
description: >
  Design bass and guitar tones for a Darkglass Anagram multi-effects pedal, as
  preset documents the device can load. Use when the user asks for a tone, patch
  or preset for the Anagram, wants an existing preset changed, or asks what a
  block does. Carries the full block catalogue read off the device, the preset
  file format, a validator, and tools that read presets from the pedal and
  audition a tone on it over USB.
---

# Anagram tone maker

The Darkglass Anagram is a Linux-based multi-effects pedal. A tone is a **preset
document**: a JSON file describing a signal chain of LV2 blocks, their parameter
values, up to three scenes, and bindings from the pedal's knobs and footswitches.

This skill lets you design one from a plain-language request, check it, and play
it on the pedal.

## Start here

0. **Read `reference/rig-profile.md` if it is there.** It profiles what this
   player owns and how they actually use it — which blocks they reach for, where
   their settings sit against the factory defaults, which cabinet and model files
   exist on the device. Prefer their habits over generic choices.
1. **Read `rig.yaml`** (the user's copy of `rig.example.yaml`). **If it does not
   exist, this is their first run — stop and follow `reference/onboarding.md`
   before anything else.** That flow pulls the block catalogue and marketplace
   descriptions off their own pedal, infers what it can about the rig from the
   presets already on it, and asks the rest as multiple-choice questions. Do not
   start a tone with an empty rig and do not fill it in by assumption.
   `rig.yaml` says what instrument they play and what sits
   before, after, and in the pedal's FX loop. A tone that ignores the rig is
   wrong even when the JSON is valid — do not add a cab block when a real cab
   follows the pedal, and do not add a reverb when a reverb lives in the loop.
2. **Look up blocks in `reference/blocks-factory-catalog.md`.** It lists all blocks with
   abbreviation, category, and every parameter's range, default, unit and
   enumeration. `reference/blocks.json` is the same data for programmatic use.
   **Never invent a parameter, a symbol or a range.** If a block is not in there,
   the device does not have it.
3. **Read `reference/what-blocks-model.md`.** The Anagram's factory block names
   are deliberately oblique — `Peggy Bass`, `Swirl 900`, `Garden of 4x10` — and
   the device never says what they emulate. That file maps each one to the
   product it models, and lists the cabinet, microphone and artist-IR options
   with their voicings. A block's model name is what tells you whether it belongs
   in this tone at all.
4. **Read `reference/choosing-blocks.md`.** How to pick a chain for the kind of
   tone being asked for, which block families suit which request, and the
   mistakes that are easy to repeat.
5. **Follow `reference/preset-format.md`** when writing the document.
6. **Validate before you show anything:** `python3 tools/cli.py validate tone.json`.

## First run

When `rig.yaml` is missing, set the player up before designing anything.
`reference/onboarding.md` has the whole flow; the shape of it is:

```sh
python3 tools/cli.py refresh-blocks   # their blocks, not the bundled snapshot
python3 tools/cli.py market           # what each installed block models
python3 tools/cli.py analyze          # how they actually use the pedal
python3 tools/cli.py setup            # infer the rig, draft rig.yaml
```

Then ask what the pedal cannot know — the instrument, the gear before and after,
whether an expression pedal is plugged in, what they play — **using your
structured question tool** (`AskUserQuestion` in Claude Code, or the equivalent),
two to four at a time, with concrete options to pick from. Picking beats typing,
which is the entire reason to ask instead of handing them the YAML.
`reference/onboarding.md` carries the question set and the options worth offering.

`setup` is deliberately cautious: it reports the evidence behind each inference
and refuses to fill in a field when the evidence is thin, because a confidently
wrong rig file is worse than an empty one. Trust what it declines to guess.

## Look the tone up before you design it

Almost every tone request points at something real — a song, a player, a record, a
genre, a technique, a named piece of gear. **Search the web for how that sound is
actually made before you start choosing blocks.** Design from what engineers and
players report, not from what the words suggest.

This is the step that is easiest to skip and most expensive to skip. Working from
the feel of a word produces tones that are plausible and wrong: "slap" sounds
bright, so you reach for a treble boost and a fast compressor, when the published
advice is a scooped smile curve and a *slow* attack that lets the thumb transient
through. No amount of careful parameter-setting recovers from aiming at the wrong
target.

What to search for, in rough order of usefulness:

- **The technique or genre, as an EQ and dynamics question.** Which bands get
  boosted and cut, by how much, and at what frequency. Which compression attack
  and release, and why. These come back as numbers you can type into a parameter.
- **The specific song or player**, where the request names one. Interviews, rig
  rundowns and forum threads routinely name the actual signal chain.
- **Which amp or cabinet suits it.** Amp families have reputations for a reason,
  and `reference/what-blocks-model.md` tells you which blocks are in which family.
  A tone that wants hi-fi scoop and a tone that wants mid grind are different amps
  before they are different EQ settings.
- **A named piece of gear you are about to emulate**, when you are unsure what it
  is known for.

Then bring it back to the pedal: for each finding, name the block and parameter
that implements it, or say plainly that the device cannot do it. A research note
that does not land on a parameter is not yet useful. Prefer a block whose
parameters are stated in real units — a compressor with attack in milliseconds,
an EQ with a sweepable centre frequency — because that is what lets you set the
number the research gave you instead of approximating it.

Tell the user what you found and what you did with it, in a line or two. "The
consensus is a cut around 300-800 Hz, so the amp's mid sits at 2.2 with its sweep
at 700 Hz" is worth more than any amount of describing the sound in adjectives.

If web search is not available in the current environment, say so rather than
quietly substituting your own assumptions, and keep the design to blocks whose
parameters you have actually read.

## Read every parameter before you write a value

Work out the chain, then **read the full parameter list of every block in it, and
of every block you considered**, before deciding a single value:

```sh
python3 tools/cli.py block urn:darkglass-anagram:split
```

That command also prints what the marketplace says the block is, for anything the
user installed. **Read it.** The device never says what a block emulates or which
frequency a control sits on, and that is exactly what decides whether the block
belongs in this tone — one amp block's mid control turns out to live at 750 Hz,
another's bright switch turns out to be a 5-7 kHz shelf. Guessing from the block's
name is how you end up calling a Tone Hammer an Ampeg.

Factory blocks are not sold, so the device and the shop say nothing about them.
Look them up in `reference/what-blocks-model.md` instead, then read their
parameters. The two answer different questions and you need both: the model name
tells you the character, the parameter list tells you the frequencies.

Do this even for a block you think you know. A parameter you had not noticed
changes which block you pick, not just how you set it — a splitter with a
crossover built in replaces the two filter blocks you were about to add, and a
synth block hiding under Utilities replaces the pitch shifter you were about to
press into service. Choosing first and reading afterwards produces chains that
work around capabilities the device already has.

So the order is: read the catalogue for candidates, read every candidate's
parameters in full, then choose, then set values - each one from the range and
default you just read, never from memory.

## Designing a chain

Most tones want **one dense serial chain in row 1** - see
`reference/choosing-blocks.md`. The parallel row is a special effect for making
one instrument sound like two voices, not a default.

The chain is **two rows of twelve slots**. Row 1 is the main path. Row 2 is a
parallel path, entered with `urn:darkglass-anagram:split` and rejoined with
`urn:darkglass-anagram:merge` — place split and merge in row 1, and put the
parallel blocks in row 2 between them.

Slots are addressed by number and **gaps are fine** — the signal flows through
occupied slots in ascending order, so leave room for later additions rather than
packing everything from slot 1.

A workable default order, adapted to the request:

```
tuner/gate -> compressor -> drive/preamp -> EQ/filter -> modulation
           -> pitch/octave -> delay -> reverb -> cab/IR -> output
```

Things worth knowing:

- **Cab or no cab.** `urn:darkglass-anagram:cabinet-bass` (and the guitar/artist/
  user variants) need a cabinet file in `properties`, which is a device-side path.
  You cannot browse those paths, so reuse one seen in an existing preset or leave
  the block out and say why.
- **Neural blocks** (`urn:darkglass:neural:*`, `urn:darkglass:neural-plugins:*`)
  are amp and pedal captures. `neural:pedal` and `neural:amp` take a `.nam` model
  file in `properties`; the `neural-plugins:*` ones are baked in and take none.
- **Output block.** `urn:darkglass-anagram:output` switches `xlrL`, `xlrR`,
  `jackL`, `jackR`, `headphones` (0 or 1 each). Set it from `rig.yaml`.
- **FX loop.** `urn:darkglass-anagram:fxloop` is where the user's external gear
  sits. Its position in the chain decides where that gear lands.
- **Host tempo.** Parameters marked `hostTempo` follow the pedal's tempo; delay
  blocks usually expose a `Subdivision` enumeration for note values.
- **Quickpot.** Each block has one parameter promoted to the pedal's quick knob.
  Parameters marked `quickpotDefault` are the factory choice; override with the
  block's `quickpot` field when another one suits the tone better.

Look at `reference/examples/` for real presets straight off a device: `13.json` is
the smallest useful one, `41.json` a five-block serial chain, `1.json` uses two
rows with scenes and bindings, `2.json` carries a cabinet file property.

## Scenes and bindings — do these unprompted

Setting up three scenes and ten actuators by hand on a pedal screen is miserable,
which is why most presets never get them. In a document it is a few lines, so
**build them in by default** and tell the user what you wired. This is usually the
most useful thing you do for them.

Scenes 1-3 are **deltas** on top of the base values: store only what changes, as an
array of `{symbol, value}` plus an optional `enabled`. Use them for verse/chorus
or clean/dirty within one tone. A good default is scene 1 as written, scene 2 a
pushed version, scene 3 a pulled-back one — adjusted to what the tone is for.

Bindings map the pedal's hardware to parameters: `pot1`-`pot6`, `foot1`-`foot3`,
`exp.pedal`. **Check `actuators` in `rig.yaml` first** - binding the expression
pedal when no pedal is plugged into the jack just wastes the best control you
have, so put that parameter on a spare pot instead. A binding names a target by `row`, `block` and `symbol`, with an
optional `min`/`max` pair narrowing the sweep — and `min` above `max` inverts it
on purpose. `:bypass` is a valid symbol for switching a block on and off.
Footswitch bindings only act in Stomp mode; in Scene mode the footswitches pick
scenes, so say so when you bind one.

## Working with the pedal

These need the Anagram plugged in over USB and **Darkglass Suite quit** — it holds
the control interface exclusively.

```sh
python3 tools/cli.py info                 # firmware, plugin counts, preset count
python3 tools/cli.py presets              # every stored preset, as the pedal orders them
python3 tools/cli.py get 13.json          # one preset document
python3 tools/cli.py validate tone.json   # no device needed
python3 tools/cli.py audition tone.json   # play it on the pedal, saving nothing
python3 tools/cli.py market               # what the shop says about your installed blocks
python3 tools/cli.py refresh-blocks       # re-read the catalogue after a firmware update
```

`audition` is the one to reach for: it loads the tone into the live chain so the
user can hear it, and nothing is written. The pedal keeps playing it until a
preset is selected again.

**Saving replaces whatever is in the slot.** Audition first, and only save when
the user has asked for it and named a slot.

```sh
python3 tools/cli.py save 17A tone.json          # refuses if the slot is taken
python3 tools/cli.py save 17A tone.json --force  # replace what is there
```

Slots are addressed as bank plus letter: `01A`, `01B`, `01C`, `02A` … `42C`, which
is 126 slots in all. The pedal stores each one as a file whose number is the slot
number, so `17A` is `49.json`. `cli.py presets` lists what is occupied.

Give a new preset a fresh `uuid` — the device keeps whatever the document carries
rather than issuing its own. `tools/anagram.py` has `new_uuid()` for this.

For scripting, `tools/anagram.py` is the library the CLI sits on; `Anagram.call()`
takes any action name and payload.

## How to answer a tone request

1. Read `rig.yaml`; ask only about what you genuinely cannot infer.
2. **Search the web for how the requested tone is actually made**, and write down
   the frequencies, time constants and gear it names.
3. Shortlist blocks from `reference/what-blocks-model.md`, then read every
   candidate's parameters in full.
4. Name the chain you intend to build and why, in two or three lines, tying the
   choices back to what the research said.
5. Write the document, taking every range and default from the catalogue.
6. Validate. Fix errors. Warnings are usually fine, but explain the ones you keep.
7. Offer to audition it, and say plainly that nothing is saved until they save it
   on the pedal.

Keep the explanation short and about the sound. The user wants a tone, not a
tour of the JSON.
