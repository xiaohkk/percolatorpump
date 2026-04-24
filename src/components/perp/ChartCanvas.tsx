"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  IChartApi,
  ISeriesApi,
  LineStyle,
  UTCTimestamp,
} from "lightweight-charts";

/**
 * Terminal-style area chart that drives `MarkChart`. This module MUST NOT
 * be imported on the server: lightweight-charts v4 touches the DOM at
 * module scope, which crashes Next.js SSR. The wrapper in `MarkChart.tsx`
 * brings it in via `dynamic(..., { ssr: false })` — see STATE.md's
 * lightweight-charts note.
 */
export interface ChartPoint {
  /** Unix seconds; lightweight-charts v4 uses `UTCTimestamp` for this. */
  time: number;
  value: number;
}

interface Props {
  points: ChartPoint[];
  /**
   * Latest mark (lamports per token). Displayed as the chart header. Chart
   * data itself comes from `points`; this is a visual cue so the user
   * never waits for the next tick to see the current number.
   */
  liveMark: bigint | null;
}

export default function ChartCanvas({ points, liveMark }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);

  // One-time chart setup. Runs client-side only because this module is
  // lazy-loaded via dynamic import with `ssr: false`.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      width: el.clientWidth,
      height: el.clientHeight,
      layout: {
        // `ColorType.Solid` matches the parent card's `bg-zinc-950/40`
        // so the chart blends with the page instead of rendering on a
        // bright backdrop.
        background: { type: ColorType.Solid, color: "#09090b" },
        textColor: "#71717a",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: "#18181b", style: LineStyle.Dotted },
        horzLines: { color: "#18181b", style: LineStyle.Dotted },
      },
      rightPriceScale: {
        borderColor: "#27272a",
        scaleMargins: { top: 0.12, bottom: 0.08 },
      },
      timeScale: {
        visible: false, // match prompt: no time axis labels
        borderColor: "#27272a",
      },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: { color: "#3f3f46", width: 1, style: LineStyle.Dashed, labelVisible: false },
        horzLine: { color: "#3f3f46", width: 1, style: LineStyle.Dashed, labelVisible: true },
      },
      handleScale: false,
      handleScroll: false,
      kineticScroll: { mouse: false, touch: false },
    });

    const series = chart.addAreaSeries({
      topColor: "rgba(16, 185, 129, 0.35)",
      bottomColor: "rgba(16, 185, 129, 0.02)",
      lineColor: "#10b981",
      lineWidth: 2,
      priceLineVisible: true,
      priceLineColor: "#10b981",
      priceLineStyle: LineStyle.Dotted,
      lastValueVisible: true,
      crosshairMarkerBorderColor: "#10b981",
      crosshairMarkerBackgroundColor: "#064e3b",
    });

    chartRef.current = chart;
    seriesRef.current = series;

    // Fit to parent width on resize. ResizeObserver is cheap and avoids a
    // window-level listener fighting with React re-renders.
    const ro = new ResizeObserver(() => {
      chart.applyOptions({
        width: el.clientWidth,
        height: el.clientHeight,
      });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Push new points on every render. `setData` is cheap on v4 because the
  // series re-diffs against the previous array; for a 60-point ring this
  // is effectively a memcpy.
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    if (points.length === 0) {
      series.setData([]);
      return;
    }
    series.setData(
      points.map((p) => ({
        time: p.time as UTCTimestamp,
        value: p.value,
      }))
    );
    chartRef.current?.timeScale().fitContent();
  }, [points]);

  return (
    <div
      data-testid="mark-chart"
      className="w-full h-[320px] md:h-[420px] rounded-lg border border-zinc-800 bg-zinc-950/40 overflow-hidden relative"
    >
      <header className="absolute left-3 top-2 z-10 flex items-baseline gap-2 pointer-events-none">
        <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
          mark
        </span>
        <span className="text-xs font-mono tabular-nums text-emerald-300">
          {liveMark === null ? "—" : formatPrice(liveMark)}
        </span>
      </header>
      <div
        ref={containerRef}
        data-testid="mark-chart-canvas"
        className="w-full h-full"
      />
    </div>
  );
}

function formatPrice(p: bigint): string {
  const s = p.toString();
  if (s.length <= 10) return s;
  return s.slice(0, 3) + "…" + s.slice(-3);
}
