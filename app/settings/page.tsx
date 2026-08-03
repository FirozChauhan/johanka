"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckIcon, SettingsIcon, SearchIcon } from "@/components/icons";
import { authHeaders, clearAdminKey, getAdminKey, setAdminKey } from "@/lib/admin-auth";
import type { AppSettings } from "@/lib/types";

interface HealthState {
  configured: boolean;
  account: Record<string, unknown> | null;
  error?: string | null;
}

interface DiagState {
  host: string;
  proxy_configured: boolean;
  proxy_url: string | null;
  dns: { ok: boolean; addresses?: string[]; error?: string };
  api: { ok: boolean; configured: boolean; error?: string; account?: unknown };
  suggestion: string;
}

type Phase = "loading" | "setup" | "lock" | "unlocked";

/*
  Settings page — the operator panel, locked behind an admin key.

  The streaming service is public, but this config is private. A long admin key
  (stored in PostgreSQL as a SHA-256 hash, or set via the JOHANKA_ADMIN_KEY env
  var, which always wins) unlocks viewing + editing here. Env vars still take
  precedence over saved values.

  First run: no key exists yet -> the page offers "create the key". From then
  on it always prompts for the key. Settings persist server-side in PostgreSQL,
  so they survive across browsers and incognito windows.
*/
export default function SettingsPage() {
  const [phase, setPhase] = useState<Phase>("loading");

  // Key entry
  const [keyPrompt, setKeyPrompt] = useState("");
  const [setupKey, setSetupKey] = useState("");
  const [setupKey2, setSetupKey2] = useState("");
  const [keyError, setKeyError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  // Settings state
  const [login, setLogin] = useState("");
  const [key, setKey] = useState("");
  const [keySet, setKeySet] = useState(false);
  const [health, setHealth] = useState<HealthState | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diag, setDiag] = useState<DiagState | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [persistenceConfigured, setPersistenceConfigured] = useState(false);

  // Cloudinary (hosted posters) — optional.
  const [cloudName, setCloudName] = useState("");
  const [cloudKey, setCloudKey] = useState("");
  const [cloudKeySet, setCloudKeySet] = useState(false);
  const [cloudSecret, setCloudSecret] = useState("");
  const [cloudSecretSet, setCloudSecretSet] = useState(false);

  // PostgreSQL — the server-side settings store + optional catalog enrichment.
  const [postgresDsn, setPostgresDsn] = useState("");

  // Admin key rotation (optional, blank keeps the current key).
  const [newAdminKey, setNewAdminKey] = useState("");

  const applySettings = useCallback((s: AppSettings) => {
    setLogin(s.streamtape_login || "");
    setKeySet(Boolean(s.streamtape_key));
    setCloudName(s.cloudinary_cloud_name || "");
    setCloudKeySet(Boolean(s.cloudinary_api_key));
    setCloudSecretSet(Boolean(s.cloudinary_api_secret));
    setPostgresDsn(s.postgres_connection_string || "");
    setPersistenceConfigured(Boolean(s.postgres_connection_string));
  }, []);

  // First probe: if a key is already in this session, go straight to an
  // authenticated load; otherwise decide between setup / lock / open.
  const probe = useCallback(async () => {
    if (getAdminKey()) {
      await loadUnlocked();
      return;
    }
    try {
      const res = await fetch("/api/settings", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (data.needsSetup) { setPhase("setup"); return; }
      if (data.locked || res.status === 401) { setPhase("lock"); return; }
      applySettings(data.settings);
      setPhase("unlocked");
      await loadHealthInternal();
    } catch {
      setPhase("lock");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applySettings]);

  async function loadUnlocked(): Promise<boolean> {
    try {
      const res = await fetch("/api/settings", { headers: authHeaders(), cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (data.locked || res.status === 401) {
        clearAdminKey();
        setPhase("lock");
        return false;
      }
      if (data.needsSetup) { setPhase("setup"); return false; }
      applySettings(data.settings);
      setPhase("unlocked");
      return true;
    } catch {
      return false;
    }
  }

  async function loadHealthInternal() {
    try {
      const res = await fetch("/api/streamtape/health", { headers: authHeaders() });
      const data = (await res.json()) as HealthState;
      setHealth(data);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    probe();
  }, [probe]);

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    setUnlocking(true);
    setKeyError(null);
    try {
      setAdminKey(keyPrompt);
      const ok = await loadUnlocked();
      if (!ok) {
        setKeyError("That key didn\u2019t work. Try again.");
        setKeyPrompt("");
      }
    } finally {
      setUnlocking(false);
    }
  }

  async function createKey(e: React.FormEvent) {
    e.preventDefault();
    setUnlocking(true);
    setKeyError(null);
    try {
      if (setupKey.length < 16) {
        setKeyError("Key is too short — use at least 16 characters.");
        return;
      }
      if (setupKey !== setupKey2) {
        setKeyError("The two keys don\u2019t match.");
        return;
      }
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ admin_key: setupKey }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setKeyError(data.error || "Could not create the key.");
        return;
      }
      setAdminKey(setupKey);
      setSetupKey("");
      setSetupKey2("");
      await loadUnlocked();
    } finally {
      setUnlocking(false);
    }
  }

  async function runDiagnostics() {
    setDiagLoading(true);
    setDiag(null);
    try {
      const res = await fetch("/api/streamtape/diagnose", { headers: authHeaders() });
      if (res.status === 401) { clearAdminKey(); setPhase("lock"); return; }
      const data = (await res.json()) as DiagState;
      setDiag(data);
    } catch {
      setDiag({
        host: "api.streamtape.com",
        proxy_configured: false,
        proxy_url: null,
        dns: { ok: false, error: "Diagnostics request itself failed." },
        api: { ok: false, configured: false, error: "request failed" },
        suggestion: "Could not run diagnostics — the app server may be down.",
      });
    } finally {
      setDiagLoading(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          streamtape_login: login.trim(),
          streamtape_key: key.trim(),
          cloudinary_cloud_name: cloudName.trim(),
          cloudinary_api_key: cloudKey.trim(),
          cloudinary_api_secret: cloudSecret.trim(),
          postgres_connection_string: postgresDsn.trim(),
          admin_key: newAdminKey.trim(),
        }),
      });
      if (res.status === 401) { clearAdminKey(); setPhase("lock"); return; }
      const data = await res.json();
      if (!res.ok || data.locked) {
        throw new Error(data.error || "Save failed — check your PostgreSQL connection string.");
      }
      const s = data.settings;
      // If they rotated the key, use the new one for the rest of this session.
      if (newAdminKey.trim()) setAdminKey(newAdminKey.trim());
      setNewAdminKey("");
      setKey("");
      setKeySet(Boolean(s.streamtape_key));
      setCloudKey("");
      setCloudKeySet(Boolean(s.cloudinary_api_key));
      setCloudSecret("");
      setCloudSecretSet(Boolean(s.cloudinary_api_secret));
      setPostgresDsn(s.postgres_connection_string || "");
      setPersistenceConfigured(Boolean(s.postgres_connection_string));
      setSaved(true);
      await loadHealthInternal();
      setTimeout(() => setSaved(false), 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  if (phase === "loading") {
    return (
      <div className="mx-auto max-w-2xl">
        <Header />
        <p className="py-24 text-center text-sm text-faint">Checking access…</p>
      </div>
    );
  }

  if (phase === "setup" || phase === "lock") {
    return (
      <div className="mx-auto max-w-2xl">
        <Header />
        {phase === "setup" ? (
          <form onSubmit={createKey} className="mx-auto max-w-md rounded-2xl border border-line bg-surface p-6">
            <h2 className="text-lg font-semibold tracking-tight">Create an admin key</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              This is the first time the app has been configured. Set a long,
              random key (e.g. <code className="rounded bg-sunken px-1 py-0.5 text-fg">openssl rand -hex 32</code>). It is stored as a SHA-256 hash in PostgreSQL and is required to view or edit settings from now on.
            </p>
            <label className="mt-4 mb-1.5 block text-xs font-medium uppercase tracking-widest text-faint">Admin key</label>
            <input
              type="password"
              value={setupKey}
              onChange={(e) => setSetupKey(e.target.value)}
              placeholder="a long random hash"
              spellCheck={false}
              className="h-11 w-full rounded-lg border border-line bg-sunken px-3 text-sm outline-none transition placeholder:text-faint focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
            />
            <label className="mt-3 mb-1.5 block text-xs font-medium uppercase tracking-widest text-faint">Confirm key</label>
            <input
              type="password"
              value={setupKey2}
              onChange={(e) => setSetupKey2(e.target.value)}
              placeholder="repeat it"
              spellCheck={false}
              className="h-11 w-full rounded-lg border border-line bg-sunken px-3 text-sm outline-none transition placeholder:text-faint focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
            />
            {keyError && <p className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{keyError}</p>}
            <button type="submit" disabled={unlocking} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink transition hover:bg-accent-strong disabled:opacity-50">
              {unlocking ? "Creating…" : "Create key &amp; lock settings"}
            </button>
          </form>
        ) : (
          <form onSubmit={unlock} className="mx-auto max-w-md rounded-2xl border border-line bg-surface p-6">
            <h2 className="text-lg font-semibold tracking-tight">Settings are locked</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              Enter the admin key to view and change the configuration.
            </p>
            <label className="mt-4 mb-1.5 block text-xs font-medium uppercase tracking-widest text-faint">Admin key</label>
            <input
              type="password"
              value={keyPrompt}
              onChange={(e) => setKeyPrompt(e.target.value)}
              placeholder="the long hash you set"
              spellCheck={false}
              autoFocus
              className="h-11 w-full rounded-lg border border-line bg-sunken px-3 text-sm outline-none transition placeholder:text-faint focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
            />
            {keyError && <p className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{keyError}</p>}
            <button type="submit" disabled={unlocking} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink transition hover:bg-accent-strong disabled:opacity-50">
              {unlocking ? "Unlocking…" : "Unlock"}
            </button>
            <p className="mt-4 text-xs text-faint">
              Tip: the key can also be set permanently via the{" "}
              <code className="rounded bg-sunken px-1 py-0.5 text-muted">JOHANKA_ADMIN_KEY</code> env var.
            </p>
          </form>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Header />

      {/* Persistence notice */}
      {!persistenceConfigured && (
        <section className="mb-8 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm">
          <p className="font-medium text-amber-300">Settings currently can&apos;t be saved persistently</p>
          <p className="mt-1 leading-relaxed text-muted">
            No PostgreSQL connection string was found. Add one below (or set{" "}
            <code className="rounded bg-sunken px-1 py-0.5 text-fg">DATABASE_URL</code>{" "}
            in your env) so your configuration is stored on the server and stays
            the same in every browser — including incognito.
          </p>
        </section>
      )}

      {/* Status card */}
      <section className="mb-8 rounded-2xl border border-line bg-surface p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-faint">StreamTape status</h2>
          <StatusPill health={health} />
        </div>
        <p className="mt-3 text-sm text-muted">
          {health?.configured
            ? health.error
              ? `Connected, but validation failed: ${health.error}`
              : "Credentials configured and validated against the StreamTape API."
            : "Not configured yet — add your credentials below."}
        </p>
        <div className="mt-4 flex items-center gap-3">
          <button type="button" onClick={runDiagnostics} disabled={diagLoading} className="inline-flex items-center gap-2 rounded-lg border border-line bg-sunken px-3 py-1.5 text-xs font-medium text-muted transition hover:border-accent/40 hover:text-fg disabled:opacity-50">
            <SearchIcon className="h-3.5 w-3.5" />
            {diagLoading ? "Running diagnostics…" : "Run diagnostics"}
          </button>
          {diag?.proxy_configured && (
            <span className="text-xs text-faint">
              proxy: <code className="rounded bg-sunken px-1 py-0.5 text-muted">{diag.proxy_url ?? "set"}</code>
            </span>
          )}
        </div>
        {diag && (
          <div className="mt-4 space-y-3 rounded-lg border border-line-soft bg-sunken/60 p-4 text-xs">
            <DiagRow label="DNS" ok={diag.dns.ok} detail={diag.dns.ok ? diag.dns.addresses?.join(", ") : diag.dns.error} />
            <DiagRow
              label="API call"
              ok={diag.api.ok}
              detail={diag.api.ok ? "Reached StreamTape &amp; credentials accepted" : diag.api.error}
            />
            <p className="border-t border-line-soft pt-3 leading-relaxed text-muted">
              <span className="font-medium text-fg">Suggestion: </span>
              {diag.suggestion}
            </p>
          </div>
        )}
      </section>

      {/* Credentials form */}
      <form onSubmit={save} className="space-y-5 rounded-2xl border border-line bg-surface p-5">
        <div>
          <label htmlFor="login" className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-faint">StreamTape API / FTP username</label>
          <input id="login" value={login} onChange={(e) => setLogin(e.target.value)} placeholder="your API/FTP username" className="h-11 w-full rounded-lg border border-line bg-sunken px-3 text-sm outline-none transition placeholder:text-faint focus:border-accent/60 focus:ring-2 focus:ring-accent/20" />
        </div>
        <div>
          <label htmlFor="key" className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-faint">API / FTP password {keySet && <span className="text-success">· saved</span>}</label>
          <input id="key" type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder={keySet ? "••••••••••••  (leave blank to keep)" : "API/FTP password"} className="h-11 w-full rounded-lg border border-line bg-sunken px-3 text-sm outline-none transition placeholder:text-faint focus:border-accent/60 focus:ring-2 focus:ring-accent/20" />
        </div>
        <div className="border-t border-line pt-5">
          <h3 className="text-sm font-semibold uppercase tracking-widest text-faint">Cloudinary</h3>
          <p className="mt-1 text-xs text-faint">Optional hosted poster thumbnails — leave blank to keep local frames.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="cloudName" className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-faint">Cloud name</label>
              <input id="cloudName" value={cloudName} onChange={(e) => setCloudName(e.target.value)} placeholder="your-cloud-name" spellCheck={false} className="h-11 w-full rounded-lg border border-line bg-sunken px-3 text-sm outline-none transition placeholder:text-faint focus:border-accent/60 focus:ring-2 focus:ring-accent/20" />
            </div>
            <div>
              <label htmlFor="cloudKey" className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-faint">API key {cloudKeySet && <span className="text-success">· saved</span>}</label>
              <input id="cloudKey" type="password" value={cloudKey} onChange={(e) => setCloudKey(e.target.value)} placeholder={cloudKeySet ? "••••••••••••  (leave blank to keep)" : "API key"} className="h-11 w-full rounded-lg border border-line bg-sunken px-3 text-sm outline-none transition placeholder:text-faint focus:border-accent/60 focus:ring-2 focus:ring-accent/20" />
            </div>
            <div>
              <label htmlFor="cloudSecret" className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-faint">API secret {cloudSecretSet && <span className="text-success">· saved</span>}</label>
              <input id="cloudSecret" type="password" value={cloudSecret} onChange={(e) => setCloudSecret(e.target.value)} placeholder={cloudSecretSet ? "••••••••••••  (leave blank to keep)" : "API secret"} className="h-11 w-full rounded-lg border border-line bg-sunken px-3 text-sm outline-none transition placeholder:text-faint focus:border-accent/60 focus:ring-2 focus:ring-accent/20" />
            </div>
          </div>
        </div>

        {/* PostgreSQL — settings persistence + optional catalog enrichment */}
        <div className="border-t border-line pt-5">
          <h3 className="text-sm font-semibold uppercase tracking-widest text-faint">PostgreSQL <span className="ml-1.5 font-normal normal-case text-muted">(required to save settings)</span></h3>
          <p className="mt-1 text-xs leading-relaxed text-faint">
            Where ALL settings on this page are stored, so they persist across
            browsers and incognito windows instead of living in localStorage. It
            also powers the enriched catalog (posters, descriptions, durations).
            Setting{" "}<code className="rounded bg-sunken px-1 py-0.5 text-muted">DATABASE_URL</code>{" "}
            in env is the recommended way to make this cross-browser.
          </p>
          <div className="mt-4">
            <label htmlFor="postgresDsn" className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-faint">Connection string</label>
            <input id="postgresDsn" value={postgresDsn} onChange={(e) => setPostgresDsn(e.target.value)} placeholder="postgres://user:password@host:5432/dbname" spellCheck={false} className="h-11 w-full rounded-lg border border-line bg-sunken px-3 text-sm outline-none transition placeholder:text-faint focus:border-accent/60 focus:ring-2 focus:ring-accent/20" />
          </div>
        </div>

        {/* Admin key rotation */}
        <div className="border-t border-line pt-5">
          <h3 className="text-sm font-semibold uppercase tracking-widest text-faint">Admin key</h3>
          <p className="mt-1 text-xs text-faint">Optional: set a new key. Leave blank to keep the current one. (If{" "}<code className="rounded bg-sunken px-1 py-0.5 text-muted">JOHANKA_ADMIN_KEY</code> is set in env, it always wins.)</p>
          <div className="mt-4">
            <input type="password" value={newAdminKey} onChange={(e) => setNewAdminKey(e.target.value)} placeholder={getAdminKey() ? "a new long random hash" : "a new long random hash"} spellCheck={false} className="h-11 w-full rounded-lg border border-line bg-sunken px-3 text-sm outline-none transition placeholder:text-faint focus:border-accent/60 focus:ring-2 focus:ring-accent/20" />
          </div>
        </div>

        {error && <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

        <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink transition hover:bg-accent-strong disabled:opacity-50">
          {saving ? "Saving…" : saved ? (<><CheckIcon className="h-4 w-4" /> Saved</>) : "Save credentials"}
        </button>
      </form>

      <p className="mt-6 text-xs leading-relaxed text-faint">
        Settings are stored in PostgreSQL (server-side) and locked behind the
        admin key. Environment variables still take precedence over saved
        values:{" "}<code className="rounded bg-sunken px-1 py-0.5 text-muted">STREAMTAPE_LOGIN</code> /{" "}
        <code className="rounded bg-sunken px-1 py-0.5 text-muted">STREAMTAPE_KEY</code>,{" "}
        <code className="rounded bg-sunken px-1 py-0.5 text-muted">CLOUDINARY_CLOUD_NAME</code> /{" "}
        <code className="rounded bg-sunken px-1 py-0.5 text-muted">CLOUDINARY_API_KEY</code> /{" "}
        <code className="rounded bg-sunken px-1 py-0.5 text-muted">CLOUDINARY_API_SECRET</code>,{" "}
        <code className="rounded bg-sunken px-1 py-0.5 text-muted">DATABASE_URL</code>, and{" "}
        <code className="rounded bg-sunken px-1 py-0.5 text-muted">JOHANKA_ADMIN_KEY</code>. Set{" "}
        <code className="rounded bg-sunken px-1 py-0.5 text-muted">DATABASE_URL</code> in env so a fresh
        browser (e.g. incognito) can reach the stored configuration. The key is
        kept in memory for the current tab only.
      </p>
    </div>
  );
}

function Header() {
  return (
    <header className="mb-8 flex items-center gap-3">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent/10 text-accent">
        <SettingsIcon className="h-5 w-5" />
      </span>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-0.5 text-sm text-muted">
          Operator panel — locked behind an admin key. Config is stored in PostgreSQL and applies to every browser.
        </p>
      </div>
    </header>
  );
}

function StatusPill({ health }: { health: HealthState | null }) {
  const ok = health?.configured && !health?.error;
  const label = ok ? "Connected" : health?.configured ? "Needs attention" : "Not configured";
  const cls = ok ? "bg-success/15 text-success" : health?.configured ? "bg-amber-400/15 text-amber-300" : "bg-line text-faint";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-success" : health?.configured ? "bg-amber-300" : "bg-faint"}`} />
      {label}
    </span>
  );
}

function DiagRow({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className={`mt-0.5 inline-flex h-4 w-4 flex-none items-center justify-center rounded-full text-[10px] ${ok ? "bg-success/20 text-success" : "bg-danger/20 text-danger"}`}>{ok ? "✓" : "!"}</span>
      <div className="min-w-0">
        <span className="font-medium text-fg">{label}</span>
        {detail && <span className="ml-2 break-words text-faint">{detail}</span>}
      </div>
    </div>
  );
}
