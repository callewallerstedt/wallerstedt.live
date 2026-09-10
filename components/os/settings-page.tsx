import { RecordReminders } from "@/components/os/record-reminders";
import { AppearanceSettings, SignOutRow } from "@/components/os/settings";
import { PageFrame, PageTitle, Panel, Pill, Row } from "@/components/os/ui";
import type { OsSnapshot } from "@/lib/os/types";

export function SettingsPage({
  snapshot,
  accessKey,
}: {
  snapshot: OsSnapshot;
  accessKey: string;
}) {
  return (
    <PageFrame>
      <PageTitle aside="Appearance, reminders, company details and data sources.">Settings</PageTitle>
      <AppearanceSettings />
      <RecordReminders accessKey={accessKey} />

      <Panel title="Company">
        <Row primary="Name" value={snapshot.company.name} valueTone="muted" />
        <Row primary="VAT number" value={snapshot.company.vat} valueTone="muted" />
        <Row primary="Owner" value={snapshot.company.owner} valueTone="muted" />
      </Panel>

      <Panel title="Data sources" footer="Unconnected sources simply do not appear anywhere in the dashboard.">
        {snapshot.sources.map((source) => (
          <Row
            key={source.id}
            primary={source.label}
            secondary={source.detail}
            badge={source.wired ? <Pill tone="brand">Connected</Pill> : <Pill>Not connected</Pill>}
          />
        ))}
      </Panel>

      <SignOutRow accessKey={accessKey} />
    </PageFrame>
  );
}
