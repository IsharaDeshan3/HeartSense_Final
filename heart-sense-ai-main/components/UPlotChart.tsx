"use client";

import { useEffect, useRef, useState } from "react";

// Minimal inline types for uPlot to avoid needing @types/uplot
export interface UPlotOptions {
  width?: number;
  height: number;
  scales?: Record<string, unknown>;
  axes?: unknown[];
  series: unknown[];
  legend?: unknown;
  cursor?: unknown;
  padding?: number[];
  plugins?: unknown[];
  [key: string]: unknown;
}

interface UPlotChartProps {
  data: (number | null)[][];
  opts: UPlotOptions;
  onPlotReady?: (plot: unknown) => void;
  className?: string;
}

/**
 * Thin React wrapper around the vanilla uPlot charting library.
 * Handles creation, resizing (via ResizeObserver), and cleanup.
 * uPlot CSS is imported globally in app/globals.css.
 */
export function UPlotChart({
  data,
  opts,
  onPlotReady,
  className,
}: UPlotChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<unknown>(null);
  const [width, setWidth] = useState(0);

  // Track container width with ResizeObserver
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Create / recreate the uPlot instance whenever data, options, or width change
  useEffect(() => {
    if (!containerRef.current || !data?.[0]?.length || width < 10) return;

    let cancelled = false;
    const mergedOpts = { ...opts, width: Math.floor(width) };

    import("uplot").then(({ default: uPlot }) => {
      if (cancelled || !containerRef.current) return;

      // Destroy the previous instance and clear the DOM node
      if (plotRef.current) {
        (plotRef.current as { destroy: () => void }).destroy();
        containerRef.current.innerHTML = "";
        plotRef.current = null;
      }

      const plot = new uPlot(
        mergedOpts as never,
        data as never,
        containerRef.current!,
      );
      plotRef.current = plot;
      onPlotReady?.(plot);
    });

    return () => {
      cancelled = true;
      if (plotRef.current) {
        (plotRef.current as { destroy: () => void }).destroy();
        plotRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, opts, width]);

  return <div ref={containerRef} className={className} />;
}
