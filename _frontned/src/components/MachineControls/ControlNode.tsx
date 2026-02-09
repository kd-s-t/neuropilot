"use client";

import React from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import { Line } from "react-chartjs-2";
import * as Icons from "lucide-react";

// Lightweight, loosely-typed props to avoid tight coupling with parent file
export default function ControlNode({ data }: any) {
  const { control, binding, boundSession, onControlClick, selectedControl, onWebhookTrigger, webhookLoading } = data;

  const buttonVariant = selectedControl === control.id ? "default" : "outline";

  const getBackgroundColor = () => {
    if (control.bgColor) return control.bgColor;
    if (control.id === "start") return "#22c55e";
    if (control.id === "stop") return "#ef4444";
    return undefined;
  };

  const bgColor = getBackgroundColor();
  const textColor = bgColor ? "text-white" : "";
  const buttonStyle = bgColor ? { backgroundColor: bgColor } : {};
  const buttonClassName = `h-[40px] w-[40px] p-0 text-[7px] ${textColor}`;

  const bandPowers = boundSession ? (boundSession.data.bandPowers as Record<string, { power: number }>[] | undefined) ?? [] : [];
  const timestamps = boundSession ? (boundSession.data.timestamps as number[] | undefined) ?? [] : [];
  const chartLabels = timestamps.length > 0
    ? timestamps.map((t: number, i: number) => (i % Math.ceil(timestamps.length / 5) === 0 ? `${((t - timestamps[0]) / 1000).toFixed(0)}s` : ""))
    : bandPowers.map((_: any, i: number) => (i % Math.ceil(bandPowers.length / 5) === 0 ? String(i) : ""));
  const chartData = {
    labels: chartLabels,
    datasets: [
      {
        label: "Alpha",
        data: bandPowers.map((bp: any) => (bp.Alpha?.power ?? 0) as number),
        borderColor: "rgba(54, 162, 235, 1)",
        backgroundColor: "rgba(54, 162, 235, 0.1)",
        fill: true,
        tension: 0.2,
      },
      {
        label: "Beta",
        data: bandPowers.map((bp: any) => (bp.Beta?.power ?? 0) as number),
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

  return (
    <motion.div
      className="flex flex-col items-center gap-1"
      initial={data.motion?.initial ?? { scale: 0.97, opacity: 0 }}
      animate={data.motion?.animate ?? { scale: 1, opacity: 1 }}
      whileHover={data.motion?.whileHover ?? { scale: 1.03 }}
      whileTap={data.motion?.whileTap ?? { scale: 0.98 }}
      transition={{ type: "spring", stiffness: 400, damping: 28 }}
    >
      <div className="flex items-center gap-2">
        <div className="relative">
          <Button
            variant={buttonVariant}
            size="lg"
            onClick={() => onControlClick(control.id)}
            className={buttonClassName}
            style={buttonStyle}
          >
            <div className="flex flex-col items-center gap-0.5">
              {control.icon && (() => {
                const IconComponent = (Icons as any)[control.icon];
                return IconComponent ? (
                  <IconComponent className="h-4 w-4" />
                ) : (
                  <span className="text-sm leading-none">{control.icon}</span>
                );
              })()}
              <span className="text-[7px] leading-tight">{control.description || control.id}</span>
            </div>
          </Button>
          {binding && (
            <span className="absolute top-0 right-0 text-[5px] bg-green-500 text-white px-0.5 py-0 rounded">
              Bound
            </span>
          )}
        </div>
        {binding && boundSession && (
          <div className="flex flex-col gap-0.5 w-[180px]">
            <div className="h-[40px]">
            <div className="h-full rounded border border-border bg-muted/50 p-1">
              {bandPowers.length > 0 ? (
                <Line options={chartOptions as any} data={chartData as any} />
              ) : (
                <p className="flex h-full items-center justify-center text-[7px] text-muted-foreground">
                  No data
                </p>
              )}
            </div>
            </div>
          </div>
        )}
      </div>
      {(control as any).webhook_url && onWebhookTrigger && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onWebhookTrigger(control)}
          disabled={webhookLoading}
          className="h-[10px] w-[10px] p-0 flex items-center justify-center self-start"
          title="Trigger webhook"
        >
          <Image
            src="/webhooks.png"
            alt="Trigger webhook"
            width={10}
            height={10}
            className={`object-contain w-full h-full origin-[51%_49%] ${webhookLoading ? "animate-spin" : ""}`}
          />
        </Button>
      )}
    </motion.div>
  );
}

