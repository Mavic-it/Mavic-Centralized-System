import { LoadingFields, LoadingTable } from "../components/content-loading";
import { PageHeading, PageHeader } from "../components/page-heading";
import type { InquirySection } from "./workspace";
import css from "./workspace.module.css";

const sectionTitles: Record<InquirySection, string> = {
  dashboard: "Inquiry Dashboard",
  list: "All Inquiries",
  followups: "Follow-ups",
  reports: "Inquiry Reports",
  settings: "Inquiry Settings",
};

const summaryCards = [
  "Total inquiries",
  "Active inquiries",
  "Follow-ups due today",
  "Conversion rate",
];

const mainFilters: Record<InquirySection, string[]> = {
  dashboard: ["Branch", "Inquiry date from", "Inquiry date to"],
  list: ["Search inquiries", "Branch", "Status"],
  followups: ["Branch", "Due date from", "Due date to"],
  reports: ["Branch", "Inquiry date from", "Inquiry date to"],
  settings: [],
};

export default function InquiryLoading({
  section = "list",
  contentOnly = false,
}: {
  section?: InquirySection;
  contentOnly?: boolean;
}) {
  const analytics = section === "dashboard" || section === "reports";
  const title = sectionTitles[section];

  return (
    <div className={css.workspace}>
      {!contentOnly && (
        <>
          <PageHeader className={css.top}>
            <div className={css.heroCopy}>
              <p className={css.eyebrow}>BUSINESS / INQUIRIES</p>
              <PageHeading>{title}</PageHeading>
              <p>Loading your inquiry workspace…</p>
            </div>
          </PageHeader>
          <div className={css.navSkeleton} aria-hidden="true">
            {["Dashboard", "All inquiries", "Follow-ups", "Reports", "Settings"].map(
              (tab) => <span key={tab} />,
            )}
          </div>
          {section !== "settings" && (
            <section className={`${css.panel} ${css.filterPanel}`}>
              <h2>Refine this view</h2>
              <LoadingFields
                label="Loading inquiry filters"
                labels={mainFilters[section]}
                input
                className={css.primaryFilters}
              />
            </section>
          )}
        </>
      )}
      {analytics ? (
        <div className={css.analytics}>
          <section className={css.summarySection} aria-label="Inquiry summary">
            <div className={css.summaryHeader}>
              <div>
                <h2>At a glance</h2>
                <p>Key activity for the filters you selected.</p>
              </div>
            </div>
            <div className={css.stats}>
              {summaryCards.map((title) => (
                <div className={`${css.card} ${css.stat}`} key={title}>
                  <LoadingFields label={`Loading ${title}`} labels={[title]} />
                </div>
              ))}
            </div>
          </section>
          <section className={`${css.panel} ${css.breakdownPanel}`}>
            <div className={css.breakdownHeader}>
              <div>
                <h2>{section === "reports" ? "Detailed report" : "Inquiry breakdown"}</h2>
                <p>Choose a view and explore the matching inquiries.</p>
              </div>
            </div>
            {section === "reports" ? (
              <LoadingTable
                label="Loading inquiry report"
                headers={["Group", "Inquiries", "Converted"]}
                rows={4}
              />
            ) : (
              <LoadingFields
                label="Loading inquiry breakdown"
                labels={["Status", "Count", "Distribution"]}
              />
            )}
          </section>
        </div>
      ) : section === "settings" ? (
        <section className={css.panel}>
          <LoadingFields
            label="Loading lookup form"
            labels={["Category", "Label", "Order", "State"]}
            input
          />
          <LoadingTable
            label="Loading inquiry settings"
            headers={["Category", "Label", "Order", "State", "Action"]}
          />
        </section>
      ) : section === "followups" ? (
        <section className={css.panel}>
          <LoadingFields
            label="Loading follow-up controls"
            labels={["Queue", "View"]}
            input
          />
          <LoadingTable
            label="Loading follow-ups"
            headers={["Inquiry", "Next action", "Due", "Assignee", "Status"]}
          />
        </section>
      ) : (
        <section className={css.panel}>
          <LoadingTable
            label="Loading inquiries"
            headers={[
              "Reference / Client",
              "Date",
              "Branch",
              "Services",
              "Status",
              "Assigned staff",
            ]}
          />
        </section>
      )}
    </div>
  );
}
