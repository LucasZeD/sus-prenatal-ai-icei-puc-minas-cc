import { describe, it, expect } from "vitest";
import {
  hashCartaoSus,
  hashCpf,
  hmacSha256Hex,
  normalizarDigitosIdentificador,
} from "../src/lib/identificadores/pacienteIdsHash.js";

describe("pacienteIdsHash (HMAC + normalização)", () => {
  const pepperA = "pepper-a-para-testes-de-hmac-identificadores";
  const pepperB = "pepper-b-para-testes-de-hmac-identificadores";

  it("produz o mesmo hash para o mesmo valor normalizado e pepper (determinístico)", () => {
    const cpf = "111.444.777-35";
    expect(hashCpf(cpf, pepperA)).toBe(hashCpf("11144477735", pepperA));
  });

  it("altera o hash integralmente quando o pepper muda (isolamento do segredo)", () => {
    const cpf = "11144477735";
    expect(hashCpf(cpf, pepperA)).not.toBe(hashCpf(cpf, pepperB));
  });

  it("normalizarDigitosIdentificador remove máscaras e caracteres não numéricos", () => {
    expect(normalizarDigitosIdentificador(" 898.7000 \n0002-131812 ")).toBe("89870000002131812");
  });

  it("hmacSha256Hex retorna hex de 64 caracteres (SHA-256)", () => {
    const h = hmacSha256Hex("123", pepperA);
    expect(h).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejeita CPF com quantidade de dígitos diferente de 11", () => {
    expect(() => hashCpf("123", pepperA)).toThrow("cpf_invalido");
    expect(() => hashCpf("111444777350", pepperA)).toThrow("cpf_invalido");
  });

  it("rejeita cartão SUS com menos de 15 dígitos após normalização", () => {
    expect(() => hashCartaoSus("12345678901234", pepperA)).toThrow("cartao_sus_invalido");
  });

  it("aceita cartão SUS com 15+ dígitos", () => {
    const h = hashCartaoSus("89870000002131812", pepperA);
    expect(h).toMatch(/^[a-f0-9]{64}$/);
  });

  it("não retorna o identificador em claro nem substring material do documento", () => {
    const cartao = "89870000002131812";
    const h = hashCartaoSus(cartao, pepperA);
    expect(h).not.toContain(cartao);
    expect(h).not.toContain("898700000021318");
  });
});
