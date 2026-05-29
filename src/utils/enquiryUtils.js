import { supabase } from '../lib/supabaseClient';

/**
 * Fetches the next sequential enquiry number globally.
 * Format: ENQ-YYYY-MM-XXX (e.g. ENQ-2026-05-001)
 * The sequence (XXX) continuously increments across months.
 */
export const fetchNextEnquiryNumber = async () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const prefix = `ENQ-${year}-${month}-`;

  try {
    const { data, error } = await supabase
      .from('job_enquiries')
      .select('enquiry_no')
      .not('enquiry_no', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error('Error fetching enquiry number sequence:', error);
      return `${prefix}001`;
    }

    if (data && data.length > 0 && data[0].enquiry_no) {
      const lastNo = data[0].enquiry_no;
      // Expected format: ENQ-YYYY-MM-XXX
      const parts = lastNo.split('-');
      if (parts.length >= 4) {
        const sequenceStr = parts[parts.length - 1];
        const sequenceNum = parseInt(sequenceStr, 10);

        if (!isNaN(sequenceNum)) {
          const nextSequence = sequenceNum + 1;
          return `${prefix}${String(nextSequence).padStart(3, '0')}`;
        }
      }
    }

    return `${prefix}001`;
  } catch (err) {
    console.error('Unexpected error in fetchNextEnquiryNumber:', err);
    return `${prefix}001`;
  }
};
