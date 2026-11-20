import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Paperfree — Free PDF Toolkit",
  description:
    "Merge, split, rotate, and create PDFs privately in your browser. Free and open source.",
};
export default function Layout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
