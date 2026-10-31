
import { useState, type FormEvent } from 'react'
import { ShieldCheck, Eye, EyeOff } from 'lucide-react'
import { apiRequest } from '../lib/api'

type AuthResponse = {
  success: boolean
  message?: string
  token?: string
  data?: {
    token?: string
    user?: {
      id: string
      name: string
      email: string
      role: string
    }
    name?: string
    email?: string
    role?: string
  }
  user?: {
    id: string
    name: string
    email: string
    role: string
  }
}

type AuthProps = {
  onAuthenticated: (token: string, user: NonNullable<AuthResponse['user']>) => void
}

export default function Auth({ onAuthenticated }: AuthProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    if (mode === 'register' && name.trim().length < 2) {
      setError('Please enter your full name.')
      return
    }

    if (password.length < 8) {
      setError('Password must contain at least 8 characters.')
      return
    }

    setLoading(true)

    try {
      const endpoint =
        mode === 'login' ? '/auth/login' : '/auth/register'

      const body = mode === 'login'
        ? { email: email.trim(), password }
        : { name: name.trim(), email: email.trim(), password }

      const response = await apiRequest<AuthResponse>(endpoint, {
        method: 'POST',
        body: JSON.stringify(body),
      })

      // Registration creates the account; the user can then log in.
      if (mode === 'register') {
        setMode('login')
        setPassword('')
        setError('')
        return
      }

      const token = response.token ?? response.data?.token
      const user = response.user ?? response.data?.user

      if (!token || !user) {
        throw new Error(
          'Login succeeded, but the response format was unexpected.'
        )
      }

      onAuthenticated(token, user)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Authentication failed.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-brand">
          <div className="auth-brand-icon">
            <ShieldCheck size={25} />
          </div>
          <span className="brand-name">trust<span>cart</span></span>
        </div>

        <p className="auth-eyebrow">SHOP WITH CONFIDENCE</p>
        <h1>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
        <p className="auth-description">
          {mode === 'login'
            ? 'Sign in to track orders and manage your shopping.'
            : 'Join TrustCart for clearer orders and support.'}
        </p>

        <div className="auth-tabs">
          <button
            type="button"
            className={mode === 'login' ? 'selected' : ''}
            onClick={() => { setMode('login'); setError('') }}
          >
            Sign in
          </button>
          <button
            type="button"
            className={mode === 'register' ? 'selected' : ''}
            onClick={() => { setMode('register'); setError('') }}
          >
            Create account
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {mode === 'register' && (
            <label className="auth-field">
              Full name
              <input
                value={name}
                onChange={event => setName(event.target.value)}
                placeholder="Enter your name"
                autoComplete="name"
                required
              />
            </label>
          )}

          <label className="auth-field">
            Email address
            <input
              type="email"
              value={email}
              onChange={event => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </label>

          <label className="auth-field">
            Password
            <span className="auth-password-wrap">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={event => setPassword(event.target.value)}
                placeholder="At least 8 characters"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                minLength={8}
                maxLength={72}
                required
              />
              <button
                type="button"
                className="auth-password-toggle"
                onClick={() => setShowPassword(value => !value)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </span>
          </label>

          {error && <p className="auth-error" role="alert">{error}</p>}

          <button className="auth-submit" type="submit" disabled={loading}>
            {loading
              ? 'Please wait...'
              : mode === 'login' ? 'Sign in securely' : 'Create account'}
          </button>
        </form>

        <p className="auth-footer">
          <ShieldCheck size={15} />
          Your account information is handled securely.
        </p>
      </section>
    </main>
  )
}
