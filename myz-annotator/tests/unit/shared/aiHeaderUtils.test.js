import { describe, it, expect } from "vitest";
import {
  parseAiRequestHeaders,
  getAiHeaderValue,
} from "@/shared/aiHeaderUtils.ts";

describe("aiHeaderUtils", () => {
  describe("parseAiRequestHeaders", () => {
    it("should return empty object for null/undefined input", () => {
      expect(parseAiRequestHeaders(null)).toEqual({});
      expect(parseAiRequestHeaders(undefined)).toEqual({});
    });

    it("should return empty object for non-string input", () => {
      expect(parseAiRequestHeaders(123)).toEqual({});
      expect(parseAiRequestHeaders({})).toEqual({});
    });

    it("should parse valid headers string", () => {
      const headers =
        "Authorization: Bearer token\nContent-Type: application/json";
      expect(parseAiRequestHeaders(headers)).toEqual({
        Authorization: "Bearer token",
        "Content-Type": "application/json",
      });
    });

    it("should ignore lines without colon", () => {
      const headers = "Authorization: Bearer token\nInvalidLine";
      expect(parseAiRequestHeaders(headers)).toEqual({
        Authorization: "Bearer token",
      });
    });

    it("should ignore lines with empty key", () => {
      const headers = ": value\nKey: Value";
      expect(parseAiRequestHeaders(headers)).toEqual({
        Key: "Value",
      });
    });

    it("should handle multiple colons in value", () => {
      const headers = "Time: 12:00:00";
      expect(parseAiRequestHeaders(headers)).toEqual({
        Time: "12:00:00",
      });
    });
  });

  describe("getAiHeaderValue", () => {
    it("should return undefined if targetName is missing", () => {
      expect(getAiHeaderValue("Key: Value", null)).toBeUndefined();
    });

    it("should return value for existing header (case insensitive)", () => {
      const headers = "Content-Type: application/json";
      expect(getAiHeaderValue(headers, "content-type")).toBe(
        "application/json",
      );
      expect(getAiHeaderValue(headers, "Content-Type")).toBe(
        "application/json",
      );
    });

    it("should return undefined for non-existing header", () => {
      const headers = "Key: Value";
      expect(getAiHeaderValue(headers, "Other")).toBeUndefined();
    });
  });
});
