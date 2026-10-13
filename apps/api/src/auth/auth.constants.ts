export const SESSION_COOKIE_NAME = 'mirai_session';
// Browser cookies are bounded; renew this on authenticated requests. Redis sessions have no TTL.
export const SESSION_COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;
export const IS_PUBLIC_KEY = 'mirai:is-public';
export const REQUIRED_ROLES_KEY = 'mirai:required-roles';
