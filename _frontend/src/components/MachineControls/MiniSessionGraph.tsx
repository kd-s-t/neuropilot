"use client";

import React from "react";
import { Line } from "react-chartjs-2";

export default function MiniSessionGraph({ data }: any) {
  const bandPowers = (data.bandPowers as Record<string, { power: number }>[] | undefined) ?? [];
  const timestamps = (data.timestamps as number[] | undefined) ?? [];
  const positions = (data.positions as { x: number; y: number }[] | undefined) ?? [];

  const chartLabels =
    timestamps.length > 0
      ? timestamps.map((t, i) => (i % Math.ceil(timestamps.length / 5) === 0 ? `${((t - timestamps[0]) / 1000).toFixed(0)}s` : ""))
      : bandPowers.map((_, i) => (i % Math.ceil(bandPowers.length / 5) === 0 ? String(i) : ""));

  const chartData = {
    labels: chartLabels,
    datasets: [
      {
        label: "Alpha",
        data: bandPowers.map((bp) => (bp.Alpha?.power ?? 0) as number),
        borderColor: "rgba(54, 162, 235, 1)",
        backgroundColor: "rgba(54, 162, 235, 0.1)",
        fill: true,
        tension: 0.2,
      },
      {
        label: "Beta",
        data: bandPowers.map((bp) => (bp.Beta?.power ?? 0) as number),
        borderColor: "rgba(255, 206, 86, 1)",
        backgroundColor: "rgba(255, 206, 86, 0.1)",
        fill: true,
        tension: 0.2,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
    scales: { x: { display: false }, y: { display: false } },
  };

  const pathD =
    positions.length > 1
      ? positions.map((p, i) => `${i === 0 ? "M" : "L"} ${(p.x / 500) * 200} ${200 - (p.y / 500) * 200}`).join(" ")
      : "";

  return (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <p className="mb-1 text-[10px] font-medium text-muted-foreground">Position Trail</p>
        <div className="h-16 rounded border border-border bg-muted/50 p-1">
          <svg viewBox="0 0 200 200" className="h-full w-full" preserveAspectRatio="xMidYMid meet">
            {pathD && (
              <path
                d={pathD}
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth="2"
                strokeLinecap="round"
              />
            )}
          </svg>
        </div>
      </div>
      <div>
        <p className="mb-1 text-[10px] font-medium text-muted-foreground">Band Powers</p>
        <div className="h-16 rounded border border-border bg-muted/50 p-1">
          {bandPowers.length > 0 ? (
            <Line options={chartOptions as any} data={chartData as any} />
          ) : (
            <p className="flex h-full items-center justify-center text-[10px] text-muted-foreground">
              No data
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

