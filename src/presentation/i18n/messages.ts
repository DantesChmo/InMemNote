/**
 * Message catalog — every translatable string in the renderer.
 *
 * The exported `MessageKey` union is the single source of truth: TS forces
 * every locale dictionary in this folder to provide a value for every key,
 * so adding a new string is impossible to forget halfway through. A typo in
 * a `t('foo.bar')` call becomes a compile error rather than a runtime miss.
 *
 * Placeholder syntax: `{name}`. Interpolation is positional-by-name only —
 * no plural forms, no nested rules. For pluralization we pick the key in
 * the calling code (`t('time.minutesAgo', { n })`) because the rules in
 * Russian are complex enough that ICU would be the right answer, and we
 * don't ship ICU yet.
 */
export type Messages = {
  // Common UI verbs / nouns that recur everywhere.
  'common.cancel': string;
  'common.close': string;
  'common.save': string;
  'common.saving': string;
  'common.reset': string;

  // Library window.
  'library.title': string;
  'library.searchPlaceholder': string;
  'library.newNote': string;
  'library.allNotes': string;
  'library.pinned': string;
  'library.results': string;
  'library.sortByDate': string;
  'library.nothingFound': string;
  'library.emptySection': string;
  'library.queryNoMatch': string; // {q}
  'library.untitled': string;

  // Library editor (right pane).
  'editor.empty.title': string;
  'editor.empty.hint': string;
  'editor.pinned': string;
  'editor.notPinned': string;
  'editor.modified': string;
  'editor.placeholder': string;
  'editor.wordCount': string; // {n}
  'editor.markdownHint': string;

  // Library editor — pin / delete affordances.
  'editor.pinAria': string;
  'editor.deleteAria': string;

  // Draft window.
  'draft.title': string;
  'draft.placeholder': string;
  'draft.pin': string;
  'draft.unpin': string;
  'draft.pinTitle': string;
  'draft.resetSize': string;

  // Relative time labels.
  'time.justNow': string;
  'time.minutesAgo': string; // {n}
  'time.hoursAgo': string; // {n}
  'time.daysAgo': string; // {n}

  // Settings popup — shell.
  'settings.title': string;
  'settings.section.palette': string;
  'settings.section.hotkeys': string;
  'settings.section.language': string;

  // Settings popup — palette section.
  'settings.theme.label': string;
  'settings.theme.hint': string;
  'settings.theme.system': string;
  'settings.theme.dark': string;
  'settings.theme.light': string;
  'settings.colors.label': string;
  'settings.colors.hint': string;
  'settings.colors.defaultSuffix': string;
  'settings.colors.pickAria': string; // {key}
  'settings.colors.resetTooltip': string;
  'settings.palette.accent': string;
  'settings.palette.accentInk': string;
  'settings.palette.panel': string;
  'settings.palette.panel2': string;
  'settings.palette.sink': string;
  'settings.palette.text': string;
  'settings.palette.text2': string;
  'settings.palette.text3': string;
  'settings.palette.bar': string;

  // Settings popup — hotkeys section.
  'settings.openDraft.label': string;
  'settings.openDraft.hint': string;
  'settings.hotkey.capturePlaceholder': string;
  'settings.hotkey.change': string;
  'settings.hotkey.cancel': string;

  // Settings popup — language section.
  'settings.language.label': string;
  'settings.language.hint': string;
  'settings.language.system': string;
  'settings.language.en': string;
  'settings.language.ru': string;
};

export type MessageKey = keyof Messages;

/** Parameters supplied to `t(...)`. Keys without placeholders accept `{}`. */
export type MessageParams = Readonly<Record<string, string | number>>;
