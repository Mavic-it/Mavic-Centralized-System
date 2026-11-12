"use client";

import { useMemo, useState } from "react";
import { ArrowUpRight, Ban, DoorOpen, Search, Users, Wallet } from "lucide-react";
import type { Space } from "./types";
import s from "./space-gallery.module.css";

type Props = {
  spaces: Space[];
  canManage: boolean;
  onEdit: (space: Space) => void;
  onBlock: (space: Space) => void;
};

const label = (value: string) =>
  value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const money = (value: number) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value);

export function SpaceGallery({ spaces, canManage, onEdit, onBlock }: Props) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [activity, setActivity] = useState("all");
  const types = useMemo(() => [...new Set(spaces.map((space) => space.type))].sort(), [spaces]);
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return spaces.filter((space) =>
      (type === "all" || space.type === type) &&
      (activity === "all" || (activity === "active") === space.isActive) &&
      (!term || [space.name, space.branchName, label(space.type), space.floor]
        .some((value) => value?.toLocaleLowerCase().includes(term))),
    );
  }, [activity, query, spaces, type]);
  const activeCount = spaces.filter((space) => space.isActive).length;

  return (
    <div className={s.gallery}>
      <div className={s.toolbar}>
        <div className={s.intro}>
          <strong>{spaces.length} {spaces.length === 1 ? "space" : "spaces"}</strong>
          <span>{activeCount} active · {spaces.length - activeCount} inactive</span>
        </div>
        <label className={s.search}>
          <Search size={17} aria-hidden="true" />
          <span className={s.srOnly}>Search spaces</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search spaces or branches" />
        </label>
      </div>
      <div className={s.filterRow}>
        <div className={s.chips} role="group" aria-label="Space type">
          <button type="button" aria-pressed={type === "all"} onClick={() => setType("all")}>All types</button>
          {types.map((item) => <button type="button" key={item} aria-pressed={type === item} onClick={() => setType(item)}>{label(item)}</button>)}
        </div>
        <label className={s.statusSelect}>
          <span>Status</span>
          <select value={activity} onChange={(event) => setActivity(event.target.value)}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
      </div>
      <p className={s.resultCount} role="status">Showing {filtered.length} of {spaces.length} spaces</p>
      {filtered.length ? (
        <div className={s.grid}>
          {filtered.map((space) => (
            <article key={space.id} className={s.card}>
              <div className={s.visual}>
                {space.imageData ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={space.imageData} alt="" />
                ) : <div className={s.placeholder}><DoorOpen size={38} strokeWidth={1.4} aria-hidden="true" /><span>{label(space.type)}</span></div>}
                <span className={`${s.state} ${space.isActive ? s.active : s.inactive}`}>
                  <span className={s.dot} />{space.isActive ? "Active" : "Inactive"}
                </span>
              </div>
              <div className={s.body}>
                <span className={s.type}>{label(space.type)}</span>
                <h3>{space.name}</h3>
                <p className={s.branch}>{space.branchName}{space.floor ? ` · ${space.floor}` : ""}</p>
                <div className={s.facts}>
                  <span><Users size={15} aria-hidden="true" /> Up to {space.capacity} guests</span>
                  <span><Wallet size={15} aria-hidden="true" /> {money(space.hourlyRate)} / hour</span>
                </div>
                {canManage && <div className={s.actions}>
                  <button type="button" className={s.edit} onClick={() => onEdit(space)}>Edit space <ArrowUpRight size={15} aria-hidden="true" /></button>
                  <button type="button" className={s.block} onClick={() => onBlock(space)}><Ban size={15} aria-hidden="true" /> Block time</button>
                </div>}
              </div>
            </article>
          ))}
        </div>
      ) : <div className={s.empty}><Search size={22} aria-hidden="true" /><strong>{spaces.length ? "No matching spaces" : "No spaces in this branch yet"}</strong><p>{spaces.length ? "Try another name, type, or status." : "Add a space to start managing availability."}</p>{spaces.length > 0 && <button type="button" onClick={() => { setQuery(""); setType("all"); setActivity("all"); }}>Clear filters</button>}</div>}
    </div>
  );
}
