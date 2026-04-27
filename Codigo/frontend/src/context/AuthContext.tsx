import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { getApiBaseUrl } from '../lib/apiBase.js'
import { AUTH_TOKEN_STORAGE_KEY } from '../lib/authSession.js'

type LoginState = { kind: 'idle' } | { kind: 'loading' } | { kind: 'error'; message: string }

type AuthContextValue = {
  token: string
  loginState: LoginState
  login: (email: string, password: string) => Promise<boolean>
  logout: () => void
  authFetch: (path: string, init?: RequestInit) => Promise<Response>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState(() => sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY) ?? '')
  const [loginState, setLoginState] = useState<LoginState>({ kind: 'idle' })

  const logout = useCallback(() => {
    sessionStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
    setToken('')
  }, [])

  const authFetch = useCallback(
    async (path: string, init?: RequestInit) => {
      const headers: Record<string, string> = {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        ...(init?.headers as Record<string, string> | undefined),
      }
      if (init?.body && typeof init.body === 'string' && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json'
      }
      const apiBase = getApiBaseUrl()
      return fetch(`${apiBase}${path}`, { ...init, headers })
    },
    [token],
  )

  const login = useCallback(async (email: string, password: string) => {
    setLoginState({ kind: 'loading' })
    const apiBase = getApiBaseUrl()
    try {
      const res = await fetch(`${apiBase}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const body = (await res.json()) as { access_token?: string; message?: string; code?: string }
      if (!res.ok || typeof body.access_token !== 'string') {
        const msg = typeof body.message === 'string' ? body.message : body.code ?? `HTTP ${res.status}`
        setLoginState({ kind: 'error', message: msg })
        return false
      }
      sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, body.access_token)
      setToken(body.access_token)
      setLoginState({ kind: 'idle' })
      return true
    } catch {
      setLoginState({ kind: 'error', message: 'Falha de rede ao autenticar.' })
      return false
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      loginState,
      login,
      logout,
      authFetch,
    }),
    [token, loginState, login, logout, authFetch],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider')
  }
  return ctx
}
