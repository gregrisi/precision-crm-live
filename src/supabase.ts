import { createClient } from '@supabase/supabase-js';

// Replace the text inside the quotes with your actual keys!
const supabaseUrl = 'https://nyzrgncwnhqmmwiieagg.supabase.co';
const supabaseKey = 'sb_publishable_1UhM4PwPg3v-G1iDOHxc6g_PnwSEPsQ';

export const supabase = createClient(supabaseUrl, supabaseKey);
