"use client";

import DroneScene from "@/components/DroneScene";
import { Card, CardContent } from "@/components/ui/card";

export default function DronePage() {
  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-4 text-sm text-muted-foreground">
        F start, G land. Shift descend; if you reach ground you stop (no G needed). WASD move, Space rise (when flying). Camera follows.
      </div>
      <Card>
        <CardContent className="p-0">
          <div className="h-[520px] w-full">
            <DroneScene className="h-full w-full rounded-b-lg" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
