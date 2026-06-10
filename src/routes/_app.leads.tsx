import { createFileRoute } from "@tanstack/react-router";
import { LeadsView } from "@/components/leads-view";

export const Route = createFileRoute("/_app/leads")({
  head: () => ({ meta: [{ title: "Leads — Husada CRM" }] }),
  component: () => <LeadsView mineOnly={false} />,
});
