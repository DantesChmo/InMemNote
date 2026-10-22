import { z } from 'zod';

import type { NoteListFilterDTO } from '@shared/ipc';

/**
 * Zod schemas for every renderer → main `notes:*` payload, one tuple per
 * channel (positional `invoke` arguments). Ids are only checked to be
 * strings here — their format is a domain rule owned by `NoteId.create`.
 */
const NoteListFilter = z.enum(['all', 'pinned']) satisfies z.ZodType<NoteListFilterDTO>;

export const NotesListArgs = z.tuple([NoteListFilter]);
export const NoteIdArgs = z.tuple([z.string()]);
export const NotesSaveArgs = z.tuple([z.string(), z.string()]);
export const NotesSearchArgs = z.tuple([z.string()]);
