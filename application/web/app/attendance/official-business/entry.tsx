"use client";
import { useState } from "react";
import { QueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { RealtimeQueryProvider } from "../../components/realtime-query-provider";
import { PageHeader, PageHeading } from "../../components/page-heading";
import { OfficialBusinessWorkspace } from "./workspace";
import styles from "./ob.module.css";
export function OfficialBusinessEntry() {
  const [client] = useState(() => new QueryClient());
  const search = useSearchParams();
  return (
    <RealtimeQueryProvider client={client}>
      <PageHeader className={styles.entryHeader}>
        <div>
          <p className={styles.eyebrow}>MY ACCOUNT / ATTENDANCE</p>
          <PageHeading>Official Business</PageHeading>
          <p>File and track your authorized work away from the office.</p>
        </div>
      </PageHeader>
      <OfficialBusinessWorkspace
        branchId=""
        initialId={search.get("obId")}
        showHeading={false}
      />
    </RealtimeQueryProvider>
  );
}
