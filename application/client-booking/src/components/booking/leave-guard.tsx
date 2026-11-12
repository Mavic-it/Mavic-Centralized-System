"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createBookingKey } from "@/lib/booking-key";

export const isDraftRoute = (pathname: string) =>
  ["/book", "/review"].includes(pathname.replace(/\/$/, ""));
type Destination =
  | { kind: "link"; url: string }
  | { kind: "back"; restoreOnStay?: boolean; steps?: number };

function DiscardDraftModal({
  onStay,
  onDiscard,
}: {
  onStay: () => void;
  onDiscard: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const stay = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const opener = document.activeElement,
      previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element.showModal();
    stay.current?.focus();
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="policy-modal discard-draft-modal"
      aria-modal="true"
      aria-labelledby="discard-draft-title"
      aria-describedby="discard-draft-description"
      onCancel={(e) => {
        e.preventDefault();
        onStay();
      }}
    >
      <div className="policy-modal-header">
        <h2 id="discard-draft-title">Cancel this booking draft?</h2>
      </div>
      <div className="policy-modal-content">
        <p id="discard-draft-description">
          Leaving this booking will permanently clear the details saved in this
          tab. Keep booking to continue with your current inputs.
        </p>
        <p>
          This only clears an unfinished draft. It does not cancel a submitted
          reservation.
        </p>
      </div>
      <div className="policy-modal-footer">
        <button
          ref={stay}
          type="button"
          className="copy-reference"
          onClick={onStay}
        >
          Keep booking
        </button>
        <button type="button" className="button" onClick={onDiscard}>
          Discard draft and leave
        </button>
      </div>
    </dialog>
  );
}

export function BookingLeaveGuard({
  active,
  onDiscard,
}: {
  active: boolean;
  onDiscard: () => void;
}) {
  const pathname = usePathname(),
    router = useRouter();
  const [destination, setDestination] = useState<Destination | null>(null);
  const previous = useRef<{
    url: string;
    state: Record<string, unknown>;
    backPath: string | null;
    skip: number;
  } | null>(null);
  const lastPath = useRef<string | null>(null);
  const documentId = useRef<string | null>(null);
  const allowBack = useRef(false);
  useEffect(() => {
    const from = lastPath.current;
    lastPath.current = pathname;
    allowBack.current = false;
    if (!active || !isDraftRoute(pathname)) return;
    documentId.current ??= createBookingKey();
    const state: Record<string, unknown> = window.history.state ?? {};
    const candidate = state.__mspacesDraftGuard as
      | {
          guard?: boolean;
          backPath?: string | null;
          pathname?: string;
          skip?: number;
          documentId?: string;
        }
      | undefined;
    const saved = candidate?.pathname === pathname ? candidate : undefined;
    const backPath =
      saved
        ? saved.backPath ?? null
        : from && from !== pathname && isDraftRoute(from)
          ? from
          : null;
    const priorSkip =
      Number.isInteger(saved?.skip) && Number(saved?.skip) > 0
        ? Number(saved?.skip)
        : 1;
    const skip = Math.min(
      100,
      priorSkip +
        (saved?.guard && saved.documentId !== documentId.current ? 1 : 0),
    );
    const metadata = {
      backPath,
      pathname,
      skip,
      documentId: documentId.current,
    };
    const base = {
      ...state,
      __mspacesDraftGuard: { ...metadata, guard: false },
    };
    const guard = {
      ...state,
      __mspacesDraftGuard: { ...metadata, guard: true },
    };
    // Each document needs its own same-document Back sentinel, including after refresh.
    if (!saved?.guard || saved.documentId !== documentId.current) {
      window.history.replaceState(base, "", window.location.href);
      window.history.pushState(guard, "", window.location.href);
    }
    previous.current = {
      url: window.location.href,
      state: guard,
      backPath,
      skip,
    };
    function click(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor =
        event.target instanceof Element
          ? event.target.closest<HTMLAnchorElement>("a[href]")
          : null;
      if (
        !anchor ||
        anchor.hasAttribute("download") ||
        (anchor.target && anchor.target !== "_self")
      )
        return;
      const url = new URL(anchor.href, window.location.href);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        (url.origin === window.location.origin && isDraftRoute(url.pathname))
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setDestination({ kind: "link", url: url.href });
    }
    function pop(event: PopStateEvent) {
      if (allowBack.current) {
        allowBack.current = false;
        return;
      }
      const current = previous.current;
      if (!current) return;
      const marker = event.state?.__mspacesDraftGuard;
      if (marker && !marker.guard && window.location.href === current.url) {
        event.stopImmediatePropagation();
        if (current.backPath && isDraftRoute(current.backPath)) {
          allowBack.current = true;
          window.history.go(-current.skip);
          return;
        }
        setDestination({
          kind: "back",
          restoreOnStay: true,
          steps: current.skip,
        });
        return;
      }
      if (isDraftRoute(window.location.pathname)) return;
      event.stopImmediatePropagation();
      window.history.pushState(current.state, "", current.url);
      setDestination({ kind: "back" });
    }
    document.addEventListener("click", click, true);
    window.addEventListener("popstate", pop, true);
    return () => {
      document.removeEventListener("click", click, true);
      window.removeEventListener("popstate", pop, true);
    };
  }, [active, pathname]);
  if (!destination) return null;
  function discard() {
    const target = destination;
    if (!target) return;
    onDiscard();
    setDestination(null);
    if (target.kind === "back") {
      allowBack.current = true;
      window.history.go(-(target.steps ?? 1));
      return;
    }
    const url = new URL(target.url);
    if (url.origin === window.location.origin)
      router.push(`${url.pathname}${url.search}${url.hash}`);
    else window.location.assign(url.href);
  }
  return (
    <DiscardDraftModal
      onStay={() => {
        if (
          destination.kind === "back" &&
          destination.restoreOnStay &&
          previous.current
        )
          window.history.pushState(
            previous.current.state,
            "",
            previous.current.url,
          );
        setDestination(null);
      }}
      onDiscard={discard}
    />
  );
}
