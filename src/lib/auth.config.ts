import type { NextAuthConfig } from "next-auth";
import type { UserRole } from "@/types";

declare module "next-auth" {
  interface User {
    role: UserRole;
  }
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: UserRole;
      image?: string | null;
    };
  }
}

export const authConfig: NextAuthConfig = {
  providers: [],
  trustHost: true,
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
    error: "/auth-error",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        (token as Record<string, unknown>).id = user.id as string;
        (token as Record<string, unknown>).role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = token.role as UserRole;
      return session;
    },
    async authorized({ auth, request }) {
      const { pathname } = request.nextUrl;

      // Public routes
      if (
        pathname.startsWith("/login") ||
        pathname.startsWith("/register") ||
        pathname.startsWith("/auth-error") ||
        pathname.startsWith("/api/auth") ||
        pathname.startsWith("/api/webhooks") ||
        pathname.startsWith("/api/diagnostics")
      ) {
        return true;
      }

      // All other routes require auth
      if (!auth?.user) {
        return false;
      }

      // Admin routes require owner or admin role
      if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
        if (auth.user.role !== "owner" && auth.user.role !== "admin") {
          return false;
        }
      }

      return true;
    },
  },
};
