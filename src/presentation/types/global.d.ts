import type { InmemnoteAPI, InmemnoteTestAPI } from '@shared/ipc';

/**
 * Augments `window` with the surface exposed by the preload script.
 * Lets us write `window.inmemnote.draft.save(...)` with full type safety
 * instead of casting through `any`.
 */
declare global {
  interface Window {
    inmemnote: InmemnoteAPI;
    /** Present only when the app runs with `INMEMNOTE_E2E=1`. */
    __inmemnote_test__?: InmemnoteTestAPI;
  }
}

export {};
