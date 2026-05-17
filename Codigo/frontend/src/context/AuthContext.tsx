import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { ReauthModal } from '../components/ReauthModal.js'
import { getApiBaseUrl } from '../lib/apiBase.js'
import {
  AUTH_TOKEN_STORAGE_KEY,
  clearStoredProfissional,
  decodeJwtPayloadUnsafe,
  loadStoredProfissional,
  saveStoredProfissional,
  type StoredProfissional,
} from '../lib/authSession.js'

type LoginState = { kind: 'idle' } | { kind: 'loading' } | { kind: 'error'; message: string }

type AuthContextValue = {
  token: string
  profissional: StoredProfissional | null
  loginState: LoginState
  login: (email: string, password: string) => Promise<boolean>
  logout: () => void
  authFetch: (path: string, init?: RequestInit) => Promise<Response>
}

function initialProfissional(): StoredProfissional | null {
  const stored = loadStoredProfissional()
  if (stored) return stored
  const t = sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY) ?? ''
  if (!t) return null
  const payload = decodeJwtPayloadUnsafe<{ email?: string }>(t)
  const email = typeof payload?.email === 'string' ? payload.email.trim() : ''
  if (email) return { nome: 'Profissional', email }
  return null
}

const AuthContext = createContext<AuthContextValue | null>(null)

type ExchangeOk = { ok: true }
type ExchangeErr = { ok: false; message: string }
type ExchangeResult = ExchangeOk | ExchangeErr

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState(() => sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY) ?? '')
  const [profissional, setProfissional] = useState<StoredProfissional | null>(initialProfissional)
  const [loginState, setLoginState] = useState<LoginState>({ kind: 'idle' })

  const [reauthOpen, setReauthOpen] = useState(false)
  const [reauthEmail, setReauthEmail] = useState('')
  const reauthWaitersRef = useRef<Array<(success: boolean) => void>>([])

  const logout = useCallback(() => {
    sessionStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
    clearStoredProfissional()
    setToken('')
    setProfissional(null)
  }, [])

  const flushReauth = useCallback((success: boolean) => {
    const waiters = reauthWaitersRef.current
    reauthWaitersRef.current = []
    setReauthOpen(false)
    for (const w of waiters) {
      w(success)
    }
  }, [])

  const exchangeCredentials = useCallback(async (email: string, password: string): Promise<ExchangeResult> => {
    const apiBase = getApiBaseUrl()
    try {
      const res = await fetch(`${apiBase}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const body = (await res.json()) as {
        access_token?: string
        profissional?: { id: string; email: string; nome: string }
        message?: string
        code?: string
      }
      if (!res.ok || typeof body.access_token !== 'string') {
        const msg = typeof body.message === 'string' ? body.message : body.code ?? `HTTP ${res.status}`
        return { ok: false, message: msg }
      }
      sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, body.access_token)
      setToken(body.access_token)
      const p = body.profissional
      if (p && typeof p.nome === 'string' && typeof p.email === 'string') {
        const profile: StoredProfissional = { nome: p.nome.trim() || 'Profissional', email: p.email.trim() }
        saveStoredProfissional(profile)
        setProfissional(profile)
      } else {
        const payload = decodeJwtPayloadUnsafe<{ email?: string }>(body.access_token)
        const em = typeof payload?.email === 'string' ? payload.email.trim() : ''
        if (em) {
          const profile: StoredProfissional = { nome: 'Profissional', email: em }
          saveStoredProfissional(profile)
          setProfissional(profile)
        } else {
          clearStoredProfissional()
          setProfissional(null)
        }
      }
      return { ok: true }
    } catch {
      return { ok: false, message: 'Falha de rede ao autenticar.' }
    }
  }, [])

  const waitForReauth = useCallback(
    (email: string): Promise<boolean> => {
      return new Promise((resolve) => {
        reauthWaitersRef.current.push(resolve)
        if (reauthWaitersRef.current.length === 1) {
          setReauthEmail(email)
          setReauthOpen(true)
        }
      })
    },
    [],
  )

  const emailForReauth = useCallback((): string | null => {
    const e = profissional?.email?.trim()
    if (e) return e
    const t = sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY) ?? token
    if (!t) return null
    const payload = decodeJwtPayloadUnsafe<{ email?: string }>(t)
    return typeof payload?.email === 'string' ? payload.email.trim() : null
  }, [profissional, token])

  const authFetch = useCallback(
    async (path: string, init?: RequestInit) => {
      const apiBase = getApiBaseUrl()
      const buildHeaders = (tok: string): Record<string, string> => {
        const headers: Record<string, string> = {
          Accept: 'application/json',
          Authorization: `Bearer ${tok}`,
          ...(init?.headers as Record<string, string> | undefined),
        }
        if (init?.body && typeof init.body === 'string' && !headers['Content-Type']) {
          headers['Content-Type'] = 'application/json'
        }
        return headers
      }

      const doFetch = (tok: string) =>
        fetch(`${apiBase}${path}`, {
          ...init,
          headers: buildHeaders(tok),
        })

      let tok = sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY) ?? token
      let res = await doFetch(tok)

      if (res.status !== 401 || path.includes('/api/v1/auth/login')) {
        return res
      }

      const em = emailForReauth()
      if (!em) {
        return res
      }

      const ok = await waitForReauth(em)
      if (!ok) {
        logout()
        return res
      }

      tok = sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY) ?? ''
      return doFetch(tok)
    },
    [token, emailForReauth, waitForReauth, logout],
  )

  const login = useCallback(
    async (email: string, password: string) => {
      setLoginState({ kind: 'loading' })
      const r = await exchangeCredentials(email, password)
      if (r.ok === false) {
        setLoginState({ kind: 'error', message: r.message })
        return false
      }
      setLoginState({ kind: 'idle' })
      return true
    },
    [exchangeCredentials],
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      profissional,
      loginState,
      login,
      logout,
      authFetch,
    }),
    [token, profissional, loginState, login, logout, authFetch],
  )

  return (
    <AuthContext.Provider value={value}>
      {children}
      <ReauthModal
        open={reauthOpen}
        email={reauthEmail}
        onCancel={() => flushReauth(false)}
        onConfirm={async (password) => {
          const r = await exchangeCredentials(reauthEmail, password)
          if (r.ok) {
            flushReauth(true)
            return true
          }
          return false
        }}
      />
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider')
  }
  return ctx
}
