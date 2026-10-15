import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Mappa — Le monde est à vous.",
  description:
    "Un atlas, quelques amis et un monde à conquérir. Jeu de stratégie multijoueur privé, gratuit, pour 3 à 6 joueurs.",
  icons: { icon: "/icon.svg" },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
