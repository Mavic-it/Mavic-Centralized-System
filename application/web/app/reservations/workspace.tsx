"use client";

import {
  loadWorkspaceBranchAccess,
  type WorkspaceBranchAccess,
} from "../lib/branch-access";
import { PageHeading, PageHeader } from "../components/page-heading";
import { FieldLabel } from "../components/field-label";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  BadgeCheck,
  ChartNoAxesCombined,
  CalendarDays,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock3,
  DoorOpen,
  Download,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  X,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Modal as AppModal } from "../components/ui/modal";
import { useWorkspaceRole } from "../components/workspace-role-context";
import { notifyError, notifySuccess } from "../lib/notifications";
import {
  reservationRequest,
  qs,
  type Booking,
  type Branch,
  type Detail,
  type Page,
  type Space,
  type Summary,
} from "./types";
import s from "./workspace.module.css";
import { SpaceImageInput } from "./space-image-input";
import { SpaceGallery } from "./space-gallery";
import { PaymentAccountSettings } from "./payment-account-settings";
import { PaymentVerificationPanel } from "./payment-verification-panel";

type Section = "calendar" | "list" | "spaces" | "reports" | "settings" | "payments";
type CalendarView = "month" | "week" | "day";
const sections: { key: Section; label: string; href: string }[] = [
  { key: "calendar", label: "Booking calendar", href: "/reservations" },
  { key: "list", label: "All reservations", href: "/reservations/list" },
  { key: "payments", label: "Payment Verification", href: "/reservations/payments" },
  {
    key: "spaces",
    label: "Spaces & availability",
    href: "/reservations/spaces",
  },
  { key: "reports", label: "Reports", href: "/reservations/reports" },
  { key: "settings", label: "Settings", href: "/reservations/settings" },
];
const emptySummary: Summary = {
  today: 0,
  upcoming: 0,
  pending: 0,
  checkedIn: 0,
  completed: 0,
  availableSpaces: 0,
};
const day = (date: Date) => date.toISOString().slice(0, 10);
const move = (value: string, days: number) => {
  const d = new Date(`${value}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return day(d);
};
const localDay = (value: string) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
};
const dateLabel = (
  value: string,
  opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" },
) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", ...opts }).format(
    new Date(value),
  );
const timeLabel = (value: string) =>
  dateLabel(value, { hour: "numeric", minute: "2-digit" });
const money = (value: number) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(
    Number(value) || 0,
  );
const manilaIso = (date: string, time: string) => `${date}T${time}:00+08:00`;
const statusLabel = (value: string) =>
  value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
const statusClass = (value: string) =>
  s[`status${value.replaceAll("_", "")}`] ?? s.statusNeutral;
const purposeClass = (purpose: string) => {
  const value = purpose.toLowerCase();
  const category =
    value.includes("ocular") || value.includes("eye")
      ? "Ocular"
      : value.includes("visit") || value.includes("inquir")
        ? "Visit"
        : value.includes("meeting")
          ? "Meeting"
          : value.includes("cowork")
            ? "Coworking"
            : value.includes("private")
              ? "Private"
              : "Other";
  return s[`purpose${category}`];
};
const weekdayOptions = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 7, label: "Sunday" },
];
const purposeTypeFor = (purpose: string) => {
  const value = purpose.toLowerCase();
  if (value.includes("ocular") || value.includes("eye")) return "OCULAR";
  if (value.includes("visit") || value.includes("inquir")) return "VISIT";
  if (value.includes("meeting")) return "MEETING";
  if (value.includes("cowork")) return "COWORKING";
  if (value.includes("private")) return "PRIVATE";
  return "OTHER";
};
const purposeLabels: Record<string, string> = {
  OCULAR: "Ocular",
  VISIT: "Visit",
  MEETING: "Meeting",
  COWORKING: "Coworking",
  PRIVATE: "Private",
};

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <AppModal
      onClose={onClose}
      presentation="drawer"
      aria-label={title}
      className={s.drawerModal}
    >
      <header className={s.dialogHeader}>
        <h2>{title}</h2>
        <button
          type="button"
          className={s.iconButton}
          onClick={onClose}
          aria-label="Close dialog"
        >
          <X size={18} />
        </button>
      </header>
      {children}
    </AppModal>
  );
}

function BookingCalendar({
  date,
  view,
  items,
  onSelect,
  onCreate,
  selectedDate,
  onDateSelect,
  showBranch,
}: {
  date: string;
  view: CalendarView;
  items: Booking[];
  onSelect: (id: string) => void;
  onCreate: (date: string) => void;
  selectedDate: string;
  onDateSelect: (date: string) => void;
  showBranch: boolean;
}) {
  const first = useMemo(() => {
    const d = new Date(`${date}T00:00:00Z`);
    if (view === "month") {
      d.setUTCDate(1);
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    }
    if (view === "week")
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return day(d);
  }, [date, view]);
  const count = view === "month" ? 42 : view === "week" ? 7 : 1;
  const dates = Array.from({ length: count }, (_, i) => move(first, i));
  return (
    <div
      className={`${s.calendar} ${view === "day" ? s.dayCalendar : ""}`}
      role="region"
      aria-label={`${view} booking calendar`}
    >
      {view !== "day" && (
        <div className={s.weekdays}>
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((x) => (
            <span key={x}>{x}</span>
          ))}
        </div>
      )}
      <div className={s.days}>
        {dates.map((d) => {
          const bookings = items.filter((item) => localDay(item.startAt) === d);
          return (
            <section
              key={d}
              className={`${s.dayCell} ${d === localDay(new Date().toISOString()) ? s.today : ""} ${d === selectedDate ? s.selectedDay : ""} ${view === "month" && d.slice(0, 7) !== date.slice(0, 7) ? s.outside : ""}`}
              aria-label={dateLabel(manilaIso(d, "12:00"), {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            >
              <div className={s.dayHead}>
                <button
                  type="button"
                  className={s.dayNumber}
                  aria-label={`Select ${dateLabel(manilaIso(d, "12:00"), { weekday: "long", month: "long", day: "numeric" })}`}
                  aria-pressed={d === selectedDate}
                  onClick={() => onDateSelect(d)}
                >
                  {Number(d.slice(-2))}
                </button>
                <button
                  type="button"
                  onClick={() => onCreate(d)}
                  aria-label={`Create reservation on ${d}`}
                  title="Create reservation"
                >
                  <Plus size={15} />
                </button>
              </div>
              {bookings.slice(0, view === "month" ? 3 : 30).map((b) => (
                <button
                  type="button"
                  key={b.id}
                  className={`${s.event} ${statusClass(b.status)} ${purposeClass(b.purpose)}`}
                  onClick={() => onSelect(b.id)}
                  title={`${b.customerName} · ${b.purpose} · ${b.roomName ?? "Space unassigned"}${showBranch ? ` · ${b.branchName}` : ""} · ${statusLabel(b.status)}`}
                >
                  <span className={s.eventTime}>
                    {timeLabel(b.startAt)} – {timeLabel(b.endAt)}
                  </span>
                  <strong className={s.eventPurpose}>{b.purpose}</strong>
                  <span className={s.eventName}>
                    {b.customerName || "Unnamed customer"}
                  </span>
                  {showBranch && (
                    <span className={s.eventBranch}>{b.branchName}</span>
                  )}
                  <small>{statusLabel(b.status)}</small>
                </button>
              ))}
              {view === "month" && bookings.length > 3 && (
                <small className={s.more}>+{bookings.length - 3} more</small>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

export default function ReservationsWorkspace({
  section,
}: {
  section: Section;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchQuery = searchParams.toString();
  const role = useWorkspaceRole();
  const canManage =
    role === "SUPER_ADMIN" || role === "HR_ADMIN" || role === "BRANCH_MANAGER";
  const [settingsAccess,setSettingsAccess]=useState(false);
  useEffect(()=>{fetch("/api/auth/me",{cache:"no-store"}).then(r=>r.json()).then((u:{grantedPermissionKeys?:string[]})=>setSettingsAccess(u.grantedPermissionKeys?.includes("operations.reservations.settings")??false)).catch(()=>{});},[]);
  const [branchAccess, setBranchAccess] =
    useState<WorkspaceBranchAccess | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]),
    [spaces, setSpaces] = useState<Space[]>([]);
  const [branchId, setBranchId] = useState(searchParams.get("branchId") ?? ""),
    [status, setStatus] = useState(searchParams.get("status") ?? ""),
    [search, setSearch] = useState(""),
    [appliedSearch, setAppliedSearch] = useState("");
  const [date, setDate] = useState(() => localDay(new Date().toISOString())),
    [view, setView] = useState<CalendarView>("month");
  const [rangeStart, setRangeStart] = useState(
    () =>
      searchParams.get("from") ?? move(localDay(new Date().toISOString()), -30),
  );
  const [rangeEnd, setRangeEnd] = useState(
    () =>
      searchParams.get("to") ?? move(localDay(new Date().toISOString()), 60),
  );
  const [page, setPage] = useState(1),
    [bookings, setBookings] = useState<Page<Booking>>({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });
  const [summary, setSummary] = useState<Summary>(emptySummary),
    [reports, setReports] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [createDate, setCreateDate] = useState<string | null>(null),
    [editingBooking, setEditingBooking] = useState(false),
    [editingId, setEditingId] = useState<string | null>(null),
    [detailId, setDetailId] = useState<string | null>(null),
    [detail, setDetail] = useState<Detail | null>(null);
  const [reasonAction, setReasonAction] = useState<string | null>(null),
    [reasonDraft, setReasonDraft] = useState("");
  const [spaceImageProcessing, setSpaceImageProcessing] = useState(false);
  const [spaceDialog, setSpaceDialog] = useState(false),
    [editingSpace, setEditingSpace] = useState<Space | null>(null),
    [blockSpace, setBlockSpace] = useState<Space | null>(null),
    [settings, setSettings] = useState({
      autoConfirm: false,
      minAdvanceMinutes: 0,
      maxAdvanceDays: 365,
      defaultDurationMinutes: 60,
      openTime: "07:00",
      closeTime: "19:00",
      allowedDays: [1, 2, 3, 4, 5, 6],
    });
  const [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0),
    [review, setReview] = useState(false);
  const [purposeType, setPurposeType] = useState("");
  const [draft, setDraft] = useState({
    branchId: "",
    roomId: "",
    date: "",
    start: "09:00",
    end: "10:00",
    guestCount: "1",
    purpose: "",
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    companyName: "",
    specialRequests: "",
    notes: "",
  });
  const showError = (message: string) => {
    setError(message);
    notifyError(message);
  };

  const [seenReservationQuery, setSeenReservationQuery] = useState(searchQuery);
  if (seenReservationQuery !== searchQuery) {
    setSeenReservationQuery(searchQuery);
    const today = localDay(new Date().toISOString());
    const params = new URLSearchParams(searchQuery);
    setBranchId(params.get("branchId") ?? "");
    setStatus(params.get("status") ?? "");
    setRangeStart(params.get("from") ?? move(today, -30));
    setRangeEnd(params.get("to") ?? move(today, 60));
    setPage(1);
  }

  const windowRange = useMemo(() => {
    if (section === "calendar") {
      const first = view === "month" ? `${date.slice(0, 7)}-01` : date;
      const start =
        view === "month"
          ? move(first, -((new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7))
          : view === "week"
            ? move(date, -((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7))
            : date;
      return {
        from: manilaIso(start, "00:00"),
        to: manilaIso(
          move(start, view === "month" ? 42 : view === "week" ? 7 : 1),
          "00:00",
        ),
      };
    }
    return {
      from: manilaIso(rangeStart, "00:00"),
      to: manilaIso(move(rangeEnd, 1), "00:00"),
    };
  }, [section, view, date, rangeStart, rangeEnd]);
  function changeBranch(value: string) {
    setBranchId(value);
    setPage(1);
  }
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (canManage) {
        const access = await loadWorkspaceBranchAccess();
        setBranchAccess(access);
      }
      if (section === 'settings') {
        setBranches(await reservationRequest<Branch[]>('/payment-accounts/branches'));
        if(branchId)setSettings(await reservationRequest<typeof settings>(`/settings${qs({branchId})}`));
        return;
      }
      if (section === 'payments') {
        setBranches(await reservationRequest<Branch[]>('/branches'));
        return;
      }
      const [branchRows, spaceRows, metricRows] = await Promise.all([
        reservationRequest<Branch[]>("/branches"),
        reservationRequest<Space[]>(`/spaces${qs({ branchId })}`),
        reservationRequest<Summary>(`/summary${qs({ branchId })}`),
      ]);
      setBranches(branchRows);
      setSpaces(spaceRows);
      setSummary(metricRows);
      if (branchId)
        setSettings(
          await reservationRequest<typeof settings>(
            `/settings${qs({ branchId })}`,
          ),
        );
      if (section === "calendar" || section === "list") {
        const path = section === "calendar" ? "/calendar" : "";
        const result = await reservationRequest<Page<Booking>>(
          `${path}${qs({ branchId, status, search: appliedSearch, from: windowRange.from, to: windowRange.to, page })}`,
        );
        setBookings(result);
      }
      if (section === "reports")
        setReports(
          await reservationRequest<Record<string, unknown>[]>(
            `/reports${qs({ branchId, from: windowRange.from, to: windowRange.to })}`,
          ),
        );
    } catch (e) {
      showError(
        e instanceof Error ? e.message : "Unable to load reservations.",
      );
    } finally {
      setLoading(false);
    }
  }, [
    canManage,
    branchId,
    status,
    appliedSearch,
    windowRange.from,
    windowRange.to,
    page,
    section,
  ]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load, refresh]);
  const reload = () => setRefresh((v) => v + 1);
  const openCreate = (onDate = date) => {
    const targetBranchId = branchId;
    if (targetBranchId)
      void reservationRequest<typeof settings>(
        `/settings${qs({ branchId: targetBranchId })}`,
      )
        .then(setSettings)
        .catch((e: unknown) => {
          showError(
            e instanceof Error ? e.message : "Unable to load booking policy.",
          );
        });
    const selectedDate = onDate || localDay(new Date().toISOString());
    setError("");
    setDraft((d) => ({
      ...d,
      date: selectedDate,
      branchId: targetBranchId,
      roomId: "",
      purpose: "",
    }));
    setPurposeType("");
    setReview(false);
    setEditingBooking(false);
    setEditingId(null);
    setCreateDate(selectedDate);
  };
  const openDetail = async (id: string) => {
    setDetailId(id);
    setDetail(null);
    try {
      setDetail(await reservationRequest<Detail>(`/${encodeURIComponent(id)}`));
    } catch (e) {
      showError(e instanceof Error ? e.message : "Could not open booking.");
      setDetailId(null);
    }
  };
  const openEdit = () => {
    if (!detail) return;
    const r = detail.record;
    const start = new Date(String(r.start_date_time));
    const end = new Date(String(r.end_date_time));
    const hm = (v: Date) =>
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Manila",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(v);
    setDraft({
      branchId: String(r.branch_id),
      roomId: String(r.room_id ?? ""),
      date: localDay(start.toISOString()),
      start: hm(start),
      end: hm(end),
      guestCount: String(r.guest_count ?? 1),
      purpose: String(r.purpose ?? ""),
      customerName: String(r.customer_name ?? ""),
      customerEmail: String(r.customer_email ?? ""),
      customerPhone: String(r.customer_phone ?? ""),
      companyName: String(r.company_name ?? ""),
      specialRequests: String(r.special_requests ?? ""),
      notes: String(r.notes ?? ""),
    });
    setPurposeType(purposeTypeFor(String(r.purpose ?? "")));
    setDetailId(null);
    setDetail(null);
    setEditingBooking(true);
    setEditingId(String(r.id));
    setReview(false);
    setCreateDate("edit");
  };
  const mutate = async (
    path: string,
    body?: object,
    method = "POST",
    successMessage = "Changes saved successfully.",
  ) => {
    setBusy(true);
    setError("");
    try {
      await reservationRequest(path, {
        method,
        body: body ? JSON.stringify(body) : "{}",
      });
      notifySuccess(successMessage);
      reload();
      return true;
    } catch (e) {
      showError(e instanceof Error ? e.message : "Action failed.");
      return false;
    } finally {
      setBusy(false);
    }
  };
  const submitBooking = async (e: FormEvent) => {
    e.preventDefault();
    if (!review) {
      const bookingWeekday =
        new Date(`${draft.date}T12:00:00+08:00`).getUTCDay() || 7;
      if (!settings.allowedDays.includes(bookingWeekday)) {
        showError("Reservations are not available on the selected day.");
        return;
      }
      if (draft.start < settings.openTime || draft.end > settings.closeTime) {
        showError(
          `Choose a time between ${settings.openTime} and ${settings.closeTime}.`,
        );
        return;
      }
      setError("");
    }
    if (!review && !editingBooking) {
      setBusy(true);
      setError("");
      try {
        setReview(true);
      } catch (e) {
        showError(
          e instanceof Error ? e.message : "Could not check availability.",
        );
      } finally {
        setBusy(false);
      }
      return;
    }
    const payload = {
      branchId: draft.branchId,
      roomId: draft.roomId,
      startAt: manilaIso(draft.date, draft.start),
      endAt: manilaIso(draft.date, draft.end),
      guestCount: Number(draft.guestCount),
      purpose: draft.purpose,
      customerName: draft.customerName,
      customerEmail: draft.customerEmail,
      customerPhone: draft.customerPhone,
      companyName: draft.companyName,
      specialRequests: draft.specialRequests,
      notes: draft.notes,
    };
    const ok = await mutate(
      editingBooking ? `/${encodeURIComponent(editingId ?? "")}` : "",
      payload,
      editingBooking ? "PATCH" : "POST",
      editingBooking ? "Reservation updated." : "Reservation created.",
    );
    if (ok) {
      setCreateDate(null);
      setReview(false);
      setEditingBooking(false);
      setEditingId(null);
    }
  };
  const performAction = async (name: string, reason = "") => {
    if (!detailId) return false;
    const saved = await mutate(
      `/${encodeURIComponent(detailId)}/${name}`,
      { reason },
      "POST",
      `Reservation ${name === "approve" ? "approved" : statusLabel(name).toLowerCase()}.`,
    );
    if (saved) {
      setDetail(
        await reservationRequest<Detail>(`/${encodeURIComponent(detailId)}`),
      );
    }
    return saved;
  };
  const action = (name: string) => {
    const reservationAction =
      name === "decline-or-cancel"
        ? String(detail?.record.status) === "PENDING"
          ? "reject"
          : "cancel"
        : name;
    if (["reject", "cancel", "no-show"].includes(reservationAction)) {
      setReasonDraft("");
      setReasonAction(reservationAction);
      return;
    }
    void performAction(reservationAction);
  };
  const submitReason = async (e: FormEvent) => {
    e.preventDefault();
    if (!reasonAction || !reasonDraft.trim()) return;
    if (await performAction(reasonAction, reasonDraft.trim())) {
      setReasonAction(null);
      setReasonDraft("");
    }
  };
  const selectMetric = (label: string) => {
    const today = localDay(new Date().toISOString());
    setPage(1);
    if (label === "Available spaces") {
      router.push(
        `/reservations/spaces${branchId ? `?branchId=${encodeURIComponent(branchId)}` : ""}`,
      );
      return;
    }
    const filters = new URLSearchParams();
    if (branchId) filters.set("branchId", branchId);
    if (label === "Today") {
      filters.set("from", today);
      filters.set("to", today);
      router.push(`/reservations/list?${filters.toString()}`);
      return;
    }
    if (label === "Upcoming") {
      filters.set("from", today);
      filters.set("to", move(today, 60));
      router.push(`/reservations/list?${filters.toString()}`);
      return;
    }
    const nextStatus: Record<string, string> = {
      "Pending approval": "PENDING",
      "Checked in": "CHECKED_IN",
      Completed: "COMPLETED",
    };
    if (nextStatus[label]) {
      const next = status === nextStatus[label] ? "" : nextStatus[label];
      if (next) filters.set("status", next);
      router.push(
        `/reservations/list${filters.size ? `?${filters.toString()}` : ""}`,
      );
    }
  };
  const navDate = (direction: number) =>
    setDate((d) => {
      if (view !== "month")
        return move(d, direction * (view === "week" ? 7 : 1));
      const next = new Date(`${d}T00:00:00Z`);
      next.setUTCDate(1);
      next.setUTCMonth(next.getUTCMonth() + direction);
      return day(next);
    });
  const duration = Math.max(
    0,
    (new Date(manilaIso(draft.date || date, draft.end)).getTime() -
      new Date(manilaIso(draft.date || date, draft.start)).getTime()) /
      3600000,
  );
  const tabIcons = {
    calendar: CalendarDays,
    list: ClipboardList,
    payments: BadgeCheck,
    spaces: DoorOpen,
    reports: ChartNoAxesCombined,
    settings: Settings2,
  };
  const metricIcons = {
    Today: CalendarDays,
    Upcoming: Clock3,
    "Pending approval": Clock3,
    "Available spaces": DoorOpen,
    "Checked in": BadgeCheck,
    Completed: CheckCheck,
  };
  const tabs = sections.filter(
    (x) => x.key === "settings" ? settingsAccess || canManage : canManage || !(["reports"] as Section[]).includes(x.key),
  );

  return (
    <main className={s.workspace}>
      <PageHeader className={s.top}>
        <div className={s.heroCopy}>
          <p className={s.eyebrow}>BUSINESS / RESERVATIONS</p>
          <PageHeading>
            Reservations <span className={s.liveMark} aria-hidden="true" />
          </PageHeading>
          <p>Schedule customer visits and manage reservation requests.</p>
        </div>
        <div className={s.headerActions}>
          <span className={s.branchContext}>
            {branchId
              ? branches.find((b) => b.id === branchId)?.name
              : "All authorized branches"}
          </span>
          <button
            type="button"
            className={s.primary}
            onClick={() => openCreate()}
            aria-haspopup="dialog"
          >
            <Plus size={18} /> Create reservation
          </button>
        </div>
      </PageHeader>
      <nav className={s.tabs} aria-label="Reservations sections">
        {tabs.map((x) => (
          <Link
            key={x.key}
            href={x.href}
            aria-current={section === x.key ? "page" : undefined}
            className={section === x.key ? s.activeTab : ""}
          >
            {(() => {
              const Icon = tabIcons[x.key];
              return <Icon size={17} aria-hidden="true" />;
            })()}
            <span>{x.label}</span>
            {x.key === "list" && summary.pending > 0 && (
              <span className={s.tabCount}>{summary.pending}</span>
            )}
          </Link>
        ))}
      </nav>
      <div className={s.metrics}>
        {(
          [
            ["Today", summary.today],
            ["Upcoming", summary.upcoming],
            ["Pending approval", summary.pending],
            ["Available spaces", summary.availableSpaces],
            ["Checked in", summary.checkedIn],
            ["Completed", summary.completed],
          ] as const
        ).map(([label, value]) => (
          <button
            key={label}
            type="button"
            className={`${s.metric} ${(label === "Pending approval" && status === "PENDING") || (label === "Checked in" && status === "CHECKED_IN") || (label === "Completed" && status === "COMPLETED") ? s.metricSelected : ""}`}
            onClick={() => selectMetric(label)}
            aria-label={`Show ${label.toLowerCase()}`}
          >
            {(() => {
              const Icon = metricIcons[label];
              return (
                <span className={s.metricIcon}>
                  <Icon size={17} aria-hidden="true" />
                </span>
              );
            })()}
            <span className={s.metricLabel}>{label}</span>
            <strong>{loading ? "—" : value}</strong>
            <span className={s.metricHint}>
              {label === "Available spaces"
                ? "View spaces"
                : label === "Pending approval"
                  ? "Review queue"
                  : "View bookings"}
            </span>
          </button>
        ))}
      </div>
      <section className={s.panel}>
        <div className={s.panelHead}>
          <div className={s.panelTitle}>
            <span className={s.sectionIcon}>
              {(() => {
                const Icon = tabIcons[section];
                return <Icon size={18} aria-hidden="true" />;
              })()}
            </span>
            <div>
              <h2>{sections.find((x) => x.key === section)?.label}</h2>
              <p>
                {section === "calendar"
                  ? "Choose a day or select a booking to view details."
                  : section === "list"
                    ? "Search, review and manage branch bookings."
                    : section === "spaces"
                      ? "Reservable rooms and their current capacity and rates."
                      : section === "reports"
                        ? "Booked value is separate from recorded payments."
                        : "Booking policy for the selected branch."}
              </p>
            </div>
          </div>
          <button
            className={`${s.iconButton} ${loading ? s.spin : ""}`}
            aria-label="Refresh reservations"
            title="Refresh"
            onClick={reload}
            disabled={loading}
          >
            <RefreshCw size={17} />
          </button>
        </div>
        <div className={s.filters}>
          <label>
            Branch
            <select
              value={branchId}
              onChange={(e) => changeBranch(e.target.value)}
            >
              <option value="">All authorized branches</option>
              {(branchAccess?.canSwitch ? branchAccess.branches : branches).map(
                (b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ),
              )}
            </select>
          </label>
          {(section === "calendar" || section === "list") && (
            <>
              <label>
                Status
                <select
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">All statuses</option>
                  {[
                    "PENDING",
                    "CONFIRMED",
                    "CHECKED_IN",
                    "COMPLETED",
                    "CANCELLED",
                    "REJECTED",
                    "NO_SHOW",
                  ].map((x) => (
                    <option key={x} value={x}>
                      {statusLabel(x)}
                    </option>
                  ))}
                </select>
              </label>
              <form
                className={s.searchForm}
                onSubmit={(e) => {
                  e.preventDefault();
                  setAppliedSearch(search.trim());
                  setPage(1);
                }}
              >
                <label className={s.search}>
                  <Search size={16} /> Search customer or reference
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search bookings"
                  />
                </label>
                <button className={s.secondary} type="submit">
                  Search
                </button>
              </form>
            </>
          )}
          {(section === "list" || section === "reports") && (
            <>
              <label>
                From
                <input
                  type="date"
                  value={rangeStart}
                  onChange={(e) => {
                    setRangeStart(e.target.value);
                    setPage(1);
                  }}
                />
              </label>
              <label>
                Through
                <input
                  type="date"
                  value={rangeEnd}
                  onChange={(e) => {
                    setRangeEnd(e.target.value);
                    setPage(1);
                  }}
                />
              </label>
            </>
          )}
        </div>
        {loading ? (
          <div className={s.skeleton} aria-label="Loading reservations" />
        ) : null}
        {!loading && section === "calendar" && (
          <>
            <div className={s.calendarBar}>
              <div className={s.dateControls}>
                <button
                  onClick={() => navDate(-1)}
                  aria-label="Previous period"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  onClick={() => setDate(localDay(new Date().toISOString()))}
                >
                  Today
                </button>
                <button onClick={() => navDate(1)} aria-label="Next period">
                  <ChevronRight size={18} />
                </button>
                <strong>
                  {dateLabel(manilaIso(date, "12:00"), {
                    month: "long",
                    year: "numeric",
                    day: "numeric",
                  })}
                </strong>
              </div>
              <div className={s.segmented} aria-label="Calendar view">
                {(["month", "week", "day"] as CalendarView[]).map((x) => (
                  <button
                    key={x}
                    aria-pressed={view === x}
                    onClick={() => setView(x)}
                  >
                    {statusLabel(x)}
                  </button>
                ))}
              </div>
            </div>
            <BookingCalendar
              date={date}
              view={view}
              items={bookings.items}
              onSelect={openDetail}
              onCreate={openCreate}
              selectedDate={date}
              onDateSelect={setDate}
              showBranch={!branchId}
            />
            <div
              className={s.purposeLegend}
              aria-label="Reservation purpose colors"
            >
              {[
                ["Ocular", s.purposeOcular],
                ["Visit", s.purposeVisit],
                ["Meeting", s.purposeMeeting],
                ["Coworking", s.purposeCoworking],
                ["Private", s.purposePrivate],
                ["Other", s.purposeOther],
              ].map(([label, colorClass]) => (
                <span key={label}>
                  <i className={colorClass} aria-hidden="true" /> {label}
                </span>
              ))}
            </div>
            {bookings.total > bookings.items.length && (
              <p className={s.notice}>
                Showing the first {bookings.items.length} bookings. Narrow the
                branch, space, or status filter to see the rest.
              </p>
            )}
            {bookings.total === 0 && (
              <p className={s.empty}>
                No reservations in this period. Select a day to create one.
              </p>
            )}
          </>
        )}
        {!loading && section === "list" && (
          <>
            <div className={s.list}>
              {bookings.items.map((b) => (
                <button
                  className={s.bookingRow}
                  key={b.id}
                  onClick={() => openDetail(b.id)}
                >
                  <span className={s.rowDate}>
                    {dateLabel(b.startAt, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                    <small>
                      {timeLabel(b.startAt)}–{timeLabel(b.endAt)}
                    </small>
                  </span>
                  <span>
                    <strong>{b.customerName || "Customer not recorded"}</strong>
                    <small>{b.reference ?? b.id}</small>
                    {b.source === 'PUBLIC_PORTAL' && <small>Client portal</small>}
                  </span>
                  <span>
                    <strong>{b.purpose}</strong>
                    <small>
                      {b.roomName ?? "Space unassigned"} · {b.branchName}
                    </small>
                  </span>
                  <span className={`${s.badge} ${statusClass(b.status)}`}>
                    {statusLabel(b.status)}
                  </span>
                  <span>{money(b.amount)}</span>
                </button>
              ))}
            </div>
            {!bookings.items.length && (
              <p className={s.empty}>No reservations match these filters.</p>
            )}
            <div className={s.pagination}>
              <span>
                {bookings.total} reservations · Page {page}
              </span>
              <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous
              </button>
              <button
                disabled={page * bookings.pageSize >= bookings.total}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
          </>
        )}
        {!loading && section === "spaces" && (
          <>
            <div className={s.sectionActions}>
              {canManage && (
                <button
                  className={s.secondary}
                  onClick={() => {
                    setEditingSpace(null);
                    setSpaceDialog(true);
                  }}
                >
                  <Plus size={16} /> Add space
                </button>
              )}
            </div>
            <SpaceGallery
              spaces={spaces}
              canManage={canManage}
              onEdit={(space) => {
                setEditingSpace(space);
                setSpaceDialog(true);
              }}
              onBlock={setBlockSpace}
            />
          </>
        )}
        {!loading && section === "reports" && (
          <>
            <div className={s.sectionActions}>
              <button
                className={s.secondary}
                onClick={() => {
                  const header =
                    "Branch,Category,Bookings,Confirmed,Cancelled,No-show,Booked value,Recorded payments";
                  const lines = reports.map((r) =>
                    [
                      r.branch,
                      r.category,
                      r.total,
                      r.confirmed,
                      r.cancelled,
                      r.noShow,
                      r.bookedValue,
                      r.recordedPayments,
                    ]
                      .map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`)
                      .join(","),
                  );
                  const blob = new Blob([[header, ...lines].join("\n")], {
                    type: "text/csv",
                  });
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = "reservation-report.csv";
                  a.click();
                  URL.revokeObjectURL(a.href);
                }}
              >
                <Download size={16} /> Export CSV
              </button>
            </div>
            <div className={s.reportList}>
              {reports.map((r, i) => (
                <article key={i} className={s.reportRow}>
                  <strong>{String(r.category)}</strong>
                  <span>{String(r.branch)}</span>
                  <span>{String(r.total)} bookings</span>
                  <span>Booked {money(Number(r.bookedValue))}</span>
                  <span>Recorded {money(Number(r.recordedPayments))}</span>
                </article>
              ))}
            </div>
            {!reports.length && (
              <p className={s.empty}>No report data in this date range.</p>
            )}
          </>
        )}
        {!loading && section === "payments" && <PaymentVerificationPanel branchId={branchId} />}
        {!loading && section === "settings" && (
          <>
            <PaymentAccountSettings branchId={branchId} branches={branches} />
            {!branchId ? (
              <p className={s.empty}>
                Choose a branch to view its booking settings.
              </p>
            ) : (
              <form
                className={s.settingsForm}
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (settings.openTime >= settings.closeTime) {
                    showError(
                      "Booking close time must be after its opening time.",
                    );
                    return;
                  }
                  if (settings.allowedDays.length === 0) {
                    showError("Choose at least one available booking day.");
                    return;
                  }
                  setError("");
                  if (
                    await mutate(
                      `/settings${qs({ branchId })}`,
                      settings,
                      "PATCH",
                      "Reservation settings saved.",
                    )
                  )
                    reload();
                }}
              >
                <section
                  className={s.settingsGroup}
                  aria-labelledby="booking-rules-heading"
                >
                  <div className={s.settingsGroupHeading}>
                    <h3 id="booking-rules-heading">Booking rules</h3>
                    <p>
                      Set how far ahead customers can book and the standard
                      reservation length.
                    </p>
                  </div>
                  <div className={s.settingsFields}>
                    <label>
                      <FieldLabel required>Minimum advance notice</FieldLabel>
                      <span>Minutes before the reservation</span>
                      <input
                        required
                        type="number"
                        min="0"
                        max="10080"
                        value={settings.minAdvanceMinutes}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            minAdvanceMinutes: Number(e.target.value),
                          })
                        }
                      />
                    </label>
                    <label>
                      <FieldLabel required>Maximum booking window</FieldLabel>
                      <span>How many days ahead customers can book</span>
                      <input
                        required
                        type="number"
                        min="1"
                        max="1095"
                        value={settings.maxAdvanceDays}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            maxAdvanceDays: Number(e.target.value),
                          })
                        }
                      />
                    </label>
                    <label>
                      <FieldLabel required>Default booking duration</FieldLabel>
                      <span>Minutes</span>
                      <input
                        required
                        type="number"
                        min="30"
                        max="1440"
                        value={settings.defaultDurationMinutes}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            defaultDurationMinutes: Number(e.target.value),
                          })
                        }
                      />
                    </label>
                  </div>
                  <label className={`${s.checkbox} ${s.settingsToggle}`}>
                    <input
                      type="checkbox"
                      checked={settings.autoConfirm}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          autoConfirm: e.target.checked,
                        })
                      }
                    />
                    <span>
                      <strong>Automatically confirm available bookings</strong>
                      <small>Turn off to require manager approval.</small>
                    </span>
                  </label>
                </section>

                <section
                  className={s.settingsGroup}
                  aria-labelledby="booking-hours-heading"
                >
                  <div className={s.settingsGroupHeading}>
                    <h3 id="booking-hours-heading">Operating hours</h3>
                    <p>
                      Reservations must start and finish within these hours
                      (Manila time).
                    </p>
                  </div>
                  <div className={`${s.settingsFields} ${s.hoursFields}`}>
                    <label>
                      <FieldLabel required={true}>Opens at</FieldLabel>
                      <input
                        required
                        type="time"
                        value={settings.openTime}
                        onChange={(e) =>
                          setSettings({ ...settings, openTime: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      <FieldLabel required={true}>Closes at</FieldLabel>
                      <input
                        required
                        type="time"
                        min={settings.openTime}
                        value={settings.closeTime}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            closeTime: e.target.value,
                          })
                        }
                      />
                    </label>
                  </div>
                </section>

                <section
                  className={s.settingsGroup}
                  aria-labelledby="booking-days-heading"
                >
                  <div className={s.settingsGroupHeading}>
                    <h3 id="booking-days-heading">Available days</h3>
                    <p>
                      Choose the days when this branch accepts reservations.
                    </p>
                  </div>
                  <div
                    className={s.dayPresets}
                    aria-label="Common day schedules"
                  >
                    {[
                      { label: "Monday–Friday", days: [1, 2, 3, 4, 5] },
                      { label: "Monday–Saturday", days: [1, 2, 3, 4, 5, 6] },
                      { label: "Every day", days: [1, 2, 3, 4, 5, 6, 7] },
                    ].map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        aria-pressed={
                          preset.days.length === settings.allowedDays.length &&
                          preset.days.every((value) =>
                            settings.allowedDays.includes(value),
                          )
                        }
                        onClick={() =>
                          setSettings({ ...settings, allowedDays: preset.days })
                        }
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                  <fieldset className={s.weekdayOptions}>
                    <legend>Custom schedule</legend>
                    {weekdayOptions.map((dayOption) => (
                      <label key={dayOption.value}>
                        <input
                          type="checkbox"
                          checked={settings.allowedDays.includes(
                            dayOption.value,
                          )}
                          onChange={(e) => {
                            const allowedDays = e.target.checked
                              ? [...settings.allowedDays, dayOption.value].sort(
                                  (a, b) => a - b,
                                )
                              : settings.allowedDays.filter(
                                  (day) => day !== dayOption.value,
                                );
                            setSettings({ ...settings, allowedDays });
                          }}
                        />
                        {dayOption.label}
                      </label>
                    ))}
                  </fieldset>
                </section>

                <div className={s.settingsFooter}>
                  <p>
                    These rules apply to new and edited reservations for this
                    branch.
                  </p>
                  <button className={s.primary} disabled={busy}>
                    {busy ? "Saving…" : "Save settings"}
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </section>
      {createDate && (
        <Modal
          title={
            editingBooking
              ? review
                ? "Review changes"
                : "Edit reservation"
              : review
                ? "Review reservation"
                : "New reservation"
          }
          onClose={() => setCreateDate(null)}
        >
          <form className={s.form} onSubmit={submitBooking}>
            {error && (
              <p className={s.error} role="alert">
                {error}
              </p>
            )}
            {!review ? (
              <>
                <h3>
                  <CalendarDays size={17} /> Booking details
                </h3>
                <div className={s.formGrid}>
                  <label>
                    <FieldLabel required={true}>Branch</FieldLabel>
                    <select
                      required
                      value={draft.branchId}
                      onChange={(e) => {
                        const nextBranchId = e.target.value;
                        setDraft({
                          ...draft,
                          branchId: nextBranchId,
                          roomId: "",
                        });
                        void reservationRequest<Space[]>(
                          `/spaces${qs({ branchId: nextBranchId })}`,
                        )
                          .then(setSpaces)
                          .catch((error: unknown) => {
                            showError(
                              error instanceof Error
                                ? error.message
                                : "Unable to load spaces.",
                            );
                          });
                        void reservationRequest<typeof settings>(
                          `/settings${qs({ branchId: nextBranchId })}`,
                        )
                          .then(setSettings)
                          .catch((error: unknown) => {
                            showError(
                              error instanceof Error
                                ? error.message
                                : "Unable to load booking policy.",
                            );
                          });
                      }}
                    >
                      <option value="" disabled>
                        Choose a branch
                      </option>
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <FieldLabel required={true}>Space</FieldLabel>
                    <select
                      required
                      value={draft.roomId}
                      onChange={(e) =>
                        setDraft({ ...draft, roomId: e.target.value })
                      }
                    >
                      <option value="" disabled>
                        Choose a space
                      </option>
                      {spaces
                        .filter(
                          (space) =>
                            space.branchId === draft.branchId &&
                            space.isActive &&
                            !["MAINTENANCE", "INACTIVE"].includes(space.status),
                        )
                        .map((space) => (
                          <option key={space.id} value={space.id}>
                            {space.name} · capacity {space.capacity} ·{" "}
                            {money(space.hourlyRate)}/hour
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    <FieldLabel required={true}>Date</FieldLabel>
                    <input
                      required
                      type="date"
                      value={draft.date}
                      onChange={(e) =>
                        setDraft({ ...draft, date: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    <FieldLabel required={true}>Start time</FieldLabel>
                    <input
                      required
                      type="time"
                      min={settings.openTime}
                      max={settings.closeTime}
                      value={draft.start}
                      onChange={(e) =>
                        setDraft({ ...draft, start: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    <FieldLabel required={true}>End time</FieldLabel>
                    <input
                      required
                      type="time"
                      min={settings.openTime}
                      max={settings.closeTime}
                      value={draft.end}
                      onChange={(e) =>
                        setDraft({ ...draft, end: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    <FieldLabel required={true}>Guests</FieldLabel>
                    <input
                      required
                      type="number"
                      min="1"
                      max={10000}
                      value={draft.guestCount}
                      onChange={(e) =>
                        setDraft({ ...draft, guestCount: e.target.value })
                      }
                    />
                  </label>
                </div>
                <label>
                  <FieldLabel required={true}>Purpose</FieldLabel>
                  <select
                    required
                    value={purposeType}
                    onChange={(e) => {
                      const nextType = e.target.value;
                      setPurposeType(nextType);
                      if (nextType !== "OTHER")
                        setDraft({
                          ...draft,
                          purpose: purposeLabels[nextType] ?? "",
                        });
                      else if (purposeType !== "OTHER")
                        setDraft({ ...draft, purpose: "" });
                    }}
                  >
                    <option value="" disabled>
                      Select a purpose
                    </option>
                    <option value="OCULAR">Ocular</option>
                    <option value="VISIT">Visit</option>
                    <option value="MEETING">Meeting</option>
                    <option value="COWORKING">Coworking</option>
                    <option value="PRIVATE">Private</option>
                    <option value="OTHER">Other</option>
                  </select>
                </label>
                {purposeType === "OTHER" && (
                  <label>
                    <FieldLabel required={true}>Specify purpose</FieldLabel>
                    <input
                      required
                      maxLength={1000}
                      value={draft.purpose}
                      onChange={(e) =>
                        setDraft({ ...draft, purpose: e.target.value })
                      }
                      placeholder="Enter the reservation purpose"
                    />
                  </label>
                )}
                <h3>Customer details</h3>
                <div className={s.formGrid}>
                  <label>
                    <FieldLabel required={true}>Full name</FieldLabel>
                    <input
                      required
                      maxLength={200}
                      value={draft.customerName}
                      onChange={(e) =>
                        setDraft({ ...draft, customerName: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    <FieldLabel required={true}>Email</FieldLabel>
                    <input
                      required
                      type="email"
                      value={draft.customerEmail}
                      onChange={(e) =>
                        setDraft({ ...draft, customerEmail: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    <FieldLabel required={true}>Contact number</FieldLabel>
                    <input
                      required
                      value={draft.customerPhone}
                      onChange={(e) =>
                        setDraft({ ...draft, customerPhone: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Company
                    <input
                      value={draft.companyName}
                      onChange={(e) =>
                        setDraft({ ...draft, companyName: e.target.value })
                      }
                    />
                  </label>
                </div>
                <label>
                  Special requests
                  <textarea
                    value={draft.specialRequests}
                    onChange={(e) =>
                      setDraft({ ...draft, specialRequests: e.target.value })
                    }
                  />
                </label>
                <p className={s.estimate}>
                  <Clock3 size={17} />
                  {duration.toFixed(1)} hours
                </p>
              </>
            ) : (
              <div className={s.review}>
                <p>
                  <strong>{draft.customerName}</strong> · {draft.customerEmail}
                </p>
                <p>
                  {spaces.find((space) => space.id === draft.roomId)?.name ??
                    "Space not selected"}{" "}
                  · {draft.date} · {draft.start}–{draft.end} ·{" "}
                  {draft.guestCount} guests
                </p>
                <p>
                  Estimated total:{" "}
                  {money(
                    (spaces.find((space) => space.id === draft.roomId)
                      ?.hourlyRate ?? 0) * duration,
                  )}
                </p>
                <p>
                  Reservation dates, branch access and approval status are
                  checked by the server when you submit.
                </p>
              </div>
            )}
            <div className={s.dialogActions}>
              {review && (
                <button
                  type="button"
                  className={s.secondary}
                  onClick={() => setReview(false)}
                >
                  Back
                </button>
              )}
              <button
                type="submit"
                className={s.primary}
                disabled={busy || duration <= 0}
              >
                {busy
                  ? "Saving…"
                  : review
                    ? editingBooking
                      ? "Save changes"
                      : "Submit reservation"
                    : "Review reservation"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {reasonAction && (
        <Modal
          title={
            reasonAction === "reject" || reasonAction === "cancel"
              ? "Decline or cancel booking"
              : `${statusLabel(reasonAction)} booking`
          }
          onClose={() => setReasonAction(null)}
        >
          <form className={s.form} onSubmit={submitReason}>
            <p className={s.reasonIntro}>
              Add a reason to keep the reservation history clear for the team.
            </p>
            <label>
              <FieldLabel required={true}>Reason</FieldLabel>
              <textarea
                autoFocus
                required
                minLength={3}
                maxLength={1000}
                value={reasonDraft}
                onChange={(e) => setReasonDraft(e.target.value)}
                placeholder="Briefly explain this decision"
              />
            </label>
            <div className={s.dialogActions}>
              <button
                type="button"
                className={s.secondary}
                onClick={() => setReasonAction(null)}
              >
                Keep booking
              </button>
              <button
                type="submit"
                className={s.primary}
                disabled={busy || reasonDraft.trim().length < 3}
              >
                {busy
                  ? "Saving…"
                  : reasonAction === "reject" || reasonAction === "cancel"
                    ? "Confirm"
                    : statusLabel(reasonAction)}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {detailId && (
        <Modal
          title="Reservation details"
          onClose={() => {
            setDetailId(null);
            setDetail(null);
          }}
        >
          {!detail ? (
            <p className={s.empty}>Loading booking…</p>
          ) : (
            <div className={s.detail}>
              <section className={s.detailSummary}>
                <p className={s.reference}>
                  {String(detail.record.reference ?? detailId)}
                  {detail.record.source === 'PUBLIC_PORTAL' && ' · Client portal'}
                </p>
                <div className={s.detailTitle}>
                  <h3>
                    {String(
                      detail.record.customer_name ?? "Customer not recorded",
                    )}
                  </h3>
                  <span
                    className={`${s.badge} ${statusClass(String(detail.record.status))}`}
                  >
                    {statusLabel(String(detail.record.status))}
                  </span>
                </div>
              </section>
              <section className={s.detailSection}>
                <h4>Booking details</h4>
                <dl className={s.detailGrid}>
                  {[
                    ["Purpose", detail.record.purpose],
                    ["Branch", detail.record.branchName],
                    ["Space", detail.record.roomName ?? "Unassigned"],
                    [
                      "Starts",
                      detail.record.start_date_time &&
                        `${dateLabel(String(detail.record.start_date_time))} ${timeLabel(String(detail.record.start_date_time))}`,
                    ],
                    [
                      "Ends",
                      detail.record.end_date_time &&
                        `${dateLabel(String(detail.record.end_date_time))} ${timeLabel(String(detail.record.end_date_time))}`,
                    ],
                    ["Guests", detail.record.guest_count],
                  ].map(([label, value]) => (
                    <div key={String(label)}>
                      <dt>{String(label)}</dt>
                      <dd>{String(value ?? "—")}</dd>
                    </div>
                  ))}
                </dl>
              </section>
              <section className={s.detailSection}>
                <h4>Customer details</h4>
                <dl className={s.detailGrid}>
                  {[
                    ["Contact", detail.record.customer_phone],
                    ["Email", detail.record.customer_email],
                    ["Company", detail.record.company_name],
                  ]
                    .filter(([, value]) => value)
                    .map(([label, value]) => (
                      <div key={String(label)}>
                        <dt>{String(label)}</dt>
                        <dd>{String(value)}</dd>
                      </div>
                    ))}
                </dl>
              </section>
              <section className={s.detailSection}>
                <h4>Payment</h4>{Boolean(detail.record.manual_payment_required)&&<p>This booking requires independently verified payment. <Link href="/reservations/payments">Open Payment Verification</Link></p>}
                <dl className={s.detailGrid}>
                  <div>
                    <dt>Status</dt>
                    <dd>
                      {statusLabel(
                        String(detail.record.payment_status ?? "UNPAID"),
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Total</dt>
                    <dd>{money(Number(detail.record.amount))}</dd>
                  </div>
                </dl>
              </section>
              {Boolean(
                detail.record.special_requests || detail.record.notes,
              ) && (
                <section className={s.detailSection}>
                  <h4>Notes and requests</h4>
                  {Boolean(detail.record.special_requests) && (
                    <p className={s.detailNote}>
                      {String(detail.record.special_requests)}
                    </p>
                  )}
                  {Boolean(detail.record.notes) && (
                    <p className={s.detailNote}>
                      {String(detail.record.notes)}
                    </p>
                  )}
                </section>
              )}
              {['PENDING', 'CONFIRMED'].includes(String(detail.record.status)) && detail.events.some(e => e.action === 'CANCELLATION_REQUESTED') && (
                <section className={s.detailSection}>
                  <h4>Client cancellation request — awaiting approval</h4>
                  <p className={s.detailNote}>{detail.events.find(e => e.action === 'CANCELLATION_REQUESTED')?.reason}</p>
                  {canManage && <button className={s.dangerButton} disabled={busy} onClick={() => {
                    setReasonDraft(detail.events.find(e => e.action === 'CANCELLATION_REQUESTED')?.reason ?? 'Client requested cancellation');
                    setReasonAction('cancel');
                  }}>Approve cancellation</button>}
                </section>
              )}
              <div className={`${s.dialogActions} ${s.detailActions}`}>
                {canManage &&
                  ["PENDING", "CONFIRMED"].includes(
                    String(detail.record.status),
                  ) && (
                    <button
                      type="button"
                      className={s.secondary}
                      onClick={openEdit}
                    >
                      Edit booking
                    </button>
                  )}
                {String(detail.record.status) === "PENDING" && canManage && !detail.record.manual_payment_required && (
                  <>
                    <button
                      className={s.primary}
                      onClick={() => void action("approve")}
                      disabled={busy}
                    >
                      Approve
                    </button>
                  </>
                )}
                {String(detail.record.status) === "CONFIRMED" && (
                  <button
                    onClick={() => void action("check-in")}
                    disabled={busy}
                  >
                    Check in
                  </button>
                )}
                {String(detail.record.status) === "CHECKED_IN" && (
                  <button
                    onClick={() => void action("check-out")}
                    disabled={busy}
                  >
                    Check out
                  </button>
                )}
                {["PENDING", "CONFIRMED"].includes(
                  String(detail.record.status),
                ) &&
                  canManage && (
                    <button
                      className={s.dangerButton}
                      onClick={() => void action("decline-or-cancel")}
                      disabled={busy}
                    >
                      Decline / cancel booking
                    </button>
                  )}
                {String(detail.record.status) === "CONFIRMED" && canManage && (
                  <button
                    onClick={() => void action("no-show")}
                    disabled={busy}
                  >
                    Mark no-show
                  </button>
                )}
              </div>
              {canManage && !detail.record.manual_payment_required &&
                Number(detail.record.amount) > 0 &&
                !["CANCELLED", "REJECTED", "PAID"].includes(
                  String(detail.record.payment_status),
                ) &&
                !["CANCELLED", "REJECTED"].includes(
                  String(detail.record.status),
                ) && (
                  <form
                    className={s.paymentForm}
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const data = new FormData(e.currentTarget);
                      if (
                        await mutate(
                          `/${encodeURIComponent(detailId)}/payments`,
                          {
                            amount: Number(data.get("amount")),
                            method: data.get("method"),
                            reference: data.get("reference"),
                            note: data.get("note"),
                          },
                        )
                      )
                        setDetail(
                          await reservationRequest<Detail>(
                            `/${encodeURIComponent(detailId)}`,
                          ),
                        );
                    }}
                  >
                    <h4>Record a payment</h4>
                    <p>
                      Records a received payment; this does not charge the
                      customer.
                    </p>
                    <div className={s.formGrid}>
                      <label>
                        <FieldLabel required={true}>Amount (PHP)</FieldLabel>
                        <input
                          name="amount"
                          type="number"
                          min="0.01"
                          step="0.01"
                          required
                        />
                      </label>
                      <label>
                        <FieldLabel required={true}>Method</FieldLabel>
                        <select required name="method">
                          <option value="CASH">Cash</option>
                          <option value="BANK_TRANSFER">Bank transfer</option>
                          <option value="CARD_TERMINAL">Card terminal</option>
                          <option value="OTHER">Other</option>
                        </select>
                      </label>
                      <label>
                        Reference
                        <input name="reference" maxLength={120} />
                      </label>
                      <label>
                        Note
                        <input name="note" maxLength={1000} />
                      </label>
                    </div>
                    <button
                      type="submit"
                      className={s.secondary}
                      disabled={busy}
                    >
                      Record payment
                    </button>
                  </form>
                )}
              {detail.payments.length > 0 && (
                <>
                  <h4>Recorded payments</h4>
                  {detail.payments.map((p, i) => (
                    <p key={i} className={s.history}>
                      {money(p.amount)} · {statusLabel(p.method)} ·{" "}
                      {dateLabel(p.createdAt, { dateStyle: "medium" })}
                    </p>
                  ))}
                </>
              )}
              {detail.customerHistory.length > 0 && (
                <>
                  <h4>Customer booking history</h4>
                  {detail.customerHistory.map((past, i) => (
                    <p key={i} className={s.history}>
                      {past.reference} ·{" "}
                      {dateLabel(past.startAt, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}{" "}
                      · {statusLabel(past.status)}
                    </p>
                  ))}
                </>
              )}
              <h4>History</h4>
              {detail.events.map((x, i) => (
                <p key={i} className={s.history}>
                  {statusLabel(x.action)} ·{" "}
                  {dateLabel(x.createdAt, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                  {x.reason ? ` · ${x.reason}` : ""}
                </p>
              ))}
            </div>
          )}
        </Modal>
      )}
      {spaceDialog && (
        <Modal
          title={
            editingSpace ? "Edit reservable space" : "Add reservable space"
          }
          onClose={() => setSpaceDialog(false)}
        >
          <form
            className={s.form}
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const ok = await mutate(
                editingSpace
                  ? `/spaces/${encodeURIComponent(editingSpace.id)}`
                  : "/spaces",
                {
                  branchId: f.get("branchId"),
                  name: f.get("name"),
                  type: f.get("type"),
                  floor: f.get("floor"),
                  capacity: Number(f.get("capacity")),
                  hourlyRate: Number(f.get("hourlyRate")),
                  bufferMinutes: Number(f.get("bufferMinutes")),
                  isActive: f.get("isActive") === "on",
                  publicBookable: f.get("publicBookable") === "on",
                  imageData: f.get("imageData") || null,
                },
                editingSpace ? "PATCH" : "POST",
              );
              if (ok) setSpaceDialog(false);
            }}
          >
            <label>
              <FieldLabel required={true}>Branch</FieldLabel>
              <select
                name="branchId"
                required
                defaultValue={editingSpace?.branchId}
                disabled={Boolean(editingSpace)}
              >
                {branches.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
              {editingSpace && (
                <input
                  type="hidden"
                  name="branchId"
                  value={editingSpace.branchId}
                />
              )}
            </label>
            <label>
              <FieldLabel required={true}>Space name</FieldLabel>
              <input name="name" required defaultValue={editingSpace?.name} />
            </label>
            <div className={s.formGrid}>
              <label>
                <FieldLabel required={true}>Type</FieldLabel>
                <select required name="type" defaultValue={editingSpace?.type}>
                  {[
                    "MEETING_ROOM",
                    "CONFERENCE_ROOM",
                    "COWORKING_DESK",
                    "PRIVATE_OFFICE",
                    "EVENT_SPACE",
                    "OTHER",
                  ].map((x) => (
                    <option key={x} value={x}>
                      {statusLabel(x)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <FieldLabel required={true}>Floor</FieldLabel>
                <input
                  name="floor"
                  required
                  defaultValue={editingSpace?.floor}
                />
              </label>
              <label>
                <FieldLabel required={true}>Capacity</FieldLabel>
                <input
                  name="capacity"
                  required
                  type="number"
                  min="1"
                  defaultValue={editingSpace?.capacity}
                />
              </label>
              <label>
                Hourly rate (PHP)
                <input
                  name="hourlyRate"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={editingSpace?.hourlyRate ?? 0}
                />
              </label>
              <label>
                Buffer (minutes)
                <input
                  name="bufferMinutes"
                  type="number"
                  min="0"
                  max="240"
                  defaultValue={editingSpace?.bufferMinutes ?? 0}
                />
              </label>
            </div>
            <SpaceImageInput initialImage={editingSpace?.imageData} onProcessing={setSpaceImageProcessing} />
            <label className={s.checkbox}>
              <input type="checkbox" name="publicBookable" defaultChecked={editingSpace?.publicBookable ?? false} />
              Allow public client bookings (meeting rooms and coworking only)
            </label>
            <label className={s.checkbox}>
              <input
                type="checkbox"
                name="isActive"
                defaultChecked={editingSpace?.isActive ?? true}
              />{" "}
              Active for booking
            </label>
            <div className={s.dialogActions}>
              <button className={s.primary} disabled={busy || spaceImageProcessing}>
                Save space
              </button>
            </div>
          </form>
        </Modal>
      )}
      {blockSpace && (
        <Modal
          title={`Block ${blockSpace.name}`}
          onClose={() => setBlockSpace(null)}
        >
          <form
            className={s.form}
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const ok = await mutate(
                `/spaces/${encodeURIComponent(blockSpace.id)}/blocks`,
                {
                  startAt: manilaIso(
                    String(f.get("date")),
                    String(f.get("start")),
                  ),
                  endAt: manilaIso(String(f.get("date")), String(f.get("end"))),
                  reason: f.get("reason"),
                },
              );
              if (ok) setBlockSpace(null);
            }}
          >
            <p>Bookings cannot be created during this maintenance period.</p>
            <div className={s.formGrid}>
              <label>
                <FieldLabel required={true}>Date</FieldLabel>
                <input type="date" name="date" required defaultValue={date} />
              </label>
              <label>
                <FieldLabel required={true}>Start</FieldLabel>
                <input type="time" name="start" required defaultValue="09:00" />
              </label>
              <label>
                <FieldLabel required={true}>End</FieldLabel>
                <input type="time" name="end" required defaultValue="10:00" />
              </label>
            </div>
            <label>
              <FieldLabel required={true}>Reason</FieldLabel>
              <input name="reason" required maxLength={1000} />
            </label>
            <div className={s.dialogActions}>
              <button type="submit" className={s.primary} disabled={busy}>
                Block time
              </button>
            </div>
          </form>
        </Modal>
      )}
    </main>
  );
}
