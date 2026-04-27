import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.js'
import { getApiBaseUrl } from '../lib/apiBase.js'

export function LandingPage() {
  const { login, loginState, token } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard'

  // Se já estiver logado, redireciona magicamente pro Dashboard
  useEffect(() => {
    if (token) navigate(from, { replace: true })
  }, [token, navigate, from])

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const apiBase = getApiBaseUrl()

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const ok = await login(email, password)
    if (ok) {
      navigate(from, { replace: true })
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* SECTION 1: HERO & LOGIN */}
      <div className="flex w-full flex-col md:flex-row min-h-screen bg-white">
        
        {/* Lado Esquerdo - Info e Form */}
        <div className="flex w-full flex-col justify-center px-8 py-12 md:w-1/2 lg:px-24 xl:px-32 relative z-10 bg-white">
          <div className="mx-auto w-full max-w-md">
            <div className="flex items-center gap-3">
              <img src="/assets/imagem_logo_transparente.png" alt="Pré-natal Digital Logo" className="h-10 w-10 object-contain drop-shadow-sm" />
              <h1 className="text-2xl font-black tracking-tight text-brand-navy">Pré-Natal Digital</h1>
            </div>

            <div className="mt-10">
              <h2 className="text-4xl font-black tracking-tight text-brand-navy sm:text-5xl leading-tight">
                Inteligência <span className="text-brand-pink">Artificial</span> para a Saúde Materna
              </h2>
              <p className="mt-4 text-lg text-slate-600 leading-relaxed font-medium">
                Uma solução arquitetural do TCC da PUC-Minas integrando LLMs locais, reconhecimento de voz e dados seguros.
              </p>
            </div>

            <div className="mt-10 rounded-3xl border border-slate-100 bg-white p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
              <h2 className="text-lg font-black text-brand-navy">Acesso Profissional</h2>
              <p className="mt-1 text-sm text-slate-500 font-medium">Insira suas credenciais seguras para teste do MVP.</p>

              <form className="mt-6 flex flex-col gap-4" onSubmit={(e) => void onSubmit(e)}>
                <label className="text-sm font-bold text-slate-700">
                  E-mail institucional
                  <input
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-1.5 block w-full rounded-2xl border-0 py-3 px-4 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-brand-pink focus:bg-brand-pink/5 transition-colors sm:text-sm font-medium"
                    placeholder="medica@unidade.gov.br"
                    required
                  />
                </label>
                <label className="text-sm font-bold text-slate-700">
                  Senha
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-1.5 block w-full rounded-2xl border-0 py-3 px-4 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-brand-pink focus:bg-brand-pink/5 transition-colors sm:text-sm font-medium"
                    required
                  />
                </label>
                <div className="mt-2">
                  <button
                    type="submit"
                    disabled={loginState.kind === 'loading'}
                    className="flex w-full items-center justify-center rounded-2xl bg-brand-pink px-4 py-3.5 text-sm font-black text-white shadow-[0_4px_14px_0_rgba(251,160,167,0.39)] hover:bg-rose-400 hover:shadow-[0_6px_20px_rgba(251,160,167,0.23)] hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-pink disabled:opacity-60 disabled:hover:translate-y-0 transition-all uppercase tracking-wider"
                  >
                    {loginState.kind === 'loading' ? 'Autenticando...' : 'Entrar'}
                  </button>
                </div>
                {loginState.kind === 'error' ? (
                  <div className="mt-2 text-sm text-red-600 bg-red-50 p-4 rounded-xl border border-red-100 font-bold">{loginState.message}</div>
                ) : null}
              </form>
            </div>
            
            <p className="mt-8 text-center text-xs text-slate-400 font-medium">
              Arquitetura Zero-Trust • Conexão Local <span className="font-mono bg-slate-100 px-2 py-0.5 rounded ml-1">{apiBase}</span>
            </p>
            
            <div className="mt-12 flex items-center justify-center animate-bounce text-slate-300">
               <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
               </svg>
            </div>
          </div>
        </div>

        {/* Lado Direito - Ilustração (Usando Asset Fornecido) */}
        <div className="relative hidden w-1/2 bg-rose-50/30 md:flex flex-col items-center justify-center border-l border-brand-pink/10 overflow-hidden">
           {/* Decorative Blobs */}
          <div className="absolute top-0 right-0 -mr-20 -mt-20 w-[40rem] h-[40rem] rounded-full bg-gradient-to-br from-brand-pink/20 to-rose-300/30 blur-3xl mix-blend-multiply"></div>
          <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-[30rem] h-[30rem] rounded-full bg-gradient-to-tr from-brand-pink/20 to-rose-400/20 blur-3xl mix-blend-multiply"></div>

          <div className="relative z-10 w-full max-w-lg rounded-[2.5rem] border border-brand-pink/10 bg-white/40 shadow-2xl backdrop-blur-md mx-12 overflow-hidden flex items-center justify-center">
            <img src="/assets/imagem_logo.png" alt="Plataforma Integrada SUS" className="w-full h-auto object-cover opacity-90 transition-transform duration-700 hover:scale-[1.02]" />
          </div>
        </div>
      </div>

      {/* SECTION 2: TECNOLOGIAS E ARQUITETURA */}
      <div className="py-24 bg-slate-50 border-t border-slate-200">
         <div className="max-w-6xl mx-auto px-6">
            
            <div className="text-center mb-16">
               <span className="text-sm font-black text-brand-pink tracking-widest uppercase mb-3 block">Arquitetura de Software</span>
               <h2 className="text-3xl sm:text-4xl font-black text-brand-navy tracking-tight">Privacidade by Design & Zero Trust</h2>
               <p className="mt-4 text-lg text-slate-500 max-w-2xl mx-auto font-medium">Apresentando os módulos de inteligência criados para o projeto de Trabalho de Conclusão de Curso visando o contexto público municipal.</p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
               
               <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm flex flex-col items-start gap-4 hover:-translate-y-1 hover:shadow-xl transition-all duration-300">
                  <div className="h-16 w-16 p-3 rounded-2xl bg-brand-pink/5 border border-brand-pink/20 flex items-center justify-center">
                     <img src="/assets/icons/color-Whisper_(app)_logo.svg" alt="Whisper Icon" className="w-full h-full object-contain" />
                  </div>
                  <h3 className="text-xl font-black text-brand-navy mt-2">Escriba Digital</h3>
                  <p className="text-slate-500 text-sm leading-relaxed font-medium">
                     Transcreve diálogos da consulta em tempo real (OpenAI Whisper) e utiliza LLMs parametrizados (RAG) para preenchimento estruturado da Caderneta da Gestante.
                  </p>
               </div>
               
               <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm flex flex-col items-start gap-4 hover:-translate-y-1 hover:shadow-xl transition-all duration-300">
                  <div className="h-16 w-16 p-3 rounded-2xl bg-brand-navy/5 border border-brand-navy/10 flex items-center justify-center">
                     <img src="/assets/icons/color-gemini-color.svg" alt="Gemini Icon" className="w-full h-full object-contain drop-shadow" />
                  </div>
                  <h3 className="text-xl font-black text-brand-navy mt-2">LívIA Assistant</h3>
                  <p className="text-slate-500 text-sm leading-relaxed font-medium">
                     Agente de segunda opinião médica integrado ao dashboard. Responde a dúvidas clínicas em segundos, analisa riscos a partir de Mapeamentos DER e mantém histórico.
                  </p>
               </div>
               
               <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm flex flex-col items-start gap-4 hover:-translate-y-1 hover:shadow-xl transition-all duration-300">
                  <div className="h-16 w-16 p-3 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center">
                     <img src="/assets/icons/pink-personal-data-security-interface-symbol-svgrepo-com.svg" alt="Security Icon" className="w-full h-full object-contain opacity-80" />
                  </div>
                  <h3 className="text-xl font-black text-brand-navy mt-2">Agente Integrado</h3>
                  <p className="text-slate-500 text-sm leading-relaxed font-medium">
                     Agentes que expandem a visão arquitetural para a triagem remota de pacientes utilizando interfaces conversacionais limpas focadas em dados abertos sem fricção.
                  </p>
               </div>
               
            </div>

            <div className="mt-20 border-t border-slate-200 pt-16">
                <div className="text-center mb-12">
                   <h3 className="text-2xl font-black text-brand-navy tracking-tight">Stack Tecnológico Oficial & Modelos Locais</h3>
                   <p className="mt-3 text-slate-500 max-w-xl mx-auto font-medium text-sm">Tecnologias modulares de ponta viabilizando uma arquitetura de IA segura, utilizando LLMs embarcados e Zero-Trust.</p>
                </div>

                <div className="flex flex-wrap justify-center gap-4 max-w-6xl mx-auto px-4">

                  <div className="flex flex-wrap justify-center gap-4">
                    {/* Frontend */}
                   <div className="flex flex-col items-center justify-center gap-3 p-5 bg-white border border-slate-200 rounded-3xl shadow-sm hover:shadow-md hover:-translate-y-1 hover:border-sky-200 transition-all cursor-default">
                      <img src="/assets/icons/black-nextjs-icon-svgrepo-com.svg" alt="React" className="h-10 w-10 opacity-80" />
                      <span className="text-xs font-bold text-slate-600 text-center">React / Vite</span>
                   </div>
                   
                   <div className="flex flex-col items-center justify-center gap-3 p-5 bg-white border border-slate-200 rounded-3xl shadow-sm hover:shadow-md hover:-translate-y-1 hover:border-sky-300 transition-all cursor-default">
                      <img src="/assets/icons/blue_tailwind-css-svgrepo-com.svg" alt="Tailwind" className="h-10 w-10 drop-shadow-sm" />
                      <span className="text-xs font-bold text-slate-600 text-center">Tailwind v4</span>
                   </div>

                   {/* Database */}
                   <div className="flex flex-col items-center justify-center gap-3 p-5 bg-white border border-slate-200 rounded-3xl shadow-sm hover:shadow-md hover:-translate-y-1 hover:border-blue-300 transition-all cursor-default">
                      <img src="/assets/icons/color-postgresql-logo-svgrepo-com.svg" alt="Postgres" className="h-10 w-10" />
                      <span className="text-xs font-bold text-slate-600 text-center">PostgreSQL</span>
                   </div>
                   
                   <div className="flex flex-col items-center justify-center gap-3 p-5 bg-white border border-slate-200 rounded-3xl shadow-sm hover:shadow-md hover:-translate-y-1 hover:border-indigo-300 transition-all cursor-default">
                      <img src="/assets/icons/color-Prisma_Prisma-IndigoSymbol_0.svg" alt="Prisma" className="h-10 w-10 object-contain drop-shadow-sm" />
                      <span className="text-xs font-bold text-slate-600 text-center">Prisma ORM</span>
                   </div>
                  </div>

                  {/* Linha 2: IA Ecosystem (Forçada para baixo) */}
                  <div className="flex flex-wrap justify-center gap-4">
                    {/* AI Ecosystem */}
                    <div  className="flex flex-col items-center justify-center gap-3 p-5 bg-white border border-slate-200 rounded-3xl shadow-sm hover:shadow-md hover:-translate-y-1 hover:border-slate-800 transition-all cursor-default relative overflow-hidden group">
                        <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-900 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <img src="/assets/icons/light_langchain-color.svg" alt="LangChain" className="h-10 w-10 relative z-10 group-hover:invert transition-all" />
                        <span className="text-xs font-bold text-slate-600 group-hover:text-white relative z-10 text-center transition-all"><a href="https://www.langchain.com/" target="_blank" rel="noopener noreferrer">LangChain</a></span>
                    </div>
                    <div className="flex flex-col items-center justify-center gap-3 p-5 bg-white border border-slate-200 rounded-3xl shadow-sm hover:shadow-md hover:-translate-y-1 hover:border-slate-800 transition-all cursor-default relative overflow-hidden group">
                        <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-900 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <img src="/assets/icons/color-Whisper_(app)_logo.svg" alt="Faster-Whisper" className="h-10 w-10 relative z-10 group-hover:invert transition-all" />
                        <span className="text-xs font-bold text-slate-600 group-hover:text-white relative z-10 text-center transition-all"><a href="https://pypi.org/project/faster-whisper/0.3.0/" target="_blank" rel="noopener noreferrer">Faster-Whisper (STT)</a></span>
                    </div>

                    {/* Local Models */}
                    <div className="flex flex-col items-center justify-center gap-3 p-5 bg-white border border-slate-200 rounded-3xl shadow-sm hover:shadow-md hover:-translate-y-1 hover:border-slate-800 transition-all cursor-default relative overflow-hidden group">
                        <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-900 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <img src="/assets/icons/dark_ollama.svg" alt="Ollama" className="h-10 w-10 relative z-10 group-hover:invert transition-all" />
                        <span className="text-xs font-bold text-slate-600 group-hover:text-white relative z-10 text-center transition-all"><a href="https://ollama.com/library/llama3.1" target="_blank" rel="noopener noreferrer">Llama 3.1 8B Q6_K</a></span>
                    </div>
                    <div className="flex flex-col items-center justify-center gap-3 p-5 bg-white border border-slate-200 rounded-3xl shadow-sm hover:shadow-md hover:-translate-y-1 hover:border-slate-800 transition-all cursor-default relative overflow-hidden group">
                        <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-900 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <img src="/assets/icons/dark_gemma-color.svg" alt="Gemma" className="h-10 w-10 relative z-10 group-hover:invert transition-all" />
                        <span className="text-xs font-bold text-slate-600 group-hover:text-white relative z-10 text-center transition-all"><a href="https://ollama.com/library/gemma3" target="_blank" rel="noopener noreferrer">Gemma 3 12B Q6_K</a></span>
                    </div>
                    <div className="flex flex-col items-center justify-center gap-3 p-5 bg-white border border-slate-200 rounded-3xl shadow-sm hover:shadow-md hover:-translate-y-1 hover:border-slate-800 transition-all cursor-default relative overflow-hidden group">
                        <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-900 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <img src="/assets/icons/dark_qwen-color.svg" alt="Qwen" className="h-10 w-10 relative z-10 group-hover:invert transition-all" />
                        <span className="text-xs font-bold text-slate-600 group-hover:text-white relative z-10 text-center transition-all"><a href="https://qwen.ai/blog?id=qwen3.5" target="_blank" rel="noopener noreferrer">Qwen 3.5 9B Q6_K</a></span>
                    </div>
                  </div>
                   
                   

                   
                </div>
            </div>
         </div>
      </div>
      
      <footer className="py-8 bg-brand-navy border-t border-brand-navy/90 text-center">
          <div className="flex justify-center gap-6 mb-4">
             <a href="https://github.com/LucasZeD" target="_blank" className="opacity-50 hover:opacity-100 transition-opacity"><img src="/assets/icons/white-github-142-svgrepo-com-white.svg" className="h-6 w-6" alt="GitHub" /></a>
             <a href="www.linkedin.com/in/lucas-zegrine" target="_blank" className="opacity-50 hover:opacity-100 transition-opacity"><img src="/assets/icons/white-linkedin-svgrepo-com.svg" className="h-6 w-6" alt="LinkedIn" /></a>
          </div>
          <p className="text-sm font-bold text-slate-400">TCC PUC-Minas • Engenharia de Software</p>
      </footer>
    </div>
  )
}
