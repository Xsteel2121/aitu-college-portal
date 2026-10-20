declare namespace Cloudflare {
  interface Env {
    MODERATOR_CODES_JSON?: string;
    BACKEND_PROXY_SECRET?: string;
    PUBLIC_SITE_URL?: string;
    DB?: D1Database;
    BUCKET?: R2Bucket;
    PUSH_PUBLIC_KEY?: string;
    PUSH_PRIVATE_JWK?: string;
    PUSH_CONTACT?: string;
  }
}
