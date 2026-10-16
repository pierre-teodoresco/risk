"use client";
// Browser side of a room: identity token, creation and joining, Realtime sync with polling
// fallback, presence heartbeats and commands. Mappa still runs its own copy in components/Mappa.tsx.
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import type { Action } from "./contract";

export type SyncedState = {
  code: string;
  channel: string;
  revision: number;
  me: string;
  phase: string;
  deadline?: number | null;
  paused?: boolean;
};
export type Preview = { code: string; phase: string; players: unknown[] };

const HEARTBEAT_MS = 10000;
const REQUEST_TIMEOUT_MS = 15000;
const ACTION_TIMEOUT_MS = 20000;
/** After a deadline, connected clients ask the server to apply it for a short while. */
const DEADLINE_GRACE_MS = 12000;
// Realtime topics keep the prefix the SQL notifier was written with.
const TOPIC_PREFIX = "mappa:";

export function useRoom<T extends SyncedState>(game: string, path: string) {
  const [state, setState] = useState<T | null>(null),
    [preview, setPreview] = useState<Preview | null>(null),
    [room, setRoom] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [lost, setLost] = useState(false),
    [error, setError] = useState(""),
    [recent, setRecent] = useState("");
  const token = useRef(""),
    stateRef = useRef<T | null>(null),
    busyRef = useRef(false),
    fetching = useRef(false),
    epoch = useRef(0);
  const sessionKey = (code: string) => `${game}.session.${code}`;
  const api = (code?: string) => `/api/rooms${code ? "/" + code : ""}?game=${game}`;

  const accept = useCallback((next: T) => {
    const old = stateRef.current;
    if (old?.code === next.code && old.me === next.me && next.revision < old.revision) return;
    stateRef.current = next;
    setState(next);
    setLost(false);
  }, []);

  const sync = useCallback(
    async (code: string, heartbeat = false) => {
      if (fetching.current || !token.current) return;
      fetching.current = true;
      const at = epoch.current;
      try {
        const res = await fetch(api(code), {
          method: heartbeat ? "POST" : "GET",
          headers: {
            Authorization: "Bearer " + token.current,
            ...(heartbeat ? { "Content-Type": "application/json" } : {}),
          },
          ...(heartbeat ? { body: JSON.stringify({ type: "heartbeat" }) } : {}),
          cache: "no-store",
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        if (at === epoch.current) accept(data.game);
      } catch {
        if (at === epoch.current) setLost(true);
      } finally {
        fetching.current = false;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accept, game],
  );

  // Restore the seat named in the URL, or show that room's preview.
  useEffect(() => {
    let saved: string | null = null;
    const code = new URLSearchParams(location.search).get("room")?.toUpperCase() ?? "";
    try {
      setRecent(localStorage.getItem(`${game}.recent`) ?? "");
      if (code) saved = localStorage.getItem(sessionKey(code));
    } catch {}
    setRoom(code);
    if (!code) return setLoading(false);
    if (saved) {
      token.current = saved;
      void sync(code, true).finally(() => setLoading(false));
      return;
    }
    fetch(api(code), { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : setPreview(d)))
      .catch(() => setError("serverError"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sync]);

  useEffect(() => {
    if (!state) return;
    const code = state.code;
    const poll = setInterval(() => void sync(code, true), HEARTBEAT_MS);
    const wake = () => void sync(code, true);
    window.addEventListener("online", wake);
    window.addEventListener("focus", wake);
    let remove = () => {};
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
      key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (url && key) {
      const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      const channel = supabase
        .channel(TOPIC_PREFIX + state.channel)
        .on("broadcast", { event: "change" }, () => void sync(code))
        .subscribe((status) => {
          if (status === "SUBSCRIBED") void sync(code);
        });
      remove = () => void supabase.removeChannel(channel);
    }
    return () => {
      clearInterval(poll);
      window.removeEventListener("online", wake);
      window.removeEventListener("focus", wake);
      remove();
    };
  }, [state?.code, state?.channel, sync]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const deadline = state?.deadline;
    if (!deadline || state?.paused) return;
    const wait = deadline - Date.now();
    if (wait < -DEADLINE_GRACE_MS) return;
    const timeout = setTimeout(() => void sync(state.code, true), Math.max(0, wait) + 300);
    return () => clearTimeout(timeout);
  }, [state?.deadline, state?.paused, state?.code, sync]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Creates a room (no code) or joins `code`; `input` is the brick's profile (name, emblem…). */
  async function enter(code: string | null, input: Record<string, unknown>) {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      if (code) {
        let saved: string | null = null;
        try {
          saved = localStorage.getItem(sessionKey(code));
        } catch {}
        if (saved) {
          const restored = await fetch(api(code), {
            headers: { Authorization: "Bearer " + saved },
            cache: "no-store",
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          });
          if (restored.ok) {
            token.current = saved;
            accept((await restored.json()).game);
            setPreview(null);
            history.replaceState(null, "", `${path}?room=${code}`);
            return true;
          }
        }
      }
      const res = await fetch(api(code ?? undefined), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, type: "join", game }),
        signal: AbortSignal.timeout(ACTION_TIMEOUT_MS),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      token.current = d.token;
      try {
        localStorage.setItem(sessionKey(d.game.code), d.token);
        localStorage.setItem(`${game}.recent`, d.game.code);
      } catch {}
      setRecent(d.game.code);
      setRoom(d.game.code);
      history.replaceState(null, "", `${path}?room=${d.game.code}`);
      accept(d.game);
      setPreview(null);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "serverError");
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  /** Sends one command; resolves to true when the server accepted it. */
  async function act(action: Action) {
    const g = stateRef.current;
    if (!g || busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    setError("");
    const at = epoch.current;
    try {
      const res = await fetch(api(g.code), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token.current },
        body: JSON.stringify({ ...action, requestId: crypto.randomUUID(), revision: g.revision }),
        signal: AbortSignal.timeout(ACTION_TIMEOUT_MS),
      });
      const d = await res.json();
      if (at !== epoch.current) return false;
      if (!res.ok) throw new Error(d.error);
      if (action.type === "leave") {
        try {
          localStorage.removeItem(sessionKey(g.code));
        } catch {}
        home();
      } else accept(d.game);
      return true;
    } catch (e) {
      if (at === epoch.current) setError(e instanceof Error ? e.message : "serverError");
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function home() {
    epoch.current++;
    token.current = "";
    stateRef.current = null;
    setState(null);
    setPreview(null);
    setLost(false);
    setError("");
    setRoom("");
    history.pushState(null, "", path);
  }

  const hasSession = (code: string) => {
    try {
      return !!localStorage.getItem(sessionKey(code));
    } catch {
      return false;
    }
  };

  return { state, preview, room, setRoom, busy, loading, lost, error, setError, recent, hasSession, enter, act, home };
}
