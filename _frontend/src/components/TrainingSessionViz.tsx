"use client";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const bandColors = [
  { border: "rgba(255, 99, 132, 1)", fill: "rgba(255, 99, 132, 0.15)" },
  { border: "rgba(54, 162, 235, 1)", fill: "rgba(54, 162, 235, 0.15)" },
  { border: "rgba(255, 206, 86, 1)", fill: "rgba(255, 206, 86, 0.15)" },
  { border: "rgba(75, 192, 192, 1)", fill: "rgba(75, 192, 192, 0.15)" },
  { border: "rgba(153, 102, 255, 1)", fill: "rgba(153, 102, 255, 0.15)" },
];

const bands = ["Delta", "Theta", "Alpha", "Beta", "Gamma"] as const;

type SessionData = {
  initial_position?: { x: number; y: number };
  positions?: { x: number; y: number }[];
  bandPowers?: Record<string, { power: number; range: [number, number] }>[];
  timestamps?: number[];
  final_position?: { x: number; y: number };
};

type Props = { data: SessionData };

export default function TrainingSessionViz({ data }: Props) {
  const positions = data.positions ?? [];
  const bandPowers = data.bandPowers ?? [];
  const timestamps = data.timestamps ?? [];
  const init = data.initial_position ?? { x: 50, y: 50 };
  const final = data.final_position ?? init;

  const allPoints = [init, ...positions, final].filter(Boolean);
  const w = 500;
  const h = 500;
  const pathD =
    allPoints.length > 1
      ? allPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${h - p.y}`).join(" ")
      : "";

  const chartLabels =
    timestamps.length > 0
      ? timestamps.map((t) => `${((t - timestamps[0]) / 1000).toFixed(1)}s`)
      : bandPowers.map((_, i) => String(i));

  const chartData = {
    labels: chartLabels,
    datasets: bands.map((band, i) => ({
      label: band,
      data: bandPowers.map((bp) => (bp[band]?.power ?? 0) as number),
      borderColor: bandColors[i].border,
      backgroundColor: bandColors[i].fill,
      fill: false,
      tension: 0.2,
    })),
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: { title: { display: true, text: "Time" }, ticks: { maxRotation: 0 } },
      y: { beginAtZero: true, title: { display: true, text: "Power" } },
    },
    plugins: { legend: { position: "top" as const } },
  };

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div>
        <p className="mb-2 text-sm font-medium">Position trail</p>
        <div className="rounded border border-border bg-muted/50 p-2">
          <svg
            viewBox={`0 0 ${w} ${h}`}
            className="h-48 w-full max-w-[400px]"
            preserveAspectRatio="xMidYMid meet"
          >
            <rect width={w} height={h} fill="var(--muted)" className="opacity-50" />
            {pathD && (
              <path
                d={pathD}
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
            {allPoints.length > 0 && (
              <>
                <circle cx={init.x} cy={h - init.y} r="8" fill="green" opacity={0.8} />
                <circle cx={final.x} cy={h - final.y} r="8" fill="red" opacity={0.8} />
              </>
            )}
          </svg>
          <p className="mt-1 text-xs text-muted-foreground">Green: start · Red: end</p>
        </div>
      </div>
      <div>
        <p className="mb-2 text-sm font-medium">Band powers over time</p>
        <div className="h-48 rounded border border-border bg-muted/50 p-2">
          {bandPowers.length > 0 ? (
            <Line options={chartOptions} data={chartData} />
          ) : (
            <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No band power data
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
