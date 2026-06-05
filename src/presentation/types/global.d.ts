import type { InmemnoteAPI } from '@infrastructure/electron/preload/index';

/**
 * Augments `window` with the surface exposed by the preload script.
 * Lets us write `window.inmemnote.draft.save(...)` with full type safety
 * instead of casting through `any`.
 */
declare global {
  interface Window {
    inmemnote: InmemnoteAPI;
  }
}

export {};
