import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { currentUserId } from "@/lib/auth/session";
import { newOAuthState, startConnect } from "@/datahub/social/service";
import { getEnv } from "@/lib/env";

export const runtime = "nodejs";

const PLATFORMS = { instagram: "INSTAGRAM", tiktok: "TIKTOK" } as const;

export async function GET(_req: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const p = PLATFORMS[platform as keyof typeof PLATFORMS];
  const base = getEnv().APP_URL;
  if (!(await currentUserId())) return NextResponse.redirect(new URL("/login", base));
  if (!p) return NextResponse.redirect(new URL("/social?error=platform", base));
  const state = newOAuthState();
  const res = startConnect(p, state);
  if (!res.ok || !res.data) return NextResponse.redirect(new URL(`/social?error=config&platform=${platform}`, base));
  (await cookies()).set(`oauth_state_${platform}`, state, { httpOnly: true, secure: base.startsWith("https"), sameSite: "lax", maxAge: 600, path: "/" });
  return NextResponse.redirect(res.data);
}
