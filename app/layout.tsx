import type { Metadata } from "next";
import "./typography.css";
import "./globals.css";
import "./theme.css";
import "./ui.css";
import { THEME_INIT } from "@/lib/theme-init";
export const metadata: Metadata = {
  title: "Tablée — Jeux de société entre amis",
  description:
    "Des jeux de société en ligne qui se lancent avec un lien : pas de compte, rien à installer, gratuit.",
  icons: { icon: "/icon.svg" },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <link rel="preload" href="/fonts/bricolage-grotesque-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
