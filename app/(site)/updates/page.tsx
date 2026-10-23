import type { Metadata } from "next";

import { PageHead } from "@/components/site/sections";
import { UpdatesForm } from "@/components/site/updates-form";

export const metadata: Metadata = {
  title: "Updates",
  description: "Get an email from Wallerstedt when new music comes out.",
};

export default function UpdatesPage() {
  return (
    <PageHead title="Get new songs first" center>
      <div style={{ marginTop: 32 }}>
        <UpdatesForm source="updates" />
      </div>
    </PageHead>
  );
}
