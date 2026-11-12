import { FileWarning } from "lucide-react";
import { SidebarNavItem } from "./sidebar-nav-item";
export function IncidentNavigation(props: {
  compact: boolean;
  pathname: string;
  onNavigate: () => void;
}) {
  return (
    <SidebarNavItem
      label="Incident Management"
      icon={FileWarning}
      href="/incidents"
      active={
        props.pathname === "/incidents" ||
        props.pathname.startsWith("/incidents/")
      }
      current={props.pathname === "/incidents"}
      compact={props.compact}
      onNavigate={props.onNavigate}
    />
  );
}
