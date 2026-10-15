# Anagram factory block catalog

The stock blocks of an Anagram on firmware v1.18.1.23, read from the device itself. Every Anagram on this firmware has these, so a tone built only from them works on anybody's pedal.

99 blocks, 672 parameters.

`sym min..max` is a range, `[a | b]` an enumeration, `(toggle)` on/off, `~` logarithmic.

## Amp & Cabs  (18)

### Artists Cabinet  `CAB`
`urn:darkglass-anagram:cabinet-artists`

- `enabled` (toggle) default 1  — Enabled  *bypass*
- `reset` (toggle) default 0  — Reset  *reset*
- `Blend` 0..100 default 100  %
- `Level` -12..12 default 0  dB  *quickpotDefault*

### Bass Cabinet  `CAB`
`urn:darkglass-anagram:cabinet-bass`

- `enabled` (toggle) default 1  — Enabled  *bypass*
- `reset` (toggle) default 0  — Reset  *reset*
- `Blend` 0..100 default 100  %
- `Level` -12..12 default 0  dB  *quickpotDefault*

### Black & Yellow TLIII  `BNY`
`urn:darkglass:neural-plugins:markku`

- `gain` 0..10 default 5  1dPt  — Gain
- `bass` 0..10 default 7  1dPt  — Bass
- `midlow` 0..10 default 6  1dPt  — Mid Low
- `midhigh` 0..10 default 5  1dPt  — Mid High
- `high` 0..10 default 6  1dPt  — High
- `modernfilter` 0..10 default 2  1dPt  — Modern Filter  *quickpotDefault*
- `vintagefilter` 0..10 default 1  1dPt  — Vintage Filter
- `level` 0..10 default 3.5  1dPt  — Level

### Fruity HB500  `FRU`
`urn:darkglass:neural-plugins:fruity`

- `gain` 0..10 default 5  1dPt  — Gain  *quickpotDefault*
- `overdrive` (toggle) default 0  — Overdrive
- `bass` 0..10 default 5  1dPt  — Bass
- `mid` 0..10 default 5  1dPt  — Middle
- `high` 0..10 default 5  1dPt  — Treble
- `level` 0..10 default 3.5  1dPt  — Level

### Gentle  `GNTL`
`urn:darkglass:neural-plugins:gentle`

- `output_lvl` -24..20 default -3  dB  — Level
- `bass` 0..10 default 4  1dPt  — Bass
- `treble` 0..10 default 2  1dPt  — Treble
- `low_cut` (toggle) default 0  — Low Cut

### Guitar Cabinet  `CAB`
`urn:darkglass-anagram:cabinet-guitar`

- `enabled` (toggle) default 1  — Enabled  *bypass*
- `reset` (toggle) default 0  — Reset  *reset*
- `Blend` 0..100 default 100  %
- `Level` -12..12 default 0  dB  *quickpotDefault*

### Harmonic Booster  `HBO`
`urn:darkglass:HBO`

- `Boost` 0..10 default 5  1dPt  *quickpotDefault*
- `Character` 0..10 default 0  1dPt
- `MidGain` 0..10 default 5  1dPt  — Mid Gain
- `MidFreq` 0..10 default 5  1dPt  — Mid Freq
- `Bass` 0..10 default 5  1dPt
- `Treble` 0..10 default 5  1dPt

### Jim Bass  `JIM`
`urn:darkglass:JimBass`

- `Volume` 0..10 default 5  1dPt  *quickpotDefault*
- `Master` 0..10 default 5  1dPt
- `Bass` 0..10 default 5  1dPt
- `Middle` 0..10 default 5  1dPt
- `Treble` 0..10 default 5  1dPt

### Kallinen-Kruukkeri  `KKR`
`urn:darkglass:neural-plugins:gallen-kallinen`

- `mid_contour` (toggle) default 1  — Mid Contour
- `bass` 0..10 default 5  1dPt  — Bass
- `lo_mid` 0..10 default 5  1dPt  — Lo-Mid
- `hi_mid` 0..10 default 5  1dPt  — Hi-Mid
- `treble` 0..10 default 5  1dPt  — Treble
- `level` -12..12 default 0  dB  — Level  *quickpotDefault*

### Leo Bass  `LEO`
`urn:darkglass:LeoBass`

- `Volume` 0..10 default 5.5  1dPt  *quickpotDefault*
- `Master` 0..10 default 4.4  1dPt
- `Bass` 0..10 default 5  1dPt
- `Middle` 0..10 default 5  1dPt
- `Treble` 0..10 default 2.2  1dPt

### Modern ISOBRICK750  `MIC`
`urn:darkglass:neural-plugins:modern-california-cln`

- `gain` 0..10 default 5.5  1dPt  — Gain  *quickpotDefault*
- `bass` 0..10 default 7  1dPt  — Bass
- `passivemid` 0..10 default 7  1dPt  — Passive Mid
- `activemid` 0..10 default 3  1dPt  — Active Mid
- `midfreq` 220..2500~ default 280  Hz  — Mid Freq
- `treble` 0..10 default 6  1dPt  — Treble
- `volume` 0..10 default 5  1dPt  — Level

### Modern ISOBRICK750 OD  `MIO`
`urn:darkglass:neural-plugins:modern-california-od`

- `gain` 0..10 default 4  1dPt  — Gain  *quickpotDefault*
- `overdrive` 0..10 default 6  1dPt  — Overdrive
- `bass` 0..10 default 6.5  1dPt  — Bass
- `passivemid` 0..10 default 6  1dPt  — Passive Mid
- `activemid` 0..10 default 6  1dPt  — Active Mid
- `midfreq` 220..2500~ default 1300  Hz  — Mid Freq
- `treble` 0..10 default 4  1dPt  — Treble
- `volume` 0..10 default 5  1dPt  — Level

### Peggy Bass  `PB`
`urn:darkglass:neural-plugins:peggy-bass`

- `ultra_lo` (toggle) default 0  — Ultra Lo
- `ultra_hi` (toggle) default 0  — Ultra Hi
- `bass` 0..10 default 5  1dPt  — Bass
- `midrange` 0..10 default 5  1dPt  — Midrange
- `mid_shift` [1 | 2 | 3] default 0.5  — Mid Shift
- `treble` 0..10 default 5  1dPt  — Treble
- `level` -12..12 default 0  dB  — Level  *quickpotDefault*

### Peggy Classic  `PGC`
`urn:darkglass:neural-plugins:peggycl`

- `input` [0dB | -15dB] default 0  — Input
- `gain` 0..10 default 3  1dPt  — Gain  *quickpotDefault*
- `ultra_lo` (toggle) default 0  — Ultra Lo
- `ultra_hi` (toggle) default 0  — Ultra Hi
- `bass` 0..10 default 5  1dPt  — Bass
- `mid` 0..10 default 5  1dPt  — Midrange
- `mid_freq` [1 | 2 | 3 | 4 | 5] default 3  — Mid Frequency
- `treble` 0..10 default 5  1dPt  — Treble
- `master` 0..10 default 3  1dPt  — Master
- `output_lvl` 0..10 default 5  1dPt  — Level

### Peggy FlipTop  `B15`
`urn:darkglass:neural-plugins:fliptop`

- `vol` 0..10 default 4  1dPt  — Volume  *quickpotDefault*
- `bass` 0..10 default 6  1dPt  — Bass
- `treble` 0..10 default 4  1dPt  — Treble
- `output_lvl` 0..10 default 2.5  1dPt  — Output Level

### SWE TC650  `SWE`
`urn:darkglass:neural-plugins:swe`

- `character` (toggle) default 1  — Character
- `gain` 0..10 default 5  1dPt  — Gain  *quickpotDefault*
- `bass` 0..10 default 6.5  1dPt  — Bass
- `middle` 0..10 default 5  1dPt  — Mid
- `middlefreq` 57..4000~ default 250  Hz  — Mid Freq
- `treble` 0..10 default 5  1dPt  — Treble
- `bright` 0..10 default 7  1dPt  — Bright
- `tubemode` (toggle) default 1  — Tube Mode
- `boostdrive` (toggle) default 0  — Boost Drive
- `drive` 0..10 default 2  1dPt  — Drive
- `level` 0..10 default 6.7  1dPt  — Level

### Super California  `SUC`
`urn:darkglass:neural-plugins:super-california`

- `volume` -24..0 default -12  dB  — Volume  *quickpotDefault*
- `bass` 0..10 default 5  1dPt  — Bass
- `mid` 0..10 default 5  1dPt  — Mid
- `treble` 0..10 default 5  1dPt  — Treble
- `master` -12..12 default 0  dB  — Master

### Swirl 900  `SWI`
`urn:darkglass:neural-plugins:swirl`

- `gain` 0..10 default 5  1dPt  — Gain
- `aurashaper` 0..10 default 7  1dPt  — Aura Shaper  *quickpotDefault*
- `bass` 0..10 default 7  1dPt  — Bass
- `lowmid` 0..10 default 6  1dPt  — Low Mid
- `lowmidfreq` 40..200~ default 89  Hz  — Low Mid Freq
- `mid` 0..10 default 2.5  1dPt  — Mid
- `midfreq` 280..1500~ default 637  Hz  — Mid Freq
- `himid` 0..10 default 4  1dPt  — Hi Mid
- `hiwmidfreq` 1500..6000 default 3750  Hz  — Hi Mid Freq
- `treble` 0..10 default 6  1dPt  — Treble
- `level` 0..10 default 3  1dPt  — Level

## Overdrive & Distortion  (12)

### Alpha Omicron  `AO`
`urn:darkglass:AlphaOmicron`

- `Drive` 0..10 default 5  1dPt  *quickpotDefault*
- `Growl` (toggle) default 0
- `Bite` (toggle) default 0
- `Mod` 0..10 default 5  1dPt
- `Level` 0..10 default 3.1  1dPt
- `Blend` 0..100 default 50  %

### Arc Dreamer  `ARC`
`urn:darkglass:neural-plugins:dreamer`

- `drive` 0..10 default 5  1dPt  — Drive  *quickpotDefault*
- `blend` 0..100 default 50  %  — Blend
- `treb` 0..10 default 5  — Treble
- `bass` 0..10 default 5  — Bass
- `level` 0..10 default 5  1dPt  — Level

### Atomic Sans  `ATM`
`urn:darkglass:neural-plugins:comic`

- `drive` 0..10 default 5  1dPt  — Drive  *quickpotDefault*
- `pres` 0..10 default 5  1dPt  — Presence
- `blend` 0..100 default 50  %  — Blend
- `treb` 0..10 default 5  — Treble
- `mid_shift` [500 Hz | 1000 Hz] default 0  — Mid Shift
- `mids` 0..10 default 5  1dPt  — Mid
- `bass_shift` [40 Hz | 80 Hz] default 0  — Bass Shift
- `bass` 0..10 default 5  1dPt  — Bass
- `level` 0..10 default 5  1dPt  — Level

### B3K  `B3K`
`urn:darkglass:B3K`

- `Drive` 0..10 default 8.4  1dPt  *quickpotDefault*
- `Grunt` (toggle) default 1
- `MidBoost` (toggle) default 0  — Mid Boost
- `Tone` 0..10 default 5  1dPt
- `Level` 0..10 default 5  1dPt
- `Blend` 0..100 default 50  %

### Bee Kolme OD  `BOD`
`urn:darkglass:neural-plugins:yellow`

- `gain` 0..10 default 5  1dPt  — Gain  *quickpotDefault*
- `blend` 0..100 default 50  %  — Blend
- `high` 0..10 default 5  — High
- `low` 0..10 default 5  — Low
- `level` 0..10 default 5  1dPt  — Level

### Chinchilla  `CHI`
`urn:darkglass:Chinchilla`

- `Distortion` 0..10 default 3.3  1dPt  *quickpotDefault*
- `Tone` 0..10 default 5  1dPt
- `Blend` 0..100 default 50  %
- `Volume` 0..10 default 5  1dPt

### Duality Fuzz  `DUA`
`urn:darkglass:neural-plugins:duality-fuzz`

- `duality` 0..10 default 0  1dPt  — Duality  *quickpotDefault*
- `filter` 0..10 default 5  1dPt  — Filter
- `level` -12..12 default 0  dB  — Level
- `blend` 0..100 default 100  %  — Blend

### Entropia  `ENT`
`urn:darkglass:entropia`

- `mid_drive_typemode` [Bypass | B3K Flat | B3K Grunt | B3K Midboost | B3K Both | VMT Flat | VMT Midboost 1 | VMT Midboost 2 | VMT Both | Alpha Flat | Alpha Growl | Alpha Bite | Alpha Both | Omega Flat | Omega Growl | Omega Bite | Omega Both | Chinchilla Flat | Chinchilla Midscoop | Chinchilla Midboost | Chinchilla Synth | B3K Turbo Flat | B3K Turbo Grunt | B3K Turbo Midboost | B3K Turbo Both | VMT Turbo Flat | VMT Turbo Midboost 1 | VMT Turbo Midboost 2 | VMT Turbo Both | Alpha Turbo Flat | Alpha Turbo Growl | Alpha Turbo Bite | Alpha Turbo Both | Omega Turbo Flat | Omega Turbo Growl | Omega Turbo Bite | Omega Turbo Both] default 7  — Drive TypeMode
- `hi_drive_typemode` [Bypass | B3K Flat | B3K Grunt | B3K Midboost | B3K Both | VMT Flat | VMT Midboost 1 | VMT Midboost 2 | VMT Both | Alpha Flat | Alpha Growl | Alpha Bite | Alpha Both | Omega Flat | Omega Growl | Omega Bite | Omega Both | Chinchilla Flat | Chinchilla Midscoop | Chinchilla Midboost | Chinchilla Synth | B3K Turbo Flat | B3K Turbo Grunt | B3K Turbo Midboost | B3K Turbo Both | VMT Turbo Flat | VMT Turbo Midboost 1 | VMT Turbo Midboost 2 | VMT Turbo Both | Alpha Turbo Flat | Alpha Turbo Growl | Alpha Turbo Bite | Alpha Turbo Both | Omega Turbo Flat | Omega Turbo Growl | Omega Turbo Bite | Omega Turbo Both] default 23  — Drive TypeMode
- `lo_level` -24..12 default 0  dB  — Low Level  *quickpotDefault*
- `lo_comp_type` [Bypass | FET | SCI] default 1  — Comp Type
- `lo_comp_mode` [FAST / FAST | FAST / MEDI | FAST / SLOW | MEDI / FAST | MEDI / MEDI | MEDI / SLOW | SLOW / FAST | SLOW / MEDI | SLOW / SLOW] default 0  — ATT / REL
- `lo_comp_amount` 0..10 default 5  1dPt  — Low Comp
- `lo_comp_ratio` [4:1 | 8:1 | 12:1 | 20:1] default 0  — Comp Ratio
- `lo_lp_freq` 40..20000~ default 250  Hz  — Lo-Pass Freq
- `mid_level` -24..12 default 0  dB  — Mid Level
- `mid_drive_amount` 0..10 default 5  1dPt  — Mid Drive
- `mid_hp_freq` 20..16000~ default 250  Hz  — Hi-Pass Freq
- `mid_lp_freq` 100..20000~ default 800  Hz  — Lo-Pass Freq
- `hi_level` -24..12 default 0  dB  — High Level
- `hi_drive_amount` 0..10 default 5  1dPt  — High Drive
- `hi_hp_freq` 20..16000~ default 800  Hz  — Hi-Pass Freq
- `hi_lp_freq` 1000..20000~ default 20000  Hz  — Lo-Pass Freq
- `lo_mute` (toggle) default 0  — LO Mute
- `mid_mute` (toggle) default 0  — MID Mute
- `hi_mute` (toggle) default 0  — HI Mute

### Green PiRate Fuzz  `GPF`
`urn:darkglass:neural-plugins:pirate`

- `dist` 0..10 default 5  1dPt  — Distortion  *quickpotDefault*
- `tone_enabled` (toggle) default 1  — Tone Enable
- `tone` 0..10 default 5  1dPt  — Tone
- `level` 0..10 default 5  1dPt  — Level
- `blend` 0..100 default 50  %  — Blend

### Microtubes X  `MTX`
`urn:darkglass:neural-plugins:microtubes-x`

- `low_pass` 50..500~ default 250  Hz  — Low Pass
- `low_comp` 0..10 default 5  1dPt  — Low Comp
- `low_level` 0..10 default 5  1dPt  — Low Level
- `high_level` 0..10 default 5  1dPt  — High Level
- `high_drive` 0..10 default 5  1dPt  — High Drive  *quickpotDefault*
- `high_pass` 100..1000~ default 500  Hz  — High Pass

### Mood Fuzz  `MOO`
`urn:darkglass:neural-plugins:mood`

- `gain` 0..10 default 5  1dPt  — Gain  *quickpotDefault*
- `bass` 0..10 default 5  1dPt  — Bass
- `mid` 0..10 default 5  1dPt  — Middle
- `high` 0..10 default 5  1dPt  — Treble
- `level` 0..10 default 3.5  1dPt  — Level
- `blend` 0..10 default 10  1dPt  — Blend

### Vintage Microtubes  `VMT`
`urn:darkglass:VMT`

- `Drive` 0..10 default 5  1dPt  *quickpotDefault*
- `Era` 0..10 default 5  1dPt
- `Level` 0..10 default 3  1dPt
- `Blend` 0..100 default 50  %

## EQs, Filters & Dynamics  (15)

### Amp EQ  `AEQ`
`urn:darkglass:AmpEq`

- `Low` -12..12 default 0  dB
- `LowMid` -12..12 default 0  dB  — Low Mid  *quickpotDefault*
- `LowMidFreq` [250 Hz | 500 Hz | 1 kHz] default 1  Hz  — Low Mid Freq
- `HighMid` -12..12 default 0  dB  — High Mid
- `HighMidFreq` [750 Hz | 1.5 kHz | 3.0 kHz] default 1  Hz  — High Mid Freq
- `High` -12..12 default 0  dB

### BUS Compressor  `BUS`
`urn:darkglass:BUSComp`

- `Threshold` -60..0 default -30  dB  *quickpotDefault*
- `Ratio` [1.5:1 | 2:1 | 4:1 | 10:1] default 2
- `Attack` [.1 ms | .3 ms | 1 ms | 3 ms | 10 ms | 30 ms] default 4
- `Release` [0.1 s | 0.3 s | 0.6 s | 1.2 s] default 0
- `OutputGain` -12..12 default 0  dB  — Output Gain
- `Blend` 0..100 default 100  %

### Compressor / Limiter  `CMP`
`urn:darkglass:CompLim`

- `Threshold` -60..0 default -30  dB  *quickpotDefault*
- `Ratio` [2:1 | 4:1 | 8:1 | 12:1 | 20:1 | 100:1] default 4
- `Knee` 0..10 default 1  dB
- `Attack` 0.01..100 default 1  ms
- `Release` 1..2000 default 200  ms
- `OutputGain` -12..12 default 0  dB  — Output Gain
- `Blend` 0..100 default 100  %

### Darkglass GEQ  `DGQ`
`urn:darkglass:DarkglassGEQ`

- `LowShelf` -12..12 default 0  dB  — Low Shelf
- `S250Hz` -12..12 default 0  dB  — 250 Hz
- `S500Hz` -12..12 default 0  dB  — 500 Hz
- `S1500Hz` -12..12 default 0  dB  — 1.5 kHz
- `S3kHz` -12..12 default 0  dB  — 3 kHz
- `HighShelf` -12..12 default 0  dB  — High Shelf
- `Level` -12..12 default 0  dB  *quickpotDefault*

### FET Compressor  `FET`
`urn:darkglass:FETComp`

- `Input` 0..10 default 5  1dPt  *quickpotDefault*
- `Output` 0..10 default 5  1dPt
- `Attack` 0..10 default 5  1dPt
- `Release` 0..10 default 5  1dPt
- `Ratio` [4:1 | 8:1 | 12:1 | 20:1 | All] default 1
- `Blend` 0..100 default 100  %

### Generic GEQ  `GEQ`
`urn:darkglass:GenericGEQ`

- `S100Hz` -12..12 default 0  dB  — 100 Hz
- `S200Hz` -12..12 default 0  dB  — 200 Hz
- `S400Hz` -12..12 default 0  dB  — 400 Hz
- `S800Hz` -12..12 default 0  dB  — 800 Hz
- `S1600Hz` -12..12 default 0  dB  — 1.6 kHz
- `S3200Hz` -12..12 default 0  dB  — 3.2 kHz
- `Level` -12..12 default 0  dB  *quickpotDefault*

### Gravitron  `GRA`
`urn:darkglass:Gravitron`

- `Sensitivity` 0..10 default 5  1dPt
- `Attack` 0..10 default 5  1dPt
- `Release` 0..10 default 5  1dPt
- `CutoffFreq` 0..10 default 5  1dPt  — Cutoff Freq  *quickpotDefault*
- `Mode` [LP | BP | HP] default 0

### HPF + LPF  `HLP`
`urn:darkglass:HPFLPF`

- `HPfreq` 20..20000~ default 20  Hz  — HP Freq  *quickpotDefault*
- `HPPslope` [-6 dB | -12 dB | -18 dB | -24 dB] default 0  — HP Slope
- `LPfreq` 20..20000~ default 20000  Hz  — LP Freq
- `LPslope` [-6 dB | -12 dB | -18 dB | -24 dB] default 0  — LP Slope

### Hi-pass filter  `HPF`
`urn:darkglass:HPF`

- `Frequency` 20..20000~ default 20  Hz  *quickpotDefault*
- `Slope` [-6 dB | -12 dB | -18 dB | -24 dB] default 0

### Ignissor  `IGN`
`urn:darkglass:ignissor`

- `comp_level` -24..12 default 0  dB  — Comp Level  *quickpotDefault*
- `clean_level` -24..12 default -24  dB  — Clean Level
- `lomid_xo_freq` 25..11000~ default 250  Hz  — Crossover 1
- `midhi_xo_freq` 36..16000~ default 1500  Hz  — Crossover 2
- `lo_comp_enabled` (toggle) default 1  — Low Comp
- `lo_threshold` -60..0 default -30  dB  — Low Threshold
- `lo_ratio` [2:1 | 4:1 | 8:1 | 12:1 | 20:1 | 100:1] default 4  — Low Ratio
- `lo_attack` 0.01..100~ default 1  ms  — Low Attack
- `lo_release` 1..2000~ default 200  ms  — Low Release
- `lo_level` -30..12 default 0  dB  — Low Level
- `mid_comp_enabled` (toggle) default 1  — Mid Comp
- `mid_threshold` -60..0 default -30  dB  — Mid Threshold
- `mid_ratio` [2:1 | 4:1 | 8:1 | 12:1 | 20:1 | 100:1] default 4  — Mid Ratio
- `mid_attack` 0.01..100~ default 1  ms  — Mid Attack
- `mid_release` 1..2000~ default 200  ms  — Mid Release
- `mid_level` -30..12 default 0  dB  — Mid Level
- `hi_comp_enabled` (toggle) default 1  — High Comp
- `hi_threshold` -60..0 default -30  dB  — High Threshold
- `hi_ratio` [2:1 | 4:1 | 8:1 | 12:1 | 20:1 | 100:1] default 4  — High Ratio
- `hi_attack` 0.01..100~ default 1  ms  — High Attack
- `hi_release` 1..2000~ default 200  ms  — High Release
- `hi_level` -30..12 default 0  dB  — High Level
- `lo_mute` (toggle) default 0  — LO Mute
- `mid_mute` (toggle) default 0  — MID Mute
- `hi_mute` (toggle) default 0  — HI Mute

### Lo-pass filter  `LPF`
`urn:darkglass:LPF`

- `Frequency` 20..20000~ default 20000  Hz  *quickpotDefault*
- `Slope` [-6 dB | -12 dB | -18 dB | -24 dB] default 0

### NA Noise Gate  `NGT`
`urn:nembriniaudio:noisegate`

- `Threshold` -120..0 default -89.7  dB
- `Range` 0..100 default 40.5  dB
- `Gate` 0..100 default 38.7  %

### Suppressor  `SUP`
`urn:darkglass:Suppressor`

- `Threshold` -80..0 default -40  dB  *quickpotDefault*
- `Amount` [Less | More] default 6  dB

### Wauwa  `WAU`
`urn:darkglass:wah`

- `Position` 0..10 default 0  1dPt  *quickpotDefault*
- `OutLvl` -12..12 default 0  dB  — Output Level
- `BypassAt0` (toggle) default 0  — Bypass at 0

### mo**erf***er  `MF`
`urn:darkglass:moerfer`

- `EnvAmount` 0..10 default 4.5  1dPt  — Env Amount
- `EnvMix` 0..10 default 7.5  1dPt  — Env Mix
- `Drive` 0..10 default 5  1dPt
- `FilterCutoff` 0..10 default 2.5  1dPt  — Filter Cutoff  *quickpotDefault*
- `FilterResonance` 0..10 default 9  1dPt  — Filter Reson
- `FilterPoles` [4-Pole | 2-Pole] default 1  — Filter Poles
- `EnvDecay` [Smooth | Fast] default 1  — Env Decay

## Modulation & Pitch  (14)

### Flamingo Flanger  `FLA`
`urn:darkglass:Flanger`

- `Depth` 0..10 default 10  1dPt
- `Rate` 0.1..10~ default 1  Hz
- `Blend` 0..100 default 50  %  *quickpotDefault*
- `HPF` [Low | Mid | High] default 0
- `Feedback` 0..10 default 5  1dPt

### Flamingo Flanger  `FLA`
`urn:darkglass:FlangerStereo`

- `Depth` 0..10 default 10  1dPt
- `Rate` 0.1..10~ default 1  Hz
- `Blend` 0..100 default 50  %  *quickpotDefault*
- `HPF` [Low | Mid | High] default 0
- `Feedback` 0..10 default 5  1dPt

### Mint Chocolate Chorus  `CHO`
`urn:darkglass:Chorus`

- `Depth` 0..10 default 5  1dPt
- `Rate` 0.1..10~ default 1.9  Hz
- `Blend` 0..100 default 50  %  *quickpotDefault*
- `HPF` [Low | Mid | High] default 0

### Mint Chocolate Chorus  `CHO`
`urn:darkglass:ChorusStereo`

- `Depth` 0..10 default 5  1dPt
- `Rate` 0.1..10~ default 1.9  Hz
- `Blend` 0..100 default 50  %  *quickpotDefault*
- `HPF` [Low | Mid | High] default 0

### Pharos Phaser  `PHA`
`urn:darkglass:dark-phaser`

- `enabled` (toggle) default 1  — Enabled  *bypass*
- `reset` (toggle) default 0  — Reset  *reset*
- `Color` [250 Hz | 500 Hz | 750 Hz | 1 kHz | 1.5 kHz] default 750  Hz
- `depth` 0..10800 default 3000  ct  — Depth
- `rate` 0.01..20~ default 0.2  Hz  — Rate  *quickpotDefault*
- `feedback` 0..10 default 7  1dPt  — Feedback
- `stages` [2 | 4 | 6 | 8] default 4  — Stages
- `stphase` 0..180 default 180  — Stereo Phase

### Pharos Phaser  `PHA`
`urn:darkglass:dark-phaser#stereo`

- `enabled` (toggle) default 1  — Enabled  *bypass*
- `reset` (toggle) default 0  — Reset  *reset*
- `Color` [250 Hz | 500 Hz | 750 Hz | 1 kHz | 1.5 kHz] default 750  Hz
- `depth` 0..10800 default 3000  ct  — Depth
- `rate` 0.01..20~ default 0.2  Hz  — Rate  *quickpotDefault*
- `feedback` 0..10 default 7  1dPt  — Feedback
- `stages` [2 | 4 | 6 | 8] default 4  — Stages
- `stphase` 0..180 default 180  — Stereo Phase

### Pitch Bender  `PB`
`urn:darkglass:PitchBender`

- `ShiftAmount` 0..10 default 0  1dPt  — Shift Amount  *quickpotDefault*
- `MaxShift` [-2 oct | -1 oct | -5th | -4th | -2nd | +2nd | +4th | +5th | +1 oct | +2 oct] default 24  — Max Shift
- `OutLvl` 0..10 default 10  1dPt  — Output Level

### Pitch Shifter  `PS`
`urn:darkglass:PitchShifter`

- `Semitone` -12..12 default 0  *quickpotDefault*
- `Detune` -50..50 default 0  ct  — Fine Tune
- `DryLevel` 0..10 default 0  1dPt  — Dry Level
- `WetLevel` 0..10 default 10  1dPt  — Wet Level
- `FilterCutoff` 0..10 default 10  1dPt  — Filter Cutoff

### Subcitri Octaver  `SCI`
`urn:darkglass:Subcitri`

- `CleanLevel` 0..10 default 5  1dPt  — Clean Level
- `OctaveLevel` 0..10 default 5  1dPt  — Octave Level  *quickpotDefault*
- `FilterCutoff` 0..10 default 5  1dPt  — Filter Cutoff

### Sublemon Octaver  `SLE`
`urn:darkglass:Sublemon`

- `CleanLevel` 0..10 default 5  1dPt  — Clean Level
- `OctaveLevel` 0..10 default 5  1dPt  — Octave Level  *quickpotDefault*
- `FilterCutoff` 0..10 default 5  1dPt  — Filter Cutoff

### Sublime Octaver  `SLI`
`urn:darkglass:Sublime`

- `CleanLevel` 0..10 default 5  1dPt  — Clean Level
- `OctaveLevel` 0..10 default 5  1dPt  — Octave Level  *quickpotDefault*
- `FilterCutoff` 0..10 default 5  1dPt  — Filter Cutoff

### Tremora Tremolo  `TRE`
`urn:darkglass:dark-tremolo`

- `enabled` (toggle) default 1  — Enabled  *bypass*
- `reset` (toggle) default 0  — Reset  *reset*
- `rate` 0.1..20~ default 5.5  Hz  — Rate  *quickpotDefault*
- `shape` 0..10 default 5  1dPt  — Shape
- `depth` 0..100 default 80  %  — Depth
- `stphase` 0..180 default 180  — Stereo Phase

### Tremora Tremolo  `TRE`
`urn:darkglass:dark-tremolo#stereo`

- `enabled` (toggle) default 1  — Enabled  *bypass*
- `reset` (toggle) default 0  — Reset  *reset*
- `rate` 0.1..20~ default 5.5  Hz  — Rate  *quickpotDefault*
- `shape` 0..10 default 5  1dPt  — Shape
- `depth` 0..100 default 80  %  — Depth
- `stphase` 0..180 default 180  — Stereo Phase

### Vibralis Vibrato  `VIB`
`urn:darkglass:dm-Vibrato`

- `enabled` (toggle) default 1  — Enabled  *bypass*
- `reset` (toggle) default 0  — Reset  *reset*
- `rate` 0.1..20~ default 4.2  Hz  — Rate  *quickpotDefault*
- `depth` 0..100 default 30  %  — Depth
- `shape` [Sine | Triangle] default 1  — Shape

## Delays & Reverbs  (13)

### Analog Delay  `AD`
`urn:darkglass:AnalogDelay`

- `Blend` 0..100 default 33  %  *quickpotDefault*
- `Time` 0..10 default 4.4  1dPt
- `Range` [0.01-0.1 s | 0.1-1 s | 1-2 s] default 1
- `Subdivision` [Tempo ctl off | 1/2 | 1/2 dot | 1/2 trip | 1/4 | 1/4 dot | 1/4 trip | 1/8 | 1/8 dot | 1/8 trip | 1/16 | 1/16 dot | 1/16 trip] default 0
- `Feedback` 0..10 default 2  1dPt
- `Trails` (toggle) default 0
- `TempoBPM` 40..300 default 60  — Tempo BPM  *hostTempo*

### Digital Delay  `DD`
`urn:darkglass:DigitalDelay`

- `Blend` 0..100 default 33  %  *quickpotDefault*
- `Time` 0..10 default 1.6  1dPt
- `Range` [0.01-0.1 s | 0.1-1 s | 1-2 s] default 1
- `Subdivision` [Tempo ctl off | 1/2 | 1/2 dot | 1/2 trip | 1/4 | 1/4 dot | 1/4 trip | 1/8 | 1/8 dot | 1/8 trip | 1/16 | 1/16 dot | 1/16 trip] default 0
- `Feedback` 0..10 default 2  1dPt
- `Trails` (toggle) default 0
- `TempoBPM` 40..300 default 60  — Tempo BPM  *hostTempo*

### Hall Reverb  `HAL`
`urn:darkglass:HallReverb`

- `Dry` 0..10 default 10  1dPt
- `Wet` 0..10 default 5  1dPt  *quickpotDefault*
- `Decay` 0..10 default 5  1dPt
- `Modulation` 0..10 default 5  1dPt
- `Damping` 0..10 default 5  1dPt
- `HiCut` 0..10 default 0  1dPt  — High Cut
- `LoCut` 0..10 default 0  1dPt  — Low Cut
- `Trails` (toggle) default 0

### Hall Reverb  `HAL`
`urn:darkglass:HallReverbStereo`

- `Dry` 0..10 default 10  1dPt
- `Wet` 0..10 default 5  1dPt  *quickpotDefault*
- `Decay` 0..10 default 5  1dPt
- `Modulation` 0..10 default 5  1dPt
- `Damping` 0..10 default 5  1dPt
- `HiCut` 0..10 default 0  1dPt  — High Cut
- `LoCut` 0..10 default 0  1dPt  — Low Cut
- `Trails` (toggle) default 0

### Modulation Delay  `MD`
`urn:darkglass:ModDelay`

- `Blend` 0..100 default 50  %  *quickpotDefault*
- `Time` 0..10 default 5.9  1dPt
- `Range` [0.01-0.1 s | 0.1-1 s | 1-2 s] default 1
- `Subdivision` [Tempo ctl off | 1/2 | 1/2 dot | 1/2 trip | 1/4 | 1/4 dot | 1/4 trip | 1/8 | 1/8 dot | 1/8 trip | 1/16 | 1/16 dot | 1/16 trip] default 0
- `Feedback` 0..10 default 3.3  1dPt
- `LPcutoff` 200..20000~ default 3981  Hz  — LP Cutoff
- `HPcutoff` 20..2000~ default 91  Hz  — HP Cutoff
- `ModDepth` 0..10 default 3.3  1dPt  — Mod Depth
- `ModRate` 0.2..2 default 0.794  Hz  — Mod Rate
- `Trails` (toggle) default 0
- `TempoBPM` 40..300 default 60  — Tempo BPM  *hostTempo*

### Plate Reverb  `PLA`
`urn:darkglass:PlateReverb`

- `Dry` 0..10 default 10  1dPt
- `Wet` 0..10 default 5  1dPt  *quickpotDefault*
- `Decay` 0..10 default 5  1dPt
- `Modulation` 0..10 default 5  1dPt
- `Damping` 0..10 default 5  1dPt
- `HiCut` 0..10 default 0  1dPt  — High Cut
- `LoCut` 0..10 default 0  1dPt  — Low Cut
- `Trails` (toggle) default 0

### Plate Reverb  `PLA`
`urn:darkglass:PlateReverbStereo`

- `Dry` 0..10 default 10  1dPt
- `Wet` 0..10 default 5  1dPt  *quickpotDefault*
- `Decay` 0..10 default 5  1dPt
- `Modulation` 0..10 default 5  1dPt
- `Damping` 0..10 default 5  1dPt
- `HiCut` 0..10 default 0  1dPt  — High Cut
- `LoCut` 0..10 default 0  1dPt  — Low Cut
- `Trails` (toggle) default 0

### Room Reverb  `ROO`
`urn:darkglass:RoomReverb`

- `Dry` 0..10 default 10  1dPt
- `Wet` 0..10 default 5  1dPt  *quickpotDefault*
- `Decay` 0..10 default 5  1dPt
- `Modulation` 0..10 default 5  1dPt
- `Damping` 0..10 default 5  1dPt
- `HiCut` 0..10 default 0  1dPt  — High Cut
- `LoCut` 0..10 default 0  1dPt  — Low Cut
- `Trails` (toggle) default 0

### Room Reverb  `ROO`
`urn:darkglass:RoomReverbStereo`

- `Dry` 0..10 default 10  1dPt
- `Wet` 0..10 default 5  1dPt  *quickpotDefault*
- `Decay` 0..10 default 5  1dPt
- `Modulation` 0..10 default 5  1dPt
- `Damping` 0..10 default 5  1dPt
- `HiCut` 0..10 default 0  1dPt  — High Cut
- `LoCut` 0..10 default 0  1dPt  — Low Cut
- `Trails` (toggle) default 0

### Shimmer Reverb  `SHI`
`urn:darkglass:ShimmerReverb`

- `Dry` 0..10 default 10  1dPt
- `Wet` 0..10 default 5  1dPt  *quickpotDefault*
- `Decay` 0..10 default 5  1dPt
- `Modulation` 0..10 default 5  1dPt
- `Damping` 0..10 default 5  1dPt
- `HiCut` 0..10 default 0  1dPt  — High Cut
- `LoCut` 0..10 default 0  1dPt  — Low Cut
- `Pitch` [Dark | Bright] default 1
- `Trails` (toggle) default 0

### Shimmer Reverb  `SHI`
`urn:darkglass:ShimmerReverbStereo`

- `Dry` 0..10 default 10  1dPt
- `Wet` 0..10 default 5  1dPt  *quickpotDefault*
- `Decay` 0..10 default 5  1dPt
- `Modulation` 0..10 default 5  1dPt
- `Damping` 0..10 default 5  1dPt
- `HiCut` 0..10 default 0  1dPt  — High Cut
- `LoCut` 0..10 default 0  1dPt  — Low Cut
- `Pitch` [Dark | Bright] default 1
- `Trails` (toggle) default 0

### Spring Reverb  `SPR`
`urn:darkglass:spring-reverb`

- `dry` 0..10 default 10  1dPt  — Dry
- `wet` 0..10 default 2  1dPt  — Wet
- `length` 0..10 default 5  1dPt  — Length
- `tension` 0..10 default 8  1dPt  — Tension
- `tone` 0..10 default 5  1dPt  — Tone
- `modulation` 0..10 default 0  1dPt  — Modulation
- `trails` (toggle) default 0  — Trails

### Spring Reverb  `SPR`
`urn:darkglass:spring-reverb#stereo`

- `dry` 0..10 default 10  1dPt  — Dry
- `wet` 0..10 default 2  1dPt  — Wet
- `lenght` 0..10 default 5  1dPt  — Lenght
- `tension` 0..10 default 8  1dPt  — Tension
- `tone` 0..10 default 5  1dPt  — Tone
- `modulation` 0..10 default 0  1dPt  — Modulation
- `trails` (toggle) default 0  — Trails

## Utilities  (27)

### Axioma Mono Synth  `AXO`
`urn:darkglass:axioma_synth`

- `enabled` (toggle) default 1  — Enabled  *bypass*
- `reset` 0..1 default 0  — Reset  *reset*
- `sensitivity` 0..10 default 4  1dPt  — Sensitivity
- `osc1_vol` 0..10 default 8  1dPt  — Osc 1 Vol
- `osc1_wave` [Saw | Square | Triangle] default 0  — Osc 1 Wave
- `osc2_vol` 0..10 default 5  1dPt  — Osc 2 Vol
- `osc2_wave` [Saw | Square | Triangle] default 0  — Osc 2 Wave
- `osc2_semitone` -12..12 default 12  — Osc 2 Semitone
- `osc2_cents` -50..50 default -12  1dPt  — Osc 2 Fine
- `sub_vol` 0..10 default 0  1dPt  — Sub Osc Vol
- `cutoff` 0..10 default 5.5  1dPt  — Cutoff
- `reso` 0..10 default 4  1dPt  — Resonance
- `env` 0..10 default 5.5  1dPt  — Envelope
- `attack` 0..10 default 0  1dPt  — Attack
- `decay` 0..10 default 3  1dPt  — Decay
- `release` 0..10 default 0  1dPt  — Release
- `blend` 0..10 default 10  1dPt  — Dry/Wet Blend
- `level` 0..10 default 3  1dPt  — Synth Level
- `instrument` [4-String Bass | 5-String Bass | 6-String Bass | Guitar | Full Range] default 1  — Instrument
- `arp_enable` (toggle) default 0  — Arpeggiator
- `TempoBPM` 40..300 default 90  — Tempo BPM
- `arp_key` [No Key | C | C#/Db | D | D#/Eb | E | F | F#/Gb | G | G#/Ab | A | A#/Bb | B] default 0  — Key
- `arp_scale` [Major | Minor | Major 7 | Minor 7 | Minor Maj7] default 0  — Scale
- `arp_pattern` [Up | Down | Up/Down | Random] default 0  — Pattern
- `arp_octaves` 1..3 default 1  — Octave Range

### Expression Pedal  ``
`urn:darkglass-anagram:exp-pedal`

- `min` 0..1 default 0.00015  — Minimum
- `max` 0..1 default 0.526  — Maximum

### FX loop  `FXL`
`urn:darkglass-anagram:fxloop`

- `SendLevel` -24..6 default 0  dB  — Send Level
- `Mix` 0..100 default 100  %  — Blend  *quickpotDefault*
- `OutputLevel` -24..6 default 0  dB  — Output Level
- `RetPolInv` [Normal | Inverted] default 0  — Return Polarity
- `FXloopIOconfig` [SendReturnMM | SendReturnMST | SendReturnSTST | InsertExp | Undefined] default 4  — FXloop IO config

### Gain  `GAI`
`urn:darkglass:Gain`

- `Gain` -40.1..20 default 0  dB  *quickpotDefault*
- `PolarityInversion` (toggle) default 0  — Invert Polarity

### LP3  ``
`http://looperlative.com/plugins/lp3-anagram`

- `rec_dub` (toggle) default 0  — Rec/Dub
- `play_stop` (toggle) default 0  — Play/Stop
- `undo` (toggle) default 0  — Undo
- `redo` (toggle) default 0  — Redo
- `erase_all` (toggle) default 0  — Erase
- `wetLevel` -30..0 default 0  dB  — Wet Level
- `slotNumber` 1..126 default 1  — Slot Number
- `dryLevel` 0..1 default 1  — Dry Level
- `waveform` (toggle) default 0  — Waveform
- `stop` (toggle) default 0  — Stop

### Level Meter  ``
`http://gareus.org/oss/lv2/modmeter`

- `reset` (toggle) default 0  — Reset Peak Hold

### MIDI CC helper  ``
`urn:darkglass-anagram:midi-cc-helper`

- `in0` 0..127 default 0  — In0
- `in1` 0..127 default 0  — In1
- `in2` 0..127 default 0  — In2
- `in3` 0..127 default 0  — In3
- `in4` 0..127 default 0  — In4
- `in5` 0..127 default 0  — In5
- `in6` 0..127 default 0  — In6
- `in7` 0..127 default 0  — In7
- `in8` 0..127 default 0  — In8
- `in9` 0..127 default 0  — In9

### MIDI Program Change Generator  ``
`urn:darkglass-anagram:midi-pc-gen`

- `trigger` (toggle) default 0  — Trigger

### Merge  `MRG`
`urn:darkglass-anagram:merge`

- `Blend` 0..100 default 50  %  *quickpotDefault*
- `Level` -24..6 default 0  dB

### Meters  ``
`urn:darkglass-anagram:meters`

- `InputClipLvl` 0.001..1 default 1  — Input Clip Level

### Mixer  `MIX`
`urn:darkglass-anagram:mixer`

- `HpLVol` -30..6 default 0  dB  — HP L Volume
- `HpRVol` -30..6 default 0  dB  — HP R Volume
- `XlrLVol` -30..6 default 0  dB  — XLR L Volume
- `XlrRVol` -30..6 default 0  dB  — XLR R Volume
- `TrsLVol` -30..6 default 0  dB  — TRS L Volume
- `TrsRVol` -30..6 default 0  dB  — TRS R Volume
- `HpLMute` (toggle) default 0  — HP L Mute
- `HpRMute` (toggle) default 0  — Hp R Mute
- `XlrLMute` (toggle) default 0  — XLR L Mute
- `XlrRMute` (toggle) default 0  — XLR R Mute
- `TrsLMute` (toggle) default 0  — TRS L Mute
- `TrsRMute` (toggle) default 0  — TRS R Mute
- `HpLMasterVolLink` (toggle) default 1  — HP L Master Vol Link
- `HpRMasterVolLink` (toggle) default 1  — HP R Master Vol Link
- `XlrLMasterVolLink` (toggle) default 1  — XLR L Master Vol Link
- `XlrRMasterVolLink` (toggle) default 1  — XLR R Master Vol Link
- `TrsLMasterVolLink` (toggle) default 1  — TRS L Master Vol Link
- `TrsRMasterVolLink` (toggle) default 1  — TRS R Master Vol Link
- `USBMasterVolLink` (toggle) default 1  — USB Master Vol Link
- `BTMasterVolLink` (toggle) default 1  — Bluetooth Master Vol Link
- `BTRouting` 0..31 default 31  — Bluetooth Routing Bit Mask
- `MasterVol` -30..6 default -12  dB  — Master Volume
- `MasterMute` (toggle) default 0  — Master Mute

### Neural Amp  `NA`
`urn:darkglass:neural:amp`

- `enabled` (toggle) default 1  — Enabled  *bypass*
- `reset` (toggle) default 0  — Reset  *reset*
- `INPUT` -20..20 default 0  dB  — Input  *quickpotDefault*
- `OUTPUT` -20..20 default 0  dB  — Output
- `Low` -12..12 default 0  dB
- `LowMid` -12..12 default 0  dB  — Low Mid
- `LowMidFreq` [250 Hz | 500 Hz | 1 kHz] default 1  Hz  — Low Mid Freq
- `HighMid` -12..12 default 0  dB  — High Mid
- `HighMidFreq` [750 Hz | 1.5 kHz | 3.0 kHz] default 1  Hz  — High Mid Freq
- `High` -12..12 default 0  dB
- `EQPOS` [Off | PRE | POST] default 2  — EQpos
- `SlimSize` [Lite | Full] default 1  — Slimmable Size

### Neural Loader  `NL`
`urn:darkglass:neural:misc`

- `enabled` (toggle) default 1  — Enabled  *bypass*
- `reset` (toggle) default 0  — Reset  *reset*
- `INPUT` -20..20 default 0  dB  — Input  *quickpotDefault*
- `OUTPUT` -20..20 default 0  dB  — Output
- `SlimSize` [Lite | Full] default 1  — Slimmable Size

### Neural Pedal  `NP`
`urn:darkglass:neural:pedal`

- `enabled` (toggle) default 1  — Enabled  *bypass*
- `reset` (toggle) default 0  — Reset  *reset*
- `Input` -20..20 default 0  dB  *quickpotDefault*
- `Output` -20..20 default 0  dB
- `Blend` 0..100 default 100  %
- `SlimSize` [Lite | Full] default 1  — Slimmable Size

### Output  `OUT`
`urn:darkglass-anagram:output`

- `xlrL` (toggle) default 0  — Out 1 (XLR)
- `xlrR` (toggle) default 0  — Out 2 (XLR)
- `jackL` (toggle) default 0  — Out 3 (1/4")
- `jackR` (toggle) default 0  — Out 4 (1/4")
- `headphones` (toggle) default 0  — Headphones

### Parametric EQ  `PEQ`
`urn:darkglass:fil4#mono`

- `enable` (toggle) default 1  — Enable  *bypass*
- `gain` -18..18 default 0  dB  — Gain
- `peakreset` (toggle) default 1  — Reset Peak Hold
- `HighPass` (toggle) default 0  — Highpass
- `HPfreq` 5..1250~ default 20  Hz  — Highpass Frequency
- `HPQ` 0..1.4 default 0.7  — Highpass Resonance
- `LowPass` (toggle) default 0  — Lowpass
- `LPfreq` 500..20000~ default 20000  Hz  — Lowpass Frequency
- `LPQ` 0..1.4 default 1  — Lowpass Resonance
- `LSsec` (toggle) default 1  — Lowshelf
- `LSfreq` 25..300~ default 80  Hz  — Lowshelf Freq
- `LSwidth` 0..1 default 0.33  — Lowshelf Width
- `LSgain` -18..18 default 0  dB  — Lowshelf Gain  *quickpotDefault*
- `sec1` (toggle) default 1  — Section 1
- `freq1` 20..320~ default 160  Hz  — Frequency 1
- `width1` 0..1 default 0.5  — Width 1
- `gain1` -18..18 default 0  dB  — Gain 1
- `sec2` (toggle) default 1  — Section 2
- `freq2` 80..1250~ default 397  Hz  — Frequency 2
- `width2` 0..1 default 0.5  — Width 2
- `gain2` -18..18 default 0  dB  — Gain 2
- `sec3` (toggle) default 1  — Section 3
- `freq3` 320..5000~ default 1250  Hz  — Frequency 3
- `width3` 0..1 default 0.5  — Width 3
- `gain3` -18..18 default 0  dB  — Gain 3
- `sec4` (toggle) default 1  — Section 4
- `freq4` 1250..20000~ default 2500  Hz  — Frequency 4
- `width4` 0..1 default 0.5  — Width 4
- `gain4` -18..18 default 0  dB  — Gain 4
- `HSsec` (toggle) default 1  — Highshelf
- `HSfreq` 1500..16000~ default 8000  Hz  — Highshelf Freq
- `HSwidth` 0..1 default 0.33  — Highshelf W
- `HSgain` -18..18 default 0  dB  — Highshelf Gain

### Parametric EQ  `PEQ`
`urn:darkglass:fil4#stereo`

- `enable` (toggle) default 1  — Enable  *bypass*
- `gain` -18..18 default 0  dB  — Gain
- `peakreset` (toggle) default 1  — Reset Peak Hold
- `HighPass` (toggle) default 0  — Highpass
- `HPfreq` 5..1250~ default 20  Hz  — Highpass Frequency
- `HPQ` 0..1.4 default 0.7  — Highpass Resonance
- `LowPass` (toggle) default 0  — Lowpass
- `LPfreq` 500..20000~ default 20000  Hz  — Lowpass Frequency
- `LPQ` 0..1.4 default 1  — Lowpass Resonance
- `LSsec` (toggle) default 1  — Lowshelf
- `LSfreq` 25..300~ default 80  Hz  — Lowshelf Freq
- `LSwidth` 0..1 default 0.33  — Lowshelf Width
- `LSgain` -18..18 default 0  dB  — Lowshelf Gain  *quickpotDefault*
- `sec1` (toggle) default 1  — Section 1
- `freq1` 20..320~ default 160  Hz  — Frequency 1
- `width1` 0..1 default 0.5  — Width 1
- `gain1` -18..18 default 0  dB  — Gain 1
- `sec2` (toggle) default 1  — Section 2
- `freq2` 80..1250~ default 397  Hz  — Frequency 2
- `width2` 0..1 default 0.5  — Width 2
- `gain2` -18..18 default 0  dB  — Gain 2
- `sec3` (toggle) default 1  — Section 3
- `freq3` 320..5000~ default 1250  Hz  — Frequency 3
- `width3` 0..1 default 0.5  — Width 3
- `gain3` -18..18 default 0  dB  — Gain 3
- `sec4` (toggle) default 1  — Section 4
- `freq4` 1250..20000~ default 2500  Hz  — Frequency 4
- `width4` 0..1 default 0.5  — Width 4
- `gain4` -18..18 default 0  dB  — Gain 4
- `HSsec` (toggle) default 1  — Highshelf
- `HSfreq` 1500..16000~ default 8000  Hz  — Highshelf Freq
- `HSwidth` 0..1 default 0.33  — Highshelf W
- `HSgain` -18..18 default 0  dB  — Highshelf Gain

### Return  `RET`
`urn:darkglass-anagram:return`

- `Mix` 0..100 default 50  %  — Blend  *quickpotDefault*
- `OutputLevel` -24..6 default 6  dB  — Output Level
- `RetPolInv` [Normal | Inverted] default 0  — Return Polarity
- `FXloopIOconfig` [SendReturnMM | SendReturnMST | SendReturnSTST | InsertExp | Undefined] default 4  — FXloop IO config

### Send  `SND`
`urn:darkglass-anagram:send`

- `SendLevel` -24..6 default 0  dB  — Send Level  *quickpotDefault*
- `ThroughLevel` -24..6 default 0  dB  — Through Level
- `FXloopIOconfig` [SendReturnMM | SendReturnMST | SendReturnSTST | InsertExp | Undefined] default 4  — FXloop IO config

### Sine wave generator  ``
`urn:darkglass-anagram:sine-gen`

- `freq` 20..20000~ default 100  Hz  — Frequency

### Spectrum Analyzer  ``
`http://gareus.org/oss/lv2/modspectre`

- `response` 0.01..10~ default 1  Hz  — Response Time

### Split  `SPL`
`urn:darkglass-anagram:split`

- `LevelRow1` -24..6 default 0  dB  — Level Row 1  *quickpotDefault*
- `LevelRow2` -24..6 default 0  dB  — Level Row 2
- `Crossover` [Off | 1 Lo, 2 Hi | 1 Hi, 2 Lo] default 0
- `CrossoverFreq` 20..20000~ default 100  Hz  — Crossover Freq

### TONE3000 NAM Loader  `T3K`
`urn:darkglass:neural:tone3000`

- `enabled` (toggle) default 1  — Enabled  *bypass*
- `reset` (toggle) default 0  — Reset  *reset*
- `INPUT` -20..20 default 0  dB  — Input  *quickpotDefault*
- `OUTPUT` -20..20 default 0  dB  — Output
- `S100Hz` -12..12 default 0  dB  — 100 Hz
- `S200Hz` -12..12 default 0  dB  — 200 Hz
- `S400Hz` -12..12 default 0  dB  — 400 Hz
- `S800Hz` -12..12 default 0  dB  — 800 Hz
- `S1600Hz` -12..12 default 0  dB  — 1.6 kHz
- `S3200Hz` -12..12 default 0  dB  — 3.2 kHz
- `EQPOS` [Off | PRE | POST] default 2  — EQpos
- `Blend` 0..100 default 100  %
- `SlimSize` [Lite | Full] default 1  — Slimmable Size

### Tone3000 Cabinet  `T3K`
`urn:darkglass-anagram:cabinet-tone3000#stereo`

- `enabled` (toggle) default 1  — Enabled  *bypass*
- `reset` (toggle) default 0  — Reset  *reset*
- `Blend` 0..100 default 100  %
- `Level` -12..12 default 0  dB  *quickpotDefault*

### Tuner  `TUN`
`urn:darkglass:Tuner`

- `Mute` (toggle) default 1
- `Reference` 420..460 default 440  Hz

### User Cabinet  `CAB`
`urn:darkglass-anagram:cabinet-user`

- `enabled` (toggle) default 1  — Enabled  *bypass*
- `reset` (toggle) default 0  — Reset  *reset*
- `Blend` 0..100 default 100  %
- `Level` -12..12 default 0  dB  *quickpotDefault*

### Volume Pedal  `VOL`
`urn:darkglass:VolumePedal`

- `Volume` 0..10 default 10  1dPt  *quickpotDefault*
