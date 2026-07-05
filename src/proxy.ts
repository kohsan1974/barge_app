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
  // api/cron はセッションではなく CRON_SECRET で認証するため除外する
  matcher: ["/((?!api/auth|api/cron|login|_next/static|_next/image|favicon.ico).*)"],
};
