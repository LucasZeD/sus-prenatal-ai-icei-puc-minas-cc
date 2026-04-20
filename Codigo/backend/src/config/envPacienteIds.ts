import { AppError } from "../core/errors.js";

export function getPacienteIdsPepperOrThrow(): string {
  const p = process.env.PACIENTE_IDS_PEPPER?.trim();
  if (!p) {
    throw new AppError(
      "config_error",
      "Defina PACIENTE_IDS_PEPPER no Codigo/.env para persistir CPF/Cartão SUS apenas como hash (busca por homônimo / duplicidade).",
      503,
    );
  }
  return p;
}
