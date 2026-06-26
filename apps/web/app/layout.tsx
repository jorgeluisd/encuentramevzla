import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { EmergencyBanner } from "@/components/emergency-banner";
import "./globals.css";

// Inter como familia única (specs/0003 §1); swap evita FOIT y mantiene la página liviana.
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const SITE_URL = "https://encuentramevzla.com";
const SITE_NAME = "EncuéntrameVzla";
const DESCRIPTION =
  "Busca por nombre o cédula a una persona ingresada en un hospital de Venezuela tras el sismo. Con privacidad mediada: solo te indicamos el hospital donde hay una coincidencia.";

// metadataBase resuelve a absolutas las URLs de icon/opengraph que Next genera
// desde app/icon.png, app/apple-icon.png y app/opengraph-image.png.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "EncuéntrameVzla — Encuentra a tu familiar tras el sismo",
    template: "%s · EncuéntrameVzla",
  },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "personas desaparecidas Venezuela",
    "buscar familiar hospital",
    "terremoto Venezuela",
    "sismo Venezuela desaparecidos",
    "búsqueda por nombre o cédula",
    "EncuéntrameVzla",
  ],
  authors: [{ name: SITE_NAME }],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "es_VE",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: "EncuéntrameVzla — Encuentra a tu familiar tras el sismo",
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "EncuéntrameVzla — Encuentra a tu familiar tras el sismo",
    description: DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
  category: "humanitarian",
};

// JSON-LD (SEO): identifica el sitio y la organización sin fines de lucro.
const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  url: SITE_URL,
  description: DESCRIPTION,
  inLanguage: "es-VE",
  publisher: {
    "@type": "NGO",
    name: SITE_NAME,
    url: SITE_URL,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <html lang="es" className={inter.variable}>
      <body className="min-h-screen bg-bg text-text">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
        />
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
            <div className="mt-3 flex items-center gap-4">
              <span>Síguenos:</span>
              <a
                href="https://instagram.com/encuentramevzla_"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Instagram
              </a>
              <a
                href="https://x.com/encuentramevzl"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                X
              </a>
              <a
                href="https://tiktok.com/@encuentrame.vzla"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                TikTok
              </a>
            </div>
          </div>
        </footer>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
