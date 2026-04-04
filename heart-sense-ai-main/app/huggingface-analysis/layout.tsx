import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "HuggingFace KRA Analysis — HeartSense AI",
};

export default function HuggingFaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
