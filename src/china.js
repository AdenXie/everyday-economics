const INCOME_FIELDS = new Set(["disposableIncome", "wageIncome"]);

export async function loadChinaSnapshot() {
  const response = await fetch(new URL("../data/china-nbs.json", import.meta.url), { cache: "no-store" });
  if (!response.ok) throw new Error(`China NBS snapshot request failed: ${response.status}`);

  const snapshot = await response.json();
  if (!Number.isInteger(snapshot.firstYear) || !Number.isInteger(snapshot.lastYear) || !Array.isArray(snapshot.observations)) {
    throw new TypeError("China NBS snapshot has an invalid annual range.");
  }
  if (snapshot.observations.length < 2 || snapshot.observations[0].year !== snapshot.firstYear || snapshot.observations.at(-1).year !== snapshot.lastYear) {
    throw new TypeError("China NBS snapshot does not match its declared year range.");
  }

  for (let index = 0; index < snapshot.observations.length; index += 1) {
    const row = snapshot.observations[index];
    const previousYear = snapshot.observations[index - 1];
    if (!Number.isInteger(row.year) || (previousYear && row.year !== previousYear.year + 1)) {
      throw new TypeError("China NBS observations must cover consecutive years.");
    }
    if (![row.cpi, row.cpiPreviousYear, row.disposableIncome, row.wageIncome].every(value => Number.isFinite(value) && value > 0)) {
      throw new TypeError(`China NBS observation for ${row.year} is incomplete.`);
    }
  }
  return snapshot;
}

export function mapChinaObservations(snapshot, incomeField) {
  if (!INCOME_FIELDS.has(incomeField)) throw new RangeError("Choose a supported China resident-income measure.");
  return snapshot.observations.map(row => ({
    year: row.year,
    cpi: row.cpi,
    gdpPerCapita: row[incomeField],
  }));
}
