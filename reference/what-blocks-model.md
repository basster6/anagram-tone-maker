# What each factory block models

The device does not say what a block emulates. Factory blocks are not sold, so
they have no marketplace description either — their names are deliberately
oblique ("Peggy Bass", "Swirl 900", "Garden of 4×10"). This file closes that gap.

**Source:** the community-maintained *Darkglass Anagram Block List* on the
TalkBass wiki — <https://www.talkbass.com/wiki/anagram-block-list/> — with
per-block parameter detail at
<https://anagramanswers.com/categories/anagram-block-reference.18/>.

**These are community attributions, not Darkglass statements.** Treat them as a
strong hint about voicing, never as fact about a product. Where the wiki itself
hedges ("Likely…", "Possibly…", "?") that hedge is kept below. Two entries are
explicitly *not* emulations: Darkglass has said Pharos Phaser, Vibralis Vibrato
and Tremora Tremolo are generic effects modelled on no specific unit.

Use this to pick candidates. Then read the actual parameters
(`python3 tools/cli.py block <uri>`) before setting a value — the model name tells
you the character, the parameter list tells you the frequencies.

Device names below are what `reference/blocks-factory-catalog.md` shows. Where the
wiki uses a different name for the same block it is noted in brackets.

## Preamps

| Device name | URI | Models |
|---|---|---|
| Harmonic Booster | `urn:darkglass:HBO` | Darkglass Harmonic Booster |
| Leo Bass | `urn:darkglass:LeoBass` | Fender Bassman |
| Jim Bass | `urn:darkglass:JimBass` | Marshall Bass |
| Gentle | `urn:darkglass:neural-plugins:gentle` | **Noble Preamp/DI** — a boutique tube DI, not an amp head |

## Amp heads

| Device name | URI | Models |
|---|---|---|
| Peggy Bass | `…neural-plugins:peggy-bass` | Ampeg SVT 'Blueline'. Its Ultra Lo toggle boosts 40 Hz and cuts 500 Hz hard — it changes the amp's identity, not just its EQ |
| Peggy Classic | `…neural-plugins:peggycl` | Ampeg SVT CL. Has tube input + separate Master and Gain, so it drives |
| Peggy FlipTop | `…neural-plugins:fliptop` | Ampeg B-15 Portaflex — warm 60s flip-top |
| Super California | `…neural-plugins:super-california` | Fender Super Bassman 300 |
| Kallinen-Kruukkeri | `…neural-plugins:gallen-kallinen` | Gallien-Krueger |
| Swirl 900 | `…neural-plugins:swirl` | **SWR SM-900** — tube preamp / solid-state power. Hi-fi. `aurashaper` is SWR's Aural Enhancer (a smile curve on one knob) |
| Black & Yellow TLIII *(wiki: Tiny Lark III)* | `…neural-plugins:markku` | Markbass Little Mark series |
| Modern ISOBRICK750 / …OD | `…neural-plugins:modern-california-cln` / `-od` | Mesa Big Block 750, clean and overdriven channels |
| SWE TC650 | `…neural-plugins:swe` | **EBS TD650** — 650 W hybrid tube/solid-state. Hi-fi Swedish voicing |
| Fruity HB500 *(wiki: Fruity Horror Bass 500)* | `…neural-plugins:fruity` | Orange Terror Bass 500 |

Rough voicing map, for choosing a direction: **Ampeg (Peggy\*) = rock grind and
mid push. Fender (Leo, Super California) = round vintage. Mesa, Orange, G-K =
modern aggressive. SWR (Swirl 900) and EBS (SWE TC650) = hi-fi, scooped, the
slap/fusion end. Noble (Gentle) = clean studio DI.**

## Cabinets — selected by file, not by block

`urn:darkglass-anagram:cabinet-bass` is one block with four controls. **Which**
cabinet and microphone it uses is a device-side path in `properties`, e.g.
`/factory-data/cabinets/SWR 810 103 1 On_03-MP.dat`. The naming is
`<cab> <mic> <position>_<n>-MP.dat`. You cannot list that directory, so either
reuse a path seen in an existing preset or ask the user to pick it on the pedal
and read the preset back.

Every bass cabinet has **7 microphone options × 6 positions** (cap on/off axis,
cone on/off axis, edge on/off axis). Guitar cabinets have 6 mics × 3 positions.

### Bass cabinets (22)

| Device name | Models |
|---|---|
| Black & Yellow 4×10 | Markbass Standard 104HR |
| California Bass 4×10 | Fender Bassman 410 Neo |
| Darkglass Neo 2×12 / 4×10 | Darkglass DG212N / DG410N |
| Fruity Bass 1×15 / 4×10 / 8×10 | Orange OBC115C / OBC410HC / OBC810C |
| Garden of 1×18 / 4×10 | **Eden D118 / D410** — modern hi-fi |
| Modern Bass 1×15 / 2×10 / 4×10 / 8×10 | Mesa Boogie Standard PowerHouse |
| Mountainino 6×10 | Bergantino NV610 |
| Peggy 1×15 / 4×10 / 8×10 | Ampeg SVT-15E / SVT-410HE / SVT-810E |
| Vintage Peggy 8×10 | Ampeg SVT-810E Heritage |
| Peggy Fliptop 1×15 | Ampeg B-15 Portaflex |
| SWIRL 1×15 / 4×10 / 8×10 | SWR WorkingPro / **Goliath 4×10** / Megoliath 8×10 |

### Bass microphones (7) — this is where the top end is decided

| Option | Mic | Character |
|---|---|---|
| Condenser 103 | Neumann TLM 103 | Very detailed, extended highs, bright and hi-fi |
| Condenser 414 | AKG C414 | Neutral and versatile, flat mids, smooth but extended top |
| Condenser 67 | Neumann U67 | Vintage tube, warmer mids, rolled-off top |
| Dynamic 112 | AKG D112 | Deep lows, scooped mids, punchy 100–150 Hz |
| Dynamic 421 | Sennheiser MD421 | Forward mids 500–800 Hz, balanced lows, smooth top |
| Dynamic 52 | Shure Beta 52A | Hyped lows and presence, scooped middle — a smile curve in a mic |
| Dynamic 7 | Shure SM7B | Thick low-mids, forgiving top, warmth |

**The mic often does more than the EQ block you were about to add.** Wanting air
and detail means Condenser 103 before a treble boost; wanting vintage warmth means
Condenser 67 before a low-pass.

### Guitar cabinets (6) and mics (6)

Cabs: California combo 2×12 = Fender Twin · Fashionista 4×12 = Marshall 1960A/B ·
Modern 4×12 = Mesa Rectifier · Panzer 4×12 = Diezel · Topper 2×12 = Vox AC30 Top
Boost · Vintage London 4×12 = Marshall 1960AX Greenbacks.

Mics: Condenser 184 = Neumann KM184 (airy, clinical on-axis) · Dynamic 421 =
MD421 · Dynamic 57 = SM57 (mid punch, bright upper mids) · Dynamic 906 =
Sennheiser e906 (flat, extended lows) · Ribbon 121 = Royer R-121 (dark, thick) ·
Ribbon 160 = Beyerdynamic M160 (warm but more articulate than the 121).

### Artist cabinets (18)

Captures of a Darkglass DG410C by named engineers, selected like any other cab
file. **Dave Hollingworth** by mic: Beta52A, D12e (vintage, warm lows), MD421,
MD441 (tight). **Forrester Savell** (Karnivool, Dead Letter Circus) by intent:
Bitey, Clear, Monster, Punch, Thick. **Jon Stockman** (Karnivool): 2×12, 4×10,
8×10 — clarity, punch, big lows. **Adam "Nolly" Getgood** (Periphery, GetGood
Drums): Blend, AllTheMids, ScoopyDoo (scooped mids, heavy ends), RolledOff,
VintageStack, Mega-Meld-IR.

These are the fastest route to a usable mixed tone — someone has already made the
mic decision for a purpose, and the name states that purpose.

## Overdrive & distortion

| Device name | URI | Models |
|---|---|---|
| B3K | `urn:darkglass:B3K` | Darkglass Microtubes B3K |
| Vintage Microtubes | `urn:darkglass:VMT` | Darkglass Vintage Microtubes |
| Alpha Omicron | `urn:darkglass:AlphaOmicron` | Darkglass Alpha Omicron |
| Duality Fuzz | `…neural-plugins:duality-fuzz` | Darkglass Duality Fuzz |
| Microtubes X | `…neural-plugins:microtubes-x` | Darkglass Microtubes X / X Ultra |
| Chinchilla | `urn:darkglass:Chinchilla` | Pro Co RAT |
| Atomic Sans | `…neural-plugins:comic` | **Tech 21 SansAmp Bass Driver DI** |
| Green PiRate Fuzz | `…neural-plugins:pirate` | Electro-Harmonix Big Muff Pi |
| Bee Kolme OD | `…neural-plugins:yellow` | Boss ODB-3 Bass Overdrive |
| Arc Dreamer | `…neural-plugins:dreamer` | Ibanez Tube Screamer |
| Mood Fuzz *(wiki: Mood 2)* | `…neural-plugins:mood` | 3Leaf Audio Doom 2 |
| Entropia | `urn:darkglass:entropia` | Neural DSP Parallax X — parallel, multiband distortion |

## EQ, filters and dynamics

| Device name | URI | Models |
|---|---|---|
| Amp EQ | `urn:darkglass:AmpEq` | Possibly the EQ section of the Darkglass B7K |
| Darkglass GEQ | `urn:darkglass:DarkglassGEQ` | Possibly the EQ of the Luminal Booster / Microtubes X Ultra / X7 |
| Generic GEQ | `urn:darkglass:GenericGEQ` | Generic graphic EQ |
| Parametric EQ *(wiki: Par.EQ)* | `urn:darkglass:fil4#mono` / `#stereo` | Parametric EQ |
| HPF + LPF, Hi-pass, Lo-pass | `urn:darkglass:HPFLPF` / `HPF` / `LPF` | Plain filters |
| Gravitron | `urn:darkglass:Gravitron` | Mu-Tron III / 3Leaf / Source Audio envelope filter |
| mo**erf***er | `urn:darkglass:moerfer` | Moogerfooger MF-101 |
| Suppressor *(wiki: Noise Suppressor)* | `urn:darkglass:Suppressor` | Boss NS-2 / ISP Decimator |
| NA Noise Gate | `urn:nembriniaudio:noisegate` | Nembrini Analog Rack Noise Gate |
| FET Compressor *(wiki: Luminal FET)* | `urn:darkglass:FETComp` | **Urei 1176 / Origin Cali76.** Fixed threshold: drive the input to compress, then drop Output by the same amount for unity gain |
| BUS Compressor | `urn:darkglass:BUSComp` | **SSL bus compressor** — attack and release are enumerated in real ms/s |
| Compressor / Limiter | `urn:darkglass:CompLim` | dbx 160 / Boss LMB-3 / Keeley Bassist |
| Ignissor | `urn:darkglass:ignissor` | Multiband compressor (Darkglass original) |
| Wauwa | `urn:darkglass:wah` | Wah, driven by expression pedal |

**The three compressors are not interchangeable.** The FET is fast and grabs
transients — good for levelling fingerstyle, wrong when the attack *is* the
sound. The BUS compressor exposes real attack/release values, so it is the one to
use when research names a time constant. Ignissor is for when only one band needs
controlling.

## Modulation, synth and pitch

| Device name | URI | Models |
|---|---|---|
| Axioma Mono Synth | `urn:darkglass:axioma_synth` | Monophonic synth (Darkglass original, v1.18) |
| Mint Chocolate Chorus | `urn:darkglass:Chorus` / `ChorusStereo` | Boss CE-2 / CE-2B / CE-5 |
| Flamingo Flanger | `urn:darkglass:Flanger` / `FlangerStereo` | EHX Electric Mistress / MXR M117 |
| Pharos Phaser | `urn:darkglass:dark-phaser` | *Generic* — Darkglass says no specific unit; draws on Boss PH-3 |
| Vibralis Vibrato | `urn:darkglass:dm-Vibrato` | *Generic* — elements of Boss VB-2 |
| Tremora Tremolo | `urn:darkglass:dark-tremolo` | *Generic* — elements of Boss TR-2 |
| Sublime Octaver | `urn:darkglass:Sublime` | Boss OC-2 / EBS OctaBass / Aguilar Octamizer. Mono, rectification — smooth, round, vintage, lazy tracking |
| Sublemon Octaver | `urn:darkglass:Sublemon` | MXR Blue Box / Mu-Tron Octave Divider. Mono, wave-flipping — keeps upper harmonics, raspy, aggressive |
| Subcitri Octaver | `urn:darkglass:Subcitri` | EHX POG / Sub'n'Up / Boss OC-5. Polyphonic — tracks chords, clean, accurate, can sound sterile |
| Pitch Shifter | `urn:darkglass:PitchShifter` | DigiTech Whammy / EHX Pitch Fork+ |
| Pitch Bender | `urn:darkglass:PitchBender` | ±2 octaves via expression pedal |

**Three octavers, three different circuits.** Pick by behaviour, not by name:
vintage round = Sublime, raspy/fuzz-octave = Sublemon, chords and accuracy =
Subcitri.

## Delay and reverb

Digital Delay = Boss DD-7 / TC Flashback · Analog Delay = MXR Carbon Copy / EHX
Memory Man · Modulation Delay = Strymon Timeline / Boss DD-8 · Room = TC Hall of
Fame / Strymon BigSky · Plate = Lexicon / TC plate · Hall = Lexicon Hall /
BigSky · Shimmer = BigSky Shimmer / Eventide Space · Spring = Fender Twin /
Roland Cube spring. Tape, Reverse, Ping-Pong and Ping-Pong Reverse delays are
marketplace additions.

Mono and stereo variants are separate URIs (`…Reverb` vs `…ReverbStereo`).

## Loaders and utilities

Tone3000 and TONE3000 NAM Loader, User Cabinet (IRs loaded via Darkglass Suite),
Neural Amp (full amp behaviour), Neural Pedal (preamps and dirt, with a Blend
against the dry input), Neural Loader (general purpose, gain + model only), Gain
with polarity, Output, Split, Merge, Send, Return, FX Loop, Volume Pedal,
Expression Pedal, Tuner, meters and a sine generator.
