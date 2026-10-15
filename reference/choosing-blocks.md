# Choosing blocks

How to pick a chain that sounds like the request, written from mistakes made
designing real tones on a real device.

## Start from the chain style, not the block list

Most tones are **one dense serial chain**: six or seven blocks in row 1, each
doing a small job, sculpted against each other. That is the right default, and a
serial chain that works looks roughly like this, adapted to the request:

```
dynamics -> dirt/preamp -> EQ -> filter/modulation -> ambience -> console/cab -> output
```

## The parallel row has two quite different uses

`urn:darkglass-anagram:split` feeds row 2 and `urn:darkglass-anagram:merge` brings
it back. Its `Crossover` control decides which kind of parallel you get, and the
two are not interchangeable.

**Crossover on — multiband processing.** `Crossover` set to `1 Lo, 2 Hi` (or the
reverse) splits the signal at `CrossoverFreq` and sends each band down its own
row. This is everyday bass tone work, not a special effect:

- drive, fuzz or saturate only the upper band while the fundamentals stay clean
  and tight — the single most useful trick for a bass that has to cut without
  turning to mud
- compress only the lows, or only the highs, each with its own attack
- EQ, filter or modulate one band without touching the other

The crossover frequency is the real decision. Somewhere around 100-250 Hz splits
"fundamental" from "character" on a bass; lower keeps more of the body in the
dirty band, higher keeps the clean band fuller. `LevelRow1` and `LevelRow2` trim
each band and the merge's `Blend` sets how they recombine.

**Do not hand-roll this.** Putting a low-pass in one row and a high-pass in the
other reproduces badly what the split block already does properly, and costs two
slots and the DSP to run them. Use the block's own crossover, and spend any
filter blocks you add on shaping *within* a band.

**Crossover off — two voices from one instrument.** Both rows get the full range,
so you can build a clean low register under a distorted or pitch-shifted upper
one. Reach for this when the request is specifically to sound like two
instruments at once. For an ordinary drive tone it just splits the gain staging
in half and makes everything harder to balance.

## Match the family the request is asking for

| The request sounds like | Reach for |
|---|---|
| console, studio, "polished", mix-ready | channel-strip and Pultec-style EQ blocks, a tape or console colour block at the end of the chain |
| amp in a room, rock, Ampeg-ish | an amp or preamp block plus a cabinet, with the cab doing the top-end shaping |
| SansAmp-style, DI rock | a PSA-type preamp block: Buzz / Punch / Crunch / Drive are its character controls |
| clean, round, "pretty", Aguilar-ish | a clean preamp with gentle EQ, light compression, and no cab-killing high end |
| fuzz wall, two-piece band | split/merge, with dirt and pitch or synth on the parallel row |
| slap, funk, fusion, "modern hi-fi" | a hi-fi amp family (SWR, EBS) with a sweepable EQ, a bright condenser on the cab, and a *slow*-attack compressor |

End the chain the way the player ends theirs. Look at `rig-profile.md`: the block
that closes most of their presets tells you what they consider "finished".

## Find out what the block actually is

Two sources, and you need both.

`reference/what-blocks-model.md` says what each **factory** block emulates. The
device and the shop say nothing about those, and the names are deliberately
oblique, so this is the only way to know that one amp block is an Ampeg SVT and
another is an SWR — which is the whole decision in most tones.

`cli.py block <uri>` prints the marketplace description alongside the parameters
for any block the **user installed**. Read it: it says where the controls sit,
and a control's frequency changes whether the block belongs in the tone.

## Read the parameters before you choose, not after

Every mistake below has the same root: picking a block from its name and category,
then reading its parameters only to fill in values. Read the whole parameter list
of everything you are considering first. It routinely changes the choice — the
splitter turns out to do crossovers, a utility turns out to be a full synth, a
filter turns out to cover both ends at once and save a slot.

## Rules that came from getting it wrong

**Use the dedicated block, not a clever substitute.** A synth block with real
oscillators beats faking a synth with a pitch shifter, and it will not produce
tracking artefacts. Search the catalogue by what a block *does*, not only by
category — a mono synth may well be filed under Utilities.

**Pitch trackers go before distortion, never after.** They need a clean,
fundamental-rich input. After a gain stage they chase harmonics and the pitch
falls apart.

**Do not add low end to a path you are about to high-pass.** Putting a sub-octave
on the dirty row and then cutting at 120 Hz cancels your own work and invites
intermodulation under gain. Let the clean row own the bottom.

**Two gentle gain stages beat one extreme one.** A mid-pushing boost with its own
drive low and level high, feeding the main distortion, gives a thicker and more
controllable wall than cranking a single block.

**When it is harsh, cut at the source before reaching for EQ.** On a PSA-style
block the fizz control (often called Buzz) is the first thing to pull back, then
gain, then treble. Lowering the low-pass that feeds the gain stage helps more
than any EQ after it. And raise the low control a little after cutting highs, or
the tone just gets thin.

**Pick the compressor by what the attack is doing.** A fast FET compressor
levels a performance, which is right for fingerstyle and wrong whenever the
attack *is* the sound — on percussive playing it eats the transient you were
trying to feature. When research or the user names a time constant, use the block
that states attack and release in real milliseconds rather than one with a fixed
threshold, so you can set the number instead of approximating it.

**The microphone is a tone control, and it comes before the EQ block.** Cabinet
blocks carry a mic choice with a published voicing — bright hi-fi condenser,
mid-forward dynamic, rolled-off vintage tube, a scooped kick mic that is already
a smile curve. Choosing the right one does the job that two EQ blocks were about
to do badly. Check `reference/what-blocks-model.md` before adding a treble boost.

**Pressure comes from parallel compression.** A bus compressor with a blend
control, a 3 ms attack and a moderate ratio adds density while the pick attack
still gets through. A fast attack flattens the transients and the riff turns to
mush — which is the opposite of loud.

## Read the rig before choosing anything

- Gear in front that is **always on** does its job already. An external
  compressor means no compressor block, or a very light one.
- Gear in the **FX loop** means an `fxloop` block placed where that gear belongs,
  and no internal block duplicating it.
- A **real cabinet after the pedal** means no cab block. A DI into an interface
  means you need one.
- Check `actuators` before binding. Binding an expression pedal that is not
  plugged in wastes the best control available — put it on a spare pot instead.
  `ask` means they own one but usually leave it unplugged: design it on a pot,
  then offer to move it to the pedal when a tone would really benefit.

## Let their own presets settle the details

For any block, look at how this player already configures it before choosing
values yourself. Routing-style settings especially: an FX loop's IO
configuration, a cabinet's file path, an output block's enabled jacks. Reading
one of their presets answers these; guessing produces a tone that does not pass
audio.

Two traps worth naming:

- An FX loop wired as an **insert** passes the whole signal through the loop, so
  its blend control at 100 % is *normal operation*, not "fully wet". Turning it
  down cuts the signal. Toggle the loop with the block's `enabled`, not the blend.
- The unit `1dPt` in the block metadata is a placeholder, not a real unit. It
  appears on plain 0-10 controls. Ignore it rather than reporting it.

## Keep an eye on DSP

The pedal shows its DSP load on screen, and that is the number to trust. In the
device log, a burst of jack process errors at the moment a preset loads is the
audio graph being rebuilt and is harmless; errors that keep arriving while
playing mean the chain is too heavy.

When you need to save cycles: a synth or pitch block with a quality setting is
the biggest lever, then filter slopes, then any block whose job another block in
the chain already covers. One block that does two jobs — a combined high-pass and
low-pass, say — buys both a slot and some headroom.
