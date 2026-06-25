import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Registro Hospitalario de Pacientes",
  description:
    "Buscador con privacidad mediada para ayudar a localizar personas ingresadas en hospitales.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <html lang="es">
      <body>
        <header className="border-b border-gray-200">
          <nav className="mx-auto flex max-w-3xl items-center justify-between p-4 text-sm">
            <Link href="/" className="font-semibold text-teal-700">
              Registro Hospitalario
            </Link>
            <div className="flex gap-4">
              <Link href="/" className="hover:underline">
                Buscar
              </Link>
              <Link href="/confianza" className="hover:underline">
                Privacidad
              </Link>
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-3xl p-4">{children}</main>
        <footer className="mx-auto max-w-3xl border-t border-gray-200 p-4 text-xs text-gray-500">
          Proyecto humanitario sin fines de lucro. No es un servicio oficial de rescate.
        </footer>
      </body>
    </html>
  );
}
