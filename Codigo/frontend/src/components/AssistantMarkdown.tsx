import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/** Compact prose-like styles without @tailwindcss/typography (Livia chat + DevTools). */
const mdShell =
  'leading-relaxed text-slate-800 ' +
  '[&_p]:mb-3 [&_p:last-child]:mb-0 ' +
  '[&_strong]:font-semibold [&_b]:font-semibold [&_em]:italic ' +
  '[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 ' +
  '[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 ' +
  '[&_li]:my-1 [&_li]:pl-0.5 ' +
  '[&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-lg [&_h1]:font-bold [&_h1]:text-slate-900 ' +
  '[&_h2]:mt-3 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-slate-900 ' +
  '[&_h3]:mt-2 [&_h3]:mb-1 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-slate-900 ' +
  '[&_a]:text-rose-600 [&_a]:underline [&_a]:break-words ' +
  '[&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[0.8em] ' +
  '[&_pre]:my-2 [&_pre]:max-h-52 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-slate-900 [&_pre]:p-3 [&_pre]:text-xs [&_pre]:text-slate-100 ' +
  '[&_blockquote]:my-2 [&_blockquote]:border-l-4 [&_blockquote]:border-rose-200 [&_blockquote]:pl-3 [&_blockquote]:text-slate-700 ' +
  '[&_hr]:my-4 [&_hr]:border-slate-200 [&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-slate-200 [&_th]:bg-slate-50 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_td]:border [&_td]:border-slate-200 [&_td]:px-2 [&_td]:py-1'

type AssistantMarkdownProps = {
  markdown: string
  className?: string
}

export function AssistantMarkdown({ markdown, className = '' }: AssistantMarkdownProps) {
  const src = markdown.trim()
  if (!src) return null
  return (
    <div className={`${mdShell} ${className}`.trim()}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
    </div>
  )
}
