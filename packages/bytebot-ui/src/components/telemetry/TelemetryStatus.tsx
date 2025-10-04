"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TelemetrySummary, TelemetrySessions } from "@/types";
import { cn } from "@/lib/utils";
import {
  NormalizedTelemetryEvent,
  NormalizedTelemetrySession,
  coalesceSessionTimestamps,
  formatSessionDurationFromTiming,
  normalizeTelemetryEvents,
  normalizeTelemetrySession,
  parseIsoDate,
} from "./TelemetryStatus.helpers";

const defaultNumberFormat: Intl.NumberFormatOptions = {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0,
};

function formatNumber(
  value: number | null | undefined,
  options: Intl.NumberFormatOptions = defaultNumberFormat,
) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "—";
  }
  return new Intl.NumberFormat("en-US", options).format(value);
}

function formatPercent(
  value: number | null | undefined,
  options: Intl.NumberFormatOptions = { maximumFractionDigits: 1 },
) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "—";
  }
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: options.maximumFractionDigits ?? 1,
    minimumFractionDigits: options.minimumFractionDigits ?? 0,
  }).format(value);
}

type Props = {
  className?: string;
};

interface CVDetectionSummary {
  detections: {
    total: number;
    cached: number;
    cacheHitRate: number;
  };
  methods: {
    holo: number; // holo-1.5-7b detections
    ocr: number;
    template: number;
    feature: number;
    contour: number;
    // Backward compatibility
    omniparser?: number;
  };
  clicks: {
    total: number;
    successful: number;
    failed: number;
    successRate: number;
  };
  recentDetections: Array<{
    timestamp: string;
    description: string;
    elementsFound: number;
    primaryMethod: string;
    cached: boolean;
    duration: number;
  }>;
  recentClicks: Array<{
    timestamp: string;
    elementId: string;
    coordinates: { x: number; y: number };
    success: boolean;
    detectionMethod: string;
  }>;
}

export function TelemetryStatus({ className = "" }: Props) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<TelemetrySummary | null>(null);
  const [cvData, setCvData] = useState<CVDetectionSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [sessions, setSessions] = useState<
    NormalizedTelemetrySession[]
  >([]);
  const [reportedSessionId, setReportedSessionId] = useState<string | null>(
    null,
  );
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null,
  );
  const activeSessionId = useMemo(() => {
    if (selectedSessionId) {
      return selectedSessionId;
    }
    if (reportedSessionId) {
      return reportedSessionId;
    }
    return sessions[0]?.id ?? "";
  }, [reportedSessionId, selectedSessionId, sessions]);
  const activeSession = useMemo(
    () =>
      sessions.find((session) => session.id === activeSessionId) ?? null,
    [sessions, activeSessionId],
  );

  const activeSessionIdRef = useRef(activeSessionId);

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  const selectedSessionValue = useMemo(() => {
    if (!sessions.length) {
      return "";
    }
    if (
      activeSessionId &&
      sessions.some((session) => session.id === activeSessionId)
    ) {
      return activeSessionId;
    }
    return sessions[0]?.id ?? "";
  }, [activeSessionId, sessions]);

  const singleSessionLabel = useMemo(() => {
    if (!sessions.length) {
      return "Awaiting data";
    }
    return (
      activeSession?.label ??
      sessions.find((session) => session.id === selectedSessionValue)?.label ??
      sessions[0]?.label ??
      "Current session"
    );
  }, [activeSession, selectedSessionValue, sessions]);

  const refresh = useCallback(async (manageBusy = true) => {
    if (manageBusy) {
      setBusy(true);
    }
    const params = new URLSearchParams();
    const session = activeSessionId;
    if (session) {
      params.set("session", session);
    }
    const query = params.toString();
    try {
      const res = await fetch(
        `/api/tasks/telemetry/summary${query ? `?${query}` : ""}`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        setData(null);
        return;
      }
      const json = (await res.json()) as TelemetrySummary;
      if (session !== activeSessionIdRef.current) {
        return;
      }
      setData(json);
    } catch (error) {
      void error;
      // Preserve the previous snapshot when the summary request fails
    } finally {
      if (manageBusy) {
        setBusy(false);
      }
    }
  }, [activeSessionId]);

  const refreshSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/tasks/telemetry/sessions", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const payload = (await res.json()) as TelemetrySessions;
      const rawSessions = Array.isArray(payload?.sessions)
        ? (payload.sessions as unknown[])
        : [];
      const normalizedSessions = rawSessions
        .map((session) => normalizeTelemetrySession(session))
        .filter(
          (session): session is NormalizedTelemetrySession => session !== null,
        );
      const reportedCurrent = normalizeTelemetrySession(payload?.current);

      const deduped: NormalizedTelemetrySession[] = [];
      const seen = new Set<string>();
      const ordered = reportedCurrent
        ? [reportedCurrent, ...normalizedSessions]
        : normalizedSessions;
      for (const session of ordered) {
        if (!seen.has(session.id)) {
          deduped.push(session);
          seen.add(session.id);
        }
      }

      setSessions(deduped);
      setReportedSessionId(reportedCurrent?.id ?? null);
      setSelectedSessionId((prev) => {
        if (!prev) {
          return prev;
        }
        return deduped.some((session) => session.id === prev) ? prev : null;
      });
    } catch (error) {
      void error;
      // Ignore session discovery failures and keep the existing list
    }
  }, []);

  const refreshCvData = useCallback(async () => {
    try {
      const res = await fetch("/api/cv-detection/summary", {
        cache: "no-store",
      });
      if (!res.ok) {
        setCvData(null);
        return;
      }
      const json = (await res.json()) as CVDetectionSummary;
      setCvData(json);
    } catch (error) {
      void error;
      // Preserve the previous snapshot when the CV summary request fails
    }
  }, []);

  const reset = useCallback(async () => {
    setBusy(true);
    const params = new URLSearchParams();
    const session = activeSessionId;
    if (session) {
      params.set("session", session);
    }
    const query = params.toString();
    try {
      const res = await fetch(`/api/tasks/telemetry/reset${query ? `?${query}` : ""}`, {
        method: "POST",
      });
      if (!res.ok) {
        throw new Error("Failed to reset telemetry");
      }
      await refreshSessions();
      await refresh(false);
    } catch (error) {
      void error;
      // Ignore reset failures to preserve existing telemetry snapshot
    } finally {
      setBusy(false);
    }
  }, [activeSessionId, refresh, refreshSessions]);

  const handleRefreshClick = useCallback(async () => {
    setBusy(true);
    try {
      await refreshSessions();
      await refresh(false);
      await refreshCvData();
    } finally {
      setBusy(false);
    }
  }, [refresh, refreshSessions, refreshCvData]);

  useEffect(() => {
    refreshSessions();
    const t = setInterval(refreshSessions, 30000);
    return () => clearInterval(t);
  }, [refreshSessions]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 10000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    refreshCvData();
    const t = setInterval(refreshCvData, 10000);
    return () => clearInterval(t);
  }, [refreshCvData]);

  const normalizedEvents = useMemo<NormalizedTelemetryEvent[]>(
    () => normalizeTelemetryEvents(data?.events),
    [data],
  );

  const learningMetrics = data?.learningMetrics ?? null;
  const totalAttempts = learningMetrics?.totalAttempts ?? 0;
  const successRateLabel = useMemo(
    () => formatPercent(learningMetrics?.successRate),
    [learningMetrics?.successRate],
  );
  const averageErrorLabel = useMemo(
    () => formatNumber(learningMetrics?.averageError),
    [learningMetrics?.averageError],
  );
  const weightedOffsetLabel = useMemo(() => {
    const offset = learningMetrics?.currentWeightedOffset;
    if (!offset) {
      return "—";
    }
    return `${Math.round(offset.x)}, ${Math.round(offset.y)}`;
  }, [learningMetrics?.currentWeightedOffset]);
  const convergenceTrendLabel = useMemo(() => {
    const trend = learningMetrics?.convergenceTrend;
    if (!trend) {
      return "—";
    }
    const trendLabel =
      trend.direction === "improving"
        ? "Improving"
        : trend.direction === "regressing"
          ? "Regressing"
          : "Steady";
    const deltaLabel = formatNumber(trend.delta, { maximumFractionDigits: 2 });
    if (deltaLabel === "—") {
      return trendLabel;
    }
    return `${trendLabel} (Δ ${deltaLabel} px)`;
  }, [learningMetrics?.convergenceTrend]);
  const convergenceAverageLabel = useMemo(() => {
    const trend = learningMetrics?.convergenceTrend;
    if (!trend || trend.recentAverage === null) {
      return "—";
    }
    return `${formatNumber(trend.recentAverage, { maximumFractionDigits: 2 })} px`;
  }, [learningMetrics?.convergenceTrend]);
  const regionalHotspots = useMemo(
    () => learningMetrics?.regionalHotspots ?? [],
    [learningMetrics?.regionalHotspots],
  );

  const { start: sessionStartIso, end: sessionEndIso } = useMemo(
    () =>
      coalesceSessionTimestamps(
        data?.sessionStart ?? null,
        data?.sessionEnd ?? null,
        activeSession,
      ),
    [activeSession, data?.sessionEnd, data?.sessionStart],
  );

  const sessionStartLabel = useMemo(() => {
    const date = parseIsoDate(sessionStartIso);
    return date ? format(date, "MMM d, yyyy HH:mm:ss") : null;
  }, [sessionStartIso]);

  const sessionEndLabel = useMemo(() => {
    const date = parseIsoDate(sessionEndIso);
    return date ? format(date, "MMM d, yyyy HH:mm:ss") : null;
  }, [sessionEndIso]);

  const sessionDurationLabel = useMemo(
    () =>
      formatSessionDurationFromTiming(
        data
          ? {
              sessionDurationMs: data.sessionDurationMs ?? null,
              sessionStart: data.sessionStart ?? null,
              sessionEnd: data.sessionEnd ?? null,
            }
          : null,
        activeSession,
      ),
    [activeSession, data],
  );

  const sparkBars = useMemo(() => {
    const vals = data?.recentAbsDeltas || [];
    if (!vals.length) return null;
    const max = Math.max(...vals);
    return vals.map((v, i) => {
      const h = max > 0 ? Math.max(1, Math.round((v / max) * 16)) : 1;
      return (
        <div
          key={i}
          className="w-[3px] rounded bg-bytebot-bronze-light-9 opacity-50 dark:bg-bytebot-bronze-dark-9"
          style={{ height: `${h}px` }}
          title={`${formatNumber(v, { maximumFractionDigits: 1 })} px`}
        />
      );
    });
  }, [data]);

  return (
    <div className={className}>
      {/* Status strip */}
      <div className="flex items-center justify-between rounded-md border border-border bg-card px-2 py-1 text-card-foreground shadow-sm dark:bg-muted">
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground dark:text-card-foreground">
          <span className="inline-flex items-center rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-emerald-200">
            live
          </span>
          <span>
            Targeted: <span className="font-semibold">{data?.targetedClicks ?? 0}</span>
          </span>
          <span>
            Avg Δ: <span className="font-semibold">{formatNumber(data?.avgAbsDelta)}</span>
          </span>
          <span>
            Smart (completed): <span className="font-semibold">{data?.smartClicks ?? 0}</span>
          </span>
          <span>
            Zooms: <span className="font-semibold">{data?.progressiveZooms ?? 0}</span>
          </span>
          <div className="ml-1 flex h-4 items-end gap-[2px]">{sparkBars}</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="rounded border border-border px-2 py-0.5 text-[11px] text-card-foreground transition-colors hover:bg-muted/70 dark:hover:bg-muted/40"
            onClick={handleRefreshClick}
            disabled={busy}
          >
            Refresh
          </button>
          <button
            className="rounded border border-border px-2 py-0.5 text-[11px] text-card-foreground transition-colors hover:bg-muted/70 dark:hover:bg-muted/40"
            onClick={() => setOpen(true)}
          >
            Details
          </button>
        </div>
      </div>

      {/* Drawer */}
      {open && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="flex-1 bg-black/30 dark:bg-black/60"
            onClick={() => setOpen(false)}
          />
          <div className="h-full w-[360px] overflow-y-auto border border-border bg-card p-3 text-card-foreground shadow-xl dark:bg-muted">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-card-foreground">Desktop Accuracy</h3>
              <div className="flex items-center gap-2">
                <button
                  className="rounded border border-border px-2 py-0.5 text-[11px] text-card-foreground transition-colors hover:bg-muted/70 dark:hover:bg-muted/40"
                  onClick={handleRefreshClick}
                  disabled={busy}
                >
                  Refresh
                </button>
                <button
                  className="rounded border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700 transition-colors hover:bg-red-100 dark:border-red-400/40 dark:bg-red-500/20 dark:text-red-200 dark:hover:bg-red-500/30"
                  onClick={reset}
                  disabled={busy}
                >
                  Reset
                </button>
                <button
                  className="rounded border border-border px-2 py-0.5 text-[11px] text-card-foreground transition-colors hover:bg-muted/70 dark:hover:bg-muted/40"
                  onClick={() => setOpen(false)}
                >
                  Close
                </button>
              </div>
            </div>

            <div className="rounded-md border border-border bg-muted/30 p-2 text-[11px] text-card-foreground dark:bg-muted/40">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Session overview
                </div>
                <div className="flex min-w-[180px] justify-end">
                  {sessions.length > 1 ? (
                    <Select
                      value={selectedSessionValue}
                      onValueChange={(value) => setSelectedSessionId(value)}
                      disabled={!sessions.length}
                    >
                      <SelectTrigger className="h-8 w-full justify-between rounded-md border border-border/60 bg-card/60 px-2 text-[11px] font-medium text-card-foreground shadow-sm transition-colors hover:bg-card/80 focus:ring-2 focus:ring-bytebot-bronze-light-a3 focus:ring-offset-0 dark:bg-muted/60 dark:hover:bg-muted/70">
                        <SelectValue placeholder="Select session" />
                      </SelectTrigger>
                      <SelectContent>
                        {sessions.map((session) => (
                          <SelectItem key={session.id} value={session.id}>
                            {session.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="inline-flex items-center gap-2 rounded-md border border-border/60 bg-card/60 px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground shadow-sm dark:bg-muted/60">
                      <span>{sessions.length ? "Active session" : "Sessions"}</span>
                      <span className="rounded bg-bytebot-bronze-light-a3 px-2 py-0.5 text-[11px] font-semibold text-bytebot-bronze-light-12 dark:bg-bytebot-bronze-dark-a3 dark:text-bytebot-bronze-dark-12">
                        {singleSessionLabel}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-2 grid grid-cols-3 gap-2">
                <div className="rounded border border-border/70 bg-card/40 px-2 py-1 dark:bg-muted/40">
                  <div className="text-[10px] text-muted-foreground">Start</div>
                  <div className="text-[11px] font-medium text-card-foreground">
                    {sessionStartLabel ?? "Pending"}
                  </div>
                </div>
                <div className="rounded border border-border/70 bg-card/40 px-2 py-1 dark:bg-muted/40">
                  <div className="text-[10px] text-muted-foreground">End</div>
                  <div className="text-[11px] font-medium text-card-foreground">
                    {sessionEndLabel ??
                      (sessionStartLabel ? "In progress" : "Pending")}
                  </div>
                </div>
                <div className="rounded border border-border/70 bg-card/40 px-2 py-1 dark:bg-muted/40">
                  <div className="text-[10px] text-muted-foreground">Duration</div>
                  <div className="text-[11px] font-medium text-card-foreground">
                    {sessionDurationLabel ?? "Not yet available"}
                  </div>
                </div>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="rounded border border-border/70 bg-card/40 px-2 py-1 text-[11px] text-card-foreground dark:bg-muted/40">
                  Events: <span className="font-semibold">{activeSession?.eventCount ?? normalizedEvents.length}</span>
                </div>
                <div className="rounded border border-border/70 bg-card/40 px-2 py-1 text-[11px] text-card-foreground dark:bg-muted/40">
                  Session ID: <span className="break-all font-mono text-[10px] text-muted-foreground">{activeSession?.id ?? "(current)"}</span>
                </div>
              </div>
            </div>

            {/* Primary metrics */}
            <div className="grid grid-cols-3 gap-2 text-[12px]">
              <div className="rounded-md border border-bytebot-bronze-light-6 bg-bytebot-bronze-light-1 p-2 dark:border-bytebot-bronze-dark-6 dark:bg-bytebot-bronze-dark-2">
                <div className="text-[10px] text-bytebot-bronze-light-10 dark:text-bytebot-bronze-dark-10">Targeted</div>
                <div className="text-[14px] font-semibold text-bytebot-bronze-light-12 dark:text-bytebot-bronze-dark-12">{data?.targetedClicks ?? 0}</div>
              </div>
              <div className="rounded-md border border-bytebot-bronze-light-6 bg-bytebot-bronze-light-1 p-2 dark:border-bytebot-bronze-dark-6 dark:bg-bytebot-bronze-dark-2">
                <div className="text-[10px] text-bytebot-bronze-light-10 dark:text-bytebot-bronze-dark-10">Untargeted</div>
                <div className="text-[14px] font-semibold text-bytebot-bronze-light-12 dark:text-bytebot-bronze-dark-12">{data?.untargetedClicks ?? 0}</div>
              </div>
              <div className="rounded-md border border-bytebot-bronze-light-6 bg-bytebot-bronze-light-1 p-2 dark:border-bytebot-bronze-dark-6 dark:bg-bytebot-bronze-dark-2">
                <div className="text-[10px] text-bytebot-bronze-light-10 dark:text-bytebot-bronze-dark-10">Avg Δ (px)</div>
                <div className="text-[14px] font-semibold text-bytebot-bronze-light-12 dark:text-bytebot-bronze-dark-12">{formatNumber(data?.avgAbsDelta)}</div>
              </div>
            </div>

            {/* Chips row 1 */}
            <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-card-foreground">
              <div className="rounded border border-bytebot-bronze-light-6 bg-bytebot-bronze-light-2 px-2 py-1 dark:border-bytebot-bronze-dark-6 dark:bg-bytebot-bronze-dark-2 dark:text-bytebot-bronze-dark-12">
                Keys: <span className="font-medium text-bytebot-bronze-light-12 dark:text-bytebot-bronze-dark-12">{data?.actionCounts?.["type_keys"] ?? 0}</span>
              </div>
              <div className="rounded border border-bytebot-bronze-light-6 bg-bytebot-bronze-light-2 px-2 py-1 dark:border-bytebot-bronze-dark-6 dark:bg-bytebot-bronze-dark-2 dark:text-bytebot-bronze-dark-12">
                Scrolls: <span className="font-medium text-bytebot-bronze-light-12 dark:text-bytebot-bronze-dark-12">{data?.actionCounts?.["scroll"] ?? 0}</span>
              </div>
              <div className="rounded border border-bytebot-bronze-light-6 bg-bytebot-bronze-light-2 px-2 py-1 dark:border-bytebot-bronze-dark-6 dark:bg-bytebot-bronze-dark-2 dark:text-bytebot-bronze-dark-12">
                Screens: <span className="font-medium text-bytebot-bronze-light-12 dark:text-bytebot-bronze-dark-12">{data?.actionCounts?.["screenshot"] ?? 0}</span>
              </div>
            </div>

            {/* Chips row 2 */}
            <div className="mt-1 grid grid-cols-3 gap-2 text-[11px] text-card-foreground">
              <div
                className="rounded border border-bytebot-bronze-light-7 bg-bytebot-bronze-light-a3 px-2 py-1 text-bytebot-bronze-light-12 dark:border-bytebot-bronze-dark-7 dark:bg-bytebot-bronze-dark-a3 dark:text-bytebot-bronze-dark-12"
                title="Count of successful smart clicks"
              >
                Smart (completed): <span className="font-medium text-bytebot-bronze-light-12 dark:text-bytebot-bronze-dark-12">{data?.smartClicks ?? 0}</span>
              </div>
              <div className="rounded border border-bytebot-bronze-light-7 bg-bytebot-bronze-light-a3 px-2 py-1 text-bytebot-bronze-light-12 dark:border-bytebot-bronze-dark-7 dark:bg-bytebot-bronze-dark-a3 dark:text-bytebot-bronze-dark-12">
                Zooms: <span className="font-medium text-bytebot-bronze-light-12 dark:text-bytebot-bronze-dark-12">{data?.progressiveZooms ?? 0}</span>
              </div>
              <div className="rounded border border-bytebot-bronze-light-7 bg-bytebot-bronze-light-a3 px-2 py-1 text-bytebot-bronze-light-12 dark:border-bytebot-bronze-dark-7 dark:bg-bytebot-bronze-dark-a3 dark:text-bytebot-bronze-dark-12">
                Retries: <span className="font-medium text-bytebot-bronze-light-12 dark:text-bytebot-bronze-dark-12">{data?.retryClicks ?? 0}</span>
              </div>
            </div>

            {/* Deltas */}
            <div className="mt-1 grid grid-cols-2 gap-2 text-[11px] text-card-foreground">
              <div className="rounded border border-bytebot-bronze-light-6 bg-bytebot-bronze-light-2 px-2 py-1 dark:border-bytebot-bronze-dark-6 dark:bg-bytebot-bronze-dark-2 dark:text-bytebot-bronze-dark-12">
                Hover Δ avg: <span className="font-medium text-bytebot-bronze-light-12 dark:text-bytebot-bronze-dark-12">{formatNumber(data?.hoverProbes?.avgDiff, { maximumFractionDigits: 2 })}</span> ({data?.hoverProbes?.count ?? 0})
              </div>
              <div className="rounded border border-bytebot-bronze-light-6 bg-bytebot-bronze-light-2 px-2 py-1 dark:border-bytebot-bronze-dark-6 dark:bg-bytebot-bronze-dark-2 dark:text-bytebot-bronze-dark-12">
                Post Δ avg: <span className="font-medium text-bytebot-bronze-light-12 dark:text-bytebot-bronze-dark-12">{formatNumber(data?.postClickDiff?.avgDiff, { maximumFractionDigits: 2 })}</span> ({data?.postClickDiff?.count ?? 0})
              </div>
            </div>

            {/* Large sparkline */}
            {Array.isArray(data?.recentAbsDeltas) && data!.recentAbsDeltas!.length > 0 && (
              <div className="mt-2 flex h-8 items-end gap-[3px]">
                {data!.recentAbsDeltas!.map((v, i) => {
                  const max = Math.max(...(data!.recentAbsDeltas as number[]));
                  const h = max > 0 ? Math.max(2, Math.round((v / max) * 28)) : 2;
                  return (
                    <div
                      key={i}
                      style={{ height: `${h}px` }}
                      className="w-[5px] rounded bg-bytebot-bronze-light-9 opacity-60 dark:bg-bytebot-bronze-dark-9"
                      title={`${formatNumber(v, { maximumFractionDigits: 1 })} px`}
                    />
                  );
                })}
              </div>
            )}

            {/* Footer cards */}
            <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-card-foreground">
              <div className="rounded border border-bytebot-bronze-light-6 bg-bytebot-bronze-light-2 px-2 py-1 dark:border-bytebot-bronze-dark-6 dark:bg-bytebot-bronze-dark-2 dark:text-bytebot-bronze-dark-12">
                Δx: <span className="font-medium text-bytebot-bronze-light-12 dark:text-bytebot-bronze-dark-12">{formatNumber(data?.avgDeltaX, { maximumFractionDigits: 2 })}</span>
              </div>
              <div className="rounded border border-bytebot-bronze-light-6 bg-bytebot-bronze-light-2 px-2 py-1 dark:border-bytebot-bronze-dark-6 dark:bg-bytebot-bronze-dark-2 dark:text-bytebot-bronze-dark-12">
                Δy: <span className="font-medium text-bytebot-bronze-light-12 dark:text-bytebot-bronze-dark-12">{formatNumber(data?.avgDeltaY, { maximumFractionDigits: 2 })}</span>
              </div>
              <div className="rounded border border-bytebot-bronze-light-6 bg-bytebot-bronze-light-2 px-2 py-1 dark:border-bytebot-bronze-dark-6 dark:bg-bytebot-bronze-dark-2 dark:text-bytebot-bronze-dark-12">
                Calib: <span className="font-medium text-bytebot-bronze-light-12 dark:text-bytebot-bronze-dark-12">{data?.calibrationSnapshots ?? 0}</span>
              </div>
            </div>

            <div className="mt-3">
              <div className="text-[11px] font-semibold text-card-foreground">Learning metrics</div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-card-foreground">
                <div className="rounded border border-bytebot-bronze-light-6 bg-card/70 px-2 py-1 dark:border-bytebot-bronze-dark-6 dark:bg-muted/50">
                  Attempts: <span className="font-semibold">{totalAttempts}</span>
                </div>
                <div className="rounded border border-bytebot-bronze-light-6 bg-card/70 px-2 py-1 dark:border-bytebot-bronze-dark-6 dark:bg-muted/50">
                  Success: <span className="font-semibold">{successRateLabel}</span>
                </div>
                <div className="rounded border border-bytebot-bronze-light-6 bg-card/70 px-2 py-1 dark:border-bytebot-bronze-dark-6 dark:bg-muted/50">
                  Avg error: <span className="font-semibold">{averageErrorLabel}</span>
                </div>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-card-foreground">
                <div className="rounded border border-bytebot-bronze-light-6 bg-card/70 px-2 py-1 dark:border-bytebot-bronze-dark-6 dark:bg-muted/50">
                  Weighted offset:
                  <span className="ml-1 font-semibold">{weightedOffsetLabel}</span>
                </div>
                <div className="rounded border border-bytebot-bronze-light-6 bg-card/70 px-2 py-1 dark:border-bytebot-bronze-dark-6 dark:bg-muted/50">
                  Convergence:
                  <span className="ml-1 font-semibold">{convergenceTrendLabel}</span>
                  <span className="ml-1 text-[10px] text-muted-foreground">{convergenceAverageLabel}</span>
                </div>
              </div>

              <div className="mt-2 space-y-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Regional hotspots</div>
                {regionalHotspots.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border/60 bg-card/60 px-3 py-3 text-center text-[11px] text-muted-foreground dark:bg-muted/40">
                    No regional hotspots detected.
                  </div>
                ) : (
                  regionalHotspots.map((hotspot, index) => {
                    const centerLabel = hotspot.center
                      ? `${Math.round(hotspot.center.x)}, ${Math.round(hotspot.center.y)}`
                      : hotspot.key;
                    const offsetLabel = hotspot.weightedOffset
                      ? `${Math.round(hotspot.weightedOffset.x)}, ${Math.round(hotspot.weightedOffset.y)}`
                      : "—";
                    return (
                      <div
                        key={`${hotspot.key}-${index}`}
                        className="rounded-lg border border-bytebot-bronze-light-6 bg-card/70 px-3 py-2 text-[11px] text-card-foreground shadow-sm dark:border-bytebot-bronze-dark-6 dark:bg-muted/50"
                      >
                        <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
                          <span>Hotspot #{index + 1}</span>
                          <span className="font-mono text-[10px] text-muted-foreground">{hotspot.key}</span>
                        </div>
                        <div className="mt-1 text-[11px] text-card-foreground">
                          <div className="text-[10px] text-muted-foreground">Center</div>
                          <div className="font-mono text-[11px]">{centerLabel}</div>
                        </div>
                        <div className="mt-1 grid grid-cols-3 gap-2 text-[10px] text-muted-foreground">
                          <div>
                            Attempts
                            <div className="font-semibold text-card-foreground">{hotspot.attempts}</div>
                          </div>
                          <div>
                            Success
                            <div className="font-semibold text-card-foreground">{formatPercent(hotspot.successRate)}</div>
                          </div>
                          <div>
                            Error
                            <div className="font-semibold text-card-foreground">{formatNumber(hotspot.averageError)}</div>
                          </div>
                        </div>
                        <div className="mt-1 text-[10px] text-muted-foreground">
                          Weighted offset
                          <span className="ml-1 font-mono text-[11px] text-card-foreground">{offsetLabel}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* CV Detection Activity Section */}
            <div className="mt-3">
              <div className="text-[11px] font-semibold text-card-foreground">CV Detection Activity</div>

              {/* Summary Cards */}
              <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                <div className="rounded border border-border bg-card/70 px-2 py-1 dark:bg-muted/50">
                  <div className="text-[10px] text-muted-foreground">Detections</div>
                  <div className="text-[13px] font-semibold text-card-foreground">{cvData?.detections.total ?? 0}</div>
                  <div className="text-[10px] text-muted-foreground">
                    Cache: {formatPercent(cvData?.detections.cacheHitRate)}
                  </div>
                </div>
                <div className="rounded border border-border bg-card/70 px-2 py-1 dark:bg-muted/50">
                  <div className="text-[10px] text-muted-foreground">Clicks</div>
                  <div className="text-[13px] font-semibold text-card-foreground">{cvData?.clicks.total ?? 0}</div>
                  <div className="text-[10px] text-muted-foreground">
                    Success: {formatPercent(cvData?.clicks.successRate)}
                  </div>
                </div>
                <div className="rounded border border-border bg-card/70 px-2 py-1 dark:bg-muted/50">
                  <div className="text-[10px] text-muted-foreground">Methods</div>
                  <div className="text-[13px] font-semibold text-card-foreground">
                    {cvData?.methods ? Object.entries(cvData.methods).filter((entry) => entry[1] > 0).length : 0}
                  </div>
                </div>
              </div>

              {/* Method Breakdown */}
              <div className="mt-2 space-y-1">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Detection Methods
                </div>
                <div className="flex flex-wrap gap-2">
                  {cvData?.methods && Object.entries(cvData.methods).map(([method, count]) => (
                    count > 0 && (
                      <div key={method} className={cn(
                        "rounded border px-2 py-1 text-[10px]",
                        (method === 'holo' || method === 'omniparser') && "border-pink-500/30 bg-pink-500/10 text-pink-600 dark:border-pink-500/40 dark:bg-pink-500/20 dark:text-pink-300",
                        method === 'ocr' && "border-yellow-500/30 bg-yellow-500/10 text-yellow-600 dark:border-yellow-500/40 dark:bg-yellow-500/20 dark:text-yellow-300",
                        method === 'contour' && "border-green-500/30 bg-green-500/10 text-green-600 dark:border-green-500/40 dark:bg-green-500/20 dark:text-green-300",
                        method === 'template' && "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:border-blue-500/40 dark:bg-blue-500/20 dark:text-blue-300",
                        method === 'feature' && "border-purple-500/30 bg-purple-500/10 text-purple-600 dark:border-purple-500/40 dark:bg-purple-500/20 dark:text-purple-300",
                      )}>
                        {method === 'holo' ? 'Holo 1.5-7B' : method === 'omniparser' ? 'Holo 1.5-7B' : method}: {count}
                      </div>
                    )
                  ))}
                  {cvData?.methods && Object.entries(cvData.methods).every((entry) => entry[1] === 0) && (
                    <div className="rounded border border-dashed border-border/60 bg-muted/30 px-2 py-1 text-center text-[10px] text-muted-foreground">
                      No detections yet
                    </div>
                  )}
                </div>
              </div>

              {/* Recent Detections */}
              <div className="mt-2 space-y-1">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Recent Detections (Last 10)
                </div>
                {!cvData?.recentDetections || cvData.recentDetections.length === 0 ? (
                  <div className="rounded border border-dashed border-border/60 bg-muted/30 px-2 py-2 text-center text-[10px] text-muted-foreground dark:bg-muted/40">
                    No detections yet
                  </div>
                ) : (
                  <div className="space-y-1 max-h-[200px] overflow-y-auto">
                    {cvData.recentDetections.slice(0, 10).map((detection, idx) => (
                      <div key={idx} className="rounded border border-border bg-muted/30 px-2 py-1 text-[10px] dark:bg-muted/40">
                        <div className="flex items-center justify-between">
                          <span className="font-medium truncate max-w-[180px]">
                            &quot;{detection.description}&quot;
                          </span>
                          <span className="text-muted-foreground">
                            {detection.elementsFound} found
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-[9px] text-muted-foreground">
                          <span className={cn(
                            "px-1 rounded",
                            (detection.primaryMethod === 'holo-1.5-7b' || detection.primaryMethod === 'omniparser') && "bg-pink-500/20 text-pink-600 dark:bg-pink-500/30 dark:text-pink-300",
                            (detection.primaryMethod !== 'holo-1.5-7b' && detection.primaryMethod !== 'omniparser') && "bg-gray-500/20 dark:bg-gray-500/30"
                          )}>
                            {detection.primaryMethod === 'holo-1.5-7b' ? 'Holo 1.5-7B' : detection.primaryMethod === 'omniparser' ? 'Holo 1.5-7B' : detection.primaryMethod}
                          </span>
                          {detection.cached && (
                            <span className="bg-blue-500/20 text-blue-600 px-1 rounded dark:bg-blue-500/30 dark:text-blue-300">⚡ cached</span>
                          )}
                          <span>{detection.duration}ms</span>
                          <span className="ml-auto">{format(new Date(detection.timestamp), 'HH:mm:ss')}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent Clicks */}
              <div className="mt-2 space-y-1">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Recent Clicks (Last 10)
                </div>
                {!cvData?.recentClicks || cvData.recentClicks.length === 0 ? (
                  <div className="rounded border border-dashed border-border/60 bg-muted/30 px-2 py-2 text-center text-[10px] text-muted-foreground dark:bg-muted/40">
                    No clicks yet
                  </div>
                ) : (
                  <div className="space-y-1 max-h-[150px] overflow-y-auto">
                    {cvData.recentClicks.slice(0, 10).map((click, idx) => (
                      <div key={idx} className={cn(
                        "rounded border px-2 py-1 text-[10px]",
                        click.success ? "border-green-500/30 bg-green-500/10 dark:border-green-500/40 dark:bg-green-500/20" : "border-red-500/30 bg-red-500/10 dark:border-red-500/40 dark:bg-red-500/20"
                      )}>
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[9px]">[{click.elementId}]</span>
                          <span className="text-muted-foreground">
                            ({click.coordinates.x}, {click.coordinates.y})
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-[9px] text-muted-foreground">
                          <span>{click.success ? '✓' : '❌'}</span>
                          <span>{click.detectionMethod}</span>
                          <span className="ml-auto">{format(new Date(click.timestamp), 'HH:mm:ss')}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

