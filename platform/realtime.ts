/** Load Realtime only after joining a room; polling remains available if the chunk cannot load. */
export function subscribeRoom(channel: string, sync: () => void) {
  let stopped = false;
  let remove = () => {};
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (url && key) {
    void import("@supabase/supabase-js").then(({ createClient }) => {
      // A player may leave before the library finishes downloading.
      if (stopped) return;
      const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      const subscription = supabase
        .channel("mappa:" + channel)
        .on("broadcast", { event: "change" }, sync)
        .subscribe((status) => {
          if (status === "SUBSCRIBED") sync();
        });
      remove = () => { void supabase.removeChannel(subscription); };
    }).catch(() => {
      // The room's regular heartbeats continue to fetch the current state.
    });
  }
  return () => {
    stopped = true;
    remove();
  };
}
