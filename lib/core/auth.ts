import { getIronSession, sealData, unsealData } from "iron-session";
import type { IronSession, SessionOptions } from "iron-session";
import { cookies as nextCookies } from "next/headers";
import { loadSettings } from "./settings";

export type Session = {
  name?: string;
  color?: string;
  projectAccess?: Record<string, { joinedAt: number }>;
};

export const COOKIE_NAME = "overtree_session";
const COOKIE_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export async function sessionOptions(): Promise<SessionOptions> {
  const s = await loadSettings();
  return {
    password: s.sessionSecret,
    cookieName: COOKIE_NAME,
    cookieOptions: {
      sameSite: "lax",
      httpOnly: true,
      secure: false, // LAN, plain http
      maxAge: COOKIE_TTL_SECONDS,
      path: "/",
    },
  };
}

export async function getSession(): Promise<IronSession<Session>> {
  const cookies = await nextCookies();
  return await getIronSession<Session>(cookies, await sessionOptions());
}

/** Used from non-Next contexts (WS upgrade) — parses a raw Cookie header value. */
export async function readSessionFromCookieHeader(
  cookieHeader: string | undefined,
): Promise<Session | null> {
  if (!cookieHeader) return null;
  const map = parseCookieHeader(cookieHeader);
  const sealed = map[COOKIE_NAME];
  if (!sealed) return null;
  const opts = await sessionOptions();
  try {
    return await unsealData<Session>(sealed, {
      password: opts.password as string,
      ttl: COOKIE_TTL_SECONDS,
    });
  } catch {
    return null;
  }
}

export async function sealSession(session: Session): Promise<string> {
  const opts = await sessionOptions();
  return await sealData(session, {
    password: opts.password as string,
    ttl: COOKIE_TTL_SECONDS,
  });
}

function parseCookieHeader(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (!k) continue;
    out[k] = decodeURIComponent(rest.join("="));
  }
  return out;
}

export function hasProjectAccess(
  session: Session | null,
  projectId: string,
  projectIsPublic: boolean,
): boolean {
  if (!session?.name) return false;
  if (projectIsPublic) return true;
  return !!session.projectAccess?.[projectId];
}
