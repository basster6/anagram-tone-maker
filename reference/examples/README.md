# Example presets

Real presets pulled off a device with `cli.py get`, kept as references for the
file format rather than as tones worth loading.

| File | What it shows |
|---|---|
| `13.json` | the smallest useful preset — a couple of blocks and nothing else |
| `41.json` | a five-block serial chain |
| `1.json` | two rows, with scenes and bindings filled in |
| `2.json` | a cabinet block carrying a cabinet file in `properties` |

**Some of these reference blocks that are not on every Anagram** — paid blocks
from the marketplace appear in `1.json` and `41.json`. The device will not load a
preset naming a block it does not have. Read them for the structure, not to play
them.
