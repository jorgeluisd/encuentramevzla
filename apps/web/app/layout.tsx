import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import { EmergencyBanner } from "@/components/emergency-banner";
import "./globals.css";

// Inter como familia única (specs/0003 §1); swap evita FOIT y mantiene la página liviana.
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "EncuéntrameVzla — Encuentra a tu familiar",
  description:
    "Buscador con privacidad mediada para ayudar a localizar personas ingresadas en hospitales tras el sismo.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <html lang="es" className={inter.variable}>
      <body className="min-h-screen bg-bg text-text">
        <EmergencyBanner />

        <header className="border-b border-border bg-bg">
          <nav className="mx-auto flex max-w-[1120px] items-center justify-between px-[22px] py-4">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              <span className="text-text">encuentrame</span>
              <span className="text-primary">VZLA</span>
            </Link>
            <div className="flex items-center gap-4 text-sm text-text-2">
              <Link href="/" className="hover:text-primary">
                Inicio
              </Link>
              <Link href="/confianza" className="hover:text-primary">
                Privacidad
              </Link>
              <Link
                href="/admin/ingesta"
                className="hidden hover:text-primary sm:inline"
              >
                Portal del equipo
              </Link>
            </div>
          </nav>
          {/* Franja tricolor de Venezuela: acento decorativo de marca (0003 §4). */}
          <div className="flex h-1 w-full" aria-hidden="true">
            <div className="flex-1 bg-flag-yellow" />
            <div className="flex-1 bg-flag-blue" />
            <div className="flex-1 bg-flag-red" />
          </div>
        </header>

        <main className="mx-auto max-w-[1120px] px-[22px] py-8">{children}</main>

        <footer className="mt-12 border-t border-border bg-surface">
          <div className="mx-auto max-w-[1120px] px-[22px] py-6 text-xs text-text-2">
            <p>
              Proyecto humanitario sin fines de lucro. No es un servicio oficial de
              rescate.
            </p>
            <p className="mt-1">
              La información proviene de listas aportadas por hospitales y terceros, y
              puede contener errores u omisiones. EncuéntrameVzla no se responsabiliza
              por la exactitud de los datos cargados; confirma siempre con la institución
              hospitalaria antes de tomar decisiones.
            </p>
            <p className="mt-1">
              ¿Cómo protegemos los datos?{" "}
              <Link href="/confianza" className="text-primary hover:underline">
                Lee nuestra política de privacidad
              </Link>
              .
            </p>
            <p className="mt-1">
              <Link href="/emergencias" className="text-primary hover:underline">
                Números de emergencia
              </Link>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
