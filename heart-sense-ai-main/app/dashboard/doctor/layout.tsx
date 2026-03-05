"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
    Users,
    Activity,
    LogOut,
    Search,
    Plus,
    HeartPulse,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const navItems = [
    { href: "/dashboard/doctor", label: "Workspace", icon: Activity, exact: true },
    { href: "/dashboard/doctor/new-case", label: "New Case", icon: Plus },
    { href: "/dashboard/doctor/patients", label: "My Patients", icon: Users },
    { href: "/dashboard/doctor/diagnostics", label: "ECG Analysis", icon: Activity },
    { href: "/dashboard/doctor/search", label: "Find Patient", icon: Search },
];

export default function DoctorLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();

    const handleLogout = async () => {
        try {
            await fetch("/api/auth/logout", { method: "POST" });
            router.push("/");
            toast.success("Logged out successfully");
        } catch {
            toast.error("Logout failed");
        }
    };

    const isActive = (href: string, exact?: boolean) =>
        exact ? pathname === href : pathname.startsWith(href);

    return (
        <div className="h-screen bg-background text-foreground flex overflow-hidden font-sans">
            {/* Sidebar */}
            <aside className="w-72 border-r border-border/40 glass hidden lg:flex flex-col relative z-20 shrink-0">
                <div className="p-6 flex items-center gap-4">
                    <div className="h-12 w-12 rounded-[1.25rem] bg-primary/10 flex-center text-primary futuristic-glow">
                        <HeartPulse className="h-7 w-7" />
                    </div>
                    <span className="font-black tracking-tighter text-xl text-gradient">HEARTSENSE</span>
                </div>

                <nav className="flex-1 px-6 space-y-2 mt-2">
                    {navItems.map((item) => {
                        const active = isActive(item.href, item.exact);
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`flex items-center gap-4 px-6 py-3 rounded-2xl font-bold transition-all ${active
                                    ? "bg-primary/10 text-primary font-black shadow-sm"
                                    : "hover:bg-primary/5 text-muted-foreground hover:text-foreground"
                                    }`}
                            >
                                <item.icon className="h-5 w-5" />
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>

                <div className="p-6 border-t border-border/20">
                    <Button
                        variant="ghost"
                        className="w-full justify-start gap-4 text-muted-foreground hover:text-destructive rounded-2xl h-12 font-bold"
                        onClick={handleLogout}
                    >
                        <LogOut className="h-5 w-5" />
                        Sign Out
                    </Button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col relative overflow-y-auto bg-background">
                {/* Background Gradients */}
                <div className="absolute top-[-10%] right-[-10%] w-[800px] h-[800px] bg-primary/10 rounded-full blur-[180px] -z-10 animate-pulse" />
                <div className="absolute bottom-[-10%] left-[-10%] w-[600px] h-[600px] bg-accent/5 rounded-full blur-[150px] -z-10" />
                {children}
            </main>
        </div>
    );
}
