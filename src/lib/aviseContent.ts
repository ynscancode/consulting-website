import raw from '../data/avise.json';
import { aviseSchema, type AviseContent } from './aviseSchema';

export type { AviseContent, Insight } from './aviseSchema';

// Build-time content for the public pages, validated against the same schema
// the editor's write path enforces.
export const content: AviseContent = aviseSchema.parse(raw);
