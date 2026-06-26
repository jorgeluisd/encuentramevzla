"use server";

import { redirect } from "next/navigation";
import { createSsrServerClient } from "@/lib/supabase/ssr-server";

/** Cierra la sesión del equipo y vuelve al login. */
export async function signOutAction(): Promise<void> {
  const supabase = await createSsrServerClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
