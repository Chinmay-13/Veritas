/**
 * GET /api/matches/:id/messages — polled by the chat every few seconds.
 * Returns the transcript and Safety Shield state for a match the caller is part of.
 */
import { uuidSchema } from "@/lib/validation";
import { getCurrentUser } from "@/server/auth";
import { getChatState } from "@/server/matchViews";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Not logged in." }, { status: 401 });

  const { id } = await params; // In Next.js 16, params is a Promise.
  if (!uuidSchema.safeParse(id).success) return Response.json({ error: "Not found." }, { status: 404 });

  // getChatState returns null unless the caller is one of the two participants.
  const chat = await getChatState(user.id, id);
  if (!chat) return Response.json({ error: "Not found." }, { status: 404 });
  return Response.json(chat, { headers: { "Cache-Control": "no-store" } });
}
