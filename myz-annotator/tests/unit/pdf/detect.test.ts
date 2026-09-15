import { describe, expect, it, vi } from "vitest";
import { probeIsPdfUrl, resolvePdfTargetUrl } from "@/pdf/detect.js";

describe("resolvePdfTargetUrl", () => {
  it("returns direct .pdf urls without probing", async () => {
    const probe = vi.fn();
    const url = "https://example.com/paper.pdf";
    await expect(resolvePdfTargetUrl(url, probe)).resolves.toBe(url);
    expect(probe).not.toHaveBeenCalled();
  });

  it("unwraps the chrome pdf viewer url without probing", async () => {
    const probe = vi.fn();
    const file = "https://arxiv.org/pdf/2606.19348";
    const viewer = `chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/index.html?file=${encodeURIComponent(file)}`;
    await expect(resolvePdfTargetUrl(viewer, probe)).resolves.toBe(file);
    expect(probe).not.toHaveBeenCalled();
  });

  it("probes extension-less urls (arxiv) and keeps them when pdf", async () => {
    const probe = vi.fn().mockResolvedValue(true);
    const url = "https://arxiv.org/pdf/2606.19348";
    await expect(resolvePdfTargetUrl(url, probe)).resolves.toBe(url);
    expect(probe).toHaveBeenCalledWith(url);
  });

  it("rejects extension-less urls that are not pdf", async () => {
    const probe = vi.fn().mockResolvedValue(false);
    await expect(
      resolvePdfTargetUrl("https://example.com/article", probe),
    ).resolves.toBeNull();
  });

  it("returns null for empty or unsupported candidates", async () => {
    const probe = vi.fn();
    await expect(resolvePdfTargetUrl(undefined, probe)).resolves.toBeNull();
    await expect(resolvePdfTargetUrl("chrome://settings", probe)).resolves.toBeNull();
    expect(probe).not.toHaveBeenCalled();
  });
});

describe("probeIsPdfUrl", () => {
  it("detects application/pdf content type", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        new Response(null, { headers: { "content-type": "application/pdf" } }),
      );
    await expect(
      probeIsPdfUrl("https://arxiv.org/pdf/2606.19348", fetchImpl),
    ).resolves.toBe(true);
  });

  it("detects pdf content-disposition", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(null, {
        headers: {
          "content-type": "application/octet-stream",
          "content-disposition": 'inline; filename="2606.19348v1.pdf"',
        },
      }),
    );
    await expect(
      probeIsPdfUrl("https://example.com/download", fetchImpl),
    ).resolves.toBe(true);
  });

  it("returns false on network errors", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("boom"));
    await expect(
      probeIsPdfUrl("https://example.com/x", fetchImpl),
    ).resolves.toBe(false);
  });
});
