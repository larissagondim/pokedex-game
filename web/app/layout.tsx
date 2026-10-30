import type { Metadata, Viewport } from "next";
import { Pixelify_Sans, VT323 } from "next/font/google";
import "./globals.css";

const pixelify = Pixelify_Sans({
  variable: "--font-pixel",
  subsets: ["latin"],
});

const vt323 = VT323({
  variable: "--font-vt",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "Pokédex Game",
  description: "Pokédex interativa em 3D. Projeto de fã, sem fins lucrativos.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#E9E9EE" },
    { media: "(prefers-color-scheme: dark)", color: "#1E1E24" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${pixelify.variable} ${vt323.variable}`}>
      <body>{children}</body>
    </html>
  );
}
