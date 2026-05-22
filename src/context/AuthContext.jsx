import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user || null)
      if (data.session?.user) loadProfile(data.session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null)
      if (session?.user) loadProfile(session.user.id)
      else { setProfile(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function loadProfile(userId) {
    const { data, error } = await supabase
      .from('profiles').select('*').eq('id', userId).single()
    if (!error) setProfile(data)
    setLoading(false)
  }

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    setTimeout(() => logAction('login', null, null, { email }), 500)
    return data
  }

  async function signOut() {
    await logAction('logout', null, null, null)
    await supabase.auth.signOut()
  }

  async function logAction(action, resource, resourceId, details) {
    const currentUser = (await supabase.auth.getUser()).data.user
    if (!currentUser) return
    try {
      await supabase.from('audit_logs').insert([{
        user_id: currentUser.id,
        user_email: currentUser.email,
        action,
        resource,
        resource_id: resourceId ? String(resourceId) : null,
        details: details || null,
        user_agent: navigator.userAgent,
      }])
    } catch (err) {
      console.warn('Failed to log:', err)
    }
  }

  const isAdmin = profile?.role === 'admin'

  return (
    <AuthContext.Provider value={{ user, profile, loading, isAdmin, signIn, signOut, logAction }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}
