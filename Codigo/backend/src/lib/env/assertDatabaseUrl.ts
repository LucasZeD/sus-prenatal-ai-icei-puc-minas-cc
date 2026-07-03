/**
 * Evita arranque com `DATABASE_URL` de tutorial (`USUARIO:SENHA`), que gera P1000 no Prisma.
 */
export function assertDatabaseUrlNotPlaceholder(): void {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    return;
  }
  if (/USUARIO:SENHA/i.test(url)) {
    console.error(
      "[backend] DATABASE_URL contém placeholder USUARIO:SENHA. " +
        "Use as mesmas credenciais de POSTGRES_USER/POSTGRES_PASSWORD em Codigo/.env.",
    );
    process.exit(1);
  }
}
