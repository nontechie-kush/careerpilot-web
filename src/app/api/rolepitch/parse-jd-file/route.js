/**
 * POST /api/rolepitch/parse-jd-file
 *
 * Extracts job description text from screenshots (JPEG/PNG/WEBP),
 * PDFs, or DOCX files. Accepts multipart/form-data.
 *
 * Fields:
 *   files: File[] — one or more images, a PDF, or a DOCX
 *
 * Returns:
 *   { title, company, description }
 */

import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import pdfParse from 'pdf-parse';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const EXTRACT_PROMPT = `You are extracting a job description from the content provided.

Return ONLY valid JSON — no markdown, no explanation.

{
  "title": "job title or null",
  "company": "company name or null",
  "description": "full job description as plain text, preserving all sections (responsibilities, requirements, about the company). Minimum 100 words."
}

Rules:
- Extract ALL text relevant to the job — responsibilities, requirements, qualifications, about section.
- Do not summarize. Preserve the full content.
- If multiple screenshots cover the same job, combine them into one description.
- Ignore UI chrome (nav bars, buttons, "Easy Apply", "Save", timestamps).`;

async function extractFromImages(imageBuffers, mimeTypes) {
  const content = [];
  for (let i = 0; i < imageBuffers.length; i++) {
    const b64 = imageBuffers[i].toString('base64');
    const mt = mimeTypes[i] || 'image/jpeg';
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: mt, data: b64 },
    });
  }
  content.push({ type: 'text', text: EXTRACT_PROMPT });

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2000,
    messages: [{ role: 'user', content }],
  });

  const raw = msg.content[0].text.trim()
    .replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  try { return JSON.parse(raw); } catch { return { title: null, company: null, description: raw }; }
}

async function extractFromText(text) {
  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2000,
    messages: [{ role: 'user', content: `${EXTRACT_PROMPT}\n\nDOCUMENT TEXT:\n${text.slice(0, 8000)}` }],
  });
  const raw = msg.content[0].text.trim()
    .replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  try { return JSON.parse(raw); } catch { return { title: null, company: null, description: raw }; }
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files');

    if (!files?.length) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    const imageBuffers = [];
    const imageMimes = [];
    let pdfText = '';

    for (const file of files) {
      const mt = file.type || '';
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (mt.startsWith('image/')) {
        // Supported: image/jpeg, image/png, image/webp, image/gif
        const supported = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        imageBuffers.push(buffer);
        imageMimes.push(supported.includes(mt) ? mt : 'image/jpeg');
      } else if (mt === 'application/pdf' || file.name?.endsWith('.pdf')) {
        const parsed = await pdfParse(buffer);
        pdfText += '\n' + parsed.text;
      } else if (
        mt === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        file.name?.endsWith('.docx')
      ) {
        // Extract raw text from DOCX (XML-based — just strip tags)
        const str = buffer.toString('utf8');
        const text = str.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        pdfText += '\n' + text;
      }
    }

    let result;
    if (imageBuffers.length > 0) {
      result = await extractFromImages(imageBuffers, imageMimes);
    } else if (pdfText.trim().length > 30) {
      result = await extractFromText(pdfText.trim());
    } else {
      return NextResponse.json({ error: 'Could not read file content' }, { status: 400 });
    }

    if (!result.description || result.description.length < 50) {
      return NextResponse.json({ error: 'Could not extract job description from files' }, { status: 422 });
    }

    return NextResponse.json({
      title: result.title || '',
      company: result.company || '',
      description: result.description,
    });

  } catch (err) {
    console.error('[parse-jd-file]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
