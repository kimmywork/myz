import { describe, it, expect, beforeEach } from "vitest";
import {
  isMyzWrapper,
  isNodeFromMyz,
  buildPath,
  getLogicalChildNodes,
  nodeName,
  sameNodeType,
} from "@/shared/serializer";

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

  describe("path helpers", () => {
    beforeEach(() => {
      document.body.innerHTML = "";
    });

    it("nodeName should return #text for text nodes", () => {
      const text = document.createTextNode("hello");
      expect(nodeName(text)).toBe("#text");
    });

    it("nodeName should return lowercase tag for elements", () => {
      const div = document.createElement("div");
      expect(nodeName(div)).toBe("div");
    });

    it("sameNodeType should match text nodes by type only", () => {
      const a = document.createTextNode("a");
      const b = document.createTextNode("b");
      expect(sameNodeType(a, b)).toBe(true);
    });

    it("sameNodeType should match elements by tag name", () => {
      const a = document.createElement("p");
      const b = document.createElement("p");
      expect(sameNodeType(a, b)).toBe(true);
    });

    it("sameNodeType should reject different tags", () => {
      const a = document.createElement("p");
      const b = document.createElement("div");
      expect(sameNodeType(a, b)).toBe(false);
    });

    it("getLogicalChildNodes should unpack myz-highlight wrappers", () => {
      const article = document.createElement("article");
      const wrapper = document.createElement("span");
      wrapper.className = "myz-highlight";
      const inner = document.createTextNode("inner");
      wrapper.appendChild(inner);
      const normal = document.createTextNode("normal");
      article.appendChild(wrapper);
      article.appendChild(normal);
      document.body.appendChild(article);

      const result = getLogicalChildNodes(article);
      // myz-highlight wrapper is unpacked: its text child becomes a logical child
      expect(result).toHaveLength(2);
      expect(result[0].logical).toBe(inner);
      expect(result[1].logical).toBe(normal);
    });

    it("buildPath should produce a path from root to target element", () => {
      const article = document.createElement("article");
      const p = document.createElement("p");
      const span = document.createElement("span");
      article.appendChild(p);
      p.appendChild(span);
      document.body.appendChild(article);

      const path = buildPath(span);
      // Path includes full ancestry; verify tail segments
      const tail = path.slice(-3);
      expect(tail).toEqual([
        { name: "article", index: 0 },
        { name: "p", index: 0 },
        { name: "span", index: 0 },
      ]);
    });

    it("buildPath should index siblings correctly", () => {
      const ul = document.createElement("ul");
      const li1 = document.createElement("li");
      const li2 = document.createElement("li");
      const li3 = document.createElement("li");
      ul.appendChild(li1);
      ul.appendChild(li2);
      ul.appendChild(li3);
      document.body.appendChild(ul);

      const path1 = buildPath(li1);
      const path2 = buildPath(li2);
      const path3 = buildPath(li3);
      expect(path1[path1.length - 1]).toEqual({ name: "li", index: 0 });
      expect(path2[path2.length - 1]).toEqual({ name: "li", index: 1 });
      expect(path3[path3.length - 1]).toEqual({ name: "li", index: 2 });
    });
  });
});
