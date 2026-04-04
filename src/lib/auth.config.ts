import type { NextAuthConfig } from "next-auth";
import type { UserRole } from "@/types";

declare module "next-auth" {
  interface User {
    role: UserRole;
    mustChangePassword: boolean;
    isActive: boolean;
  }
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: UserRole;
      mustChangePassword: boolean;
      isActive: boolean;
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
    async jwt({ token, user, trigger }) {
      if (user) {
        (token as Record<string, unknown>).id = user.id as string;
        (token as Record<string, unknown>).role = user.role;
        (token as Record<string, unknown>).mustChangePassword = user.mustChangePassword;
        (token as Record<string, unknown>).isActive = user.isActive;
      }
      if (trigger === "update") {
        (token as Record<string, unknown>).mustChangePassword = false;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = token.role as UserRole;
      session.user.mustChangePassword = token.mustChangePassword as boolean;
      session.user.isActive = token.isActive as boolean;
      return session;
    },
    async authorized({ auth, request }) {
      const { pathname } = request.nextUrl;

      // Public routes
      if (
        pathname.startsWith("/login") ||
        pathname.startsWith("/auth-error") ||
        pathname.startsWith("/api/auth") ||
        pathname.startsWith("/api/webhooks") ||
        pathname.startsWith("/api/cron") ||
        pathname.startsWith("/api/diagnostics") ||
        pathname.startsWith("/api/live") ||
        pathname.startsWith("/watch") ||
        pathname.startsWith("/diagnostics")
      ) {
        return true;
      }

      // All other routes require auth
      if (!auth?.user) {
        return false;
      }

      // Force password change
      if (auth.user.mustChangePassword) {
        if (pathname.startsWith("/change-password") || pathname.startsWith("/api/change-password")) {
          return true;
        }
        return Response.redirect(new URL("/change-password", request.nextUrl.origin));
      }

      if (pathname.startsWith("/change-password")) {
        return Response.redirect(new URL("/", request.nextUrl.origin));
      }

      // Inactive creator: only allow settings page and upload APIs (for document submission)
      if (auth.user.role === "creator" && !auth.user.isActive) {
        if (
          pathname.startsWith("/dashboard/settings") ||
          pathname.startsWith("/api/upload") ||
          pathname.startsWith("/api/auth")
        ) {
          return true;
        }
        return Response.redirect(new URL("/dashboard/settings", request.nextUrl.origin));
      }

      // Admin/owner should not access /dashboard
      if (pathname.startsWith("/dashboard")) {
        if (auth.user.role === "owner" || auth.user.role === "admin") {
          return Response.redirect(new URL("/admin", request.nextUrl.origin));
        }
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
