import { describe, expect, it } from "vitest";
import { parseIdCardText } from "./idScan.js";

describe("parseIdCardText", () => {
  it("extracts Fayda number, name, date of birth, and gender", () => {
    const text = `
      FEDERAL DEMOCRATIC REPUBLIC OF ETHIOPIA
      FULL NAME: Miriam Bekele
      FIN-1234-5678-9012
      DATE OF BIRTH: 1990-03-11
      GENDER: FEMALE
    `;

    expect(parseIdCardText(text)).toEqual({
      fullName: "Miriam Bekele",
      faydaNumber: "FIN-1234-5678-9012",
      dateOfBirth: "1990-03-11",
      gender: "Female"
    });
  });

  it("normalizes slash dates and male gender tokens", () => {
    const text = "Name John Doe\nDOB 15/06/1994\nSEX M\n1234 5678 9012 3456";
    expect(parseIdCardText(text)).toMatchObject({
      fullName: "John Doe",
      dateOfBirth: "1994-06-15",
      gender: "Male",
      faydaNumber: "1234-5678-9012-3456"
    });
  });
});
