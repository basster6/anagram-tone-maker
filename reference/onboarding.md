# First run: setting the player up

Run once, when `rig.yaml` does not exist yet. It has two halves: **the machine
reads everything it can**, then **you ask only what is left** — as multiple-choice
questions, not an empty prompt.

## 1. Pull everything off the device first

With the pedal attached and Darkglass Suite quit:

```sh
python3 tools/cli.py refresh-blocks   # full block list, factory + whatever they bought
python3 tools/cli.py market           # marketplace descriptions for installed blocks
python3 tools/cli.py analyze          # profile how they actually use the pedal
python3 tools/cli.py setup            # infer rig facts from their presets
```

In that order. `refresh-blocks` writes
`reference/blocks-{factory,user}-catalog.md` and the matching JSON, so the
catalogue matches their firmware and their purchases instead of the bundled
snapshot. `market` fills in what each installed block actually models — the only
place that says, and it caches, so later runs are instant. `analyze` writes
`reference/rig-profile.md`. `setup` prints what it inferred and writes a draft
`rig.yaml`.

Say what came back in a line or two — how many blocks, how many presets, anything
notable they own. It confirms the pedal is talking and shows the work.

If the pedal is not attached, skip to the questions and say the catalogue is the
bundled factory snapshot until they plug in.

## 2. Ask the rest as multiple choice

**Use your structured question tool, not prose.** In Claude Code that is
`AskUserQuestion`; other agents have an equivalent. Typing out a rig description
is work, and picking from four options is not — the whole point of asking is that
it should be faster than editing the YAML by hand.

Rules that make it painless:

- **Two to four questions at a time**, never all of them at once.
- **Lead with the question whose answer changes the most**, which is what the
  outputs feed. It decides cab sim, and cab sim decides half of every tone.
- **Offer real options**, below. Every tool of this kind adds its own "Other",
  so a player with an unusual rig is never boxed in.
- **Skip anything `setup` already settled**, unless it looked unreliable. Asking
  about the FX loop when their presets already show one wired as an insert makes
  the interview feel like a form.
- **Let them stop early.** A rig with only the instrument and the outputs filled
  in is already enough to design good tones. Everything else can arrive later,
  the first time it matters.

### The questions, with options worth offering

**What the outputs feed** — the one that matters most.

- *Audio interface or DI into a computer* — needs a cab block; this is recording
- *Amp head into a real cabinet* — no cab block, the real speaker does it
- *Powered cab, FRFR or studio monitors* — needs a cab block
- *Straight to front of house* — needs a cab block, and XLR outputs

**The instrument.**

- *4-string, passive* — Jazz, Precision and the like
- *4-string, active*
- *5-string, active* — low B, so watch what a high-pass filter is set to
- *6-string or extended range*

**Tuning**, when the instrument suggests it might not be standard.

- *Standard* · *Drop D* · *Half step down* · *BEAD or lower*

**Expression pedal.** Ask unless `setup` found one bound. It is the single most
useful control on the pedal and binding one that is not plugged in wastes it.

- *Nothing plugged in* · *Yes, there is one*

**What is in the FX loop**, if `setup` found a loop block.

- *Nothing* · *One pedal* · *Several pedals* · *Not sure*

**Pedals in front of the Anagram**, and this is worth asking as multi-select:

- *Nothing* · *A compressor* · *A dirt pedal or preamp* · *A tuner*

Anything **always on** in front does its job already — an external compressor
means no compressor block, or a very light one. Ask which ones are always on only
if they named something.

**What they play** — multi-select, and the most useful answer of the lot:

- *Rock and metal* · *Funk, slap and fusion* · *Pop and clean tones* ·
  *Studio and console voicings* · *Ambient and experimental*

**How much headroom.**

- *Keep it clean, drive comes from the amp* · *Edge of breakup* ·
  *Driven and saturated*

**Anything to avoid** — multi-select, and worth asking because it is the one
thing that is hard to infer from their presets:

- *Heavy compression* · *Synth and octave effects* · *Heavy distortion* ·
  *Long reverb and delay* · *Nothing in particular*

## 3. Write rig.yaml and show them

Write the answers into `rig.yaml` on top of the draft `setup` produced, keeping
its detected values where the player did not contradict them. Then show the
finished file — it is short, they should see what you concluded, and a wrong line
is easier to spot than to re-ask about.

Say that `rig.yaml` is gitignored and stays on their machine, and that they can
edit it directly whenever the rig changes.

Then offer to make a tone, rather than waiting to be asked.
