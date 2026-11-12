import AuthorizedWorkspacePage from "../../../components/authorized-workspace-page";
import ReservationsWorkspace from "../../../reservations/workspace";
export default function Page(){return <AuthorizedWorkspacePage access="reservations" returnPath="/reservations/payments"><ReservationsWorkspace section="payments"/></AuthorizedWorkspacePage>;}
