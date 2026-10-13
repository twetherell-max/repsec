import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://yteicoluslveibiijbfh.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_gDEnKcAFgibV6k44q6xc9Q_t6253hrf'

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)