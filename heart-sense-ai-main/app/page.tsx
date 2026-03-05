import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { 
  HeartPulse, 
  Mic, 
  Activity, 
  FileText, 
  BrainCircuit, 
  Database, 
  Globe, 
  ShieldCheck, 
  ArrowRight,
  Stethoscope,
  Microscope,
  Network
} from "lucide-react";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground selection:bg-primary/20 overflow-x-hidden font-sans">
      {/* Bioluminescent Background Ambience */}
      <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden opacity-50 dark:opacity-100">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-primary/20 rounded-full blur-[160px] animate-pulse"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-accent/20 rounded-full blur-[160px] animate-pulse" style={{ animationDelay: '3s' }}></div>
      </div>

      {/* Navigation */}
      <header className="sticky top-0 z-50 w-full glass border-b border-border/50 supports-[backdrop-filter]:bg-background/40">
        <div className="container mx-auto flex h-20 items-center justify-between px-6 lg:px-12">
          <Link href="/" className="flex items-center gap-3 group transition-all duration-300">
            <div className="p-2 rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
              <HeartPulse className="h-8 w-8 text-primary group-hover:scale-110 transition-transform" />
            </div>
            <span className="text-2xl font-black tracking-tighter text-gradient">HEARTSENSE AI</span>
          </Link>
          <nav className="hidden md:flex items-center gap-10 text-sm font-bold uppercase tracking-widest">
            <Link href="#abstract" className="text-muted-foreground hover:text-primary transition-colors hover:text-glow">Abstract</Link>
            <Link href="#methodology" className="text-muted-foreground hover:text-primary transition-colors hover:text-glow">Methodology</Link>
            <Link href="#modules" className="text-muted-foreground hover:text-primary transition-colors hover:text-glow">Core Modules</Link>
          </nav>
          <div className="flex items-center gap-4">
            <Button asChild className="rounded-full px-8 py-6 bg-primary text-primary-foreground futuristic-glow border-none hover:opacity-90 transition-all font-black text-base">
              <Link href="/register">CLINICIAN ACCESS</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center">
        {/* Research Hero Section */}
        <section className="relative w-full max-w-7xl px-6 pt-24 pb-32 flex flex-col items-center text-center">
          <div className="inline-flex items-center rounded-full border border-primary/30 bg-primary/5 px-6 py-2 text-xs font-black tracking-[0.3em] text-primary mb-12 uppercase organic-pulse shadow-[0_0_20px_rgba(var(--primary),0.1)]">
            Research Grade Diagnostic Support
          </div>
          
          <h1 className="text-6xl md:text-8xl lg:text-9xl font-black tracking-tight leading-[0.95] mb-10 max-w-6xl">
            Integrated <span className="text-gradient">Cardiac AI</span> <br className="hidden md:block"/> for Equitable Care
          </h1>
          
          <p className="text-xl md:text-2xl text-muted-foreground max-w-4xl mb-16 leading-relaxed font-medium">
            Bridging the specialist divide in Sri Lanka through neural symptom extraction and noise-robust waveform interpretation.
          </p>

          <div className="flex flex-center flex-wrap gap-6">
            <Button size="lg" className="rounded-full h-16 px-12 text-xl font-black bg-primary text-primary-foreground futuristic-glow hover:scale-105 transition-transform">
              EXPLORE METHODOLOGY
            </Button>
            <Button size="lg" variant="outline" className="rounded-full h-16 px-12 text-xl font-bold border-primary/20 hover:bg-primary/5 backdrop-blur-md group">
              PEER REVIEWS <ArrowRight className="ml-2 w-6 h-6 group-hover:translate-x-2 transition-transform" />
            </Button>
          </div>
        </section>

        {/* Abstract Section */}
        <section id="abstract" className="w-full py-24 container px-6">
           <div className="max-w-5xl mx-auto glass p-10 md:p-20 rounded-[4rem] relative overflow-hidden text-center border-primary/20 futuristic-glow">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-1.5 bg-gradient-to-r from-transparent via-primary to-transparent"></div>
              <h2 className="text-base font-black tracking-[0.4em] text-primary uppercase mb-10">Scientific Abstract</h2>
              <p className="text-2xl md:text-3xl italic text-foreground leading-[1.4] font-semibold tracking-tight">
                "Cardiovascular diseases account for 32% of global deaths. Our research proposes an integrated AI system synthesizing Sinhala NLP and ECG recognition to ground diagnostic hypotheses in established clinical guidelines."
              </p>
           </div>
        </section>

        {/* Core Methodology Modules */}
        <section id="modules" className="w-full py-32 bg-primary/5 border-y border-border/50">
          <div className="container mx-auto px-6 lg:px-12">
            <div className="text-center mb-24">
              <h2 className="text-4xl md:text-6xl font-black mb-6 tracking-tight text-gradient">The Multimodal Framework</h2>
              <p className="text-muted-foreground text-xl max-w-3xl mx-auto font-medium">
                Four independent intelligence layers working in clinical synchrony to define the future of diagnostics.
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              {[
                { 
                  icon: <Mic className="w-10 h-10" />, 
                  title: "Sinhala Clinical NLP", 
                  desc: "Fine-tuned Whisper model with real-time symptom extraction from Sinhala consultations." 
                },
                { 
                  icon: <Activity className="w-10 h-10" />, 
                  title: "ECG Digitization", 
                  desc: "Noise-robust CNNs for path-specific classification from digitized paper waveforms." 
                },
                { 
                  icon: <Microscope className="w-10 h-10" />, 
                  title: "Category-Aware RAG", 
                  desc: "Evidence-backed lab test recommendations grounded in international ESC/AHA guidelines." 
                },
                { 
                  icon: <BrainCircuit className="w-10 h-10" />, 
                  title: "Synthesis Agent", 
                  desc: "Knowledge Reasoning Agent identifying rare pathologies like Kounis syndrome." 
                }
              ].map((f, i) => (
                <Card key={i} className="glass group hover:border-primary/50 transition-all duration-500 overflow-hidden text-center p-2 rounded-[3rem]">
                  <CardContent className="pt-16 pb-12 px-10 flex flex-col items-center">
                    <div className="h-24 w-24 rounded-[2rem] bg-primary/10 flex-center mb-10 text-primary futuristic-glow group-hover:scale-110 group-hover:rotate-3 transition-all duration-500">
                      {f.icon}
                    </div>
                    <h3 className="text-2xl font-black mb-6 tracking-tight group-hover:text-glow transition-all">{f.title}</h3>
                    <p className="text-muted-foreground text-base leading-relaxed font-medium">{f.desc}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Technical Specification Section */}
        <section id="methodology" className="w-full py-32 container px-6 flex flex-col items-center">
           <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center max-w-7xl">
              <div className="text-left">
                 <h2 className="text-5xl md:text-7xl font-black mb-12 text-gradient leading-[0.95]">Bridging the <br/> Expertise Gap</h2>
                 <div className="space-y-10">
                    {[
                      { icon: <Globe className="text-primary w-8 h-8" />, title: "Low-Resource Language Support", text: "Optimized NLP pipelines for the Sinhala context to avoid loss of vital symptomatic nuances." },
                      { icon: <Database className="text-accent w-8 h-8" />, title: "FAISS Indexed Evidence", text: "Retrieval from a proprietary corpus of rare-case research for conditions like Uhl anomaly." },
                      { icon: <Network className="text-primary w-8 h-8" />, title: "Distributed Orchestration", text: "Orchestrated via LangChain with high-performance reasoning agents on HuggingFace Spaces." }
                    ].map((item, i) => (
                      <div key={i} className="flex gap-8 group">
                        <div className="shrink-0 h-16 w-16 glass rounded-2xl flex-center border-primary/10 shadow-xl group-hover:scale-110 transition-transform">
                          {item.icon}
                        </div>
                        <div>
                          <h4 className="text-xl font-black mb-3 group-hover:text-glow transition-all">{item.title}</h4>
                          <p className="text-muted-foreground text-base leading-relaxed font-medium">{item.text}</p>
                        </div>
                      </div>
                    ))}
                 </div>
              </div>

              {/* Research Metrics Visualization */}
              <div className="glass p-16 rounded-[4rem] border-primary/10 relative group futuristic-glow overflow-hidden">
                 <div className="absolute inset-0 bg-primary/5 blur-[80px] -z-10 group-hover:bg-primary/10 transition-all duration-700"></div>
                 <div className="flex flex-col gap-12">
                    <div className="space-y-6">
                       <div className="flex justify-between items-end">
                          <span className="text-sm font-black tracking-[0.5em] text-primary uppercase">Precision Metric</span>
                          <span className="text-6xl font-black text-gradient">92.4%</span>
                       </div>
                       <div className="h-2.5 w-full bg-primary/10 rounded-full overflow-hidden">
                          <div className="h-full w-[92.4%] bg-primary shadow-[0_0_20px_var(--color-primary)]"></div>
                       </div>
                    </div>
                    <div className="space-y-6">
                       <div className="flex justify-between items-end">
                          <span className="text-sm font-black tracking-[0.5em] text-accent uppercase">F1 Recognition</span>
                          <span className="text-6xl font-black text-gradient">0.88</span>
                       </div>
                       <div className="h-2.5 w-full bg-accent/10 rounded-full overflow-hidden">
                          <div className="h-full w-[88%] bg-accent shadow-[0_0_20px_var(--color-accent)]"></div>
                       </div>
                    </div>
                    <div className="pt-10 border-t border-border mt-6">
                       <p className="text-xs text-muted-foreground font-black leading-relaxed text-center uppercase tracking-[0.4em] opacity-60">
                          SLIIT RESEARCH | CLINICAL VALIDATION 2026
                       </p>
                    </div>
                 </div>
              </div>
           </div>
        </section>

        {/* Dark Mode CTA Section */}
        <section className="w-full py-48 flex flex-center flex-col relative overflow-hidden">
           <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,oklch(0.7_0.2_210/0.15)_0%,transparent_70%)] -z-10 animate-pulse"></div>
           <div className="p-4 rounded-3xl bg-primary/10 mb-12 futuristic-glow">
              <Stethoscope className="w-16 h-16 text-primary organic-pulse" />
           </div>
           <h2 className="text-5xl md:text-8xl font-black text-center mb-12 max-w-5xl tracking-tighter leading-[0.9]">
              Democratizing <span className="text-gradient">Cardiac Expertise</span> <br className="hidden md:block" /> Across the Nation.
           </h2>
           <div className="flex gap-6 flex-wrap justify-center">
              <Button size="lg" className="rounded-full h-20 px-16 text-2xl font-black bg-primary text-primary-foreground shadow-2xl futuristic-glow hover:scale-[1.05] transition-all">
                ACCESS CLINICAL BETA
              </Button>
              <Button size="lg" variant="ghost" className="rounded-full h-20 px-16 text-2xl font-black border-2 border-primary/20 hover:bg-primary/5 backdrop-blur-xl transition-all">
                JOIN RESEARCH
              </Button>
           </div>
        </section>
      </main>

      <footer className="w-full py-24 border-t border-border glass flex-center bg-background/80">
        <div className="container mx-auto px-6 text-center">
          <div className="flex flex-center flex-wrap gap-8 mb-12 opacity-50">
             <span className="text-[11px] font-black tracking-[0.5em] uppercase">SYSTEM V4.0.2</span>
             <span className="text-[11px] font-black tracking-[0.5em] uppercase">HEARTSENSE.AI</span>
             <span className="text-[11px] font-black tracking-[0.5em] uppercase">SLIIT MALABE</span>
          </div>
          <div className="max-w-4xl mx-auto mb-10 text-muted-foreground text-sm font-medium tracking-wide">
            Designed for the medical frontline. Ensuring every heartbeat is heard, analyzed, and protected with research-grade artificial intelligence.
          </div>
          <p className="text-xs text-muted-foreground font-black uppercase tracking-widest opacity-40">© 2026 HEARTSENSE RESEARCH INITIATIVE. ESTABLISHED AT SLIIT MALABE.</p>
        </div>
      </footer>
    </div>
  );
}
