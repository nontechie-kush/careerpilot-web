/**
 * POST /api/ai/resume-generate-pdf
 *
 * Body: { tailored_resume_id: string, template?: 'clean' }
 *
 * Generates a PDF from the tailored resume and uploads to Supabase Storage.
 * Returns: { pdf_url: string }
 */

import { NextResponse } from 'next/server';
import { createClientFromRequest } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service-client';
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { CleanResumeTemplate } from '@/lib/resume/templates/clean';

// Coerce any value into a plain string. Handles objects, arrays, null, numbers.
// @react-pdf/renderer throws React error #31 if a non-string is passed as a
// <Text> child, so every field we render must be flattened to a string first.
function coerceString(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.map(coerceString).filter(Boolean).join(', ');
  if (typeof v === 'object') {
    // Common shapes: {name, issuer}, {first, last}, {text}
    if (v.text) return coerceString(v.text);
    if (v.name) return coerceString(v.name);
    if (v.first || v.last) return [v.first, v.last].filter(Boolean).join(' ');
    // Last resort — stringify but strip noise
    try { return JSON.stringify(v); } catch { return ''; }
  }
  return '';
}

// Walk the structured resume and ensure every field the template reads is a string.
function sanitizeResume(resume) {
  if (!resume || typeof resume !== 'object') return {};
  return {
    summary: coerceString(resume.summary),
    experience: (resume.experience || []).map((exp, i) => ({
      id: exp.id || `exp_${i}`,
      title: coerceString(exp.title),
      company: coerceString(exp.company),
      start_date: coerceString(exp.start_date),
      end_date: coerceString(exp.end_date),
      location: coerceString(exp.location),
      bullets: (exp.bullets || []).map((b, j) => ({
        id: b.id || `b_${i}_${j}`,
        text: coerceString(b.text ?? b),
      })),
    })),
    education: (resume.education || []).map((edu, i) => ({
      id: edu.id || `edu_${i}`,
      degree: coerceString(edu.degree),
      institution: coerceString(edu.institution),
      year: coerceString(edu.year),
    })),
    skills: {
      technical: (resume.skills?.technical || []).map(coerceString).filter(Boolean),
      domain: (resume.skills?.domain || []).map(coerceString).filter(Boolean),
      tools: (resume.skills?.tools || []).map(coerceString).filter(Boolean),
    },
    projects: (resume.projects || []).map((p, i) => ({
      id: p.id || `proj_${i}`,
      name: coerceString(p.name),
      bullets: (p.bullets || []).map((b, j) => ({
        id: b.id || `pb_${i}_${j}`,
        text: coerceString(b.text ?? b),
      })),
    })),
    certifications: (resume.certifications || []).map(coerceString).filter(Boolean),
  };
}

export async function POST(request) {
  try {
    const supabase = await createClientFromRequest(request);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { tailored_resume_id } = await request.json();
    if (!tailored_resume_id) {
      return NextResponse.json({ error: 'tailored_resume_id required' }, { status: 400 });
    }

    // Fetch the tailored resume + user profile for name
    const [{ data: tailored }, { data: profileRow }] = await Promise.all([
      supabase
        .from('tailored_resumes')
        .select('id, tailored_version')
        .eq('id', tailored_resume_id)
        .eq('user_id', user.id)
        .single(),
      supabase
        .from('profiles')
        .select('parsed_json')
        .eq('user_id', user.id)
        .order('parsed_at', { ascending: false })
        .maybeSingle(),
    ]);

    if (!tailored) {
      return NextResponse.json({ error: 'Tailored resume not found' }, { status: 404 });
    }

    const resumeData = sanitizeResume(tailored.tailored_version);
    const userName = coerceString(profileRow?.parsed_json?.name);

    // Render PDF to buffer
    let pdfBuffer;
    try {
      pdfBuffer = await renderToBuffer(
        React.createElement(CleanResumeTemplate, {
          resume: resumeData,
          name: userName,
        })
      );
    } catch (renderErr) {
      console.error('[resume-generate-pdf] render error:', renderErr);
      console.error('[resume-generate-pdf] resume shape:', JSON.stringify(resumeData)?.slice(0, 2000));
      throw new Error(`PDF render failed: ${renderErr.message}`);
    }

    // Upload to Supabase Storage (use service client for storage access)
    const serviceClient = createServiceClient();
    const storagePath = `${user.id}/resume-${tailored_resume_id}.pdf`;

    const { error: uploadError } = await serviceClient.storage
      .from('resumes')
      .upload(storagePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      console.error('[resume-generate-pdf] upload error:', uploadError);
      throw new Error(`PDF upload failed: ${uploadError.message}`);
    }

    // Get signed URL (valid for 7 days)
    const { data: signedUrlData } = await serviceClient.storage
      .from('resumes')
      .createSignedUrl(storagePath, 7 * 24 * 60 * 60);

    const pdfUrl = signedUrlData?.signedUrl;

    // Update the tailored_resumes record
    await supabase
      .from('tailored_resumes')
      .update({
        pdf_url: pdfUrl,
        status: 'finalized',
        updated_at: new Date().toISOString(),
      })
      .eq('id', tailored_resume_id);

    return NextResponse.json({ pdf_url: pdfUrl });
  } catch (err) {
    console.error('[resume-generate-pdf]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
