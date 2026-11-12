"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { PaymentAccess } from "@/lib/payment-api";
import { today } from "@/lib/date-time";
import { createBookingKey } from "@/lib/booking-key";
import {
  clearBookingDraft,
  readBookingDraft,
  saveBookingDraft,
} from "@/lib/booking-draft";
import { BookingLeaveGuard, isDraftRoute } from "./leave-guard";
import type { Draft, Receipt, Space } from "@/types/booking";
const initial = (): Draft => ({
  branchId: "",
  roomId: "",
  date: today(),
  startAt: "",
  endAt: "",
  guestCount: 1,
  purpose: "",
  customerName: "",
  customerEmail: "",
  customerPhone: "",
  companyName: "",
  specialRequests: "",
  website: "",
});
type BookingContext = {
  ready: boolean;
  draftNotice: string;
  draft: Draft;
  update: (value: Partial<Draft>) => void;
  space: Space | null;
  choose: (space: Space) => void;
  paymentAccess: PaymentAccess | null;
  rememberPaymentAccess: (value: PaymentAccess) => void;
  receipt: Receipt | null;
  complete: (value: Receipt) => void;
  keyFor: (value: Draft) => string;
  attempted: (key: string) => boolean;
  markAttempt: (key: string) => void;
  reset: () => void;
};
const Context = createContext<BookingContext | null>(null);
export function BookingProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<Draft>(initial);
  const [space, setSpace] = useState<Space | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [paymentAccess, setPaymentAccess] = useState<PaymentAccess | null>(
    null,
  );
  const rememberPaymentAccess = useCallback(
    (value: PaymentAccess) => setPaymentAccess(value),
    [],
  );
  const submission = useRef({ payload: "", key: "" });
  const attemptedKey = useRef("");
  const discarded = useRef(false);
  const [ready, setReady] = useState(false);
  const [draftNotice, setDraftNotice] = useState("");
  const clearSaved = useCallback(() => {
    try {
      clearBookingDraft(window.sessionStorage);
    } catch {}
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        if (isDraftRoute(window.location.pathname)) {
          const saved = readBookingDraft(window.sessionStorage);
          if (saved) {
            setDraft(saved.draft);
            setSpace(saved.space);
            submission.current = saved.submission;
            attemptedKey.current = saved.attemptedKey;
          }
        } else clearSaved();
      } catch {
        setDraftNotice(
          "Temporary saving is unavailable in this browser. Keep this tab open to retain your inputs.",
        );
      }
      setReady(true);
    }, 0);
    return () => clearTimeout(timer);
  }, [clearSaved]);
  const persist = useCallback(() => {
    if (!ready) return;
    if (discarded.current) {
      clearSaved();
      return;
    }
    try {
      if (
        !saveBookingDraft(
          window.sessionStorage,
          draft,
          space,
          submission.current,
          attemptedKey.current,
        )
      )
        setDraftNotice(
          "Temporary saving is unavailable in this browser. Keep this tab open to retain your inputs.",
        );
    } catch {
      setDraftNotice(
        "Temporary saving is unavailable in this browser. Keep this tab open to retain your inputs.",
      );
    }
  }, [ready, draft, space, clearSaved]);
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(persist, 0);
    window.addEventListener("pagehide", persist);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pagehide", persist);
    };
  }, [persist, ready]);
  const reset = useCallback(() => {
    discarded.current = true;
    clearSaved();
    setDraft(initial());
    setDraftNotice("");
    setSpace(null);
    setReceipt(null);
    setPaymentAccess(null);
    submission.current = { payload: "", key: "" };
    attemptedKey.current = "";
  }, [clearSaved]);
  useEffect(()=>{
    function restored(event:PageTransitionEvent){
      if(!event.persisted)return;
      try{
        const saved=readBookingDraft(window.sessionStorage);
        if(!saved){reset();return;}
        discarded.current=false;
        setDraft(saved.draft);setSpace(saved.space);submission.current=saved.submission;attemptedKey.current=saved.attemptedKey;
      }catch{reset();}
    }
    window.addEventListener('pageshow',restored);
    return()=>window.removeEventListener('pageshow',restored);
  },[reset]);
  function keyFor(value: Draft) {
    const payload = JSON.stringify(value);
    if (submission.current.payload !== payload)
      submission.current = { payload, key: createBookingKey() };
    persist();
    return submission.current.key;
  }
  return (
    <Context.Provider
      value={{
        ready,
        draftNotice,
        draft,
        update: (value) => setDraft((previous) => ({ ...previous, ...value })),
        space,
        choose: (value) => {
          discarded.current = false;
          setSpace(value);
          setDraft((previous) => ({
            ...previous,
            branchId: value.branchId,
            roomId: value.id,
            startAt: "",
            endAt: "",
            guestCount: Math.min(previous.guestCount, value.capacity),
          }));
        },
        paymentAccess,
        rememberPaymentAccess,
        receipt,
        complete: (value) => {
          discarded.current = true;
          clearSaved();
          setReceipt(value);
          setPaymentAccess(
            value.paymentToken
              ? { reference: value.reference, token: value.paymentToken }
              : null,
          );
          setDraft(initial());
        },
        keyFor,
        attempted: (key) => attemptedKey.current === key,
        markAttempt: (key) => {
          attemptedKey.current = key;
          persist();
        },
        reset,
      }}
    >
      {children}
      <BookingLeaveGuard
        active={ready && Boolean(space && draft.roomId)}
        onDiscard={reset}
      />
    </Context.Provider>
  );
}
export function useBooking() {
  const value = useContext(Context);
  if (!value) throw new Error("Booking provider unavailable");
  return value;
}
