# Hotkeys

## Where they live

| File                                                       | Purpose                              |
|------------------------------------------------------------|--------------------------------------|
| `config/hotkeys.yaml`                                      | Defaults bundled with the app.       |
| `~/Library/Application Support/Inmemnote/hotkeys.yaml`     | Optional user override.              |

If the user file fails schema validation we log the reason and fall back
to the defaults, so the app always starts.

## Format

YAML, hand-editable, comments welcome. Each command accepts either form:

- **Single key** — a plain string:

  ```yaml
  openDraft: F1
  ```

- **Combination** — a YAML sequence of tokens (no `+` separators):

  ```yaml
  openDraft: [CommandOrControl, Shift, Space]
  ```

The two are equivalent; pick whichever reads better. Unknown tokens are
rejected by the schema — typos surface loudly rather than silently producing
an unregisterable shortcut.

Commands:

| Command      | Default                                  |
|--------------|------------------------------------------|
| `openDraft`  | `[CommandOrControl, Shift, Space]`       |

## Allowed key tokens

Use these exact strings (case-sensitive). The set mirrors Electron's
[Accelerator vocabulary](https://www.electronjs.org/docs/latest/api/accelerator).

### Modifiers

| Token              | Meaning                                                      |
|--------------------|--------------------------------------------------------------|
| `Command`, `Cmd`   | macOS Command key.                                           |
| `Control`, `Ctrl`  | Control key.                                                 |
| `CommandOrControl`, `CmdOrCtrl` | Command on macOS, Control elsewhere. Use this for cross-platform shortcuts. |
| `Alt`, `Option`    | Alt / ⌥ Option.                                              |
| `AltGr`            | Right-side Alt on European keyboards.                        |
| `Shift`            | Shift key.                                                   |
| `Super`            | Windows / ⌘ Command (alias of `Meta` on some systems).       |
| `Meta`             | The "meta" modifier (Win key on Windows, ⌘ on macOS).        |

### Letters and digits

| Token | Meaning                                                                |
|-------|------------------------------------------------------------------------|
| `A`–`Z` | Latin letters. Case-sensitive — write them uppercase.                |
| `0`–`9` | Top-row digits.                                                      |

### Function keys

| Token   | Meaning                |
|---------|------------------------|
| `F1`–`F24` | Function keys.       |

### Whitespace, navigation, and editing

| Token        | Meaning                       |
|--------------|-------------------------------|
| `Space`      | Space bar.                    |
| `Tab`        | Tab.                          |
| `Enter`, `Return` | Return / Enter.          |
| `Escape`, `Esc` | Escape.                    |
| `Backspace`  | Backspace.                    |
| `Delete`     | Forward Delete.               |
| `Insert`     | Insert.                       |
| `Up`         | Arrow Up.                     |
| `Down`       | Arrow Down.                   |
| `Left`       | Arrow Left.                   |
| `Right`      | Arrow Right.                  |
| `Home`       | Home.                         |
| `End`        | End.                          |
| `PageUp`     | Page Up.                      |
| `PageDown`   | Page Down.                    |
| `Capslock`   | Caps Lock.                    |
| `Numlock`    | Num Lock.                     |
| `Scrolllock` | Scroll Lock.                  |
| `PrintScreen`| Print Screen.                 |
| `Plus`       | The literal `+` key.          |

### Numpad

| Token              | Meaning                                  |
|--------------------|------------------------------------------|
| `Numpad0`–`Numpad9` | Numpad digits.                          |
| `NumpadDecimal`    | Numpad `.`.                              |
| `NumpadAdd`        | Numpad `+`.                              |
| `NumpadSubtract`   | Numpad `-`.                              |
| `NumpadMultiply`   | Numpad `*`.                              |
| `NumpadDivide`     | Numpad `/`.                              |

### Media keys

| Token                  | Meaning                  |
|------------------------|--------------------------|
| `VolumeUp`             | Volume up.               |
| `VolumeDown`           | Volume down.             |
| `VolumeMute`           | Mute.                    |
| `MediaNextTrack`       | Next track.              |
| `MediaPreviousTrack`   | Previous track.          |
| `MediaStop`            | Stop playback.           |
| `MediaPlayPause`       | Play / pause toggle.     |

## Overriding locally

1. Copy `config/hotkeys.yaml` to
   `~/Library/Application Support/Inmemnote/hotkeys.yaml`.
2. Edit the values. For example:

   ```yaml
   # Trigger Draft with ⌘⌥N instead of the default.
   openDraft: [CommandOrControl, Option, N]
   ```

   …or as a single key:

   ```yaml
   openDraft: F1
   ```

3. Restart the app.

## Conflicts

OS-reserved combinations like `[CommandOrControl, Space]` (Spotlight) are
not free for grabbing. Electron returns `false` when we try to register
them — we log that and leave the hotkey unregistered.
