import { z } from 'zod';

/**
 * Zod schemas for every renderer → main `draft:*` payload, one tuple per
 * channel (positional `invoke` arguments). Ids are only checked to be
 * strings here — their format is a domain rule owned by `DraftId.create`.
 *
 * Geometry must be finite: `NaN`/`Infinity` would survive the controller's
 * `Math.min`/`Math.max` clamps and reach `BrowserWindow.setBounds`.
 */
const finite = z.number().finite();

export const DraftSaveArgs = z.tuple([z.string(), z.string()]);
export const DraftIdArgs = z.tuple([z.string()]);
export const DraftTogglePinArgs = z.tuple([z.string(), finite.nonnegative().optional()]);
export const DraftResizeArgs = z.tuple([finite]);
export const DraftSetPinSizeArgs = z.tuple([z.object({ width: finite, height: finite }).strict()]);
