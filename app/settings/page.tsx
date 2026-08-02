"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckIcon, SettingsIcon, SearchIcon } from "@/components/icons";
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

  const load = useCallback(() => {
    // Settings live in localStorage now (no server DB).
    const s = getStoredSettings();
    setLogin(s.streamtape_login || "");
    setKeySet(Boolean(s.streamtape_key));
  }, []);

  const loadHealth = useCallback(async () => {
    const s = getStoredSettings();
    const q = `login=${encodeURIComponent(s.streamtape_login || "")}&key=${encodeURIComponent(s.streamtape_key || "")}`;
    const res = await fetch(`/api/streamtape/health?${q}`);
    const data: HealthState = await res.json();
    setHealth(data);
  }, []);

  async function runDiagnostics() {
    setDiagLoading(true);
    setDiag(null);
    try {
      const s = getStoredSettings();
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
      const current = getStoredSettings();
      const next = {
        ...current,
        streamtape_login: login.trim(),
      };
      if (key.trim()) next.streamtape_key = key.trim();
      saveStoredSettings(next);
      setKey("");
      setKeySet(Boolean(next.streamtape_key));
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
            Configure StreamTape so uploads have somewhere to go.
          </p>
        </div>
      </header>

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
        Tip: in production you can set these as environment variables instead —
        they take precedence over anything saved here.
        <code className="ml-1 rounded bg-sunken px-1 py-0.5 text-muted">STREAMTAPE_LOGIN</code> = your API/FTP username,
        <code className="ml-1 rounded bg-sunken px-1 py-0.5 text-muted">STREAMTAPE_KEY</code> = your API/FTP password.
        See the README for details.
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

