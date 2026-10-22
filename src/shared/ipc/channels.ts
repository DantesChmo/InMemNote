import { DraftChannels } from './draft';
import { E2eChannels } from './e2e';
import { NotesChannels } from './notes';
import { SettingsChannels } from './settings';
import { StorageChannels } from './storage';
import { UpdateChannels } from './update';

/**
 * Every IPC channel name, shared by main and preload.
 *
 * Centralizing them lets TypeScript surface typos at compile time (a stray
 * `'drafl:save'` would fail compilation because nothing imports it). Each
 * context owns its map; this one merges them. A spread silently lets a
 * later duplicate key win, so `channels.spec.ts` asserts keys and values are
 * unique across the maps.
 */
export const IPC = {
  ...DraftChannels,
  ...NotesChannels,
  ...SettingsChannels,
  ...UpdateChannels,
  ...StorageChannels,
  ...E2eChannels,
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];

/** The per-context maps `IPC` is built from — exported for the uniqueness spec. */
export const CHANNEL_GROUPS = {
  DraftChannels,
  NotesChannels,
  SettingsChannels,
  UpdateChannels,
  StorageChannels,
  E2eChannels,
} as const;
