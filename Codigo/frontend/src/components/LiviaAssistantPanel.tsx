const SUGESTOES = [
  'Resumo do risco desta gestação',
  'Conduta para PA elevada (protocolo MS)',
  'Critérios de encaminhamento obstétrico',
]

export function LiviaAssistantPanel({ className = '' }: { className?: string }) {
  return (
    <div className={`flex h-full flex-col ${className}`}>
      <div className="flex h-[4.5rem] items-center border-b border-rose-100 bg-rose-50/30 px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-rose-400 to-rose-600 text-white shadow-sm shadow-rose-200">
            ✨
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">Assistente Lívia</h2>
            <p className="text-[11px] font-medium tracking-wide text-rose-600">RAG + Protocolos MS</p>
          </div>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-6 flex flex-col justify-end bg-gradient-to-b from-transparent to-rose-50/20">
        <div className="space-y-4">
          <div className="mb-6 rounded-2xl rounded-tl-sm bg-white p-4 shadow-sm border border-slate-100">
            <p className="text-sm text-slate-700 leading-relaxed">
              Olá! Sou a Lívia. Posso ajudar a buscar protocolos no Ministério da Saúde e sumarizar o risco gestacional com base nos dados que você coletar no prontuário.
            </p>
          </div>
          
          <div>
            <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 pl-1">Sugestões rápidas</p>
            <ul className="flex flex-wrap gap-2">
              {SUGESTOES.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    disabled
                    className="rounded-full border border-rose-200 bg-white px-4 py-2 text-[13px] font-medium text-rose-700 shadow-sm transition-colors hover:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
                    title="Função de IA em andamento"
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      
      <div className="border-t border-rose-100 bg-white p-4">
        <div className="relative">
          <input
            type="text"
            disabled
            placeholder="Pergunte algo à Lívia..."
            className="block w-full rounded-2xl border-0 py-3 pl-4 pr-12 text-slate-900 ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-rose-500 sm:text-sm sm:leading-6 disabled:bg-slate-50 disabled:opacity-70"
          />
          <button className="absolute right-2 top-2 rounded-xl bg-rose-500 p-1.5 text-white shadow-sm disabled:opacity-50">
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.289z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
