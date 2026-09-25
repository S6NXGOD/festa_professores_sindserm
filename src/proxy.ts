import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Verificação otimista: sem cookie de sessão, redireciona ao login.
 * A autorização real (papel/permissão) acontece no servidor em cada página e action.
 */
export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) {
    const url = new URL("/entrar", request.url);
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/painel/:path*", "/portaria/:path*", "/conta"],
};
