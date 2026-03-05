import type { Metadata, Viewport } from "next";
import { Nunito } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  display: "swap",
  weight: ["300", "400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "HeartSense AI - AI-Powered Cardiac Diagnostics",
  description:
    "Next generation cardiac diagnostics powered by advanced neural networks. Clinical-grade AI assistant for doctors to diagnose, monitor, and manage cardiac health.",
  keywords: [
    "cardiac diagnostics",
    "AI healthcare",
    "ECG analysis",
    "heart health",
    "medical AI",
    "Sri Lanka healthcare",
  ],
  authors: [{ name: "HeartSense AI Research Team" }],
  creator: "HeartSense AI",
  publisher: "HeartSense AI Medical Research Division",
  metadataBase: new URL("https://heartsense.ai"),
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://heartsense.ai",
    title: "HeartSense AI - AI-Powered Cardiac Diagnostics",
    description:
      "Next generation cardiac diagnostics powered by advanced neural networks.",
    siteName: "HeartSense AI",
  },
  twitter: {
    card: "summary_large_image",
    title: "HeartSense AI - AI-Powered Cardiac Diagnostics",
    description:
      "Next generation cardiac diagnostics powered by advanced neural networks.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="format-detection" content="telephone=no" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
      </head>
      <body
        className={`${nunito.variable} font-sans antialiased min-h-screen`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster richColors closeButton position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
