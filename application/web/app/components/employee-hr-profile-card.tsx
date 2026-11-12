"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Pencil,
  RefreshCw,
  Search,
  ChevronDown,
  BriefcaseBusiness,
  UserRound,
} from "lucide-react";
import type { WorkspaceEmployee, WorkspaceRole } from "../data/people";
import { IconActionButton } from "./icon-action-button";
import { splitEmployeeName } from "./employee-directory-utils";
import { hrRequest } from "./people-workspace-services";
import { notifyError } from "../lib/notifications";
import type { EmployeeHrProfileApiRecord } from "./people-workspace-types";
import { employeeHrProfileDisplaySections } from "./employee-hr-profile-display";
import {
  EMPLOYMENT_OPTIONS,
  JOB_LEVEL_OPTIONS,
} from "./employee-employment-options";
import styles from "./employee-hr-profile-card.module.css";

type EmployeeHrProfileCardProps = {
  className?: string;
  embedded?: boolean;
  collapsible?: boolean;
  editorMode?: boolean;
  employee: WorkspaceEmployee;
  employeeId: string;
  hideHeader?: boolean;
  hideEditButton?: boolean;
  onEditorStatusChange?: (status: { ready: boolean; saving: boolean }) => void;
  role: WorkspaceRole | null;
  onNotice: (message: string) => void;
};

export default function EmployeeHrProfileCard({
  className,
  embedded = false,
  collapsible = false,
  editorMode = false,
  employee,
  employeeId,
  hideHeader = false,
  hideEditButton = false,
  onEditorStatusChange,
  role,
  onNotice,
}: EmployeeHrProfileCardProps) {
  const [search, setSearch] = useState("");
  const [allOpen, setAllOpen] = useState<boolean | null>(null);
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(editorMode);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const wasEditing = useRef(false);
  const canManageEmployees =
    role === "SUPER_ADMIN" || role === "HR_ADMIN" || role === "BRANCH_MANAGER";
  const canManageCompensation = role === "SUPER_ADMIN" || role === "HR_ADMIN";
  const canViewCompensation =
    canManageCompensation || role === "STAFF" || role === "EMPLOYEE";
  const canEdit = Boolean(role && role !== "IT_ADMIN");
  const employeeNameParts = splitEmployeeName(employee.name);
  const standardEmployment = EMPLOYMENT_OPTIONS.some(
    (option) => option.value === employee.employmentType,
  );
  const profileQuery = useQuery({
    queryKey: ["employee-hr-profile", employeeId],
    queryFn: () =>
      hrRequest<EmployeeHrProfileApiRecord | null>(
        "employees",
        `/${encodeURIComponent(employeeId)}/hr-profile`,
      ),
  });
  const profileMutation = useMutation({
    mutationFn: (values: Record<string, string | number | boolean | null>) =>
      hrRequest<EmployeeHrProfileApiRecord>(
        "employees",
        `/${encodeURIComponent(employeeId)}/hr-profile`,
        { method: "PATCH", body: JSON.stringify(values) },
      ),
    onSuccess: (updatedProfile) => {
      queryClient.setQueryData(
        ["employee-hr-profile", employeeId],
        updatedProfile,
      );
      setIsEditing(editorMode);
      onNotice("Employee HR profile updated.");
    },
    onError: (error: Error) => notifyError(error.message),
  });
  const sections = employeeHrProfileDisplaySections(
    profileQuery.data,
    employee,
    { canManageEmployees, canViewCompensation },
  );

  useEffect(() => {
    onEditorStatusChange?.({
      ready:
        editorMode &&
        isEditing &&
        !profileQuery.isLoading &&
        !profileQuery.isError,
      saving: profileMutation.isPending,
    });
  }, [
    editorMode,
    isEditing,
    onEditorStatusChange,
    profileMutation.isPending,
    profileQuery.isError,
    profileQuery.isLoading,
  ]);

  useEffect(() => {
    if (isEditing && !profileQuery.isLoading && !profileQuery.isError) {
      firstInputRef.current?.focus();
    } else if (wasEditing.current) {
      editButtonRef.current?.focus();
    }
    wasEditing.current = isEditing;
  }, [isEditing, profileQuery.isError, profileQuery.isLoading]);

  function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const values: Record<string, string | number | boolean | null> = {};
    formData.forEach((rawValue, key) => {
      const value = String(rawValue).trim();
      if (key === "basicSalary") {
        values[key] = value ? Number(value) : null;
      } else if (key === "probationary") {
        values[key] = value === "" ? null : value === "true";
      } else {
        values[key] = value || null;
      }
    });
    profileMutation.mutate(values);
  }

  return (
    <section
      aria-label={
        hideHeader
          ? editorMode
            ? "HR profile form"
            : "Employment and HR profile details"
          : undefined
      }
      aria-labelledby={hideHeader ? undefined : "employee-hr-profile-title"}
      data-employee-panel={
        embedded ? "embedded" : editorMode ? "editor" : "card"
      }
      className={[
        embedded ? styles.embedded : styles.panel,
        editorMode ? styles.modalEditor : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {!hideHeader && (
        <div className={styles.sectionTitle}>
          <h2 id="employee-hr-profile-title">HR profile</h2>
          {canEdit && !hideEditButton && !isEditing && (
            <IconActionButton
              disabled={
                profileQuery.isLoading ||
                profileQuery.isError ||
                profileMutation.isPending
              }
              icon={Pencil}
              label={profileQuery.data ? "Edit HR details" : "Add HR details"}
              onClick={() => {
                setIsEditing(true);
              }}
              ref={editButtonRef}
            />
          )}
        </div>
      )}

      {profileQuery.isLoading && (
        <p className={styles.mutedNote}>Loading HR profile…</p>
      )}
      {profileQuery.isError && (
        <div className={styles.queryError}>
          <p role="alert">{profileQuery.error.message}</p>
          <IconActionButton
            icon={RefreshCw}
            label="Retry loading HR profile"
            onClick={() => void profileQuery.refetch()}
          />
        </div>
      )}

      {!profileQuery.isLoading && !profileQuery.isError && isEditing && (
        <form
          className={[
            styles.profileForm,
            editorMode ? styles.modalEditorForm : "",
          ]
            .filter(Boolean)
            .join(" ")}
          id={editorMode ? `employee-hr-profile-form-${employeeId}` : undefined}
          onSubmit={saveProfile}
        >
          <fieldset className={styles.fieldGroup}>
            <legend>Personal details</legend>
            <div className={`${styles.formGrid} ${styles.personalFields}`}>
              {!editorMode && (
                <>
                  <label>
                    First name
                    <input
                      defaultValue={
                        profileQuery.data?.firstName ??
                        employeeNameParts.firstName
                      }
                      maxLength={100}
                      name="firstName"
                      ref={firstInputRef}
                    />
                  </label>
                  <label>
                    Middle name
                    <input
                      defaultValue={
                        profileQuery.data?.middleName ??
                        employeeNameParts.middleName
                      }
                      maxLength={100}
                      name="middleName"
                    />
                  </label>
                  <label>
                    Last name
                    <input
                      defaultValue={
                        profileQuery.data?.lastName ??
                        employeeNameParts.lastName
                      }
                      maxLength={100}
                      name="lastName"
                    />
                  </label>
                  <label>
                    Name suffix
                    <input
                      defaultValue={
                        profileQuery.data?.suffix ?? employeeNameParts.suffix
                      }
                      maxLength={30}
                      name="suffix"
                    />
                  </label>
                </>
              )}
              <label>
                Preferred name
                <input
                  defaultValue={profileQuery.data?.preferredName ?? ""}
                  maxLength={100}
                  name="preferredName"
                  ref={editorMode ? firstInputRef : undefined}
                />
              </label>
              <label>
                Date of birth
                <input
                  defaultValue={profileQuery.data?.dateOfBirth ?? ""}
                  name="dateOfBirth"
                  type="date"
                />
              </label>
              <label>
                Gender
                <ProfileChoice
                  name="gender"
                  value={profileQuery.data?.gender}
                  options={[
                    "Male",
                    "Female",
                    "Non-binary",
                    "Other",
                    "Prefer not to say",
                  ]}
                />
              </label>
              <label>
                Civil status
                <ProfileChoice
                  name="civilStatus"
                  value={profileQuery.data?.civilStatus}
                  options={[
                    "Single",
                    "Married",
                    "Widowed",
                    "Separated",
                    "Annulled",
                    "Divorced",
                    "Prefer not to say",
                  ]}
                />
              </label>
              <label>
                Nationality
                <input
                  defaultValue={profileQuery.data?.nationality ?? ""}
                  maxLength={100}
                  name="nationality"
                />
              </label>
              <label>
                Personal email
                <input
                  defaultValue={profileQuery.data?.personalEmail ?? ""}
                  maxLength={320}
                  name="personalEmail"
                  type="email"
                />
              </label>
              <label className={styles.formWide}>
                Current address
                <textarea
                  defaultValue={profileQuery.data?.currentAddress ?? ""}
                  maxLength={1000}
                  name="currentAddress"
                  rows={2}
                />
              </label>
              <label className={styles.formWide}>
                Permanent address
                <textarea
                  defaultValue={profileQuery.data?.permanentAddress ?? ""}
                  maxLength={1000}
                  name="permanentAddress"
                  rows={2}
                />
              </label>
            </div>
          </fieldset>

          {canManageEmployees && (
            <fieldset className={styles.fieldGroup}>
              <legend>Employment details</legend>
              <div className={styles.formGrid}>
                <label>
                  Job level
                  <select
                    defaultValue={profileQuery.data?.jobLevel ?? ""}
                    name="jobLevel"
                  >
                    <option value="">Select job level</option>
                    {profileQuery.data?.jobLevel &&
                      !JOB_LEVEL_OPTIONS.some(
                        (option) =>
                          option.value === profileQuery.data?.jobLevel,
                      ) && (
                        <option value={profileQuery.data.jobLevel}>
                          {profileQuery.data.jobLevel} (existing)
                        </option>
                      )}
                    {JOB_LEVEL_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Provisionary
                  <select
                    defaultValue={
                      standardEmployment
                        ? String(employee.employmentType === "PROBATIONARY")
                        : profileQuery.data?.probationary == null
                          ? ""
                          : String(profileQuery.data.probationary)
                    }
                    name="probationary"
                    disabled={standardEmployment}
                  >
                    <option value="">Not specified</option>
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                </label>
                <label>
                  Regularization date
                  <input
                    defaultValue={profileQuery.data?.regularizationDate ?? ""}
                    name="regularizationDate"
                    type="date"
                  />
                </label>
                <label>
                  Separation date
                  <input
                    defaultValue={profileQuery.data?.separationDate ?? ""}
                    name="separationDate"
                    type="date"
                  />
                </label>
                <label className={styles.formWide}>
                  Separation reason
                  <textarea
                    defaultValue={profileQuery.data?.separationReason ?? ""}
                    maxLength={1000}
                    name="separationReason"
                    rows={2}
                  />
                </label>
              </div>
            </fieldset>
          )}

          {canManageCompensation && (
            <fieldset className={styles.fieldGroup}>
              <legend>Compensation</legend>
              <div className={styles.formGrid}>
                <label>
                  Salary grade
                  <input
                    defaultValue={profileQuery.data?.salaryGrade ?? ""}
                    maxLength={100}
                    name="salaryGrade"
                  />
                </label>
                <label>
                  Base salary
                  <input
                    defaultValue={profileQuery.data?.basicSalary ?? ""}
                    min={0}
                    name="basicSalary"
                    step="0.01"
                    type="number"
                  />
                </label>
              </div>
            </fieldset>
          )}

          {!editorMode && (
            <div className={styles.formActions}>
              <button
                className={styles.secondaryButton}
                disabled={profileMutation.isPending}
                onClick={() => {
                  setIsEditing(false);
                }}
                type="button"
              >
                Cancel
              </button>
              <button
                className={styles.primaryButton}
                disabled={profileMutation.isPending}
                type="submit"
              >
                {profileMutation.isPending ? "Saving…" : "Save HR profile"}
              </button>
            </div>
          )}
        </form>
      )}

      {!profileQuery.isLoading && !profileQuery.isError && !isEditing && (
        <>
          {collapsible && (
            <div className={styles.profileToolbar}>
              <label>
                <Search size={16} aria-hidden="true" />
                <input
                  type="search"
                  aria-label="Search profile details"
                  placeholder="Find a field or detail..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <button
                type="button"
                onClick={() => setAllOpen(allOpen === true ? false : true)}
              >
                {allOpen === true ? "Collapse all" : "Expand all"}
              </button>
            </div>
          )}
          <div className={styles.profileSections}>
            {sections.length ? (
              sections
                .map((section) => ({
                  ...section,
                  fields:
                    !search.trim() ||
                    section.title
                      .toLowerCase()
                      .includes(search.toLowerCase().trim())
                      ? section.fields
                      : section.fields.filter((field) =>
                          `${field.label} ${field.value}`
                            .toLowerCase()
                            .includes(search.toLowerCase().trim()),
                        ),
                }))
                .filter((section) => section.fields.length > 0)
                .map((section, index) =>
                  collapsible ? (
                    <details
                      className={styles.collapsibleSection}
                      key={`${section.title}-${allOpen}-${Boolean(search.trim())}`}
                      open={search.trim() ? true : (allOpen ?? index < 2)}
                    >
                      <summary>
                        <span className={styles.groupIcon}>
                          {section.title === "Work information" ? (
                            <BriefcaseBusiness size={18} />
                          ) : (
                            <UserRound size={18} />
                          )}
                        </span>
                        <span>{section.title}</span>
                        <small>{section.fields.length} fields</small>
                        <ChevronDown
                          className={styles.disclosureIcon}
                          size={17}
                        />
                      </summary>
                      <dl className={styles.detailGrid}>
                        {section.fields.map((field) => (
                          <div className={styles.detailItem} key={field.label}>
                            <dt>{field.label}</dt>
                            <dd>{field.value}</dd>
                          </div>
                        ))}
                      </dl>
                    </details>
                  ) : (
                    <section
                      className={styles.profileSection}
                      key={section.title}
                    >
                      <h3>{section.title}</h3>
                      <dl className={styles.detailGrid}>
                        {section.fields.map((field) => (
                          <div className={styles.detailItem} key={field.label}>
                            <dt>{field.label}</dt>
                            <dd>{field.value}</dd>
                          </div>
                        ))}
                      </dl>
                    </section>
                  ),
                )
            ) : (
              <p className={styles.emptyState}>
                {profileQuery.data
                  ? "No HR profile details are available for this role."
                  : "No HR profile details added yet."}
              </p>
            )}
          </div>
          {search.trim() &&
            !sections.some((section) =>
              `${section.title} ${section.fields.map((f) => `${f.label} ${f.value}`).join(" ")}`
                .toLowerCase()
                .includes(search.toLowerCase().trim()),
            ) && (
              <p className={styles.emptyState}>
                No profile details match your search.
              </p>
            )}
        </>
      )}
    </section>
  );
}

function ProfileChoice({
  name,
  value,
  options,
}: {
  name: string;
  value?: string | null;
  options: string[];
}) {
  const saved = value ?? "";
  return (
    <select name={name} defaultValue={saved}>
      <option value="">Not specified</option>
      {saved && !options.includes(saved) && (
        <option value={saved}>{saved}</option>
      )}
      {options.map((option) => (
        <option value={option} key={option}>
          {option}
        </option>
      ))}
    </select>
  );
}
