import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { api } from "./api";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: { email: { label: "Email", type: "text" }, password: { label: "Password", type: "password" } },
      async authorize(creds) {
        if (!creds?.email || !creds?.password) return null;
        try {
          const { access_token } = await api.auth.login(creds.email, creds.password);
          return { id: "", name: creds.email, accessToken: access_token };
        } catch (error) {
          console.error("Auth error:", error);
          console.error("Email:", creds.email);
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error("Error details:", errorMessage);
          // Return null to indicate authentication failed
          // NextAuth will handle this and set res.error
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.accessToken) token.accessToken = user.accessToken as string;
      return token;
    },
    async session({ session, token }) {
      if (session.user) (session as { accessToken?: string }).accessToken = token.accessToken as string;
      return session;
    },
  },
  session: { strategy: "jwt", maxAge: 30 * 60 },
  pages: { signIn: "/login" },
  secret: process.env.NEXTAUTH_SECRET || "dev-secret-change-in-production-min-32-chars",
};

declare module "next-auth" {
  interface Session {
    accessToken?: string;
  }
  interface User {
    accessToken?: string;
  }
}
