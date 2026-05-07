// api/create-order.js
// Vercel Serverless Function — Creates a PayPal order

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
  const PAYPAL_SECRET    = process.env.PAYPAL_SECRET;
  const PAYPAL_BASE      = process.env.PAYPAL_ENV === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';

  try {
    // 1. Get PayPal access token
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

    // 2. Create the order
    const orderRes = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          amount: {
            currency_code: 'USD',
            value: '3.00',
          },
          description: 'NexusCore Pro — Monthly Subscription',
        }],
      }),
    });
    const orderData = await orderRes.json();

    if (!orderData.id) throw new Error('Failed to create PayPal order');

    return res.status(200).json({ orderId: orderData.id });

  } catch (err) {
    console.error('create-order error:', err);
    return res.status(500).json({ error: err.message });
  }
}
