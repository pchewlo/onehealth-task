import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Governed Agent Layer — 01Health",
  description:
    "One doorway between the AI assistant and the platform. The model proposes; the server decides.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
