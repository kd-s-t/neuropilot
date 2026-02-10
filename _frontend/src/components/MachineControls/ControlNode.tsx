"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import * as ReactChartJS2 from "react-chartjs-2";
import * as Icons from "lucide-react";
import { ChartNetwork, Unlink } from "lucide-react";

const LineChartComponent = (ReactChartJS2 as any).Line as React.ComponentType<{ options: any; data: any }>;

const GRAPH_VISIBLE_KEY = "neuropilot-control-graph-visible";

function getStoredGraphVisible(): boolean {
  if (typeof window === "undefined") return true;
  const raw = localStorage.getItem(GRAPH_VISIBLE_KEY);
  if (raw === "false") return false;
  if (raw === "true") return true;
  return true;
}

function setStoredGraphVisible(value: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(GRAPH_VISIBLE_KEY, String(value));
}

export default function ControlNode({ data }: any) {
  const { control, binding, boundSession, onControlClick, selectedControl, onWebhookTrigger, webhookLoading, onUnbind, unbindLoading } = data;
  const [graphVisible, setGraphVisible] = useState(true);

  useEffect(() => {
    setGraphVisible(getStoredGraphVisible());
  }, []);

  const toggleGraph = () => {
    setGraphVisible((v) => {
      const next = !v;
      setStoredGraphVisible(next);
      return next;
    });
  };

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
  const bands = ["Delta", "Theta", "Alpha", "Beta", "Gamma"] as const;
  const bandColors = [
    { border: "rgba(255, 99, 132, 1)", fill: "rgba(255, 99, 132, 0.15)" },
    { border: "rgba(54, 162, 235, 1)", fill: "rgba(54, 162, 235, 0.15)" },
    { border: "rgba(255, 206, 86, 1)", fill: "rgba(255, 206, 86, 0.15)" },
    { border: "rgba(75, 192, 192, 1)", fill: "rgba(75, 192, 192, 0.15)" },
    { border: "rgba(153, 102, 255, 1)", fill: "rgba(153, 102, 255, 0.15)" },
  ];
  const chartData = {
    labels: chartLabels,
    datasets: bands.map((band, i) => ({
      label: band,
      data: bandPowers.map((bp: any) => (bp[band]?.power ?? 0) as number),
      borderColor: bandColors[i].border,
      backgroundColor: bandColors[i].fill,
      fill: true,
      tension: 0.2,
    })),
  };
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    devicePixelRatio: typeof window !== "undefined" ? Math.min(window.devicePixelRatio, 2) : 1,
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
    scales: { x: { display: false }, y: { display: false } },
  };

  return (
    <motion.div
      className="flex flex-col items-center gap-1"
      initial={data.motion?.initial ?? { scale: 0.97, opacity: 0 }}
      animate={data.motion?.animate ?? { scale: 1, opacity: 1 }}
      whileHover={data.motion?.whileHover ?? { scale: 1 }}
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
            <span className={`absolute top-0 text-[5px] bg-green-500 text-white px-0.5 py-0 rounded ${binding && boundSession ? "right-[14px]" : "right-0"}`}>
              Bound
            </span>
          )}
          {binding && boundSession && (
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleGraph}
              className="absolute top-0 right-0 h-[10px] w-[10px] p-0 flex items-center justify-center [&_svg]:!size-[10px]"
              title={graphVisible ? "Hide graph" : "Show graph"}
            >
              <ChartNetwork className="size-[10px]" />
            </Button>
          )}
        </div>
        {binding && boundSession && (
          <AnimatePresence initial={false}>
            {graphVisible && (
              <motion.div
                key="graph"
                className="flex flex-col gap-0.5 w-[180px] overflow-hidden"
                initial={{ x: -180, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 180, opacity: 0 }}
                transition={{ type: "tween", duration: 0.2 }}
              >
                <div className="h-[40px]">
                  <div className="h-full rounded border border-border bg-muted/50 p-1">
                    {bandPowers.length > 0 ? (
                      <LineChartComponent options={chartOptions as any} data={chartData as any} />
                    ) : (
                      <p className="flex h-full items-center justify-center text-[7px] text-muted-foreground">
                        No data
                      </p>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
      <div className="flex items-center gap-1 self-start">
        {(control as any).webhook_url && onWebhookTrigger && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onWebhookTrigger(control)}
            disabled={webhookLoading}
            className="h-[10px] w-[10px] p-0 flex items-center justify-center"
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
        {binding && onUnbind && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onUnbind(binding.id)}
            disabled={unbindLoading}
            className="h-[10px] w-[10px] p-0 flex items-center justify-center [&_svg]:!size-[10px]"
            title="Unbind"
          >
            <Unlink className="size-[10px]" />
          </Button>
        )}
      </div>
    </motion.div>
  );
}

