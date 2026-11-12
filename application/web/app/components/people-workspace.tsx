"use client";
import { EmployeeWorkBranches } from "./employee-work-branches";
import { loadActiveBranches, loadWorkspaceBranchAccess } from "../lib/branch-access";
import { PageHeading, PageHeader } from "./page-heading";
import {
  AccountDirectoryCards,
  AccountDirectorySkeleton,
  AccountManagementAction,
  AccountManagementActions,
} from "./account-directory";
import directory from "./admin-directory.module.css";
import { EmployeeEmergencyContact } from "./employee-emergency-contact";
import { PersonAvatar } from "./person-avatar";
import { EmployeeProfileTabs } from "./employee-profile-tabs";
import profileTabs from "./employee-profile-tabs.module.css";
import { EmployeeIncidentHistory } from "./employee-incident-history";
import { RealtimeQueryProvider } from "./realtime-query-provider";

import {
  ArrowLeft,
  Camera,
  ChevronRight,
  CircleAlert,
  RefreshCw,
  LayoutGrid,
  List,
  Clock3,
  FileText,
  Archive,
  KeyRound,
  LoaderCircle,
  MapPin,
  Pencil,
  Plus,
  Power,
  Search,
  ShieldCheck,
  Trash2,
  type LucideIcon,
  UsersRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import {
  QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  roleLabel,
  type WorkspaceAccount,
  type WorkspaceEmployee,
} from "../data/people";
import EmployeeHrProfileCard from "./employee-hr-profile-card";
import {
  EmployeeFileFacts,
  employeeFileSectionMeta,
} from "./employee-file-presentation";
import { AdminBranchAccessDialog } from "./admin-branch-access-dialog";
import { AccountBranchDialog } from "./account-branch-dialog";
import { Modal } from "./ui/modal";
import { useConfirmation } from "./ui/confirmation-provider";
import { IconActionButton } from "./icon-action-button";
import { paginateTableRows, TablePagination } from "./table-pagination";
import { RequiredMark } from "./required-mark";
import EmployeeAssignmentHistoryCard from "./employee-assignment-history-card";
import EmployeeWorkScheduleCard from "./employee-work-schedule-card";
import { EmployeeEmploymentFields } from "./employee-employment-fields";
import {
  EMPLOYEE_STATUS_OPTIONS,
  employmentTypeLabel,
} from "./employee-employment-options";
import EmployeeDocumentsSection from "./employee-documents-section";
import { normalizeAttendanceSchedule } from "../attendance/attendance-schedule";
import {
  buildEmployeeCreatePayload,
  eligibleEmployeeManagers,
  employeeBranchKey,
  employeeWorkBranchPayload,
  filterDirectoryEmployees,
} from "./employee-directory-utils";
import styles from "./people-workspace.module.css";
import { PortalLoading } from "./portal-presentation";
import {
  AccountAccessSummary,
  AccountAccessTable,
  AccountTableSkeleton,
} from "./account-access-presentation";
import workspaceTheme from "./ui/workspace-theme.module.css";
import {
  EmployeeDirectorySummary,
  EmployeeDirectoryTable,
  EmployeeDirectoryTableSkeleton,
} from "./employee-directory-presentation";
import { EmployeeProfileLoading } from "./page-loading";
import { normalizeStatusPillValue } from "./status-pill";
import {
  AccountCredentialNotice,
  AccountCredentialStatus,
  CredentialRegenerationDialog,
} from "./account-credential-email";
import { useWorkspaceRole } from "./workspace-role-context";
import {
  shouldLoadOwnEmployee,
  type OwnProfileLink,
} from "../lib/own-profile-link";
import { notifyError, notifySuccess } from "../lib/notifications";
import {
  CARD_TABLE_VIEWS,
  useRememberedView,
} from "../lib/use-remembered-view";
import { fetchBranchDepartments } from "../branches/services/branch-service";
import type {
  EmployeeApiRecord,
  PeopleWorkspaceProps,
  UserApiRecord,
} from "./people-workspace-types";
import {
  peoplePageCopy,
  toWorkspaceAccount,
  toWorkspaceEmployee,
  mergeWorkspaceEmployee,
  hrRequest,
  uploadEmployeeProfilePicture,
  usersRequest,
} from "./people-workspace-services";

const profilePictureTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxProfilePictureBytes = 5 * 1024 * 1024;

function EmployeeAvatar({
  employee,
  className,
  size,
}: {
  employee: WorkspaceEmployee;
  className: string;
  size: number;
}) {
  return (
    <PersonAvatar
      className={className}
      employeeId={employee.id}
      name={employee.name}
      profilePictureUpdatedAt={employee.profilePictureUpdatedAt}
      size={size}
    />
  );
}

function ModalFieldLabel({
  children,
  required = false,
}: {
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <span className={`${styles.fieldLabel} form-field-label`}>
      {children}
      {required && <RequiredMark />}
    </span>
  );
}

type EmployeeProfileSectionId =
  | "work-information"
  | "work-schedule"
  | "incident-history"
  | "assignment-history"
  | "emergency-contact"
  | "documents";
type EmployeeProfileSection = {
  id: EmployeeProfileSectionId;
  label: string;
};
type PortalSectionId =
  | "profile"
  | "work-schedule"
  | "emergency-contact"
  | "incident-history"
  | "assignment-history"
  | "payslips"
  | "documents";

const portalSections: { id: PortalSectionId; label: string }[] = [
  { id: "profile", label: "Employment & HR Profile" },
  { id: "work-schedule", label: "Work schedule" },
  { id: "documents", label: "Documents" },
  { id: "assignment-history", label: "Assignment history" },
  { id: "incident-history", label: "Incident / discipline history" },
  { id: "payslips", label: "Payslips" },
];

export function portalSectionFromSearchParam(
  value: string | null,
): PortalSectionId {
  if (value === "emergency-contact") return "profile";
  return portalSections.find((item) => item.id === value)?.id ?? "profile";
}

const emergencyRelationshipChoices = [
  "Spouse",
  "Partner",
  "Parent",
  "Mother",
  "Father",
  "Child",
  "Son",
  "Daughter",
  "Sibling",
  "Brother",
  "Sister",
  "Grandparent",
  "Grandchild",
  "Guardian",
  "Other relative",
  "Friend",
  "Colleague",
  "Other",
];

const restrictedEmployeeProfileSections: EmployeeProfileSection[] = [
  { id: "emergency-contact", label: "Emergency contact" },
  { id: "documents", label: "Documents" },
];

function StatusPill({ value }: { value: string | null | undefined }) {
  const normalized = normalizeStatusPillValue(value);
  const label = value ?? "UNKNOWN";
  return (
    <span className={`${styles.statusPill} ${styles[`status-${normalized}`]}`}>
      {label.replaceAll("_", " ")}
    </span>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  tone: "red" | "green" | "amber" | "gray";
}) {
  return (
    <article className={styles.metric}>
      <div className={styles.metricTop}>
        <span className={`${styles.metricIcon} ${styles[`tone-${tone}`]}`}>
          <Icon aria-hidden="true" size={17} />
        </span>
        <span>{label}</span>
      </div>
      <strong className={styles.metricValue}>{value}</strong>
      <span className={styles.metricDetail}>{detail}</span>
    </article>
  );
}

function SectionTitle({ title, aside }: { title: string; aside?: ReactNode }) {
  return (
    <div className={styles.sectionTitle}>
      <h2>{title}</h2>
      {aside}
    </div>
  );
}

export default function PeopleWorkspace({
  mode,
  employeeId,
}: PeopleWorkspaceProps) {
  const copy = peoplePageCopy[mode];
  const isEmployeeWorkspace =
    mode === "employees" || mode === "employee-profile";
  const isModernWorkspace =
    isEmployeeWorkspace || mode === "users" || mode === "me";
  const liveDataMode = [
    "hr",
    "employees",
    "employee-profile",
    "me",
    "users",
  ].includes(mode);

  return (
    <div
      className={[
        styles.page,
        isModernWorkspace
          ? `${workspaceTheme.scope} ${styles.employeeWorkspace}`
          : "",
        mode === "users" ? styles.userWorkspace : "",
        mode === "me" ? `${styles.portalPage} ${styles.employeeFilePage}` : "",
        mode === "employee-profile" ? styles.employeeFilePage : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <PageHeader className={styles.pageHeader}>
        <div>
          {isEmployeeWorkspace && (
            <p className={styles.employeeEyebrow}>
              {mode === "employees"
                ? "PEOPLE / EMPLOYEE DIRECTORY"
                : "PEOPLE / EMPLOYEE 201 FILE"}
            </p>
          )}
          {mode === "hr" && (
            <p className={styles.employeeEyebrow}>WORKFORCE / HR MANAGEMENT</p>
          )}
          {mode === "users" && (
            <p className={styles.employeeEyebrow}>
              ADMINISTRATION / USER ACCESS
            </p>
          )}
          {mode === "me" && (
            <p className={styles.employeeEyebrow}>MY ACCOUNT / MY PORTAL</p>
          )}
          <PageHeading>{copy.title}</PageHeading>
          <p className={styles.description}>{copy.description}</p>
        </div>
        <span className={styles.previewBadge}>
          <span aria-hidden="true" />{" "}
          {mode === "me"
            ? "Employee self-service"
            : mode === "users"
              ? "Account administration"
              : isEmployeeWorkspace
                ? "Employee records"
                : liveDataMode
                  ? "Live data"
                  : "Preview data"}
        </span>
      </PageHeader>

      {!liveDataMode && (
        <div className={styles.previewNotice} role="note">
          <CircleAlert aria-hidden="true" size={16} />
          <p>
            This workspace uses sample records. Changes are temporary and are
            not saved to the API or database.
          </p>
        </div>
      )}

      {mode === "hr" && <HrOverview />}
      {mode === "employees" && <EmployeeDirectory />}
      {mode === "employee-profile" && (
        <EmployeeProfile
          employeeId={employeeId ?? ""}
          onNotice={notifySuccess}
        />
      )}
      {mode === "me" && <EmployeePortal onNotice={notifySuccess} />}
      {mode === "users" && <UserAccess onNotice={notifySuccess} />}
    </div>
  );
}

function HrOverview() {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <RealtimeQueryProvider client={queryClient}>
      <HrOverviewContent />
    </RealtimeQueryProvider>
  );
}

function HrOverviewContent() {
  const role = useWorkspaceRole();
  const employeesQuery = useQuery({
    queryKey: ["employees", "hr-overview"],
    queryFn: async () => {
      const records = await hrRequest<EmployeeApiRecord[]>("employees");
      return records.map(toWorkspaceEmployee);
    },
  });
  const employees = employeesQuery.data ?? [];
  const activeEmployees = employees.filter(
    (employee) => employee.status === "ACTIVE",
  );

  return (
    <>
      <section aria-label="HR summary" className={styles.metricGrid}>
        <Metric
          icon={UsersRound}
          label="Team members"
          value={
            employeesQuery.isLoading
              ? "Loading?"
              : employeesQuery.isError
                ? "Unavailable"
                : String(employees.length)
          }
          detail="Visible within your assigned scope"
          tone="red"
        />
        <Metric
          icon={Clock3}
          label="Active employees"
          value={
            employeesQuery.isLoading
              ? "Loading?"
              : employeesQuery.isError
                ? "Unavailable"
                : String(activeEmployees.length)
          }
          detail="Active employee records in scope"
          tone="green"
        />
      </section>

      <div className={styles.contentGrid}>
        <section className={styles.panel}>
          <SectionTitle title="People at a glance" />
          {employeesQuery.isLoading && (
            <p className={styles.emptyState} role="status">
              Loading employee records?
            </p>
          )}
          {employeesQuery.isError && (
            <div className={styles.formError} role="alert">
              <p>Employee records could not be loaded.</p>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => void employeesQuery.refetch()}
              >
                Retry employee records
              </button>
            </div>
          )}
          {employees.length === 0 &&
            !employeesQuery.isLoading &&
            !employeesQuery.isError && (
              <p className={styles.emptyState}>
                No employee records in this scope.
              </p>
            )}
          <div className={styles.teamList}>
            {activeEmployees.slice(0, 3).map((employee) => (
              <Link
                className={styles.teamRow}
                href={`/employees/${employee.id}`}
                key={employee.id}
              >
                <div className={styles.avatar}>
                  {employee.name
                    .split(" ")
                    .map((part) => part[0])
                    .join("")}
                </div>
                <span className={styles.teamIdentity}>
                  <strong>{employee.name}</strong>
                  <small>
                    {employee.position} · {employee.branch}
                  </small>
                </span>
                <ChevronRight aria-hidden="true" size={16} />
              </Link>
            ))}
          </div>
          <div className={styles.panelFooterLinks}>
            <Link className={styles.textLink} href="/employees">
              View employee directory{" "}
              <ChevronRight aria-hidden="true" size={14} />
            </Link>
            {role === "SUPER_ADMIN" && (
              <Link className={styles.textLink} href="/system/users">
                Review user access <ChevronRight aria-hidden="true" size={14} />
              </Link>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

function EmployeeDirectory() {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <RealtimeQueryProvider client={queryClient}>
      <EmployeeDirectoryContent />
    </RealtimeQueryProvider>
  );
}

function EmployeeDirectoryContent() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [employmentFilter, setEmploymentFilter] = useState("");
  const [status, setStatus] = useState("ALL");
  const [tablePage, setTablePage] = useState(1);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [selectedEmployeeBranchId, setSelectedEmployeeBranchId] = useState("");
  const directoryAccess = useQuery({ queryKey: ["directory-branch-access"], queryFn: loadWorkspaceBranchAccess });
  const employeesQuery = useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const payload = await hrRequest<EmployeeApiRecord[]>("employees");
      return payload.map(toWorkspaceEmployee);
    },
  });
  const allEmployees = employeesQuery.data ?? [];
  const branchesQuery = useQuery({
    queryKey: ["branches", "active"],
    queryFn: loadActiveBranches,
  });
  const employeeBranchId =
    selectedEmployeeBranchId || branchesQuery.data?.[0]?.id || "";
  const [useCustomWorkSchedule, setUseCustomWorkSchedule] = useState(false);
  const branchScheduleQuery = useQuery({
    queryKey: ["attendance-schedule", "employee-create", employeeBranchId],
    queryFn: async () =>
      normalizeAttendanceSchedule(
        await hrRequest<unknown>(
          "attendance",
          `/schedules/${encodeURIComponent(employeeBranchId)}`,
        ),
      ),
    enabled: Boolean(isCreateOpen && employeeBranchId),
  });
  const requiresCustomWorkSchedule = Boolean(
    employeeBranchId &&
    !branchScheduleQuery.isLoading &&
    !branchScheduleQuery.isError &&
    branchScheduleQuery.data === null,
  );
  const showCustomWorkSchedule =
    useCustomWorkSchedule || requiresCustomWorkSchedule;
  const employeeDepartmentsQuery = useQuery({
    queryKey: ["branches", employeeBranchId, "departments"],
    queryFn: () => fetchBranchDepartments(employeeBranchId),
    enabled: Boolean(isCreateOpen && employeeBranchId),
  });
  const queryClient = useQueryClient();
  const createMutation = useMutation({
    mutationFn: async ({
      payload,
      profilePicture,
    }: {
      payload: ReturnType<typeof buildEmployeeCreatePayload>;
      profilePicture: File | null;
    }) => {
      const employee = await hrRequest<EmployeeApiRecord>("employees", "", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (!profilePicture) return { employee };
      try {
        await uploadEmployeeProfilePicture(employee.id, profilePicture);
        return { employee };
      } catch (error) {
        return {
          employee,
          profilePictureError:
            error instanceof Error ? error.message : "Upload failed.",
        };
      }
    },
    onSuccess: async ({ employee, profilePictureError }) => {
      await queryClient.invalidateQueries({ queryKey: ["employees"] });
      setIsCreateOpen(false);
      setCreateError(null);
      if (profilePictureError) {
        notifyError(
          `${employee.name} was created, but the profile picture could not be uploaded. Open the employee profile to retry. ${profilePictureError}`,
        );
      } else {
        notifySuccess(`${employee.name} was created successfully.`);
      }
      router.push(
        `/employees/${encodeURIComponent(employee.id)}?section=documents`,
      );
    },
    onError: (error: Error) => notifyError(error.message),
  });
  const branchOptions = [...new Map([
    ...(directoryAccess.data?.branches ?? branchesQuery.data ?? []).map(branch => [`id:${branch.id}`, branch.name] as [string, string]),
    ...allEmployees.map(employee => [employeeBranchKey(employee), employee.branch] as [string, string]),
  ]).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const departmentOptions = [...new Set(allEmployees.map((employee) => employee.department).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const employmentOptions = [...new Set(allEmployees.map((employee) => employee.employmentType))].sort((a, b) => employmentTypeLabel(a).localeCompare(employmentTypeLabel(b)));
  const employees = filterDirectoryEmployees(allEmployees, {
    query, branch: branchFilter, department: departmentFilter,
    employment: employmentFilter, status,
  });
  const employeePage = paginateTableRows(employees, tablePage);

  function changeDirectoryBranch(value: string) {
    setBranchFilter(value);
    setTablePage(1);
  }

  function submitEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    if (showCustomWorkSchedule && formData.getAll("workDays").length === 0) {
      setCreateError("Select at least one work day for the employee schedule.");
      return;
    }
    const values: Record<string, FormDataEntryValue | FormDataEntryValue[]> =
      Object.fromEntries(formData);
    if (showCustomWorkSchedule) values.workDays = formData.getAll("workDays");
    values.workBranchIds = formData.getAll("workBranchIds");
    const selectedFile = values.profilePicture;
    const profilePicture =
      selectedFile instanceof File && selectedFile.size > 0
        ? selectedFile
        : null;
    if (
      profilePicture &&
      (!profilePictureTypes.has(profilePicture.type) ||
        profilePicture.size > maxProfilePictureBytes)
    ) {
      setCreateError("Choose a PNG, JPEG, or WebP image up to 5 MB.");
      return;
    }
    createMutation.mutate({
      payload: buildEmployeeCreatePayload(values),
      profilePicture,
    });
  }

  return (
    <>
      {!employeesQuery.isError && (
        <EmployeeDirectorySummary
          employees={allEmployees}
          loading={employeesQuery.isLoading}
        />
      )}
      <section className={styles.panel}>
        <div className={`${styles.tableToolbar} ${styles.directoryToolbar}`}>
          <label className={styles.searchBox}>
            <Search aria-hidden="true" size={16} />
            <span className={styles.screenReaderOnly}>Search employees</span>
            <input
              onChange={(event) => {
                setQuery(event.target.value);
                setTablePage(1);
              }}
              placeholder="Search name, ID, department"
              value={query}
            />
          </label>
          <div className={styles.directoryFilters}>
          <label className={styles.filterLabel}>
            <span>Branch</span>
            <select value={branchFilter} disabled={directoryAccess.isPending} onChange={(event) => void changeDirectoryBranch(event.target.value)}>
              <option value="">All authorized branches</option>
              {branchOptions.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
            </select>
          </label>
          <label className={styles.filterLabel}>
            <span>Department</span>
            <select value={departmentFilter} onChange={(event) => { setDepartmentFilter(event.target.value); setTablePage(1); }}>
              <option value="">All departments</option>
              {departmentOptions.map((department) => <option key={department} value={department}>{department}</option>)}
            </select>
          </label>
          <label className={styles.filterLabel}>
            <span>Employment</span>
            <select value={employmentFilter} onChange={(event) => { setEmploymentFilter(event.target.value); setTablePage(1); }}>
              <option value="">All employment types</option>
              {employmentOptions.map((type) => <option key={type} value={type}>{employmentTypeLabel(type)}</option>)}
            </select>
          </label>
          <label className={styles.filterLabel}>
            <span>Status</span>
            <select
              onChange={(event) => {
                setStatus(event.target.value);
                setTablePage(1);
              }}
              value={status}
            >
              <option value="ALL">All statuses</option>
              {EMPLOYEE_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          </div>
          <span className={styles.resultCount} aria-live="polite">
            {employeesQuery.isLoading
              ? "Loading people…"
              : `${employees.length} people`}
          </span>
          <button
            className={styles.primaryButton}
            onClick={() => {
              setCreateError(null);
              setIsCreateOpen(true);
            }}
            type="button"
          >
            <Plus aria-hidden="true" size={15} /> Create employee
          </button>
        </div>
        {employeesQuery.error instanceof Error && (
          <div className={styles.queryError} role="alert">
            {employeesQuery.error.message}
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => void employeesQuery.refetch()}
            >
              Try again
            </button>
          </div>
        )}
        {employeesQuery.isLoading ? (
          <EmployeeDirectoryTableSkeleton />
        ) : !employeesQuery.isError ? (
          <EmployeeDirectoryTable
            employees={employeePage.items}
            renderAvatar={(employee) => (
              <EmployeeAvatar
                className={styles.avatar}
                employee={employee}
                size={40}
              />
            )}
            renderStatus={(employee) => <StatusPill value={employee.status} />}
          />
        ) : null}
        {!employeesQuery.isLoading && !employeesQuery.error && (
          <TablePagination
            label="employees"
            onPageChange={setTablePage}
            page={employeePage.page}
            totalItems={employees.length}
          />
        )}
        {!employeesQuery.isLoading &&
          !employeesQuery.error &&
          employees.length === 0 && (
            <div className={styles.emptyStateLarge}>
              <UsersRound size={28} aria-hidden="true" />
              <h2>
                {allEmployees.length
                  ? "No matching employees"
                  : "No employee records yet"}
              </h2>
              <p>
                {allEmployees.length
                  ? "Try another search or filter."
                  : "Create an employee to start building your directory."}
              </p>
              {allEmployees.length > 0 && (
                <button
                  className={styles.secondaryButton}
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setBranchFilter("");
                    setDepartmentFilter("");
                    setEmploymentFilter("");
                    setStatus("ALL");
                    setTablePage(1);
                  }}
                >
                  Clear filters
                </button>
              )}
            </div>
          )}
        {isCreateOpen && (
          <Modal
            aria-labelledby="create-employee-title"
            className={`${styles.modal} ${styles.createEmployeeModal}`}
            onClose={() => setIsCreateOpen(false)}
            busy={createMutation.isPending}
          >
            <div className={styles.modalHeader}>
              <div>
                <h2 id="create-employee-title">Create employee</h2>
              </div>
              <IconActionButton
                icon={X}
                label="Close"
                className={styles.closeButton}
                disabled={createMutation.isPending}
                onClick={() => setIsCreateOpen(false)}
                type="button"
              />
            </div>
            <form className={styles.accountForm} onSubmit={submitEmployee}>
              <fieldset className={styles.formSection}>
                <legend>Personal information</legend>
                <div className={styles.formSectionFields}>
                  <label>
                    <span className={styles.fieldLabel}>
                      First name <RequiredMark />
                    </span>
                    <input name="firstName" required maxLength={100} />
                  </label>
                  <label>
                    <span className={styles.fieldLabel}>
                      Last name <RequiredMark />
                    </span>
                    <input name="lastName" required maxLength={100} />
                  </label>
                  <label>
                    <span className={styles.fieldLabel}>Middle name </span>
                    <input name="middleName" maxLength={100} />
                  </label>
                  <label>
                    <span className={styles.fieldLabel}>Suffix </span>
                    <input
                      name="suffix"
                      maxLength={30}
                      placeholder="e.g. Jr."
                    />
                  </label>
                  <label className={styles.createEmployeeFullField}>
                    <span className={styles.fieldLabel}>
                      Work email <RequiredMark />
                    </span>
                    <input name="email" required type="email" />
                  </label>
                  <label>
                    <span className={styles.fieldLabel}>Phone </span>
                    <input name="phone" type="tel" maxLength={30} />
                  </label>
                  <label>
                    <span className={styles.fieldLabel}>Profile picture </span>
                    <input
                      accept="image/png,image/jpeg,image/webp"
                      name="profilePicture"
                      type="file"
                    />
                    <small>PNG, JPEG, or WebP. Maximum size 5 MB.</small>
                  </label>
                </div>
              </fieldset>
              <fieldset className={styles.formSection}>
                <legend>Work assignment</legend>
                <EmployeeWorkBranches primaryBranchId={employeeBranchId} />
                <div className={styles.formSectionFields}>
                  <label>
                    <span className={styles.fieldLabel}>
                      Primary branch <RequiredMark />
                    </span>
                    <select
                      disabled={
                        branchesQuery.isLoading || branchesQuery.isError
                      }
                      name="branchId"
                      onChange={(event) =>
                        setSelectedEmployeeBranchId(event.target.value)
                      }
                      required
                      value={employeeBranchId}
                    >
                      {!employeeBranchId && (
                        <option value="">Select a branch</option>
                      )}
                      {(branchesQuery.data ?? []).map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                    {branchesQuery.isLoading && (
                      <small role="status">Loading branches…</small>
                    )}
                    {branchesQuery.isError && (
                      <small role="alert">
                        {branchesQuery.error instanceof Error
                          ? branchesQuery.error.message
                          : "Unable to load branches."}
                        <button
                          onClick={() => void branchesQuery.refetch()}
                          type="button"
                        >
                          Retry
                        </button>
                      </small>
                    )}
                    {!branchesQuery.isLoading &&
                      !branchesQuery.isError &&
                      !branchesQuery.data?.length && (
                        <small>No active branches are available.</small>
                      )}
                  </label>
                  <label>
                    <span className={styles.fieldLabel}>
                      Department <RequiredMark />
                    </span>
                    <select
                      key={employeeBranchId}
                      disabled={
                        !employeeBranchId ||
                        employeeDepartmentsQuery.isLoading ||
                        employeeDepartmentsQuery.isError ||
                        !employeeDepartmentsQuery.data?.length
                      }
                      name="department"
                      required
                    >
                      <option value="">Select a department</option>
                      {(employeeDepartmentsQuery.data ?? []).map(
                        (department) => (
                          <option key={department.id} value={department.name}>
                            {department.name}
                          </option>
                        ),
                      )}
                    </select>
                    {employeeDepartmentsQuery.isLoading && (
                      <small role="status">Loading departments…</small>
                    )}
                    {employeeDepartmentsQuery.isError && (
                      <small role="alert">
                        {employeeDepartmentsQuery.error instanceof Error
                          ? employeeDepartmentsQuery.error.message
                          : "Unable to load departments."}
                        <button
                          onClick={() =>
                            void employeeDepartmentsQuery.refetch()
                          }
                          type="button"
                        >
                          Retry
                        </button>
                      </small>
                    )}
                    {!employeeDepartmentsQuery.isLoading &&
                      !employeeDepartmentsQuery.isError &&
                      !employeeDepartmentsQuery.data?.length && (
                        <small>
                          No departments are configured for this branch.
                        </small>
                      )}
                  </label>
                  <label>
                    <span className={styles.fieldLabel}>
                      Position <RequiredMark />
                    </span>
                    <input name="position" required maxLength={150} />
                  </label>
                  <label>
                    <span className={styles.fieldLabel}>
                      Manager / supervisor{" "}
                    </span>
                    <select name="managerEmployeeId">
                      <option value="">No manager assigned</option>
                      {eligibleEmployeeManagers(allEmployees)
                        .filter(
                          (manager) => manager.branchId === employeeBranchId,
                        )
                        .map((manager) => (
                          <option key={manager.id} value={manager.id}>
                            {manager.name} · {manager.position}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
              </fieldset>
              <fieldset
                className={`${styles.formSection} ${styles.createEmployeeEmploymentSection}`}
              >
                <legend>Employment</legend>
                <div className={styles.formSectionFields}>
                  <EmployeeEmploymentFields
                    labelClassName={styles.fieldLabel}
                  />
                  <label>
                    <span className={styles.fieldLabel}>
                      Start date <RequiredMark />
                    </span>
                    <input name="startDate" required type="date" />
                  </label>
                  <label>
                    <span className={styles.fieldLabel}>
                      Status <RequiredMark />
                    </span>
                    <select defaultValue="ACTIVE" name="status" required>
                      {EMPLOYEE_STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </fieldset>
              <fieldset className={styles.formSection}>
                <legend>Work schedule</legend>
                <p className={styles.formHint}>
                  The selected or custom schedule takes effect on the employee
                  start date.
                </p>
                {!employeeBranchId && (
                  <p className={styles.formHint}>
                    Select a branch to load its attendance schedule.
                  </p>
                )}
                {branchScheduleQuery.isLoading && (
                  <p className={styles.formHint} role="status">
                    Loading branch schedule…
                  </p>
                )}
                {branchScheduleQuery.isError && (
                  <p className={styles.formError} role="alert">
                    {branchScheduleQuery.error.message}
                    <button
                      onClick={() => void branchScheduleQuery.refetch()}
                      type="button"
                    >
                      Retry
                    </button>
                  </p>
                )}
                {branchScheduleQuery.data && (
                  <div className={styles.branchScheduleSummary}>
                    <strong>Branch schedule</strong>
                    <span>
                      {branchScheduleQuery.data.shiftStart}–
                      {branchScheduleQuery.data.shiftEnd} ·{" "}
                      {branchScheduleQuery.data.timeZone}
                    </span>
                    <small>
                      {branchScheduleQuery.data.workDays
                        .map(
                          (day) =>
                            ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
                              day
                            ],
                        )
                        .join(", ")}
                    </small>
                    <div
                      className={styles.scheduleChoices}
                      role="radiogroup"
                      aria-label="Employee schedule"
                    >
                      <label className={styles.inlineChoice}>
                        <input
                          checked={!showCustomWorkSchedule}
                          name="scheduleMode"
                          value="branch"
                          onChange={() => setUseCustomWorkSchedule(false)}
                          type="radio"
                        />
                        Use this schedule for the employee
                      </label>
                      <label className={styles.inlineChoice}>
                        <input
                          checked={showCustomWorkSchedule}
                          name="scheduleMode"
                          value="custom"
                          onChange={() => setUseCustomWorkSchedule(true)}
                          type="radio"
                        />
                        Assign a different schedule
                      </label>
                    </div>
                  </div>
                )}
                {requiresCustomWorkSchedule && (
                  <p className={styles.formHint}>
                    No branch attendance schedule is configured. Assign an
                    employee schedule to continue.
                  </p>
                )}
                {showCustomWorkSchedule && (
                  <div className={styles.workScheduleFields}>
                    <input name="useCustomSchedule" type="hidden" value="on" />
                    <label>
                      <span>
                        Time zone <RequiredMark />
                      </span>
                      <input
                        maxLength={100}
                        name="timeZone"
                        placeholder="e.g. Asia/Manila"
                        required
                      />
                    </label>
                    <label>
                      <span>
                        Shift starts <RequiredMark />
                      </span>
                      <input name="shiftStart" required type="time" />
                    </label>
                    <label>
                      <span>
                        Shift ends <RequiredMark />
                      </span>
                      <input name="shiftEnd" required type="time" />
                    </label>
                    <label>
                      <span>
                        Break minutes <RequiredMark />
                      </span>
                      <input
                        max={720}
                        min={0}
                        name="breakMinutes"
                        required
                        type="number"
                      />
                    </label>
                    <label>
                      <span>
                        Grace minutes <RequiredMark />
                      </span>
                      <input
                        max={240}
                        min={0}
                        name="graceMinutes"
                        required
                        type="number"
                      />
                    </label>
                    <fieldset className={styles.workDaysFieldset}>
                      <legend>Work days</legend>
                      <div>
                        {[
                          { value: 1, label: "Mon" },
                          { value: 2, label: "Tue" },
                          { value: 3, label: "Wed" },
                          { value: 4, label: "Thu" },
                          { value: 5, label: "Fri" },
                          { value: 6, label: "Sat" },
                          { value: 0, label: "Sun" },
                        ].map((day) => (
                          <label key={day.value}>
                            <input
                              name="workDays"
                              type="checkbox"
                              value={day.value}
                            />{" "}
                            {day.label}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  </div>
                )}
              </fieldset>
              {createError && (
                <p className={styles.formError} role="alert">
                  {createError}
                </p>
              )}
              <div className={styles.modalActions}>
                <button
                  className={styles.secondaryButton}
                  disabled={createMutation.isPending}
                  onClick={() => setIsCreateOpen(false)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className={styles.primaryButton}
                  disabled={
                    createMutation.isPending ||
                    !branchesQuery.data?.length ||
                    !employeeDepartmentsQuery.data?.length ||
                    branchScheduleQuery.isLoading ||
                    branchScheduleQuery.isError
                  }
                  type="submit"
                >
                  {createMutation.isPending ? "Creating..." : "Create employee"}
                </button>
              </div>
            </form>
          </Modal>
        )}
      </section>
    </>
  );
}

function EmployeeProfile({
  employeeId,
  onNotice,
}: {
  employeeId: string;
  onNotice: (message: string) => void;
}) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <RealtimeQueryProvider client={queryClient}>
      <EmployeeProfileContent employeeId={employeeId} onNotice={onNotice} />
    </RealtimeQueryProvider>
  );
}

function EmployeeProfileContent({
  employeeId,
  onNotice,
}: {
  employeeId: string;
  onNotice: (message: string) => void;
}) {
  const role = useWorkspaceRole();
  const searchParams = useSearchParams();
  const canManageEmployees =
    role === "SUPER_ADMIN" || role === "HR_ADMIN" || role === "BRANCH_MANAGER";
  const canCreateUserAccounts = role === "SUPER_ADMIN" || role === "IT_ADMIN";
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [employeeEditorSection, setEmployeeEditorSection] = useState<
    "employee" | "hr-profile"
  >("employee");
  const [hasOpenedHrProfileEditor, setHasOpenedHrProfileEditor] =
    useState(false);
  const [hrProfileEditorStatus, setHrProfileEditorStatus] = useState({
    ready: false,
    saving: false,
  });
  const reportHrProfileEditorStatus = useCallback(
    (status: { ready: boolean; saving: boolean }) => {
      setHrProfileEditorStatus(status);
    },
    [],
  );
  function closeEmployeeEditor() {
    setIsEditing(false);
    setHasOpenedHrProfileEditor(false);
    setHrProfileEditorStatus({ ready: false, saving: false });
  }
  function selectEmployeeEditorSection(section: "employee" | "hr-profile") {
    setEmployeeEditorSection(section);
    if (section === "hr-profile") setHasOpenedHrProfileEditor(true);
  }
  const profilePictureInputRef = useRef<HTMLInputElement>(null);
  const [profilePictureError, setProfilePictureError] = useState<string | null>(
    null,
  );
  const [isEditingEmergencyContact, setIsEditingEmergencyContact] =
    useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [activeProfileSection, setActiveProfileSection] =
    useState<EmployeeProfileSectionId>(() =>
      searchParams.get("section") === "documents"
        ? "documents"
        : "work-information",
    );
  const employeeQuery = useQuery({
    queryKey: ["employee", employeeId],
    queryFn: async () => {
      const record = await hrRequest<EmployeeApiRecord | undefined>(
        "employees",
        `/${employeeId}`,
      );
      return record ? toWorkspaceEmployee(record) : undefined;
    },
    enabled: Boolean(employeeId),
  });
  const employee = employeeQuery.data;
  const employeeDepartmentsQuery = useQuery({
    queryKey: ["branches", employee?.branchId, "departments"],
    queryFn: () =>
      employee?.branchId
        ? fetchBranchDepartments(employee.branchId)
        : Promise.resolve([]),
    enabled: Boolean(employee?.branchId && isEditing),
  });
  const supervisorOptionsQuery = useQuery({
    queryKey: ["employee-supervisor-options", employee?.branchId],
    queryFn: async () => {
      const records = await hrRequest<EmployeeApiRecord[]>("employees");
      return records.map(toWorkspaceEmployee);
    },
    enabled: Boolean(employee?.branchId && canManageEmployees),
  });
  const updateMutation = useMutation({
    mutationFn: (values: Record<string, FormDataEntryValue | string[] | boolean | undefined>) =>
      hrRequest<EmployeeApiRecord>("employees", `/${employeeId}`, {
        method: "PATCH",
        body: JSON.stringify(values),
      }),
    onSuccess: async (updatedEmployee) => {
      const employeeQueryKey = ["employee", employeeId] as const;
      const currentEmployee =
        queryClient.getQueryData<WorkspaceEmployee>(employeeQueryKey);
      queryClient.setQueryData(
        employeeQueryKey,
        currentEmployee
          ? mergeWorkspaceEmployee(currentEmployee, updatedEmployee)
          : toWorkspaceEmployee(updatedEmployee),
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: employeeQueryKey }),
        queryClient.invalidateQueries({ queryKey: ["employees"] }),
        queryClient.invalidateQueries({ queryKey: ["users"] }),
        queryClient.invalidateQueries({
          queryKey: ["employee-assignment-history", employeeId],
        }),
      ]);
      onNotice("Employee profile updated.");
    },
    onError: (error: Error) => notifyError(error.message),
  });
  const emergencyContactMutation = useMutation({
    mutationFn: (values: Record<string, FormDataEntryValue | string[] | boolean | undefined>) =>
      hrRequest<EmployeeApiRecord>(
        "employees",
        `/${employeeId}/emergency-contact`,
        {
          method: "PATCH",
          body: JSON.stringify(values),
        },
      ),
    onSuccess: async (updated) => {
      const employeeQueryKey = ["employee", employeeId] as const;
      const currentEmployee =
        queryClient.getQueryData<WorkspaceEmployee>(employeeQueryKey);
      queryClient.setQueryData(
        employeeQueryKey,
        currentEmployee
          ? mergeWorkspaceEmployee(currentEmployee, updated)
          : toWorkspaceEmployee(updated),
      );
      await queryClient.invalidateQueries({ queryKey: employeeQueryKey });
      setIsEditingEmergencyContact(false);
      onNotice("Emergency contact updated successfully.");
    },
    onError: (error: Error) => notifyError(error.message),
  });
  const deleteMutation = useMutation({
    mutationFn: () =>
      hrRequest(`employees`, `/${employeeId}`, { method: "DELETE" }),
    onSuccess: () => {
      onNotice("Employee deleted.");
      router.push("/employees");
    },
    onError: (error: Error) => notifyError(error.message),
  });
  const profilePictureMutation = useMutation({
    mutationFn: (file: File) => uploadEmployeeProfilePicture(employeeId, file),
    onSuccess: async () => {
      setProfilePictureError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["employee", employeeId] }),
        queryClient.invalidateQueries({ queryKey: ["employees"] }),
      ]);
      onNotice("Profile picture updated.");
    },
    onError: (error: Error) => notifyError(error.message),
  });
  if (employeeQuery.isLoading) {
    return (
      <div
        className={styles.employeeLoading}
        role="status"
        aria-label="Loading employee record"
        aria-busy="true"
      >
        <EmployeeProfileLoading />
      </div>
    );
  }

  if (!employee && employeeQuery.isError) {
    return (
      <section className={styles.panel}>
        <div className={styles.emptyStateLarge}>
          <CircleAlert aria-hidden="true" size={23} />
          <h2>Unable to load employee information</h2>
          <p className={styles.formError} role="alert">
            {employeeQuery.error instanceof Error
              ? employeeQuery.error.message
              : "Please try again."}
          </p>
          <button
            className={styles.secondaryButton}
            onClick={() => void employeeQuery.refetch()}
            type="button"
          >
            Retry
          </button>
        </div>
      </section>
    );
  }

  if (!employee) {
    return (
      <section className={styles.panel}>
        <div className={styles.emptyStateLarge}>
          <CircleAlert aria-hidden="true" size={23} />
          <h2>Employee record not found</h2>
          <p>
            {employeeQuery.error instanceof Error
              ? employeeQuery.error.message
              : "No employee record exists for that ID."}
          </p>
          <Link className={styles.primaryLink} href="/employees">
            <ArrowLeft aria-hidden="true" size={15} /> Back to directory
          </Link>
        </div>
      </section>
    );
  }

  const profileSections: EmployeeProfileSection[] = [
    { id: "work-information", label: "Employment & HR Profile" },
    ...(role !== "IT_ADMIN"
      ? [{ id: "work-schedule" as const, label: "Work schedule" }]
      : []),
    ...(role !== "IT_ADMIN" ? restrictedEmployeeProfileSections : []),
    ...(role !== "IT_ADMIN"
      ? [
          { id: "assignment-history" as const, label: "Assignment history" },
          {
            id: "incident-history" as const,
            label: "Incident / discipline history",
          },
        ]
      : []),
  ];

  return (
    <>
      <Link
        className={styles.backLink}
        href={canManageEmployees ? "/employees" : "/me"}
      >
        <ArrowLeft aria-hidden="true" size={15} />
        {canManageEmployees ? "Employee directory" : "My portal"}
      </Link>
      <section className={styles.profileHero}>
        <div className={styles.profilePictureControl}>
          <button
            aria-label={
              profilePictureMutation.isPending
                ? "Uploading profile picture"
                : employee.profilePictureUpdatedAt
                  ? "Change profile picture"
                  : "Upload profile picture"
            }
            className={styles.profilePictureUploadButton}
            disabled={profilePictureMutation.isPending}
            onClick={() => {
              setProfilePictureError(null);
              profilePictureInputRef.current?.click();
            }}
            title={
              employee.profilePictureUpdatedAt
                ? "Change profile picture"
                : "Upload profile picture"
            }
            type="button"
          >
            <EmployeeAvatar
              className={styles.profileAvatar}
              employee={employee}
              size={88}
            />
            <span
              className={styles.profilePictureUploadBadge}
              aria-hidden="true"
            >
              <Camera size={12} />
            </span>
            <span
              aria-hidden="true"
              className={styles.profilePictureUploadOverlay}
            >
              {profilePictureMutation.isPending ? (
                <LoaderCircle className="loading-spinner" size={17} />
              ) : (
                <Camera size={17} />
              )}
              <span>
                {profilePictureMutation.isPending
                  ? "Uploading"
                  : employee.profilePictureUpdatedAt
                    ? "Change photo"
                    : "Upload photo"}
              </span>
            </span>
          </button>
          <input
            accept="image/png,image/jpeg,image/webp"
            aria-label="Choose a profile picture"
            className={styles.hiddenFileInput}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (!file) return;
              if (
                !profilePictureTypes.has(file.type) ||
                file.size > maxProfilePictureBytes
              ) {
                setProfilePictureError(
                  "Choose a PNG, JPEG, or WebP image up to 5 MB.",
                );
                return;
              }
              profilePictureMutation.mutate(file);
            }}
            ref={profilePictureInputRef}
            type="file"
          />
        </div>
        <div className={styles.profileIdentity}>
          <p>
            {employee.employeeNumber} · {employee.branch}
          </p>
          <h2>{employee.name}</h2>
          <span>
            {employee.position} · {employee.department}
          </span>
        </div>
        {canCreateUserAccounts && employee.hasUserAccount ? (
          <span className={styles.accountScopeNote} role="status">
            User account already exists
          </span>
        ) : canCreateUserAccounts ? (
          <Link
            className={styles.secondaryLink}
            href={`/system/users?employeeEmail=${encodeURIComponent(employee.email)}&employeeName=${encodeURIComponent(employee.name)}`}
          >
            Create user account <ChevronRight aria-hidden="true" size={14} />
          </Link>
        ) : null}
        <StatusPill value={employee.status} />
        <div className={styles.accountActions}>
          {role === "SUPER_ADMIN" && (
            <IconActionButton
              icon={Trash2}
              label="Delete employee"
              onClick={() => {
                setIsDeleting(true);
              }}
              variant="danger"
            />
          )}
        </div>
      </section>
      <EmployeeFileFacts employee={employee} />
      {profilePictureError && (
        <p className={styles.formError} role="alert">
          {profilePictureError}
        </p>
      )}
      <div className={styles.sectionSwitcherLayout}>
        <EmployeeProfileTabs
          label="Employee file sections"
          panelId="employee-file-content"
          activeId={activeProfileSection}
          tabs={profileSections.map((section) => ({
            ...section,
            ...employeeFileSectionMeta[section.id],
          }))}
          onSelect={(id) =>
            setActiveProfileSection(id as EmployeeProfileSectionId)
          }
        />
        <div
          className={`${styles.sectionSwitcherContent} ${profileTabs.panel}`}
          id="employee-file-content"
          key={activeProfileSection}
          role="tabpanel"
          tabIndex={0}
          aria-labelledby={`employee-file-content-tab-${activeProfileSection}`}
        >
          {activeProfileSection === "work-information" && (
            <section className={styles.panel}>
              <SectionTitle
                title="Employment & HR Profile"
                aside={
                  canManageEmployees ? (
                    <IconActionButton
                      icon={Pencil}
                      label="Edit employee details"
                      onClick={() => {
                        selectEmployeeEditorSection("employee");
                        setHasOpenedHrProfileEditor(false);
                        setHrProfileEditorStatus({
                          ready: false,
                          saving: false,
                        });
                        setIsEditing(true);
                      }}
                    />
                  ) : undefined
                }
              />
              {role !== "IT_ADMIN" && (
                <EmployeeHrProfileCard
                  embedded
                  collapsible
                  employee={employee}
                  employeeId={employeeId}
                  hideHeader={canManageEmployees}
                  hideEditButton={canManageEmployees}
                  onNotice={onNotice}
                  role={role}
                />
              )}
              {role === "IT_ADMIN" && (
                <dl className={styles.detailGrid}>
                  <Detail label="Employee ID" value={employee.employeeNumber} />
                  <Detail
                    label="Employment type"
                    value={employmentTypeLabel(employee.employmentType)}
                  />
                  <Detail label="Position" value={employee.position} />
                  <Detail label="Department" value={employee.department} />
                  <Detail label="Branch" value={employee.branch} />
                  <Detail label="Date hired" value={employee.hiredOn} />
                  <Detail label="Reports to" value={employee.manager} />
                  <Detail label="Work email" value={employee.email} />
                </dl>
              )}
            </section>
          )}
          {activeProfileSection === "work-schedule" && role !== "IT_ADMIN" && (
            <EmployeeWorkScheduleCard employeeId={employeeId} role={role} />
          )}
          {activeProfileSection === "assignment-history" &&
            role !== "IT_ADMIN" && (
              <EmployeeAssignmentHistoryCard employeeId={employeeId} />
            )}
          {activeProfileSection === "emergency-contact" &&
            role !== "IT_ADMIN" && (
              <EmployeeEmergencyContact
                employee={employee}
                onEdit={() => setIsEditingEmergencyContact(true)}
              />
            )}
          {activeProfileSection === "incident-history" &&
            role !== "IT_ADMIN" && (
              <EmployeeIncidentHistory employeeId={employee.id} />
            )}
          {activeProfileSection === "documents" && role !== "IT_ADMIN" && (
            <EmployeeDocumentsSection
              canManageDocuments={canManageEmployees}
              employee={employee}
              onNotice={onNotice}
              role={role}
            />
          )}
        </div>
      </div>
      {isEditing && (
        <Modal
          aria-labelledby="edit-employee-title"
          className={styles.modal}
          onClose={closeEmployeeEditor}
          busy={updateMutation.isPending || hrProfileEditorStatus.saving}
        >
          <div className={styles.modalHeader}>
            <div>
              <h2 id="edit-employee-title">Edit employee</h2>
            </div>
            <IconActionButton
              icon={X}
              label="Close employee editor"
              className={styles.closeButton}
              disabled={
                updateMutation.isPending || hrProfileEditorStatus.saving
              }
              onClick={closeEmployeeEditor}
              type="button"
            />
          </div>
          <nav
            aria-label="Employee record sections"
            className={styles.employeeEditorTabs}
            onKeyDown={(event) => {
              const tabs = Array.from(
                event.currentTarget.querySelectorAll<HTMLButtonElement>(
                  '[role="tab"]',
                ),
              );
              const currentIndex = tabs.findIndex(
                (tab) => tab === document.activeElement,
              );
              let nextIndex = currentIndex;
              if (event.key === "ArrowRight") {
                nextIndex = (currentIndex + 1) % tabs.length;
              } else if (event.key === "ArrowLeft") {
                nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
              } else if (event.key === "Home") {
                nextIndex = 0;
              } else if (event.key === "End") {
                nextIndex = tabs.length - 1;
              } else {
                return;
              }
              event.preventDefault();
              const nextTab = tabs[nextIndex];
              nextTab?.focus();
              selectEmployeeEditorSection(
                nextTab?.id === "employee-editor-hr-profile-tab"
                  ? "hr-profile"
                  : "employee",
              );
            }}
            role="tablist"
          >
            <button
              aria-controls="employee-editor-details-form"
              aria-selected={employeeEditorSection === "employee"}
              className={styles.employeeEditorTab}
              id="employee-editor-details-tab"
              onClick={() => selectEmployeeEditorSection("employee")}
              role="tab"
              tabIndex={employeeEditorSection === "employee" ? 0 : -1}
              type="button"
            >
              Employee details
            </button>
            <button
              aria-controls="employee-editor-hr-profile-panel"
              aria-selected={employeeEditorSection === "hr-profile"}
              className={styles.employeeEditorTab}
              id="employee-editor-hr-profile-tab"
              onClick={() => selectEmployeeEditorSection("hr-profile")}
              role="tab"
              tabIndex={employeeEditorSection === "hr-profile" ? 0 : -1}
              type="button"
            >
              HR profile
            </button>
          </nav>
          <form
            className={styles.accountForm}
            hidden={employeeEditorSection !== "employee"}
            id="employee-editor-details-form"
            aria-labelledby="employee-editor-details-tab"
            role="tabpanel"
            onSubmit={(event) => {
              event.preventDefault();
              const values = Object.fromEntries(
                new FormData(event.currentTarget),
              );
              if (!values.effectiveDate) delete values.effectiveDate;
              if (!values.startDate) delete values.startDate;
              if (values.managerEmployeeId === "__unlinked__") {
                delete values.managerEmployeeId;
              }
              const formData = new FormData(event.currentTarget);
              const workBranches = employeeWorkBranchPayload({ ...values, workBranchIds: formData.getAll("workBranchIds") });
              delete values.workBranchSelection;
              delete values.workBranchIds;
              delete values.allWorkBranches;
              updateMutation.mutate({ ...values, ...workBranches });
            }}
          >
            <fieldset className={styles.formSection}>
              <legend>Identity &amp; contact</legend>
              <div className={styles.formSectionFields}>
                <label>
                  <ModalFieldLabel required>Full name</ModalFieldLabel>
                  <input
                    defaultValue={
                      employee.name === "Unnamed employee" ? "" : employee.name
                    }
                    name="name"
                    required
                  />
                </label>
                <label>
                  <ModalFieldLabel required>Work email</ModalFieldLabel>
                  <input
                    defaultValue={employee.email}
                    name="email"
                    required
                    type="email"
                  />
                </label>
                <label>
                  <ModalFieldLabel>Phone</ModalFieldLabel>
                  <input defaultValue={employee.phone} name="phone" />
                </label>
              </div>
            </fieldset>
            <fieldset className={styles.formSection}>
              <legend>Work assignment</legend>
              <EmployeeWorkBranches primaryBranchId={employee.branchId ?? ""} initialBranchIds={employee.workBranchIds} initialAll={employee.allWorkBranches} />
              <p>Primary branch: {employee.branch}. Department and attendance schedule use this branch.</p>
              <div className={styles.formSectionFields}>
                <EmployeeEmploymentFields
                  initialType={employee.employmentType}
                  probationEndDate={employee.probationEndDate}
                  evaluationDueDate={employee.evaluationDueDate}
                  labelClassName={styles.fieldLabel}
                />
                <label>
                  <ModalFieldLabel>Date hired</ModalFieldLabel>
                  <input
                    defaultValue={
                      employee.hiredOn === "Not provided"
                        ? ""
                        : employee.hiredOn
                    }
                    name="startDate"
                    type="date"
                  />
                </label>
                <label>
                  <ModalFieldLabel required>Position</ModalFieldLabel>
                  <input
                    defaultValue={employee.position}
                    name="position"
                    required
                  />
                </label>
                <label>
                  <ModalFieldLabel required>
                    Department in {employee.branch}
                  </ModalFieldLabel>
                  <select
                    defaultValue={employee.department}
                    disabled={
                      employeeDepartmentsQuery.isLoading ||
                      employeeDepartmentsQuery.isError ||
                      !employeeDepartmentsQuery.data?.length
                    }
                    name="department"
                    required
                  >
                    {(employeeDepartmentsQuery.data ?? []).map((department) => (
                      <option key={department.id} value={department.name}>
                        {department.name}
                      </option>
                    ))}
                  </select>
                  {employeeDepartmentsQuery.isLoading && (
                    <small role="status">Loading departments…</small>
                  )}
                  {employeeDepartmentsQuery.isError && (
                    <small role="alert">
                      {employeeDepartmentsQuery.error instanceof Error
                        ? employeeDepartmentsQuery.error.message
                        : "Unable to load departments."}
                      <button
                        onClick={() => void employeeDepartmentsQuery.refetch()}
                        type="button"
                      >
                        Retry
                      </button>
                    </small>
                  )}
                </label>
                <label>
                  <ModalFieldLabel>Manager / supervisor</ModalFieldLabel>
                  <select
                    defaultValue={
                      employee.managerEmployeeId ??
                      (employee.manager !== "Not assigned"
                        ? "__unlinked__"
                        : "")
                    }
                    disabled={
                      supervisorOptionsQuery.isLoading ||
                      supervisorOptionsQuery.isError
                    }
                    name="managerEmployeeId"
                  >
                    <option value="">No manager assigned</option>
                    {employee.manager &&
                      employee.manager !== "Not assigned" &&
                      !employee.managerEmployeeId && (
                        <option value="__unlinked__">
                          Unlinked record: {employee.manager}
                        </option>
                      )}
                    {(supervisorOptionsQuery.data ?? [])
                      .filter(
                        (candidate) =>
                          candidate.branchId === employee.branchId &&
                          (candidate.status === "ACTIVE" ||
                            candidate.id === employee.managerEmployeeId),
                      )
                      .map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          {candidate.name} · {candidate.position}
                        </option>
                      ))}
                  </select>
                  {supervisorOptionsQuery.isError && (
                    <small role="alert">
                      {supervisorOptionsQuery.error.message}{" "}
                      <button
                        onClick={() => void supervisorOptionsQuery.refetch()}
                        type="button"
                      >
                        Retry
                      </button>
                    </small>
                  )}
                </label>
                <label>
                  <ModalFieldLabel>Assignment effective date</ModalFieldLabel>
                  <input
                    aria-describedby="assignment-effective-date-hint"
                    name="effectiveDate"
                    type="date"
                  />
                  <small id="assignment-effective-date-hint">
                    Leave blank to use today for assignment history.
                  </small>
                </label>
                <label>
                  <ModalFieldLabel required>Status</ModalFieldLabel>
                  <select defaultValue={employee.status} name="status" required>
                    {EMPLOYEE_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </fieldset>
          </form>
          {hasOpenedHrProfileEditor && role !== "IT_ADMIN" && (
            <div
              aria-labelledby="employee-editor-hr-profile-tab"
              hidden={employeeEditorSection !== "hr-profile"}
              id="employee-editor-hr-profile-panel"
              role="tabpanel"
            >
              <EmployeeHrProfileCard
                embedded
                editorMode
                employee={employee}
                employeeId={employeeId}
                hideHeader
                onEditorStatusChange={reportHrProfileEditorStatus}
                onNotice={onNotice}
                role={role}
              />
            </div>
          )}
          <div
            className={`${styles.modalActions} ${styles.employeeEditorActions}`}
          >
            <button
              className={styles.primaryButton}
              disabled={
                employeeEditorSection === "employee"
                  ? updateMutation.isPending
                  : !hrProfileEditorStatus.ready || hrProfileEditorStatus.saving
              }
              form={
                employeeEditorSection === "employee"
                  ? "employee-editor-details-form"
                  : `employee-hr-profile-form-${employeeId}`
              }
              type="submit"
            >
              {(
                employeeEditorSection === "employee"
                  ? updateMutation.isPending
                  : hrProfileEditorStatus.saving
              )
                ? "Saving…"
                : "Save changes"}
            </button>
          </div>
        </Modal>
      )}
      {isEditingEmergencyContact && (
        <Modal
          aria-labelledby="emergency-contact-title"
          className={styles.modal}
          onClose={() => setIsEditingEmergencyContact(false)}
          busy={emergencyContactMutation.isPending}
        >
          <div className={styles.modalHeader}>
            <div>
              <h2 id="emergency-contact-title">Edit emergency contact</h2>
            </div>
            <IconActionButton
              icon={X}
              label="Close"
              className={styles.closeButton}
              disabled={emergencyContactMutation.isPending}
              onClick={() => setIsEditingEmergencyContact(false)}
              type="button"
            />
          </div>
          <form
            className={styles.accountForm}
            onSubmit={(event) => {
              event.preventDefault();
              emergencyContactMutation.mutate(
                Object.fromEntries(new FormData(event.currentTarget)),
              );
            }}
          >
            <fieldset className={styles.formSection}>
              <legend>Emergency contact</legend>
              <div className={styles.formSectionFields}>
                <label>
                  <ModalFieldLabel required>
                    Emergency contact name
                  </ModalFieldLabel>
                  <input
                    name="name"
                    required
                    maxLength={200}
                    defaultValue={
                      employee.emergencyContact.name === "Not provided"
                        ? ""
                        : employee.emergencyContact.name
                    }
                  />
                </label>
                <label>
                  <ModalFieldLabel required>Relationship</ModalFieldLabel>
                  <select
                    name="relationship"
                    required
                    defaultValue={
                      employee.emergencyContact.relationship === "Not provided"
                        ? ""
                        : employee.emergencyContact.relationship
                    }
                  >
                    <option value="" disabled>
                      Select relationship
                    </option>
                    {employee.emergencyContact.relationship &&
                      employee.emergencyContact.relationship !==
                        "Not provided" &&
                      !emergencyRelationshipChoices.includes(
                        employee.emergencyContact.relationship,
                      ) && (
                        <option value={employee.emergencyContact.relationship}>
                          {employee.emergencyContact.relationship}
                        </option>
                      )}
                    {emergencyRelationshipChoices.map((relationship) => (
                      <option key={relationship} value={relationship}>
                        {relationship}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <ModalFieldLabel required>Phone number</ModalFieldLabel>
                  <input
                    name="phone"
                    required
                    type="tel"
                    maxLength={25}
                    defaultValue={
                      employee.emergencyContact.phone === "Not provided"
                        ? ""
                        : employee.emergencyContact.phone
                    }
                  />
                </label>
                <label>
                  <ModalFieldLabel>Employee phone number</ModalFieldLabel>
                  <input
                    name="employeePhone"
                    type="tel"
                    maxLength={25}
                    defaultValue={
                      employee.phone === "Not provided" ? "" : employee.phone
                    }
                  />
                </label>
              </div>
            </fieldset>
            <div className={styles.modalActions}>
              <button
                className={styles.secondaryButton}
                disabled={emergencyContactMutation.isPending}
                onClick={() => setIsEditingEmergencyContact(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className={styles.primaryButton}
                disabled={emergencyContactMutation.isPending}
                type="submit"
              >
                {emergencyContactMutation.isPending
                  ? "Saving..."
                  : "Save contact"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {isDeleting && (
        <Modal
          presentation="center"
          aria-labelledby="delete-employee-title"
          className={`${styles.modal} ${styles.compactModal}`}
          onClose={() => setIsDeleting(false)}
          busy={deleteMutation.isPending}
        >
          <div className={styles.modalHeader}>
            <div>
              <h2 id="delete-employee-title">Delete employee?</h2>
            </div>
            <IconActionButton
              icon={X}
              label="Close"
              className={styles.closeButton}
              disabled={deleteMutation.isPending}
              onClick={() => setIsDeleting(false)}
              type="button"
            />
          </div>
          <p className={styles.modalCopy}>
            This removes {employee.name}. Related records will block deletion.
          </p>
          <div className={styles.modalActions}>
            <button
              className={styles.secondaryButton}
              disabled={deleteMutation.isPending}
              onClick={() => setIsDeleting(false)}
              type="button"
            >
              Cancel
            </button>
            <button
              className={styles.dangerButton}
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
              type="button"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete employee"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.detailItem}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function EmployeePortal({ onNotice }: { onNotice: (message: string) => void }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <RealtimeQueryProvider client={queryClient}>
      <EmployeePortalContent onNotice={onNotice} />
    </RealtimeQueryProvider>
  );
}

export function EmployeePortalContent({
  onNotice,
}: {
  onNotice: (message: string) => void;
}) {
  const role = useWorkspaceRole();
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const activePortalSection = portalSectionFromSearchParam(
    searchParams.get("section"),
  );
  const profilePictureInputRef = useRef<HTMLInputElement>(null);
  const [profilePictureError, setProfilePictureError] = useState<string | null>(
    null,
  );
  const [isEditingEmergencyContact, setIsEditingEmergencyContact] =
    useState(false);
  const superAdminProfileQuery = useQuery({
    queryKey: ["my-profile"],
    queryFn: () => hrRequest<OwnProfileLink>("users", "/me/profile"),
    enabled: role === "SUPER_ADMIN",
    retry: false,
  });
  const canLoadOwnEmployee = shouldLoadOwnEmployee(
    role,
    superAdminProfileQuery.data?.mode,
  );
  useEffect(() => {
    if (
      role === "SUPER_ADMIN" &&
      superAdminProfileQuery.data?.mode === "independent"
    ) {
      router.replace("/my-profile");
    }
  }, [role, router, superAdminProfileQuery.data?.mode]);
  const employeeQuery = useQuery({
    queryKey: ["employee", "me"],
    queryFn: async () => {
      const record = await hrRequest<EmployeeApiRecord>("employees", "/me");
      return toWorkspaceEmployee(record);
    },
    enabled: canLoadOwnEmployee,
  });
  const employee = employeeQuery.data;
  const profilePictureMutation = useMutation({
    mutationFn: ({ employeeId, file }: { employeeId: string; file: File }) =>
      uploadEmployeeProfilePicture(employeeId, file),
    onSuccess: async () => {
      setProfilePictureError(null);
      await queryClient.invalidateQueries({ queryKey: ["employee", "me"] });
      onNotice("Profile picture updated.");
    },
    onError: (error: Error) => {
      setProfilePictureError(error.message);
      notifyError(error.message);
    },
  });
  const emergencyContactMutation = useMutation({
    mutationFn: ({
      employeeId,
      values,
    }: {
      employeeId: string;
      values: Record<string, FormDataEntryValue>;
    }) =>
      hrRequest<EmployeeApiRecord>(
        "employees",
        `/${encodeURIComponent(employeeId)}/emergency-contact`,
        {
          method: "PATCH",
          body: JSON.stringify(values),
        },
      ),
    onSuccess: async (updated) => {
      queryClient.setQueryData<WorkspaceEmployee | undefined>(
        ["employee", "me"],
        (current) =>
          current
            ? mergeWorkspaceEmployee(current, updated)
            : toWorkspaceEmployee(updated),
      );
      await queryClient.invalidateQueries({ queryKey: ["employee", "me"] });
      setIsEditingEmergencyContact(false);
      onNotice("Emergency contact updated successfully.");
    },
    onError: (error: Error) => notifyError(error.message),
  });

  if (
    role === null ||
    (role === "SUPER_ADMIN" && superAdminProfileQuery.isLoading)
  )
    return <PortalLoading />;
  if (role === "SUPER_ADMIN" && superAdminProfileQuery.isError)
    return (
      <section className={styles.panel} role="alert">
        <p className={styles.emptyState}>
          Unable to verify your employee profile. Please try again.
        </p>
        <button
          className={styles.secondaryButton}
          onClick={() => void superAdminProfileQuery.refetch()}
          type="button"
        >
          Retry
        </button>
      </section>
    );
  if (
    role === "SUPER_ADMIN" &&
    superAdminProfileQuery.data?.mode === "independent"
  )
    return (
      <section className={styles.panel} role="status" aria-live="polite">
        <p className={styles.emptyState}>Opening your personal profile...</p>
      </section>
    );
  if (employeeQuery.isLoading) return <PortalLoading />;
  if (!employee)
    return (
      <section className={styles.panel}>
        <p className={styles.emptyState} role="alert">
          {employeeQuery.error instanceof Error
            ? employeeQuery.error.message
            : "No employee record is linked to your account."}
        </p>
        {employeeQuery.isError && (
          <button
            className={styles.secondaryButton}
            type="button"
            onClick={() => void employeeQuery.refetch()}
          >
            Retry loading my record
          </button>
        )}
      </section>
    );

  return (
    <>
      <section className={styles.profileHero}>
        <div className={styles.profilePictureControl}>
          <button
            aria-label={
              profilePictureMutation.isPending
                ? "Uploading profile picture"
                : employee.profilePictureUpdatedAt
                  ? "Change profile picture"
                  : "Upload profile picture"
            }
            className={styles.profilePictureUploadButton}
            disabled={profilePictureMutation.isPending}
            onClick={() => {
              setProfilePictureError(null);
              profilePictureInputRef.current?.click();
            }}
            type="button"
          >
            <EmployeeAvatar
              className={styles.profileAvatar}
              employee={employee}
              size={88}
            />
            <span
              className={styles.profilePictureUploadBadge}
              aria-hidden="true"
            >
              <Camera size={12} />
            </span>
            <span
              className={styles.profilePictureUploadOverlay}
              aria-hidden="true"
            >
              {profilePictureMutation.isPending ? (
                <LoaderCircle className="loading-spinner" size={17} />
              ) : (
                <Camera size={17} />
              )}
              <span>
                {profilePictureMutation.isPending
                  ? "Uploading"
                  : employee.profilePictureUpdatedAt
                    ? "Change photo"
                    : "Upload photo"}
              </span>
            </span>
          </button>
          <input
            accept="image/png,image/jpeg,image/webp"
            aria-label="Choose a profile picture"
            className={styles.hiddenFileInput}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (!file) return;
              if (
                !profilePictureTypes.has(file.type) ||
                file.size > maxProfilePictureBytes
              ) {
                setProfilePictureError(
                  "Choose a PNG, JPEG, or WebP image up to 5 MB.",
                );
                return;
              }
              profilePictureMutation.mutate({ employeeId: employee.id, file });
            }}
            ref={profilePictureInputRef}
            type="file"
          />
        </div>
        <div className={styles.profileIdentity}>
          <p>
            {employee.employeeNumber} · {employee.branch}
          </p>
          <h2>{employee.name}</h2>
          <span>
            {employee.position} · {employee.department}
          </span>
        </div>
        <StatusPill value={employee.status} />
      </section>
      <EmployeeFileFacts employee={employee} />
      {profilePictureError && (
        <p className={styles.formError} role="alert">
          {profilePictureError}
        </p>
      )}

      <div className={styles.sectionSwitcherLayout}>
        <EmployeeProfileTabs
          label="My profile sections"
          panelId="my-portal-content"
          activeId={activePortalSection}
          tabs={portalSections.map((section) => ({
            ...section,
            ...(section.id === "profile"
              ? employeeFileSectionMeta["work-information"]
              : section.id === "payslips"
                ? { icon: FileText, description: "Published payroll records" }
                : employeeFileSectionMeta[section.id]),
          }))}
          onSelect={(id) => router.push(`/me?section=${id}`, { scroll: false })}
        />
        <div
          aria-label={
            portalSections.find((section) => section.id === activePortalSection)
              ?.label
          }
          aria-labelledby={`my-portal-content-tab-${activePortalSection}`}
          className={`${styles.sectionSwitcherContent} ${profileTabs.panel}`}
          id="my-portal-content"
          key={activePortalSection}
          role="tabpanel"
          tabIndex={0}
        >
          {activePortalSection === "profile" && (
            <section className={styles.panel} id="my-profile">
              <SectionTitle title="Employment & HR Profile" />
              <EmployeeHrProfileCard
                embedded
                collapsible
                employee={employee}
                employeeId={employee.id}
                onNotice={onNotice}
                role={role === "IT_ADMIN" ? role : "EMPLOYEE"}
              />
              <div className={styles.hrProfileEmergencyContact}>
                <EmployeeEmergencyContact
                  employee={employee}
                  id="my-emergency-contact"
                  onEdit={() => setIsEditingEmergencyContact(true)}
                />
              </div>
            </section>
          )}
          {activePortalSection === "work-schedule" && (
            <EmployeeWorkScheduleCard
              employeeId={employee.id}
              role={role}
              readOnly
            />
          )}
          {activePortalSection === "assignment-history" && (
            <EmployeeAssignmentHistoryCard employeeId={employee.id} />
          )}
          {activePortalSection === "payslips" && (
            <section className={styles.panel} id="my-payslips">
              <SectionTitle title="Payslips" />
              <ul className={styles.documentList}>
                <li>
                  <span className={styles.documentIcon}>
                    <FileText aria-hidden="true" size={16} />
                  </span>
                  <span>
                    <strong>No payroll records</strong>
                    <small>Payroll integration is not available yet.</small>
                  </span>
                </li>
              </ul>
            </section>
          )}
          {activePortalSection === "incident-history" && (
            <EmployeeIncidentHistory employeeId={employee.id} />
          )}
          {activePortalSection === "documents" && (
            <div id="my-documents">
              <EmployeeDocumentsSection
                canManageDocuments={false}
                employee={employee}
                onNotice={onNotice}
                role={role}
              />
            </div>
          )}
        </div>
      </div>
      {isEditingEmergencyContact && (
        <Modal
          aria-labelledby="my-emergency-contact-editor-title"
          className={styles.modal}
          onClose={() => setIsEditingEmergencyContact(false)}
          busy={emergencyContactMutation.isPending}
        >
          <div className={styles.modalHeader}>
            <h2 id="my-emergency-contact-editor-title">
              Edit emergency contact
            </h2>
            <IconActionButton
              icon={X}
              label="Close"
              className={styles.closeButton}
              disabled={emergencyContactMutation.isPending}
              onClick={() => setIsEditingEmergencyContact(false)}
              type="button"
            />
          </div>
          <form
            className={styles.accountForm}
            onSubmit={(event) => {
              event.preventDefault();
              emergencyContactMutation.mutate({
                employeeId: employee.id,
                values: Object.fromEntries(new FormData(event.currentTarget)),
              });
            }}
          >
            <fieldset
              className={styles.formSection}
              disabled={emergencyContactMutation.isPending}
            >
              <legend>Emergency contact</legend>
              <div className={styles.formSectionFields}>
                <label>
                  <ModalFieldLabel required>
                    Emergency contact name
                  </ModalFieldLabel>
                  <input
                    name="name"
                    required
                    maxLength={200}
                    defaultValue={
                      employee.emergencyContact.name === "Not provided"
                        ? ""
                        : employee.emergencyContact.name
                    }
                  />
                </label>
                <label>
                  <ModalFieldLabel required>Relationship</ModalFieldLabel>
                  <select
                    name="relationship"
                    required
                    defaultValue={
                      employee.emergencyContact.relationship === "Not provided"
                        ? ""
                        : employee.emergencyContact.relationship
                    }
                  >
                    <option value="" disabled>
                      Select relationship
                    </option>
                    {employee.emergencyContact.relationship &&
                      employee.emergencyContact.relationship !==
                        "Not provided" &&
                      !emergencyRelationshipChoices.includes(
                        employee.emergencyContact.relationship,
                      ) && (
                        <option value={employee.emergencyContact.relationship}>
                          {employee.emergencyContact.relationship}
                        </option>
                      )}
                    {emergencyRelationshipChoices.map((relationship) => (
                      <option key={relationship} value={relationship}>
                        {relationship}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <ModalFieldLabel required>Phone number</ModalFieldLabel>
                  <input
                    name="phone"
                    required
                    type="tel"
                    maxLength={25}
                    defaultValue={
                      employee.emergencyContact.phone === "Not provided"
                        ? ""
                        : employee.emergencyContact.phone
                    }
                  />
                </label>
                <label>
                  <ModalFieldLabel>Employee phone number</ModalFieldLabel>
                  <input
                    name="employeePhone"
                    type="tel"
                    maxLength={25}
                    defaultValue={
                      employee.phone === "Not provided" ? "" : employee.phone
                    }
                  />
                </label>
              </div>
            </fieldset>
            <div className={styles.modalActions}>
              <button
                className={styles.secondaryButton}
                disabled={emergencyContactMutation.isPending}
                onClick={() => setIsEditingEmergencyContact(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className={styles.primaryButton}
                disabled={emergencyContactMutation.isPending}
                type="submit"
              >
                {emergencyContactMutation.isPending
                  ? "Saving..."
                  : "Save contact"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

function UserAccess({ onNotice }: { onNotice: (message: string) => void }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <RealtimeQueryProvider client={queryClient}>
      <UserAccessContent onNotice={onNotice} />
    </RealtimeQueryProvider>
  );
}

function roleSupportsAllBranches(role: WorkspaceAccount["role"]): boolean {
  return role === "IT_ADMIN" || role === "HR_ADMIN";
}

function UserAccessContent({
  onNotice,
}: {
  onNotice: (message: string) => void;
}) {
  const confirm = useConfirmation();
  const currentRole = useWorkspaceRole();
  const [adminAccessTarget, setAdminAccessTarget] =
    useState<WorkspaceAccount | null>(null);
  const [branchEditTarget, setBranchEditTarget] =
    useState<WorkspaceAccount | null>(null);
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const linkedEmployeeName = searchParams.get("employeeName") ?? "";
  const linkedEmployeeEmail = searchParams.get("employeeEmail") ?? "";
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [roleEditTarget, setRoleEditTarget] = useState<WorkspaceAccount | null>(
    null,
  );
  const [editRole, setEditRole] =
    useState<WorkspaceAccount["role"]>("EMPLOYEE");
  const [roleEditEmployeeId, setRoleEditEmployeeId] = useState<string | null>(
    null,
  );
  const [roleEditBranchId, setRoleEditBranchId] = useState<string | null>(null);
  const [isRoleUpdatePending, setIsRoleUpdatePending] = useState(false);
  const accountsQuery = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const payload = await usersRequest<
        UserApiRecord[] | { data?: UserApiRecord[] }
      >();
      const users = Array.isArray(payload) ? payload : (payload.data ?? []);
      return users.map(toWorkspaceAccount);
    },
  });
  const accounts = accountsQuery.data ?? [];
  const employeesQuery = useQuery({
    queryKey: ["employees", "account-creation"],
    queryFn: () =>
      hrRequest<EmployeeApiRecord[]>("employees", "/account-options"),
    enabled: isCreateOpen || Boolean(roleEditTarget),
  });
  const branchesQuery = useQuery({
    queryKey: ["branches", "active-account-creation"],
    queryFn: loadActiveBranches,
    enabled: isCreateOpen || Boolean(roleEditTarget),
  });
  const isLoading = accountsQuery.isLoading;
  const loadError =
    accountsQuery.error instanceof Error ? accountsQuery.error.message : null;
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [branchFilter, setBranchFilter] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [layout, setLayout] = useRememberedView(
    "user-access",
    "cards",
    CARD_TABLE_VIEWS,
  );
  const [tablePage, setTablePage] = useState(1);
  const [accountView, setAccountView] = useState<"CURRENT" | "ARCHIVED">(
    "CURRENT",
  );
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createRole, setCreateRole] = useState("EMPLOYEE");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [selectedAccessBranchId, setSelectedAccessBranchId] = useState("");
  const [credentialTarget, setCredentialTarget] =
    useState<WorkspaceAccount | null>(null);
  const [pendingDeactivation, setPendingDeactivation] =
    useState<WorkspaceAccount | null>(null);
  const [pendingActivation, setPendingActivation] =
    useState<WorkspaceAccount | null>(null);
  const [pendingArchive, setPendingArchive] = useState<WorkspaceAccount | null>(
    null,
  );
  const [pendingDelete, setPendingDelete] = useState<WorkspaceAccount | null>(
    null,
  );
  const [resetTarget, setResetTarget] = useState<WorkspaceAccount | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [isActionPending, setIsActionPending] = useState(false);
  const filteredAccounts = accounts
    .filter((account) => {
      const queryMatch = `${account.name} ${account.email}`
        .toLowerCase()
        .includes(query.trim().toLowerCase());
      const statusMatch =
        accountView === "ARCHIVED"
          ? account.status === "ARCHIVED"
          : account.status !== "ARCHIVED";
      return (
        statusMatch &&
        queryMatch &&
        (roleFilter === "ALL" || account.role === roleFilter) &&
        (!branchFilter || account.branchAccessMode === "ALL" || (account.accessibleBranches ? account.accessibleBranches.some(branch => branch.name === branchFilter) : account.branch === branchFilter)) &&
        (accountView === "ARCHIVED" ||
          statusFilter === "ALL" ||
          account.status === statusFilter ||
          (statusFilter === "REVIEW" &&
            ["INACTIVE", "PENDING"].includes(account.status)))
      );
    })
    .sort((a, b) => {
      const first =
        sortBy === "role"
          ? roleLabel(a.role).localeCompare(roleLabel(b.role))
          : sortBy === "branch"
            ? a.branch.localeCompare(b.branch)
            : 0;
      return first || a.name.localeCompare(b.name);
    });
  const accountPage = paginateTableRows(filteredAccounts, tablePage);
  const selectedEmployee = employeesQuery.data?.find(
    (employee) => employee.id === selectedEmployeeId,
  );
  const linkedRoleEmployee = employeesQuery.data?.find(
    (employee) =>
      employee.email.toLowerCase() === roleEditTarget?.email.toLowerCase(),
  );
  const roleFormEmployeeId = roleEditEmployeeId ?? linkedRoleEmployee?.id ?? "";
  const roleEmployee = employeesQuery.data?.find(
    (employee) => employee.id === roleFormEmployeeId,
  );
  const editFollowsEmployeeBranch =
    editRole !== "SUPER_ADMIN";
  const createFollowsEmployeeBranch =
    createRole !== "SUPER_ADMIN";
  const roleFormBranchId = editFollowsEmployeeBranch
    ? (roleEmployee?.branchId ?? "")
    : (roleEditBranchId ??
      roleEditTarget?.branchId ??
      (roleSupportsAllBranches(editRole) ? "ALL" : ""));

  function openRoleEditor(account: WorkspaceAccount) {
    setActionError(null);
    setRoleEditTarget(account);
    setEditRole(account.role);
    setRoleEditEmployeeId(null);
    setRoleEditBranchId(null);
  }

  async function updateAccountRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!roleEditTarget) return;
    if (
      editRole !== "SUPER_ADMIN" &&
      (!roleFormEmployeeId ||
        !roleFormBranchId ||
        (roleFormBranchId === "ALL" && !roleSupportsAllBranches(editRole)))
    ) {
      setActionError("Select an employee and active branch for this role.");
      return;
    }

    setIsRoleUpdatePending(true);
    setActionError(null);
    try {
      const payload = await usersRequest<{
        data?: UserApiRecord | UserApiRecord[];
      }>(`/${roleEditTarget.id}/role`, {
        method: "PATCH",
        body: JSON.stringify(
          editRole === "SUPER_ADMIN"
            ? { role: editRole }
            : {
                role: editRole,
                employeeId: roleFormEmployeeId,
                branchId: roleFormBranchId === "ALL" ? null : roleFormBranchId,
              },
        ),
      });
      if (!payload.data) throw new Error("Unable to update account role.");
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      setRoleEditTarget(null);
      onNotice("Account role updated.");
    } catch (error: unknown) {
      notifyError(
        error instanceof Error
          ? error.message
          : "Unable to update account role.",
      );
    } finally {
      setIsRoleUpdatePending(false);
    }
  }

  async function updateAccountStatus(
    account: WorkspaceAccount,
    status: "ACTIVE" | "INACTIVE" | "ARCHIVED",
  ) {
    setIsActionPending(true);
    setActionError(null);
    try {
      const payload = await usersRequest<{
        data?: UserApiRecord | UserApiRecord[];
      }>(`/${account.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      if (!payload.data) throw new Error("Unable to update account status.");
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      setPendingDeactivation(null);
      setPendingActivation(null);
      setPendingArchive(null);
      onNotice(
        status === "ACTIVE"
          ? "Account activated."
          : status === "ARCHIVED"
            ? "Account archived."
            : "Account deactivated.",
      );
    } catch (error: unknown) {
      notifyError(
        error instanceof Error
          ? error.message
          : "Unable to update account status.",
      );
    } finally {
      setIsActionPending(false);
    }
  }

  async function deleteAccount(account: WorkspaceAccount) {
    setIsActionPending(true);
    setActionError(null);
    try {
      await usersRequest(`/${account.id}`, { method: "DELETE" });
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      setPendingDelete(null);
      onNotice("Account deleted permanently.");
    } catch (error: unknown) {
      notifyError(
        error instanceof Error ? error.message : "Unable to delete account.",
      );
    } finally {
      setIsActionPending(false);
    }
  }

  async function resetAccountPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resetTarget) return;
    setIsActionPending(true);
    setActionError(null);
    try {
      await usersRequest(`/${resetTarget.id}/password`, {
        method: "PATCH",
        body: JSON.stringify({ password: newPassword }),
      });
      setResetTarget(null);
      setNewPassword("");
      onNotice("Password reset successfully.");
    } catch (error: unknown) {
      notifyError(
        error instanceof Error ? error.message : "Unable to reset password.",
      );
    } finally {
      setIsActionPending(false);
    }
  }

  function closeCreateAccountModal() {
    setIsCreateOpen(false);
  }

  async function regenerateAccountCredentials(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    if (!credentialTarget || isActionPending) return;
    setIsActionPending(true);
    setActionError(null);
    try {
      const result = await usersRequest<{
        message?: string;
        emailDelivery: string;
      }>(`/${credentialTarget.id}/regenerate-credentials`, { method: "POST" });
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      if (result.emailDelivery !== "ACCEPTED_BY_PROVIDER") {
        setActionError(
          result.message ?? "Credential email failed. Please retry.",
        );
        return;
      }
      setCredentialTarget(null);
      onNotice(result.message ?? "Credential email accepted by the provider.");
    } catch (error: unknown) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Unable to regenerate credentials.",
      );
      await queryClient.invalidateQueries({ queryKey: ["users"] });
    } finally {
      setIsActionPending(false);
    }
  }

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const selectedForConfirmation = (employeesQuery.data ?? []).find(
      (employee) => employee.id === selectedEmployeeId,
    );
    if (
      createRole !== "SUPER_ADMIN" &&
      selectedForConfirmation?.hasUserAccount
    ) {
      setCreateError("This employee already has a user account.");
      return;
    }
    const submittedValues = Object.fromEntries(new FormData(formElement));
    const allBranchAssignment = submittedValues.branchId === "ALL";
    if (
      createRole !== "SUPER_ADMIN" &&
      !allBranchAssignment &&
      selectedForConfirmation &&
      submittedValues.branchId !== selectedForConfirmation.branchId
    ) {
      if (
        !(await confirm({
          title: "Use a different access branch?",
          description:
            "This account will use a different access branch from the employee's HR assignment. The HR assignment will remain unchanged.",
          confirmLabel: "Continue",
        }))
      )
        return;
    }
    setIsCreating(true);
    setCreateError(null);
    const values = submittedValues;
    const isSuperAdmin = createRole === "SUPER_ADMIN";
    const selectedEmployee = (employeesQuery.data ?? []).find(
      (employee) => employee.id === selectedEmployeeId,
    );
    const accountValues = isSuperAdmin
      ? { ...values, role: createRole, employeeId: null, branchId: null }
      : {
          ...values,
          role: createRole,
          employeeId: selectedEmployeeId,
          branchId: allBranchAssignment ? null : values.branchId,
          name: selectedEmployee?.name ?? "",
          email: selectedEmployee?.email ?? "",
        };
    try {
      const payload = await usersRequest<{
        data?: UserApiRecord | UserApiRecord[];
        emailDelivery?: string;
        message?: string;
      }>("", {
        method: "POST",
        body: JSON.stringify(accountValues),
      });
      if (!payload.data) throw new Error("Unable to create account.");
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      await queryClient.invalidateQueries({
        queryKey: ["employees", "account-creation"],
      });
      closeCreateAccountModal();
      if (payload.emailDelivery === "FAILED")
        notifyError(
          payload.message ??
            "Account created, but credential email failed. Use Regenerate & email to retry.",
        );
      else
        onNotice(
          payload.message ??
            "Account created. Credential email accepted by the provider.",
        );
      formElement.reset();
    } catch (error: unknown) {
      setCreateError(
        error instanceof Error
          ? error.message
          : "Account creation could not be confirmed. Refresh the account list before retrying.",
      );
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      await queryClient.invalidateQueries({
        queryKey: ["employees", "account-creation"],
      });
    } finally {
      setIsCreating(false);
    }
  }

  function resetAccountFilters() {
    setQuery("");
    setRoleFilter("ALL");
    setStatusFilter("ALL");
    setBranchFilter("");
    setTablePage(1);
  }
  function renderAccountActions(account: WorkspaceAccount) {
    return (
      <AccountManagementActions name={account.name}>
        {(currentRole === "SUPER_ADMIN" || currentRole === "IT_ADMIN" && account.role === "HR_ADMIN") &&
          ["HR_ADMIN", "BRANCH_MANAGER"].includes(account.role) && (
            <AccountManagementAction
              icon={ShieldCheck}
              label={`Edit shared work branches for ${account.name}`}
              onClick={() => setAdminAccessTarget(account)}
            />
          )}
        {["EMPLOYEE", "STAFF"].includes(account.role) && (
          <AccountManagementAction
            icon={MapPin}
            label={`Change employee branch for ${account.name}`}
            onClick={() => setBranchEditTarget(account)}
          />
        )}
        {(currentRole === "SUPER_ADMIN" ||
          (currentRole === "IT_ADMIN" && account.role !== "SUPER_ADMIN" && account.role !== "BRANCH_MANAGER")) && (
          <AccountManagementAction
            icon={Pencil}
            label={`Edit role for ${account.name}`}
            onClick={() => openRoleEditor(account)}
          />
        )}
        {(currentRole === "SUPER_ADMIN" ||
          (currentRole === "IT_ADMIN" && account.role !== "SUPER_ADMIN")) && (
          <AccountManagementAction
            icon={KeyRound}
            label={`${account.mustChangePassword && account.credentialEmailStatus && account.credentialEmailStatus !== "NOT_REQUIRED" ? "Regenerate & email credentials" : "Reset password"} for ${account.name}`}
            onClick={() => {
              setActionError(null);
              if (
                account.mustChangePassword &&
                account.credentialEmailStatus &&
                account.credentialEmailStatus !== "NOT_REQUIRED"
              ) {
                setCredentialTarget(account);
                return;
              }
              setNewPassword("");
              setResetTarget(account);
            }}
          />
        )}
        {(currentRole === "SUPER_ADMIN" || currentRole === "IT_ADMIN") &&
          (account.status === "ARCHIVED" ? (
            <>
              <AccountManagementAction
                icon={Power}
                label={`Activate ${account.name}`}
                onClick={() => {
                  setActionError(null);
                  setPendingActivation(account);
                }}
              />
              <AccountManagementAction
                icon={Trash2}
                label={`Delete ${account.name}`}
                onClick={() => {
                  setActionError(null);
                  setPendingDelete(account);
                }}
                variant="danger"
              />
            </>
          ) : account.status === "ACTIVE" ? (
            <AccountManagementAction
              icon={Power}
              label={`Deactivate ${account.name}`}
              onClick={() => {
                setActionError(null);
                setPendingDeactivation(account);
              }}
              variant="danger"
            />
          ) : (
            <>
              <AccountManagementAction
                icon={Power}
                label={`Activate ${account.name}`}
                onClick={() => {
                  setActionError(null);
                  setPendingActivation(account);
                }}
              />
              <AccountManagementAction
                icon={Archive}
                label={`Archive ${account.name}`}
                onClick={() => {
                  setActionError(null);
                  setPendingArchive(account);
                }}
              />
            </>
          ))}
      </AccountManagementActions>
    );
  }
  return (
    <>
      {!accountsQuery.isError && (
        <AccountAccessSummary
          accounts={accounts}
          loading={isLoading}
          activeFilter={
            !query && roleFilter === "ALL" && !branchFilter
              ? accountView === "ARCHIVED"
                ? "ARCHIVED"
                : statusFilter === "ACTIVE"
                  ? "ACTIVE"
                  : statusFilter === "REVIEW"
                    ? "REVIEW"
                    : statusFilter === "ALL"
                      ? "CURRENT"
                      : undefined
              : undefined
          }
          onSelect={(filter) => {
            resetAccountFilters();
            setAccountView(filter === "ARCHIVED" ? "ARCHIVED" : "CURRENT");
            setStatusFilter(
              filter === "ACTIVE"
                ? "ACTIVE"
                : filter === "REVIEW"
                  ? "REVIEW"
                  : "ALL",
            );
          }}
        />
      )}

      <section className={styles.panel}>
        <div className={directory.directoryHeader}>
          <div>
            <h2>Manage accounts</h2>
            <p className={directory.description}>
              Find an account, review access and manage its settings.
            </p>
          </div>
          <div
            className={directory.viewSwitch}
            role="group"
            aria-label="Account display"
          >
            <button
              type="button"
              aria-label="Refresh accounts"
              disabled={accountsQuery.isFetching}
              onClick={() => void accountsQuery.refetch()}
            >
              <RefreshCw
                size={15}
                className={
                  accountsQuery.isFetching ? "loading-spinner" : undefined
                }
              />
            </button>
            <button
              type="button"
              aria-pressed={layout === "cards"}
              onClick={() => setLayout("cards")}
            >
              <LayoutGrid size={15} />
              Cards
            </button>
            <button
              type="button"
              aria-pressed={layout === "table"}
              onClick={() => setLayout("table")}
            >
              <List size={15} />
              Table
            </button>
          </div>
        </div>
        <div className={styles.tableToolbar}>
          <div
            className={styles.filterTabs}
            role="group"
            aria-label="Account list view"
          >
            <button
              aria-pressed={accountView === "CURRENT"}
              className={
                accountView === "CURRENT"
                  ? styles.filterTabActive
                  : styles.filterTab
              }
              onClick={() => {
                setAccountView("CURRENT");
                setStatusFilter("ALL");
                setTablePage(1);
              }}
              type="button"
            >
              Current accounts
            </button>
            <button
              aria-pressed={accountView === "ARCHIVED"}
              className={
                accountView === "ARCHIVED"
                  ? styles.filterTabActive
                  : styles.filterTab
              }
              onClick={() => {
                setAccountView("ARCHIVED");
                setStatusFilter("ALL");
                setTablePage(1);
              }}
              type="button"
            >
              Archived accounts
            </button>
          </div>
          <label className={styles.searchBox}>
            <Search aria-hidden="true" size={16} />
            <span className={styles.screenReaderOnly}>Search accounts</span>
            <input
              onChange={(event) => {
                setQuery(event.target.value);
                setTablePage(1);
              }}
              placeholder="Search name or email"
              value={query}
            />
          </label>
          <label className={styles.filterLabel}>
            <span>Role</span>
            <select
              onChange={(event) => {
                setRoleFilter(event.target.value);
                setTablePage(1);
              }}
              value={roleFilter}
            >
              <option value="ALL">All roles</option>
              {[
                "SUPER_ADMIN",
                "IT_ADMIN",
                "HR_ADMIN",
                "BRANCH_MANAGER",
                "STAFF",
                "EMPLOYEE",
              ].map((role) => (
                <option key={role} value={role}>
                  {roleLabel(role as WorkspaceAccount["role"])}
                </option>
              ))}
            </select>
          </label>
          <span className={styles.resultCount} aria-live="polite">
            {isLoading
              ? "Loading accounts…"
              : `${filteredAccounts.length} ${accountView === "ARCHIVED" ? "archived accounts" : "accounts"}`}
          </span>
          {(currentRole === "SUPER_ADMIN" || currentRole === "IT_ADMIN") && (
            <button
              className={styles.primaryButton}
              onClick={() => {
                setCreateError(null);
                setCreateRole("EMPLOYEE");
                setSelectedEmployeeId("");
                setSelectedAccessBranchId("");
                setIsCreateOpen(true);
              }}
              type="button"
            >
              <Plus aria-hidden="true" size={15} /> Create account
            </button>
          )}
        </div>
        <div className={directory.filters}>
          <label>
            Status
            <select
              aria-label="Filter account status"
              disabled={accountView === "ARCHIVED"}
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setTablePage(1);
              }}
            >
              <option value="ALL">
                {accountView === "ARCHIVED"
                  ? "Archived"
                  : "All current statuses"}
              </option>
              <option value="ACTIVE">Active</option>
              <option value="REVIEW">Inactive &amp; pending</option>
              <option value="INACTIVE">Inactive</option>
              <option value="PENDING">Pending</option>
            </select>
          </label>
          <label>
            Branch
            <select
              aria-label="Filter account branch"
              value={branchFilter}
              onChange={(e) => {
                setBranchFilter(e.target.value);
                setTablePage(1);
              }}
            >
              <option value="">All access branches</option>
              {Array.from(new Set(accounts.flatMap(a => a.accessibleBranches ? a.accessibleBranches.map(branch => branch.name) : [a.branch])))
                .sort()
                .map((branch) => (
                  <option key={branch} value={branch}>
                    {branch}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Sort by
            <select
              aria-label="Sort accounts"
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value);
                setTablePage(1);
              }}
            >
              <option value="name">Name A-Z</option>
              <option value="role">Role</option>
              <option value="branch">Branch</option>
            </select>
          </label>
          {(query ||
            roleFilter !== "ALL" ||
            branchFilter ||
            statusFilter !== "ALL") && (
            <button
              type="button"
              className={directory.button}
              onClick={resetAccountFilters}
            >
              Clear filters
            </button>
          )}
        </div>
        {isLoading &&
          (layout === "cards" ? (
            <AccountDirectorySkeleton />
          ) : (
            <AccountTableSkeleton />
          ))}
        {loadError && (
          <div className={styles.queryError} role="alert">
            {loadError}
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={() => void accountsQuery.refetch()}
            >
              Try again
            </button>
          </div>
        )}
        {!isLoading && !loadError && (
          <>
            {layout === "cards" ? (
              <AccountDirectoryCards
                accounts={accountPage.items}
                renderActions={renderAccountActions}
                showEmployeePhotos={currentRole !== "IT_ADMIN"}
                renderStatus={(account) => (
                  <>
                    <StatusPill value={account.status} />
                    <AccountCredentialStatus account={account} />
                  </>
                )}
              />
            ) : (
              <AccountAccessTable>
                <tbody>
                  {accountPage.items.map((account) => (
                    <tr key={account.id}>
                      <td>
                        <div className={directory.accountIdentity}>
                          <PersonAvatar
                            className={directory.tableAvatar}
                            employeeId={
                              currentRole !== "IT_ADMIN"
                                ? account.employeeId
                                : null
                            }
                            name={account.name}
                            profilePictureUpdatedAt={
                              account.profilePictureUpdatedAt
                            }
                            size={36}
                          />
                          <span>
                            <strong className={styles.cellPrimary}>
                              {account.name}
                            </strong>
                            <small className={styles.cellSecondary}>
                              {account.email} · Last sign-in:{" "}
                              {account.lastSignIn}
                            </small>
                          </span>
                        </div>
                      </td>
                      <td>
                        <strong className={styles.cellPrimary}>
                          {roleLabel(account.role)}
                        </strong>
                        <small className={styles.cellSecondary}>
                          {account.branch}
                        </small>
                      </td>
                      <td>
                        <StatusPill value={account.status} />
                        <AccountCredentialStatus account={account} />
                      </td>
                      <td className={styles.accountActionCell}>
                        {renderAccountActions(account)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </AccountAccessTable>
            )}
          </>
        )}
        {!isLoading && !loadError && (
          <TablePagination
            label="accounts"
            onPageChange={setTablePage}
            page={accountPage.page}
            totalItems={filteredAccounts.length}
          />
        )}
        {!isLoading && !loadError && filteredAccounts.length === 0 && (
          <div className={styles.emptyStateLarge}>
            <UsersRound aria-hidden="true" size={28} />
            <h2>
              {query ||
              roleFilter !== "ALL" ||
              branchFilter ||
              statusFilter !== "ALL"
                ? "No matching accounts"
                : accountView === "ARCHIVED"
                  ? "No archived accounts"
                  : "No current accounts"}
            </h2>
            <p>
              {query ||
              roleFilter !== "ALL" ||
              branchFilter ||
              statusFilter !== "ALL"
                ? "Try another name, email, role, branch or status."
                : "Accounts will appear here when available."}
            </p>
            {(query ||
              roleFilter !== "ALL" ||
              branchFilter ||
              statusFilter !== "ALL") && (
              <button
                className={styles.secondaryButton}
                type="button"
                onClick={resetAccountFilters}
              >
                Clear filters
              </button>
            )}
          </div>
        )}
        <div className={styles.accessNote}>
          <ShieldCheck aria-hidden="true" size={16} />
          <p>Review an account’s role and branch before changing access.</p>
        </div>
      </section>
      {adminAccessTarget && (
        <AdminBranchAccessDialog
          account={adminAccessTarget}
          onClose={() => setAdminAccessTarget(null)}
        />
      )}
      {branchEditTarget && (
        <AccountBranchDialog
          account={branchEditTarget}
          onClose={() => setBranchEditTarget(null)}
        />
      )}
      {roleEditTarget && (
        <Modal
          aria-describedby="edit-account-role-description"
          aria-labelledby="edit-account-role-title"
          className={`${styles.modal} ${directory.accountDialog}`}
          onClose={() => setRoleEditTarget(null)}
          busy={isRoleUpdatePending}
        >
          <div className={styles.modalHeader}>
            <div>
              <h2 id="edit-account-role-title">Edit account role</h2>
            </div>
            <IconActionButton
              icon={X}
              label="Close"
              className={styles.closeButton}
              disabled={isRoleUpdatePending}
              onClick={() => setRoleEditTarget(null)}
              type="button"
            />
          </div>
          <p className={styles.modalCopy} id="edit-account-role-description">
            Change access for {roleEditTarget.name}. Primary and work branches
            come from the selected employee record. Use Edit shared work branches
            to update branch access.
          </p>
          <form className={styles.accountForm} onSubmit={updateAccountRole}>
            <fieldset className={styles.formSection}>
              <legend>Access details</legend>
              <div className={styles.formSectionFields}>
                <label>
                  <ModalFieldLabel required>Role</ModalFieldLabel>
                  <select
                    onChange={(event) => {
                      const nextRole = event.target
                        .value as WorkspaceAccount["role"];
                      setEditRole(nextRole);
                      if (
                        !roleSupportsAllBranches(nextRole) &&
                        roleFormBranchId === "ALL"
                      ) {
                        const employeeBranchId = linkedRoleEmployee?.branchId;
                        const employeeBranchIsActive = (
                          branchesQuery.data ?? []
                        ).some((branch) => branch.id === employeeBranchId);
                        setRoleEditBranchId(
                          employeeBranchIsActive
                            ? (employeeBranchId ?? "")
                            : "",
                        );
                      }
                    }}
                    required
                    value={editRole}
                  >
                    {currentRole === "SUPER_ADMIN" && (
                      <option value="SUPER_ADMIN">Super Admin</option>
                    )}
                    <option value="IT_ADMIN">IT Admin</option>
                    <option value="HR_ADMIN">HR Admin</option>
                    {currentRole === "SUPER_ADMIN" && <option value="BRANCH_MANAGER">Branch Manager</option>}
                    <option value="STAFF">Staff</option>
                    <option value="EMPLOYEE">Employee</option>
                  </select>
                </label>
                {editRole === "SUPER_ADMIN" ? (
                  <div className={styles.accountScopeNote} role="note">
                    <ShieldCheck aria-hidden="true" size={16} />
                    <span>
                      <strong>System-level access</strong>
                      Super Admin has company-wide access and no required branch. The employee record is preserved.
                    </span>
                  </div>
                ) : (
                  <>
                    <label>
                      <ModalFieldLabel required>Employee</ModalFieldLabel>
                      <select
                        required
                        value={roleFormEmployeeId}
                        disabled={
                          employeesQuery.isLoading || employeesQuery.isError
                        }
                        onChange={(event) => {
                          const nextEmployeeId = event.target.value;
                          const employee = (employeesQuery.data ?? []).find(
                            (item) => item.id === nextEmployeeId,
                          );
                          setRoleEditEmployeeId(nextEmployeeId);
                          if (
                            employee &&
                            (branchesQuery.data ?? []).some(
                              (branch) => branch.id === employee.branchId,
                            )
                          ) {
                            setRoleEditBranchId(employee.branchId);
                          }
                        }}
                      >
                        <option value="">Select employee</option>
                        {(employeesQuery.data ?? []).map((employee) => (
                          <option key={employee.id} value={employee.id}>
                            {employee.name} · {employee.employeeNumber}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <ModalFieldLabel required>
                        Primary branch (from employee)
                      </ModalFieldLabel>
                      <select
                        required
                        value={roleFormBranchId}
                        disabled={editFollowsEmployeeBranch || branchesQuery.isLoading || branchesQuery.isError}
                        onChange={(event) =>
                          setRoleEditBranchId(event.target.value)
                        }
                      >
                        <option value="">Select active branch</option>
                        {!editFollowsEmployeeBranch && roleSupportsAllBranches(editRole) && (
                          <option value="ALL">All branches</option>
                        )}
                        {(branchesQuery.data ?? [])
                          .filter(
                            (branch) =>
                              !editFollowsEmployeeBranch ||
                              branch.id === roleEmployee?.branchId,
                          )
                          .map((branch) => (
                            <option key={branch.id} value={branch.id}>
                              {branch.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    {editRole === "BRANCH_MANAGER" && roleEditTarget.role === "BRANCH_MANAGER" && currentRole === "SUPER_ADMIN" && (
                      <div className={styles.accountScopeNote} role="note">
                        <ShieldCheck aria-hidden="true" size={16} />
                        <span>
                          <strong>Shared work branches: {roleEmployee?.employment?.allWorkBranches ? "All current and future active branches" : (roleEmployee?.workBranches ?? roleEditTarget.accessibleBranches)?.map((branch) => branch.name).join(", ") || "None"}</strong>
                          <button type="button" className={styles.secondaryButton} disabled={roleFormEmployeeId !== (roleEditTarget.employeeId ?? linkedRoleEmployee?.id)} onClick={() => { setRoleEditTarget(null); setAdminAccessTarget(roleEditTarget); }}>
                            Edit shared work branches
                          </button>
                        </span>
                      </div>
                    )}
                    {employeesQuery.isError && (
                      <div className={styles.queryError} role="alert">
                        <span>Unable to load employee options.</span>
                        <button
                          className={styles.secondaryButton}
                          disabled={employeesQuery.isFetching}
                          onClick={() => void employeesQuery.refetch()}
                          type="button"
                        >
                          {employeesQuery.isFetching ? "Retrying…" : "Retry"}
                        </button>
                      </div>
                    )}
                    {branchesQuery.isError && (
                      <div className={styles.queryError} role="alert">
                        <span>Unable to load active branches.</span>
                        <button
                          className={styles.secondaryButton}
                          disabled={branchesQuery.isFetching}
                          onClick={() => void branchesQuery.refetch()}
                          type="button"
                        >
                          {branchesQuery.isFetching ? "Retrying…" : "Retry"}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </fieldset>
            {actionError && (
              <p className={styles.formError} role="alert">
                {actionError}
              </p>
            )}
            <div className={styles.modalActions}>
              <button
                className={styles.secondaryButton}
                disabled={isRoleUpdatePending}
                onClick={() => setRoleEditTarget(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className={styles.primaryButton}
                disabled={
                  isRoleUpdatePending ||
                  (editRole !== "SUPER_ADMIN" &&
                    (employeesQuery.isLoading ||
                      employeesQuery.isError ||
                      ((roleFormBranchId !== "ALL" ||
                        !roleSupportsAllBranches(editRole)) &&
                        (branchesQuery.isLoading || branchesQuery.isError))))
                }
                type="submit"
              >
                {isRoleUpdatePending ? "Saving role..." : "Save role"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {isCreateOpen && (
        <Modal
          aria-labelledby="create-account-title"
          aria-describedby="create-account-description"
          className={`${styles.modal} ${directory.accountDialog}`}
          onClose={closeCreateAccountModal}
          busy={isCreating}
        >
          <div className={styles.modalHeader}>
            <div>
              <h2 id="create-account-title">
                {createRole === "SUPER_ADMIN"
                  ? "Create Super Admin account"
                  : "Create user account"}
              </h2>
            </div>
            <IconActionButton
              icon={X}
              label="Close"
              className={styles.closeButton}
              disabled={isCreating}
              onClick={closeCreateAccountModal}
              type="button"
            />
          </div>
          <form className={styles.accountForm} onSubmit={createAccount}>
            <fieldset className={styles.formSection}>
              <legend>Access details</legend>
              <div className={styles.formSectionFields}>
                <label>
                  <ModalFieldLabel required>Role</ModalFieldLabel>
                  <select
                    value={createRole}
                    name="role"
                    required
                    onChange={(event) => {
                      const nextRole = event.target.value;
                      setCreateRole(nextRole);
                      if (
                        !roleSupportsAllBranches(
                          nextRole as WorkspaceAccount["role"],
                        ) &&
                        selectedAccessBranchId === "ALL"
                      ) {
                        const employeeBranchIsActive = (
                          branchesQuery.data ?? []
                        ).some(
                          (branch) => branch.id === selectedEmployee?.branchId,
                        );
                        setSelectedAccessBranchId(
                          employeeBranchIsActive
                            ? (selectedEmployee?.branchId ?? "")
                            : "",
                        );
                      }
                    }}
                  >
                    {currentRole === "SUPER_ADMIN" && (
                      <option value="SUPER_ADMIN">Super Admin</option>
                    )}
                    <option value="IT_ADMIN">IT Admin</option>
                    <option value="HR_ADMIN">HR Admin</option>
                    <option value="BRANCH_MANAGER">Branch Manager</option>
                    <option value="STAFF">Staff</option>
                    <option value="EMPLOYEE">Employee</option>
                  </select>
                </label>
                {createRole === "SUPER_ADMIN" ? (
                  <div
                    className={styles.accountScopeNote}
                    id="create-account-description"
                    role="note"
                  >
                    <ShieldCheck aria-hidden="true" size={16} />
                    <span>
                      <strong>System-level access</strong>
                      Super Admin accounts do not use employee or branch
                      assignments.
                    </span>
                  </div>
                ) : (
                  <>
                    <div
                      className={styles.accountScopeNote}
                      id="create-account-description"
                      role="note"
                    >
                      <ShieldCheck aria-hidden="true" size={16} />
                      <span>
                        <strong>Employee-linked access</strong>
                        {createFollowsEmployeeBranch
                          ? "Employee and Staff accounts use the employee’s assigned branch."
                          : "Choose the employee and active branch this account can access. This does not change the employee’s HR assignment."}
                      </span>
                    </div>
                    <label>
                      <ModalFieldLabel required>Employee</ModalFieldLabel>
                      <select
                        required
                        name="employeeId"
                        value={selectedEmployeeId}
                        disabled={
                          employeesQuery.isLoading || employeesQuery.isError
                        }
                        onChange={(event) => {
                          const nextEmployeeId = event.target.value;
                          const nextEmployee = (employeesQuery.data ?? []).find(
                            (employee) => employee.id === nextEmployeeId,
                          );
                          const hasActiveBranch = (
                            branchesQuery.data ?? []
                          ).some(
                            (branch) => branch.id === nextEmployee?.branchId,
                          );
                          setSelectedEmployeeId(nextEmployeeId);
                          setSelectedAccessBranchId(
                            hasActiveBranch
                              ? (nextEmployee?.branchId ?? "")
                              : "",
                          );
                        }}
                      >
                        <option value="">Select employee</option>
                        {(employeesQuery.data ?? []).map((employee) => (
                          <option
                            disabled={employee.hasUserAccount}
                            key={employee.id}
                            value={employee.id}
                          >
                            {employee.name} · {employee.employeeNumber}
                            {employee.hasUserAccount
                              ? " · User account already exists"
                              : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <ModalFieldLabel required>
                        Primary branch (from employee)
                      </ModalFieldLabel>
                      <select
                        required
                        name="branchId"
                        value={
                          createFollowsEmployeeBranch
                            ? (selectedEmployee?.branchId ?? "")
                            : selectedAccessBranchId
                        }
                        disabled={createFollowsEmployeeBranch || branchesQuery.isLoading || branchesQuery.isError}
                        onChange={(event) =>
                          setSelectedAccessBranchId(event.target.value)
                        }
                      >
                        <option value="">Select active branch</option>
                        {!createFollowsEmployeeBranch && roleSupportsAllBranches(
                          createRole as WorkspaceAccount["role"],
                        ) && <option value="ALL">All branches</option>}
                        {(branchesQuery.data ?? [])
                          .filter(
                            (branch) =>
                              !createFollowsEmployeeBranch ||
                              branch.id === selectedEmployee?.branchId,
                          )
                          .map((branch) => (
                            <option key={branch.id} value={branch.id}>
                              {branch.name}
                              {selectedEmployee?.branchId === branch.id
                                ? " · employee’s HR branch"
                                : ""}
                            </option>
                          ))}
                      </select>
                    </label>
                    {createFollowsEmployeeBranch && <input type="hidden" name="branchId" value={selectedEmployee?.branchId ?? ""} />}
                    {employeesQuery.isLoading && (
                      <p className={styles.fieldHint} role="status">
                        Loading employees…
                      </p>
                    )}
                    {branchesQuery.isLoading && (
                      <p className={styles.fieldHint} role="status">
                        Loading active branches…
                      </p>
                    )}
                    {employeesQuery.isError && (
                      <div className={styles.queryError} role="alert">
                        <span>
                          {employeesQuery.error instanceof Error
                            ? employeesQuery.error.message
                            : "Unable to load employees."}
                        </span>
                        <button
                          className={styles.secondaryButton}
                          disabled={employeesQuery.isFetching}
                          onClick={() => void employeesQuery.refetch()}
                          type="button"
                        >
                          {employeesQuery.isFetching ? "Retrying…" : "Retry"}
                        </button>
                      </div>
                    )}
                    {branchesQuery.isError && (
                      <div className={styles.queryError} role="alert">
                        <span>
                          {branchesQuery.error instanceof Error
                            ? branchesQuery.error.message
                            : "Unable to load active branches."}
                        </span>
                        <button
                          className={styles.secondaryButton}
                          disabled={branchesQuery.isFetching}
                          onClick={() => void branchesQuery.refetch()}
                          type="button"
                        >
                          {branchesQuery.isFetching ? "Retrying…" : "Retry"}
                        </button>
                      </div>
                    )}
                    {!employeesQuery.isLoading &&
                      !employeesQuery.isError &&
                      employeesQuery.data?.length === 0 && (
                        <p className={styles.fieldHint}>
                          No employees are available. Add an employee before
                          creating a linked account.
                        </p>
                      )}
                    {!branchesQuery.isLoading &&
                      !branchesQuery.isError &&
                      branchesQuery.data?.length === 0 && (
                        <p className={styles.fieldHint}>
                          No active branches are available. Activate a branch
                          before creating this account.
                        </p>
                      )}
                  </>
                )}
              </div>
            </fieldset>
            <fieldset className={styles.formSection}>
              <legend>Account details</legend>
              <div className={styles.formSectionFields}>
                {createRole === "SUPER_ADMIN" && (
                  <label>
                    <ModalFieldLabel required>Name</ModalFieldLabel>
                    <input
                      autoComplete="name"
                      defaultValue={linkedEmployeeName || ""}
                      name="name"
                      required
                      maxLength={200}
                    />
                  </label>
                )}
                {createRole === "SUPER_ADMIN" && (
                  <label>
                    <ModalFieldLabel required>Email</ModalFieldLabel>
                    <input
                      autoComplete="email"
                      defaultValue={linkedEmployeeEmail || ""}
                      name="email"
                      required
                      type="email"
                      maxLength={320}
                    />
                  </label>
                )}
                <AccountCredentialNotice />
              </div>
            </fieldset>
            {createError && (
              <p className={styles.formError} role="alert">
                {createError}
              </p>
            )}
            <div className={styles.modalActions}>
              <button
                className={styles.secondaryButton}
                disabled={isCreating}
                onClick={closeCreateAccountModal}
                type="button"
              >
                Cancel
              </button>
              <button
                className={styles.primaryButton}
                disabled={
                  isCreating ||
                  (createRole !== "SUPER_ADMIN" &&
                    (employeesQuery.isLoading ||
                      employeesQuery.isError ||
                      ((selectedAccessBranchId !== "ALL" ||
                        !roleSupportsAllBranches(
                          createRole as WorkspaceAccount["role"],
                        )) &&
                        (branchesQuery.isLoading || branchesQuery.isError))))
                }
                type="submit"
              >
                {isCreating
                  ? "Creating account…"
                  : createRole === "SUPER_ADMIN"
                    ? "Create Super Admin"
                    : "Create account"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {pendingDeactivation && (
        <Modal
          presentation="center"
          aria-labelledby="deactivate-account-title"
          className={`${styles.modal} ${styles.compactModal} ${directory.accountDialog}`}
          onClose={() => setPendingDeactivation(null)}
          busy={isActionPending}
        >
          <div className={styles.modalHeader}>
            <div>
              <h2 id="deactivate-account-title">Deactivate account?</h2>
            </div>
            <IconActionButton
              icon={X}
              label="Close"
              className={styles.closeButton}
              disabled={isActionPending}
              onClick={() => setPendingDeactivation(null)}
              type="button"
            />
          </div>
          <p className={styles.modalCopy}>
            This prevents {pendingDeactivation.name} from signing in. Existing
            records remain unchanged.
          </p>
          {actionError && (
            <p className={styles.formError} role="alert">
              {actionError}
            </p>
          )}
          <div className={styles.modalActions}>
            <button
              className={styles.secondaryButton}
              disabled={isActionPending}
              onClick={() => setPendingDeactivation(null)}
              type="button"
            >
              Cancel
            </button>
            <button
              className={styles.dangerButton}
              disabled={isActionPending}
              onClick={() =>
                void updateAccountStatus(pendingDeactivation, "INACTIVE")
              }
              type="button"
            >
              {isActionPending ? "Deactivating..." : "Deactivate account"}
            </button>
          </div>
        </Modal>
      )}
      {pendingActivation && (
        <Modal
          presentation="center"
          aria-labelledby="activate-account-title"
          className={`${styles.modal} ${styles.compactModal} ${directory.accountDialog}`}
          onClose={() => setPendingActivation(null)}
          busy={isActionPending}
        >
          <div className={styles.modalHeader}>
            <div>
              <h2 id="activate-account-title">Activate account?</h2>
            </div>
            <IconActionButton
              icon={X}
              label="Close"
              className={styles.closeButton}
              disabled={isActionPending}
              onClick={() => setPendingActivation(null)}
              type="button"
            />
          </div>
          <p className={styles.modalCopy}>
            Allow {pendingActivation.name} to sign in again.
          </p>
          {actionError && (
            <p className={styles.formError} role="alert">
              {actionError}
            </p>
          )}
          <div className={styles.modalActions}>
            <button
              className={styles.secondaryButton}
              disabled={isActionPending}
              onClick={() => setPendingActivation(null)}
              type="button"
            >
              Cancel
            </button>
            <button
              className={styles.primaryButton}
              disabled={isActionPending}
              onClick={() =>
                void updateAccountStatus(pendingActivation, "ACTIVE")
              }
              type="button"
            >
              {isActionPending ? "Activating..." : "Activate account"}
            </button>
          </div>
        </Modal>
      )}
      {pendingArchive && (
        <Modal
          presentation="center"
          aria-labelledby="archive-account-title"
          className={`${styles.modal} ${styles.compactModal} ${directory.accountDialog}`}
          onClose={() => setPendingArchive(null)}
          busy={isActionPending}
        >
          <div className={styles.modalHeader}>
            <div>
              <h2 id="archive-account-title">Archive account?</h2>
            </div>
            <IconActionButton
              icon={X}
              label="Close"
              className={styles.closeButton}
              disabled={isActionPending}
              onClick={() => setPendingArchive(null)}
              type="button"
            />
          </div>
          <p className={styles.modalCopy}>
            Archive {pendingArchive.name} to remove it from active account
            workflows. The account can be restored later.
          </p>
          {actionError && (
            <p className={styles.formError} role="alert">
              {actionError}
            </p>
          )}
          <div className={styles.modalActions}>
            <button
              className={styles.secondaryButton}
              disabled={isActionPending}
              onClick={() => setPendingArchive(null)}
              type="button"
            >
              Cancel
            </button>
            <button
              className={styles.dangerButton}
              disabled={isActionPending}
              onClick={() =>
                void updateAccountStatus(pendingArchive, "ARCHIVED")
              }
              type="button"
            >
              {isActionPending ? "Archiving..." : "Archive account"}
            </button>
          </div>
        </Modal>
      )}
      {pendingDelete && (
        <Modal
          presentation="center"
          aria-labelledby="delete-account-title"
          className={`${styles.modal} ${styles.compactModal} ${directory.accountDialog}`}
          onClose={() => setPendingDelete(null)}
          busy={isActionPending}
        >
          <div className={styles.modalHeader}>
            <div>
              <h2 id="delete-account-title">Delete account?</h2>
            </div>
            <IconActionButton
              icon={X}
              label="Close"
              className={styles.closeButton}
              disabled={isActionPending}
              onClick={() => setPendingDelete(null)}
              type="button"
            />
          </div>
          <p className={styles.modalCopy}>
            This permanently deletes {pendingDelete.name}. It is allowed only
            for archived accounts that are not linked to an employee and have no
            audit history.
          </p>
          {actionError && (
            <p className={styles.formError} role="alert">
              {actionError}
            </p>
          )}
          <div className={styles.modalActions}>
            <button
              className={styles.secondaryButton}
              disabled={isActionPending}
              onClick={() => setPendingDelete(null)}
              type="button"
            >
              Cancel
            </button>
            <button
              className={styles.dangerButton}
              disabled={isActionPending}
              onClick={() => void deleteAccount(pendingDelete)}
              type="button"
            >
              {isActionPending ? "Deleting..." : "Delete permanently"}
            </button>
          </div>
        </Modal>
      )}
      {credentialTarget && (
        <CredentialRegenerationDialog
          account={credentialTarget}
          pending={isActionPending}
          error={actionError}
          onClose={() => setCredentialTarget(null)}
          onSubmit={regenerateAccountCredentials}
        />
      )}
      {resetTarget && (
        <Modal
          aria-labelledby="reset-password-title"
          className={`${styles.modal} ${directory.accountDialog}`}
          onClose={() => setResetTarget(null)}
          busy={isActionPending}
        >
          <div className={styles.modalHeader}>
            <div>
              <h2 id="reset-password-title">Reset password</h2>
            </div>
            <IconActionButton
              icon={X}
              label="Close"
              className={styles.closeButton}
              disabled={isActionPending}
              onClick={() => setResetTarget(null)}
              type="button"
            />
          </div>
          <p className={styles.modalCopy}>
            Set a new initial password for {resetTarget.name}.
          </p>
          <form className={styles.accountForm} onSubmit={resetAccountPassword}>
            <label>
              <ModalFieldLabel required>New password</ModalFieldLabel>
              <input
                autoComplete="new-password"
                minLength={12}
                onChange={(event) => setNewPassword(event.target.value)}
                required
                type="password"
                value={newPassword}
              />
            </label>
            <small className={styles.fieldHint}>
              At least 12 characters with uppercase, lowercase, and a number.
            </small>
            {actionError && (
              <p className={styles.formError} role="alert">
                {actionError}
              </p>
            )}
            <div className={styles.modalActions}>
              <button
                className={styles.secondaryButton}
                disabled={isActionPending}
                onClick={() => setResetTarget(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className={styles.primaryButton}
                disabled={isActionPending}
                type="submit"
              >
                {isActionPending ? "Resetting..." : "Reset password"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
