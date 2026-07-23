import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { HistorySettings } from "../../../components/history-settings";
import { CacheSettings } from "../../../components/cache-settings";
import { ContentPreferences } from "../../../components/content-preferences";
import { GlobalPolicySettings } from "../../../components/global-policy-settings";
import {
  readSetting,
  readUserPreferences,
} from "../../../../../../packages/db/dist/index";
import { getAuthenticatedSession } from "../../../lib/auth/session";
import { getAuthServices } from "../../../lib/auth/server";
import { readCacheAdministration } from "../../../lib/cache/cache-service";
import { getCacheServices } from "../../../lib/cache/server";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const authentication = await getAuthenticatedSession(await headers());
  if (!authentication) redirect("/login");
  const [preferences, globalMaximumRating, recommendationWeights, cache] =
    await Promise.all([
      readUserPreferences(getAuthServices().database, authentication.user.id),
      readSetting(getAuthServices().database, "content.maximumRating"),
      readSetting(getAuthServices().database, "recommendations.weights"),
      authentication.user.role === "ADMIN"
        ? readCacheAdministration(getCacheServices())
        : Promise.resolve(null),
    ]);
  return (
    <div className="settings-page">
      <p className="eyebrow">Preferences</p>
      <h1>Settings</h1>
      <HistorySettings initialEnabled={preferences.historyEnabled} />
      <ContentPreferences
        globalMaximumRating={globalMaximumRating}
        initialFeedMode={
          preferences.defaultFeedMode as
            | "new"
            | "hot"
            | "random"
            | "unseen"
            | "for-you"
        }
        initialMaximumRating={preferences.maximumContentRating}
        initialRecommendationsEnabled={preferences.recommendationsEnabled}
      />
      {authentication.user.role === "ADMIN" ? (
        <>
          <GlobalPolicySettings
            initialMaximumRating={globalMaximumRating}
            initialRecommendationWeights={recommendationWeights}
          />
          {cache ? <CacheSettings initial={cache} /> : null}
        </>
      ) : null}
    </div>
  );
}
