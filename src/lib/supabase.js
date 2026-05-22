import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('VITE_SUPABASE_URL:', supabaseUrl ? '✓' : '✗ missing')
  console.error('VITE_SUPABASE_ANON_KEY:', supabaseAnonKey ? '✓' : '✗ missing')
  throw new Error('Missing Supabase config in .env.local')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
console.log('[supabase] Connected:', supabaseUrl)
