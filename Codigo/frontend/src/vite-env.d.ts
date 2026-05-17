/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
  /** URL de embed (iframe) para o bloco de demonstração na landing; opcional. */
  readonly VITE_LANDING_DEMO_VIDEO_URL?: string
  /** URL absoluta ou caminho em `/` para PDF de exemplo na landing (cartilha). Opcional. */
  readonly VITE_LANDING_SAMPLE_CARTILHA_PDF_URL?: string
  /** URL do Google Forms para sugestões, feedback e manifestação de interesse na landing. Opcional. */
  readonly VITE_LANDING_FEEDBACK_FORM_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
