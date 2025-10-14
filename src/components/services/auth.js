import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://xooblfykojmvtblrwlhh.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhvb2JsZnlrb2ptdnRibHJ3bGhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAyNzQ2NTAsImV4cCI6MjA3NTg1MDY1MH0.LTqlR7xEP69k4c2HYUU0K8L1eOPZIDsRMi6iUn7P1LA';


const supabase = createClient(supabaseUrl, supabaseKey);

export default supabase;