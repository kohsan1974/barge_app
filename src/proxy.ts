import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  if (!req.auth) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    return NextResponse.redirect(loginUrl);
  }
});

export const config = {
  // api/cron はCRON_SECRET、api/ping はkeep-warm用で認証不要のため除外する
  matcher: ["/((?!api/auth|api/cron|api/ping|login|_next/static|_next/image|favicon.ico).*)"],
};
