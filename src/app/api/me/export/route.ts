/**
 * GET /api/me/export — "Download my data".
 * Returns everything held about the logged-in user as a JSON file.
 */
import { APP_NAME } from "@/config/brand";
import { exportUserData } from "@/server/account";
import { getCurrentUser } from "@/server/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Not logged in." }, { status: 401 });
  const data = await exportUserData(user);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${APP_NAME.toLowerCase()}-my-data.json"`,
      "Cache-Control": "no-store",
    },
  });
}
