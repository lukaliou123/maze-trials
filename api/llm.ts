import type { VercelRequest, VercelResponse } from '@vercel/node';

const API_KEY = process.env.DEEPSEEK_API_KEY ?? '';
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const BASE_URL = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/+$/, '');
const UPSTREAM = `${BASE_URL}/chat/completions`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (!API_KEY || API_KEY === 'sk-replace-me') {
    return res.status(500).json({ error: 'DEEPSEEK_API_KEY not configured' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {};
  if (!body.model) body.model = MODEL;

  try {
    const upstream = await fetch(UPSTREAM, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify(body),
    });

    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/json');
    return res.send(text);
  } catch (err) {
    return res.status(502).json({ error: `Upstream LLM error: ${(err as Error).message}` });
  }
}
