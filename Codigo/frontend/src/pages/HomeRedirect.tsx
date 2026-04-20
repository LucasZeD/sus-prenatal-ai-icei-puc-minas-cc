import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.js'

export function HomeRedirect() {
  const { token } = useAuth()
  return <Navigate to={token ? '/dashboard' : '/login'} replace />
}
