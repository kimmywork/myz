import { describe, it, expect } from "vitest";
import { isMyzWrapper, isNodeFromMyz } from "../../../src/shared/serializer";

describe("serializer", () => {
  describe("isMyzWrapper", () => {
    it("should return true for element with myz-highlight class", () => {
      const el = document.createElement("span");
      el.classList.add("myz-highlight");
      expect(isMyzWrapper(el)).toBe(true);
    });

    it("should return false for other elements", () => {
      const el = document.createElement("div");
      expect(isMyzWrapper(el)).toBe(false);
    });

    it("should return false for non-element nodes", () => {
      const text = document.createTextNode("text");
      expect(isMyzWrapper(text)).toBe(false);
    });
  });

  describe("isNodeFromMyz", () => {
    it("should return true if element has myz-highlight class", () => {
      const el = document.createElement("span");
      el.classList.add("myz-highlight");
      expect(isNodeFromMyz(el)).toBe(true);
    });

    it("should return true if element is inside data-myz-host", () => {
      const host = document.createElement("div");
      host.setAttribute("data-myz-host", "true");
      const child = document.createElement("span");
      host.appendChild(child);
      expect(isNodeFromMyz(child)).toBe(true);
    });

    it("should return false for regular nodes", () => {
      const el = document.createElement("div");
      expect(isNodeFromMyz(el)).toBe(false);
    });
  });
});
