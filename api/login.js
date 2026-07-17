import { createSessionCookie, verifyPassword } from './_security.js';

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed.' });
  const { password } = request.body ?? {};
  if (!verifyPassword(password)) return response.status(401).json({ error: 'Incorrect password.' });
  try {
    response.setHeader('Set-Cookie', createSessionCookie());
    return response.status(200).json({ authenticated: true });
  } catch (error) {
    return response.status(500).json({ error: error instanceof Error ? error.message : 'Login failed.' });
  }
}
