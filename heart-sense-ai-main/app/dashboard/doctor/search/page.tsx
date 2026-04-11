"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function DoctorSearchRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard/doctor");
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">
      <div className="flex items-center gap-3 text-sm font-semibold">
        <Loader2 className="h-4 w-4 animate-spin" />
        Redirecting to unified clinical search...
      </div>
    </div>
  );
}
