export default {
  async fetch(req, env) {
    const u = new URL(req.url), out = {};
    try {
      if (u.pathname === '/whisper') {
        const buf = new Uint8Array(await req.arrayBuffer());
        const mode = u.searchParams.get('mode') || 'b64';
        const lang = u.searchParams.get('lang') || undefined;
        const audio = mode === 'b64' ? buf.toBase64() : { body: new Blob([buf]).stream(), contentType: req.headers.get('content-type') };
        const r = await env.AI.run('@cf/openai/whisper-large-v3-turbo', { audio, ...(lang ? { language: lang } : {}), vad_filter: true });
        return Response.json({ text: r.text, info: r.transcription_info, segs: (r.segments || []).length, keys: Object.keys(r) });
      }
      if (u.pathname === '/chat') {
        const b = await req.json();
        const r = await env.AI.run(b.model || '@cf/google/gemma-4-26b-a4b-it', b.input);
        if (r instanceof ReadableStream) return new Response(r, { headers: { 'content-type': 'text/event-stream' } });
        return Response.json(r);
      }
      if (u.pathname === '/md') {
        const buf = await req.arrayBuffer();
        const r = await env.AI.toMarkdown([{ name: 'a.pdf', blob: new Blob([buf], { type: 'application/pdf' }) }]);
        return Response.json(r);
      }
      if (u.pathname === '/models') {
        const r = await env.AI.models({ per_page: 200 });
        return Response.json(r.map(m => m.name + ' | ' + (m.task?.name || '')));
      }
    } catch (e) { return Response.json({ error: String(e && e.message || e) }, { status: 500 }); }
    return new Response('ok');
  },
};
