import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  amountDigits, buildPriceSeries, CURRENCY_REFORMS, defaultTimeRange, idleCashPath, NO_REFORM_REGIONS, pathExtremes,
  readTimeMachineParams, reformFor, timeMachineShareUrl, timeTravel, TIME_MACHINE_REGIONS, toCurrentUnits,
} from "../src/time-machine.js";

const load = file => JSON.parse(readFileSync(new URL(`../data/${file}`, import.meta.url), "utf8"));
const data = { quarterly: load("quarterly.json"), worldBank: load("worldbank.json"), china: load("china-nbs.json") };
const close = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≈ ${expected}`);
const wb = (iso3, year) => data.worldBank.countries.find(country => country.iso3 === iso3).observations.find(row => row.year === year).cpi;

test("Australia uses ABS quarterly CPI from the first to the latest quarter", () => {
  const series = buildPriceSeries("AUS", data);
  assert.equal(series.kind, "quarterly");
  const result = timeTravel(series, { from: "1997-Q3", to: "2026-Q2", amount: 100 });
  assert.equal(result.fromCpi, 46.28);
  assert.equal(result.toCpi, 102.31);
  close(result.result, 100 * 102.31 / 46.28);
  close(result.cumulativePct, (102.31 / 46.28 - 1) * 100);
  assert.equal(result.years, 115 / 4);
  close(result.annualPct, ((102.31 / 46.28) ** (4 / 115) - 1) * 100);
  assert.equal(result.direction, "forward");
  assert.equal(result.trend, "inflation");
  assert.ok(result.idleCashPct < 0);
});

test("travelling backwards divides by the same CPI ratio and keeps annual inflation positive", () => {
  const series = buildPriceSeries("AUS", data);
  const back = timeTravel(series, { from: "2026-Q2", to: "2000-Q1", amount: "100" });
  const startCpi = data.quarterly.observations.find(row => row.period === "2000-Q1").cpiIndex;
  close(back.result, 100 * startCpi / 102.31);
  assert.equal(back.direction, "backward");
  const forward = timeTravel(series, { from: "2000-Q1", to: "2026-Q2", amount: back.result });
  close(forward.result, 100, 1e-9);
  close(back.annualPct, forward.annualPct);
  close(back.cumulativePct, forward.cumulativePct);
  assert.equal(timeTravel(series, { from: "2020-Q1", to: "2020-Q1", amount: 5 }).annualPct, 0);
});

test("annual World Bank data, and China's two sources are never mixed", () => {
  const usa = buildPriceSeries("USA", data);
  assert.equal(usa.kind, "annual");
  close(timeTravel(usa, { from: 2000, to: 2024, amount: 100 }).result, 100 * wb("USA", 2024) / wb("USA", 2000));
  const chinaWb = buildPriceSeries("CHN", data);
  assert.deepEqual([chinaWb.source, chinaWb.first, chinaWb.last], ["WB", 1986, 2025]);
  close(timeTravel(chinaWb, { from: 1986, to: 2025, amount: 100 }).result, 100 * wb("CHN", 2025) / wb("CHN", 1986));
  const chinaNbs = buildPriceSeries("CHN", data, "NBS");
  assert.deepEqual([chinaNbs.source, chinaNbs.first, chinaNbs.last, chinaNbs.approximate], ["NBS", 2013, 2025, true]);
  assert.deepEqual(timeTravel(chinaNbs, { from: 2000, to: 2025, amount: 100 }), { ok: false, error: "period" });
});

test("deflation raises the purchasing power of idle cash and is reported as deflation", () => {
  const japan = buildPriceSeries("JPN", data);
  const result = timeTravel(japan, { from: 1998, to: 2003, amount: 100 });
  assert.equal(result.trend, "deflation");
  assert.ok(result.result < 100);
  assert.ok(result.idleCashPct > 0);
  assert.ok(result.annualPct < 0);
  close(result.idleCashPct, (wb("JPN", 1998) / wb("JPN", 2003) - 1) * 100);
  const path = idleCashPath(japan, 1998, 2003, 100);
  assert.equal(path.length, 6);
  assert.equal(path[0].value, 100);
  const { low, high } = pathExtremes(path);
  assert.equal(path[high].period, 2003);
  assert.equal(path[low].period, 1998);
});

test("Germany: Deutsche Mark input up to 2001 at 1.95583, euro from 2002", () => {
  const germany = buildPriceSeries("DEU", data);
  assert.equal(reformFor("DEU", 2001), CURRENCY_REFORMS.DEU);
  assert.equal(reformFor("DEU", 2002), null);
  const marks = timeTravel(germany, { from: 1995, to: 2025, amount: 100, unit: "old" });
  assert.equal(marks.inputUnit, "old");
  close(marks.amountCurrent, 100 / 1.95583);
  close(marks.result, (100 / 1.95583) * wb("DEU", 2025) / wb("DEU", 1995));
  close(timeTravel(germany, { from: 2001, to: 2025, amount: 195.583, unit: "old" }).amountCurrent, 100);
  const euroIn2002 = timeTravel(germany, { from: 2002, to: 2025, amount: 100, unit: "old" });
  assert.equal(euroIn2002.inputUnit, "new", "2002 amounts are euros whatever the request");
  assert.equal(euroIn2002.amountCurrent, 100);
  const back = timeTravel(germany, { from: 2025, to: 1995, amount: 100, toUnit: "old" });
  close(back.result, 100 * wb("DEU", 1995) / wb("DEU", 2025) * 1.95583);
  close(back.resultCurrent, 100 * wb("DEU", 1995) / wb("DEU", 2025));
});

test("Russia: old rubles up to 1997 at 1000:1, new rubles from 1998, huge multiples stay finite", () => {
  const russia = buildPriceSeries("RUS", data);
  assert.equal(russia.first, 1992);
  assert.ok(reformFor("RUS", 1997));
  assert.equal(reformFor("RUS", 1998), null);
  const old = timeTravel(russia, { from: 1995, to: 2025, amount: 100, unit: "old" });
  close(old.result, 0.1 * wb("RUS", 2025) / wb("RUS", 1995));
  const asNew = timeTravel(russia, { from: 1997, to: 1998, amount: 1, unit: "new" });
  close(asNew.result, wb("RUS", 1998) / wb("RUS", 1997));
  const early = timeTravel(russia, { from: 1992, to: 2025, amount: 1, unit: "new" });
  assert.ok(Number.isFinite(early.result) && early.result > 5000);
  assert.ok(early.cumulativePct > 500000);
  assert.deepEqual(amountDigits(early.result), { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  assert.deepEqual(amountDigits(0.0123), { maximumSignificantDigits: 3 });
});

test("South Korea: hwan up to 1961 at 10:1, won from 1962", () => {
  const korea = buildPriceSeries("KOR", data);
  assert.equal(korea.first, 1960);
  assert.ok(reformFor("KOR", 1961));
  assert.equal(reformFor("KOR", 1962), null);
  close(timeTravel(korea, { from: 1961, to: 2025, amount: 1000, unit: "old" }).result, 100 * wb("KOR", 2025) / wb("KOR", 1961));
});

test("other economies have no redenomination inside the coverage used", () => {
  // AUS: ABS series starts 1997 (the 1966 decimal changeover is outside it).
  // CHN: World Bank from 1986 and NBS from 2013 (the 1955 redenomination is outside both).
  // USA, JPN, CAN: no change of currency unit since 1960.
  // SGP: the 1967 Singapore dollar was issued at the old dollar's sterling parity, i.e. 1:1
  //      (MAS Occasional Paper No. 18, §4.4), so amounts need no conversion.
  // GBR: 1971 decimalisation kept the pound; only pence were redefined.
  // RUS 1993: Soviet-issue notes were replaced without changing the ruble unit.
  assert.deepEqual([...Object.keys(CURRENCY_REFORMS), ...NO_REFORM_REGIONS].sort(), [...TIME_MACHINE_REGIONS].sort());
  for (const region of NO_REFORM_REGIONS) {
    for (const source of region === "CHN" ? ["WB", "NBS"] : ["WB"]) {
      const series = buildPriceSeries(region, data, source);
      for (const period of series.periods) assert.equal(reformFor(region, period), null, `${region} ${period}`);
    }
  }
  assert.equal(toCurrentUnits(100, "old", null), 100);
});

test("inputs and periods outside the data are rejected or fall back to defaults", () => {
  const aus = buildPriceSeries("AUS", data);
  for (const amount of [0, -1, "", "abc", 1e13]) assert.deepEqual(timeTravel(aus, { from: "2000-Q1", to: "2026-Q2", amount }), { ok: false, error: "amount" });
  assert.deepEqual(timeTravel(aus, { from: "1990-Q1", to: "2026-Q2", amount: 1 }), { ok: false, error: "period" });
  assert.deepEqual(timeTravel(aus, { from: "2000-Q1", to: "2026-Q4", amount: 1 }), { ok: false, error: "period" });
  assert.deepEqual(defaultTimeRange(aus), { from: "1997-Q3", to: "2026-Q2" });
  assert.deepEqual(defaultTimeRange(buildPriceSeries("DEU", data)), { from: 1995, to: 2025 });

  const october = new Date(2026, 9, 16);
  const shared = readTimeMachineParams("?tmRegion=DEU&tmAmount=100&tmFrom=1995&tmTo=latest", data, october);
  assert.deepEqual([shared.region, shared.amount, shared.from, shared.to, shared.unit], ["DEU", 100, 1995, 2025, "old"]);
  const later = readTimeMachineParams("?tmRegion=AUS&tmFrom=2030-Q1&tmTo=1990-Q1", data, october);
  assert.deepEqual([later.from, later.to], ["2026-Q2", "1997-Q3"]);
  assert.deepEqual(later.notices.map(notice => notice.status), ["afterLast", "beforeFirst"]);
  const bad = readTimeMachineParams("?tmRegion=XXX&tmAmount=-5&tmFrom=abc&tmTo=2020&tmSource=NBS&tmUnit=zzz", data, october);
  assert.deepEqual([bad.region, bad.amount, bad.from, bad.to, bad.source, bad.unit], ["AUS", 100, "1997-Q3", "2026-Q2", "WB", "old"]);
  assert.equal(readTimeMachineParams("?tmRegion=CHN&tmSource=NBS", data, october).series.source, "NBS");
  assert.equal(readTimeMachineParams("?tmRegion=USA&tmSource=NBS", data, october).source, "WB");
});

test("share links restore region, source, amount, units and periods", () => {
  const link = timeMachineShareUrl("https://example.org/en/?view=wage&salary=1#x", { region: "RUS", source: "WB", amount: 100, unit: "old", toUnit: "new", from: 1995, to: 2025 });
  const url = new URL(link);
  assert.deepEqual(Object.fromEntries(url.searchParams), { view: "timemachine", tmRegion: "RUS", tmAmount: "100", tmUnit: "old", tmFrom: "1995", tmTo: "2025" });
  const restored = readTimeMachineParams(url.search, data);
  assert.deepEqual([restored.region, restored.amount, restored.unit, restored.from, restored.to], ["RUS", 100, "old", 1995, 2025]);
  const china = new URL(timeMachineShareUrl("https://example.org/", { region: "CHN", source: "NBS", amount: 5, unit: "old", toUnit: "new", from: 2013, to: 2025 }));
  assert.equal(china.searchParams.get("tmSource"), "NBS");
  assert.equal(china.searchParams.has("tmUnit"), false);
});
