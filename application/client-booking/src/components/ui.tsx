import Link from "next/link";
import { Check, ArrowRight, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
export function Field({
  label,
  required,
  children,
  wide = false,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={`field ${wide ? "wide" : ""}`}>
      <span>
        {label}
        {required && (
          <span className="required" aria-hidden="true">
            {" "}
            *
          </span>
        )}
      </span>
      {children}
    </label>
  );
}
export function Steps({ current }: { current: number }) {
  return (
    <ol className="steps" aria-label="Booking progress">
      {["Choose a space", "Booking details", "Review", "Payment / status"].map(
        (label, index) => (
          <li
            key={label}
            aria-current={current === index ? "step" : undefined}
            className={index <= current ? "active" : ""}
          >
            <span>
              {index < current ? (
                <Check size={15} aria-hidden="true" />
              ) : (
                index + 1
              )}
            </span>
            <b>{label}</b>
          </li>
        ),
      )}
    </ol>
  );
}
export function Skeleton() {
  return (
    <div
      className="skeleton-grid"
      role="status"
      aria-label="Loading booking details"
    >
      <div className="skeleton block" />
      <div className="skeleton block" />
      <div className="skeleton block" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
export function EmptyDraft() {
  return (
    <section className="panel empty">
      <h1>Let’s find your space.</h1>
      <p>
        Your booking details are kept only while this tab is open. Start by
        choosing a space.
      </p>
      <Link className="button" href="/">
        Browse spaces <ArrowRight size={18} />
      </Link>
    </section>
  );
}
export function Assurance() {
  return (
    <div className="assurance">
      <div>
      </div>
    </div>
  );
}
