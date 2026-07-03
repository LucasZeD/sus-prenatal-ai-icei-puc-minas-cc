// import { useEffect, useId, useMemo, useState } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.js'
// import { getApiBaseUrl } from '../lib/apiBase.js'
import { LandingCarousel, type LandingCarouselSlide } from '../components/landing/LandingCarousel.js'
import { LandingPdfEmbed } from '../components/landing/LandingPdfEmbed.js'
import { LANDING_OFFICIAL_DOCUMENTS } from '../data/landingOfficialDocuments.js'

const demoVideoUrl = import.meta.env.VITE_LANDING_DEMO_VIDEO_URL as string | undefined

const feedbackFormUrl = (import.meta.env.VITE_LANDING_FEEDBACK_FORM_URL as string | undefined)?.trim() || undefined

const MS_CADERNETAS_PUBLICACOES =
  'https://www.gov.br/saude/pt-br/composicao/saps/publicacoes/cadernetas-e-cartoes'

const defaultSampleCartilhaPdf = '/assets/docs/CadernetaGestante/CadernetaGestante_8ed_rev_2024.pdf'

const INTERFACE_SLIDES_META: { id: string; src: string; caption: string; alt: string }[] = [
  {
    id: 'dashboard',
    src: '/assets/interfaces/02_dashboard_editted.png',
    caption: 'Painel Geral da Profissional de Saúde',
    alt: 'Captura da agenda do sistema: lista de consultas e resumo do dia',
  },
  {
    id: 'pacientes',
    src: '/assets/interfaces/03_pacientes_lista.png',
    caption: 'Lista de Pacientes Cadastradas',
    alt: 'Captura da lista de pacientes do sistema',
  },
  {
    id: 'prontuario',
    src: '/assets/interfaces/04_paciente_detalhe.png',
    caption: 'Prontuário e dados da gestante',
    alt: 'Captura do prontuário eletrónico com dados clínicos da gestante',
  },
  {
    id: 'escriba',
    src: '/assets/interfaces/05_escriba_consulta.png',
    caption: 'Escriba durante a consulta',
    alt: 'Captura do modo escriba com transcrição e revisão da consulta',
  },
]

function StackTechLink({
  href,
  children,
  className = '',
}: {
  href: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`${className} text-inherit no-underline outline-none ring-brand-pink focus-visible:ring-2 focus-visible:ring-offset-2`}
    >
      {children}
    </a>
  )
}

export function LandingPage() {
  const { login, loginState, token } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard'

  const sampleCartilhaPdf =
    (import.meta.env.VITE_LANDING_SAMPLE_CARTILHA_PDF_URL as string | undefined)?.trim() || defaultSampleCartilhaPdf

  const [lightbox, setLightbox] = useState<{ src: string; caption: string } | null>(null)
  // const hostingDetailsId = useId()

  useEffect(() => {
    if (token) navigate(from, { replace: true })
  }, [token, navigate, from])

  useEffect(() => {
    if (!lightbox) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox])

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // const apiBase = getApiBaseUrl()

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const ok = await login(email, password)
    if (ok) {
      navigate(from, { replace: true })
    }
  }

  const interfaceCarouselSlides: LandingCarouselSlide[] = useMemo(
    () =>
      INTERFACE_SLIDES_META.map((m) => ({
        id: m.id,
        content: (
          <figure className="mx-auto max-w-4xl">
            <button
              type="button"
              className="group relative w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-sm focus-visible:outline focus-visible:ring-2 focus-visible:ring-brand-pink"
              onClick={() => setLightbox({ src: m.src, caption: m.caption })}
            >
              <img
                src={m.src}
                alt={m.alt}
                className="aspect-[16/10] w-full object-cover object-top transition group-hover:opacity-95"
              />
              <span className="absolute bottom-3 right-3 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-slate-700 shadow">
                Ampliar
              </span>
            </button>
            <figcaption className="mt-4 text-center text-base font-semibold text-slate-700">{m.caption}</figcaption>
          </figure>
        ),
      })),
    [],
  )

  const officialDocsSlides: LandingCarouselSlide[] = useMemo(
    () =>
      LANDING_OFFICIAL_DOCUMENTS.map((d) => ({
        id: d.id,
        content: (
          <div className="mx-auto max-w-4xl">
            <div className="mb-4 text-left">
              <h3 className="text-lg font-semibold text-brand-navy sm:text-xl">{d.title}</h3>
              <p className="mt-1 text-sm text-slate-500">
                {d.publisher} · {d.year}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{d.blurb}</p>
            </div>
            {d.localPdfPath ? (
              <LandingPdfEmbed pdfUrl={d.localPdfPath} title={d.title} openLabel="Abrir PDF" />
            ) : (
              <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50">
                <p className="text-sm text-slate-500">PDF disponível apenas no site do órgão emissor.</p>
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-3">
              <a
                href={d.officialPdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-xl bg-brand-navy px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus-visible:outline focus-visible:ring-2 focus-visible:ring-brand-pink"
              >
                Abrir PDF oficial
              </a>
              <span className="self-center text-xs text-slate-500">Abre no site do órgão emissor.</span>
            </div>
          </div>
        ),
      })),
    [],
  )

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 font-sans text-slate-800">
      {lightbox ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={lightbox.caption}
          onClick={() => setLightbox(null)}
        >
          <div
            className="relative max-h-[92vh] w-full max-w-5xl rounded-2xl bg-white p-2 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="absolute right-3 top-3 z-10 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-brand-navy shadow-sm hover:bg-slate-50 focus-visible:outline focus-visible:ring-2 focus-visible:ring-brand-pink"
              onClick={() => setLightbox(null)}
            >
              Fechar
            </button>
            <img
              src={lightbox.src}
              alt={lightbox.caption}
              className="max-h-[85vh] w-full rounded-xl object-contain"
            />
            <p className="px-2 pb-2 pt-2 text-center text-sm font-medium text-slate-600">{lightbox.caption}</p>
          </div>
        </div>
      ) : null}

      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-6 py-4">
          <img
            src="/assets/imgs/imagem_logo_transparente.png"
            alt=""
            className="h-11 w-11 object-contain"
            width={44}
            height={44}
          />
          <span className="text-xl font-semibold tracking-tight text-brand-navy">Pré-Natal Digital</span>
          <a
            href="#feedback-interesse"
            className="ml-auto text-sm font-semibold text-brand-navy underline decoration-brand-pink/50 decoration-2 underline-offset-4 hover:text-brand-pink focus-visible:outline focus-visible:ring-2 focus-visible:ring-brand-pink"
          >
            Sugestões e feedback
          </a>
        </div>
      </header>

      <section className="relative overflow-hidden bg-white px-6 pb-16 pt-12 sm:pb-24 sm:pt-16">
        {/* Background image – visible on lg+ as left column, hidden on mobile */}
        {/* <div className="pointer-events-none absolute inset-0 hidden lg:block" aria-hidden>
          <img
            src="/assets/imgs/imagem_logo.png"
            alt=""
            className="absolute bottom-0 left-0 h-full w-[52%] object-contain object-left-bottom opacity-[0.12]"
          />
        </div> */}

        <div className="relative mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[1fr_1.15fr] lg:gap-14">
          {/* Left: illustration (visible on all sizes, prominent on mobile) */}
          <div className="flex items-center justify-center lg:justify-start">
            <div className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-slate-50/80 p-6 shadow-sm backdrop-blur-sm sm:p-8 lg:max-w-none">
              <img
                src="/assets/imgs/imagem_logo.png"
                alt="Ilustração da plataforma de pré-natal"
                className="h-auto w-full rounded-2xl object-cover"
              />
            </div>
          </div>

          {/* Right: title + subtitle + feature list */}
          <div className="text-left">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-pink">Trabalho de Conclusão de Curso · PUC Minas · Ciência da Computação</p>
            <h1 className="mt-4 text-3xl font-semibold leading-tight tracking-tight text-brand-navy sm:text-4xl lg:text-5xl">
              IA Responsável para o <span className="text-brand-pink">Pré-Natal</span> no SUS
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
              O sistema transcreve a consulta, pré-preenche a ficha para revisão da equipe, e responde dúvidas clínicas com referências aos manuais oficiais do Ministério da Saúde.
            </p>

            <div className="mt-8 border-t border-slate-200 pt-8">
              <h2 className="text-xl font-semibold tracking-tight text-brand-navy sm:text-2xl">Pensado para a rotina dos Profissionais de Saúde.</h2>
              <p className="mt-3 text-base leading-relaxed text-slate-600">
                Para quem atende muitas gestantes por dia. Esse sistema realiza escuta ativa sem digitar, pré preenchimento de registros clínicos e apoio clínico com fontes do SUS.
              </p>
            </div>

            <ul className="mt-6 space-y-4 text-base leading-relaxed text-slate-700">
              <li className="flex gap-3">
                <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand-pink" aria-hidden />
                <span>
                  <strong className="font-semibold text-brand-navy">Escriba digital:</strong> a consulta é transcrita localmente e a ficha é pré-preenchida. Você revisa os dados inseridos pela IA, decide se aprova e então grava no prontuário da gestante.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand-pink" aria-hidden />
                <span>
                  <strong className="font-semibold text-brand-navy">Assistente LívIA:</strong> responde suas dúvidas clínicas com trechos retirados dos manuais oficiais do Ministério da Saúde, sempre indicando a fonte e a página para conferência em segundos.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand-pink" aria-hidden />
                <span>
                  <strong className="font-semibold text-brand-navy">Estratificação de risco:</strong> o painel calcula a classificação de risco gestacional com regras explícitas do Guia de Atenção à Saúde da Gestante (MG/SES, 2024), atualizada quando os dados clínicos mudam.
                </span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-white px-6 pb-16 pt-12 sm:pb-24 sm:pt-16">
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[1fr_1.15fr] lg:gap-14">
          {/* Left: */}
          <div className="flex items-center justify-center lg:justify-start">
            <div className="mx-auto w-full max-w-md">
              <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
                <h2 id="acesso-titulo" className="text-lg font-semibold text-brand-navy">
                  Acesso profissional
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  Entre com as credenciais do ambiente de demonstração para explorar o painel.
                </p>

                <form className="mt-8 flex flex-col gap-5" onSubmit={(e) => void onSubmit(e)}>
                  <label className="text-sm font-semibold text-slate-800">
                    E-mail
                    <input
                      type="email"
                      autoComplete="username"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="mt-2 block w-full rounded-xl border-0 py-3 px-4 text-base text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:bg-brand-pink/5 focus:ring-2 focus:ring-inset focus:ring-brand-pink"
                      placeholder="nome@unidade.gov.br"
                      required
                    />
                  </label>
                  <label className="text-sm font-semibold text-slate-800">
                    Senha
                    <input
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="mt-2 block w-full rounded-xl border-0 py-3 px-4 text-base text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:bg-brand-pink/5 focus:ring-2 focus:ring-inset focus:ring-brand-pink"
                      required
                    />
                  </label>
                  <div className="pt-1">
                    <button
                      type="submit"
                      disabled={loginState.kind === 'loading'}
                      className="flex min-h-[3rem] w-full items-center justify-center rounded-xl bg-brand-pink px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-400 focus-visible:outline focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-pink disabled:opacity-60"
                    >
                      {loginState.kind === 'loading' ? 'A entrar…' : 'Entrar'}
                    </button>
                  </div>
                  {loginState.kind === 'error' ? (
                    <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm font-medium text-red-700">
                      {loginState.message}
                    </div>
                  ) : null}
                </form>
              </div>
            </div>
          </div>

          {/* Right: */}
          <div className="text-right">
            <div className="mx-auto max-w-4xl text-center">
              <h2 id="demo-titulo" className="text-2xl font-semibold tracking-tight text-brand-navy sm:text-3xl">
                Vídeo de demonstração
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-600">
                Veja uma demonstração abaixo de como realizar a consulta através da interface.
              </p>
              <div className="mt-10 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                {demoVideoUrl ? (
                  <iframe
                    title="Demonstração em vídeo do Pré-Natal Digital"
                    src={demoVideoUrl}
                    className="aspect-video w-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <div className="flex aspect-video flex-col items-center justify-center gap-2 bg-slate-100 px-6 text-center">
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                      Vídeo em preparação
                    </span>
                    <p className="max-w-md text-sm text-slate-600">
                      Veja em breve uma demonstração de como realizar a consulta através da interface.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-slate-200 bg-white px-6 py-16 sm:py-20" aria-labelledby="contexto-titulo">
        <div className="mx-auto max-w-6xl">
          <div className="text-center">
            <h2 id="contexto-titulo" className="text-2xl font-semibold tracking-tight text-brand-navy sm:text-3xl">
              Da cartilha de gestantes à tela do profissional.
            </h2>
            <p className="mx-auto mt-4 max-w-3xl text-base leading-relaxed text-slate-600 sm:text-lg">
              A Caderneta da Gestante continua orientando o cuidado. O desafio é alinhar o registro ao tempo da consulta, reduzindo a sobrecarga cognitiva da equipe.
            </p>
          </div>

          <div className="mt-12 grid gap-8 md:grid-cols-2 md:gap-10">
            <div className="rounded-2xl border border-brand-pink/30 bg-rose-50/40 p-8 shadow-sm sm:p-9">
              <h3 className="text-lg font-semibold text-brand-navy">Desafios do dia a dia</h3>
              <ol className="mt-5 space-y-3 text-base leading-relaxed text-slate-700">
                <li>Preenchimento do sistema de pré-natal interno e da cartilha manual ao mesmo tempo.</li>
                <li>Consulta a manuais em PDF ou papel no meio do horário corrido.</li>
                <li>Atenção a detalhes clínicos de procedimentos recomendados pelo Ministério da Saúde.</li>
                <li>Atenção repartida entre escuta, teclado e procura de referência.</li>
              </ol>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-8 shadow-sm sm:p-9">
              <h3 className="text-lg font-semibold text-brand-navy">O que o sistema acrescenta</h3>
              <ol className="mt-5 space-y-3 text-base leading-relaxed text-slate-800">
                <li>Transcrição da consulta pré-preenche a ficha, que é revisada antes de gravar.</li>
                <li>
                  Busca em trechos de <strong className="font-semibold text-brand-navy">cartilhas e manuais públicos</strong> indexados, com referência à fonte e página.
                </li>
                <li>
                  Classificação de risco gestacional com regras explícitas do Guia de Estratificação (MG/SES, 2024), atualizada conforme os dados clínicos mudam.
                </li>
                <li>
                  Banco de dados estruturado de acordo com a <strong className="font-semibold text-brand-navy">Cartilha de Gestante de 2024</strong> podendo ser exportado via API para o banco de dados da instituição.
                </li>
              </ol>
            </div>
          </div>

          <div className="mt-10 rounded-2xl border border-slate-200 bg-slate-50/50 p-8 shadow-sm sm:p-9">
            <h3 className="text-lg font-semibold text-emerald-800">Nossa preocupação com a segurança.</h3>
            <p className="mt-3 text-base leading-relaxed text-slate-700">
              O sistema foi desenvolvido em conformidade com a LGPD. Nenhum dado sensível ou áudio bruto sai do servidor local. A arquitetura on-premise em containers Docker garante que todo o processamento (transcrição, busca em manuais e inferência de IA) ocorra na rede interna da instituição, em conformidade com a LGPD. Dados de identificação pessoal são anonimizados antes de qualquer processamento por IA.
            </p>
          </div>
        </div>
      </section>

      <section className="border-t border-slate-200 bg-slate-50 px-6 py-16 sm:py-20" aria-labelledby="refs-titulo">
        <div className="mx-auto max-w-6xl">
          <h2 id="refs-titulo" className="text-center text-2xl font-semibold tracking-tight text-brand-navy sm:text-3xl">
            Documentos públicos que sustentam o apoio à decisão
          </h2>
          <p className="mx-auto mt-4 max-w-3xl text-center text-base leading-relaxed text-slate-600 sm:text-lg">
            O assistente procura respostas em material do Ministério da Saúde, de estados e de outras fontes oficiais. Abaixo veja todos os documentos que o agente usa como conhecimento para dar respostas.
          </p>
          <div className="mx-auto mt-10 max-w-4xl">
            <LandingCarousel ariaLabel="Lista de documentos oficiais em carrossel" slides={officialDocsSlides} />
          </div>
        </div>
      </section>

      <section className="border-t border-slate-200 bg-white px-6 py-16 sm:py-20" aria-labelledby="materiais-titulo">
        <div className="mx-auto max-w-6xl">
          <h2 id="materiais-titulo" className="text-center text-2xl font-semibold tracking-tight text-brand-navy sm:text-3xl">
            Digitalização do cuidado.
          </h2>
          <p className="mx-auto mt-4 max-w-3xl text-center text-base leading-relaxed text-slate-600 sm:text-lg">
            Digitalizamos a cartilha de acompanhamento de pré-natal do Ministério da Saúde para evitar o preenchimento manual e otimizar o tempo da equipe.
          </p>

          <div className="mx-auto mt-14 max-w-3xl rounded-2xl border border-slate-200 bg-slate-50/50 p-6 shadow-sm sm:p-8">
            <h3 className="text-lg font-semibold text-brand-navy">Caderneta da Gestante (PDF de referência)</h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              A Caderneta da Gestante - 8.ª ed. revista, 2024 foi usada como modelo para o banco de dados do sistema.
            </p>
            <div className="mt-5">
              <LandingPdfEmbed
                pdfUrl={sampleCartilhaPdf}
                title="Caderneta da Gestante 8.ª edição revista 2024"
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <a
                href={sampleCartilhaPdf}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-brand-navy hover:border-brand-pink/40"
              >
                Abrir PDF
              </a>
              <a
                href={MS_CADERNETAS_PUBLICACOES}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-brand-navy hover:bg-slate-50"
              >
                Esta e outras cadernetas (gov.br)
              </a>
            </div>
          </div>

          <div className="mx-auto mt-10 max-w-5xl">
            <LandingCarousel ariaLabel="Imagens do sistema em carrossel" slides={interfaceCarouselSlides} />
          </div>
        </div>
      </section>

      <div className="border-t border-slate-200 bg-white py-16 sm:py-20">
        {/* <div className="mx-auto max-w-6xl px-6"> */}
          {/* <div className="mt-16 border-t border-slate-200 pt-12"> */}
            <div className="mb-10 text-center">
              <h3 className="text-xl font-semibold tracking-tight text-brand-navy sm:text-2xl">Infraestrutura e modelos de IA.</h3>
              <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
                Interface web (React/Vite), API (Node.js/Hono), banco relacional (PostgreSQL/Prisma) e modelos de voz e linguagem em contêineres Docker na rede local. O modelo principal (Qwen 3.5 9B, quantização Q4) foi escolhido pelo melhor equilíbrio entre latência e precisão clínica em hardware com 16 GB de VRAM.
              </p>
            </div>

            <div className="mx-auto flex max-w-6xl flex-wrap justify-center gap-3 px-2">
              <StackTechLink
                href="https://vite.dev/"
                className="group flex flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-sky-200 hover:shadow"
              >
                <img src="/assets/icons/black-nextjs-icon-svgrepo-com.svg" alt="" className="h-9 w-9 opacity-80" />
                <span className="text-center text-xs font-medium text-slate-600">React / Vite</span>
              </StackTechLink>

              <StackTechLink
                href="https://tailwindcss.com/"
                className="group flex flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-sky-300 hover:shadow"
              >
                <img src="/assets/icons/blue_tailwind-css-svgrepo-com.svg" alt="" className="h-9 w-9" />
                <span className="text-center text-xs font-medium text-slate-600">Tailwind v4</span>
              </StackTechLink>

              <StackTechLink
                href="https://www.postgresql.org/"
                className="group flex flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-200 hover:shadow"
              >
                <img src="/assets/icons/color-postgresql-logo-svgrepo-com.svg" alt="" className="h-9 w-9" />
                <span className="text-center text-xs font-medium text-slate-600">PostgreSQL</span>
              </StackTechLink>

              <StackTechLink
                href="https://www.prisma.io/"
                className="group flex flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-indigo-200 hover:shadow"
              >
                <img src="/assets/icons/color-Prisma_Prisma-IndigoSymbol_0.svg" alt="" className="h-9 w-9 object-contain" />
                <span className="text-center text-xs font-medium text-slate-600">Prisma ORM</span>
              </StackTechLink>

              <StackTechLink
                href="https://github.com/SYSTRAN/faster-whisper"
                className="group flex flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow"
              >
                <img src="/assets/icons/color-Whisper_(app)_logo.svg" alt="" className="h-9 w-9" />
                <span className="text-center text-xs font-medium text-slate-600">Faster-Whisper (STT)</span>
              </StackTechLink>

              <StackTechLink
                href="https://ollama.com/library/llama3.1"
                className="group flex flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow"
              >
                <img src="/assets/icons/dark_ollama.svg" alt="" className="h-9 w-9" />
                <span className="text-center text-xs font-medium text-slate-600">Llama 3.1 8B Q6_K</span>
              </StackTechLink>

              <StackTechLink
                href="https://ollama.com/library/gemma3"
                className="group flex flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow"
              >
                <img src="/assets/icons/dark_gemma-color.svg" alt="" className="h-9 w-9" />
                <span className="text-center text-xs font-medium text-slate-600">Gemma 3 12B Q6_K</span>
              </StackTechLink>

              <StackTechLink
                href="https://github.com/QwenLM/Qwen3"
                className="group flex flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow"
              >
                <img src="/assets/icons/dark_qwen-color.svg" alt="" className="h-9 w-9" />
                <span className="text-center text-xs font-medium text-slate-600">Qwen 3.5 9B Q6_K</span>
              </StackTechLink>
            </div>
          {/* </div> */}
        {/* </div> */}
      </div>

      <section className="border-t border-slate-200 bg-slate-50 px-6 py-16 sm:py-20" aria-labelledby="metricas-titulo">
        <div className="mx-auto max-w-6xl">
          <div className="text-center">
            <p className="text-xs text-center font-semibold uppercase tracking-wide text-brand-pink">Validação</p>
            <h2 id="metricas-titulo" className="mt-2 text-2xl font-semibold tracking-tight text-brand-navy sm:text-3xl">
              Métricas e resultados
            </h2>
            <p className="mx-auto mt-4 max-w-3xl text-base leading-relaxed text-slate-600 sm:text-lg">
              Os testes a seguir estão em andamento e serão publicados nesta seção assim que concluídos.
            </p>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-700">Em breve</span>
              <h3 className="mt-4 text-lg font-semibold text-brand-navy">Latência de transcrição</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Tempo médio de resposta do Faster-Whisper em hardware local com diferentes durações de áudio.
              </p>
            </div>
            <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-700">Em breve</span>
              <h3 className="mt-4 text-lg font-semibold text-brand-navy">Precisão do RAG</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Avaliação da qualidade dos trechos recuperados frente a casos clínicos sintéticos baseados na Caderneta.
              </p>
            </div>
            <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-700">Em breve</span>
              <h3 className="mt-4 text-lg font-semibold text-brand-navy">Mitigação de alucinações</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                O sistema força a exibição da fonte exata do manual em cada resposta, permitindo verificação humana imediata.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section
        id="feedback-interesse"
        className="border-t border-slate-200 bg-slate-50 px-6 py-14 sm:py-18"
        aria-labelledby="feedback-titulo"
      >
        <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-pink">Participação</p>
          <h2 id="feedback-titulo" className="mt-2 text-xl font-semibold tracking-tight text-brand-navy sm:text-2xl">
            Sua opinião importa
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-slate-600 sm:text-base">
            Profissional de saúde, pesquisador ou avaliador: queremos ouvir críticas, sugestões e ideias para evoluir este projeto. Sua experiência é o que torna esta ferramenta relevante.
          </p>
          {feedbackFormUrl ? (
            <div className="mt-8">
              <a
                href={feedbackFormUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[3rem] items-center justify-center rounded-xl bg-brand-pink px-8 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-400 focus-visible:outline focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-pink"
              >
                Abrir formulário
              </a>
              <p className="mt-3 text-xs text-slate-500">Abre numa nova página; não precisa de conta neste site.</p>
            </div>
          ) : (
            <p className="mt-8 text-sm text-slate-600">
              O link para o formulário de feedback será adicionado em breve.
            </p>
          )}
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-brand-pink/90 py-10 text-center text-brand-navy">
        <div className="mb-5 flex justify-center gap-6">
          <a
            href="https://github.com/LucasZeD"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full p-2 opacity-90 transition hover:bg-white/30 focus-visible:outline focus-visible:ring-2 focus-visible:ring-brand-navy/30"
          >
            <img src="/assets/icons/black-github-142-svgrepo-com-black.svg" className="h-7 w-7" alt="GitHub" />
          </a>
          <a
            href="https://www.linkedin.com/in/lucas-zegrine"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full p-2 opacity-90 transition hover:bg-white/30 focus-visible:outline focus-visible:ring-2 focus-visible:ring-brand-navy/30"
          >
            <img src="/assets/icons/black-linkedin-svgrepo-com.svg" className="h-7 w-7" alt="LinkedIn" />
          </a>
        </div>
        <p className="text-sm font-semibold text-brand-navy/95">Trabalho de Conclusão de Curso · PUC Minas · Ciência da Computação</p>
      </footer>
    </div>
  )
}
