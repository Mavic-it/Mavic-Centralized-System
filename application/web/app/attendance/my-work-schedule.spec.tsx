import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MyWorkSchedule } from "./my-work-schedule";

function render(client: QueryClient) {
  return renderToStaticMarkup(<QueryClientProvider client={client}><MyWorkSchedule role="HR_ADMIN"/></QueryClientProvider>);
}
describe("My work schedule in Attendance", () => {
  it("uses the linked own employee and keeps personal viewing read-only", () => {
    const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:Infinity}}});
    client.setQueryData(["attendance-own-employee"],{id:"own-employee"});
    client.setQueryData(["employee-work-schedule","own-employee"],{current:null,history:[]});
    const html=render(client);
    expect(html).toContain("Work schedule");
    expect(html).toContain("No recurring attendance schedule is effective today.");
    expect(html).not.toContain('aria-label="Assign schedule"');
    expect(html).not.toContain('aria-label="Change schedule"');
  });
  it("announces employee loading and provides retry on failure", () => {
    const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:Infinity}}});
    expect(render(client)).toContain("Loading your work schedule");
    client.setQueryData(["attendance-own-employee"],null);
    client.getQueryCache().find({queryKey:["attendance-own-employee"]})!.setState({status:"error",error:new Error("Service unavailable")});
    const html=render(client);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Retry");
  });
});
