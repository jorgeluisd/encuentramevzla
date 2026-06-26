import type { Metadata } from "next";

// Todo /admin queda fuera de los buscadores (portal privado del equipo).
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
  return children;
}
