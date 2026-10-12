import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

for (const mode of ["abs", "worldbank", "both"]) {
  test(`${mode} data notes refresh without a changelog and remain idempotent`, () => {
    const prefix = path.join(os.tmpdir(), "econ-tab-notes-");
    const temporary = mkdtempSync(prefix);
    try {
      mkdirSync(path.join(temporary, "tools"));
      mkdirSync(path.join(temporary, "data"));
      const script = path.join(temporary, "tools/record_data_refresh.mjs");
      copyFileSync(new URL("../tools/record_data_refresh.mjs", import.meta.url), script);
      writeFileSync(path.join(temporary, "data/quarterly.json"), JSON.stringify({
        snapshotDate: "2026-10-12", observationCount: 2,
        firstQuarter: "2020-Q1", latestQuarter: "2020-Q2",
      }));
      writeFileSync(path.join(temporary, "data/worldbank.json"), JSON.stringify({
        snapshotDate: "2026-10-12", commonFirstYear: 2001, commonLastYear: 2024,
        indicators: { cpi: { lastUpdated: "2026-10-08" }, income: { lastUpdated: "2026-07-13" } },
        countries: [
          { iso3: "DEU", firstYear: 2000, lastYear: 2025 },
          { iso3: "GBR", firstYear: 2001, lastYear: 2024 },
        ],
      }));
      const blocks = ["abs-data-status", "worldbank-data-status", "worldbank-coverage"];
      const before = "# Reusable project\n\n" + blocks.map((key) => `<!-- ${key}:start -->\nexisting ${key}\n<!-- ${key}:end -->`).join("\n\n") + "\n\n## Calculations\nKeep this explanation.\n";
      for (const name of ["README.md", "README.en.md"]) writeFileSync(path.join(temporary, name), before);
      execFileSync(process.execPath, [script, mode]);
      const updated = ["README.md", "README.en.md"].map((name) => readFileSync(path.join(temporary, name), "utf8"));
      for (const document of updated) {
        assert.ok(document.startsWith("# Reusable project\n"));
        assert.ok(document.endsWith("## Calculations\nKeep this explanation.\n"));
        assert.doesNotMatch(document, /Changelog|更新记录/);
        assert.match(document, /2026-10-12/);
        if (mode === "abs") assert.match(document, /existing worldbank-coverage/);
        else {
          assert.match(document, /2001[—–]2024/);
          assert.match(document, /2026-10-08/);
          assert.doesNotMatch(document, /existing worldbank-coverage/);
        }
      }
      if (mode !== "abs") {
        assert.match(updated[0], /德国.*2000—2025/);
        assert.match(updated[1], /United Kingdom.*2001–2024/);
      }
      execFileSync(process.execPath, [script, mode]);
      for (const [index, name] of ["README.md", "README.en.md"].entries()) {
        assert.equal(readFileSync(path.join(temporary, name), "utf8"), updated[index]);
      }
    } finally {
      assert.ok(path.resolve(temporary).startsWith(path.resolve(prefix)));
      rmSync(temporary, { recursive: true, force: true });
    }
  });
}
