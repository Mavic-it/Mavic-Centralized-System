"use client";
import { FieldLabel } from "./field-label";
import {
  FileWarning,
  ArrowUpRight,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";
import ui from "./employee-content.module.css";
import Link from "next/link";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { request, label, type RecordItem } from "../work/types";
import { PortalSectionLoading } from "./portal-presentation";
import styles from "./people-workspace.module.css";

type Incident = RecordItem & {
  offense: string | null;
  canRecordOffense: boolean;
};
export function EmployeeIncidentHistory({
  employeeId,
}: {
  employeeId: string;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<string | null>(null);
  const [success, setSuccess] = useState("");
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["employee-incidents", employeeId, page],
    queryFn: () =>
      request<{ items: Incident[]; hasNext: boolean }>(
        "incidents",
        `?employeeId=${encodeURIComponent(employeeId)}&page=${page}`,
      ),
  });
  const mutation = useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      version: number;
      offense: string;
      reason: string;
    }) =>
      request("incidents", `/${id}/offense`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      setEditing(null);
      setSuccess("Offense classification saved.");
      await client.invalidateQueries({
        queryKey: ["employee-incidents", employeeId],
      });
    },
  });
  const visibleItems = (query.data?.items ?? []).filter(
    (item) =>
      (!search.trim() ||
        `${item.title} ${item.referenceNumber ?? ""}`
          .toLowerCase()
          .includes(search.toLowerCase().trim())) &&
      (status === "ALL" ||
        (status === "FINISHED") ===
          ["RESOLVED", "CLOSED"].includes(item.status)),
  );
  return (
    <section
      id="incident-history"
      className={styles.panel}
      aria-label="Incident and discipline history"
    >
      <div className={ui.header}>
        <div className={ui.heading}>
          <span className={ui.icon}>
            <FileWarning size={23} />
          </span>
          <div>
            <h2>Incident / discipline history</h2>
            <p className={ui.description}>
              Reports, case progress and recorded offense levels.
            </p>
          </div>
        </div>
        <span className={ui.badge}>
          <ShieldCheck size={13} />
          Authorized records
        </span>
      </div>
      <div className={ui.toolbar}>
        <input
          aria-label="Search incidents on this page"
          type="search"
          placeholder="Search this page by title or reference..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          aria-label="Filter incidents on this page"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="ALL">All reports on this page</option>
          <option value="ACTIVE">Open reports</option>
          <option value="FINISHED">Resolved / closed</option>
        </select>
      </div>
      {success && (
        <p role="status" className={ui.notice}>
          {success}
        </p>
      )}
      {query.isPending ? (
        <PortalSectionLoading label="Loading incident history" />
      ) : query.isError ? (
        <div role="alert">
          <p>{query.error.message}</p>
          <button
            className={ui.button}
            type="button"
            onClick={() => query.refetch()}
          >
            Retry
          </button>
        </div>
      ) : (
        <>
          {!query.data.items.length && (
            <div className={ui.empty}>
              <FileWarning size={30} />
              <strong>No incident records</strong>
              <span>No reports are available for you to view.</span>
            </div>
          )}
          {query.data.items.length > 0 && (
            <p className={ui.description}>
              Reports are not offenses until classified. Filters apply to the
              current page.
            </p>
          )}
          {query.data.items.length > 0 && !visibleItems.length && (
            <div className={ui.empty}>
              No reports match these filters.
              <button
                className={ui.button}
                type="button"
                onClick={() => {
                  setSearch("");
                  setStatus("ALL");
                }}
              >
                Clear filters
              </button>
            </div>
          )}
          <ul className={ui.recordList}>
            {visibleItems.map((item) => (
              <li className={ui.record} key={item.id}>
                <div
                  style={{
                    minWidth: 0,
                    width: "100%",
                    overflowWrap: "anywhere",
                  }}
                >
                  <div className={ui.recordTop}>
                    <div>
                      <span className={ui.reference}>
                        {item.referenceNumber || "Incident report"}
                      </span>
                      <h3>
                        <Link href={`/incidents?record=${item.id}`}>
                          {item.title}
                        </Link>
                      </h3>
                      <div className={ui.meta}>
                        <span>{item.incidentDate}</span>
                        <span aria-hidden="true">/</span>
                        <span>{label(item.category || "OTHER")}</span>
                      </div>
                    </div>
                    <div className={ui.meta}>
                      <span
                        className={`${ui.badge} ${["RESOLVED", "CLOSED"].includes(item.status) ? ui.positive : ui.warning}`}
                      >
                        {label(item.status)}
                      </span>
                      <span className={ui.badge}>
                        {item.offense
                          ? `${["", "1st", "2nd", "3rd"][Number(item.offense)]} offense`
                          : "Not classified"}
                      </span>
                    </div>
                  </div>
                  {item.caseStatus && (
                    <p className={ui.description}>
                      Disciplinary case / {label(item.caseStatus)}
                    </p>
                  )}
                  <div className={ui.actions}>
                    <Link
                      className={ui.button}
                      href={`/incidents?record=${item.id}`}
                    >
                      Open report
                      <ArrowUpRight size={14} />
                    </Link>
                    {item.canRecordOffense && (
                      <button
                        className={ui.button}
                        type="button"
                        disabled={mutation.isPending}
                        onClick={() => {
                          setEditing(item.id);
                          setSuccess("");
                          mutation.reset();
                        }}
                      >
                        <SlidersHorizontal size={14} />
                        Record offense level
                      </button>
                    )}
                  </div>
                  {editing === item.id && (
                    <form
                      className={ui.form}
                      onSubmit={(event) => {
                        event.preventDefault();
                        const form = new FormData(event.currentTarget);
                        mutation.mutate({
                          id: item.id,
                          version: item.version,
                          offense: String(form.get("offense")),
                          reason: String(form.get("reason")),
                        });
                      }}
                    >
                      <fieldset disabled={mutation.isPending}>
                        <legend>Offense classification</legend>
                        <p className={ui.description}>
                          Automatic numbering uses prior recorded offenses in
                          the same category, across all dates. A reason is
                          required for every change.
                        </p>
                        <label>
                          <FieldLabel required={true}>Level</FieldLabel>
                          <select
                            required
                            name="offense"
                            autoFocus
                            defaultValue="AUTO"
                          >
                            <option value="AUTO">
                              Automatic next offense in this category
                            </option>
                            <option value="1">1st offense</option>
                            <option value="2">2nd offense</option>
                            <option value="3">3rd offense</option>
                            <option value="NONE">Clear classification</option>
                          </select>
                        </label>
                        <label>
                          <FieldLabel required={true}>Reason</FieldLabel>
                          <textarea name="reason" required maxLength={2000} />
                        </label>
                        {mutation.isError && (
                          <p role="alert">{mutation.error.message}</p>
                        )}
                        <button className={ui.primary} type="submit">
                          {mutation.isPending
                            ? "Saving…"
                            : "Save classification"}
                        </button>
                        <button
                          className={ui.button}
                          type="button"
                          onClick={() => setEditing(null)}
                        >
                          Cancel
                        </button>
                      </fieldset>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <div className={ui.pagination}>
            <button
              className={ui.button}
              type="button"
              disabled={page === 1 || mutation.isPending}
              onClick={() => {
                setEditing(null);
                setPage(page - 1);
              }}
            >
              <ChevronLeft size={14} />
              Previous
            </button>{" "}
            <span>Page {page}</span>{" "}
            <button
              className={ui.button}
              type="button"
              disabled={!query.data.hasNext || mutation.isPending}
              onClick={() => {
                setEditing(null);
                setPage(page + 1);
              }}
            >
              Next
              <ChevronRight size={14} />
            </button>
          </div>
        </>
      )}
    </section>
  );
}
