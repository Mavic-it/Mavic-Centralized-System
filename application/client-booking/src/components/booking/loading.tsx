import type { CSSProperties, ReactNode } from "react";
import { Steps } from "../ui";

export function BookingSkeleton({ className = "skeleton-line", style }: { className?: string; style?: CSSProperties }) {
  return <div aria-hidden="true" className={`skeleton ${className}`} style={style} />;
}
function Region({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return <div role="status" aria-label={label} aria-busy="true" className={className}><span className="sr-only">{label}</span>{children}</div>;
}
export function SpaceResultsSkeleton() {
  return <Region label="Loading spaces"><BookingSkeleton className="skeleton-count" /><div className="space-grid" aria-hidden="true">{[0,1,2].map(i => <article className="space-card" key={i}><BookingSkeleton className="space-visual skeleton-space-image" /><div className="space-content skeleton-content"><BookingSkeleton className="skeleton-short" /><BookingSkeleton className="skeleton-title" /><BookingSkeleton /><BookingSkeleton /><div className="amenities"><BookingSkeleton className="skeleton-badge" /><BookingSkeleton className="skeleton-badge" /></div><div className="space-action"><BookingSkeleton /></div></div></article>)}</div></Region>;
}
export function AvailabilitySkeleton() {
  return <Region label="Checking live availability"><div className="slots" aria-hidden="true">{[0,1,2,3,4,5].map(i => <BookingSkeleton className="skeleton-slot" key={i} />)}</div></Region>;
}
function Fields({ labels, details = false }: { labels: string[]; details?: boolean }) {
  return <div className={details ? "review-details" : "form-grid"}>{labels.map(label => <div key={label} className={details ? "skeleton-detail" : `field ${["Purpose", "Special requests"].includes(label) ? "wide" : ""}`}><span>{label}</span><BookingSkeleton className={details ? "skeleton-line" : label === "Special requests" ? "skeleton-textarea" : "skeleton-field"} /></div>)}</div>;
}
function SummarySkeleton() {
  return <aside className="summary"><div className="panel skeleton-content"><p className="eyebrow">YOUR SPACE, YOUR TIME</p><BookingSkeleton className="skeleton-title" /><BookingSkeleton /><div className="summary-list">{["Branch", "Date", "Time", "Guests"].map(label => <div className="skeleton-detail" key={label}><span>{label}</span><BookingSkeleton /></div>)}</div><div className="duration"><span>Total duration</span><BookingSkeleton className="skeleton-short" /></div></div></aside>;
}
export function QuoteSkeleton() {
  return <Region label="Calculating booking amount"><div className="payment-total skeleton-content"><span>Total</span><BookingSkeleton className="skeleton-title" /><span>Required to confirm</span><BookingSkeleton /></div></Region>;
}
export function BookingPageSkeleton({ step }: { step: "book" | "review" }) {
  const review = step === "review";
  return <section className="section booking-page"><BookingSkeleton className="skeleton-back" /><Steps current={review ? 2 : 1} /><div className="page-heading"><p className="eyebrow">{review ? "ONE LAST LOOK" : "MAKE ROOM FOR WHAT'S NEXT"}</p><h1>{review ? "Everything look right?" : "Let's plan your visit."}</h1><p>{review ? "Check your details before sending your reservation to the branch." : "Choose your time and tell us a little about your booking."}</p></div><Region label="Restoring your booking details" className="booking-grid"><div>{review ? <><section className="panel"><h2>Your visit</h2><Fields details labels={["Purpose", "Full name", "Email", "Contact number", "Company", "Special requests"]} /><QuoteSkeleton /></section><section className="panel skeleton-content"><h2>Before you book</h2><BookingSkeleton /><BookingSkeleton /><BookingSkeleton className="skeleton-field" /></section></> : <><section className="panel"><div className="panel-heading"><span className="section-number">01</span><div><h2>Booking details</h2><p>All times are in Philippine Time (UTC+8).</p></div></div><Fields labels={["Branch", "Space", "Date", "Guests"]} /><div className="availability-panel"><strong>Available start times</strong><AvailabilitySkeleton /></div><Fields labels={["Start time", "End time", "Purpose"]} /></section><section className="panel"><div className="panel-heading"><span className="section-number">02</span><h2>Customer details</h2></div><Fields labels={["Full name", "Email", "Contact number", "Company", "Special requests"]} /></section></>}<div className="form-actions"><BookingSkeleton className="skeleton-button" /></div></div><SummarySkeleton /></Region></section>;
}
export function PaymentSkeleton() {
  return <Region label="Loading secure payment details" className="booking-grid payment-grid"><div><section className="panel skeleton-content"><BookingSkeleton className="skeleton-title" /><BookingSkeleton /><BookingSkeleton /><div className="payment-total"><BookingSkeleton className="skeleton-title" /></div><BookingSkeleton className="skeleton-field" /><BookingSkeleton className="skeleton-field" /></section><section className="panel skeleton-content"><h2>Payment history</h2><BookingSkeleton /><BookingSkeleton /></section></div><SummarySkeleton /></Region>;
}
export function PaymentPageSkeleton() {
  return <section className="section booking-page"><Steps current={3} /><div className="page-heading"><p className="eyebrow">OFFICIAL MSPACES PAYMENTS</p><h1>Payment &amp; verification</h1><p>Pay by Bank Transfer or GCash. Staff independently verifies every payment.</p></div><PaymentSkeleton /></section>;
}
