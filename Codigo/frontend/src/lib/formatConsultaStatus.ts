const STATUS_LABELS: Record<string, string> = {
  RASCUNHO: 'Rascunho',
  EM_ANDAMENTO: 'Em andamento',
  AGUARDANDO_CONFIRMACAO: 'Aguardando confirmação',
  CONFIRMADA: 'Confirmada',
  FINALIZADA: 'Finalizada',
}

/** Rótulo legível em português (UTF-8) para enums de status da consulta. */
export function formatConsultaStatus(status: string): string {
  return STATUS_LABELS[status] ?? status.replace(/_/g, ' ')
}
