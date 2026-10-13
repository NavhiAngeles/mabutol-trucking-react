import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { departureLimits, parsePhilippineDeparture, validateDeparture } from "./departureSchedule.js";

const now = Date.parse("2026-10-13T10:30:45+08:00");
const pastError = "Departure must be scheduled in the future.";

test("rejects yesterday, earlier today and the current minute; accepts the next minute", () => {
  assert.equal(validateDeparture("2026-10-12", "23:59", now), pastError);
  assert.equal(validateDeparture("2026-10-13", "09:00", now), pastError);
  assert.equal(validateDeparture("2026-10-13", "10:30", now), pastError);
  assert.equal(validateDeparture("2026-10-13", "10:31", now), "");
  assert.equal(validateDeparture("2026-10-14", "00:00", now), "");
});

test("requires the next minute even exactly at a minute boundary", () => {
  const boundary = Date.parse("2026-10-13T10:30:00+08:00");
  assert.equal(validateDeparture("2026-10-13", "10:30", boundary), pastError);
  assert.equal(validateDeparture("2026-10-13", "10:31", boundary), "");
});

test("preserves required and malformed date/time validation", () => {
  assert.equal(validateDeparture("", "10:31", now), "Departure date and time are required.");
  for (const [date, time] of [["2026-02-30", "12:00"], ["2026-13-01", "12:00"], ["2026-10-14", "24:00"], ["2026-10-14", "10:61"], ["2026-10-14", "10:31:01"]]) {
    assert.equal(validateDeparture(date, time, now), "Invalid departure date or time.");
  }
  assert.ok(parsePhilippineDeparture("2028-02-29", "12:00"));
});

test("updates limits across Philippine midnight and year rollover", () => {
  const before = Date.parse("2026-12-31T23:59:40+08:00");
  assert.deepEqual(departureLimits(before), { today: "2026-12-31", earliestDate: "2027-01-01", earliestTime: "00:00" });
  assert.equal(validateDeparture("2026-12-31", "23:59", before), pastError);
  assert.equal(validateDeparture("2027-01-01", "00:00", before), "");
  const after = Date.parse("2027-01-01T00:00:01+08:00");
  assert.deepEqual(departureLimits(after), { today: "2027-01-01", earliestDate: "2027-01-01", earliestTime: "00:01" });
  assert.equal(validateDeparture("2027-01-01", "00:00", after), pastError);
});

test("revalidation catches a schedule that has elapsed while the form is open", () => {
  assert.equal(validateDeparture("2026-10-13", "10:31", now), "");
  assert.equal(validateDeparture("2026-10-13", "10:31", Date.parse("2026-10-13T10:31:01+08:00")), pastError);
});

test("validation, picker limits and UTC saving are independent of host timezone", () => {
  const moduleUrl = new URL("./departureSchedule.js", import.meta.url).href;
  const script = `import assert from 'node:assert/strict'; import { parsePhilippineDeparture, departureLimits, validateDeparture } from ${JSON.stringify(moduleUrl)};
    assert.equal(parsePhilippineDeparture('2026-10-14', '00:30').toISOString(), '2026-10-13T16:30:00.000Z');
    assert.equal(departureLimits(${now}).earliestTime, '10:31');
    assert.equal(validateDeparture('2026-10-13', '10:30', ${now}), ${JSON.stringify(pastError)});`;
  for (const timezone of ["UTC", "America/Los_Angeles", "Asia/Manila", "Pacific/Auckland"]) {
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], { env: { ...process.env, TZ: timezone }, encoding: "utf8" });
    assert.equal(result.status, 0, `${timezone}: ${result.stderr}`);
  }
});
