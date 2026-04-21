/**
 * Shared utility for Razorpay payments in the logistics platform.
 * Used by both internal ShipmentTracking and public TrackShipment components.
 */
import { supabase } from '../lib/supabaseClient';

const RAZORPAY_KEY = import.meta.env.VITE_RAZORPAY_KEY_ID;

/**
 * Dynamically loads the Razorpay checkout script.
 * Includes a timeout guard and up to 2 automatic retries for mobile networks.
 */
const _loadScript = (timeoutMs = 10000) =>
    new Promise((resolve) => {
        if (window.Razorpay) { resolve(true); return; }
        // Remove any stale/failed script tag before re-injecting
        const existing = document.querySelector('script[src*="checkout.razorpay.com"]');
        if (existing) existing.remove();
        const script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.async = true;
        script.crossOrigin = 'anonymous';
        let settled = false;
        const done = (val) => { if (!settled) { settled = true; resolve(val); } };
        script.onload = () => done(true);
        script.onerror = () => done(false);
        // Timeout guard — mobile networks can hang without triggering onerror
        setTimeout(() => done(false), timeoutMs);
        document.body.appendChild(script);
    });

export const loadRazorpayScript = async (retries = 2) => {
    for (let i = 0; i <= retries; i++) {
        const ok = await _loadScript(10000);
        if (ok && window.Razorpay) return true;
        if (i < retries) {
            await new Promise(r => setTimeout(r, 1500));
            delete window.Razorpay; // clear partial load
        }
    }
    return false;
};

/**
 * Opens the Razorpay payment modal and handles the transaction lifecycle
 * 
 * @param {Object} shipment - The shipment object
 * @param {Number} amount - Amount in INR
 * @param {Function} onSuccess - Callback on successful payment
 * @param {Function} onError - Callback on payment failure or error
 */
export const openRazorpay = async (shipment, amount, onSuccess, onError) => {
    if (!RAZORPAY_KEY) {
        onError?.('Razorpay Key ID is not configured in environment variables.');
        return;
    }

    const isLoaded = await loadRazorpayScript();
    if (!isLoaded) {
        onError?.('Failed to load Razorpay SDK. Please check your internet connection.');
        return;
    }

    const options = {
        key: RAZORPAY_KEY,
        amount: Math.round(parseFloat(amount) * 100), // Amount in paise
        currency: 'INR',
        name: 'Logistics Payment',
        description: `Freight for shipment ${shipment.shipment_no || shipment.id}`,
        handler: async (response) => {
            try {
                /* Insert payment record */
                const { error: insErr } = await supabase.from('payments').insert([{
                    shipment_id: shipment.id,
                    razorpay_payment_id: response.razorpay_payment_id,
                    razorpay_order_id: response.razorpay_order_id || null,
                    amount: parseFloat(amount),
                    currency: 'INR',
                    status: 'paid',
                    paid_at: new Date().toISOString(),
                }]);
                
                if (insErr) {
                    console.error('Insert payment error:', insErr);
                    onError?.(`Payment captured but record keeping failed: ${insErr.message}`);
                    return;
                }

                /* Update shipment payment_status */
                const { error: updErr } = await supabase
                    .from('shipments')
                    .update({ payment_status: 'paid' })
                    .eq('id', shipment.id);

                if (updErr) {
                    console.error('Update shipment error:', updErr);
                    onError?.(`Status update failed: ${updErr.message}`);
                } else {
                    onSuccess?.(response.razorpay_payment_id);
                }
            } catch (err) {
                console.error('Post-payment error:', err);
                onError?.(`Post-payment error: ${err.message}`);
            }
        },
        prefill: {
            name: shipment.client || '',
            email: '',
            contact: ''
        },
        notes: {
            shipment_no: shipment.shipment_no || '',
            job_no: shipment.job_no || ''
        },
        theme: {
            color: '#6366f1'
        },
        modal: {
            ondismiss: () => {
                onError?.('Payment window closed before completion.');
            },
        },
    };

    const rzp = new window.Razorpay(options);
    rzp.on('payment.failed', (resp) => {
        console.error('Razorpay payment.failed:', resp.error);
        onError?.(`Payment failed: ${resp.error.description}`);
    });
    rzp.open();
};
