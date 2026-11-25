import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { Geist } from "next/font/google";
import { Toaster } from "./components/ui/sonner";
import { DialogProvider } from "./components/ui/confirmation-provider";
import { getWorkspaceSession } from "./lib/workspace-session";
import { getServerAppearance } from "./appearance/appearance-server";
import { appearanceTokens } from "./appearance/appearance-runtime";
import { defaultAppearancePreferences } from "./appearance/types";
import "./globals.css";
// Activate shared recovery CSS even when session checks suspend or redirect the route.
import "./components/password-reset-queue.module.css";
import "./components/ui/modal.css";
import "./components/module-access-workspace.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Mavic | Operations Overview",
  description: "Centralized workspace operations for Mavic branches.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const session = await getWorkspaceSession();
  const appearance = session.status === "authenticated" ? await getServerAppearance() : null;
  const preferences = appearance ?? defaultAppearancePreferences;
  const dark = preferences.themeMode === "dark";
  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-theme={dark ? "dark" : "light"}
      data-theme-mode={preferences.themeMode}
      data-density={preferences.layoutDensity}
      data-accent={preferences.accentColor}
      style={appearanceTokens(preferences, dark) as CSSProperties}
      className={`${geistSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <DialogProvider>{children}</DialogProvider>
        <Toaster />
      </body>
    </html>
  );
}
