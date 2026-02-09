"use client";

import { SessionProvider } from "next-auth/react";
import { Toast } from "@heroui/react";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      {children}
      <Toast.Container />
    </SessionProvider>
  );
}
