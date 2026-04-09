"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect } from "react";
import { HeartPulse } from "lucide-react";

export default function Home() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;

          const target = entry.target as HTMLElement;
          target.classList.add("visible");
        });
      },
      { threshold: 0.12 },
    );

    const revealElements = document.querySelectorAll(".reveal");
    revealElements.forEach((el) => observer.observe(el));

    const anchorLinks =
      document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]');

    const handlers: Array<{
      anchor: HTMLAnchorElement;
      handler: (event: Event) => void;
    }> = [];

    anchorLinks.forEach((anchor) => {
      const handler = (event: Event) => {
        const hash = anchor.hash;
        if (!hash || hash === "#") {
          return;
        }

        const targetId = decodeURIComponent(hash.slice(1));
        if (!targetId) {
          return;
        }

        const target = document.getElementById(targetId);
        if (!target) return;

        event.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      };

      anchor.addEventListener("click", handler);
      handlers.push({ anchor, handler });
    });

    return () => {
      revealElements.forEach((el) => observer.unobserve(el));
      observer.disconnect();

      handlers.forEach(({ anchor, handler }) => {
        anchor.removeEventListener("click", handler);
      });
    };
  }, []);

  return (
    <>
      <nav>
        <Link href="#" className="nav-logo">
          <div className="nav-logo-icon" aria-hidden>
            <HeartPulse size={20} />
          </div>
          <span className="nav-wordmark">
            Heart<span>Sense</span> AI
          </span>
        </Link>
        <div className="nav-links">
          <a href="#abstract">Abstract</a>
          <a href="#problem">Problem</a>
          <a href="#modules">Modules</a>
        </div>
        <Link href="/login" className="nav-cta">
          Clinician Access
        </Link>
      </nav>

      <section className="hero">
        <div className="hero-orb hero-orb-1" />
        <div className="hero-orb hero-orb-2" />
        <div className="hero-orb hero-orb-3" />

        <div className="hero-layout">
          <div className="hero-content">
            <div className="hero-kicker">
              Live Research Program · SLIIT Malabe · 2026
            </div>
            <h1 className="hero-h1">
              <em>Clinical-Grade</em> Cardiac Decision Support for Every
              Hospital
            </h1>
            <p className="hero-sub">
              Built for Sri Lanka's frontline care teams, HeartSense AI combines
              Sinhala consultation intelligence, ECG interpretation, lab
              reasoning, and rare-case retrieval into one explainable workspace
              for faster and safer triage.
            </p>
            <div className="trust-row">
              <span className="trust-chip">SLIIT Research Initiative</span>
              <span className="trust-chip">Clinical Workflow Focused</span>
              <span className="trust-chip">Explainable AI Pipeline</span>
            </div>
            <div className="hero-btns">
              <a href="/login" className="btn-primary">
                Request Clinical Pilot Access
              </a>
              <a href="#abstract" className="btn-outline">
                Review Research Abstract {">"}
              </a>
            </div>

            <div className="hero-ecg-wrap">
              <svg
                className="ecg-line"
                viewBox="0 0 700 60"
                preserveAspectRatio="none"
              >
                <path
                  className="ecg-path"
                  d="M0,30 L40,30 L50,30 L55,28 L60,30 L80,30 L90,10 L100,50 L110,30 L125,30 L130,28 L135,30 L160,30 L165,14 L172,46 L178,30 L200,30 L210,30 L215,28 L220,30 L240,30 L250,8 L260,52 L270,30 L290,30 L295,28 L300,30 L320,30 L330,10 L340,50 L350,30 L370,30 L375,28 L380,30 L400,30 L410,8 L420,52 L430,30 L450,30 L455,28 L460,30 L480,30 L490,10 L500,50 L510,30 L530,30 L535,28 L540,30 L560,30 L570,8 L580,52 L590,30 L620,30 L630,28 L640,30 L700,30"
                />
              </svg>
            </div>
          </div>

          <aside
            className="hero-visual reveal reveal-d2"
            aria-label="Hero visual"
          >
            <Image
              src="/hero-image-res.png"
              alt="Doctor interacting with a cardiac AI interface"
              fill
              priority
              sizes="(max-width: 980px) 100vw, 46vw"
              className="hero-photo"
            />
          </aside>
        </div>
      </section>

      <div className="stats-strip">
        <div className="stat-item reveal">
          <span className="stat-num">32%</span>
          <span className="stat-label">of global mortality is CVD</span>
        </div>
        <div className="stat-item reveal reveal-d1">
          <span className="stat-num">17.9M</span>
          <span className="stat-label">annual deaths worldwide</span>
        </div>
        <div className="stat-item reveal reveal-d2">
          <span className="stat-num">92.4%</span>
          <span className="stat-label">precision heart attack model</span>
        </div>
        <div className="stat-item reveal reveal-d3">
          <span className="stat-num">0.88</span>
          <span className="stat-label">F1 score ECG recognition</span>
        </div>
        <div className="stat-item reveal reveal-d4">
          <span className="stat-num">700K+</span>
          <span className="stat-label">rare-case FAISS vectors</span>
        </div>
      </div>

      <section id="abstract" className="abstract-section">
        <div className="container">
          <div className="abstract-card reveal">
            <div className="abstract-grid">
              <div>
                <span className="section-kicker">Scientific Abstract</span>
                <p className="abstract-quote">
                  "Cardiovascular disease remains one of the most urgent
                  clinical burdens, while many frontline settings still depend
                  on delayed specialist review and fragmented workflows.
                  HeartSense AI is designed as a multimodal clinical support
                  pipeline, connecting consultation context, ECG interpretation,
                  lab reasoning, and evidence retrieval into one explainable
                  decision interface."
                </p>
              </div>
              <div className="abstract-side">
                <h3>Why This Research Matters</h3>
                <ul>
                  <li>
                    Bridges specialist access gaps in regional care settings.
                  </li>
                  <li>
                    Supports doctors with explainable and auditable AI output.
                  </li>
                  <li>
                    Combines symptom, signal, lab, and evidence in one flow.
                  </li>
                  <li>
                    Designed for practical integration into existing workflow.
                  </li>
                </ul>
                <div className="abstract-meta">
                  <div className="abstract-meta-item">
                    Faculty · <span>SLIIT Malabe</span>
                  </div>
                  <div className="abstract-meta-item">
                    Framework · <span>Multi-modal AI</span>
                  </div>
                  <div className="abstract-meta-item">
                    Focus · <span>Rural Sri Lanka</span>
                  </div>
                  <div className="abstract-meta-item">
                    Year · <span>2026</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="problem" className="gaps-section">
        <div className="container">
          <div className="reveal">
            <span className="section-kicker">Problem Landscape</span>
            <h2 className="section-h2">
              Four barriers slowing reliable cardiac decision-making
            </h2>
          </div>
          <div className="gaps-grid reveal">
            <div className="gap-card">
              <div className="gap-index">01 · Documentation Friction</div>
              <div className="gap-title">
                Clinical language is lost in translation
              </div>
              <div className="gap-text">
                Sinhala consultations often become fragmented during manual note
                conversion, reducing the fidelity of clinically relevant
                context.
              </div>
            </div>
            <div className="gap-card">
              <div className="gap-index">
                02 · ECG Interpretation Bottleneck
              </div>
              <div className="gap-title">
                Signal quality and expertise mismatch
              </div>
              <div className="gap-text">
                Accurate interpretation depends on specialist experience, while
                real-world ECG sources are frequently noisy, scanned, or
                incomplete.
              </div>
            </div>
            <div className="gap-card">
              <div className="gap-index">03 · Fragmented Risk Insight</div>
              <div className="gap-title">
                Labs and history are interpreted in isolation
              </div>
              <div className="gap-text">
                Static scoring misses longitudinal biomarker movement and fails
                to produce clear next-step diagnostic guidance.
              </div>
            </div>
            <div className="gap-card">
              <div className="gap-index">04 · Rare-Case Blind Spots</div>
              <div className="gap-title">
                Low-frequency cases remain under-supported
              </div>
              <div className="gap-text">
                Pattern-only models can underperform on uncommon but critical
                conditions without explicit evidence retrieval.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="modules" className="modules-section">
        <div className="container">
          <div className="modules-header reveal">
            <span className="section-kicker">The Multimodal Framework</span>
            <h2 className="section-h2">
              Four integrated layers, one clinician workflow
            </h2>
          </div>
          <div className="modules-grid">
            <div className="module-card reveal reveal-d1">
              <div className="module-num">MODULE · 01</div>
              <div className="module-title">Sinhala Clinical NLP</div>
              <div className="module-desc">
                Converts natural consultation dialogue into structured clinical
                context, preserving intent before diagnostic reasoning begins.
              </div>
              <div className="module-metric">
                <span className="metric-val">Input Layer</span>
                <span className="metric-label">Consultation intelligence</span>
              </div>
            </div>
            <div className="module-card reveal reveal-d2">
              <div className="module-num">MODULE · 02</div>
              <div className="module-title">Noise-Robust ECG Digitization</div>
              <div className="module-desc">
                Stabilizes and interprets real-world ECG input from imperfect
                sources to produce clinician-usable signal insight.
              </div>
              <div className="module-metric">
                <span className="metric-val">Signal Layer</span>
                <span className="metric-label">
                  ECG quality and interpretation
                </span>
              </div>
            </div>
            <div className="module-card reveal reveal-d3">
              <div className="module-num">MODULE · 03</div>
              <div className="module-title">Category-Aware Lab Analysis</div>
              <div className="module-desc">
                Aligns extracted lab data with longitudinal context to support
                urgency-aware recommendations and better triage decisions.
              </div>
              <div className="module-metric">
                <span className="metric-val">Risk Layer</span>
                <span className="metric-label">Trend-aware lab reasoning</span>
              </div>
            </div>
            <div className="module-card reveal reveal-d4">
              <div className="module-num">MODULE · 04</div>
              <div className="module-title">Evidence-Driven Reasoning</div>
              <div className="module-desc">
                Connects patient signals to evidence-backed knowledge retrieval
                so recommendations remain explainable and clinically grounded.
              </div>
              <div className="module-metric">
                <span className="metric-val">Evidence Layer</span>
                <span className="metric-label">
                  Rare-case retrieval + synthesis
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="cta" className="cta-section">
        <div className="cta-inner reveal">
          <span className="section-kicker">Pilot and Collaboration</span>
          <h2 className="cta-h2">
            Move this research from prototype to <em>clinical impact</em>
          </h2>
          <p className="cta-sub">
            Partner with the HeartSense AI team to validate workflows,
            participate in pilot deployment, or collaborate on the next phase of
            research translation.
          </p>
          <div className="cta-cards">
            <article className="cta-card">
              <h3>For Clinicians</h3>
              <p>
                Join the pilot access queue and evaluate HeartSense AI in
                day-to-day cardiac triage workflows.
              </p>
              <a href="/register" className="btn-primary">
                Request Clinical Pilot Access
              </a>
            </article>
            <article className="cta-card">
              <h3>For Researchers</h3>
              <p>
                Collaborate on dataset expansion, model validation, and
                publication-ready translational studies.
              </p>
              <a href="#" className="btn-outline">
                Contact Research Team {">"}
              </a>
            </article>
          </div>
        </div>
      </section>

      <footer>
        <div className="footer-inner">
          <div className="footer-left">
            <div className="footer-wordmark">
              Heart<span>Sense</span> AI
            </div>
            <div className="footer-sub">
              AI-Powered Cardiac Diagnosis Support · SLIIT Malabe
            </div>
          </div>
          <div className="footer-right">
            <a href="#abstract">Abstract</a>
            <a href="#problem">Problem</a>
            <a href="#modules">Modules</a>
          </div>
        </div>
        <div className="footer-bottom">
          <span>
            © 2026 HeartSense Research Initiative — Established at SLIIT Malabe
          </span>
          <span className="footer-code">
            SYSTEM V4.0.2 · CLINICAL VALIDATION 2026
          </span>
        </div>
      </footer>

      <style jsx global>{`
        :root {
          --bg: oklch(0.97 0.006 85);
          --bg-2: oklch(0.96 0.008 85);
          --bg-3: oklch(0.94 0.01 83);
          --fg: oklch(0.2 0.015 60);
          --fg-2: oklch(0.38 0.015 65);
          --fg-3: oklch(0.54 0.013 70);
          --card: oklch(0.99 0.004 85 / 0.92);
          --primary: oklch(0.42 0.05 220);
          --primary-l: oklch(0.58 0.045 220);
          --primary-ll: oklch(0.88 0.03 220);
          --accent: oklch(0.52 0.055 195);
          --accent-l: oklch(0.86 0.025 195);
          --success: oklch(0.48 0.11 155);
          --success-l: oklch(0.87 0.06 155);
          --warn: oklch(0.58 0.12 75);
          --warn-l: oklch(0.92 0.065 75);
          --danger: oklch(0.52 0.18 25);
          --danger-l: oklch(0.93 0.06 25);
          --border: oklch(0.86 0.008 85 / 0.7);
          --mono:
            "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Monaco,
            Consolas, "Liberation Mono", "Courier New", monospace;
          --sans: var(--font-ibm-plex-sans), sans-serif;
          --serif:
            var(--font-ibm-plex-sans-condensed), var(--font-ibm-plex-sans),
            sans-serif;
          --r-lg: 16px;
          --r-xl: 24px;
          --r-pill: 999px;
        }

        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        html {
          scroll-behavior: smooth;
        }

        body {
          font-family: var(--sans);
          background: var(--bg);
          color: var(--fg);
          overflow-x: hidden;
          -webkit-font-smoothing: antialiased;
        }

        body::before {
          content: "";
          position: fixed;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          background-image:
            linear-gradient(oklch(0.42 0.05 220 / 0.03) 1px, transparent 1px),
            linear-gradient(
              90deg,
              oklch(0.42 0.05 220 / 0.03) 1px,
              transparent 1px
            );
          background-size: 48px 48px;
        }

        nav {
          position: sticky;
          top: 0;
          z-index: 100;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 2rem;
          height: 68px;
          background: oklch(0.97 0.006 85 / 0.88);
          backdrop-filter: blur(16px);
          border-bottom: 1px solid var(--border);
        }

        .nav-logo {
          display: flex;
          align-items: center;
          gap: 10px;
          text-decoration: none;
          color: inherit;
        }

        .nav-logo-icon {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          background: var(--primary);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .nav-wordmark {
          font-family: var(--serif);
          font-size: 18px;
          color: var(--fg);
          letter-spacing: -0.02em;
        }

        .nav-wordmark span {
          color: var(--primary);
        }

        .nav-links {
          display: flex;
          gap: 1.2rem;
          align-items: center;
        }

        .nav-links a {
          font-size: 13px;
          font-weight: 400;
          color: var(--fg-2);
          text-decoration: none;
          letter-spacing: 0.04em;
          transition: color 0.2s;
        }

        .nav-links a:hover {
          color: var(--primary);
        }

        .nav-cta {
          font-size: 13px;
          font-weight: 500;
          padding: 8px 20px;
          border-radius: var(--r-pill);
          background: var(--primary);
          color: white;
          border: none;
          cursor: pointer;
          letter-spacing: 0.03em;
          transition:
            opacity 0.2s,
            transform 0.15s;
          text-decoration: none;
        }

        .nav-cta:hover {
          opacity: 0.88;
          transform: translateY(-1px);
        }

        .hero {
          position: relative;
          z-index: 1;
          min-height: 92vh;
          padding: 5rem 2rem 5rem;
          overflow: hidden;
        }

        .hero-layout {
          max-width: 1160px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: 1.08fr 0.92fr;
          gap: 2.5rem;
          align-items: center;
        }

        .hero-content {
          max-width: 660px;
        }

        .hero-orb {
          position: absolute;
          border-radius: 50%;
          pointer-events: none;
          filter: blur(80px);
          animation: float 8s ease-in-out infinite;
        }

        .hero-orb-1 {
          width: 520px;
          height: 520px;
          top: -120px;
          left: -100px;
          background: oklch(0.58 0.045 220 / 0.14);
        }

        .hero-orb-2 {
          width: 400px;
          height: 400px;
          bottom: -80px;
          right: -80px;
          background: oklch(0.52 0.055 195 / 0.12);
          animation-delay: -4s;
        }

        .hero-orb-3 {
          width: 280px;
          height: 280px;
          top: 40%;
          left: 55%;
          background: oklch(0.48 0.11 155 / 0.08);
          animation-delay: -2s;
        }

        @keyframes float {
          0%,
          100% {
            transform: translateY(0) scale(1);
          }
          50% {
            transform: translateY(-24px) scale(1.04);
          }
        }

        .hero-kicker {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 16px;
          border-radius: var(--r-pill);
          background: var(--primary-ll);
          color: var(--primary);
          font-size: 11px;
          font-family: var(--mono);
          font-weight: 500;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          margin-bottom: 2rem;
          border: 1px solid oklch(0.42 0.05 220 / 0.25);
          animation: fadeUp 0.7s ease both;
        }

        .hero-kicker::before {
          content: "";
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--success);
          animation: pulse-dot 2s ease-in-out infinite;
        }

        @keyframes pulse-dot {
          0%,
          100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.5;
            transform: scale(1.4);
          }
        }

        .hero-h1 {
          font-family: var(--serif);
          font-size: clamp(2.7rem, 5.6vw, 5rem);
          font-weight: 500;
          line-height: 1.08;
          letter-spacing: -0.02em;
          color: var(--fg);
          max-width: 680px;
          margin-bottom: 1.5rem;
          animation: fadeUp 0.7s 0.1s ease both;
          text-wrap: balance;
        }

        .hero-h1 em {
          font-style: italic;
          color: var(--primary);
        }

        .hero-sub {
          font-size: 17px;
          line-height: 1.7;
          color: var(--fg-2);
          max-width: 620px;
          font-weight: 300;
          margin-bottom: 1.25rem;
          animation: fadeUp 0.7s 0.2s ease both;
        }

        .trust-row {
          display: flex;
          gap: 0.6rem;
          flex-wrap: wrap;
          margin-bottom: 1.8rem;
        }

        .trust-chip {
          padding: 5px 10px;
          border-radius: 999px;
          font-size: 10px;
          font-family: var(--mono);
          letter-spacing: 0.05em;
          text-transform: uppercase;
          background: oklch(0.96 0.01 85 / 0.78);
          border: 1px solid oklch(0.86 0.008 85 / 0.95);
          color: var(--fg-2);
        }

        .hero-btns {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          animation: fadeUp 0.7s 0.3s ease both;
        }

        .btn-primary,
        .btn-outline {
          padding: 13px 32px;
          border-radius: var(--r-pill);
          font-size: 14px;
          font-weight: 500;
          text-decoration: none;
          display: inline-block;
          transition:
            transform 0.15s,
            opacity 0.2s,
            border-color 0.2s,
            color 0.2s;
        }

        .btn-primary {
          background: var(--primary);
          color: white;
          border: none;
        }

        .btn-primary:hover {
          transform: translateY(-2px);
          opacity: 0.9;
        }

        .btn-outline {
          background: transparent;
          color: var(--fg-2);
          border: 1px solid var(--border);
        }

        .btn-outline:hover {
          border-color: var(--primary);
          color: var(--primary);
          transform: translateY(-2px);
        }

        .hero-ecg-wrap {
          width: 100%;
          max-width: 700px;
          margin-top: 2.8rem;
          opacity: 0.55;
          animation: fadeUp 0.8s 0.4s ease both;
        }

        .ecg-line {
          width: 100%;
          height: 60px;
        }

        .ecg-path {
          fill: none;
          stroke: var(--primary);
          stroke-width: 1.5;
          stroke-linecap: round;
          stroke-dasharray: 18 10;
          stroke-dashoffset: 0;
          animation: ecgFlow 14s linear infinite;
        }

        @keyframes ecgFlow {
          to {
            stroke-dashoffset: -1680;
          }
        }

        .hero-visual {
          border-radius: var(--r-xl);
          background: var(--bg-2);
          min-height: 540px;
          display: flex;
          align-items: stretch;
          box-shadow: 0 20px 60px oklch(0.42 0.05 220 / 0.08);
        }

        .hero-visual-inner {
          width: 100%;
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 1rem;
          padding: 2rem;
        }

        .hero-visual-kicker {
          font-size: 11px;
          font-family: var(--mono);
          color: var(--fg-3);
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .hero-visual-inner h3 {
          font-family: var(--serif);
          font-weight: 500;
          font-size: 1.8rem;
        }

        .hero-visual-inner p {
          font-size: 14px;
          line-height: 1.7;
          color: var(--fg-2);
          font-weight: 300;
          max-width: 34ch;
        }

        .hero-image-frame {
          margin-top: 0.5rem;
          border: 1px solid oklch(0.42 0.05 220 / 0.2);
          border-radius: 18px;
          min-height: 320px;
          background: oklch(0.92 0.015 220 / 0.35);
          overflow: hidden;
          position: relative;
        }

        .hero-photo {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center;
        }

        .hero-image-overlay {
          position: absolute;
          left: 14px;
          right: 14px;
          bottom: 14px;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }

        .hero-image-stat {
          background: oklch(0.98 0.005 85 / 0.82);
          border: 1px solid oklch(0.86 0.008 85 / 0.95);
          backdrop-filter: blur(10px);
          border-radius: 12px;
          padding: 10px 12px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .hero-image-stat span {
          font-family: var(--mono);
          font-size: 10px;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          color: var(--fg-3);
        }

        .hero-image-stat strong {
          font-size: 12px;
          color: var(--fg-2);
          font-weight: 500;
        }

        .stats-strip {
          position: relative;
          z-index: 1;
          display: flex;
          justify-content: center;
          flex-wrap: wrap;
          border-top: 1px solid var(--border);
          border-bottom: 1px solid var(--border);
          background: var(--card);
        }

        .stat-item {
          padding: 2rem 2.4rem;
          text-align: center;
          border-right: 1px solid var(--border);
          flex: 1;
          min-width: 150px;
        }

        .stat-item:last-child {
          border-right: none;
        }

        .stat-num {
          font-family: var(--mono);
          font-size: 2rem;
          font-weight: 500;
          color: var(--primary);
          display: block;
          line-height: 1;
        }

        .stat-label {
          font-size: 12px;
          color: var(--fg-3);
          margin-top: 6px;
          letter-spacing: 0.05em;
        }

        section {
          position: relative;
          z-index: 1;
        }

        .container {
          max-width: 1160px;
          margin: 0 auto;
          padding: 0 2rem;
        }

        .section-kicker {
          font-family: var(--mono);
          font-size: 10px;
          font-weight: 500;
          color: var(--primary);
          letter-spacing: 0.18em;
          text-transform: uppercase;
          margin-bottom: 1rem;
          display: block;
        }

        .section-h2 {
          font-family: var(--serif);
          font-size: clamp(2rem, 4vw, 3rem);
          font-weight: 500;
          line-height: 1.15;
          letter-spacing: -0.02em;
          color: var(--fg);
          max-width: 560px;
        }

        .abstract-section {
          padding: 7rem 2rem;
        }

        .abstract-card {
          max-width: 860px;
          margin: 0 auto;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: var(--r-xl);
          padding: 3rem;
          position: relative;
          overflow: hidden;
        }

        .abstract-grid {
          display: grid;
          grid-template-columns: 1.25fr 0.75fr;
          gap: 2rem;
          align-items: start;
        }

        .abstract-side {
          border: 1px solid oklch(0.86 0.008 85 / 0.9);
          border-radius: 14px;
          background: oklch(0.98 0.004 85 / 0.65);
          padding: 1.15rem;
        }

        .abstract-side h3 {
          font-family: var(--serif);
          font-size: 1.05rem;
          color: var(--fg);
          margin-bottom: 0.75rem;
        }

        .abstract-side ul {
          margin: 0;
          padding-left: 1rem;
          color: var(--fg-2);
          display: grid;
          gap: 0.45rem;
          font-size: 13px;
          line-height: 1.55;
          margin-bottom: 1rem;
        }

        .abstract-card::before {
          content: "";
          position: absolute;
          top: 0;
          left: 50%;
          transform: translateX(-50%);
          width: 200px;
          height: 3px;
          background: linear-gradient(
            90deg,
            transparent,
            var(--primary),
            transparent
          );
        }

        .abstract-quote {
          font-family: var(--serif);
          font-size: clamp(1.2rem, 2.5vw, 1.8rem);
          line-height: 1.5;
          color: var(--fg);
          font-style: italic;
          font-weight: 400;
          letter-spacing: -0.01em;
          margin-bottom: 2rem;
        }

        .abstract-quote strong {
          color: var(--primary);
          font-style: normal;
          font-weight: 600;
        }

        .abstract-meta {
          display: flex;
          gap: 0.7rem;
          flex-wrap: wrap;
        }

        .abstract-meta-item {
          font-size: 11px;
          font-family: var(--mono);
          color: var(--fg-3);
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .abstract-meta-item span {
          color: var(--primary);
          font-weight: 500;
        }

        .gaps-section {
          padding: 5rem 2rem 7rem;
          background: var(--bg-2);
          border-top: 1px solid var(--border);
          border-bottom: 1px solid var(--border);
        }

        .gaps-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 0.8rem;
          margin-top: 3rem;
        }

        .gap-card {
          background: oklch(0.99 0.004 85 / 0.86);
          border: 1px solid oklch(0.86 0.008 85 / 0.9);
          border-radius: 14px;
          padding: 2rem;
          backdrop-filter: blur(8px);
        }

        .gap-index {
          font-family: var(--mono);
          font-size: 11px;
          color: var(--fg-3);
          margin-bottom: 1rem;
          letter-spacing: 0.1em;
        }

        .gap-title {
          font-family: var(--serif);
          font-size: 1.2rem;
          margin-bottom: 0.75rem;
          line-height: 1.3;
        }

        .gap-text {
          font-size: 13.5px;
          line-height: 1.7;
          color: var(--fg-2);
          font-weight: 300;
        }

        .modules-section {
          padding: 7rem 2rem;
        }

        .modules-header {
          text-align: center;
          max-width: 560px;
          margin: 0 auto 3.5rem;
        }

        .modules-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 1.15rem;
        }

        .module-card {
          background: oklch(0.99 0.004 85 / 0.88);
          border: 1px solid oklch(0.86 0.008 85 / 0.95);
          border-radius: var(--r-xl);
          padding: 2rem;
          backdrop-filter: blur(10px);
          transition:
            transform 0.25s,
            border-color 0.25s,
            box-shadow 0.25s;
        }

        .module-card:hover {
          transform: translateY(-4px);
          border-color: oklch(0.42 0.05 220 / 0.35);
          box-shadow: 0 8px 32px oklch(0.42 0.05 220 / 0.1);
        }

        .module-num {
          font-family: var(--mono);
          font-size: 10px;
          color: var(--fg-3);
          margin-bottom: 1rem;
          letter-spacing: 0.12em;
        }

        .module-title {
          font-family: var(--serif);
          font-size: 1.3rem;
          margin-bottom: 0.75rem;
        }

        .module-desc {
          font-size: 13.5px;
          line-height: 1.7;
          color: var(--fg-2);
          font-weight: 300;
          margin-bottom: 1rem;
        }

        .module-metric {
          display: flex;
          align-items: baseline;
          gap: 6px;
        }

        .metric-val {
          font-family: var(--mono);
          font-size: 1.35rem;
          font-weight: 500;
          color: var(--primary);
        }

        .metric-label {
          font-size: 11px;
          color: var(--fg-3);
          letter-spacing: 0.05em;
        }

        .cta-section {
          padding: 7rem 2rem;
          text-align: center;
        }

        .cta-inner {
          max-width: 760px;
          margin: 0 auto;
        }

        .cta-h2 {
          font-family: var(--serif);
          font-size: clamp(2rem, 5vw, 4rem);
          font-weight: 500;
          line-height: 1.1;
          letter-spacing: -0.02em;
          margin-bottom: 1.3rem;
        }

        .cta-h2 em {
          font-style: italic;
          color: var(--primary);
        }

        .cta-sub {
          font-size: 16px;
          line-height: 1.7;
          color: var(--fg-2);
          font-weight: 300;
          margin-bottom: 2rem;
        }

        .cta-btns {
          display: flex;
          gap: 12px;
          justify-content: center;
          flex-wrap: wrap;
        }

        .cta-cards {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 1rem;
          margin-top: 1.2rem;
        }

        .cta-card {
          text-align: left;
          background: oklch(0.99 0.004 85 / 0.86);
          border: 1px solid oklch(0.86 0.008 85 / 0.9);
          border-radius: 16px;
          backdrop-filter: blur(10px);
          padding: 1.25rem;
          display: grid;
          gap: 0.8rem;
        }

        .cta-card h3 {
          font-family: var(--serif);
          font-size: 1.15rem;
          font-weight: 500;
          color: var(--fg);
        }

        .cta-card p {
          font-size: 14px;
          line-height: 1.65;
          color: var(--fg-2);
        }

        footer {
          border-top: 1px solid var(--border);
          padding: 3rem 2rem;
          background: var(--bg-2);
        }

        .footer-inner {
          max-width: 1160px;
          margin: 0 auto;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 1.5rem;
        }

        .footer-left {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .footer-wordmark {
          font-family: var(--serif);
          font-size: 20px;
          color: var(--fg);
        }

        .footer-wordmark span {
          color: var(--primary);
        }

        .footer-sub {
          font-size: 12px;
          color: var(--fg-3);
        }

        .footer-right {
          display: flex;
          gap: 1.2rem;
          flex-wrap: wrap;
        }

        .footer-right a {
          font-size: 12px;
          color: var(--fg-3);
          text-decoration: none;
          transition: color 0.2s;
        }

        .footer-right a:hover {
          color: var(--primary);
        }

        .footer-bottom {
          max-width: 1160px;
          margin: 1.75rem auto 0;
          padding-top: 1.1rem;
          border-top: 1px solid oklch(0.86 0.008 85 / 0.5);
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          color: oklch(0.54 0.013 70 / 0.6);
          flex-wrap: wrap;
          gap: 1rem;
        }

        .footer-code {
          font-family: var(--mono);
          font-size: 10px;
        }

        .reveal {
          opacity: 0;
          transform: translateY(28px);
          transition:
            opacity 0.65s ease,
            transform 0.65s ease;
        }

        .reveal.visible {
          opacity: 1;
          transform: translateY(0);
        }

        .reveal-d1 {
          transition-delay: 0.05s;
        }

        .reveal-d2 {
          transition-delay: 0.12s;
        }

        .reveal-d3 {
          transition-delay: 0.19s;
        }

        .reveal-d4 {
          transition-delay: 0.26s;
        }

        @keyframes fadeUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @media (max-width: 980px) {
          nav {
            padding: 0 1rem;
          }

          .nav-links {
            display: none;
          }

          .hero-layout {
            grid-template-columns: 1fr;
          }

          .hero-visual {
            min-height: 380px;
          }

          .hero-image-overlay {
            grid-template-columns: 1fr;
          }

          .abstract-grid {
            grid-template-columns: 1fr;
          }

          .cta-cards {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </>
  );
}
