"use client";

/*
  Tiny in-memory holder for the admin key, shared across pages in the current
  tab/session. It is deliberately NOT persisted to disk (no localStorage /
  sessionStorage), so it never leaks and a reload of /settings re-prompts.

  The watch page reads it to decide whether to show admin-only actions
  (Delete / Original file). The settings page writes it after a successful
  unlock and sends it as `Authorization: Bearer <key>`.
*/

let adminKey: string | null = null;

export function getAdminKey(): string | null {
  return adminKey;
}

export function setAdminKey(key: string): void {
  adminKey = key;
}

export function clearAdminKey(): void {
  adminKey = null;
}

export function isAdmin(): boolean {
  return Boolean(adminKey);
}

/** Headers to attach when calling admin-gated API routes. */
export function authHeaders(): Record<string, string> {
  return adminKey ? { Authorization: `Bearer ${adminKey}` } : {};
}