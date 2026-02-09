import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";
import Nav from "@/components/Nav";
import NavigationProgress from "@/components/NavigationProgress";

export const metadata: Metadata = {
  title: "NeuroPilot",
  description: "NeuroPilot – EEG brainwave drone control",
  icons: {
    icon: "/neuropilot.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <NavigationProgress />
          <Nav />
          {children}
        </Providers>
      </body>
    </html>
  );
}
