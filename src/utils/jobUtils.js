import { supabase } from '../lib/supabaseClient';
import { getServerDate } from './serverDate';

/**
 * Fetches the next sequential job number globally.
 * Format: YYYY-MM-XXX (e.g. 2026-05-001)
 * The sequence (XXX) continuously increments across months.
 * Uses server time (internet date) instead of local system clock.
 */
export const fetchNextJobNumber = async () => {
  const date = await getServerDate();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const prefix = `${year}-${month}-`;

  try {
    // Query Supabase for the most recently created job to get the global highest sequence
    const { data, error } = await supabase
      .from('jobs')
      .select('job_no')
      .not('job_no', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error('Error fetching job number sequence:', error);
      return `${prefix}001`; // Fallback to 001 if error
    }

    if (data && data.length > 0 && data[0].job_no) {
      const lastJobNo = data[0].job_no;
      // We expect format like YYYY-MM-XXX, so we split by '-' and take the last part
      const parts = lastJobNo.split('-');
      if (parts.length >= 3) {
        const sequenceStr = parts[parts.length - 1];
        const sequenceNum = parseInt(sequenceStr, 10);
        
        if (!isNaN(sequenceNum)) {
          const nextSequence = sequenceNum + 1;
          // Pad with zeros (e.g., 1 -> 001, 12 -> 012)
          return `${prefix}${String(nextSequence).padStart(3, '0')}`;
        }
      }
    }

    // If no valid jobs exist yet, start at 001
    return `${prefix}001`;
  } catch (err) {
    console.error('Unexpected error in fetchNextJobNumber:', err);
    return `${prefix}001`; // Fallback
  }
};
