const MAX_IMAGE_LENGTH = 8_000_000;
const DEFAULT_ALLOWED_ORIGIN = 'https://cecebedolla.github.io';

const scoreSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'ceceScore',
    'expression',
    'pose',
    'lighting',
    'composition',
    'eyeContact',
    'socialAppeal',
    'confidence',
    'redFlags',
    'strengths',
    'why',
  ],
  properties: {
    ceceScore: { type: 'number', minimum: 1, maximum: 10 },
    expression: { type: 'number', minimum: 1, maximum: 10 },
    pose: { type: 'number', minimum: 1, maximum: 10 },
    lighting: { type: 'number', minimum: 1, maximum: 10 },
    composition: { type: 'number', minimum: 1, maximum: 10 },
    eyeContact: { type: 'number', minimum: 1, maximum: 10 },
    socialAppeal: { type: 'number', minimum: 1, maximum: 10 },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    redFlags: { type: 'array', items: { type: 'string' }, maxItems: 8 },
    strengths: { type: 'array', items: { type: 'string' }, maxItems: 8 },
    why: { type: 'string', maxLength: 700 },
  },
};

function setCorsHeaders(response, origin) {
  response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.setHeader('Vary', 'Origin');
}

function readOutputText(payload) {
  for (const item of payload.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === 'output_text' && typeof content.text === 'string') return content.text;
    }
  }
  return '';
}

export default async function handler(request, response) {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || DEFAULT_ALLOWED_ORIGIN;
  const requestOrigin = request.headers.origin;
  setCorsHeaders(response, requestOrigin === allowedOrigin ? requestOrigin : allowedOrigin);

  if (request.method === 'OPTIONS') return response.status(204).end();
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed.' });
  if (!process.env.OPENAI_API_KEY) return response.status(500).json({ error: 'OPENAI_API_KEY is not configured.' });
  if (requestOrigin && requestOrigin !== allowedOrigin) return response.status(403).json({ error: 'Origin not allowed.' });

  const { imageDataUrl, preferenceSummary = '', fileName = 'photo' } = request.body ?? {};
  if (typeof imageDataUrl !== 'string' || !imageDataUrl.startsWith('data:image/')) {
    return response.status(400).json({ error: 'A valid image data URL is required.' });
  }
  if (imageDataUrl.length > MAX_IMAGE_LENGTH) {
    return response.status(413).json({ error: 'Image is too large. Resize it before analysis.' });
  }

  const prompt = `You are the vision engine for Cece Photo AI. Judge whether Cece would post this image, not whether it is technically perfect in a generic sense.

Cece's known preferences:
- Natural, flattering facial expressions; avoid exaggerated, awkward, or caught-mid-expression faces.
- Deliberate posing and body positioning that creates shape and confidence; avoid angles that make her look shapeless or compressed.
- Favor photos where important people are clearly visible and framed evenly.
- Warm, lively social settings can outweigh minor technical imperfections.
- Strong penalties for blur, harsh or uneven facial lighting, distracting backgrounds, awkward cropping, closed eyes, and unflattering angles.
- A score of 8-10 means she would confidently post it. 4-7 means mixed or situational. 1-3 means she would not post it.

Saved training summary supplied by the app:
${String(preferenceSummary).slice(0, 5000) || 'No additional summary supplied.'}

Analyze ${fileName}. Be candid and conservative. Do not identify anyone. Evaluate visible presentation only.`;

  try {
    const openAIResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-5.6',
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_text', text: prompt },
              { type: 'input_image', image_url: imageDataUrl },
            ],
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'cece_photo_score',
            strict: true,
            schema: scoreSchema,
          },
        },
        max_output_tokens: 900,
      }),
    });

    const payload = await openAIResponse.json();
    if (!openAIResponse.ok) {
      console.error('OpenAI API error', payload);
      return response.status(502).json({ error: payload?.error?.message || 'Vision analysis failed.' });
    }

    const outputText = readOutputText(payload);
    if (!outputText) return response.status(502).json({ error: 'The vision model returned no structured result.' });

    const analysis = JSON.parse(outputText);
    return response.status(200).json({ analysis, model: payload.model, requestId: payload.id });
  } catch (error) {
    console.error('Vision endpoint error', error);
    return response.status(500).json({ error: error instanceof Error ? error.message : 'Unexpected server error.' });
  }
}
