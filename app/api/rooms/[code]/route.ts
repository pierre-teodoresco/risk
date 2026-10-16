import {
  bearer,
  body,
  errorResponse,
  join,
  originCheck,
  perform,
  preview,
  quota,
  read,
} from "@/platform/store";
import { LEGACY_GAME } from "@/platform/modules";
export const runtime = "nodejs";
type Context = { params: Promise<{ code: string }> };
// Clients name the game they expect; Mappa clients from before the hub send none.
const gameParam = (req: Request) =>
  new URL(req.url).searchParams.get("game") ?? LEGACY_GAME;
export async function GET(req: Request, ctx: Context) {
  try {
    const { code } = await ctx.params;
    const game = gameParam(req);
    const token = req.headers.get("authorization");
    if (token)
      return Response.json(
        { game: await read(code, game, bearer(req)) },
        { headers: { "Cache-Control": "no-store" } },
      );
    await quota(req, "preview", 200);
    return Response.json(await preview(code, game), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(req: Request, ctx: Context) {
  try {
    originCheck(req);
    const { code } = await ctx.params,
      game = gameParam(req),
      b = await body(req);
    if (b.type === "join") {
      await quota(req, "join", 120);
      return Response.json(await join(code, game, b), {
        headers: { "Cache-Control": "no-store" },
      });
    }
    const token = bearer(req);
    return Response.json(
      { game: await perform(code, game, token, b) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
