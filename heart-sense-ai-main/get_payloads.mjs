import { createClient } from '@supabase/supabase-js';

// Setup matching the frontend
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    const { data, error } = await supabase
        .from('analysis_payloads')
        .select('id, created_at, patient_id')
        .order('created_at', { ascending: false })
        .limit(5);

    if (error) {
        console.error("Error fetching payloads:", error);
        process.exit(1);
    }

    console.log(JSON.stringify(data, null, 2));
}

main();
