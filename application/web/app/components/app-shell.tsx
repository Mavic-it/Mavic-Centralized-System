"use client";

import {
  CalendarDays,
  ChartNoAxesCombined,
  Clock3,
  ClipboardList,
  FileWarning,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  KeyRound,
  Settings,
  MapPinned,
  UserRound,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { usePathname } from "next/navigation";
import type { WorkspaceRole } from "../data/people";
import {
  canAccessWorkspaceArea,
  permissionKeyForPath,
  workspaceAreaForPath,
} from "../lib/workspace-access";
import { WorkspaceRoleProvider } from "./workspace-role-context";
import { IconActionButton } from "./icon-action-button";
import { WorkspaceNotifications } from "./workspace-notifications";
import { FullscreenButton } from "./fullscreen-button";
import { SidebarNavItem } from "./sidebar-nav-item";
import { SidebarNavGroup } from "./sidebar-nav-group";
import { Modal } from "./ui/modal";
import { notifyError } from "../lib/notifications";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type CSSProperties,
  type ReactNode,
} from "react";

type AppShellProps = {
  role: WorkspaceRole;
  children: ReactNode;
};

const COLLAPSED_SIDEBAR_WIDTH = 72;
const MIN_SIDEBAR_WIDTH = 220;
const MAX_SIDEBAR_WIDTH = 360;
const DEFAULT_SIDEBAR_WIDTH = 252;
const SIDEBAR_STORAGE_KEY = "mspaces.sidebar.width";
const SIDEBAR_EXPANDED_STORAGE_KEY = "mspaces.sidebar.expandedWidth";

function constrainSidebarWidth(width: number): number {
  if (!Number.isFinite(width)) return DEFAULT_SIDEBAR_WIDTH;
  if (width < MIN_SIDEBAR_WIDTH) return COLLAPSED_SIDEBAR_WIDTH;
  return Math.round(Math.min(width, MAX_SIDEBAR_WIDTH));
}

const navigationGroups: {
  label: string;
  items: { label: string; icon: LucideIcon; href?: string; roles?: WorkspaceRole[] }[];
}[] = [
  {
    label: "Workspace",
    items: [
      { label: "Overview", icon: LayoutDashboard, href: "/" },
      { label: "HR dashboard", icon: CalendarDays, href: "/hr" },
      { label: "Reports", icon: ChartNoAxesCombined },
    ],
  },
  {
    label: "My workspace",
    items: [
      { label: "My portal", icon: UserRound, href: "/me" },
      { label: "Account security", icon: KeyRound, href: "/me/security" },
      { label: "Leave", icon: CalendarDays, href: "/my-leave" },
      { label: "Tasks", icon: ClipboardList, href: "/tasks" },
      { label: "Incidents", icon: FileWarning, href: "/incidents" },
    ],
  },
  {
    label: "HR Management",
    items: [
      { label: "Employees", icon: UsersRound, href: "/employees" },
      { label: "Attendance", icon: Clock3, href: "/attendance" },
      { label: "Leave Management", icon: CalendarDays, href: "/leave" },
    ],
  },
  {
    label: "Business",
    items: [
      { label: "Reservations", icon: CalendarDays, href: "/reservations" },
      { label: "Inquiries", icon: MessageSquareText },
      { label: "Inventory", icon: Package },
    ],
  },
  {
    label: "Administration",
    items: [
      { label: "User access", icon: ShieldCheck, href: "/system/users" },
      { label: "Module access", icon: ShieldCheck, href: "/system/module-access", roles: ["SUPER_ADMIN","IT_ADMIN"] },
      { label: "Password reset requests", icon: KeyRound, href: "/system/password-reset-requests" },
      { label: "Branches", icon: MapPinned, href: "/branches" },
      { label: "Settings", icon: Settings },
    ],
  },
];

export default function AppShell({
  role,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [deniedPermissionKeys, setDeniedPermissionKeys] = useState<string[]>([]);
  const [grantedPermissionKeys, setGrantedPermissionKeys] = useState<string[]>([]);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const logoutButtonRef = useRef<HTMLButtonElement>(null);
  const logoutCancelButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const sidebarWidthRef = useRef(DEFAULT_SIDEBAR_WIDTH);
  const lastExpandedWidthRef = useRef(DEFAULT_SIDEBAR_WIDTH);
  const resizePointerRef = useRef<number | null>(null);
  const wasMobileNavOpen = useRef(false);
  const isSidebarCollapsed = sidebarWidth === COLLAPSED_SIDEBAR_WIDTH;
  useEffect(() => { let active=true; const syncPermissions=()=>{fetch("/api/auth/me",{cache:"no-store",credentials:"same-origin"}).then(response=>response.ok?response.json():null).then(data=>{if(!active)return;if(Array.isArray(data?.deniedPermissionKeys))setDeniedPermissionKeys(data.deniedPermissionKeys.filter((key:unknown):key is string=>typeof key==="string"));if(Array.isArray(data?.grantedPermissionKeys))setGrantedPermissionKeys(data.grantedPermissionKeys.filter((key:unknown):key is string=>typeof key==="string"));}).catch(()=>{});};syncPermissions();const interval=window.setInterval(syncPermissions,15000);window.addEventListener("focus",syncPermissions);return()=>{active=false;window.clearInterval(interval);window.removeEventListener("focus",syncPermissions);}; },[pathname]);
  const roleNavigationGroups = navigationGroups.map((group) => ({
    ...group,
    items: group.items.map((item) =>
      role === "SUPER_ADMIN" && item.href === "/me"
        ? { ...item, label: "My Profile", href: "/my-profile" }
        : item,
    ),
  }));
  const currentItem = pathname === '/attendance/official-business' ? {label:'Official Business'} : roleNavigationGroups
    .flatMap((group) => group.items)
    .filter(item=>{
      if(!item.roles || item.roles.includes(role)) return true;
      const area=item.href?workspaceAreaForPath(item.href):undefined;
      const key=area&&item.href?permissionKeyForPath(item.href,area):undefined;
      return Boolean(key&&grantedPermissionKeys.includes(key));
    })
    .find(
      (item) =>
        item.href === pathname ||
        (role === "SUPER_ADMIN" && item.href === "/my-profile" && pathname === "/me") ||
        (item.href !== "/" && pathname.startsWith(`${item.href}/`)),
    );
  const visibleNavigationGroups = roleNavigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (!item.href) return item.roles ? item.roles.includes(role) : role === "SUPER_ADMIN";
        const area = workspaceAreaForPath(item.href);
        const key=area?permissionKeyForPath(item.href!,area):undefined;
        if(item.roles && !item.roles.includes(role) && (!key||!grantedPermissionKeys.includes(key))) return false;
        if (item.href === "/" && role !== "SUPER_ADMIN" && !grantedPermissionKeys.includes("workspace.overview")) return false;
        return area ? (canAccessWorkspaceArea(role, area, grantedPermissionKeys)||Boolean(key&&grantedPermissionKeys.includes(key))) && (!key||!deniedPermissionKeys.includes(key)) : false;
      }),
    }))
    .filter((group) => group.items.length > 0);

  useEffect(() => {
    if (isMobileNavOpen) {
      wasMobileNavOpen.current = true;
      const priorOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      const focusMenu = () => {
        if (sidebarRef.current?.contains(document.activeElement)) return;
        (sidebarRef.current?.querySelector<HTMLAnchorElement>("a[href]") ??
          sidebarRef.current?.querySelector<HTMLButtonElement>(".sidebar-close"))
          ?.focus();
      };
      const focusFrame = window.requestAnimationFrame(focusMenu);
      const focusAfterTransition = window.setTimeout(focusMenu, 200);
      return () => {
        window.cancelAnimationFrame(focusFrame);
        window.clearTimeout(focusAfterTransition);
        document.body.style.overflow = priorOverflow;
      };
    }

    if (wasMobileNavOpen.current) {
      wasMobileNavOpen.current = false;
      menuButtonRef.current?.focus();
    }
  }, [isMobileNavOpen]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 900px)");
    const closeMobileDrawer = () => {
      if (desktop.matches) setIsMobileNavOpen(false);
    };
    desktop.addEventListener("change", closeMobileDrawer);
    return () => desktop.removeEventListener("change", closeMobileDrawer);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const savedExpandedWidth = window.localStorage.getItem(
          SIDEBAR_EXPANDED_STORAGE_KEY,
        );
        if (savedExpandedWidth !== null) {
          const parsedExpandedWidth = Number(savedExpandedWidth);
          if (Number.isFinite(parsedExpandedWidth) && parsedExpandedWidth >= MIN_SIDEBAR_WIDTH) {
            lastExpandedWidthRef.current = constrainSidebarWidth(parsedExpandedWidth);
          }
        }
        const savedWidth = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
        if (savedWidth === null) return;
        const parsedWidth = Number(savedWidth);
        if (!Number.isFinite(parsedWidth)) return;
        const restoredWidth = constrainSidebarWidth(parsedWidth);
        sidebarWidthRef.current = restoredWidth;
        if (restoredWidth >= MIN_SIDEBAR_WIDTH) {
          lastExpandedWidthRef.current = restoredWidth;
        }
        setSidebarWidth(restoredWidth);
      } catch {
        // The default width remains usable when browser storage is unavailable.
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function updateSidebarWidth(width: number) {
    const nextWidth = constrainSidebarWidth(width);
    sidebarWidthRef.current = nextWidth;
    if (nextWidth >= MIN_SIDEBAR_WIDTH) {
      lastExpandedWidthRef.current = nextWidth;
    }
    setSidebarWidth(nextWidth);
  }

  function rememberSidebarWidth() {
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarWidthRef.current));
      window.localStorage.setItem(
        SIDEBAR_EXPANDED_STORAGE_KEY,
        String(lastExpandedWidthRef.current),
      );
    } catch {
      // Resizing still works when browser storage is unavailable.
    }
  }

  function finishSidebarResize() {
    if (resizePointerRef.current === null) return;
    resizePointerRef.current = null;
    setIsResizingSidebar(false);
    rememberSidebarWidth();
  }

  function toggleSidebarWidth() {
    updateSidebarWidth(
      isSidebarCollapsed ? lastExpandedWidthRef.current : COLLAPSED_SIDEBAR_WIDTH,
    );
    rememberSidebarWidth();
  }

  function handleShellKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && isMobileNavOpen) {
      setIsMobileNavOpen(false);
    }
  }

  async function handleLogout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoggingOut(true);

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error("Unable to sign out right now. Please try again.");
      }

      window.location.replace("/login");
    } catch {
      notifyError("Unable to sign out right now. Please try again.");
      setIsLoggingOut(false);
    }
  }

  return (
    <div
      className={`app-shell${isSidebarCollapsed ? " sidebar-collapsed" : ""}${isResizingSidebar ? " app-shell-resizing" : ""}`}
      onKeyDown={handleShellKeyDown}
      style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
    >
      {isMobileNavOpen && (
        <button
          aria-label="Close navigation menu"
          className="mobile-nav-backdrop"
          onClick={() => setIsMobileNavOpen(false)}
          type="button"
        />
      )}

      <aside
        aria-label="Main navigation"
        className={`sidebar${isMobileNavOpen ? " sidebar-open" : ""}`}
        id="main-navigation"
        onKeyDown={(event) => {
          if (!isMobileNavOpen || event.key !== "Tab") return;
          const controls = Array.from(
            event.currentTarget.querySelectorAll<HTMLElement>(
              'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ),
          ).filter((control) => control.getClientRects().length > 0);
          if (controls.length === 0) return;
          const first = controls[0];
          const last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
        ref={sidebarRef}
      >
        <div className="sidebar-brand">
          <span aria-hidden="true" className="brand-mark">
            M
          </span>
          <span className="brand-wordmark">
            <strong>MAVIC</strong>
            <span>WORKSPACE OS</span>
          </span>
          <IconActionButton
            className="sidebar-close icon-button"
            icon={X}
            label="Close navigation menu"
            onClick={() => setIsMobileNavOpen(false)}
          />
        </div>

        <nav aria-label="Workspace sections" className="sidebar-nav">
          {visibleNavigationGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <p className="nav-group-label">{group.label}</p>
              <ul>
                {group.items.map((item) => {
                  if(item.href === "/leave") return <SidebarNavGroup key={item.href} label="Leave Management" icon={CalendarDays} items={[
                    {label:"Requests & Approvals",icon:CalendarDays,href:"/leave"},
                    {label:"Leave Balances",icon:UsersRound,href:"/leave/balances"},
                    ...(canAccessWorkspaceArea(role,"leave-settings",grantedPermissionKeys)?[{label:"Leave Settings",icon:Settings,href:"/leave/settings"}]:[]),
                    {label:"Reports & Analytics",icon:ChartNoAxesCombined,href:"/leave/reports"},
                  ].filter(entry=>{const area=workspaceAreaForPath(entry.href);const key=area?permissionKeyForPath(entry.href,area):undefined;return !key||!deniedPermissionKeys.includes(key);})} pathname={pathname} compact={isSidebarCollapsed && !isMobileNavOpen} onNavigate={()=>setIsMobileNavOpen(false)}/>;
                  const profileHref = role === "SUPER_ADMIN" ? "/my-profile" : "/me";
                  const parentHref = item.href === "/me/security" ? profileHref
                    : item.href === "/system/password-reset-requests" ? "/system/users" : undefined;
                  if (parentHref && group.items.some(entry => entry.href === parentHref)) return null;
                  const childHref = item.href === profileHref ? "/me/security"
                    : item.href === "/system/users" ? "/system/password-reset-requests" : undefined;
                  const child = group.items.find(entry => entry.href === childHref);
                  if (item.href && child?.href) return <SidebarNavGroup
                    key={item.label} label={item.label} icon={item.icon}
                    items={[{ ...item, label: item.href === profileHref ? "Profile details" : "Manage accounts", href: item.href }, ...(item.href===profileHref?[{label:'Official Business',icon:CalendarDays,href:'/attendance/official-business'}]:[]), { ...child, href: child.href }].filter(entry=>{const area=workspaceAreaForPath(entry.href!);const key=area?permissionKeyForPath(entry.href!,area):undefined;return !key||!deniedPermissionKeys.includes(key);})}
                    pathname={pathname} compact={isSidebarCollapsed && !isMobileNavOpen}
                    onNavigate={() => setIsMobileNavOpen(false)}
                  />;
                  return (
                  <SidebarNavItem
                    key={item.label}
                    active={Boolean(item.href && (
                      item.href === pathname ||
                      (item.href !== "/" && pathname.startsWith(`${item.href}/`)) ||
                      (role === "SUPER_ADMIN" && item.href === "/my-profile" && pathname === "/me")
                    ))}
                    compact={isSidebarCollapsed && !isMobileNavOpen}
                    current={Boolean(item.href && (
                      item.href === pathname ||
                      (role === "SUPER_ADMIN" && item.href === "/my-profile" && pathname === "/me")
                    ))}
                    href={item.href}
                    icon={item.icon}
                    label={item.label}
                    onNavigate={() => setIsMobileNavOpen(false)}
                  />
                );})}
              </ul>
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <span className="workspace-status-dot" />
          <span>
            <strong>Overview workspace</strong>
            <small>Centralized management</small>
          </span>
        </div>
      </aside>

      <button
        aria-controls="main-navigation"
        aria-label="Resize sidebar"
        aria-orientation="vertical"
        aria-valuemax={MAX_SIDEBAR_WIDTH}
        aria-valuemin={COLLAPSED_SIDEBAR_WIDTH}
        aria-valuenow={sidebarWidth}
        aria-valuetext={isSidebarCollapsed ? "Icons only" : `${sidebarWidth} pixels wide`}
        className="sidebar-resize-handle"
        onKeyDown={(event) => {
          let nextWidth: number;
          switch (event.key) {
            case "ArrowLeft":
              nextWidth = sidebarWidthRef.current <= MIN_SIDEBAR_WIDTH
                ? COLLAPSED_SIDEBAR_WIDTH
                : sidebarWidthRef.current - 16;
              break;
            case "ArrowRight":
              nextWidth = isSidebarCollapsed
                ? MIN_SIDEBAR_WIDTH
                : sidebarWidthRef.current + 16;
              break;
            case "Home":
              nextWidth = COLLAPSED_SIDEBAR_WIDTH;
              break;
            case "End":
              nextWidth = MAX_SIDEBAR_WIDTH;
              break;
            default:
              return;
          }
          event.preventDefault();
          event.stopPropagation();
          updateSidebarWidth(nextWidth);
          rememberSidebarWidth();
        }}
        onLostPointerCapture={finishSidebarResize}
        onPointerCancel={finishSidebarResize}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          resizePointerRef.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          setIsResizingSidebar(true);
        }}
        onPointerMove={(event) => {
          if (resizePointerRef.current !== event.pointerId) return;
          updateSidebarWidth(event.clientX);
        }}
        onPointerUp={(event) => {
          if (resizePointerRef.current !== event.pointerId) return;
          finishSidebarResize();
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }}
        role="separator"
        type="button"
      />

      <div className="app-main">
        <header className="topbar">
          <div className="topbar-leading">
            <IconActionButton
              aria-controls="main-navigation"
              aria-expanded={isMobileNavOpen}
              className="mobile-menu-button icon-button"
              icon={isMobileNavOpen ? X : Menu}
              label={isMobileNavOpen ? "Close navigation" : "Open navigation"}
              onClick={() => setIsMobileNavOpen((open) => !open)}
              ref={menuButtonRef}
            />
            <IconActionButton
              aria-controls="main-navigation"
              aria-pressed={isSidebarCollapsed}
              className="sidebar-toggle-button"
              icon={isSidebarCollapsed ? PanelLeftOpen : PanelLeftClose}
              label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              onClick={toggleSidebarWidth}
            />
            <div aria-label="Breadcrumb" className="breadcrumbs">
              <span>Mavic</span>
              <ChevronRight aria-hidden="true" size={14} />
              <span aria-current="page">
                {currentItem?.label ?? "Workspace"}
              </span>
            </div>
          </div>

          <div className="topbar-actions">
            <FullscreenButton />
            <WorkspaceNotifications canReviewResets={role === "SUPER_ADMIN" || role === "IT_ADMIN"} />
            <IconActionButton
              className="sign-out-button"
              aria-haspopup="dialog"
              aria-expanded={isLogoutDialogOpen}
              aria-controls={isLogoutDialogOpen ? "logout-confirmation-dialog" : undefined}
              aria-busy={isLoggingOut}
              disabled={isLoggingOut}
              showLabel
              icon={LogOut}
              label="Sign out"
              onClick={() => {
                setIsLogoutDialogOpen(true);
              }}
              ref={logoutButtonRef}
            />
          </div>
        </header>

        <main className="main-content">
          <WorkspaceRoleProvider role={role}>{children}</WorkspaceRoleProvider>
        </main>
      </div>

      {isLogoutDialogOpen && (
        <Modal
          aria-describedby="logout-dialog-description"
          id="logout-confirmation-dialog"
          presentation="center"
            aria-labelledby="logout-dialog-title"
          className="logout-modal"
          busy={isLoggingOut}
          initialFocusRef={logoutCancelButtonRef}
          onClose={() => setIsLogoutDialogOpen(false)}
        >
            <div className="logout-modal-heading">
              <span className="logout-modal-icon" aria-hidden="true">
                <LogOut size={18} />
              </span>
              <div>
                <h2 id="logout-dialog-title">Sign out of Mavic?</h2>
                <p id="logout-dialog-description">
                  You will need to sign in again to access your workspace.
                </p>
              </div>
            </div>
            <form className="logout-modal-actions" onSubmit={handleLogout}>
              <button
                className="logout-cancel-button"
                disabled={isLoggingOut}
                onClick={() => {
                  setIsLogoutDialogOpen(false);
                }}
                ref={logoutCancelButtonRef}
                type="button"
              >
                Cancel
              </button>
              <button
                className="logout-confirm-button"
                disabled={isLoggingOut}
                type="submit"
              >
                {isLoggingOut ? "Signing out..." : "Sign out"}
              </button>
            </form>
        </Modal>
      )}
    </div>
  );
}
