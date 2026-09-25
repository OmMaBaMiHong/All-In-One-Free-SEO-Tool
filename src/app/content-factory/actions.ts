"use server";

export interface GeoFlowStatus {
  reachable: boolean;
  baseUrl: string;
  latencyMs?: number;
}

/**
 * GEOFlow sidecar status. Base URL from the GEOFLOW_BASE_URL env
 * (defaults to the local compose port). Server-side only: the call runs
 * from the Node process, which may need different proxy rules than the
 * browser.
 */
export async function getGeoFlowStatus(): Promise<GeoFlowStatus> {
  const baseUrl =
    (process.env.GEOFLOW_BASE_URL ?? "http://localhost:18081").replace(/\/$/, "");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5000);
  const started = Date.now();
  try {
    // Plain fetch on purpose: guardedFetch blocks private/localhost targets
    // (anti-SSRF for user-submitted URLs). This is an operator-configured
    // sidecar in the trust boundary, not user input.
    const res = await fetch(`${baseUrl}/up`, {
      signal: ctrl.signal,
      redirect: "manual",
    });
    return {
      reachable: res.ok,
      baseUrl,
      latencyMs: Date.now() - started,
    };
  } catch {
    return { reachable: false, baseUrl };
  } finally {
    clearTimeout(t);
  }
}
