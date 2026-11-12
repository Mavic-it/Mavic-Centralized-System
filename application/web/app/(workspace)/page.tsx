import { PageHeading, PageHeader } from "../components/page-heading";
import { CalendarDays, CircleAlert, DoorOpen, UsersRound } from "lucide-react";
import Link from "next/link";
import {
  branchOptions,
  branchStats,
  dashboardReservations,
  isBranchKey,
} from "../data/dashboard";
import AuthorizedWorkspacePage from "../components/authorized-workspace-page";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string | string[]; page?: string }>;
}) {
  const params = await searchParams;
  const branchParam = Array.isArray(params.branch)
    ? params.branch[0]
    : params.branch;
  const branch = isBranchKey(branchParam) ? branchParam : "all";
  const stats = branchStats[branch];
  const branchLabel = branchOptions.find(
    (option) => option.value === branch,
  )!.label;
  const roomTotal = Object.values(stats.rooms).reduce(
    (total, count) => total + count,
    0,
  );
  const visibleReservations =
    branch === "all"
      ? dashboardReservations
      : dashboardReservations.filter(
          (reservation) => reservation.branch.toLowerCase() === branch,
        );
  const reservationsPerPage = 10;
  const reservationTotalPages = Math.max(
    1,
    Math.ceil(visibleReservations.length / reservationsPerPage),
  );
  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const reservationPage = Number.isFinite(requestedPage)
    ? Math.max(1, Math.min(requestedPage, reservationTotalPages))
    : 1;
  const firstReservation =
    visibleReservations.length === 0
      ? 0
      : (reservationPage - 1) * reservationsPerPage + 1;
  const pageReservations = visibleReservations.slice(
    firstReservation === 0 ? 0 : firstReservation - 1,
    reservationPage * reservationsPerPage,
  );
  function reservationPageHref(page: number) {
    const nextParams = new URLSearchParams();
    if (branch !== "all") nextParams.set("branch", branch);
    nextParams.set("page", String(page));
    return `/?${nextParams.toString()}`;
  }
  const dateLabel = new Intl.DateTimeFormat("en-PH", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date());

  return (
    <AuthorizedWorkspacePage access="overview" returnPath="/">
      <div className="dashboard-page">
        <PageHeader className="page-heading" aria-labelledby="dashboard-title">
          <div>
            <p className="eyebrow">{dateLabel}</p>
            <PageHeading id="dashboard-title">Operations overview</PageHeading>
            <p className="page-description">
              A clear view of today across {branchLabel.toLowerCase()}.
            </p>
          </div>
          <div className="sample-label">
            <span aria-hidden="true" className="sample-indicator" />
            Sample data
          </div>
        </PageHeader>

        <section className="metric-grid" aria-label="Business overview">
          <article className="metric-card">
            <div className="metric-topline">
              <span className="metric-icon icon-red">
                <UsersRound aria-hidden="true" size={18} />
              </span>
              <span className="metric-period">People</span>
            </div>
            <p className="metric-value">{stats.employees}</p>
            <div className="metric-caption">
              <span className="metric-label">Employees</span>
              <span>{stats.activeEmployees} active</span>
            </div>
          </article>

          <article className="metric-card">
            <div className="metric-topline">
              <span className="metric-icon icon-dark">
                <CalendarDays aria-hidden="true" size={18} />
              </span>
              <span className="metric-period">Today</span>
            </div>
            <p className="metric-value">{stats.reservations}</p>
            <div className="metric-caption">
              <span className="metric-label">Reservations</span>
              <span>Across selected branches</span>
            </div>
          </article>

          <article className="metric-card">
            <div className="metric-topline">
              <span className="metric-icon icon-amber">
                <CircleAlert aria-hidden="true" size={18} />
              </span>
              <span className="metric-period">Needs follow-up</span>
            </div>
            <p className="metric-value">{stats.inquiries}</p>
            <div className="metric-caption">
              <span className="metric-label">Open inquiries</span>
              <span>Awaiting a response</span>
            </div>
          </article>
        </section>

        <section className="dashboard-grid" aria-label="Daily operations">
          <article className="panel room-panel">
            <div className="panel-heading">
              <div>
                <p className="section-kicker">SPACE UTILIZATION</p>
                <h2>Room status</h2>
              </div>
              <span className="panel-meta">
                <DoorOpen aria-hidden="true" size={16} />
                {roomTotal} rooms
              </span>
            </div>

            <div
              aria-label={`${stats.rooms.available} available, ${stats.rooms.reserved} reserved, ${stats.rooms.occupied} occupied, ${stats.rooms.maintenance} in maintenance`}
              className="room-meter"
              role="img"
            >
              <span
                className="room-segment room-available"
                style={{
                  width: `${(stats.rooms.available / roomTotal) * 100}%`,
                }}
              />
              <span
                className="room-segment room-reserved"
                style={{
                  width: `${(stats.rooms.reserved / roomTotal) * 100}%`,
                }}
              />
              <span
                className="room-segment room-occupied"
                style={{
                  width: `${(stats.rooms.occupied / roomTotal) * 100}%`,
                }}
              />
              <span
                className="room-segment room-maintenance"
                style={{
                  width: `${(stats.rooms.maintenance / roomTotal) * 100}%`,
                }}
              />
            </div>

            <div className="room-legend">
              <div>
                <span className="legend-dot room-available" />
                <span>Available</span>
                <strong>{stats.rooms.available}</strong>
              </div>
              <div>
                <span className="legend-dot room-reserved" />
                <span>Reserved</span>
                <strong>{stats.rooms.reserved}</strong>
              </div>
              <div>
                <span className="legend-dot room-occupied" />
                <span>Occupied</span>
                <strong>{stats.rooms.occupied}</strong>
              </div>
              <div>
                <span className="legend-dot room-maintenance" />
                <span>Maintenance</span>
                <strong>{stats.rooms.maintenance}</strong>
              </div>
            </div>
          </article>

          <article className="panel attention-panel">
            <div className="panel-heading">
              <div>
                <p className="section-kicker">TEAM WORKLIST</p>
                <h2>Needs attention</h2>
              </div>
              <span className="attention-count">
                {stats.inquiries + stats.lowStock}
              </span>
            </div>
            <ul className="attention-list">
              <li>
                <span className="attention-mark mark-amber">
                  <CircleAlert aria-hidden="true" size={15} />
                </span>
                <span className="attention-copy">
                  <strong>Customer inquiries</strong>
                  <span>Awaiting a response</span>
                </span>
                <span className="attention-number">{stats.inquiries}</span>
              </li>
              <li>
                <span className="attention-mark mark-gray">
                  <DoorOpen aria-hidden="true" size={15} />
                </span>
                <span className="attention-copy">
                  <strong>Low-stock items</strong>
                  <span>At or below minimum</span>
                </span>
                <span className="attention-number">{stats.lowStock}</span>
              </li>
            </ul>
          </article>
        </section>

        <section
          className="panel reservation-panel"
          aria-labelledby="reservations-title"
        >
          <div className="panel-heading reservation-heading">
            <div>
              <p className="section-kicker">FRONT DESK</p>
              <h2 id="reservations-title">Today&apos;s reservations</h2>
            </div>
            <span className="table-summary">
              Showing {firstReservation}–
              {Math.min(
                reservationPage * reservationsPerPage,
                visibleReservations.length,
              )}{" "}
              of {visibleReservations.length}
            </span>
          </div>

          <div className="reservation-table-wrap">
            <table className="reservation-table">
              <thead>
                <tr>
                  <th scope="col">Time</th>
                  <th scope="col">Customer</th>
                  <th scope="col">Space</th>
                  <th scope="col">Branch</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {pageReservations.map((reservation) => (
                  <tr key={`${reservation.time}-${reservation.customer}`}>
                    <td className="reservation-time">{reservation.time}</td>
                    <td>
                      <span className="customer-cell">
                        <span aria-hidden="true" className="customer-avatar">
                          {reservation.initials}
                        </span>
                        <span>{reservation.customer}</span>
                      </span>
                    </td>
                    <td>{reservation.room}</td>
                    <td>{reservation.branch}</td>
                    <td>
                      <span
                        className={`reservation-status ${reservation.statusClass}`}
                      >
                        <span aria-hidden="true" />
                        {reservation.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <nav
            aria-label="Reservation pagination"
            className="reservation-pagination"
          >
            <span aria-live="polite">
              Page {reservationPage} of {reservationTotalPages} · Showing{" "}
              {firstReservation}–
              {Math.min(
                reservationPage * reservationsPerPage,
                visibleReservations.length,
              )}{" "}
              of {visibleReservations.length}
            </span>
            <div>
              {reservationPage <= 1 ? (
                <span
                  aria-disabled="true"
                  aria-label="Previous reservations page"
                >
                  <span aria-hidden="true">‹</span>
                </span>
              ) : (
                <Link
                  aria-label="Previous reservations page"
                  href={reservationPageHref(reservationPage - 1)}
                >
                  <span aria-hidden="true">‹</span>
                </Link>
              )}
              {reservationPage >= reservationTotalPages ? (
                <span aria-disabled="true" aria-label="Next reservations page">
                  <span aria-hidden="true">›</span>
                </span>
              ) : (
                <Link
                  aria-label="Next reservations page"
                  href={reservationPageHref(reservationPage + 1)}
                >
                  <span aria-hidden="true">›</span>
                </Link>
              )}
            </div>
          </nav>
          <div className="reservation-mobile-list">
            {pageReservations.map((reservation) => (
              <article
                className="reservation-mobile-item"
                key={`${reservation.time}-${reservation.customer}-mobile`}
              >
                <div className="mobile-reservation-topline">
                  <span className="customer-cell">
                    <span aria-hidden="true" className="customer-avatar">
                      {reservation.initials}
                    </span>
                    <strong>{reservation.customer}</strong>
                  </span>
                  <span
                    className={`reservation-status ${reservation.statusClass}`}
                  >
                    <span aria-hidden="true" />
                    {reservation.status}
                  </span>
                </div>
                <div className="mobile-reservation-details">
                  <span>{reservation.room}</span>
                  <span>{reservation.branch}</span>
                  <span>{reservation.time}</span>
                </div>
              </article>
            ))}
          </div>
          {visibleReservations.length === 0 && (
            <p className="empty-reservations">
              No sample reservations are listed for this branch.
            </p>
          )}
        </section>

        <footer className="dashboard-footnote">
          <span>Preview workspace</span>
          <span>
            Values are illustrative and are not connected to live records.
          </span>
        </footer>
      </div>
    </AuthorizedWorkspacePage>
  );
}
