import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: { default: "Palace Menu Studio", template: "%s · Palace Lounge" },
  description: "O seu menu, sempre actualizado. Palace Lounge, Luanda.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-AO" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
