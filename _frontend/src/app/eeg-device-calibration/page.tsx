 "use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import EEGDeviceCalibration from "@/components/Realtime";

export default function EEGDeviceCalibrationRoutePage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  if (status !== "authenticated") {
    return null;
  }

  return (
    <div className="container mx-auto p-4">
      <EEGDeviceCalibration />
    </div>
  );
}