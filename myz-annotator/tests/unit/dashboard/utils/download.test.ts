import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { downloadFile } from "../../../../src/dashboard/utils/download";

describe("download", () => {
  beforeEach(() => {
    global.URL.createObjectURL = vi.fn(() => "blob:url");
    global.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should create a blob and trigger download", () => {
    const clickMock = vi.fn();
    const createElementMock = vi
      .spyOn(document, "createElement")
      .mockReturnValue({
        click: clickMock,
        href: "",
        download: "",
      } as any);

    const content = "test content";
    const type = "text/plain";
    const filename = "test.txt";

    downloadFile(content, type, filename);

    expect(global.URL.createObjectURL).toHaveBeenCalled();
    expect(createElementMock).toHaveBeenCalledWith("a");
    expect(clickMock).toHaveBeenCalled();

    // Check if properties were set correctly on the anchor
    const anchor = createElementMock.mock.results[0].value;
    expect(anchor.href).toBe("blob:url");
    expect(anchor.download).toBe(filename);
  });

  it("should revoke object URL after timeout", () => {
    vi.useFakeTimers();
    const clickMock = vi.fn();
    vi.spyOn(document, "createElement").mockReturnValue({
      click: clickMock,
      href: "",
      download: "",
    } as any);

    downloadFile("content", "text/plain", "test.txt");

    expect(global.URL.revokeObjectURL).not.toHaveBeenCalled();

    vi.runAllTimers();

    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith("blob:url");
    vi.useRealTimers();
  });
});
