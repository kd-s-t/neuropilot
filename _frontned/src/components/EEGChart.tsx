"use client";

import { useMemo } from "react";
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

const colors = [
  { border: "rgba(255, 99, 132, 1)", fill: "rgba(255, 99, 132, 0.2)" },
  { border: "rgba(54, 162, 235, 1)", fill: "rgba(54, 162, 235, 0.2)" },
  { border: "rgba(255, 206, 86, 1)", fill: "rgba(255, 206, 86, 0.2)" },
  { border: "rgba(75, 192, 192, 1)", fill: "rgba(75, 192, 192, 0.2)" },
  { border: "rgba(153, 102, 255, 1)", fill: "rgba(153, 102, 255, 0.2)" },
];

const bands = ["Delta", "Theta", "Alpha", "Beta", "Gamma"] as const;

type EEGData = {
  [K in (typeof bands)[number]]: { power: number[]; range: [number, number] };
};

export default function EEGChart({ eegData }: { eegData: EEGData }) {
  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 0, // Disable animation for real-time updates
    },
    scales: {
      x: { 
        display: false,
        ticks: {
          maxTicksLimit: 20,
        },
      },
      y: { 
        beginAtZero: true,
        ticks: {
          callback: function(value: any) {
            if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M';
            if (value >= 1000) return (value / 1000).toFixed(1) + 'k';
            return value;
          },
        },
      },
    },
    plugins: { 
      legend: { position: "top" as const },
      tooltip: {
        callbacks: {
          label: function(context: any) {
            let label = context.dataset.label || '';
            if (label) {
              label += ': ';
            }
            const value = context.parsed.y;
            if (value >= 1000000) {
              label += (value / 1000000).toFixed(2) + 'M';
            } else if (value >= 1000) {
              label += (value / 1000).toFixed(2) + 'k';
            } else {
              label += value.toFixed(2);
            }
            return label;
          },
        },
      },
    },
  }), []);

  const chartData = useMemo(() => {
    const maxLength = Math.max(...bands.map(band => eegData[band].power.length), 100);
    const labels = Array.from({ length: maxLength }, (_, i) => i);
    
    // Create new arrays to ensure reference changes
    const datasets = bands.map((band, i) => {
      const powerData = eegData[band].power;
      // If no data, create array of zeros with the expected length
      const data = powerData.length > 0 
        ? [...powerData] 
        : Array(maxLength).fill(0);
      
      return {
        label: band,
        data,
        borderColor: colors[i].border,
        backgroundColor: colors[i].fill,
        fill: false,
        tension: 0.1,
        pointRadius: 1,
        pointHoverRadius: 3,
        borderWidth: 2,
      };
    });
    
    return {
      labels: [...labels],
      datasets,
    };
  }, [eegData]);

  return (
    <div className="h-[500px] w-full">
      <Line options={options} data={chartData} />
    </div>
  );
}
