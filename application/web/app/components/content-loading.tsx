import type { ReactNode } from "react";
import { Skeleton } from "./loading-ui";
import css from "./content-loading.module.css";

/** One announcement per loading region; its placeholders never enter the tab order. */
export function LoadingRegion({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return <div role="status" aria-label={label} aria-busy="true" className={className}><span className="visually-hidden">{label}</span>{children}</div>;
}

export function LoadingLines({ lines = 2 }: { lines?: number }) {
  return <div className={css.lines} aria-hidden="true">{Array.from({ length: lines }, (_, i) => <Skeleton key={i} className={i === 0 ? css.line : css.shortLine} />)}</div>;
}

export function LoadingRows({ columns, rows = 5 }: { columns: number; rows?: number }) {
  return <>{Array.from({ length: rows }, (_, row) => <tr key={row} aria-hidden="true">{Array.from({ length: columns }, (_, column) => <td key={column}><LoadingLines lines={column === 0 ? 2 : 1} /></td>)}</tr>)}</>;
}

export function LoadingTable({ headers, label, rows = 5, className, wrapClassName }: { headers: readonly string[]; label: string; rows?: number; className?: string; wrapClassName?: string }) {
  return <LoadingRegion label={label}><div className={`${css.tableScroll} ${wrapClassName ?? ""}`}><table className={className ?? css.table}><thead><tr>{headers.map((header, i) => <th scope="col" key={i}>{header}</th>)}</tr></thead><tbody><LoadingRows columns={headers.length} rows={rows} /></tbody></table></div></LoadingRegion>;
}

export function LoadingFields({ labels, label, className, input = false }: { labels: readonly string[]; label: string; className?: string; input?: boolean }) {
  return <LoadingRegion label={label}><div className={className ?? css.fields}>{labels.map(name => <div key={name} className={css.field}><span>{name}</span><Skeleton className={input ? css.input : css.line} /></div>)}</div></LoadingRegion>;
}

export function LoadingList({ label, items = 3, avatar = false, className, itemClassName }: { label: string; items?: number; avatar?: boolean; className?: string; itemClassName?: string }) {
  return <LoadingRegion label={label}><div className={className ?? css.list} aria-hidden="true">{Array.from({ length: items }, (_, i) => <div className={itemClassName ?? css.listItem} key={i}>{avatar && <Skeleton className={css.avatar} />}<LoadingLines lines={3} /></div>)}</div></LoadingRegion>;
}

export function LoadingCalendar({ label, days = 42, className, cellClassName }: { label: string; days?: number; className?: string; cellClassName?: string }) {
  return <LoadingRegion label={label}><div className={className ?? css.calendar} aria-hidden="true">{Array.from({ length: days }, (_, i) => <div className={cellClassName ?? css.day} key={i}><LoadingLines /></div>)}</div></LoadingRegion>;
}
