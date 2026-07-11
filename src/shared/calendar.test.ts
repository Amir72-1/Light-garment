import { describe, expect, it } from "vitest";
import { formatCalendarDate, gregorianToEthiopian, parseIsoDate } from "./calendar.js";

describe("Ethiopian calendar", () => {
  it("converts a known Gregorian date", () => {
    const eth = gregorianToEthiopian(parseIsoDate("2026-07-11"));
    expect(eth.year).toBe(2018);
    expect(eth.month).toBe(11);
    expect(eth.day).toBe(4);
  });

  it("formats Ethiopian dates in English", () => {
    expect(formatCalendarDate("2026-07-11", "en", "ethiopian")).toBe("4 Hamle 2018");
  });

  it("formats Ethiopian dates in Amharic", () => {
    expect(formatCalendarDate("2026-07-11", "am", "ethiopian")).toBe("4 ሐምሌ 2018");
  });
});
