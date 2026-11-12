"use client";
import { RealtimeQueryProvider } from "./realtime-query-provider";

import { QueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

export default function MyProfileQueryProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <RealtimeQueryProvider client={queryClient}>{children}</RealtimeQueryProvider>
  );
}
