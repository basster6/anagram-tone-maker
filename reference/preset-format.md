# Anagram preset document format

Verified against every preset read off a real device. Plain JSON, UTF-8, no
comments or trailing commas.

## Shape

```json
{ "preset": { ... }, "type": "preset", "version": 1 }
```

`type` must be `"preset"` and `version` must be `1`. The smallest valid document
is `{"preset":{},"type":"preset","version":1}`.

## Inside `preset`

Every field is optional, but a tone needs `chains`.

| field | type | notes |
|---|---|---|
| `name` | string | shown on the pedal |
| `chains` | object | the signal chain |
| `bindings` | object | hardware assignments; omit unused actuators entirely |
| `scene` | integer | the active scene, **counting from 0** — unlike everything else here |
| `sceneNames` | object | custom scene names, keys `"1"`-`"3"` |
| `uuid` | string | 56 lowercase hex digits in `16-8-8-24` groups. The device stores whatever you send, so give a new preset a fresh one |

## `chains`

```
chains -> "<row>" -> blocks -> "<slot>" -> { uri, enabled, parameters, properties, quickpot, scenes }
```

- `row` is `"1"` or `"2"`, as a **string key**. Row 2 is the parallel path.
- `slot` is `"1"` to `"12"`, also a string key. **Empty slots are simply absent**,
  so the keys legitimately have gaps; the signal runs through occupied slots in
  ascending order.
- `uri` is the only required field on a block.
- `enabled` false means bypassed. Absent means enabled.

### `parameters` and `properties`

Both are objects keyed `"1"`, `"2"`, `"3"` … with **no gaps**.

```json
"parameters": { "1": { "name": "Drive", "symbol": "Drive", "value": 7.2 } },
"properties": { "1": { "name": "Cabinet File",
                       "uri": "urn:darkglass-anagram:cabinet-bass#file",
                       "value": "/factory-data/cabinets/Ampeg 410 52 1 On_01-MP.dat" } }
```

`symbol` identifies a parameter; `name` is for display only. A property's `uri` is
`<plugin uri>#<property>` and its `value` is a device-side absolute path — user
files live under `/data/user-files/`, factory content under `/factory-data/`.

A preset stores **only the parameters it needs to**; a block's real parameter list
comes from `blocks.json`, and `quickpot` or a binding may name a parameter that is
not stored in the file.

### `quickpot`

The symbol promoted to the pedal's quick knob. Absent means the block's own
default.

### `scenes`

Keyed `"1"`-`"3"`, gaps allowed, holding **only what differs** from the base
values. Note that `parameters` here is an **array**, unlike the block's object.

```json
"scenes": {
  "1": { "enabled": true,  "parameters": [] },
  "2": { "enabled": false, "parameters": [ { "symbol": "Blend", "value": 64 } ] }
}
```

## `bindings`

One entry per hardware actuator, keyed `pot1`-`pot6`, `foot1`-`foot3`, `exp.pedal`.

```json
"exp.pedal": {
  "name": "Wah",
  "parameters": [ { "block": 2, "row": 1, "symbol": "Position", "min": 0, "max": 10 } ],
  "properties": [],
  "value": 0
}
```

- `parameters` targets need `row`, `block` and `symbol`; `min`/`max` are optional
  but must appear **as a pair**. `min` greater than `max` inverts the sweep, which
  the format allows deliberately.
- `value` is normalised 0-1 and only matters for macros — more than one target on
  a single actuator.
- Symbols starting with `:` are special: `:bypass` toggles the block, and
  file-list blocks use `:cab` and `:mic`.
- Footswitch bindings only act in Stomp mode.

## Limits

| | |
|---|---|
| chain rows | 2 |
| slots per row | 12 |
| scenes per preset | 3 |
| presets per bank | 3 (banks are addressed `01A`, `01B`, `01C`, `02A` …) |
| preset slots | 126 (42 banks x 3); the file name is the slot number, so `17A` is `49.json` |
| hardware actuators | 10 |

## Units seen in block metadata

`%`, `Hz`, `dB`, `ms`, `ct` (cents), `1dPt` (tempo division).

## Writing a preset to the device

```json
edit_anagram_presets {
  "presets": [ { "name": "49.json",
                 "content": { "preset": {...}, "type": "preset", "version": 1 } } ]
}
```

`presets` is an array, so several slots can be written at once. `name` is the
slot's file name and `content` is the whole document. The device writes it to
`/data/user-files/presets/<name>` and keeps the document's own `uuid`.

Note that pushing a preset *file* over the serial port is a different mechanism,
and it is blocked: `open_file_receiver` answers `Invalid dirName` for `presets`.
