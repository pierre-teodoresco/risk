import { body, create, errorResponse, originCheck, quota } from "@/lib/store";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    originCheck(req);
    await quota(req, "create", 20);
    const b = await body(req);
    return Response.json(await create(b.name, b.color), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
