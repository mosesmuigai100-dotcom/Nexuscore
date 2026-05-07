// api/check-plan.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const FREE_AI_LIMIT = 3;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const email = req.method === 'GET'
    ? req.query.email
    : req.body?.email;

  if (!email) return res.status(400).json({ error: 'Email required' });

  try {
    const { data: sub } = await supabase
      .from('nc_subscriptions')
      .select('plan, status, expires_at')
      .eq('email', email)
      .single();

    const now = new Date();
    const isPro = sub &&
      sub.plan === 'pro' &&
      sub.status === 'active' &&
      (!sub.expires_at || new Date(sub.expires_at) > now);

    const today = now.toISOString().split('T')[0];
    let aiUsageToday = 0;
    let aiLeft = isPro ? 999 : FREE_AI_LIMIT;

    if (!isPro) {
      const { data: usage } = await supabase
        .from('nc_ai_usage')
        .select('message_count')
        .eq('email', email)
        .eq('usage_date', today)
        .single();

      aiUsageToday = usage?.message_count || 0;
      aiLeft = Math.max(0, FREE_AI_LIMIT - aiUsageToday);
    }

    return res.status(200).json({
      plan: isPro ? 'pro' : 'free',
      isPro,
      aiLeft,
      aiUsageToday,
      aiDailyLimit: FREE_AI_LIMIT,
      expiresAt: sub?.expires_at || null,
    });

  } catch (err) {
    console.error('check-plan error:', err);
    return res.status(500).json({ error: err.message });
  }
      }
