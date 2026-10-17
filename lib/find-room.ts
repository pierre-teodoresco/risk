/** Room codes are global: resolve their game in parallel and cancel the losing previews. */
export async function findRoom(code: string, gameIds: readonly string[], request: typeof fetch = fetch, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await Promise.any(gameIds.map(async (id) => {
      const response = await request(`/api/rooms/${encodeURIComponent(code)}?game=${encodeURIComponent(id)}`, {
        cache: "no-store", signal: controller.signal,
      });
      if (!response.ok) throw new Error("roomNotFound");
      return id;
    }));
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}
