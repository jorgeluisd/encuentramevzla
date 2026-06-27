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

// theme-color (barra del navegador móvil) — azul de marca.
export const viewport = {
  themeColor: "#1565c0",
};

// Iconos de marca como path SVG (viewBox 24) — inline, sin paquete ni requests extra.
const SOCIALS = [
  {
    label: "Instagram",
    href: "https://instagram.com/encuentramevzla_",
    icon: "M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z",
  },
  {
    label: "X",
    href: "https://x.com/encuentramevzl",
    icon: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z",
  },
  {
    label: "TikTok",
    href: "https://tiktok.com/@encuentrame.vzla",
    icon: "M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z",
  },
] as const;

// JSON-LD (SEO): sitio + ONG. Sin SearchAction: la búsqueda dejó de ser un GET
// público (anti-enumeración, spec 0016); una caja de búsqueda en Google invitaría
// justo al abuso que queremos evitar.
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
    logo: `${SITE_URL}/icon.png`,
    sameAs: SOCIALS.map((s) => s.href),
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
        {/* Skip link: primer foco con teclado; salta directo al contenido (a11y). */}
        <a
          href="#contenido"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-[var(--radius-control)] focus:bg-primary focus:px-4 focus:py-2 focus:text-white focus:shadow-[var(--shadow-card)]"
        >
          Saltar al contenido
        </a>
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

        <main
          id="contenido"
          tabIndex={-1}
          className="mx-auto max-w-[1120px] px-[22px] py-8 outline-none"
        >
          {children}
        </main>

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
            <div className="mt-3 flex items-center gap-3">
              <span>Síguenos:</span>
              {SOCIALS.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${s.label} (abre en otra pestaña)`}
                  className="text-text-2 transition-colors hover:text-primary"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5 w-5"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d={s.icon} />
                  </svg>
                </a>
              ))}
            </div>
          </div>
        </footer>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
