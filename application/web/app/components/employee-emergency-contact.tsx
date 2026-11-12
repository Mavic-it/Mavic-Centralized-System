"use client";

import { ChevronDown, Copy, Pencil, Phone, ShieldCheck, UserRound } from "lucide-react";
import { useState } from "react";
import type { WorkspaceEmployee } from "../data/people";
import contentStyles from "./employee-content.module.css";
import profileStyles from "./employee-hr-profile-card.module.css";

const provided = (value: string) => value && value !== "Not provided";

export function EmployeeEmergencyContact({
  employee,
  onEdit,
  id,
}: {
  employee: WorkspaceEmployee;
  onEdit: () => void;
  id?: string;
}) {
  const [feedback, setFeedback] = useState("");
  const contact = employee.emergencyContact;
  const phone = provided(contact.phone) ? contact.phone : "";
  const dial = phone.replace(/[^\d+]/g, "");

  return (
    <details id={id} className={profileStyles.collapsibleSection}>
      <summary>
        <span className={profileStyles.groupIcon}>
          <ShieldCheck size={18} />
        </span>
        <span>Emergency contact</span>
        <small>2 sections</small>
        <ChevronDown className={profileStyles.disclosureIcon} size={17} />
      </summary>
      <div className={profileStyles.emergencyContent}>
        <div className={contentStyles.header}>
          <div className={contentStyles.heading}>
            <div>
              <h2>Emergency contact</h2>
              <p className={contentStyles.description}>
                Someone to reach when it matters most.
              </p>
            </div>
          </div>
          <button
            className={contentStyles.button}
            onClick={onEdit}
            type="button"
            aria-label="Edit emergency contact"
          >
            <Pencil size={15} />
            Edit contact
          </button>
        </div>
        <div className={contentStyles.contactGrid}>
          <div className={contentStyles.surface}>
            <p className={contentStyles.eyebrow}>Primary emergency contact</p>
            <div className={contentStyles.person}>
              <span className={contentStyles.avatar}>
                {provided(contact.name) ? (
                  contact.name
                    .split(" ")
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((name) => name[0])
                    .join("")
                ) : (
                  <UserRound size={27} />
                )}
              </span>
              <div>
                <h3>
                  {provided(contact.name) ? contact.name : "Add a trusted contact"}
                </h3>
                <span className={contentStyles.badge}>
                  {provided(contact.relationship)
                    ? contact.relationship
                    : "Relationship not provided"}
                </span>
              </div>
            </div>
            <p className={contentStyles.description}>Phone</p>
            <strong>{phone || "Not provided"}</strong>
            <div className={contentStyles.actions}>
              {dial && (
                <a className={contentStyles.primary} href={`tel:${dial}`}>
                  <Phone size={15} />
                  Call contact
                </a>
              )}
              {phone && (
                <button
                  className={contentStyles.button}
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(phone);
                      setFeedback("Phone number copied.");
                    } catch {
                      setFeedback("Unable to copy. Select the phone number above.");
                    }
                  }}
                >
                  <Copy size={15} />
                  Copy number
                </button>
              )}
              {!phone && (
                <button className={contentStyles.primary} type="button" onClick={onEdit}>
                  Add contact details
                </button>
              )}
            </div>
          </div>
          <div className={contentStyles.surface}>
            <span className={contentStyles.icon}>
              <Phone size={21} />
            </span>
            <h3>Employee phone</h3>
            <p className={contentStyles.description}>The employee&apos;s own contact number.</p>
            <p>
              <strong>{employee.phone}</strong>
            </p>
            {provided(employee.phone) &&
              employee.phone.replace(/[^\d+]/g, "") && (
                <a
                  className={contentStyles.button}
                  href={`tel:${employee.phone.replace(/[^\d+]/g, "")}`}
                >
                  Call employee
                </a>
              )}
          </div>
        </div>
        <p role="status" className={contentStyles.description}>
          {feedback}
        </p>
      </div>
    </details>
  );
}
