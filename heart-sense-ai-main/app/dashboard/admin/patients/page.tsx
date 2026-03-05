"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { 
  ArrowLeft, 
  Users, 
  Search, 
  Filter, 
  RefreshCw,
  Clock,
  ExternalLink,
  Lock,
  UserPlus
} from "lucide-react";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { DashboardHeader } from "@/components/ui/DashboardHeader";

interface Patient {
  _id: string;
  fullName: string;
  patientId: string;
  age: number;
  gender: string;
  contact: string;
  createdAt: string;
}

export default function AdminPatientRegistry() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isAssigning, setIsAssigning] = useState<string | null>(null);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [patientsRes, doctorsRes] = await Promise.all([
        fetch("/api/patients"),
        fetch("/api/admin/staff")
      ]);
      
      if (!patientsRes.ok || !doctorsRes.ok) throw new Error("Failed to fetch registry data");
      
      const [patientsData, doctorsData] = await Promise.all([
        patientsRes.json(),
        doctorsRes.json()
      ]);
      
      setPatients(patientsData);
      setDoctors(doctorsData.filter((d: any) => d.role === "doctor" && d.isApproved));
    } catch (error: any) {
      toast.error("Registry Sync Error", { description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAssignDoctor = async (patientDbId: string, doctorId: string) => {
    setIsAssigning(patientDbId);
    try {
      const response = await fetch("/api/admin/patients/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientDbId, doctorId }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message);

      toast.success("Assignment Complete", {
        description: data.message
      });
    } catch (error: any) {
      toast.error("Assignment Failed", { description: error.message });
    } finally {
      setIsAssigning(null);
    }
  };

  const filteredPatients = patients.filter(p => 
    p.fullName.toLowerCase().includes(searchQuery.toLowerCase()) || 
    p.patientId.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background flex flex-col relative overflow-hidden">
      <DashboardHeader 
        title="Patient Registry"
        icon={<Users className="h-8 w-8" />}
      >
        <Link href="/dashboard/admin" className="inline-flex items-center gap-2 text-muted-foreground hover:text-white transition-colors group text-xs font-bold uppercase tracking-widest">
           <ArrowLeft className="w-3 h-3 group-hover:-translate-x-1 transition-transform" />
           Control Tower
        </Link>
        <div className="flex items-center gap-3">
           <Button variant="outline" className="rounded-xl border-white/10 glass" onClick={fetchData} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Sync
           </Button>
           <Button asChild className="rounded-xl bg-primary text-primary-foreground glow-primary border-none font-bold">
              <Link href="/dashboard/admin/create-patient">New Registry Entry</Link>
           </Button>
        </div>
      </DashboardHeader>

      <div className="p-8 flex flex-col items-center flex-1 overflow-y-auto w-full">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-full -z-10 bg-[radial-gradient(circle_at_50%_-20%,oklch(0.7_0.15_180/0.05)_0%,transparent_70%)]"></div>
      
      <div className="w-full max-w-6xl space-y-8">

        <div className="flex flex-col md:flex-row gap-4 items-center mb-8">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input 
              placeholder="Search by Name or National Identifier..." 
              className="pl-12 h-14 bg-white/5 border-white/10 rounded-2xl focus:border-primary/50 transition-all"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Button variant="outline" className="rounded-2xl h-14 px-6 border-white/10 glass gap-2">
            <Filter className="h-4 w-4" />
            Advanced Filtering
          </Button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-48 glass rounded-[2rem] border-white/5 bg-white/5"></div>
            ))}
          </div>
        ) : filteredPatients.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredPatients.map(patient => (
              <Card key={patient._id} className="glass border-white/5 hover:border-primary/30 transition-all duration-300 group rounded-[2rem] overflow-hidden">
                <CardContent className="p-8">
                  <div className="flex justify-between items-start mb-6">
                    <div className="h-12 w-12 rounded-2xl bg-primary/10 flex-center text-primary font-bold text-lg">
                      {patient.fullName.charAt(0)}
                    </div>
                    <div className="px-3 py-1 bg-white/5 rounded-full text-[10px] font-bold text-muted-foreground flex items-center gap-2">
                       <Clock className="h-3 h-3" />
                       {new Date(patient.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  
                  <div className="space-y-1 mb-6">
                    <h3 className="text-xl font-bold tracking-tight group-hover:text-primary transition-colors">{patient.fullName}</h3>
                    <p className="text-muted-foreground font-mono text-xs">{patient.patientId}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pb-6 border-b border-white/5 mb-6">
                    <div>
                      <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Biological Age</p>
                      <p className="text-sm font-medium">{patient.age} Yrs</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Gender</p>
                      <p className="text-sm font-medium capitalize">{patient.gender}</p>
                    </div>
                  </div>

                  <div className="space-y-4 pt-6 border-t border-white/5">
                    <p className="text-[10px] uppercase font-black tracking-[0.2em] text-primary/50">Clinical Assignment</p>
                    <div className="flex gap-2">
                       <Select 
                         onValueChange={(val) => handleAssignDoctor(patient._id, val)}
                         disabled={isAssigning === patient._id}
                       >
                         <SelectTrigger className="glass border-white/10 rounded-xl h-10 text-xs">
                           <SelectValue placeholder="Assign Doctor" />
                         </SelectTrigger>
                         <SelectContent className="glass border-white/10 rounded-xl">
                            {doctors.map(doc => (
                              <SelectItem key={doc._id} value={doc._id} className="text-xs">
                                Dr. {doc.lastName} ({doc.identifier})
                              </SelectItem>
                            ))}
                         </SelectContent>
                       </Select>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-6">
                     <span className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground/50">
                        <Lock className="h-3 w-3" />
                        ACCESS AUDITED
                     </span>
                     <Button variant="ghost" size="sm" className="h-8 rounded-lg hover:bg-primary/10 hover:text-primary group/btn">
                        Records <ExternalLink className="h-3 w-3 ml-2 group-hover/btn:translate-x-0.5" />
                     </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="py-24 text-center space-y-4 glass rounded-[3rem] border-white/5">
             <div className="h-16 w-16 glass rounded-full flex-center mx-auto mb-6">
                <Users className="h-8 w-8 text-muted-foreground/20" />
             </div>
             <h2 className="text-2xl font-bold tracking-tight text-muted-foreground">No records found matching criteria</h2>
             <p className="text-sm text-muted-foreground/60">Try adjusting your search or sync with the latest database entries.</p>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
