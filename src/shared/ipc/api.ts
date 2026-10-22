import type { DraftBridge } from './draft';
import type { NotesBridge } from './notes';
import type { SettingsBridge } from './settings';
import type { UpdateBridge } from './update';

/**
 * The surface preload exposes on `window.inmemnote`.
 *
 * Declared explicitly (not `typeof api` in preload) so the renderer depends on
 * this contract, never on the infrastructure that implements it. Preload
 * annotates its object with this type, so the two can't drift.
 */
export interface InmemnoteAPI {
  draft: DraftBridge;
  notes: NotesBridge;
  settings: SettingsBridge;
  update: UpdateBridge;
}
