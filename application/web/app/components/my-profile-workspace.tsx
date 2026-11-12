"use client";

import { PageHeading, PageHeader } from "./page-heading";
import { RequiredMark } from "./required-mark";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Camera,
  LoaderCircle,
  Pencil,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { notifyError, notifySuccess } from "../lib/notifications";
import { useWorkspaceRole } from "./workspace-role-context";
import { hrRequest } from "./people-workspace-services";
import { useConfirmation } from "./ui/confirmation-provider";
import styles from "./my-profile-workspace.module.css";
import theme from "./ui/workspace-theme.module.css";
import { MyProfileLoading } from "./my-profile-loading";

type IndependentProfile = {
  firstName: string;
  middleName: string | null;
  lastName: string;
  displayName: string;
  dateOfBirth: string | null;
  gender: string | null;
  contactNumber: string;
  homeAddress: string;
  emergencyContactName: string | null;
  emergencyContactRelationship: string | null;
  emergencyContactNumber: string | null;
  profilePictureUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type OwnProfileResponse =
  | { mode: "employee"; employeeId: string }
  | {
      mode: "independent";
      account: {
        email: string;
        role: "SUPER_ADMIN";
        status: string;
        createdAt: string | null;
        lastLoginAt: string | null;
      };
      profile: IndependentProfile | null;
    };

type ProfileFormValues = {
  firstName: string;
  middleName: string;
  lastName: string;
  displayName: string;
  dateOfBirth: string;
  gender: string;
  contactNumber: string;
  homeAddress: string;
  emergencyContactName: string;
  emergencyContactRelationship: string;
  emergencyContactNumber: string;
};

const emptyForm: ProfileFormValues = {
  firstName: "",
  middleName: "",
  lastName: "",
  displayName: "",
  dateOfBirth: "",
  gender: "",
  contactNumber: "",
  homeAddress: "",
  emergencyContactName: "",
  emergencyContactRelationship: "",
  emergencyContactNumber: "",
};

const profileQueryKey = ["my-profile"] as const;
const maxPictureSize = 5 * 1024 * 1024;

function formFromProfile(
  profile: IndependentProfile | null,
): ProfileFormValues {
  if (!profile) return { ...emptyForm };
  return {
    firstName: profile.firstName,
    middleName: profile.middleName ?? "",
    lastName: profile.lastName,
    displayName: profile.displayName,
    dateOfBirth: profile.dateOfBirth ?? "",
    gender: profile.gender ?? "",
    contactNumber: profile.contactNumber,
    homeAddress: profile.homeAddress,
    emergencyContactName: profile.emergencyContactName ?? "",
    emergencyContactRelationship: profile.emergencyContactRelationship ?? "",
    emergencyContactNumber: profile.emergencyContactNumber ?? "",
  };
}

function formatDate(value: string | null): string {
  if (!value) return "Not recorded";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "Not recorded"
    : parsed.toLocaleDateString();
}

function formatDateTime(value: string | null): string {
  if (!value) return "Not recorded";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "Not recorded"
    : parsed.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
}

function initials(profile: IndependentProfile | null): string {
  if (!profile) return "SA";
  return `${profile.firstName.slice(0, 1)}${profile.lastName.slice(0, 1)}`.toUpperCase();
}

export default function MyProfileWorkspace() {
  const confirm = useConfirmation();
  const role = useWorkspaceRole();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isExistingProfileEditing, setIsExistingProfileEditing] =
    useState(false);
  const [draft, setDraft] = useState<ProfileFormValues | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pictureError, setPictureError] = useState<string | null>(null);
  const [pictureFailed, setPictureFailed] = useState(false);
  const pictureInputRef = useRef<HTMLInputElement>(null);

  const profileQuery = useQuery({
    queryKey: profileQueryKey,
    queryFn: () => hrRequest<OwnProfileResponse>("users", "/me/profile"),
    enabled: role === "SUPER_ADMIN",
    retry: false,
  });
  const independentData =
    profileQuery.data?.mode === "independent" ? profileQuery.data : null;
  const profile = independentData?.profile ?? null;
  const savedValues = formFromProfile(profile);
  const values = draft ?? savedValues;
  const isEditing = !profile || isExistingProfileEditing;
  const isDirty = Object.keys(values).some(
    (key) =>
      values[key as keyof ProfileFormValues] !==
      savedValues[key as keyof ProfileFormValues],
  );

  useEffect(() => {
    if (role && role !== "SUPER_ADMIN") router.replace("/me");
  }, [role, router]);

  useEffect(() => {
    if (profileQuery.data?.mode === "employee") {
      router.replace("/me");
      return;
    }
  }, [profileQuery.data, router]);

  useEffect(() => {
    if (!isEditing || !isDirty) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [isDirty, isEditing]);

  const saveMutation = useMutation({
    mutationFn: (input: ProfileFormValues) =>
      hrRequest<OwnProfileResponse>("users", "/me/profile", {
        method: "PATCH",
        body: JSON.stringify({
          ...input,
          middleName: input.middleName || null,
          dateOfBirth: input.dateOfBirth || null,
          gender: input.gender || null,
          emergencyContactName: input.emergencyContactName || null,
          emergencyContactRelationship:
            input.emergencyContactRelationship || null,
          emergencyContactNumber: input.emergencyContactNumber || null,
        }),
      }),
    onSuccess: (response) => {
      if (response.mode !== "independent") {
        router.replace("/me");
        return;
      }
      setDraft(null);
      setIsExistingProfileEditing(false);
      setFormError(null);
      queryClient.setQueryData(profileQueryKey, response);
      notifySuccess("Profile saved successfully.");
    },
    onError: (error: Error) => {
      setFormError(error.message);
      notifyError(error.message);
    },
  });

  const pictureMutation = useMutation({
    mutationFn: (file: File) => {
      const body = new FormData();
      body.set("file", file, file.name);
      return hrRequest<{ profilePictureUpdatedAt: string }>(
        "users",
        "/me/profile-picture",
        { method: "POST", body },
      );
    },
    onSuccess: async () => {
      setPictureError(null);
      setPictureFailed(false);
      await queryClient.invalidateQueries({ queryKey: profileQueryKey });
      notifySuccess("Profile picture updated.");
    },
    onError: (error: Error) => {
      setPictureError(error.message);
      notifyError(error.message);
    },
  });

  const removePictureMutation = useMutation({
    mutationFn: () =>
      hrRequest<{ removed: true }>("users", "/me/profile-picture", {
        method: "DELETE",
      }),
    onSuccess: async () => {
      setPictureError(null);
      setPictureFailed(false);
      await queryClient.invalidateQueries({ queryKey: profileQueryKey });
      notifySuccess("Profile picture removed.");
    },
    onError: (error: Error) => {
      setPictureError(error.message);
      notifyError(error.message);
    },
  });

  function handleChange(field: keyof ProfileFormValues, value: string) {
    setDraft((current) => ({ ...(current ?? savedValues), [field]: value }));
    setFormError(null);
  }

  const emergencyContactRequired = [
    values.emergencyContactName,
    values.emergencyContactRelationship,
    values.emergencyContactNumber,
  ].some((value) => value.trim());

  async function handleCancel() {
    if (
      isDirty &&
      !(await confirm({
        title: "Discard profile changes?",
        description: "Your unsaved changes will be lost.",
        confirmLabel: "Discard changes",
        tone: "danger",
      }))
    ) {
      return;
    }
    setDraft(null);
    setIsExistingProfileEditing(false);
    setFormError(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const emergencyFields = [
      values.emergencyContactName.trim(),
      values.emergencyContactRelationship.trim(),
      values.emergencyContactNumber.trim(),
    ];
    if (
      emergencyFields.some(Boolean) &&
      emergencyFields.some((value) => !value)
    ) {
      setFormError(
        "Complete all emergency contact fields or leave them blank.",
      );
      return;
    }
    saveMutation.mutate(values);
  }

  function handlePictureSelection(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!profile) {
      setPictureError("Save your profile before adding a picture.");
      return;
    }
    if (
      !(["image/jpeg", "image/png", "image/webp"] as string[]).includes(
        file.type,
      )
    ) {
      setPictureError("Choose a PNG, JPEG, or WebP image.");
      return;
    }
    if (file.size > maxPictureSize) {
      setPictureError("Choose an image that is 5 MB or smaller.");
      return;
    }
    setPictureError(null);
    pictureMutation.mutate(file);
  }

  async function handleRemovePicture() {
    if (
      await confirm({
        title: "Remove profile picture?",
        description:
          "Your profile will display your initials. You can upload another picture later.",
        confirmLabel: "Remove picture",
        tone: "danger",
      })
    ) {
      removePictureMutation.mutate();
    }
  }

  if (role !== "SUPER_ADMIN" || profileQuery.isLoading || !profileQuery.data) {
    if (profileQuery.isError) {
      return (
        <main className={`${theme.scope} ${styles.page}`}>
          <PageHeader className={styles.pageHeader}>
            <div>
              <p className={styles.pageEyebrow}>
                MY ACCOUNT / PERSONAL PROFILE
              </p>
              <PageHeading>My Profile</PageHeading>
              <p>Review and update your personal information.</p>
            </div>
          </PageHeader>
          <section className={styles.panel}>
            <div className={styles.errorState} role="alert">
              <p>
                {profileQuery.error instanceof Error
                  ? profileQuery.error.message
                  : "Your profile could not be loaded."}
              </p>
              <button
                className={styles.secondaryButton}
                onClick={() => void profileQuery.refetch()}
                type="button"
              >
                <RefreshCw aria-hidden="true" size={15} /> Retry
              </button>
            </div>
          </section>
        </main>
      );
    }
    return <MyProfileLoading />;
  }

  if (profileQuery.data.mode === "employee") {
    return (
      <main aria-live="polite" className={`${theme.scope} ${styles.page}`}>
        <section className={styles.panel}>
          <p className={styles.muted}>Opening your linked employee profile…</p>
        </section>
      </main>
    );
  }

  const { account } = profileQuery.data;
  const pictureUrl = profile?.profilePictureUpdatedAt
    ? `/api/users/me/profile-picture?v=${encodeURIComponent(profile.profilePictureUpdatedAt)}`
    : null;
  const today = new Date().toISOString().slice(0, 10);
  const isPictureBusy =
    pictureMutation.isPending || removePictureMutation.isPending;

  return (
    <main className={`${theme.scope} ${styles.page}`}>
      <PageHeader className={styles.pageHeader}>
        <div>
          <p className={styles.pageEyebrow}>MY ACCOUNT / PERSONAL PROFILE</p>
          <PageHeading>My Profile</PageHeading>
          <p>
            Manage your personal information. Account access details remain
            read-only here.
          </p>
        </div>
        {profile && !isEditing && (
          <button
            className={styles.primaryButton}
            onClick={() => setIsExistingProfileEditing(true)}
            type="button"
          >
            <Pencil aria-hidden="true" size={15} /> Edit profile
          </button>
        )}
      </PageHeader>

      <section
        aria-labelledby="profile-heading"
        className={`${styles.panel} ${styles.profilePanel}`}
      >
        <div className={styles.profileHeader}>
          <div className={styles.avatarControl}>
            <button
              aria-busy={isPictureBusy}
              aria-describedby="profile-photo-hint"
              aria-label={
                !profile
                  ? "Save your profile before adding a picture"
                  : isPictureBusy
                    ? "Updating profile picture"
                    : profile.profilePictureUpdatedAt
                      ? "Change profile picture"
                      : "Upload profile picture"
              }
              className={styles.avatarButton}
              disabled={
                !profile ||
                (isEditing && saveMutation.isPending) ||
                isPictureBusy
              }
              onClick={() => {
                setPictureError(null);
                pictureInputRef.current?.click();
              }}
              title={
                !profile
                  ? "Save your profile before adding a picture"
                  : profile.profilePictureUpdatedAt
                    ? "Change profile picture"
                    : "Upload profile picture"
              }
              type="button"
            >
              <span className={styles.avatarWrap}>
                {pictureUrl && !pictureFailed ? (
                  <Image
                    alt={`Profile picture for ${profile?.displayName ?? "your profile"}`}
                    className={styles.avatar}
                    fill
                    key={pictureUrl}
                    loading="eager"
                    onError={() => setPictureFailed(true)}
                    sizes="(max-width: 420px) 68px, 88px"
                    src={pictureUrl}
                    unoptimized
                  />
                ) : (
                  <span aria-hidden="true" className={styles.avatarFallback}>
                    {initials(profile)}
                  </span>
                )}
              </span>
              {profile && (
                <span className={styles.avatarUploadBadge} aria-hidden="true">
                  <Camera size={14} />
                </span>
              )}
              <span aria-hidden="true" className={styles.avatarUploadOverlay}>
                {isPictureBusy ? (
                  <LoaderCircle className={styles.spinner} size={18} />
                ) : (
                  <Camera size={18} />
                )}
                <span>
                  {isPictureBusy
                    ? "Updating"
                    : profile?.profilePictureUpdatedAt
                      ? "Change photo"
                      : "Upload photo"}
                </span>
              </span>
            </button>
            <input
              accept="image/png,image/jpeg,image/webp"
              aria-label="Choose a PNG, JPEG, or WebP profile picture"
              className={styles.hiddenFileInput}
              disabled={!profile || isPictureBusy || saveMutation.isPending}
              onChange={handlePictureSelection}
              ref={pictureInputRef}
              type="file"
            />
          </div>
          <div className={styles.profileIdentity}>
            <p className={styles.eyebrow}>PERSONAL PROFILE</p>
            <h2 id="profile-heading">
              {profile?.displayName || "Complete Your Profile"}
            </h2>
            <p>
              {profile
                ? "Your personal details and emergency contact information."
                : "Add your personal details and an optional emergency contact."}
            </p>
            <p id="profile-photo-hint" className={styles.photoHint}>
              {profile
                ? "Select your photo to update it. PNG, JPEG or WebP, up to 5 MB."
                : "Save your profile to enable photo uploads."}
            </p>
          </div>
        </div>
        {pictureError && (
          <p className={styles.inlineError} role="alert">
            {pictureError}
          </p>
        )}

        {isEditing ? (
          <form
            className={styles.profileForm}
            onSubmit={handleSubmit}
            aria-busy={saveMutation.isPending}
            aria-describedby={formError ? "my-profile-form-error" : undefined}
          >
            <fieldset disabled={saveMutation.isPending || isPictureBusy}>
              <legend>Basic Information</legend>
              <div className={styles.formGrid}>
                <label className={styles.field}>
                  <span>
                    First name <RequiredMark />
                  </span>
                  <input
                    autoComplete="given-name"
                    maxLength={100}
                    onChange={(event) =>
                      handleChange("firstName", event.target.value)
                    }
                    required
                    value={values.firstName}
                  />
                </label>
                <label className={styles.field}>
                  <span>Middle name</span>
                  <input
                    autoComplete="additional-name"
                    maxLength={100}
                    onChange={(event) =>
                      handleChange("middleName", event.target.value)
                    }
                    value={values.middleName}
                  />
                </label>
                <label className={styles.field}>
                  <span>
                    Last name <RequiredMark />
                  </span>
                  <input
                    autoComplete="family-name"
                    maxLength={100}
                    onChange={(event) =>
                      handleChange("lastName", event.target.value)
                    }
                    required
                    value={values.lastName}
                  />
                </label>
                <label className={styles.field}>
                  <span>
                    Display name <RequiredMark />
                  </span>
                  <input
                    autoComplete="nickname"
                    maxLength={150}
                    onChange={(event) =>
                      handleChange("displayName", event.target.value)
                    }
                    required
                    value={values.displayName}
                  />
                </label>
                <label className={styles.field}>
                  <span>Birthdate</span>
                  <input
                    autoComplete="bday"
                    max={today}
                    onChange={(event) =>
                      handleChange("dateOfBirth", event.target.value)
                    }
                    type="date"
                    value={values.dateOfBirth}
                  />
                </label>
                <label className={styles.field}>
                  <span>Gender</span>
                  <input
                    autoComplete="sex"
                    maxLength={50}
                    onChange={(event) =>
                      handleChange("gender", event.target.value)
                    }
                    value={values.gender}
                  />
                </label>
                <label className={styles.field}>
                  <span>
                    Contact number <RequiredMark />
                  </span>
                  <input
                    autoComplete="tel"
                    maxLength={50}
                    onChange={(event) =>
                      handleChange("contactNumber", event.target.value)
                    }
                    required
                    type="tel"
                    value={values.contactNumber}
                  />
                </label>
                <div className={styles.readOnlyField}>
                  <span>Email address</span>
                  <strong>{account.email}</strong>
                  <small>Update account email through User Access.</small>
                </div>
                <label className={`${styles.field} ${styles.fullWidth}`}>
                  <span>
                    Home address <RequiredMark />
                  </span>
                  <textarea
                    autoComplete="street-address"
                    maxLength={1000}
                    onChange={(event) =>
                      handleChange("homeAddress", event.target.value)
                    }
                    required
                    rows={3}
                    value={values.homeAddress}
                  />
                </label>
              </div>
            </fieldset>

            <fieldset disabled={saveMutation.isPending || isPictureBusy}>
              <legend>Emergency Contact</legend>
              <p className={styles.groupHint} id="emergency-contact-hint">
                If you add an emergency contact, complete all three fields.
              </p>
              <div className={styles.formGrid}>
                <label className={styles.field}>
                  <span>
                    Contact person{emergencyContactRequired && <RequiredMark />}
                  </span>
                  <input
                    required={emergencyContactRequired}
                    autoComplete="off"
                    maxLength={200}
                    aria-describedby="emergency-contact-hint"
                    onChange={(event) =>
                      handleChange("emergencyContactName", event.target.value)
                    }
                    value={values.emergencyContactName}
                  />
                </label>
                <label className={styles.field}>
                  <span>
                    Relationship{emergencyContactRequired && <RequiredMark />}
                  </span>
                  <input
                    required={emergencyContactRequired}
                    autoComplete="off"
                    aria-describedby="emergency-contact-hint"
                    maxLength={100}
                    onChange={(event) =>
                      handleChange(
                        "emergencyContactRelationship",
                        event.target.value,
                      )
                    }
                    value={values.emergencyContactRelationship}
                  />
                </label>
                <label className={styles.field}>
                  <span>
                    Contact number{emergencyContactRequired && <RequiredMark />}
                  </span>
                  <input
                    required={emergencyContactRequired}
                    autoComplete="off"
                    aria-describedby="emergency-contact-hint"
                    maxLength={50}
                    onChange={(event) =>
                      handleChange("emergencyContactNumber", event.target.value)
                    }
                    type="tel"
                    value={values.emergencyContactNumber}
                  />
                </label>
              </div>
            </fieldset>

            <fieldset disabled={saveMutation.isPending || isPictureBusy}>
              <legend>Profile Picture</legend>
              <div className={styles.pictureActions}>
                <span className={styles.muted}>
                  Use the profile photo above. PNG, JPEG, or WebP up to 5 MB.
                </span>
                {profile?.profilePictureUpdatedAt && (
                  <button
                    className={styles.textButton}
                    disabled={isPictureBusy}
                    onClick={handleRemovePicture}
                    type="button"
                  >
                    <Trash2 aria-hidden="true" size={14} /> Remove photo
                  </button>
                )}
              </div>
              {!profile && (
                <p className={styles.fieldHint}>
                  Save your profile before uploading a picture.
                </p>
              )}
            </fieldset>

            {formError && (
              <p
                id="my-profile-form-error"
                className={styles.inlineError}
                role="alert"
              >
                {formError}
              </p>
            )}
            {saveMutation.isPending && (
              <p className={styles.savingNote} role="status">
                <LoaderCircle
                  aria-hidden="true"
                  className={styles.spinner}
                  size={15}
                />{" "}
                Saving your profile…
              </p>
            )}
            <div className={styles.formActions}>
              <button
                className={styles.secondaryButton}
                disabled={saveMutation.isPending || isPictureBusy}
                onClick={handleCancel}
                type="button"
              >
                {profile ? "Cancel" : "Clear form"}
              </button>
              <button
                className={styles.primaryButton}
                disabled={saveMutation.isPending || isPictureBusy || !isDirty}
                type="submit"
              >
                {saveMutation.isPending ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className={styles.spinner}
                    size={15}
                  />
                ) : null}
                {profile ? "Save changes" : "Save profile"}
              </button>
            </div>
          </form>
        ) : (
          <>
            <section
              aria-labelledby="basic-information-title"
              className={styles.readOnlySection}
            >
              <h3 id="basic-information-title">Basic Information</h3>
              <dl className={styles.detailGrid}>
                <div>
                  <dt>First name</dt>
                  <dd>{profile?.firstName}</dd>
                </div>
                <div>
                  <dt>Middle name</dt>
                  <dd>{profile?.middleName || "Not provided"}</dd>
                </div>
                <div>
                  <dt>Last name</dt>
                  <dd>{profile?.lastName}</dd>
                </div>
                <div>
                  <dt>Display name</dt>
                  <dd>{profile?.displayName}</dd>
                </div>
                <div>
                  <dt>Birthdate</dt>
                  <dd>{formatDate(profile?.dateOfBirth ?? null)}</dd>
                </div>
                <div>
                  <dt>Gender</dt>
                  <dd>{profile?.gender || "Not provided"}</dd>
                </div>
                <div>
                  <dt>Contact number</dt>
                  <dd>{profile?.contactNumber}</dd>
                </div>
                <div>
                  <dt>Email address</dt>
                  <dd>
                    {account.email}
                    <small>
                      Account email changes are managed through User Access.
                    </small>
                  </dd>
                </div>
                <div className={styles.fullWidth}>
                  <dt>Home address</dt>
                  <dd>{profile?.homeAddress}</dd>
                </div>
              </dl>
            </section>
            <section
              aria-labelledby="emergency-contact-title"
              className={styles.readOnlySection}
            >
              <h3 id="emergency-contact-title">Emergency Contact</h3>
              {profile?.emergencyContactName ? (
                <dl className={styles.detailGrid}>
                  <div>
                    <dt>Contact person</dt>
                    <dd>{profile.emergencyContactName}</dd>
                  </div>
                  <div>
                    <dt>Relationship</dt>
                    <dd>{profile.emergencyContactRelationship}</dd>
                  </div>
                  <div>
                    <dt>Contact number</dt>
                    <dd>{profile.emergencyContactNumber}</dd>
                  </div>
                </dl>
              ) : (
                <p className={styles.muted}>No emergency contact added.</p>
              )}
            </section>
          </>
        )}
      </section>

      <section
        aria-labelledby="account-information-title"
        className={styles.panel}
      >
        <div className={styles.sectionHeading}>
          <ShieldCheck aria-hidden="true" size={18} />
          <div>
            <h2 id="account-information-title">Account Information</h2>
            <p>Security-sensitive account details are read-only here.</p>
          </div>
        </div>
        <dl className={styles.accountGrid}>
          <div>
            <dt>User role</dt>
            <dd>Super Admin</dd>
          </div>
          <div>
            <dt>Account status</dt>
            <dd>
              <span
                className={`${styles.statusPill} ${account.status === "ACTIVE" ? styles.statusActive : styles.statusNeutral}`}
              >
                {account.status.replaceAll("_", " ")}
              </span>
            </dd>
          </div>
          <div>
            <dt>Date created</dt>
            <dd>{formatDate(account.createdAt)}</dd>
          </div>
          <div>
            <dt>Last login</dt>
            <dd>{formatDateTime(account.lastLoginAt)}</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
