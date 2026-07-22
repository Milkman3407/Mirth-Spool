import type { Metadata } from "next";

import { HistorySettings } from "../../../components/history-settings";
import { CacheSettings } from "../../../components/cache-settings";
import { readHistorySetting } from "../../../lib/actions/action-service";
import { getActionServices } from "../../../lib/actions/server";
import { readCacheAdministration } from "../../../lib/cache/cache-service";
import { getCacheServices } from "../../../lib/cache/server";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [historyEnabled, cache] = await Promise.all([
    readHistorySetting(getActionServices()),
    readCacheAdministration(getCacheServices()),
  ]);
  return (
    <div className="settings-page">
      <p className="eyebrow">Preferences</p>
      <h1>Settings</h1>
      <HistorySettings initialEnabled={historyEnabled} />
      <CacheSettings initial={cache} />
    </div>
  );
}
