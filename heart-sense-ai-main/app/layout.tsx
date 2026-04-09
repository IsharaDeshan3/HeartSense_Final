import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, IBM_Plex_Sans_Condensed } from "next/font/google";
import "./globals.css";
import "uplot/dist/uPlot.min.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";

const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-ibm-plex-sans",
  subsets: ["latin"],
  display: "swap",
  weight: ["300", "400", "500", "600", "700"],
});

const ibmPlexSansCondensed = IBM_Plex_Sans_Condensed({
  variable: "--font-ibm-plex-sans-condensed",
  subsets: ["latin"],
  display: "swap",
  weight: ["300", "400", "500", "600", "700"],
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
    { media: "(prefers-color-scheme: light)", color: "#f6f2ea" },
    { media: "(prefers-color-scheme: dark)", color: "#26221f" },
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
        className={`${ibmPlexSans.variable} ${ibmPlexSansCondensed.variable} font-sans antialiased min-h-screen`}
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
