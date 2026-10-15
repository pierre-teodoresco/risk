import {
  bearer,
  body,
  errorResponse,
  join,
  load,
  originCheck,
  perform,
  quota,
  read,
} from "@/lib/store";
export const runtime = "nodejs";
type Context = { params: Promise<{ code: string }> };
export async function GET(req: Request, ctx: Context) {
  try {
    const { code } = await ctx.params;
    const token = req.headers.get("authorization");
    if (token)
      return Response.json(
        { game: await read(code, bearer(req)) },
        { headers: { "Cache-Control": "no-store" } },
      );
    await quota(req, "preview", 200);
    const g = await load(code);
    return Response.json(
      {
        code: g.code,
        phase: g.phase,
        players: g.players.map((p) => ({ name: p.name, color: p.color })),
        timer: g.timer,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(req: Request, ctx: Context) {
  try {
    originCheck(req);
    const { code } = await ctx.params,
      b = await body(req);
    if (b.type === "join") {
      await quota(req, "join", 120);
      return Response.json(await join(code, b.name, b.color), {
        headers: { "Cache-Control": "no-store" },
      });
    }
    const token = bearer(req);
    return Response.json(
      { game: await perform(code, token, b) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
