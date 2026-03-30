import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://htzmyxigchqckamewzck.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0em15eGlnY2hxY2thbWV3emNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg1NzUyMzcsImV4cCI6MjA1NDE1MTIzN30.OonssaxHyYHD_qIXYLGs9YVvAh5u8iRoz2Rf-HnO8');

async function getShipment() {
    const { data, error } = await supabase
        .from('shipments')
        .select('*')
        .eq('id', '20ffa315-b59b-4a7d-84c1-817ed04364ab')
        .single();
    if (error) {
        console.error(error);
    } else {
        console.log(data);
    }
}

getShipment();
