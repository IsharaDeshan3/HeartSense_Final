"use client";

import { useState, useRef } from "react";
import { ShieldAlert, Upload, FileCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface VerificationPortalProps {
  onComplete: () => void;
}

export function VerificationPortal({ onComplete }: VerificationPortalProps) {
  const [idImage, setIdImage] = useState<string | null>(null);
  const [licenseImage, setLicenseImage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const idInputRef = useRef<HTMLInputElement>(null);
  const licenseInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>, setter: (val: string) => void) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => setter(event.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async () => {
    if (!idImage || !licenseImage) {
      toast.error("Both National ID and Medical License are required.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/doctor/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idImage, licenseImage }),
      });

      if (res.ok) {
        toast.success("Credentials uploaded. Awaiting admin audit.");
        onComplete();
      } else {
        throw new Error("Upload failed");
      }
    } catch (error) {
      toast.error("Failed to submit verification documents.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-[2.5rem] p-10 space-y-8 shadow-xl animate-in fade-in zoom-in-95 duration-500">
      <div className="flex items-center gap-4 text-primary">
        <div className="h-12 w-12 rounded-2xl bg-primary/10 flex-center">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-xl font-bold tracking-tight">Clinical Verification Required</h2>
          <p className="text-sm text-muted-foreground font-medium">Please upload research-grade documentation to access the clinical registry.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* ID Upload */}
        <div 
          onClick={() => idInputRef.current?.click()}
          className={`h-48 border-2 border-dashed rounded-[2rem] flex flex-col items-center justify-center p-6 cursor-pointer transition-all ${idImage ? "border-accent/40 bg-accent/5" : "border-border hover:border-primary/40 hover:bg-primary/5"}`}
        >
          {idImage ? (
            <div className="text-center space-y-2">
              <FileCheck className="h-10 w-10 text-accent mx-auto" />
              <p className="text-xs font-bold text-accent uppercase">National ID Loaded</p>
            </div>
          ) : (
            <div className="text-center space-y-2">
              <Upload className="h-10 w-10 text-muted-foreground mx-auto" />
              <p className="text-xs font-bold uppercase text-muted-foreground">Upload National ID</p>
            </div>
          )}
          <input type="file" ref={idInputRef} onChange={(e) => handleFile(e, setIdImage)} className="hidden" accept="image/*" />
        </div>

        {/* License Upload */}
        <div 
          onClick={() => licenseInputRef.current?.click()}
          className={`h-48 border-2 border-dashed rounded-[2rem] flex flex-col items-center justify-center p-6 cursor-pointer transition-all ${licenseImage ? "border-accent/40 bg-accent/5" : "border-border hover:border-primary/40 hover:bg-primary/5"}`}
        >
          {licenseImage ? (
            <div className="text-center space-y-2">
              <FileCheck className="h-10 w-10 text-accent mx-auto" />
              <p className="text-xs font-bold text-accent uppercase">Medical License Loaded</p>
            </div>
          ) : (
            <div className="text-center space-y-2">
              <Upload className="h-10 w-10 text-muted-foreground mx-auto" />
              <p className="text-xs font-bold uppercase text-muted-foreground">Upload Medical License</p>
            </div>
          )}
          <input type="file" ref={licenseInputRef} onChange={(e) => handleFile(e, setLicenseImage)} className="hidden" accept="image/*" />
        </div>
      </div>

      <Button 
        onClick={handleSubmit}
        disabled={!idImage || !licenseImage || isSubmitting}
        className="w-full h-16 rounded-2xl bg-primary text-primary-foreground font-bold text-lg shadow-lg shadow-primary/20 transition-all active:scale-95 disabled:opacity-50"
      >
        {isSubmitting ? <Loader2 className="h-6 w-6 animate-spin" /> : "Submit for Verification"}
      </Button>
    </div>
  );
}
