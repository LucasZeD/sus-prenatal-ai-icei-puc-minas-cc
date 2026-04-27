import { createHmac } from "node:crypto";

export function normalizarDigitosIdentificador(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function hmacSha256Hex(message: string, secret: string): string {
  return createHmac("sha256", secret).update(message, "utf8").digest("hex");
}

export function hashCpf(cpfBruto: string, pepper: string): string {
  const d = normalizarDigitosIdentificador(cpfBruto);
  if (d.length !== 11) {
    throw new Error("cpf_invalido");
  }
  return hmacSha256Hex(d, pepper);
}

export function hashCartaoSus(cartaoBruto: string, pepper: string): string {
  const d = normalizarDigitosIdentificador(cartaoBruto);
  if (d.length < 15) {
    throw new Error("cartao_sus_invalido");
  }
  return hmacSha256Hex(d, pepper);
}
