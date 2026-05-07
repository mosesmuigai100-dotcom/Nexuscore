// api/track-ai.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const FREE_AI_LIMIT = 3;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email required' });

  try {
    const { data: sub } = await supabase
      .from('nc_subscriptions')
      .select('plan, status, expires_at')
      .eq('email', email)
      .single();

    const isPro = sub &&
      sub.plan === 'pro' &&
      sub.status === 'active' &&
      (!sub.expires_at || new Date(sub.expires_at) > new Date());

    if (isPro) return res.status(200).json({ allowed: true, isPro: true, aiLeft: 999 });

    const today = new Date().toISOString().split('T')[0];

    const { data: existing } = await supabase
      .from('nc_ai_usage')
      .select('message_count')
      .eq('email', email)
      .eq('usage_date', today)
      .single();

    const currentCount = existing?.message_count || 0;

    if (currentCount >= FREE_AI_LIMIT) {
      return res.status(200).json({
        allowed: false,
        isPro: false,
        aiLeft: 0,
        aiUsageToday: currentCount,
        message: 'Daily AI limit reached. Upgrade to Pro for unlimited access.',
      });
    }

    const newCount = currentCount + 1;
    await supabase.from('nc_ai_usage').upsert({
      email,
      usage_date: today,
      message_count: newCount,
    }, { onConflict: 'email,usage_date' });

    return res.status(200).json({
      allowed: true,
      isPro: false,
      aiLeft: Math.max(0, FREE_AI_LIMIT - newCount),
      aiUsageToday: newCount,
    });

  } catch (err) {
    console.error('track-ai error:', err);
    return res.status(200).json({ allowed: true, aiLeft: 1 });
  }
      }
