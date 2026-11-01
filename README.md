# DEVICE — Kaizo Roaring Knight (web port)

Browser port of the **DELTARUNE Chapter 3 "Kaizo Knight v3.0"** mod, containing only the
Kaizo Knight fight and its cutscenes.

Built by running the xdelta-patched Chapter 3 `data.win` through the gx.games WASM web
runner — no GameMaker IDE required.

## Play

Open `game.html` (or the site root, which redirects there) and pick a save file:

| Route | Save file | Effect |
| --- | --- | --- |
| Normal | `save/filech3_0_normal` | Side A — regular Knight fight |
| Weird | `save/filech3_0_weird` | `flag[456] = 1` — Side B fight, Thorn Ring in inventory |
| Abandoned Weird | `save/filech3_0_abandoned` | `flag[454] = 1`, Side A, Thorn Ring in inventory |

The chosen save is written into the runner's IndexedDB filesystem (`/_savedata`) before
the game starts, and a patched `DEVICE_MENU` create event calls `scr_load()` so the port
boots straight into the seeded save instead of the file-select screen.

Noelle can be added to the party at the sign near the start, so the Thorn Ring
(Noelle-only in the base game) can be equipped there.

## Controls

- **Keyboard:** Z / Enter confirm, X / Shift cancel, arrows move, C menu.
- **Touch:** on-screen D-pad + Z / X / C buttons.
- **Controller editor:** the ⚙ button toggles LOCK / UNLOCK. Unlocked controls can be
  dragged and resized; the layout is saved to `localStorage` under `kaizo_ctrl_layout`.
  RESET TO DEFAULT restores the shipped layout.

## Layout

```
game.html          route menu, mobile controls, controller editor, boot logic
index.html         redirects to game.html
preload.js         seeds the selected route save into IndexedDB
index.js           gx.games runner bootstrap (Module setup)
runner-sw.js       registers sw.js, then loads runner.js
runner.js/.wasm    gx.games WASM runner
runner.data        runner preloaded data
sw.js              caches assets and reassembles game.unx from its parts
game.unx.part0..2  the patched game data (143,081,620 bytes), split for GitHub
save/              the three route save files
mus/, vid/, *.ogg  game assets
```

### Why `game.unx` is split

The patched game data is 136 MB and GitHub rejects any single file over 100 MB, so it
ships as three `game.unx.partN` files. `sw.js` streams them back out as one
`game.unx` response. Because of this the port **must be served over HTTP(S)** — opening
`game.html` from `file://` will not work.

## Rebuilding the game data

The only modification to the game data is the autoload patch in
`gml_Object_DEVICE_MENU_Create_0`:

```gml
if (!variable_global_exists("kaizo_autoloaded"))
{
    global.kaizo_autoloaded = 1;
    global.filechoice = 0;
    scr_load();
    instance_destroy();
    exit;
}
```

After re-patching, split the result again and update `GAME_UNX_PARTS` / `GAME_UNX_BYTES`
in `sw.js`.

## Save file format notes

`filech3_0` is plain text, CRLF, 3055 lines:

- `flag[i]` — line `553 + i` (2500 sequential lines)
- `weapon[j]` — line `356 + 2*j`, `armor[j]` — line `357 + 2*j` (**interleaved**)
- `charweapon[ch]` — one of the 5 per-character stat blocks above the weapon block

Route state is stored in real game flags, not a bespoke mod variable:

| Route | `flag[454]` | `flag[456]` (`k_sideb` / sword-route) | Thorn Ring |
| --- | --- | --- | --- |
| Normal | 0 | 0 | no |
| Weird (Side B) | 0 | 1 | yes |
| Abandoned weird | 1 | 0 | yes |

The Thorn Ring is base-game weapon id **13** (`scr_weaponinfo` case 13). The mod
itself has no acquisition code for it, so the saves grant it the same way the
game does: `scr_weaponget(13)` puts the new weapon in slot 0 and re-packs every
existing weapon after it. The weapon array is therefore **contiguous**, with no
empty rows in the EQUIP list.

Progress is kept per route: `preload.js` banks the live `filech3_0` under
`/_savedata/kaizo_bank_<route>` when the player switches route and restores it
when they come back, so reloading does not wipe a route's save.
