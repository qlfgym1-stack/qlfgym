import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from '@/lib/auth/context';

export const metadata: Metadata = {
  title: "QLF Fitness - Gestion",
  description: "Plateforme de gestion de salle de fitness",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className="h-full">
      <body className="min-h-full bg-background text-foreground">
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
