import type { Messages } from './messages';

/**
 * English UI strings. New keys are added to `messages.ts` first — TS will
 * then surface every locale dictionary that needs to provide a value.
 */
export const en: Messages = {
  'common.cancel': 'Cancel',
  'common.close': 'Close',
  'common.save': 'Save',
  'common.saving': 'Saving…',
  'common.reset': 'Reset',

  'library.title': 'Library',
  'library.searchPlaceholder': 'Search notes…',
  'library.newNote': 'New',
  'library.allNotes': 'All notes',
  'library.pinned': 'Pinned',
  'library.results': 'Results',
  'library.sortByDate': 'By date',
  'library.nothingFound': 'Nothing found',
  'library.emptySection': 'This section is empty',
  'library.queryNoMatch': 'No matches for “{q}”',
  'library.untitled': 'Untitled',

  'editor.empty.title': 'No note selected',
  'editor.empty.hint': 'Pick a note on the left or press ⌘N for a new one',
  'editor.pinned': 'pinned',
  'editor.notPinned': 'not pinned',
  'editor.modified': 'updated',
  'editor.placeholder': 'Start typing…',
  'editor.wordCount': '{n} words',
  'editor.markdownHint': 'Markdown on the fly',

  'editor.pinAria': 'Toggle pin',
  'editor.deleteAria': 'Delete note',

  'draft.title': 'Quick note',
  'draft.placeholder': 'Start typing…',
  'draft.pin': 'Pin',
  'draft.unpin': 'Unpin',
  'draft.pinTitle': 'Keep on top of all windows',
  'draft.resetSize': 'Reset size',

  'time.justNow': 'just now',
  'time.minutesAgo': '{n} min ago',
  'time.hoursAgo': '{n}h ago',
  'time.daysAgo': '{n}d ago',

  'settings.title': 'Settings',
  'settings.section.palette': 'Palette',
  'settings.section.hotkeys': 'Hotkeys',
  'settings.section.language': 'Language',

  'settings.theme.label': 'Theme',
  'settings.theme.hint': '“System” follows the macOS setting.',
  'settings.theme.system': 'System',
  'settings.theme.dark': 'Dark',
  'settings.theme.light': 'Light',
  'settings.colors.label': 'Colors',
  'settings.colors.hint': 'Override palette tokens. Unset values inherit from the theme.',
  'settings.colors.defaultSuffix': ' · default',
  'settings.colors.pickAria': 'Pick a color for {key}',
  'settings.colors.resetTooltip': 'Restore the theme value',
  'settings.palette.accent': 'Accent',
  'settings.palette.accentInk': 'Text on accent',
  'settings.palette.panel': 'Panel background',
  'settings.palette.panel2': 'Toolbar / sidebar background',
  'settings.palette.sink': 'Input / secondary background',
  'settings.palette.text': 'Primary text',
  'settings.palette.text2': 'Secondary text',
  'settings.palette.text3': 'Tertiary text',
  'settings.palette.bar': 'Title bar',

  'settings.openDraft.label': 'Open Draft',
  'settings.openDraft.hint': 'Global hotkey for the quick-note panel.',
  'settings.hotkey.capturePlaceholder': 'Press a key combination…',
  'settings.hotkey.change': 'Change…',
  'settings.hotkey.cancel': 'Cancel',

  'settings.language.label': 'Interface language',
  'settings.language.hint': '“System” = macOS language.',
  'settings.language.system': 'System',
  'settings.language.en': 'English',
  'settings.language.ru': 'Русский',

  'update.available': 'Version {version} is available',
  'update.install': 'Update & restart',
  'update.later': 'Later',
  'update.notes': "What's new",
  'update.downloading': 'Downloading… {percent}%',
  'update.failed': 'Update failed. Please try again later.',
};
