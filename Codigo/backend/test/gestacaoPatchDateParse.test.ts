import { describe, expect, it } from "vitest";
import { parseOptionalIsoDateOnlyNullable } from "../src/domain/gestacaoPatchDateParse.js";

describe("parseOptionalIsoDateOnlyNullable", () => {
  it("returns undefined when field omitted", () => {
    expect(parseOptionalIsoDateOnlyNullable(undefined, "d")).toBeUndefined();
  });

  it("returns null when JSON null (clear date)", () => {
    expect(parseOptionalIsoDateOnlyNullable(null, "d")).toBeNull();
  });

  it("parses YYYY-MM-DD", () => {
    const d = parseOptionalIsoDateOnlyNullable("2026-03-15", "d");
    expect(d).toBeInstanceOf(Date);
    expect(d!.toISOString().slice(0, 10)).toBe("2026-03-15");
  });
});
