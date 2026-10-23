/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    session: import('./lib/session').SessionPayload | null;
    /** Set by the /edit route: page views render their edit hooks. */
    editing?: boolean;
    /** Set by the /edit route: the draft content to render instead of the build-time file. */
    aviseContent?: import('./lib/aviseSchema').AviseContent;
  }
}

interface ImportMetaEnv {
  readonly GITHUB_OAUTH_CLIENT_ID: string;
  readonly GITHUB_OAUTH_CLIENT_SECRET: string;
  readonly ADMIN_GITHUB_USERNAME: string;
  readonly SESSION_SECRET: string;
  readonly PUBLIC_SITE_URL: string;
  readonly GIT_WRITE_TOKEN: string;
  readonly GITHUB_REPO: string;
  readonly DRAFT_BRANCH: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
