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
