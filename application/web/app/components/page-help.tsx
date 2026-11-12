"use client";
import { useId, useState } from "react";
import { CircleHelp, X } from "lucide-react";
import { IconActionButton } from "./icon-action-button";
import { Modal } from "./ui/modal";
import { Button } from "./ui/button";
import styles from "./page-help.module.css";

export const pageGuides: Record<string, readonly [string, string, string]> = {
  "/": [
    "Start with the summary to see what needs attention.",
    "Open a module from the sidebar to view its records.",
    "Use the notification bell for updates that need your response.",
  ],
  "/hr": [
    "Review the employee and attendance summary.",
    "Choose the area you want to work on.",
    "Open a record to see its details and available actions.",
  ],
  "/employees": [
    "Search for an employee or narrow the list with filters.",
    "Open the employee’s record to see their details.",
    "Use Add employee to create a record when you have access.",
  ],
  "/employees/detail": [
    "Choose a section to view the employee’s information.",
    "Use Edit in a section to update its details when available.",
    "Review your changes before saving.",
  ],
  "/me": [
    "Choose a section to view your employee information.",
    "Check your schedule, documents and contact details.",
    "Contact HR if a detail you cannot edit needs correction.",
  ],
  "/my-profile": [
    "Review your personal and contact information.",
    "Use Edit where available to make changes.",
    "Save your changes when you are finished.",
  ],
  "/me/security": [
    "Enter your current password.",
    "Choose a new password that meets the displayed requirements.",
    "Update your password, then sign in again.",
  ],
  "/attendance": [
    "Choose a date or period to view attendance.",
    "Use filters to find the records you need.",
    "Use Official Business to file off-site work with estimated times and a reason. Approval adds dated OB coverage to DTR; original punches remain unchanged.",
  ],
  "/tasks": [
    "Find a task using search, filters or the status tabs.",
    "Open it to check the instructions and due date.",
    "Add your update or submit completed work for review.",
  ],
  "/incidents": [
    "Report an incident with the relevant details.",
    "Open a report to see its current step and available actions.",
    "Read any request for information and respond when needed.",
  ],
  "/my-leave": [
    "Check your available leave days.",
    "Choose Request leave and review the dates before submitting.",
    "Open a request to check its decision or respond to a proposed change.",
  ],
  "/leave": [
    "Find a request using search or filters.",
    "Open it to review the dates, reason and any messages.",
    "Approve, decline or respond to a requested change when allowed.",
  ],
  "/leave/balances": [
    "Choose the credit year and find the employee.",
    "Open View balances to see their leave days by type.",
    "View history to understand changes, or update credits when authorized.",
  ],
  "/leave/settings": [
    "Choose a leave type to review its rules.",
    "Edit the rules and effective date when authorized.",
    "Review eligibility and credit allocation before applying changes.",
  ],
  "/leave/reports": [
    "Choose the year and filters you need.",
    "Review the leave totals and breakdowns.",
    "Export the report when you are ready.",
  ],
  "/reservations": [
    "Check upcoming bookings and requests that need attention.",
    "Open the booking list to find a reservation.",
    "Open a booking to see its details and next action.",
  ],
  "/reservations/list": [
    "Find a booking using search or filters.",
    "Open it to check the space, dates and booking details.",
    "Use the available action to move the booking to its next step.",
  ],
  "/reservations/spaces": [
    "Review the spaces available for bookings.",
    "Open a space to view or edit its details when allowed.",
    "Keep capacity and availability information up to date.",
  ],
  "/reservations/reports": [
    "Choose the reporting period and filters.",
    "Review booking activity and totals.",
    "Export the results when needed.",
  ],
  "/reservations/settings": [
    "Review the current reservation settings.",
    "Change the settings available to your role.",
    "Check your entries before saving.",
  ],
  "/branches": [
    "Search for a branch or open it from the list.",
    "Review its contact details and assigned manager.",
    "Add or edit branch information when authorized.",
  ],
  "/system/users": [
    "Find the user account you want to manage.",
    "Open its details to review access and linked employee information.",
    "Save account changes or use the available password actions when needed.",
  ],
  "/system/module-access": [
    "Choose the user whose access you want to update.",
    "Set each page to View, Edit or No access as needed.",
    "Review the pending changes, then save.",
  ],
  "/system/password-reset-requests": [
    "Open a password reset request.",
    "Check the account and request details before deciding.",
    "Approve or decline, then issue temporary credentials when allowed.",
  ],
};

export function PageHelp({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const key = /^\/employees\/[^/]+$/.test(pathname)
    ? "/employees/detail"
    : pathname.replace(/\/$/, "") || "/";
  const parent = Object.keys(pageGuides)
    .filter((path) => path !== "/" && key.startsWith(`${path}/`))
    .sort((a, b) => b.length - a.length)[0];
  const steps = pageGuides[key] ?? pageGuides[parent];
  if (!steps) return null;
  return (
    <>
      <IconActionButton
        className={styles.trigger}
        icon={CircleHelp}
        label="How to use this page"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen(true)}
      />
      {open && (
        <Modal
          id={id}
          presentation="center"
          className={styles.dialog}
          aria-labelledby={`${id}-title`}
          onClose={() => setOpen(false)}
        >
          <header className={styles.header}>
            <span className={styles.icon}>
              <CircleHelp size={24} aria-hidden="true" />
            </span>
            <div>
              <p className={styles.eyebrow}>Quick guide</p>
              <h2 id={`${id}-title`}>How to use this page</h2>
            </div>
            <IconActionButton
              icon={X}
              label="Close page help"
              onClick={() => setOpen(false)}
            />
          </header>
          <ol className={styles.steps}>
            {steps.map((step, index) => (
              <li key={step}>
                <span aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <p>{step}</p>
              </li>
            ))}
          </ol>
          <footer className={styles.footer}>
            <Button onClick={() => setOpen(false)}>Got it</Button>
          </footer>
        </Modal>
      )}
    </>
  );
}
