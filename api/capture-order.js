// api/capture-order.js
// Vercel Serverless Function — Captures payment & activates Pro in Supabase

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { orderId, email } = req.body || {};
  if (!orderId || !email) return res.status(400).json({ error: 'orderId and email required' });

  const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
  const PAYPAL_SECRET    = process.env.PAYPAL_SECRET;
  const PAYPAL_BASE      = process.env.PAYPAL_ENV === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';

  try {
    const tokenRes = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error('PayPal auth failed');

    const captureRes = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Content-Type': 'application/json',
      },
    });
    const captureData = await captureRes.json();

    if (captureData.status !== 'COMPLETED') {
      throw new Error(`Payment not completed: ${captureData.status}`);
    }

    const capture = captureData.purchase_units?.[0]?.payments?.captures?.[0];
    const payerId = captureData.payer?.payer_id;
    const amount  = parseFloat(capture?.amount?.value || '3.00');

    await supabase.from('nc_users').upsert(
      { email, updated_at: new Date().toISOString() },
      { onConflict: 'email', ignoreDuplicates: false }
    );

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const { error: subError } = await supabase.from('nc_subscriptions').upsert({
      email,
      plan: 'pro',
      status: 'active',
      paypal_order_id: orderId,
      paypal_payer_id: payerId,
      amount_usd: amount,
      currency: 'USD',
      started_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'email' });

    if (subError) throw new Error(`Supabase sub error: ${subError.message}`);

    await supabase.from('nc_payments').insert({
      email,
      paypal_order_id: orderId,
      paypal_payer_id: payerId,
      amount_usd: amount,
      status: 'completed',
      plan: 'pro',
    });

    return res.status(200).json({
      success: true,
      plan: 'pro',
      email,
      expiresAt: expiresAt.toISOString(),
      amount,
      message: 'Pro plan activated successfully!',
    });

  } catch (err) {
    console.error('capture-order error:', err);
    try {
      await supabase.from('nc_payments').insert({
        email,
        paypal_order_id: orderId,
        amount_usd: 0,
        status: 'failed',
        plan: 'pro',
      });
    } catch (_) {}
    return res.status(500).json({ error: err.message });
  }
    }
