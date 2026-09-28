export function calculateWindow(observations, startPeriod, endPeriod) {
  const startIndex = observations.findIndex((row) => row.period === startPeriod);
  const endIndex = observations.findIndex((row) => row.period === endPeriod);

  if (startIndex < 0 || endIndex < 0 || startIndex > endIndex) {
    throw new RangeError("Choose a start quarter no later than the end quarter.");
  }

  const rows = observations.slice(startIndex, endIndex + 1);
  const first = rows[0];
  const last = rows[rows.length - 1];
  const cpiGrowthPct = ((last.cpiIndex / first.cpiIndex) - 1) * 100;
  const wpiGrowthPct = ((last.wpiIndex / first.wpiIndex) - 1) * 100;

  return {
    rows: rows.map((row) => ({
      ...row,
      cpiNormalized: (row.cpiIndex / first.cpiIndex) * 100,
      wpiNormalized: (row.wpiIndex / first.wpiIndex) * 100,
    })),
    start: first,
    end: last,
    cpiGrowthPct,
    wpiGrowthPct,
    differencePp: wpiGrowthPct - cpiGrowthPct,
    cpiIndexed100: (100 * last.cpiIndex) / first.cpiIndex,
  };
}

export function formatQuarter(period) {
  const [year, quarter] = period.split("-Q");
  return `${year} Q${quarter}`;
}

// World Bank annual view: CPI (2010 = 100) against nominal GDP per capita in local currency.
// Both series are nominal, so the ratio of their rebased values approximates the change in
// GDP per person after CPI inflation.
export function calculateYearWindow(observations, startYear, endYear) {
  const startIndex = observations.findIndex((row) => row.year === startYear);
  const endIndex = observations.findIndex((row) => row.year === endYear);

  if (startIndex < 0 || endIndex < 0 || startIndex > endIndex) {
    throw new RangeError("Choose a start year no later than the end year, within the available years.");
  }

  const rows = observations.slice(startIndex, endIndex + 1);
  const first = rows[0];
  const last = rows[rows.length - 1];
  const cpiRatio = last.cpi / first.cpi;
  const incomeRatio = last.gdpPerCapita / first.gdpPerCapita;

  return {
    rows: rows.map((row) => ({
      ...row,
      cpiNormalized: (row.cpi / first.cpi) * 100,
      incomeNormalized: (row.gdpPerCapita / first.gdpPerCapita) * 100,
    })),
    start: first,
    end: last,
    cpiGrowthPct: (cpiRatio - 1) * 100,
    incomeGrowthPct: (incomeRatio - 1) * 100,
    differencePp: (incomeRatio - cpiRatio) * 100,
    cpiDeflatedIncomeGrowthPct: ((incomeRatio / cpiRatio) - 1) * 100,
    cpiIndexed100: 100 * cpiRatio,
  };
}

export function compareCountries(countries, startYear, endYear) {
  return countries.map((country) => {
    const available = country.firstYear <= startYear && country.lastYear >= endYear && startYear <= endYear;
    if (!available) return { iso3: country.iso3, available: false, firstYear: country.firstYear, lastYear: country.lastYear };
    const window = calculateYearWindow(country.observations, startYear, endYear);
    return {
      iso3: country.iso3,
      available: true,
      firstYear: country.firstYear,
      lastYear: country.lastYear,
      cpiGrowthPct: window.cpiGrowthPct,
      incomeGrowthPct: window.incomeGrowthPct,
      differencePp: window.differencePp,
      cpiDeflatedIncomeGrowthPct: window.cpiDeflatedIncomeGrowthPct,
    };
  });
}
