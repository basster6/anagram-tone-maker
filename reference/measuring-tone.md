# Measuring a tone

Designing from parameter values is designing blind. A mid control set to 2.2 says
nothing about how wide the cut is, a cab IR can quietly remove the top end an EQ
was boosting, and a "clean" amp can be saturating at the level the player actually
hits it. Measure, then adjust from what came back.

## How the pedal makes this possible

The Anagram is a 3-in / 9-out USB audio interface, and one of its outputs is a
reamp input:

| Channel | Direction | Carries |
|---|---|---|
| output 9 | computer → pedal | into the effects chain, as if played |
| inputs 1, 2 | pedal → computer | the chain's output, left and right |
| input 3 | pedal → computer | the instrument jack, dry, before the chain |
| outputs 1-8 | computer → pedal | playback to the monitors, not the chain |

So test signals go in on output 9 and come back on inputs 1-2, with no cables,
and a player's dry take can be recorded on input 3 and sent back through any
preset as often as needed.

Install `numpy scipy sounddevice` once. These commands make sound on the pedal's
outputs; tell the user to turn monitors down first.

## Two kinds of measurement, for two kinds of effect

**Test signals — `cli.py measure`.** A sine sweep and steady tones. Exact for
anything that does the same thing every time: EQ, amp and cab voicing, drive,
compression, the global EQ, noise. About a minute; `--quick` gives the frequency
response alone in about twelve seconds.

**Real playing — `cli.py capture` then `cli.py reamp`.** Test signals cannot
show what an effect does *over time* or *in response to the notes*: tremolo,
chorus, octavers, synths, delays, reverbs. Record the player once, keep the dry
take, and reamp it through each candidate. The performance is identical every
time, so differences are the preset's.

```sh
python3 tools/cli.py measure --save before.json        # current preset
python3 tools/cli.py measure --slot 18C --save 18c.json
python3 tools/cli.py compare before.json after.json     # what a change did
python3 tools/cli.py capture 20 --save take.wav         # player plays for 20 s
python3 tools/cli.py reamp take.wav --slot 18C --save 18c-wet.wav
```

## Reading `measure`

**Frequency response.** Gain per band, relative to the 200 Hz - 2 kHz average,
1/6-octave smoothed. Measured at two input levels: if the curves differ, a drive
or compressor is reshaping the tone as the player digs in. This is the real
answer to "which frequencies are boosted and cut" — and it includes the cab and
the pedal's global EQ, which the preset document does not show.

The round-trip figure includes the computer's audio buffers and is not the
pedal's own latency.

**Distortion.** THD and the second and third harmonics at five fundamentals and
three levels. Even-order harmonics (H2, H4) read as warm and tube-like; odd-order
(H3, H5) as hard, transistor or fuzz. These are measured at the chain output, so
an EQ *after* the drive stage tilts them — a boosted 2 kHz inflates a 1 kHz tone's
H2. Read them alongside the frequency response.

**Dynamics.** The static curve is output against input level: a slope of 1 is
untouched, flatter is compression or clipping, a sudden jump at the bottom is a
gate opening. The step test splits the gain lost on a 20 dB jump into two parts
that feel alike and are fixed in different places:

- **saturation** — lost instantly. Clipping or a drive stage; there is no attack
  or release to set. Turn down gain or input level on the block doing it.
- **compression** — lost over time. An actual compressor; its attack and release
  are timed when there are at least 3 dB of it, and left blank below that because
  the figure would be noise.

**Noise floor** of the chain output, and of the instrument input for reference.

## Reading `capture` and `reamp`

- **Playing level** — peaks and average at the instrument input. This decides
  which of `measure`'s test levels describe the player's real touch. A tone
  designed at -24 dBFS and played at -8 is a different tone.
- **Peak-to-average, dry vs wet** — how much transient the preset takes away. For
  percussive styles this is the number to protect.
- **Tonal balance of the actual playing** — the same idea as the frequency
  response, weighted by what was played. Bands the take hardly reaches are left
  out, because whatever comes out there was made by distortion.
- **Level modulation** — a periodic movement of the level, with its rate and
  depth: tremolo, or anything modulating amplitude. The player's own dynamics and
  any gate or compressor are fitted out first, so the rhythm of the playing does
  not show up as a tremolo.
- **Octave below** — how strong the signal an octave under the played note is,
  and how much of that the preset *added* over the dry take. Pitch tracking
  sometimes mistakes a note for the octave above it, which makes the real note
  read as "an octave below" in dry and wet alike; only an increase of 10 dB or
  more over dry, to above -30 dB, means an octaver or sub synth.
- **Tail** — how long sound continues after the last note. Above about 250 ms is
  a delay or reverb; below is the cab and gate letting go.

**Save the wet take and offer it to the user to listen to.** Chorus depth, how a
synth tracks, whether a reverb is pretty — the numbers do not cover these, and the
user's ears are the final word.

## The loop

1. Design and audition as usual.
2. `measure`, and if the tone involves time-based or pitch effects, `reamp` a take.
3. Compare against what the research said the tone should be. Name the gaps in
   bands and decibels: "the 3-4 kHz attack the research asks for is 12 dB down".
4. Find the cause before reaching for an EQ block — very often the cab IR or the
   microphone choice, or a drive stage saturating at the player's real level.
5. Change one thing, `measure --save` again, `compare`. Keep the change if the
   difference is the one you meant.

Tell the user what the measurement showed in one or two sentences with numbers,
and what you changed because of it.

## The studio page

`cli.py studio` puts all of this on a local page: the player runs measurements
and recordings with buttons, sees every curve overlaid, plays dry and wet takes,
and leaves messages. Results from either side land in `studio/` and appear on
both. Read `inbox`, answer with `say`, overlay goals with `target`. A take
recorded on the page is the best reference for the player's real level — use it
to decide which test level describes them.

## Checking a guessed file path

Cabinet and model files are device-side paths you cannot list. When you have to
guess one from the naming pattern, measure it: a path that does not exist leaves
the cab block passing the signal unfiltered, so the response stays flat or rises
above 6 kHz instead of rolling off. Try each candidate with `audition` and a quick
measurement, and keep the one whose top end actually falls — that is how
`Eden 410 103 1 On_03-MP.dat` was found while `_01` and `_02` silently did nothing.

## Limits worth stating

- The chain is measured as a whole. If the cause of a feature is unclear, bypass
  blocks one at a time with `audition` and measure again.
- Pitch modulation (chorus, vibrato) is not measured directly; its depth shows up
  only as level ripple. Listen to it.
- Settings that vary by scene need a measurement per scene.
