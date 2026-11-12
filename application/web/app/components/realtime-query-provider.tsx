"use client";
import { useEffect, type ReactNode } from "react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { watchRealtimeQueries } from "../lib/realtime-query-client";

/** Use for current and future workspace QueryClients, including nested caches. */
export function RealtimeQueryProvider({
  client,
  children,
}: {
  client: QueryClient;
  children: ReactNode;
}) {
  useEffect(
    () => watchRealtimeQueries(client),
    [client],
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
