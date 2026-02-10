"use client";

import { useEffect, useRef } from "react";

const BOX_SIZE = 20;

export function useCanvasGame(
  canvasId: string,
  position: { x: number; y: number },
  imgSrc: string
) {
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.src = imgSrc;

    const draw = () => {
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (img.complete && img.naturalWidth) {
        ctx.drawImage(img, position.x, position.y, BOX_SIZE, BOX_SIZE);
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [canvasId, imgSrc, position]);
}
