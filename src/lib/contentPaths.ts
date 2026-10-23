// Shared path constants for the git-backed content store. Imported by BOTH
// the reader (src/lib/draftContent.ts) and the writers
// (src/pages/api/content/[area].ts, api/draft/revert.ts) so they can never
// drift onto different files. Do not duplicate these literals anywhere else.

/** The Avisé & Co. public pages' content: every string the editor can change. */
export const AVISE_JSON_PATH = 'src/data/avise.json';

// Whitelist for about-profile-image public paths. This is the SOLE security
// control for the /api/draft/asset read proxy (KB-0017) and matches the
// aboutPage.image rule in src/lib/aviseSchema.ts. Do not duplicate this
// literal anywhere else.
export const ABOUT_IMAGE_PUBLIC_PATH_RE = /^\/about\/profile-[a-f0-9]{16}\.(jpg|png|webp)$/;
