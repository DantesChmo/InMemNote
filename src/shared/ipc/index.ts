/**
 * Cross-process IPC contract (ADR 0005): channel names, wire DTOs and the
 * `window.inmemnote` API type. Imported by main, preload and the renderer;
 * depends on nothing outside `src/shared`.
 */
export { CHANNEL_GROUPS, IPC, type IpcChannel } from './channels';
export type { InmemnoteAPI } from './api';
export type { Unsubscribe } from './subscription';
export { DraftChannels, type Corner, type DraftBridge, type DraftDTO, type PinSize } from './draft';
export { E2eChannels, type InmemnoteTestAPI } from './e2e';
export { NotesChannels, type NoteDTO, type NoteListFilterDTO, type NotesBridge } from './notes';
export {
  SettingsChannels,
  type AppSettingsDTO,
  type AppSettingsPatchDTO,
  type SettingsBridge,
} from './settings';
export {
  StorageChannels,
  type DegradedStoreDTO,
  type StorageBridge,
  type StorageStatusDTO,
  type StoreNameDTO,
} from './storage';
export { UpdateChannels, type AvailableUpdateDTO, type UpdateBridge } from './update';
