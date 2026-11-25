import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { parseAppearancePreferences, type AppearancePreferences } from "./types";

// Read the authenticated user's saved settings before rendering the document.
export const getServerAppearance = cache(async (): Promise<AppearancePreferences | null> => {
  const token = (await cookies()).get("mspaces_session")?.value;
  if (!token) return null;

  try {
    const url = new URL("/users/me/preferences", process.env.AUTH_API_URL ?? "http://localhost:4000");
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;

    const response = await fetch(url, {
      headers: { Cookie: `mspaces_session=${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return null;
    return parseAppearancePreferences(await response.json());
  } catch {
    return null;
  }
});
