import {
  Building2,
  MapPin,
  UserRound,
  ArrowUpRight,
  RefreshCw,
} from "lucide-react";
import { Skeleton } from "../../components/loading-ui";
import s from "../../components/admin-directory.module.css";
import type { BranchTableProps } from "./branch-table";
import { BranchActions } from "./branch-actions";

export function BranchDirectorySkeleton() {
  return (
    <div
      className={`${s.grid} ${s.branchGrid}`}
      role="status"
      aria-label="Loading branches"
      aria-busy="true"
    >
      {[0, 1, 2].map((i) => (
        <div
          className={`${s.card} ${s.loadingCard}`}
          aria-hidden="true"
          key={i}
        >
          <Skeleton className="loading-section-title" />
          <Skeleton className="loading-description" />
          <Skeleton className="loading-card-value" />
          <Skeleton className="loading-action" />
        </div>
      ))}
    </div>
  );
}

export function BranchCards(props: BranchTableProps) {
  if (props.isLoading) return <BranchDirectorySkeleton />;
  if (props.isError)
    return (
      <div className={s.branchGrid}>
        <div className={s.empty} role="alert">
          <p>{props.errorMessage || "Unable to load branches."}</p>
          <button className={s.button} type="button" onClick={props.onRetry}>
            <RefreshCw size={15} />
            Retry loading branches
          </button>
        </div>
      </div>
    );
  if (!props.items.length)
    return (
      <div className={s.branchGrid}>
        <div className={s.empty}>
          <Building2 size={28} aria-hidden="true" />
          <p>No branches match your search.</p>
          <span>Try another branch name, location or status.</span>
        </div>
      </div>
    );
  return (
    <div
      className={`${s.grid} ${s.branchGrid}`}
      aria-label="Branch cards"
      aria-busy={props.isFetching}
    >
      {props.items.map((branch) => (
        <article className={s.card} key={branch.id}>
          <div className={s.cardHeader}>
            <span className={s.avatar}>
              <Building2 size={23} aria-hidden="true" />
            </span>
            <div className={s.identity}>
              <h3>
                <button
                  className={s.titleButton}
                  type="button"
                  onClick={() => props.onView(branch)}
                >
                  {branch.name}
                </button>
              </h3>
              <p>{branch.code}</p>
            </div>
            <span
              className={`${s.pill} ${branch.status === "ACTIVE" ? s.active : ""}`}
            >
              {branch.status === "ACTIVE" ? "Active" : "Inactive"}
            </span>
          </div>
          <p className={s.meta}>
            <MapPin size={15} aria-hidden="true" />
            {[branch.city, branch.province].filter(Boolean).join(", ") ||
              "Location not provided"}
          </p>
          <p className={s.meta}>
            <UserRound size={15} aria-hidden="true" />
            {branch.managerName || "No manager assigned"}
          </p>
          <div className={s.stats}>
            <div>
              <strong>{branch.employeeCount}</strong>
              <span>Employees</span>
            </div>
            <div>
              <strong>{branch.roomCount}</strong>
              <span>Rooms</span>
            </div>
          </div>
          <div className={s.cardFooter}>
            <button
              className={s.button}
              type="button"
              onClick={() => props.onView(branch)}
              aria-label={`View ${branch.name}`}
            >
              View branch
              <ArrowUpRight size={14} />
            </button>
            <BranchActions branch={branch} {...props} />
          </div>
        </article>
      ))}
    </div>
  );
}
