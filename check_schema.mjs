import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://polished-scene-7169.prudata-tech.workers.dev', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0em15eGlnY2hxY2thbWV3emNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg1NzUyMzcsImV4cCI6MjA1NDE1MTIzN30.OonssaxHyYHD_qIXYLGs9YVvAh5u8iRoz2Rf-HnO8');

async function checkSchema() {
    const { data: cols, error: colErr } = await supabase
        .from('shipments')
        .select('*')
        .limit(1);

    if (colErr) {
        console.error('Error fetching columns:', colErr);
        return;
    }

    if (cols && cols.length > 0) {
        console.log('Columns in shipments table:', Object.keys(cols[0]));
        console.log('Sample data:', cols[0]);
    } else {
        console.log('Table is empty.');
    }
}

checkSchema();
