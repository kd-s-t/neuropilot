"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useSession } from "next-auth/react";
import { useState } from "react";

const links = [
  { href: "/", label: "Introduction" },
  { href: "/eeg-device-calibration", label: "EEG Device Calibration" },
  { href: "/lab", label: "Lab" },
  { href: "/machines", label: "Machines" },
  { href: "/dji-camera", label: "DJI Camera" },
];

export default function Nav() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    
    try {
      const token = (session as { accessToken?: string } | undefined)?.accessToken ?? null;
      // Don't wait for backend logout - proceed with NextAuth signOut immediately
      api.auth.logout(token).catch((error) => {
        console.error("Backend logout error:", error);
      });
    } catch (error) {
      console.error("Logout error:", error);
    }
    
    // Sign out and redirect - use window.location for immediate navigation
    await signOut({ redirect: false });
    window.location.href = "/login";
  };

  const userEmail = session?.user?.email || session?.user?.name || "";
  const isAuthenticated = status === "authenticated";

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <nav className="container mx-auto flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/neuropilot.png"
              alt="NeuroPilot"
              width={32}
              height={32}
              className="h-8 w-8"
            />
            <span className="text-xl font-bold">
              Neuro<span className="text-accent">Pilot</span>
            </span>
          </Link>
          <div className="flex items-center gap-1">
            {links.map(({ href, label }) => {
              // Check if active - for /machines, also match /machines/* routes
              const isActive = pathname === href || (href === "/machines" && pathname.startsWith("/machines/"));
              // Only show protected routes if authenticated
              if (!isAuthenticated && (href === "/realtime" || href === "/training" || href === "/machines" || href === "/eeg-device-calibration" || href === "/lab" || href === "/dji-camera")) {
                return null;
              }
              return (
                <Link
                  key={href}
                  href={href}
                  className={`relative px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                  {isActive && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground" />
                  )}
                </Link>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-4">
          {isAuthenticated ? (
            <>
              {userEmail && (
                <span className="text-sm text-muted-foreground hidden sm:inline-block">
                  {userEmail}
                </span>
              )}
              <Button variant="outline" size="sm" onClick={handleLogout} disabled={isLoggingOut}>
                {isLoggingOut ? "Logging out..." : "Logout"}
              </Button>
            </>
          ) : (
            <Link href="/login">
              <Button variant="outline" size="sm">
                Login
              </Button>
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
