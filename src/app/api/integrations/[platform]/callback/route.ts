import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { timingSafeEqual } from "node:crypto";
import { currentUserId } from "@/lib/auth/session";
import { completeConnect } from "@/datahub/social/service";
import { getEnv } from "@/lib/env";

export const runtime = "nodejs";

const PLATFORMS = { instagram: "INSTAGRAM", tiktok: "TIKTOK" } as const;

/** Callback OAuth : vérification du paramètre state (anti-CSRF) avant tout échange de code. */
export async function GET(req: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const p = PLATFORMS[platform as keyof typeof PLATFORMS];
  const base = getEnv().APP_URL;
  const userId = await currentUserId();
  if (!userId) return NextResponse.redirect(new URL("/login", base));
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  const jar = await cookies();
  const expected = jar.get(`oauth_state_${platform}`)?.value ?? "";
  jar.delete(`oauth_state_${platform}`);
  const valid = expected.length > 0 && expected.length === state.length && timingSafeEqual(Buffer.from(expected), Buffer.from(state));
  if (!p || !code || !valid) return NextResponse.redirect(new URL("/social?error=oauth", base));
  try {
    await completeConnect(userId, p, code);
    return NextResponse.redirect(new URL(`/social?connected=${platform}`, base));
  } catch {
    return NextResponse.redirect(new URL(`/social?error=connect&platform=${platform}`, base));
  }
}
