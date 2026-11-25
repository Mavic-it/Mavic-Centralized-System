"use client";
import { FormLayout } from "@/app/components/ui/form-layout";
import { useState, type FormEvent } from "react";
import { Modal } from "../components/ui/modal";
import { inquiryApi, type Detail, type Inquiry, type Metadata } from "./types";
import css from "./workspace.module.css";

export function InquiryForm({
  meta,
  record,
  onClose,
  onSaved,
}: {
  meta: Metadata;
  record?: Inquiry;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [branch, setBranch] = useState(
    record?.branchId ?? meta.branches[0]?.id ?? "",
  );
  const [preferred, setPreferred] = useState(
    record?.preferredBranchIds ?? (branch ? [branch] : []),
  );
  const [services, setServices] = useState(record?.serviceIds ?? []);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [matches, setMatches] = useState<
    { id: string; name: string; email: string; phone: string }[]
  >([]);
  const [searchingCustomers, setSearchingCustomers] = useState(false);
  const [customerSearchComplete, setCustomerSearchComplete] = useState(false);
  const [customer, setCustomer] = useState(record?.customerId ?? ""),
    [clientName, setClientName] = useState(record?.clientName ?? "");
  const [contacts, setContacts] = useState({
    email: record?.client.email ?? "",
    phone: record?.client.phone ?? "",
  });
  const choices = (kind: string) =>
    meta.lookups.filter(
      (l) =>
        l.kind === kind &&
        (l.active ||
          [
            record?.channelId,
            record?.sourceId,
            ...(record?.serviceIds ?? []),
          ].includes(l.id)),
    );
  const [nextAction, setNextAction] = useState(record?.nextAction ?? "");
  const required = (
    <span className={css.required} aria-hidden="true">
      *
    </span>
  );
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const f = new FormData(e.currentTarget);
    const text = (key: string) => String(f.get(key) ?? "").trim() || undefined;
    try {
      const followUpAt = text("followUpAt"),
        preferredStart = text("preferredStart"),
        preferredEnd = text("preferredEnd");
      const d = await inquiryApi<Detail>(
        record ? `/${record.id}` : "",
        {
          branchId: branch,
          clientName,
          customerId: customer || undefined,
          companyName: text("companyName"),
          contactPerson: text("contactPerson"),
          email: contacts.email || undefined,
          phone: contacts.phone || undefined,
          inquiryDate: text("inquiryDate"),
          preferredBranchIds: preferred,
          serviceIds: services,
          channelId: text("channelId"),
          sourceId: text("sourceId"),
          assignedStaffId: text("assignedStaffId"),
          priority: text("priority"),
          initialStatus: record ? undefined : text("initialStatus"),
          description: text("description"),
          requirements: text("requirements"),
          notes: text("notes"),
          budget: text("budget") ? Number(text("budget")) : undefined,
          pax: text("pax") ? Number(text("pax")) : undefined,
          preferredStart: preferredStart
            ? new Date(preferredStart).toISOString()
            : undefined,
          preferredEnd: preferredEnd
            ? new Date(preferredEnd).toISOString()
            : undefined,
          nextAction: text("nextAction"),
          followUpAt: followUpAt
            ? new Date(followUpAt).toISOString()
            : undefined,
          actionTaken: text("actionTaken"),
          version: record?.version,
        },
        record ? "PATCH" : "POST",
      );
      onSaved(d.record.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save inquiry.");
    } finally {
      setBusy(false);
    }
  }
  const localDate = (v: string | null | undefined) =>
    v
      ? new Date(+new Date(v) - new Date(v).getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 16)
      : "";
  return (
    <Modal
      className={css.dialog}
      aria-labelledby="inquiry-form-title"
      onClose={onClose}
      busy={busy}
      presentation="drawer"
    >
      <FormLayout frame="flush" className={css.inquiryForm} onSubmit={submit}>
        <div className={css.formHeader}>
          <div>
            <h2 id="inquiry-form-title">
              {record ? "Edit inquiry" : "Create inquiry"}
            </h2>
            <p>Capture the client’s request and plan the next step.</p>
          </div>
          <button
            className={css.closeButton}
            type="button"
            aria-label="Close inquiry form"
            onClick={onClose}
            disabled={busy}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <div className={css.formBody}>
          {error && (
            <div role="alert" className={css.error}>
              {error}
            </div>
          )}
          <fieldset className={css.formSection} disabled={busy}>
            <legend>Client details</legend>
            <p className={css.sectionHint}>
              Add the person and contact details for this request.
            </p>
            <div className={css.formFields}>
              <label>
                <span className={css.labelText}>Client name {required}</span>
                <input
                  required
                  maxLength={200}
                  value={clientName}
                  onChange={(e) => {
                    setClientName(e.target.value);
                    setCustomer("");
                    setMatches([]);
                    setCustomerSearchComplete(false);
                  }}
                />
              </label>
              <label>
                Company name
                <input
                  name="companyName"
                  maxLength={200}
                  defaultValue={record?.client.companyName}
                />
              </label>
              <label>
                Contact person
                <input
                  name="contactPerson"
                  maxLength={200}
                  defaultValue={record?.client.contactPerson}
                />
              </label>
              <label>
                Email address
                <input
                  type="email"
                  maxLength={320}
                  value={contacts.email}
                  onChange={(e) => {
                    setContacts({ ...contacts, email: e.target.value });
                    setMatches([]);
                    setCustomerSearchComplete(false);
                  }}
                />
              </label>
              <label>
                Contact number
                <input
                  type="tel"
                  maxLength={50}
                  value={contacts.phone}
                  onChange={(e) => {
                    setContacts({ ...contacts, phone: e.target.value });
                    setMatches([]);
                    setCustomerSearchComplete(false);
                  }}
                />
              </label>
              <div className={`${css.customerLookup} ${css.full}`}>
                <div>
                  <strong>Existing customer</strong>
                  <p>Search by name, email or phone to link a customer record.</p>
                </div>
                <button
                  type="button"
                  disabled={
                    searchingCustomers ||
                    !branch ||
                    !(clientName.trim() || contacts.email.trim() || contacts.phone.trim())
                  }
                  onClick={async () => {
                    setError("");
                    setSearchingCustomers(true);
                    try {
                      setMatches(
                        await inquiryApi(
                          `/customers?branchId=${encodeURIComponent(branch)}&search=${encodeURIComponent(contacts.email.trim() || contacts.phone.trim() || clientName.trim())}`,
                        ),
                      );
                      setCustomerSearchComplete(true);
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setSearchingCustomers(false);
                    }
                  }}
                >
                  {searchingCustomers ? "Searching…" : "Find customer"}
                </button>
                {customer && (
                  <p className={css.linkedCustomer} role="status">
                    Existing customer linked
                  </p>
                )}
                {customerSearchComplete && matches.length === 0 && !customer && (
                  <p className={css.lookupMessage} role="status">
                    No matching customers found. You can continue with these details.
                  </p>
                )}
                {matches.length > 0 && (
                  <div className={css.matchResults} aria-live="polite">
                    <span className={css.matchHeading}>Matching customers</span>
                    {matches.map((c) => (
                      <button
                        className={css.matchButton}
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setCustomer(c.id);
                          setClientName(c.name);
                          setContacts({ email: c.email ?? "", phone: c.phone ?? "" });
                          setMatches([]);
                          setCustomerSearchComplete(false);
                        }}
                      >
                        <span>{c.name}</span>
                        <span className={css.matchContact}>{c.email || c.phone}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </fieldset>

          <fieldset className={css.formSection} disabled={busy}>
            <legend>Inquiry details</legend>
            <p className={css.sectionHint}>
              Record when and how the inquiry came in, plus a short summary.
            </p>
            <div className={css.formFields}>
              <label>
                <span className={css.labelText}>Inquiry date {required}</span>
                <input
                  name="inquiryDate"
                  type="date"
                  required
                  defaultValue={
                    record?.inquiryDate ??
                    new Intl.DateTimeFormat("en-CA", {
                      timeZone: "Asia/Manila",
                    }).format(new Date())
                  }
                />
              </label>
              <label>
                <span className={css.labelText}>Handling branch {required}</span>
                <select
                  required
                  value={branch}
                  disabled={!!record}
                  onChange={(e) => {
                    setBranch(e.target.value);
                    setPreferred([e.target.value]);
                    setCustomer("");
                    setMatches([]);
                    setCustomerSearchComplete(false);
                  }}
                >
                  {meta.branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className={css.labelText}>Inquiry channel {required}</span>
                <select
                  name="channelId"
                  required
                  defaultValue={record?.channelId ?? ""}
                >
                  <option value="">Select channel</option>
                  {choices("CHANNEL").map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Marketing source
                <select name="sourceId" defaultValue={record?.sourceId ?? ""}>
                  <option value="">Select source</option>
                  {choices("SOURCE").map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={css.full}>
                Inquiry description
                <textarea
                  name="description"
                  maxLength={5000}
                  defaultValue={record?.description}
                  placeholder="What does the client need?"
                />
              </label>
            </div>
          </fieldset>

          <fieldset className={css.formSection} disabled={busy}>
            <legend>Space preferences</legend>
            <p className={css.sectionHint}>
              Choose the branches and services that fit the client’s plans.
            </p>
            <div className={css.formFields}>
              <div
                className={`${css.choiceGroup} ${css.full}`}
                role="group"
                aria-labelledby="preferred-branches-label"
                aria-describedby="preferred-branches-hint"
              >
                <p id="preferred-branches-label" className={css.fieldTitle}>
                  Preferred branches {required}
                </p>
                <p id="preferred-branches-hint" className={css.choiceHint}>
                  Select at least one branch.
                </p>
                <div className={css.checks}>
                  {meta.branches.map((b) => (
                    <label key={b.id}>
                      <input
                        type="checkbox"
                        checked={preferred.includes(b.id)}
                        onChange={(e) =>
                          setPreferred(
                            e.target.checked
                              ? [...preferred, b.id]
                              : preferred.filter((id) => id !== b.id),
                          )
                        }
                      />
                      {b.name}
                    </label>
                  ))}
                </div>
              </div>
              <div
                className={`${css.choiceGroup} ${css.full}`}
                role="group"
                aria-labelledby="services-label"
                aria-describedby="services-hint"
              >
                <p id="services-label" className={css.fieldTitle}>
                  Interested services {required}
                </p>
                {choices("SERVICE").length ? (
                  <>
                    <p id="services-hint" className={css.choiceHint}>
                      Select at least one service.
                    </p>
                    <div className={css.checks}>
                      {choices("SERVICE").map((l) => (
                        <label key={l.id}>
                          <input
                            type="checkbox"
                            checked={services.includes(l.id)}
                            onChange={(e) =>
                              setServices(
                                e.target.checked
                                  ? [...services, l.id]
                                  : services.filter((id) => id !== l.id),
                              )
                            }
                          />
                          {l.label}
                        </label>
                      ))}
                    </div>
                  </>
                ) : (
                  <p id="services-hint" className={css.lookupMessage}>
                    No services are available. Ask an administrator to add service options.
                  </p>
                )}
              </div>
              <label>
                Guests / pax
                <input
                  name="pax"
                  type="number"
                  min={1}
                  max={10000}
                  defaultValue={record?.pax ?? ""}
                />
              </label>
              <label>
                Budget
                <input
                  name="budget"
                  type="number"
                  min={0}
                  max={9999999999}
                  step="0.01"
                  defaultValue={record?.budget ?? ""}
                />
              </label>
              <label>
                Preferred start
                <input
                  name="preferredStart"
                  type="datetime-local"
                  defaultValue={localDate(record?.preferredStart)}
                />
              </label>
              <label>
                Preferred end
                <input
                  name="preferredEnd"
                  type="datetime-local"
                  defaultValue={localDate(record?.preferredEnd)}
                />
              </label>
              <label className={css.full}>
                Client requirements
                <textarea
                  name="requirements"
                  maxLength={5000}
                  defaultValue={record?.requirements}
                  placeholder="Include capacity, layout or other requests."
                />
              </label>
            </div>
          </fieldset>

          <fieldset className={css.formSection} disabled={busy}>
            <legend>Ownership and follow-up</legend>
            <p className={css.sectionHint}>
              Assign an owner and make the next contact easy to track.
            </p>
            <div className={css.formFields}>
              <label>
                <span className={css.labelText}>Assigned staff {required}</span>
                <select
                  required
                  name="assignedStaffId"
                  defaultValue={record?.assignedStaffId ?? meta.userId}
                >
                  {meta.staff
                    .filter(
                      (s) =>
                        (!s.branchId || s.branchId === branch) &&
                        (meta.permissions.assign ||
                          s.id === (record?.assignedStaffId ?? meta.userId)),
                    )
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
              </label>
              {!record && (
                <label>
                  Initial status
                  <select name="initialStatus">
                    {[
                      "NEW",
                      "IN_PROGRESS",
                      "FOLLOW_UP",
                      "NO_RESPONSE",
                      "OCULAR_SCHEDULED",
                      "PROPOSAL_SENT",
                    ].map((v) => (
                      <option key={v} value={v}>
                        {v.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                Priority
                <select
                  name="priority"
                  defaultValue={record?.priority ?? "NORMAL"}
                >
                  {["LOW", "NORMAL", "HIGH", "URGENT"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label>
                Next action
                <input
                  name="nextAction"
                  list="inquiry-actions"
                  maxLength={1000}
                  value={nextAction}
                  onChange={(e) => setNextAction(e.target.value)}
                />
                <datalist id="inquiry-actions">
                  {choices("ACTION").map((l) => (
                    <option key={l.id} value={l.label} />
                  ))}
                </datalist>
              </label>
              <label>
                Follow-up date and time
                <input
                  type="datetime-local"
                  name="followUpAt"
                  required={/follow.?up|ocular|schedule/i.test(nextAction)}
                />
              </label>
              {!record && (
                <label className={css.full}>
                  Action taken
                  <textarea name="actionTaken" maxLength={5000} />
                </label>
              )}
              <label className={css.full}>
                Notes and remarks
                <textarea
                  name="notes"
                  maxLength={5000}
                  defaultValue={record?.notes}
                />
              </label>
            </div>
          </fieldset>
        </div>
        <div className={css.formFooter}>
          <p>Required fields are marked {required}</p>
          <div className={css.formActions}>
            <button
              className={css.secondary}
              type="button"
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              className={css.primary}
              disabled={busy || !services.length || !preferred.length}
              type="submit"
            >
              {busy ? "Saving…" : record ? "Save changes" : "Save inquiry"}
            </button>
          </div>
        </div>
      </FormLayout>
    </Modal>
  );
}
