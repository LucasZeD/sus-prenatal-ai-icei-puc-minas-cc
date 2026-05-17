import { useCallback } from 'react'

type SetBool = (v: boolean | ((prev: boolean) => boolean)) => void

/**
 * Orquestra hidratação dos rascunhos (paciente, gestação, antecedentes) ao entrar em modo edição.
 * Persistência global continua em `savePerfis` + `DerModulosProntuario` (ref.persist).
 */
export function useProntuarioDrafts(
  snapshotPacienteDraftFromFull: () => void,
  snapshotGestacaoDraftFromFull: () => void,
  snapshotAntecedentesDraftFromFull: () => void,
  setShowMorePerfil: SetBool,
  setShowMoreGestacao: SetBool,
  setAntecedentesDetailsOpen: SetBool,
) {
  const prepareEnterEdit = useCallback(() => {
    snapshotPacienteDraftFromFull()
    snapshotGestacaoDraftFromFull()
    snapshotAntecedentesDraftFromFull()
    setShowMorePerfil(true)
    setShowMoreGestacao(true)
    setAntecedentesDetailsOpen(true)
  }, [
    snapshotAntecedentesDraftFromFull,
    snapshotGestacaoDraftFromFull,
    snapshotPacienteDraftFromFull,
    setAntecedentesDetailsOpen,
    setShowMorePerfil,
    setShowMoreGestacao,
  ])

  return { prepareEnterEdit }
}
