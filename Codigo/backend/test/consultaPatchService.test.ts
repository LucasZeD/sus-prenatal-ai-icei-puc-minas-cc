import { describe, it, expect } from "vitest";
import { StatusConsulta } from "../src/lib/prismaBarrel.js";
import type { Consulta } from "../src/repository/consultaRepository.js";
import { buildConsultaPatchUpdate } from "../src/services/consultaPatchService.js";
import { AppError } from "../src/core/errors.js";

function cx(status: StatusConsulta, validacao_medica: boolean): Consulta {
  return { status, validacao_medica } as Consulta;
}

describe("buildConsultaPatchUpdate (máquina de estados RF07)", () => {
  it("permite RASCUNHO → EM_ANDAMENTO", () => {
    const data = buildConsultaPatchUpdate(cx(StatusConsulta.RASCUNHO, false), {
      status: StatusConsulta.EM_ANDAMENTO,
    });
    expect(data.status).toBe(StatusConsulta.EM_ANDAMENTO);
  });

  it("permite RASCUNHO → AGUARDANDO_CONFIRMACAO (atalho explícito no domínio atual)", () => {
    const data = buildConsultaPatchUpdate(cx(StatusConsulta.RASCUNHO, false), {
      status: StatusConsulta.AGUARDANDO_CONFIRMACAO,
    });
    expect(data.status).toBe(StatusConsulta.AGUARDANDO_CONFIRMACAO);
  });

  it("permite EM_ANDAMENTO → AGUARDANDO_CONFIRMACAO", () => {
    const data = buildConsultaPatchUpdate(cx(StatusConsulta.EM_ANDAMENTO, false), {
      status: StatusConsulta.AGUARDANDO_CONFIRMACAO,
    });
    expect(data.status).toBe(StatusConsulta.AGUARDANDO_CONFIRMACAO);
  });

  it("bloqueia RASCUNHO → CONFIRMADA (transição ilegal)", () => {
    expect(() =>
      buildConsultaPatchUpdate(cx(StatusConsulta.RASCUNHO, false), {
        status: StatusConsulta.CONFIRMADA,
        validacao_medica: true,
      }),
    ).toThrow(AppError);
  });

  it("bloqueia EM_ANDAMENTO → CONFIRMADA sem passar por AGUARDANDO_CONFIRMACAO", () => {
    expect(() =>
      buildConsultaPatchUpdate(cx(StatusConsulta.EM_ANDAMENTO, true), {
        status: StatusConsulta.CONFIRMADA,
      }),
    ).toThrow(AppError);
  });

  it("bloqueia CONFIRMADA → qualquer outro status", () => {
    expect(() =>
      buildConsultaPatchUpdate(cx(StatusConsulta.CONFIRMADA, true), {
        status: StatusConsulta.EM_ANDAMENTO,
      }),
    ).toThrow(AppError);
  });

  it("exige validacao_medica true para ir a CONFIRMADA a partir de AGUARDANDO_CONFIRMACAO", () => {
    expect(() =>
      buildConsultaPatchUpdate(cx(StatusConsulta.AGUARDANDO_CONFIRMACAO, false), {
        status: StatusConsulta.CONFIRMADA,
      }),
    ).toThrow(AppError);
  });

  it("permite AGUARDANDO_CONFIRMACAO → CONFIRMADA com validacao_medica true (mesmo PATCH)", () => {
    const data = buildConsultaPatchUpdate(cx(StatusConsulta.AGUARDANDO_CONFIRMACAO, false), {
      status: StatusConsulta.CONFIRMADA,
      validacao_medica: true,
    });
    expect(data.status).toBe(StatusConsulta.CONFIRMADA);
    expect(data.validacao_medica).toBe(true);
  });

  it("rejeita payload sem campos aplicáveis (edge case de cliente malformado)", () => {
    expect(() => buildConsultaPatchUpdate(cx(StatusConsulta.RASCUNHO, false), {})).toThrow(AppError);
  });

  it("aplica campos clínicos (idade_gestacional, is_exantema) sem alterar status", () => {
    const data = buildConsultaPatchUpdate(cx(StatusConsulta.EM_ANDAMENTO, false), {
      idade_gestacional: 24,
      is_exantema: true,
    });
    expect(data.idade_gestacional).toBe(24);
    expect(data.is_exantema).toBe(true);
  });
});
