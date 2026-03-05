"use client";

import { useState, useEffect } from "react";
import {
    Users,
    Search,
    ChevronRight,
    Loader2,
    UserX
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { DashboardHeader } from "@/components/ui/DashboardHeader";
import { useRouter } from "next/navigation";

export default function DoctorPatientsPage() {
    const router = useRouter();
    const [patients, setPatients] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");

    useEffect(() => {
        const fetchPatients = async () => {
            try {
                const res = await fetch("/api/doctor/patients");
                if (res.ok) {
                    setPatients(await res.json());
                }
            } catch {
                console.error("Failed to fetch patients");
            } finally {
                setIsLoading(false);
            }
        };
        fetchPatients();
    }, []);

    const filtered = patients.filter(p =>
        p.fullName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.patientId?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <>
            <DashboardHeader
                title="My Patients"
                icon={<Users className="h-8 w-8" />}
            />

            <div className="p-12 flex-1 overflow-y-auto space-y-8">
                {/* Search Bar */}
                <div className="relative max-w-2xl">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                        placeholder="Search by name or patient ID..."
                        className="pl-12 h-14 bg-white/5 border-border/30 rounded-2xl focus:border-primary/50 transition-all"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                {/* Content */}
                {isLoading ? (
                    <div className="flex items-center justify-center h-80">
                        <Loader2 className="h-12 w-12 animate-spin text-primary/40" />
                    </div>
                ) : filtered.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filtered.map((patient) => (
                            <Card
                                key={patient._id}
                                className="glass border-border/30 hover:border-primary/40 transition-all duration-300 group rounded-[2rem] overflow-hidden cursor-pointer hover:shadow-2xl"
                                onClick={() => router.push(`/dashboard/doctor/workspace/${patient._id}`)}
                            >
                                <CardContent className="p-8">
                                    <div className="flex items-center gap-6 mb-6">
                                        <div className="h-14 w-14 rounded-[1.25rem] bg-primary/10 flex-center text-primary font-black text-xl border border-primary/20 group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300">
                                            {patient.fullName?.charAt(0) || "?"}
                                        </div>
                                        <div className="space-y-1">
                                            <h3 className="text-lg font-black tracking-tight group-hover:text-primary transition-colors">{patient.fullName}</h3>
                                            <p className="text-[11px] text-muted-foreground font-mono">{patient.patientId}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">
                                            {patient.age ? `${patient.age} yrs • ${patient.gender || "N/A"}` : "Details pending"}
                                        </span>
                                        <div className="h-10 w-10 rounded-full glass border-border/50 flex-center group-hover:bg-primary group-hover:text-primary-foreground transition-all">
                                            <ChevronRight className="h-5 w-5" />
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                ) : (
                    <div className="py-24 text-center space-y-8">
                        <div className="glass border-border/20 border-dashed rounded-[4rem] p-20 max-w-2xl mx-auto futuristic-glow shadow-primary/5">
                            <div className="h-24 w-24 rounded-[2rem] bg-primary/5 flex-center mx-auto mb-8 text-primary/20">
                                <UserX className="h-12 w-12" />
                            </div>
                            <h2 className="text-2xl font-black tracking-tight text-foreground/60 uppercase mb-3">
                                No Patients Found
                            </h2>
                            <p className="text-muted-foreground font-medium max-w-md mx-auto mb-8">
                                {searchQuery
                                    ? "No patients match your search criteria. Try adjusting your query."
                                    : "You don't have any patients assigned yet. Ask your administrator to assign patients to your clinical profile."}
                            </p>
                            <Button
                                variant="outline"
                                className="rounded-full h-14 px-10 border-primary/30 font-black text-sm uppercase tracking-widest hover:bg-primary/10 text-primary"
                                onClick={() => router.push("/dashboard/doctor/search")}
                            >
                                <Search className="h-4 w-4 mr-3" />
                                Search Registry
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}
