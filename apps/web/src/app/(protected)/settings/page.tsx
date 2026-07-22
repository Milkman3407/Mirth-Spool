import type { Metadata } from "next";

import { HistorySettings } from "../../../components/history-settings";
import { readHistorySetting } from "../../../lib/actions/action-service";
import { getActionServices } from "../../../lib/actions/server";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const historyEnabled = await readHistorySetting(getActionServices());
  return (
    <div className="settings-page">
      <p className="eyebrow">Preferences</p>
      <h1>Settings</h1>
      <HistorySettings initialEnabled={historyEnabled} />
    </div>
  );
}
