"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckIcon, SettingsIcon, SearchIcon } from "@/components/icons";
import { fetchSettings, clearSettingsCache } from "@/lib/client-settings";
import { getStoredSettings, saveStoredSettings } from "@/lib/localstore";

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

/*
  Settings page — the operator panel. Configure StreamTape API credentials
  at runtime (no redeploy needed), and verify they work against StreamTape's
  /account/info endpoint. Env vars (STREAMTAPE_LOGIN/STREAMTAPE_KEY) act as
  a higher-priority override, so production can lock credentials down there.

  Settings are persisted server-side in PostgreSQL (see /api/settings), so they
  survive across browsers, profiles, and incognito windows instead of living
  only in localStorage.
*/
export default function SettingsPage() {
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

  const load = useCallback(async () => {
    // Settings are persisted on the server (PostgreSQL); localStorage is only
    // a bootstrap DSN fallback so the server can reach the settings table.
    const s = await fetchSettings(true);
    setLogin(s.streamtape_login || "");
    setKeySet(Boolean(s.streamtape_key));
    setCloudName(s.cloudinary_cloud_name || "");
    setCloudKeySet(Boolean(s.cloudinary_api_key));
    setCloudSecretSet(Boolean(s.cloudinary_api_secret));
    setPostgresDsn(s.postgres_connection_string || "");
    setPersistenceConfigured(Boolean(s.postgres_connection_string));
  }, []);

  const loadHealth = useCallback(async () => {
    const s = await fetchSettings();
    const q = `login=${encodeURIComponent(s.streamtape_login || "")}&key=${encodeURIComponent(s.streamtape_key || "")}`;
    const res = await fetch(`/api/streamtape/health?${q}`);
    const data: HealthState = await res.json();
    setHealth(data);
  }, []);

  async function runDiagnostics() {
    setDiagLoading(true);
    setDiag(null);
    try {
      const s = await fetchSettings();
      const q = `login=${encodeURIComponent(s.streamtape_login || "")}&key=${encodeURIComponent(s.streamtape_key || "")}`;
      const res = await fetch(`/api/streamtape/diagnose?${q}`);
      const data: DiagState = await res.json();
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

  useEffect(() => {
    load();
    loadHealth();
  }, [load, loadHealth]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          streamtape_login: login.trim(),
          streamtape_key: key.trim(),
          cloudinary_cloud_name: cloudName.trim(),
          cloudinary_api_key: cloudKey.trim(),
          cloudinary_api_secret: cloudSecret.trim(),
          postgres_connection_string: postgresDsn.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.configured) {
        throw new Error(data.error || "Save failed — check your PostgreSQL connection string.");
      }
      // Invalidate the client cache so the app picks up the new settings.
      clearSettingsCache();
      const s = data.settings;
      setKey("");
      setKeySet(Boolean(s.streamtape_key));
      setCloudKey("");
      setCloudKeySet(Boolean(s.cloudinary_api_key));
      setCloudSecret("");
      setCloudSecretSet(Boolean(s.cloudinary_api_secret));
      setPostgresDsn(s.postgres_connection_string || "");
      setPersistenceConfigured(Boolean(s.postgres_connection_string));
      // Mirror the DSN to localStorage as a bootstrap so this browser can reach
      // the settings table even when DATABASE_URL isn't in env. (Other
      // browsers/incognito need DATABASE_URL set to work.)
      saveStoredSettings({
        ...getStoredSettings(),
        postgres_connection_string: s.postgres_connection_string || "",
      });
      setSaved(true);
      await loadHealth();
      setTimeout(() => setSaved(false), 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-8 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent/10 text-accent">
          <SettingsIcon className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-0.5 text-sm text-muted">
            Configure StreamTape — plus optional Cloudinary posters and a PostgreSQL catalog.
            Settings are saved server-side, so they persist across browsers and incognito.
          </p>
        </div>
      </header>

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
          <h2 className="text-sm font-semibold uppercase tracking-widest text-faint">
            StreamTape status
          </h2>
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
          <button
            type="button"
            onClick={runDiagnostics}
            disabled={diagLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-line bg-sunken px-3 py-1.5 text-xs font-medium text-muted transition hover:border-accent/40 hover:text-fg disabled:opacity-50"
          >
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
            <DiagRow
              label="DNS"
              ok={diag.dns.ok}
              detail={diag.dns.ok ? diag.dns.addresses?.join(", ") : diag.dns.error}
            />
            <DiagRow
              label="API call"
              ok={diag.api.ok}
              detail={
                diag.api.ok
                  ? "Reached StreamTape & credentials accepted"
                  : diag.api.error
              }
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
          <label htmlFor="login" className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-faint">
            StreamTape API / FTP username
          </label>
          <input
            id="login"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            placeholder="your API/FTP username"
            className="h-11 w-full rounded-lg border border-line bg-sunken px-3 text-sm outline-none transition placeholder:text-faint focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
          />
        </div>

        <div>
          <label htmlFor="key" className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-faint">
            StreamTape API / FTP password {keySet && <span className="text-success">· saved</span>}
          </label>
          <input
            id="key"
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={keySet ? "••••••••••••  (leave blank to keep)" : "your API/FTP password"}
            className="h-11 w-full rounded-lg border border-line bg-sunken px-3 text-sm outline-none transition placeholder:text-faint focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
          />
          <p className="mt-1.5 text-xs leading-relaxed text-faint">
            StreamTape uses one username + password for both FTP and its API.
            Find them at{" "}
            <a
              href="https://streamtape.com/account"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-strong underline-offset-2 hover:underline"
            >
              streamtape.com → Account
            </a>{" "}
            under <span className="text-muted">API/FTP Username</span> and{" "}
            <span className="text-muted">API/FTP Password</span>. They map to the
            API&rsquo;s <code className="rounded bg-sunken px-1 py-0.5 text-muted">login</code> and{" "}
            <code className="rounded bg-sunken px-1 py-0.5 text-muted">key</code> parameters.
          </p>
        </div>

        {/* Cloudinary — optional hosted posters */}
        <div className="border-t border-line pt-5">
          <h3 className="text-sm font-semibold uppercase tracking-widest text-faint">
            Cloudinary
            <span className="ml-1.5 font-normal normal-case text-muted">(optional · hosted posters)</span>
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-faint">
            Poster frames generated by ffmpeg at upload time get pushed to
            Cloudinary and come back as a stable hosted URL. Find these at{" "}
            <a
              href="https://cloudinary.com/console"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-strong underline-offset-2 hover:underline"
            >
              cloudinary.com/console
            </a>{" "}
            (the “Cloud name”, plus API Key / API Secret from Dashboard → API Keys).
          </p>

          <div className="mt-4 space-y-4">
            <div>
              <label htmlFor="cloudName" className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-faint">
                Cloud name (cloud id)
              </label>
              <input
                id="cloudName"
                value={cloudName}
                onChange={(e) => setCloudName(e.target.value)}
                placeholder="your-cloud-name"
                className="h-11 w-full rounded-lg border border-line bg-sunken px-3 text-sm outline-none transition placeholder:text-faint focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
              />
            </div>
            <div>
              <label htmlFor="cloudKey" className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-faint">
                API key {cloudKeySet && <span className="text-success">· saved</span>}
              </label>
              <input
                id="cloudKey"
                type="password"
                value={cloudKey}
                onChange={(e) => setCloudKey(e.target.value)}
                placeholder={cloudKeySet ? "••••••••••••  (leave blank to keep)" : "API key"}
                className="h-11 w-full rounded-lg border border-line bg-sunken px-3 text-sm outline-none transition placeholder:text-faint focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
              />
            </div>
            <div>
              <label htmlFor="cloudSecret" className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-faint">
                API secret {cloudSecretSet && <span className="text-success">· saved</span>}
              </label>
              <input
                id="cloudSecret"
                type="password"
                value={cloudSecret}
                onChange={(e) => setCloudSecret(e.target.value)}
                placeholder={cloudSecretSet ? "••••••••••••  (leave blank to keep)" : "API secret"}
                className="h-11 w-full rounded-lg border border-line bg-sunken px-3 text-sm outline-none transition placeholder:text-faint focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
              />
            </div>
          </div>
        </div>

        {/* PostgreSQL — settings persistence + optional catalog enrichment */}
        <div className="border-t border-line pt-5">
          <h3 className="text-sm font-semibold uppercase tracking-widest text-faint">
            PostgreSQL
            <span className="ml-1.5 font-normal normal-case text-muted">(required to save settings)</span>
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-faint">
            The connection string below is where ALL settings on this page are
            stored — so they persist across browsers and incognito windows
            instead of living in localStorage. It also powers the enriched
            catalog: posters, descriptions, and durations keyed by StreamTape
            file id survive restarts. Setting{" "}
            <code className="rounded bg-sunken px-1 py-0.5 text-muted">DATABASE_URL</code>{" "}
            in env is the recommended way to make this cross-browser.
          </p>
          <div className="mt-4">
            <label htmlFor="postgresDsn" className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-faint">
              Connection string
            </label>
            <input
              id="postgresDsn"
              value={postgresDsn}
              onChange={(e) => setPostgresDsn(e.target.value)}
              placeholder="postgres://user:password@host:5432/dbname"
              spellCheck={false}
              className="h-11 w-full rounded-lg border border-line bg-sunken px-3 text-sm outline-none transition placeholder:text-faint focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
            />
          </div>
        </div>

        {error && (
          <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink transition hover:bg-accent-strong disabled:opacity-50"
        >
          {saving ? "Saving…" : saved ? (<><CheckIcon className="h-4 w-4" /> Saved</>) : "Save credentials"}
        </button>
      </form>

      <p className="mt-6 text-xs leading-relaxed text-faint">
        Settings are stored in PostgreSQL (server-side), so they survive across
        browsers and incognito windows. Environment variables still take
        precedence over saved values:{" "}
        <code className="rounded bg-sunken px-1 py-0.5 text-muted">STREAMTAPE_LOGIN</code> /{" "}
        <code className="rounded bg-sunken px-1 py-0.5 text-muted">STREAMTAPE_KEY</code>,
        <code className="ml-1 rounded bg-sunken px-1 py-0.5 text-muted">CLOUDINARY_CLOUD_NAME</code> /{" "}
        <code className="rounded bg-sunken px-1 py-0.5 text-muted">CLOUDINARY_API_KEY</code> /{" "}
        <code className="rounded bg-sunken px-1 py-0.5 text-muted">CLOUDINARY_API_SECRET</code>, and{" "}
        <code className="rounded bg-sunken px-1 py-0.5 text-muted">DATABASE_URL</code>. Also set{" "}
        <code className="rounded bg-sunken px-1 py-0.5 text-muted">DATABASE_URL</code> in env
        so a browser that has never visited the /settings page (e.g. incognito)
        can reach the stored configuration. See the README for details.
      </p>
    </div>
  );
}

function StatusPill({ health }: { health: HealthState | null }) {
  const ok = health?.configured && !health?.error;
  const label = ok ? "Connected" : health?.configured ? "Needs attention" : "Not configured";
  const cls = ok
    ? "bg-success/15 text-success"
    : health?.configured
      ? "bg-amber-400/15 text-amber-300"
      : "bg-line text-faint";
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
      <span className={`mt-0.5 inline-flex h-4 w-4 flex-none items-center justify-center rounded-full text-[10px] ${ok ? "bg-success/20 text-success" : "bg-danger/20 text-danger"}`}>
        {ok ? "✓" : "!"}
      </span>
      <div className="min-w-0">
        <span className="font-medium text-fg">{label}</span>
        {detail && <span className="ml-2 break-words text-faint">{detail}</span>}
      </div>
    </div>
  );
}

