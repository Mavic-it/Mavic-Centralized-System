import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { Toaster } from "./components/ui/sonner";
import { DialogProvider } from "./components/ui/confirmation-provider";
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <DialogProvider>{children}</DialogProvider>
        <Toaster />
      </body>
    </html>
  );
}
