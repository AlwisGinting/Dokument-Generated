import { getSupabaseClient } from "@/lib/services/supabaseClient";

export interface AuthenticatedRequest {
  userId: string;
  accessToken: string;
}

export async function authenticateRequest(
  request: Request,
): Promise<AuthenticatedRequest | null> {
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  const accessToken = match?.[1]?.trim();
  if (!accessToken) {
    return null;
  }

  const { data, error } = await getSupabaseClient().auth.getUser(accessToken);
  if (error || !data.user) {
    return null;
  }
  return { userId: data.user.id, accessToken };
}
