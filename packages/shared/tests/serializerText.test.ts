import { beforeEach, describe, expect, it } from "vitest";
import { findRangeByNormalizedText } from "../src/serializer";

const OLD_TEXT =
  "A well-known URI is a Uniform Resource Identifier for URL path prefixes that start with /.well-known/. They are implemented in webservers so that requests to the servers for well-known services or information are available at URLs consistent well-known locations across servers.";

const NEW_TEXT =
  "A well-known URI is a Uniform Resource Identifier for URL path prefixes that start with /.well-known/. They are implemented in webservers so that requests to the servers for well-known services or information are available at URL consistent well-known locations across servers.";

describe("findRangeByNormalizedText", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("relocates an exact match", () => {
    document.body.innerHTML = `<p>${NEW_TEXT}</p>`;
    const range = findRangeByNormalizedText(document.body, NEW_TEXT);
    expect(range).not.toBeNull();
    expect(range!.toString()).toBe(NEW_TEXT);
  });

  it("relocates a lightly edited sentence via a unique anchor", () => {
    document.body.innerHTML = `<p>${NEW_TEXT}</p><p>Something else entirely.</p>`;
    const range = findRangeByNormalizedText(document.body, OLD_TEXT);
    expect(range).not.toBeNull();
    // The rebuilt range covers the unchanged prefix, not the whole stale text.
    expect(range!.toString()).toContain(
      "A well-known URI is a Uniform Resource Identifier",
    );
    expect(range!.toString().length).toBeGreaterThan(24);
  });

  it("returns null when the anchor is not unique", () => {
    document.body.innerHTML = `<p>${NEW_TEXT}</p><p>${NEW_TEXT}</p>`;
    const range = findRangeByNormalizedText(document.body, OLD_TEXT);
    expect(range).toBeNull();
  });

  it("returns null when the text is absent", () => {
    document.body.innerHTML = `<p>Completely different content.</p>`;
    const range = findRangeByNormalizedText(document.body, OLD_TEXT);
    expect(range).toBeNull();
  });
});
