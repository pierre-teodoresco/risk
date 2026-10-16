import { body, create, errorResponse, originCheck, quota } from "@/platform/store";
import { LEGACY_GAME } from "@/platform/modules";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    originCheck(req);
    await quota(req, "create", 20);
    const b = await body(req);
    return Response.json(await create(b.game ?? LEGACY_GAME, b), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
