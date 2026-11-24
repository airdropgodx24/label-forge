// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadFile } from "../src/export";

afterEach(() => vi.restoreAllMocks());

describe("downloadFile", () => {
  it("offers the content as a named file through a temporary link, then cleans up", async () => {
    let blob: Blob | undefined;
    const create = vi.fn((b: Blob) => {
      blob = b;
      return "blob:fake-url";
    });
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });

    const clicked: Array<{ href: string; download: string; inDom: boolean }> = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push({ href: this.getAttribute("href")!, download: this.download, inDom: document.body.contains(this) });
    });

    downloadFile({ name: "job-2026-11-24.csv", mimeType: "text/csv", content: "a,b\r\n1,2\r\n" });

    expect(clicked).toEqual([{ href: "blob:fake-url", download: "job-2026-11-24.csv", inDom: true }]);
    expect(blob?.type).toBe("text/csv;charset=utf-8");
    expect(await blob!.text()).toBe("a,b\r\n1,2\r\n");
    expect(revoke).toHaveBeenCalledWith("blob:fake-url");
    expect(document.querySelector("a[download]")).toBeNull();
  });
});
