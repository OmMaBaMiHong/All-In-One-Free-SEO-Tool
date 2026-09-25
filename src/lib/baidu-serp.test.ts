import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  extractBaiduResults,
  isBaiduRedirectUrl,
  readBaiduResponse,
  unwrapBaiduUrl,
} from "./baidu-serp";

const FIXTURE = readFileSync(
  join(__dirname, "__fixtures__", "baidu-serp.html"),
  "utf8",
);

describe("isBaiduRedirectUrl", () => {
  it("flags baidu link redirects, accepts direct results", () => {
    expect(isBaiduRedirectUrl("http://www.baidu.com/link?url=8TxulX")).toBe(true);
    expect(isBaiduRedirectUrl("https://shouji.baidu.com/detail/5000095324")).toBe(false);
    expect(isBaiduRedirectUrl("https://example.com/post")).toBe(false);
  });
});

describe("extractBaiduResults", () => {
  const results = extractBaiduResults(FIXTURE);

  it("parses the ordered organic list from a real captured SERP", () => {
    expect(results.length).toBeGreaterThanOrEqual(10);
    expect(results[0].position).toBe(1);
    // positions are strictly sequential
    for (let i = 0; i < results.length; i++) {
      expect(results[i].position).toBe(i + 1);
    }
  });

  it("captures real 2025-09 SERP titles in order", () => {
    expect(results[0].title).toContain("AI写小说");
    const titles = results.map((r) => r.title).join("\n");
    expect(titles).toContain("百度百科");
  });

  it("marks redirect hrefs and keeps direct links intact", () => {
    const redirects = results.filter((r) => r.isRedirect);
    const direct = results.filter((r) => !r.isRedirect);
    expect(redirects.length).toBeGreaterThan(5);
    expect(direct.length).toBeGreaterThan(0);
    for (const d of direct) {
      expect(d.href).not.toMatch(/baidu\.com\/link\?/);
    }
  });

  it("returns an empty list for a captcha/error page instead of throwing", () => {
    expect(extractBaiduResults("<html><body>百度安全验证</body></html>")).toEqual([]);
  });
});

describe("unwrapBaiduUrl", () => {
  it("follows a 302 Location and returns the absolute final URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: "https://example-novel.com/post?a=1" },
      }),
    );
    const out = await unwrapBaiduUrl(
      "http://www.baidu.com/link?url=abc",
      fetchMock as unknown as typeof fetch,
    );
    expect(out).toBe("https://example-novel.com/post?a=1");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://www.baidu.com/link?url=abc",
      expect.objectContaining({ redirect: "manual" }),
    );
  });

  it("resolves a relative Location against the link URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, { status: 301, headers: { location: "/final" } }),
    );
    const out = await unwrapBaiduUrl(
      "http://www.baidu.com/link?url=abc",
      fetchMock as unknown as typeof fetch,
    );
    expect(out).toBe("http://www.baidu.com/final");
  });

  it("returns null on network failure instead of throwing", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("timeout"));
    const out = await unwrapBaiduUrl(
      "http://www.baidu.com/link?url=abc",
      fetchMock as unknown as typeof fetch,
    );
    expect(out).toBeNull();
  });
});

describe("readBaiduResponse", () => {
  it("finds the first matching domain and reports its position", async () => {
    // Third result's redirect resolves to the target domain.
    const unwrap = vi.fn().mockImplementation(async (href: string) => {
      if (href.includes("Tz9_EzJ38kynJZF5kToXlhBaQmli0o")) {
        return "https://skoob.cc/site/docs/product-manual";
      }
      return "https://someone-else.example.com/page";
    });
    const out = await readBaiduResponse(FIXTURE, "skoob.cc", { unwrap });
    expect(out.position).toBeGreaterThan(1);
    expect(out.url).toContain("skoob.cc");
    expect(out.resultsScanned).toBe(out.position ?? 0);
    // Unwrapping stops at the hit — no wasted requests below it.
    expect(unwrap.mock.calls.length).toBe(out.position ?? 0);
  });

  it("reports zero position and full scan count when the domain is absent", async () => {
    const unwrap = vi
      .fn()
      .mockResolvedValue("https://someone-else.example.com/page");
    const out = await readBaiduResponse(FIXTURE, "this-domain-never-appears.com", {
      unwrap,
    });
    expect(out.position).toBeNull();
    expect(out.resultsScanned).toBe(extractBaiduResults(FIXTURE).length);
  });

  it("matches direct (non-redirect) results without unwrapping them", async () => {
    const unwrap = vi.fn().mockResolvedValue("https://someone-else.example.com/page");
    const out = await readBaiduResponse(FIXTURE, "shouji.baidu.com", { unwrap });
    expect(out.position).toBeGreaterThan(0);
    // Every redirect BEFORE the direct hit was unwrapped (and missed); the
    // direct result itself matched without an unwrap — total calls is
    // position - 1, exactly one per redirect result above it.
    expect(unwrap).toHaveBeenCalledTimes((out.position ?? 1) - 1);
  });

  it("never fetches more than unwrapLimit redirects", async () => {
    const unwrap = vi.fn().mockResolvedValue(null);
    await readBaiduResponse(FIXTURE, "skoob.cc", { unwrap, unwrapLimit: 3 });
    expect(unwrap.mock.calls.length).toBe(3);
  });
});
