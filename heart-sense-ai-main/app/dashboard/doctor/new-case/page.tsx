"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { HeartPulse, UserPlus, Fingerprint, Globe, Database } from "lucide-react";
import { toast } from "sonner";
import { validatePatientId } from "@/lib/validation";
import { DashboardHeader } from "@/components/ui/DashboardHeader";
import { Stethoscope } from "lucide-react";

export default function NewCasePage() {
    const router = useRouter();
    const [formData, setFormData] = useState({
        fullName: "",
        age: "",
        gender: "male",
        contact: ""
    });
    const [patientId, setPatientId] = useState("");
    const [idType, setIdType] = useState<"NIC" | "Passport" | "Invalid">("Invalid");
    const [isLoading, setIsLoading] = useState(false);

    const handleIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setPatientId(value);
        const result = validatePatientId(value);
        setIdType(result.type);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFormData(prev => ({ ...prev, [e.target.id]: e.target.value }));
    };

    async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (idType === "Invalid") {
            toast.error("Validation Error", {
                description: "Please enter a valid Sri Lankan NIC or Passport number.",
            });
            return;
        }

        setIsLoading(true);
        try {
            const response = await fetch("/api/patients", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...formData,
                    patientId,
                    age: Number(formData.age)
                }),
            });

            const data = await response.json();

            if (!response.ok) throw new Error(data.message);

            toast.success("Patient Registered", {
                description: `Patient ${patientId} has been added and assigned to you.`,
            });
            // Navigate directly to the workspace for the new patient
            router.push(`/dashboard/doctor/workspace/${data.patient._id}`);
        } catch (error: any) {
            toast.error("Registration Error", { description: error.message });
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <>
            <DashboardHeader
                title="New Case"
                badge="Patient Registration"
                icon={<Stethoscope className="h-8 w-8" />}
            />

            <div className="flex-1 overflow-y-auto flex items-center justify-center p-8">
                <div className="w-full max-w-lg">
                    <Card className="glass border-border/30 shadow-2xl overflow-hidden rounded-[2.5rem]">
                        <div className="h-2 w-full bg-gradient-to-r from-primary via-accent to-primary animate-[shimmer_2s_infinite_linear]" style={{ backgroundSize: '200% 100%' }}></div>

                        <CardHeader className="space-y-4 text-center pt-10 px-10">
                            <div className="mx-auto bg-primary/10 p-5 rounded-3xl w-fit futuristic-glow">
                                <UserPlus className="h-10 w-10 text-primary" />
                            </div>
                            <div>
                                <CardTitle className="text-3xl font-bold tracking-tight text-gradient">New Patient Case</CardTitle>
                                <CardDescription className="text-base mt-2">
                                    Register a new patient to begin their diagnostic workflow. They will be automatically assigned to you.
                                </CardDescription>
                            </div>
                        </CardHeader>

                        <form onSubmit={onSubmit}>
                            <CardContent className="space-y-6 px-10 pb-10">
                                <div className="space-y-2">
                                    <Label htmlFor="fullName" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Full Legal Name</Label>
                                    <Input id="fullName" placeholder="Kamal Perera" required value={formData.fullName} onChange={handleChange} className="bg-white/5 border-border/30 rounded-xl h-12 focus:border-primary/50 transition-all font-medium" />
                                </div>

                                <div className="space-y-3">
                                    <div className="flex justify-between items-center px-1">
                                        <Label htmlFor="patient-id" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">National Identifier / Passport</Label>
                                        {idType !== "Invalid" && (
                                            <span className={`text-[10px] font-bold px-3 py-1 rounded-full animate-pulse capitalize ${idType === "NIC" ? "bg-primary/20 text-primary border border-primary/20" : "bg-accent/20 text-accent border border-accent/20"
                                                }`}>
                                                {idType} DETECTED
                                            </span>
                                        )}
                                    </div>
                                    <div className="relative">
                                        <Input
                                            id="patient-id"
                                            placeholder="e.g., 199012345678 or N1234567"
                                            value={patientId}
                                            onChange={handleIdChange}
                                            className={`pl-12 rounded-xl h-14 bg-white/5 border-border/30 transition-all ${idType !== "Invalid" ? "border-primary/50 shadow-[0_0_15px_oklch(0.7_0.15_190/0.1)]" : ""}`}
                                            required
                                        />
                                        <div className="absolute left-4 top-1/2 -translate-y-1/2">
                                            {idType === "Passport" ? <Globe className="h-6 w-6 text-accent" /> : <Fingerprint className="h-6 w-6 text-primary" />}
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="age" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Biological Age</Label>
                                        <Input id="age" type="number" placeholder="45" required value={formData.age} onChange={handleChange} className="bg-white/5 border-border/30 rounded-xl h-12 focus:border-primary/50 transition-all font-medium" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="gender" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Gender</Label>
                                        <select id="gender" value={formData.gender} onChange={handleChange} className="w-full h-12 rounded-xl border border-border/30 bg-white/5 px-4 text-sm outline-none focus:border-primary/50 transition-all cursor-pointer font-medium appearance-none">
                                            <option value="male">Male</option>
                                            <option value="female">Female</option>
                                            <option value="other">Other</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="contact" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Contact Number</Label>
                                    <Input id="contact" placeholder="+94 7X XXX XXXX" required value={formData.contact} onChange={handleChange} className="bg-white/5 border-border/30 rounded-xl h-12 focus:border-primary/50 transition-all font-medium" />
                                </div>

                                <div className="pt-4">
                                    <Button className="w-full h-16 rounded-2xl text-lg font-bold bg-primary text-primary-foreground shadow-lg futuristic-glow border-none hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3 group" type="submit" disabled={isLoading || idType === "Invalid"}>
                                        {isLoading ? "Registering Patient..." : (
                                            <>
                                                Register & Open Workspace
                                                <Database className="w-6 h-6 group-hover:rotate-12 transition-transform" />
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </CardContent>
                        </form>
                    </Card>
                </div>
            </div>
        </>
    );
}
