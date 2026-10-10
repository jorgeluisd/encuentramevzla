// Port del proveedor de identidad del portal (quién puede iniciar sesión). La autorización
// sigue siendo la allow-list (team_members); esto solo habilita el inicio de sesión.
// Idempotente: si la identidad ya existe, no falla.
export interface TeamIdentityProvisioner {
  provision(email: string): Promise<void>;
}
