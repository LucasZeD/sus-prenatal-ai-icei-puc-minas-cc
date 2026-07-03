/**
 * Fontes oficiais alinhadas à bibliografia do TCC (sbc-template.bib, manuais ~399-486).
 * URLs em percent-encoding; o guia do parceiro (2. ed.) usa hífen Unicode no nome do ficheiro (%E2%80%93).
 * Validar periodicamente; órgãos podem alterar rotas.
 *
 * localPdfPath – caminho relativo em /public/assets/docs/ para embedding inline.
 *   Quando ausente, o carrossel mostra apenas metadados + botão de download externo.
 */
export type LandingOfficialDoc = {
  id: string
  title: string
  publisher: string
  year: number
  /** Resumo em uma linha para o público da landing */
  blurb: string
  officialPdfUrl: string
  /** Caminho local do PDF para pré-visualização inline (opcional). */
  localPdfPath?: string
}

export const LANDING_OFFICIAL_DOCUMENTS: LandingOfficialDoc[] = [
  {
    id: 'cab32-prenatal-2012',
    title: 'Cadernos de Atenção Básica: Atenção ao Pré-natal de Baixo Risco',
    publisher: 'Brasil. Ministério da Saúde',
    year: 2012,
    blurb: 'Linha de cuidado de baixo risco e condutas na atenção primária.',
    officialPdfUrl:'https://bvsms.saude.gov.br/bvs/publicacoes/cadernos_atencao_basica_32_prenatal.pdf',
    localPdfPath:'/assets/docs/PreNatal_BaixoRisco/CadernosDeAtencaoBasica2012.pdf'
  },
  {
    id: 'caderno-risco-habitual',
    title: 'Caderno de Atenção ao Pré-Natal: Risco Habitual',
    publisher: 'Brasil. Ministério da Saúde',
    year: 2012,
    blurb: 'Protocolo de acompanhamento para gestações de risco habitual na atenção primária.',
    officialPdfUrl: 'https://bvsms.saude.gov.br/bvs/publicacoes/cadernos_atencao_basica_32_prenatal.pdf',
    localPdfPath: '/assets/docs/PreNatal_BaixoRisco/CadernoAtencaoRiscoHabitual.pdf',
  },
  {
    id: 'guia-referencia-rapida-baixo-risco-2013',
    title: 'Guia de Referência Rápida: Pré-Natal de Baixo Risco',
    publisher: 'Brasil. Ministério da Saúde',
    year: 2013,
    blurb: 'Consulta rápida de condutas e fluxos para o pré-natal de baixo risco.',
    officialPdfUrl: 'https://bvsms.saude.gov.br/bvs/publicacoes/cadernos_atencao_basica_32_prenatal.pdf',
    localPdfPath: '/assets/docs/PreNatal_BaixoRisco/GuiaReferenciaRapidaBaixoRisco2013.pdf',
  },
  {
    id: 'guia-estratificacao-mg-2024',
    title: 'Guia de Atenção à Saúde da Gestante: Estratificação de Acompanhamento Pré-Natal',
    publisher: 'Minas Gerais. Secretaria de Estado de Saúde',
    year: 2024,
    blurb: 'Critérios de estratificação de risco e encaminhamentos (referência estadual alinhada ao cuidado SUS).',
    officialPdfUrl:'https://www.saude.mg.gov.br/wp-content/uploads/2025/01/12-11-Estratificacao-de-Risco-final-1.pdf',
    localPdfPath:'/assets/docs/PreNatal_ProfissionalSaude/CriteriosEstratificacaoDeRisco2024.pdf'
  },
  {
    id: 'atualizacao-prenatal-sc-2014',
    title: 'Manual Técnico do Pré-natal para Profissionais da Atenção Básica',
    publisher: 'Santa Catarina. Secretaria de Estado da Saúde',
    year: 2014,
    blurb: 'Material de capacitação e condutas para equipas da Rede Cegonha.',
    officialPdfUrl:'https://saude.sc.gov.br/index.php/pt/redes-de-atencao-a-saude/rede-cegonha/acervo-e-e-book/manual-oficina-de-atualizacao-em-pre-natal-para-profissionais-da-atencao-basica/download',
    localPdfPath:'/assets/docs/PreNatal_ProfissionalSaude/ManualTecnico2014.pdf'
  },
  {
    id: 'guia-prenatal-parceiro-2025',
    title: 'Guia do Pré-natal do Parceiro para Profissionais de Saúde',
    publisher: 'Brasil. Ministério da Saúde',
    year: 2025,
    blurb: 'Orientações para envolvimento do parceiro no cuidado pré-natal.',
    officialPdfUrl: 'https://bvsms.saude.gov.br/bvs/publicacoes/guia_pre_natal_profissionais_saude%E2%80%932ed.pdf',
    localPdfPath:'/assets/docs/PreNatalParceiro/GuiaPreNatalDoParceiro2023.pdf'
  },
  {
    id: 'manual-alto-risco-2022',
    title: 'Manual de Gestação de Alto Risco',
    publisher: 'Brasil. Ministério da Saúde',
    year: 2022,
    blurb: 'Abordagem clínica e vigilância em gestações de alto risco.',
    officialPdfUrl: 'https://bvsms.saude.gov.br/bvs/publicacoes/manual_gestacao_alto_risco.pdf',
    localPdfPath:'/assets/docs/PreNatal_AltoRisco/ManualGestacaoAltoRisco2022.pdf'
  },
  {
    id: 'manual-tecnico-alto-risco-2012',
    title: 'Manual Técnico Gestação de Alto Risco',
    publisher: 'Brasil. Ministério da Saúde',
    year: 2012,
    blurb: 'Referência técnica complementar sobre gestação de alto risco.',
    officialPdfUrl: 'https://bvsms.saude.gov.br/bvs/publicacoes/manual_tecnico_gestacao_alto_risco.pdf',
    localPdfPath:'/assets/docs/PreNatal_AltoRisco/ManualTecnicoGestacaoAltoRisco.pdf'
  },
  {
    id: 'gestacao-alto-risco-manual-2010',
    title: 'Gestação de Alto Risco: Manual Técnico',
    publisher: 'Brasil. Ministério da Saúde',
    year: 2010,
    blurb: 'Histórico de diretrizes nacionais sobre gestação de alto risco.',
    officialPdfUrl: 'https://bvsms.saude.gov.br/bvs/publicacoes/gestacao_alto_risco.pdf',
    localPdfPath:'/assets/docs/PreNatal_AltoRisco/GestacaoAltoRisco2010.pdf'
  },
  {
    id: 'guia-prenatal-puerperio-aps-2024',
    title: 'Guia do Pré-Natal e Puerpério na Atenção Primária à Saúde',
    publisher: 'Brasil. Ministério da Saúde',
    year: 2024,
    blurb: 'Diretrizes atualizadas para acompanhamento do pré-natal e puerpério na APS.',
    officialPdfUrl: 'https://bvsms.saude.gov.br/bvs/publicacoes/guia_prenatal_puerperio_atencao_primaria.pdf',
    localPdfPath: '/assets/docs/Puerperio/GuiaDoPreNatal_PuerperioNaAtencaoPrimariaSaude_2024.pdf',
  },
  {
    id: 'manual-tecnico-prenatal-puerperio',
    title: 'Manual Técnico: Pré-Natal e Puerpério',
    publisher: 'Brasil. Ministério da Saúde',
    year: 2006,
    blurb: 'Referência técnica histórica para atenção qualificada e humanizada ao pré-natal e puerpério.',
    officialPdfUrl: 'https://bvsms.saude.gov.br/bvs/publicacoes/manual_tecnico_pre_natal_puerperio.pdf',
    localPdfPath: '/assets/docs/Puerperio/ManualTecnico_PrenatalPuerperio.pdf',
  },
]
