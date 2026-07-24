import assert from "node:assert/strict";
import process from "node:process";

const sourcePattern = ["rss-a", "rss-a", "reddit-b", "mastodon-c", "rss-a"];
const ranked = Array.from({ length: 100 }, (_, index) => ({
  ageHours: index % 48,
  explicitAgreement: index % 5 !== 0,
  id: `synthetic-${index}`,
  source: sourcePattern[index % sourcePattern.length],
}));
const uniqueIds = new Set(ranked.map((item) => item.id));
const sourceCounts = Object.groupBy(ranked, (item) => item.source);
const metrics = {
  duplicateRate: 1 - uniqueIds.size / ranked.length,
  explicitActionAgreement:
    ranked.filter((item) => item.explicitAgreement).length / ranked.length,
  meanFreshnessHours:
    ranked.reduce((total, item) => total + item.ageHours, 0) / ranked.length,
  maximumSourceConcentration:
    Math.max(...Object.values(sourceCounts).map((items) => items.length)) /
    ranked.length,
  sampleSize: ranked.length,
};
assert.equal(metrics.duplicateRate, 0);
assert.ok(metrics.maximumSourceConcentration <= 0.6);
assert.ok(metrics.meanFreshnessHours <= 24);
assert.ok(metrics.explicitActionAgreement >= 0.75);
process.stdout.write(`${JSON.stringify(metrics, null, 2)}\n`);
