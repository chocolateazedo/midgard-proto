import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { db } from "@/lib/db";
import { authConfig } from "@/lib/auth.config";

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        try {
          if (!credentials?.email || !credentials?.password) {
            throw new Error("Email and password are required");
          }

          const email = credentials.email as string;
          const password = credentials.password as string;

          const user = await db.user.findFirst({
            where: { email },
          });

          if (!user) {
            throw new Error("User not found");
          }

          if (!user.isActive) {
            throw new Error("User is inactive");
          }

          const isValid = await compare(password, user.passwordHash);
          if (!isValid) {
            throw new Error("Invalid password");
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            image: user.avatarUrl,
          };
        } catch (error) {
          console.error("[AUTH ERROR]", error);
          return null;
        }
      },
    }),
  ],
});
