"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { motion, useInView, useScroll, useTransform } from "framer-motion";
import {
  HeartPulse,
  ArrowRight,
  Microscope,
  Activity,
  FlaskConical,
  BookOpenText,
  ChevronRight,
} from "lucide-react";

/* ─────────────── helpers ─────────────── */
function FadeUp({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 32 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ─────────────── data ─────────────── */
const STATS = [
  { num: "32%", label: "of global mortality is CVD" },
  { num: "17.9M", label: "annual deaths worldwide" },
  { num: "92.4%", label: "precision — heart attack model" },
  { num: "0.88", label: "F1 score — ECG recognition" },
  { num: "700K+", label: "rare-case FAISS vectors" },
];

const PROBLEMS = [
  {
    idx: "01",
    heading: "Documentation Friction",
    sub: "Clinical language is lost in translation",
    body: "Sinhala consultations often become fragmented during manual note conversion, reducing the fidelity of clinically relevant context passed to decision systems.",
  },
  {
    idx: "02",
    heading: "ECG Interpretation Bottleneck",
    sub: "Signal quality and expertise mismatch",
    body: "Accurate interpretation depends on specialist experience, while real-world ECG sources are frequently noisy, scanned, or structurally incomplete.",
  },
  {
    idx: "03",
    heading: "Fragmented Risk Insight",
    sub: "Labs and history interpreted in isolation",
    body: "Static scoring misses longitudinal biomarker movement and fails to produce clear next-step diagnostic guidance when it is needed most.",
  },
  {
    idx: "04",
    heading: "Rare-Case Blind Spots",
    sub: "Low-frequency cases remain under-supported",
    body: "Pattern-only models can underperform on uncommon but critical conditions without explicit, evidence-backed knowledge retrieval mechanisms.",
  },
];

const MODULES = [
  {
    num: "01",
    Icon: Microscope,
    title: "Sinhala Clinical NLP",
    layer: "Input Layer",
    desc: "Converts natural consultation dialogue into structured clinical context, preserving intent before diagnostic reasoning begins.",
    metric: "Consultation Intelligence",
  },
  {
    num: "02",
    Icon: Activity,
    title: "Noise-Robust ECG Digitization",
    layer: "Signal Layer",
    desc: "Stabilizes and interprets real-world ECG input from imperfect sources to produce clinician-usable signal insight.",
    metric: "ECG Quality & Interpretation",
  },
  {
    num: "03",
    Icon: FlaskConical,
    title: "Category-Aware Lab Analysis",
    layer: "Risk Layer",
    desc: "Aligns extracted lab data with longitudinal context to support urgency-aware recommendations and better triage decisions.",
    metric: "Trend-Aware Lab Reasoning",
  },
  {
    num: "04",
    Icon: BookOpenText,
    title: "Evidence-Driven Reasoning",
    layer: "Evidence Layer",
    desc: "Connects patient signals to evidence-backed knowledge retrieval so recommendations remain explainable and clinically grounded.",
    metric: "Rare-Case Retrieval + Synthesis",
  },
];

/* ─────────────── page ─────────────── */
export default function Home() {
  const heroRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const heroParallax = useTransform(scrollYProgress, [0, 1], ["0%", "18%"]);

  /* smooth anchor */
  useEffect(() => {
    const links = document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]');
    const handlers: Array<{ el: HTMLAnchorElement; fn: (e: Event) => void }> =
      [];
    links.forEach((el) => {
      const fn = (e: Event) => {
        const id = decodeURIComponent(el.hash.slice(1));
        const target = document.getElementById(id);
        if (!target) return;
        e.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      };
      el.addEventListener("click", fn);
      handlers.push({ el, fn });
    });
    return () =>
      handlers.forEach(({ el, fn }) => el.removeEventListener("click", fn));
  }, []);

  return (
    <>
      {/* ── Google fonts ── */}
      <style jsx global>{`
        @import url("https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400;500&display=swap");

        *,
        *::before,
        *::after {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }
        html {
          scroll-behavior: smooth;
        }

        :root {
          --parchment: #f5f3ee;
          --parchment2: #efece5;
          --parchment3: #e8e4db;
          --ink: #18181a;
          --ink-2: #3b3b40;
          --ink-3: #77777f;
          --rule: rgba(24, 24, 26, 0.1);
          --accent: #1f4e8c;
          --accent-l: #d6e3f5;
          --accent-dim: rgba(31, 78, 140, 0.08);
          --serif: "Cormorant Garamond", Georgia, serif;
          --sans: "DM Sans", system-ui, sans-serif;
          --mono: "DM Mono", monospace;
          --r: 12px;
          --r-lg: 20px;
        }

        body {
          font-family: var(--sans);
          background: var(--parchment);
          color: var(--ink);
          overflow-x: hidden;
          -webkit-font-smoothing: antialiased;
        }

        /* subtle grain */
        body::after {
          content: "";
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 9999;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E");
          opacity: 0.028;
        }

        /* ── nav ── */
        nav {
          position: sticky;
          top: 0;
          z-index: 200;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 2.5rem;
          height: 64px;
          background: rgba(245, 243, 238, 0.88);
          backdrop-filter: blur(20px);
          border-bottom: 1px solid var(--rule);
        }
        .n-logo {
          display: flex;
          align-items: center;
          gap: 10px;
          text-decoration: none;
          color: inherit;
        }
        .n-icon {
          width: 34px;
          height: 34px;
          border-radius: 9px;
          background: var(--ink);
          color: var(--parchment);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .n-word {
          font-family: var(--sans);
          font-size: 20px;
          font-weight: 500;
          font-style: extra-bold;
          letter-spacing: -0.01em;
          text-transform: uppercase;
        }
        .n-word span {
          color: var(--accent);
        }
        .n-links {
          display: flex;
          gap: 1.5rem;
        }
        .n-links a {
          font-size: 13px;
          font-weight: 400;
          color: var(--ink-3);
          text-decoration: none;
          letter-spacing: 0.02em;
          transition: color 0.2s;
        }
        .n-links a:hover {
          color: var(--ink);
        }
        .n-cta {
          font-size: 13px;
          font-weight: 500;
          padding: 8px 20px;
          border-radius: 9px;
          background: var(--ink);
          color: var(--parchment);
          text-decoration: none;
          letter-spacing: 0.01em;
          transition:
            opacity 0.2s,
            transform 0.15s;
        }
        .n-cta:hover {
          opacity: 0.8;
          transform: translateY(-1px);
        }

        /* ── hero ── */
        .hero {
          min-height: 92vh;
          display: flex;
          align-items: center;
          overflow: hidden;
        }
        .hero-grid {
          max-width: 1160px;
          margin: 0 auto;
          padding: 6rem 2.5rem 5rem;
          display: grid;
          grid-template-columns: 1.1fr 0.9fr;
          gap: 3rem;
          align-items: center;
          width: 100%;
        }
        .hero-kicker {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 5px 14px;
          border-radius: 6px;
          background: var(--accent-dim);
          border: 1px solid rgba(31, 78, 140, 0.18);
          font-family: var(--mono);
          font-size: 11px;
          font-weight: 500;
          color: var(--accent);
          letter-spacing: 0.14em;
          text-transform: uppercase;
          margin-bottom: 1.6rem;
        }
        .hero-kicker::before {
          content: "";
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: var(--accent);
          animation: blink 2.2s ease-in-out infinite;
        }
        @keyframes blink {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.3;
          }
        }

        .hero-h1 {
          font-family: var(--serif);
          font-size: clamp(3rem, 6vw, 5.2rem);
          font-weight: 500;
          line-height: 1.07;
          letter-spacing: -0.02em;
          color: var(--ink);
          margin-bottom: 1.5rem;
          text-wrap: balance;
        }
        .hero-h1 em {
          font-style: italic;
          color: var(--accent);
        }

        .hero-sub {
          font-size: 16px;
          line-height: 1.75;
          color: var(--ink-2);
          font-weight: 300;
          max-width: 520px;
          margin-bottom: 1.6rem;
        }
        .hero-chips {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
          margin-bottom: 2rem;
        }
        .chip {
          padding: 4px 10px;
          border-radius: 5px;
          font-family: var(--mono);
          font-size: 11px;
          letter-spacing: 0.07em;
          text-transform: uppercase;
          color: var(--ink-2);
          background: var(--parchment2);
          border: 1px solid var(--rule);
        }
        .hero-btns {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        .btn-primary,
        .btn-ghost {
          padding: 12px 28px;
          border-radius: 9px;
          font-size: 13.5px;
          font-weight: 500;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          transition:
            transform 0.15s,
            opacity 0.2s,
            background 0.2s,
            color 0.2s;
        }
        .btn-primary {
          background: var(--ink);
          color: var(--parchment);
          border: 1px solid var(--ink);
        }
        .btn-primary:hover {
          opacity: 0.82;
          transform: translateY(-2px);
        }
        .btn-ghost {
          background: transparent;
          color: var(--ink-2);
          border: 1px solid var(--rule);
        }
        .btn-ghost:hover {
          border-color: var(--ink);
          color: var(--ink);
          transform: translateY(-2px);
        }

        /* ecg */
        .ecg-wrap {
          margin-top: 3rem;
          opacity: 0.45;
        }
        .ecg-path {
          fill: none;
          stroke: var(--accent);
          stroke-width: 1.4;
          stroke-linecap: round;
          stroke-dasharray: 16 10;
          animation: ecg 12s linear infinite;
        }
        @keyframes ecg {
          to {
            stroke-dashoffset: -1600;
          }
        }

        /* hero visual */
        .hero-card {
          background: var(--parchment2);
          border: 1px solid var(--rule);
          border-radius: var(--r-lg);
          overflow: hidden;
          min-height: 540px;
          position: relative;
          display: flex;
          flex-direction: column;
          box-shadow:
            0 24px 72px rgba(24, 24, 26, 0.07),
            0 1px 0 rgba(255, 255, 255, 0.6) inset;
        }
        .hero-card-top {
          padding: 1.5rem 1.5rem 1rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid var(--rule);
        }
        .card-label {
          font-family: var(--mono);
          font-size: 11px;
          color: var(--ink-2);
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .card-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #22c55e;
          box-shadow: 0 0 6px #22c55e80;
          animation: blink 2s ease-in-out infinite;
        }
        .hero-img-wrap {
          flex: 1;
          position: relative;
          overflow: hidden;
        }
        .hero-photo {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center top;
        }
        .hero-card-badges {
          position: absolute;
          bottom: 1rem;
          margin-bottom: 1rem;
          left: 1rem;
          right: 1rem;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.5rem;
        }
        .badge {
          background: rgba(245, 243, 238, 0.86);
          border: 1px solid rgba(24, 24, 26, 0.1);
          backdrop-filter: blur(12px);
          border-radius: 9px;
          padding: 10px 12px;
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .badge-val {
          font-family: var(--mono);
          font-size: 14px;
          font-weight: 500;
          color: var(--accent);
        }
        .badge-lbl {
          font-size: 11px;
          color: var(--ink-2);
          letter-spacing: 0.04em;
        }

        /* ── stats ── */
        .stats {
          border-top: 1px solid var(--rule);
          border-bottom: 1px solid var(--rule);
          background: var(--parchment2);
          display: flex;
          justify-content: center;
          flex-wrap: wrap;
        }
        .stat {
          padding: 2rem 2.5rem;
          text-align: center;
          border-right: 1px solid var(--rule);
          flex: 1;
          min-width: 140px;
        }
        .stat:last-child {
          border-right: none;
        }
        .stat-n {
          font-family: var(--serif);
          font-size: 2.4rem;
          font-weight: 500;
          color: var(--ink);
          line-height: 1;
          display: block;
        }
        .stat-l {
          font-family: var(--mono);
          font-size: 11px;
          color: var(--ink-2);
          letter-spacing: 0.08em;
          margin-top: 6px;
          display: block;
          text-transform: uppercase;
        }

        /* ── sections ── */
        .container {
          max-width: 1160px;
          margin: 0 auto;
          padding: 0 2.5rem;
        }
        .kicker {
          font-family: var(--mono);
          font-size: 11px;
          font-weight: 500;
          color: var(--accent);
          letter-spacing: 0.18em;
          text-transform: uppercase;
          display: block;
          margin-bottom: 1rem;
        }
        .sec-h2 {
          font-family: var(--serif);
          font-size: clamp(2.2rem, 4vw, 3.2rem);
          font-weight: 500;
          line-height: 1.13;
          letter-spacing: -0.02em;
        }

        /* abstract */
        .abstract-sec {
          padding: 7rem 2.5rem;
        }
        .abstract-wrap {
          max-width: 960px;
          margin: 0 auto;
        }
        .abstract-rule {
          width: 48px;
          height: 2px;
          background: var(--accent);
          margin-bottom: 2.4rem;
          border-radius: 2px;
        }
        .abstract-quote {
          font-family: var(--serif);
          font-size: clamp(1.4rem, 2.8vw, 2rem);
          line-height: 1.6;
          color: var(--ink);
          font-style: italic;
          font-weight: 400;
          letter-spacing: -0.01em;
          max-width: 760px;
          margin-bottom: 3rem;
          padding-left: 1.5rem;
          border-left: 3px solid var(--accent);
        }
        .abstract-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 2rem;
          align-items: start;
        }
        .abstract-meta-block {
          background: var(--parchment2);
          border: 1px solid var(--rule);
          border-radius: var(--r-lg);
          padding: 1.75rem;
        }
        .abstract-meta-block h3 {
          font-family: var(--serif);
          font-size: 1.2rem;
          font-weight: 500;
          margin-bottom: 1rem;
        }
        .abstract-meta-block ul {
          padding-left: 1.1rem;
          color: var(--ink-2);
          display: grid;
          gap: 0.5rem;
          font-size: 13.5px;
          line-height: 1.6;
          font-weight: 300;
        }
        .meta-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          margin-top: 1.25rem;
        }
        .meta-tag {
          font-family: var(--mono);
          font-size: 11px;
          color: var(--ink-2);
          padding: 4px 10px;
          border: 1px solid var(--rule);
          border-radius: 5px;
          letter-spacing: 0.07em;
          text-transform: uppercase;
        }
        .meta-tag span {
          color: var(--accent);
          font-weight: 500;
        }

        /* problem */
        .problem-sec {
          padding: 5rem 2.5rem 7rem;
          background: var(--parchment2);
          border-top: 1px solid var(--rule);
          border-bottom: 1px solid var(--rule);
        }
        .problem-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          flex-wrap: wrap;
          gap: 1rem;
          margin-bottom: 3.5rem;
        }
        .problems-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 0.8rem;
        }
        .p-card {
          background: var(--parchment);
          border: 1px solid var(--rule);
          border-radius: var(--r);
          padding: 1.75rem;
          transition:
            box-shadow 0.25s,
            transform 0.25s,
            border-color 0.25s;
        }
        .p-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 12px 40px rgba(24, 24, 26, 0.07);
          border-color: rgba(31, 78, 140, 0.2);
        }
        .p-idx {
          font-family: var(--mono);
          font-size: 11px;
          color: var(--accent);
          letter-spacing: 0.12em;
          margin-bottom: 1.1rem;
        }
        .p-title {
          font-family: var(--serif);
          font-size: 1.2rem;
          font-weight: 500;
          margin-bottom: 0.4rem;
          line-height: 1.3;
        }
        .p-sub {
          font-family: var(--mono);
          font-size: 11px;
          color: var(--ink-2);
          letter-spacing: 0.07em;
          text-transform: uppercase;
          margin-bottom: 0.85rem;
        }
        .p-body {
          font-size: 13.5px;
          line-height: 1.7;
          color: var(--ink-2);
          font-weight: 300;
        }

        /* modules */
        .modules-sec {
          padding: 7rem 2.5rem;
        }
        .modules-header {
          max-width: 560px;
          margin: 0 auto 4rem;
          text-align: center;
        }
        .modules-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 1rem;
        }
        .m-card {
          background: var(--parchment);
          border: 1px solid var(--rule);
          border-radius: var(--r-lg);
          padding: 2rem;
          transition:
            transform 0.25s,
            border-color 0.25s,
            box-shadow 0.25s;
          position: relative;
          overflow: hidden;
        }
        .m-card::before {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 2px;
          background: linear-gradient(
            90deg,
            transparent,
            var(--accent),
            transparent
          );
          opacity: 0;
          transition: opacity 0.3s;
        }
        .m-card:hover {
          transform: translateY(-4px);
          border-color: rgba(31, 78, 140, 0.25);
          box-shadow: 0 16px 48px rgba(31, 78, 140, 0.08);
        }
        .m-card:hover::before {
          opacity: 1;
        }
        .m-num {
          font-family: var(--mono);
          font-size: 11px;
          color: var(--ink-2);
          letter-spacing: 0.12em;
          margin-bottom: 1.25rem;
        }
        .m-icon {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          background: var(--accent-dim);
          border: 1px solid rgba(31, 78, 140, 0.18);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--accent);
          margin-bottom: 1.1rem;
        }
        .m-title {
          font-family: var(--serif);
          font-size: 1.25rem;
          font-weight: 500;
          margin-bottom: 0.7rem;
        }
        .m-desc {
          font-size: 13.5px;
          line-height: 1.72;
          color: var(--ink-2);
          font-weight: 300;
          margin-bottom: 1.25rem;
        }
        .m-layer {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-family: var(--mono);
          font-size: 11px;
          color: var(--accent);
          padding: 4px 10px;
          border-radius: 5px;
          background: var(--accent-dim);
          border: 1px solid rgba(31, 78, 140, 0.18);
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        /* cta */
        .cta-sec {
          padding: 7rem 2.5rem;
        }
        .cta-inner {
          max-width: 880px;
          margin: 0 auto;
        }
        .cta-top {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 3rem;
          align-items: end;
          margin-bottom: 3rem;
        }
        .cta-h2 {
          font-family: var(--serif);
          font-size: clamp(2.2rem, 5vw, 3.8rem);
          font-weight: 500;
          line-height: 1.1;
          letter-spacing: -0.02em;
        }
        .cta-h2 em {
          font-style: italic;
          color: var(--accent);
        }
        .cta-right p {
          font-size: 15px;
          line-height: 1.7;
          color: var(--ink-2);
          font-weight: 300;
          margin-bottom: 1.5rem;
        }
        .cta-cards {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
        }
        .c-card {
          background: var(--parchment2);
          border: 1px solid var(--rule);
          border-radius: var(--r-lg);
          padding: 1.75rem;
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
        }
        .c-card h3 {
          font-family: var(--serif);
          font-size: 1.25rem;
          font-weight: 500;
        }
        .c-card p {
          font-size: 13.5px;
          line-height: 1.65;
          color: var(--ink-2);
          font-weight: 300;
          flex: 1;
        }

        /* footer */
        footer {
          background: #111113;
          color: #e8e6e1;
          padding: 0;
        }
        .footer-main {
          max-width: 1160px;
          margin: 0 auto;
          padding: 4rem 2.5rem 3rem;
          display: grid;
          grid-template-columns: 1.4fr 1fr 1fr;
          gap: 3rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }
        .f-brand-col {
        }
        .f-word {
          font-family: var(--serif);
          font-size: 22px;
          font-weight: 500;
          color: #f0ede8;
          line-height: 1;
        }
        .f-word span {
          color: #6b9fd4;
        }
        .f-tagline {
          font-size: 12px;
          color: #8a8b9a;
          margin-top: 6px;
          line-height: 1.5;
        }
        .f-nav-col {
        }
        .f-col-label {
          font-family: var(--mono);
          font-size: 10.5px;
          font-weight: 500;
          color: #747684;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          margin-bottom: 1rem;
        }
        .f-links {
          display: flex;
          flex-direction: column;
          gap: 0.55rem;
        }
        .f-links a {
          font-size: 13px;
          color: #8888a0;
          text-decoration: none;
          transition: color 0.2s;
        }
        .f-links a:hover {
          color: #e8e6e1;
        }

        /* people section */
        .footer-people {
          max-width: 1160px;
          margin: 0 auto;
          padding: 2.5rem 2.5rem;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 2rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }
        .fp-block-label {
          font-family: var(--mono);
          font-size: 10.5px;
          color: #747684;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          margin-bottom: 1rem;
        }
        .fp-students {
          display: flex;
          flex-wrap: wrap;
          gap: 0.45rem;
        }
        .fp-student {
          font-family: var(--mono);
          font-size: 11px;
          color: #9999b0;
          padding: 5px 11px;
          border-radius: 6px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.07);
          letter-spacing: 0.02em;
          transition:
            color 0.2s,
            border-color 0.2s;
        }
        .fp-student:hover {
          color: #e8e6e1;
          border-color: rgba(255, 255, 255, 0.18);
        }
        .fp-degree {
          font-size: 11px;
          color: #8f91a0;
          font-family: var(--mono);
          letter-spacing: 0.05em;
          margin-top: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }
        .fp-supervisors {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .fp-sup {
          display: flex;
          flex-direction: column;
          gap: 3px;
          padding: 1rem 1.1rem;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 9px;
        }
        .fp-sup-role {
          font-family: var(--mono);
          font-size: 10px;
          color: #8a8b9a;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }
        .fp-sup-name {
          font-family: var(--serif);
          font-size: 1.05rem;
          color: #d8d6d0;
          font-weight: 500;
        }
        .fp-sup-inst {
          font-size: 11px;
          color: #6b9fd4;
          font-family: var(--mono);
          letter-spacing: 0.04em;
        }
        .fp-sup-bio {
          font-size: 12px;
          color: #8a8b9a;
          line-height: 1.55;
          margin-top: 4px;
          font-weight: 300;
        }

        /* footer bottom bar */
        .footer-bottom {
          max-width: 1160px;
          margin: 0 auto;
          padding: 1.25rem 2.5rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 0.75rem;
          font-family: var(--mono);
          font-size: 11px;
          color: #7f8190;
          letter-spacing: 0.06em;
        }
        .footer-bottom-version {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          border-radius: 5px;
          background: rgba(107, 159, 212, 0.1);
          border: 1px solid rgba(107, 159, 212, 0.2);
          color: #6b9fd4;
          font-family: var(--mono);
          font-size: 10px;
          letter-spacing: 0.08em;
        }
        .footer-bottom-version::before {
          content: "";
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: #6b9fd4;
        }

        /* responsive */
        @media (max-width: 980px) {
          .hero-grid {
            grid-template-columns: 1fr;
          }
          .hero-card {
            min-height: 360px;
          }
          .hero-card-badges {
            grid-template-columns: 1fr 1fr;
          }
          .abstract-grid {
            grid-template-columns: 1fr;
          }
          .cta-top {
            grid-template-columns: 1fr;
          }
          .cta-cards {
            grid-template-columns: 1fr;
          }
          .n-links {
            display: none;
          }
        }

        @media (max-width: 600px) {
          nav {
            padding: 0 1.25rem;
          }
          .hero-grid {
            padding: 4rem 1.25rem 3rem;
          }
          .stat {
            padding: 1.4rem 1.2rem;
          }
        }
      `}</style>

      {/* ─────── NAV ─────── */}
      <nav>
        <Link href="#" className="n-logo">
          <div className="n-icon">
            <HeartPulse size={18} />
          </div>
          <span className="n-word">
            Heart<span>Sense</span> AI
          </span>
        </Link>
        <div className="n-links">
          <a href="#abstract">Abstract</a>
          <a href="#problem">Problem</a>
          <a href="#modules">Modules</a>
          <a href="#cta">Pilot</a>
        </div>
        <Link href="/login" className="n-cta">
          Clinician Access
        </Link>
      </nav>

      {/* ─────── HERO ─────── */}
      <section className="hero" ref={heroRef}>
        <div className="hero-grid">
          {/* left */}
          <div>
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="hero-kicker">
                Live Research · SLIIT Malabe · 2026
              </div>
            </motion.div>

            <motion.h1
              className="hero-h1"
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.75,
                delay: 0.08,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              <em>Clinical-Grade </em> Cardiac&nbsp;Decision Support for Every
              Hospital
            </motion.h1>

            <motion.p
              className="hero-sub"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.7,
                delay: 0.16,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              Built for Sri Lanka's frontline care teams, HeartSense AI combines
              Sinhala consultation intelligence, ECG interpretation, lab
              reasoning, and rare-case retrieval into one explainable workspace
              for faster and safer triage.
            </motion.p>

            <motion.div
              className="hero-chips"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.24 }}
            >
              <span className="chip">SLIIT Research Initiative</span>
              <span className="chip">Clinical Workflow Focused</span>
              <span className="chip">Explainable AI Pipeline</span>
            </motion.div>

            <motion.div
              className="hero-btns"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.65,
                delay: 0.3,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              <a href="/login" className="btn-primary">
                Request Clinical Pilot Access <ArrowRight size={15} />
              </a>
              <a href="#abstract" className="btn-ghost">
                Review Abstract <ChevronRight size={14} />
              </a>
            </motion.div>

            <motion.div
              className="ecg-wrap"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.45 }}
              transition={{ duration: 1, delay: 0.5 }}
            >
              <svg
                viewBox="0 0 700 60"
                preserveAspectRatio="none"
                style={{ width: "100%", height: 60 }}
              >
                <path
                  className="ecg-path"
                  d="M0,30 L40,30 L50,30 L55,28 L60,30 L80,30 L90,10 L100,50 L110,30 L125,30 L130,28 L135,30 L160,30 L165,14 L172,46 L178,30 L200,30 L210,30 L215,28 L220,30 L240,30 L250,8 L260,52 L270,30 L290,30 L295,28 L300,30 L320,30 L330,10 L340,50 L350,30 L370,30 L375,28 L380,30 L400,30 L410,8 L420,52 L430,30 L450,30 L455,28 L460,30 L480,30 L490,10 L500,50 L510,30 L530,30 L535,28 L540,30 L560,30 L570,8 L580,52 L590,30 L620,30 L630,28 L640,30 L700,30"
                />
              </svg>
            </motion.div>
          </div>

          {/* right – hero card */}
          <motion.div
            className="hero-card"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{
              duration: 0.85,
              delay: 0.2,
              ease: [0.22, 1, 0.36, 1],
            }}
            style={{ y: heroParallax }}
          >
            <div className="hero-card-top">
              <span className="card-label">HeartSense Workspace · v4.0</span>
              <div className="card-dot" />
            </div>
            <div className="hero-img-wrap">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/hero-image.jpg"
                alt="Doctor interacting with a cardiac AI interface"
                className="hero-photo"
              />
              <div className="hero-card-badges">
                <div className="badge">
                  <span className="badge-val">NLP Engine</span>
                  <span className="badge-lbl">
                    Sinhala Consultation Intelligence
                  </span>
                </div>
                <div className="badge">
                  <span className="badge-val">ECG Analyse</span>
                  <span className="badge-lbl">
                    ECG Interpretation with just a photo from any device
                  </span>
                </div>
                <div className="badge">
                  <span className="badge-val">Lab Recommendation Engine </span>
                  <span className="badge-lbl">
                    Analyse and get personalized lab recommendations
                  </span>
                </div>
                <div className="badge">
                  <span className="badge-val">Evidence Driven Reasoning</span>
                  <span className="badge-lbl">
                    Clinical decision support based on evidence and rare cases
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ─────── STATS ─────── */}
      <div className="stats">
        {STATS.map((s, i) => (
          <FadeUp key={s.num} delay={i * 0.06} className="stat">
            <span className="stat-n">{s.num}</span>
            <span className="stat-l">{s.label}</span>
          </FadeUp>
        ))}
      </div>

      {/* ─────── ABSTRACT ─────── */}
      <section id="abstract" className="abstract-sec">
        <div className="abstract-wrap">
          <FadeUp>
            <span className="kicker">Scientific Abstract</span>
            <div className="abstract-rule" />
            <blockquote className="abstract-quote">
              Cardiovascular disease remains one of the most urgent clinical
              burdens, while many frontline settings still depend on delayed
              specialist review and fragmented workflows. HeartSense AI is
              designed as a multimodal clinical support pipeline, connecting
              consultation context, ECG interpretation, lab reasoning, and
              evidence retrieval into one explainable decision interface.
            </blockquote>
          </FadeUp>

          <div className="abstract-grid">
            <FadeUp delay={0.05}>
              <div className="abstract-meta-block">
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
                <div className="meta-tags">
                  <span className="meta-tag">
                    Faculty · <span>SLIIT Malabe</span>
                  </span>
                  <span className="meta-tag">
                    Framework · <span>Multi-modal AI</span>
                  </span>
                  <span className="meta-tag">
                    Focus · <span>Rural Sri Lanka</span>
                  </span>
                  <span className="meta-tag">
                    Year · <span>2026</span>
                  </span>
                </div>
              </div>
            </FadeUp>

            <FadeUp delay={0.1}>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: ".8rem",
                }}
              >
                {[
                  { label: "Research Stage", val: "Active Prototype" },
                  { label: "Validation Phase", val: "Clinical Pilot (2026)" },
                  { label: "Dataset Scope", val: "700K+ FAISS Vectors" },
                  {
                    label: "Deployment Target",
                    val: "District Hospitals — LK",
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: ".9rem 1.1rem",
                      background: "var(--parchment2)",
                      border: "1px solid var(--rule)",
                      borderRadius: "var(--r)",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--mono)",
                        fontSize: 11,
                        color: "var(--ink-2)",
                        letterSpacing: ".08em",
                        textTransform: "uppercase",
                      }}
                    >
                      {item.label}
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--mono)",
                        fontSize: 11,
                        color: "var(--accent)",
                        fontWeight: 500,
                      }}
                    >
                      {item.val}
                    </span>
                  </div>
                ))}
              </div>
            </FadeUp>
          </div>
        </div>
      </section>

      {/* ─────── PROBLEM ─────── */}
      <section id="problem" className="problem-sec">
        <div className="container">
          <div className="problem-header">
            <FadeUp>
              <span className="kicker">Problem Landscape</span>
              <h2 className="sec-h2">
                Four barriers slowing
                <br />
                reliable cardiac decision-making
              </h2>
            </FadeUp>
          </div>
          <div className="problems-grid">
            {PROBLEMS.map((p, i) => (
              <FadeUp key={p.idx} delay={i * 0.07}>
                <div className="p-card">
                  <div className="p-idx">MODULE · {p.idx}</div>
                  <div className="p-title">{p.heading}</div>
                  <div className="p-sub">{p.sub}</div>
                  <div className="p-body">{p.body}</div>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* ─────── MODULES ─────── */}
      <section id="modules" className="modules-sec">
        <div className="container">
          <FadeUp className="modules-header">
            <span className="kicker">The Multimodal Framework</span>
            <h2 className="sec-h2">
              Four integrated layers,
              <br />
              one clinician workflow
            </h2>
          </FadeUp>
          <div className="modules-grid">
            {MODULES.map(({ num, Icon, title, layer, desc, metric }, i) => (
              <FadeUp key={num} delay={i * 0.08}>
                <div className="m-card">
                  <div className="m-num">MODULE · {num}</div>
                  <div className="m-icon">
                    <Icon size={18} />
                  </div>
                  <div className="m-title">{title}</div>
                  <div className="m-desc">{desc}</div>
                  <div className="m-layer">{layer}</div>
                  <div
                    style={{
                      marginTop: ".7rem",
                      fontSize: 12,
                      color: "var(--ink-2)",
                      fontFamily: "var(--mono)",
                      letterSpacing: ".06em",
                    }}
                  >
                    {metric}
                  </div>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* ─────── CTA ─────── */}
      <section
        id="cta"
        className="cta-sec"
        style={{
          background: "var(--parchment2)",
          borderTop: "1px solid var(--rule)",
        }}
      >
        <div className="container">
          <div className="cta-inner">
            <div className="cta-top">
              <FadeUp>
                <span className="kicker">Pilot and Collaboration</span>
                <h2 className="cta-h2">
                  Move this research from prototype to <em>clinical impact</em>
                </h2>
              </FadeUp>
              <FadeUp delay={0.08}>
                <p
                  style={{
                    fontSize: 15,
                    lineHeight: 1.75,
                    color: "var(--ink-2)",
                    fontWeight: 300,
                    marginBottom: "1.5rem",
                  }}
                >
                  Partner with the HeartSense AI team to validate workflows,
                  participate in pilot deployment, or collaborate on the next
                  phase of research translation.
                </p>
              </FadeUp>
            </div>
            <div className="cta-cards">
              <FadeUp delay={0.05}>
                <div className="c-card">
                  <h3>For Clinicians</h3>
                  <p>
                    Join the pilot access queue and evaluate HeartSense AI in
                    day-to-day cardiac triage workflows.
                  </p>
                  <a
                    href="/register"
                    className="btn-primary"
                    style={{ alignSelf: "flex-start" }}
                  >
                    Request Clinical Pilot <ArrowRight size={14} />
                  </a>
                </div>
              </FadeUp>
              <FadeUp delay={0.12}>
                <div className="c-card">
                  <h3>For Researchers</h3>
                  <p>
                    Collaborate on dataset expansion, model validation, and
                    publication-ready translational studies.
                  </p>
                  <a
                    href="#"
                    className="btn-ghost"
                    style={{ alignSelf: "flex-start" }}
                  >
                    Contact Research Team <ChevronRight size={14} />
                  </a>
                </div>
              </FadeUp>
            </div>
          </div>
        </div>
      </section>

      {/* ─────── FOOTER ─────── */}
      <footer>
        {/* top grid — brand / nav / links */}
        <div className="footer-main">
          {/* brand */}
          <div className="f-brand-col">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: "1rem",
              }}
            >
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 9,
                  background: "rgba(107,159,212,.15)",
                  border: "1px solid rgba(107,159,212,.2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#6b9fd4",
                }}
              >
                <HeartPulse size={16} />
              </div>
              <div className="f-word">
                Heart<span>Sense</span> AI
              </div>
            </div>
            <div className="f-tagline">
              AI-Powered Cardiac Diagnosis Support
              <br />
              SLIIT Malabe · Research Initiative 2026
            </div>
          </div>

          {/* nav */}
          <div className="f-nav-col">
            <div className="f-col-label">Navigation</div>
            <div className="f-links">
              <a href="#abstract">Abstract</a>
              <a href="#problem">Problem Landscape</a>
              <a href="#modules">Framework Modules</a>
              <a href="#cta">Pilot Access</a>
            </div>
          </div>

          {/* research */}
          <div className="f-nav-col">
            <div className="f-col-label">Research Info</div>
            <div className="f-links">
              <a href="#">BSc Information Technology</a>
              <a href="#">Software Engineering</a>
              <a href="#">SLIIT Faculty of Computing</a>
              <a href="#">Clinical Validation 2026</a>
            </div>
          </div>
        </div>

        {/* people row */}
        <div className="footer-people">
          {/* students */}
          <div>
            <div className="fp-block-label">Research Team · Undergraduates</div>
            <div className="fp-students">
              {[
                "Wimalasena H M K P",
                "De Ranasinghe I M R K",
                "Gunathilaka H A H V",
                "Sandanayake S D I D",
              ].map((name) => (
                <span key={name} className="fp-student">
                  {name}
                </span>
              ))}
            </div>
            <div className="fp-degree">
              BSc (Hons) Information Technology · Specialisation in Software
              Engineering
            </div>
          </div>

          {/* supervisors */}
          <div>
            <div className="fp-block-label">Supervision</div>
            <div className="fp-supervisors">
              <div className="fp-sup">
                <span className="fp-sup-role">Supervisor</span>
                <span className="fp-sup-name">Mr. Jagath Wickramarathne</span>
                <span className="fp-sup-inst">
                  SLIIT · Software Systems &amp; Technologies
                </span>
                <span className="fp-sup-bio">
                  Driving innovation in software engineering, high-performance
                  computing, and scalable architectures to build robust,
                  next-generation applications and systems.
                </span>
              </div>
              <div className="fp-sup">
                <span className="fp-sup-role">Co-Supervisor</span>
                <span className="fp-sup-name">Ms. Madusha Weerasooriya</span>
                <span className="fp-sup-inst">
                  SLIIT · Software Engineering Department
                </span>
                <span className="fp-sup-bio">
                  Currently reading MPhil in IT at SLIIT and working as an
                  Assistant Lecturer in the Software Engineering department at
                  SLIIT.
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* bottom bar */}
        <div className="footer-bottom">
          <span>
            © 2026 HeartSense Research Initiative — Established at SLIIT Malabe
          </span>
          <span className="footer-bottom-version">
            SYSTEM V4.0.2 · CLINICAL VALIDATION 2026
          </span>
        </div>
      </footer>
    </>
  );
}
