import React, { useState, useEffect, useRef, useMemo } from 'react'

        const FAMILIES = ["Noun", "Adjective", "Adverb", "Verb", "Phrasal Verb", "Preposition", "Idiom", "Chunk"];
        const DIFFICULTIES = ["Passive", "Emerging", "Active"];

        // 🆕 V14.85: Groq model ids in ONE place, so the next deprecation is a one-line change.
        // Groq shut down the Llama models on 16 Aug 2026 (announced 17 Jun 2026), which is why every
        // Groq call started returning 404 model_not_found:
        //   llama-3.3-70b-versatile      → openai/gpt-oss-120b
        //   llama-3.1-8b-instant         → openai/gpt-oss-20b
        //   deepseek-r1-distill-llama-70b → openai/gpt-oss-120b (shut down 2 Oct 2025)
        const GROQ_MODEL_LARGE = 'openai/gpt-oss-120b';  // quality-sensitive work
        const GROQ_MODEL_FAST  = 'openai/gpt-oss-20b';   // short, latency-sensitive helpers

        // Verified against Groq's deprecations page: Orpheus is NOT deprecated — it is itself the
        // replacement for playai-tts (shut down 31 Dec 2025). Unchanged.
        const GROQ_MODEL_TTS = 'canopylabs/orpheus-v1-english';

        // gpt-oss are reasoning models. Groq normally returns reasoning separately, but if any leaks
        // into the message content it must not reach a parser or the UI.
        const stripReasoningBlocks = t => String(t || '')
            .replace(/<think>[\s\S]*?<\/think>/gi, '')
            .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '')
            .trim();

        // 🆕 V14.87: gpt-oss spends output tokens on reasoning before emitting the answer, which was
        // truncating JSON mid-object ("Unexpected end of JSON input" in AI Improve). Verified against
        // Groq's reasoning docs: gpt-oss accepts reasoning_effort with "low" | "medium" | "high".
        const GROQ_REASONING_EFFORT = 'low';

        // Reads Groq content and surfaces finish_reason. "length" means the budget ran out and the
        // payload is truncated — the single most useful signal if this recurs.
        function groqContent(label, data) {
            const choice = data?.choices?.[0];
            const finish = choice?.finish_reason;
            if (finish === 'length') {
                console.error(`[Groq:${label}] ⚠️ finish_reason="length" — response TRUNCATED, max_tokens too small`, {
                    usage: data?.usage || null
                });
            } else if (finish && finish !== 'stop') {
                console.warn(`[Groq:${label}] finish_reason="${finish}"`, { usage: data?.usage || null });
            } else {
                console.log(`[Groq:${label}] ok`, {
                    finish_reason: finish || 'n/a',
                    completion_tokens: data?.usage?.completion_tokens ?? null,
                    reasoning_tokens: data?.usage?.completion_tokens_details?.reasoning_tokens ?? null
                });
            }
            return stripReasoningBlocks(choice?.message?.content);
        }


        function App() {
            // 🆕 V11.17: Supabase credentials configurable in Settings (with defaults for immediate functionality)
            // Note: Anon key is public by design and safe to include in frontend code
            const [supabaseUrl, setSupabaseUrl] = useState(
                localStorage.getItem('supabase_url') || ''
            );
            const [supabaseKey, setSupabaseKey] = useState(
                localStorage.getItem('supabase_key') || ''
            );
            
            // Initialize Supabase client synchronously using useMemo (available immediately on first render)
            const supabase = useMemo(() => {
                if (supabaseUrl && supabaseKey && window.supabase) {
                    try {
                        return window.supabase.createClient(supabaseUrl, supabaseKey);
                    } catch (error) {
                        console.error('Supabase initialization error:', error);
                        return null;
                    }
                }
                return null;
            }, [supabaseUrl, supabaseKey]);
            
            const [words, setWords] = useState([]);
            const [page, setPage] = useState(0);
            const [hasMore, setHasMore] = useState(true);
            const [loading, setLoading] = useState(false);
            const [totalCount, setTotalCount] = useState(0);
            const [search, setSearch] = useState('');
            const [familyFilter, setFamilyFilter] = useState('All');
            const [emptyFilter, setEmptyFilter] = useState('None');
            const [difficultyFilter, setDifficultyFilter] = useState('All');
            const [favouriteLevel, setFavouriteLevel] = useState(0); // 🆕 V11.42: 0=all, 1=level1, 2=level2, 3=both
            const [showAddModal, setShowAddModal] = useState(false);
            const [showSettings, setShowSettings] = useState(false);
            const [showExercisesModal, setShowExercisesModal] = useState(false); // 🆕 V11.59: Exercises modal
            const [showSupabasePausedModal, setShowSupabasePausedModal] = useState(false);
            const [showTalkToMeModal, setShowTalkToMeModal] = useState(false);
            const [talkToMeMethod, setTalkToMeMethod] = useState(localStorage.getItem('talk_to_me_method') || 'chatgpt');
            const [showVoiceModal, setShowVoiceModal] = useState(false);
            const [voiceFilter, setVoiceFilter] = useState('favourites');
            const [voiceStatus, setVoiceStatus] = useState('idle'); // idle | starting | listening | thinking | speaking
            const [voiceHistory, setVoiceHistory] = useState([]);
            const [voiceLiveTranscript, setVoiceLiveTranscript] = useState('');
            const [showDictionaryModal, setShowDictionaryModal] = useState(false); // 🆕 V11.55: Dictionary modal
            const [selectedWordForDict, setSelectedWordForDict] = useState(''); // 🆕 V11.55: Selected word for dictionary
            const [editingWord, setEditingWord] = useState(null);
            const [clickAction, setClickAction] = useState(localStorage.getItem('click_action') || 'wordreference');

            // 🆕 V11.13: Web Search prompt for Perplexity/ChatGPT/Claude
            const [aiSearchPrompt, setAiSearchPrompt] = useState(
                localStorage.getItem('ai_search_prompt') || 'For the English word/expression "{word}", provide:\n· Meaning.\n· Family: provide if the "{word}" is a noun, adjective, phrasal verb, idiom, etc.\n· Synonyms: some exact British English synonyms.\n· Context: Some natural sentences using this "{word}" in a sentence in British English.\n· Level: give the related level according to the Cambridge school.\n· Usage frequency: Based on corpus frequency (BNC/COCA), classify "{word}" as: very common (top 3000) / common (top 10000) / uncommon / rare / formal / literary. If there is a more commonly used EXACT synonym (truly interchangeable, same meaning), indicate it. Do NOT suggest near-synonyms.'
            );
            
            // 🆕 V11.9: Undo history (stores last change for each word)
            
            // 🆕 V11.9: Original data before editing (for restore in modal)
            const [originalEditData, setOriginalEditData] = useState(null);
            
            const [groqApiKey, setGroqApiKey] = useState((localStorage.getItem('groq_api_key') || '').trim());
            const [geminiApiKey, setGeminiApiKey] = useState((localStorage.getItem('gemini_api_key') || '').trim()); // 🆕 V14.67
            const [magicLoading, setMagicLoading] = useState(false);
            const [usageInfo, setUsageInfo] = useState(null); // 🆕 V12.8: Usage frequency info

            function listenOnce(onInterim) {
                return new Promise(resolve => {
                    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
                    if (!SR) { resolve(''); return; }
                    const rec = new SR();
                    voiceRecognitionRef.current = rec;
                    rec.lang = 'en-US';
                    rec.interimResults = true;
                    rec.maxAlternatives = 1;
                    let done = false;
                    let lastInterim = '';

                    const finish = text => {
                        if (done) return;
                        done = true;
                        clearTimeout(timeout);
                        voiceRecognitionRef.current = null;
                        resolve(text.trim());
                    };

                    // 10-second hard timeout — never hang forever
                    const timeout = setTimeout(() => {
                        try { rec.stop(); } catch (e) {}
                        finish(lastInterim);
                    }, 10000);

                    rec.onresult = e => {
                        const last = e.results[e.results.length - 1];
                        if (last.isFinal) {
                            finish(last[0].transcript);
                        } else {
                            lastInterim = last[0].transcript;
                            if (onInterim) onInterim(lastInterim);
                        }
                    };
                    rec.onerror = () => finish(lastInterim);
                    rec.onend   = () => finish(lastInterim); // always resolves, never rejects
                    rec.start();
                });
            }

            function speakTextForVoice(text) {
                return new Promise(resolve => {
                    if (groqAudioRef.current) { groqAudioRef.current.pause(); groqAudioRef.current = null; }
                    if ('speechSynthesis' in window) window.speechSynthesis.cancel();

                    const useGroq = preferredVoice.startsWith('groq-') && groqApiKey.trim();
                    if (!useGroq) { speakBrowserTTSForVoice(text).then(resolve); return; }

                    // 100ms delay matches speakText() pattern
                    setTimeout(async () => {
                        try {
                            const inputText = text.length > 190 ? text.substring(0, 190) + '...' : '... ' + text;
                            const resp = await fetch('https://api.groq.com/openai/v1/audio/speech', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqApiKey.trim()}` },
                                body: JSON.stringify({ model: GROQ_MODEL_TTS, input: inputText, voice: preferredVoice.replace('groq-', ''), response_format: 'wav' })
                            });
                            if (!resp.ok) throw new Error('Groq TTS failed');
                            const blob = await resp.blob();
                            const url = URL.createObjectURL(blob);
                            const audio = new Audio(url);
                            groqAudioRef.current = audio;
                            // resolve() ONLY fires from onended — never from play() starting
                            audio.onended = () => { URL.revokeObjectURL(url); groqAudioRef.current = null; resolve(); };
                            audio.onerror  = () => { URL.revokeObjectURL(url); resolve(); };
                            // 300ms delay before play to prevent clipping
                            setTimeout(() => { audio.play().catch(() => resolve()); }, 300);
                        } catch (e) {
                            speakBrowserTTSForVoice(text).then(resolve);
                        }
                    }, 100);
                });
            }

            function speakBrowserTTSForVoice(text) {
                return new Promise(resolve => {
                    if (!('speechSynthesis' in window)) { resolve(); return; }
                    window.speechSynthesis.cancel();
                    const voices = window.speechSynthesis.getVoices();
                    const utt = new SpeechSynthesisUtterance(text);
                    utt.lang = 'en-GB';
                    utt.rate = 1.0;
                    utt.pitch = 1.0;
                    utt.volume = 1.0;
                    if (preferredVoice === 'auto' || preferredVoice.startsWith('groq-')) {
                        const best = getBestBrowserVoice(voices);
                        if (best) utt.voice = best;
                    } else {
                        const sel = voices.find(v => v.name === preferredVoice);
                        if (sel) utt.voice = sel;
                    }
                    utt.onend = resolve;
                    utt.onerror = resolve;
                    window.speechSynthesis.speak(utt);
                });
            }

            async function callGroqForVoice(systemPrompt, history) {
                try {
                    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqApiKey.trim()}` },
                        body: JSON.stringify({
                            model: GROQ_MODEL_LARGE,
                            messages: [{ role: 'system', content: systemPrompt }, ...history],
                            temperature: 0.8,
                            max_tokens: 400, reasoning_effort: GROQ_REASONING_EFFORT
                        })
                    });
                    if (!resp.ok) return null;
                    const data = await resp.json();
                    return groqContent('voice', data) || null;
                } catch (e) { return null; }
            }

            async function runVoiceLoop(systemPrompt, history) {
                while (voiceRunningRef.current) {
                    setVoiceStatus('listening');
                    setVoiceLiveTranscript('');
                    const userText = await listenOnce(interim => setVoiceLiveTranscript(interim));
                    if (!voiceRunningRef.current) break;
                    setVoiceLiveTranscript('');

                    if (!userText) {
                        setVoiceStatus('retrying');
                        await new Promise(r => setTimeout(r, 800));
                        continue;
                    }

                    const historyWithUser = [...history, { role: 'user', content: userText }];

                    setVoiceStatus('thinking');
                    const aiText = await callGroqForVoice(systemPrompt, historyWithUser);
                    if (!voiceRunningRef.current) break;
                    if (!aiText) continue;

                    history = [...historyWithUser, { role: 'assistant', content: aiText }];
                    setVoiceHistory(history);

                    setVoiceStatus('speaking');
                    await speakTextForVoice(aiText);
                }
                setVoiceStatus('idle');
            }

            async function startVoiceSession(filter) {
                if (!supabase || !groqApiKey.trim()) {
                    alert('A Groq API key is required for built-in voice mode. Add it in Settings.');
                    return;
                }
                setVoiceStatus('starting');
                setVoiceHistory([]);
                setVoiceLiveTranscript('');

                let query = supabase.from('vocabulary_v4').select('vocabulary, synonyms, context, family, difficulty').is('deleted_at', null);
                if (filter === 'favourites') query = query.in('favourite', [1, 2]);
                else if (filter === 'top_favourites') query = query.eq('favourite', 2);
                else if (filter === 'passive') query = query.eq('difficulty', 'Passive');
                else if (filter === 'emerging') query = query.eq('difficulty', 'Emerging');

                const { data, error } = await query;
                if (error || !data || data.length === 0) { setVoiceStatus('idle'); return; }

                const shuffled = [...data].sort(() => Math.random() - 0.5).slice(0, 30);
                const wordList = shuffled.map(w => {
                    const parts = [];
                    if (w.family) parts.push(`(${w.family})`);
                    if (w.synonyms) parts.push(`synonyms: ${w.synonyms}`);
                    if (w.context) parts.push(`e.g. "${w.context}"`);
                    return `• ${w.vocabulary}${parts.length ? ' — ' + parts.join(' | ') : ''}`;
                }).join('\n');

                const systemPrompt = `You are a friendly English vocabulary tutor. The user is a Spanish speaker practising these ${shuffled.length} words:\n\n${wordList}\n\nReview them through natural conversation: introduce words, use them in context, ask questions, explain gently when needed. VOICE MODE: every response must be under 40 words, short sentences only, no lists or bullet points. Talk like a human tutor. Start the conversation yourself now.`;

                voiceRunningRef.current = true;

                setVoiceStatus('thinking');
                const opening = await callGroqForVoice(systemPrompt, []);
                if (!voiceRunningRef.current || !opening) { setVoiceStatus('idle'); return; }

                const history = [{ role: 'assistant', content: opening }];
                setVoiceHistory(history);

                setVoiceStatus('speaking');
                await speakTextForVoice(opening);

                await runVoiceLoop(systemPrompt, history);
            }

            function stopVoiceSession() {
                voiceRunningRef.current = false;
                if (voiceRecognitionRef.current) {
                    try { voiceRecognitionRef.current.stop(); } catch (e) {}
                    voiceRecognitionRef.current = null;
                }
                window.speechSynthesis.cancel();
                setVoiceStatus('idle');
                setShowVoiceModal(false);
            }

            async function openTalkToMe(filter) {
                if (!supabase) return;
                setShowTalkToMeModal(false);

                let query = supabase.from('vocabulary_v4').select('vocabulary, synonyms, context, family, difficulty').is('deleted_at', null);

                if (filter === 'favourites') query = query.in('favourite', [1, 2]);
                else if (filter === 'top_favourites') query = query.eq('favourite', 2);
                else if (filter === 'passive') query = query.eq('difficulty', 'Passive');
                else if (filter === 'emerging') query = query.eq('difficulty', 'Emerging');
                // 'all' — no extra filter

                const { data, error } = await query;
                if (error || !data || data.length === 0) return;

                // Shuffle and pick up to 30
                const shuffled = [...data].sort(() => Math.random() - 0.5).slice(0, 30);

                const wordList = shuffled.map(w => {
                    const parts = [];
                    if (w.family) parts.push(`(${w.family})`);
                    if (w.synonyms) parts.push(`synonyms: ${w.synonyms}`);
                    if (w.context) parts.push(`e.g. "${w.context}"`);
                    return `• ${w.vocabulary}${parts.length ? ' — ' + parts.join(' | ') : ''}`;
                }).join('\n');

                const prompt = `You are a friendly conversational English vocabulary tutor. I'm a Spanish speaker learning these ${shuffled.length} English words:\n\n${wordList}\n\nReview them naturally through conversation: introduce words, use them in context, ask me questions about them, and explain gently when I'm unsure. Don't just list or drill — have a real conversation. Work through all the words gradually. Start the conversation yourself, don't wait for me.\n\nThe user will switch to voice mode immediately. Keep all your responses conversational, natural and spoken-friendly — short sentences, no bullet points, no lists. Talk like a friendly human tutor, not a textbook.`;

                window.open(`https://chatgpt.com/?q=${encodeURIComponent(prompt)}`, '_blank');
            }

            const [magicFillModel, setMagicFillModel] = useState(null); // 🆕 V14.67: 'Gemini' | 'Groq' — which model produced the last fill

            // 🆕 V14.67: Gemini call — returns raw text, throws on any failure so the caller can fall back to Groq
            // 🆕 V14.68: shared by Magic Fill and AI Improve; `label` only tags the console output
            // 🆕 V14.69: gemini-2.0-flash is shut down; 2.5-flash was 404ing, so use a current Flash model
            const GEMINI_MODEL = 'gemini-3.5-flash';

            // 🆕 V14.70: thinking is what made Gemini slow (14-23s vs ~2s for Groq), so it is turned
            // down to the minimum. The 2.5 family uses the legacy thinkingBudget; 3.x uses thinkingLevel
            // ("minimal" | "low" | "medium" (default) | "high"). Sending BOTH in one request is a 400,
            // so exactly one is set, chosen by model family.
            const geminiIs25 = GEMINI_MODEL.startsWith('gemini-2.5');

            // 🆕 V14.73: options let other features reuse this — bigger budgets for the long
            // examiner prompts, and json:false for the one call site that wants prose back.
            async function callGemini(apiKey, systemContent, prompt, label = 'Magic Fill', options = {}) {
                // 🆕 V14.80: timeoutMs — a real run saw a call sit for 34.8s before returning 503,
                // so an unbounded request could stall a whole batch.
                const { maxOutputTokens = 800, temperature = 0.2, json = true, timeoutMs = 45000 } = options;
                const startedAt = Date.now();
                console.log(`%c[${label}] 🔷 Trying Gemini (${GEMINI_MODEL})...`, 'color:#60a5fa;font-weight:bold');

                const generationConfig = {
                    temperature,
                    maxOutputTokens,
                    thinkingConfig: geminiIs25 ? { thinkingBudget: 0 } : { thinkingLevel: 'minimal' }
                };
                if (json) generationConfig.responseMimeType = 'application/json';

                const abortController = new AbortController();
                const timeoutHandle = setTimeout(() => abortController.abort(), timeoutMs);

                try {
                    const requestUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
                    const response = await fetch(
                        requestUrl,
                        {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            signal: abortController.signal,
                            body: JSON.stringify({
                                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                                // omitted when the call site has no system message, so its prompt
                                // reaches Gemini exactly as it reaches Groq
                                ...(systemContent ? { systemInstruction: { parts: [{ text: systemContent }] } } : {}),
                                generationConfig
                            })
                        }
                    );

                    if (!response.ok) {
                        // Read the body ONCE as text, then try to parse it — a non-JSON error body
                        // (HTML proxy page, plain text) must not hide the real reason.
                        const bodyText = await response.text().catch(() => '');
                        let parsed = null;
                        try { parsed = JSON.parse(bodyText); } catch (e) { /* not JSON */ }
                        const detail = parsed?.error?.message || bodyText.slice(0, 300);
                        console.error(`[${label}] ❌ Gemini HTTP ${response.status} ${response.statusText || ''}`.trim(), {
                            status: response.status,
                            model: GEMINI_MODEL,
                            // key redacted — a 404 here almost always means the model name or API
                            // version is wrong for this key, so the exact URL is the useful clue
                            url: requestUrl.replace(/key=[^&]*/, 'key=REDACTED'),
                            reason: parsed?.error?.status || null,
                            message: detail,
                            body: parsed || bodyText.slice(0, 1000)
                        });
                        // 🆕 V14.73: only a 429 / RESOURCE_EXHAUSTED latches the quota state
                        const quotaHit = response.status === 429 || parsed?.error?.status === 'RESOURCE_EXHAUSTED';
                        if (quotaHit) markGeminiQuotaExhausted();

                        const err = new Error(`Gemini API Error ${response.status}${detail ? ': ' + detail : ''}`);
                        err.status = response.status;
                        err.quotaExhausted = quotaHit;
                        // 🆕 V14.80: 5xx means Google is busy, not that the request is wrong —
                        // transient and worth retrying. 429 is deliberately NOT retriable.
                        err.retriable = !quotaHit && [500, 502, 503, 504].includes(response.status);
                        throw err;
                    }

                    const data = await response.json();
                    const candidate = data.candidates && data.candidates[0];
                    if (!candidate) {
                        console.error(`[${label}] ❌ Gemini returned no candidates`, {
                            blockReason: data.promptFeedback?.blockReason || null,
                            safetyRatings: data.promptFeedback?.safetyRatings || null,
                            response: data
                        });
                        throw new Error(`No candidates from Gemini${data.promptFeedback?.blockReason ? ' (blocked: ' + data.promptFeedback.blockReason + ')' : ''}`);
                    }

                    const parts = candidate.content?.parts || [];
                    // 🆕 V14.89: ALWAYS concatenate every part. This previously read parts[0].text and
                    // only fell back to joining when that was empty, so whenever Gemini split its
                    // answer across parts the tail was silently dropped — producing JSON that looked
                    // complete but was missing its closing brace, with no MAX_TOKENS and no error.
                    const text = parts.map(p => p.text || '').join('');
                    if (parts.length > 1) {
                        console.log(`[${label}] response arrived in ${parts.length} parts, concatenated to ${text.length} chars`);
                    }
                    if (!text || !text.trim()) {
                        console.error(`[${label}] ❌ Gemini returned an empty text part`, {
                            finishReason: candidate.finishReason || null,
                            partCount: parts.length,
                            usageMetadata: data.usageMetadata || null,
                            candidate
                        });
                        throw new Error(`Empty Gemini response${candidate.finishReason ? ' (finishReason: ' + candidate.finishReason + ')' : ''}`);
                    }

                    console.log(
                        `%c[${label}] ✅ Gemini succeeded in ${Date.now() - startedAt}ms`,
                        'color:#4ade80;font-weight:bold',
                        {
                            finishReason: candidate.finishReason || 'n/a',
                            parts: parts.length,      // 🆕 V14.89
                            chars: text.length,       // 🆕 V14.89
                            // thinkingTokens is the number to watch if calls are slow — it should be
                            // small or 0 now that thinking is minimised
                            thinkingTokens: data.usageMetadata?.thoughtsTokenCount ?? 0,
                            thinking: geminiIs25 ? 'budget:0' : 'level:minimal',
                            tokens: data.usageMetadata || null
                        }
                    );
                    // 🆕 V14.88: MAX_TOKENS means the payload is cut off — the text returns, but any
                    // JSON in it will be incomplete. Say so here rather than leaving the caller to
                    // report an opaque parse error.
                    if (candidate.finishReason === 'MAX_TOKENS') {
                        console.error(`[${label}] ⚠️ finishReason=MAX_TOKENS — response TRUNCATED at ${maxOutputTokens} tokens. Raise maxOutputTokens for this call.`, {
                            received: text.length + ' chars',
                            usage: data.usageMetadata || null
                        });
                    }

                    markGeminiAvailable(); // 🆕 V14.73: a success clears any stale quota flag
                    bumpAiDaily('gemini'); // 🆕 V14.82: counted against Gemini specifically
                    return text;

                } catch (err) {
                    // 🆕 V14.80: an aborted request is a timeout, and is retriable like a 5xx
                    if (err.name === 'AbortError') {
                        const timeoutErr = new Error(`Gemini request timed out after ${timeoutMs}ms`);
                        timeoutErr.timedOut = true;
                        timeoutErr.retriable = true;
                        console.error(`[${label}] ⏱ ${timeoutErr.message}`);
                        throw timeoutErr;
                    }
                    // Single place where every Gemini failure surfaces, network errors included
                    console.error(`[${label}] ❌ Gemini call failed after ${Date.now() - startedAt}ms:`, err);
                    throw err;
                } finally {
                    clearTimeout(timeoutHandle);
                }
            }

            // ─── 🆕 V14.73: Gemini free-tier quota tracking ────────────────────────────────────
            // Only a 429 / RESOURCE_EXHAUSTED means the daily quota is gone. Every other failure is
            // transient and must NOT latch this state — it just falls back to Groq for that one call.
            const GEMINI_QUOTA_KEY = 'gemini_quota_state';

            // Google's free tier resets at midnight US Pacific. Comparing the Pacific *date* is
            // DST-safe, unlike storing a fixed UTC offset.
            function pacificDateString(d = new Date()) {
                return new Intl.DateTimeFormat('en-CA', {
                    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit'
                }).format(d);
            }

            function msUntilPacificMidnight() {
                const now = new Date();
                const pacNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
                const pacMidnight = new Date(pacNow);
                pacMidnight.setHours(24, 0, 0, 0);
                return pacMidnight - pacNow;
            }

            const GEMINI_QUOTA_OK = { exhausted: false, since: null, pacificDate: null };

            // Reads straight from localStorage so the gate is never stale mid-flow, and self-clears
            // once the Pacific day has rolled over — that IS the "retry after reset" behaviour.
            function readGeminiQuota() {
                try {
                    const raw = localStorage.getItem(GEMINI_QUOTA_KEY);
                    if (!raw) return GEMINI_QUOTA_OK;
                    const parsed = JSON.parse(raw);
                    if (!parsed || !parsed.exhausted) return GEMINI_QUOTA_OK;
                    if (parsed.pacificDate && parsed.pacificDate !== pacificDateString()) {
                        localStorage.removeItem(GEMINI_QUOTA_KEY);
                        return GEMINI_QUOTA_OK;
                    }
                    return parsed;
                } catch (e) {
                    return GEMINI_QUOTA_OK;
                }
            }

            const [geminiQuota, setGeminiQuota] = useState(readGeminiQuota);
            const [showGeminiInfo, setShowGeminiInfo] = useState(false); // 🆕 V14.73: status modal

            function markGeminiQuotaExhausted() {
                const state = { exhausted: true, since: new Date().toISOString(), pacificDate: pacificDateString() };
                try { localStorage.setItem(GEMINI_QUOTA_KEY, JSON.stringify(state)); } catch (e) {}
                setGeminiQuota(state);
                console.warn('%c[Gemini] 🚫 Daily quota exhausted (429) — using Groq until it resets at midnight US Pacific', 'color:#fb923c;font-weight:bold');
            }

            function markGeminiAvailable() {
                if (!readGeminiQuota().exhausted) return;
                try { localStorage.removeItem(GEMINI_QUOTA_KEY); } catch (e) {}
                setGeminiQuota(GEMINI_QUOTA_OK);
                console.log('%c[Gemini] ✅ Quota reset — Gemini is available again', 'color:#4ade80;font-weight:bold');
            }

            // Single gate every Gemini call site consults before spending a request.
            function geminiReady() {
                return !!geminiApiKey.trim() && !readGeminiQuota().exhausted;
            }

            // 🆕 V14.78: real count of successful AI content calls today. Published limits are not
            // guaranteed, so we measure actual usage instead of assuming a fixed daily allowance.
            // 🆕 V14.82: counted PER MODEL. One shared number was misattributed — a Groq-only batch
            // reported "N Gemini calls today", which is the one number that has a meaningful limit.
            const AI_DAILY_KEY = 'ai_daily_counts';
            const GEMINI_DAILY_KEY_LEGACY = 'gemini_daily_count'; // pre-V14.82, migrated below

            const EMPTY_DAILY = { gemini: 0, groq: 0 };

            function readAiDaily() {
                const today = pacificDateString();
                try {
                    const raw = localStorage.getItem(AI_DAILY_KEY);
                    if (raw) {
                        const parsed = JSON.parse(raw);
                        if (parsed && parsed.pacificDate === today) {
                            return { gemini: Number(parsed.gemini) || 0, groq: Number(parsed.groq) || 0 };
                        }
                        return EMPTY_DAILY;
                    }
                    // carry today's pre-V14.82 Gemini tally across rather than resetting it mid-day
                    const legacy = localStorage.getItem(GEMINI_DAILY_KEY_LEGACY);
                    if (legacy) {
                        const parsed = JSON.parse(legacy);
                        if (parsed && parsed.pacificDate === today) {
                            return { gemini: Number(parsed.count) || 0, groq: 0 };
                        }
                    }
                    return EMPTY_DAILY;
                } catch (e) {
                    return EMPTY_DAILY;
                }
            }

            const [aiDailyCounts, setAiDailyCounts] = useState(readAiDaily);

            function bumpAiDaily(model) {
                const key = model === 'groq' ? 'groq' : 'gemini';
                const current = readAiDaily();
                const next = { ...current, [key]: current[key] + 1 };
                try {
                    localStorage.setItem(AI_DAILY_KEY, JSON.stringify({ pacificDate: pacificDateString(), ...next }));
                } catch (e) { /* storage full or blocked */ }
                setAiDailyCounts(next);
            }

            // 🆕 V14.73: tolerant JSON extraction — strips markdown fences and DeepSeek <think>
            // blocks, then falls back to the outermost {...} if a straight parse fails.
            function parseLooseJson(text) {
                let raw = stripReasoningBlocks(text);
                raw = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
                try {
                    return JSON.parse(raw);
                } catch (e) { /* fall through to brace extraction */ }

                // 🆕 V14.80: count braces to find the FIRST balanced object, the same recovery the
                // interactive Magic Fill uses. The previous lastIndexOf('}') spanned past the valid
                // object into any trailing content, so a model that appended prose after the JSON
                // produced "Unexpected non-whitespace character after JSON" from the retry as well.
                // 🆕 V14.88: handles arrays too, so the two call sites expecting [...] can share it.
                const objAt = raw.indexOf('{'), arrAt = raw.indexOf('[');
                const start = (objAt === -1) ? arrAt : (arrAt === -1 ? objAt : Math.min(objAt, arrAt));
                if (start === -1) {
                    console.error('[parseLooseJson] no JSON value found. Raw response:', raw);
                    throw new Error('No JSON object in response');
                }
                const open = raw[start], close = open === '[' ? ']' : '}';

                // 🆕 V14.89: track the actual nesting stack, so missing closers can be reconstructed
                const stack = [];
                let inString = false, escaped = false, end = -1;
                for (let i = start; i < raw.length; i++) {
                    const ch = raw[i];
                    if (escaped) { escaped = false; continue; }
                    if (ch === '\\') { escaped = true; continue; }
                    if (ch === '"') { inString = !inString; continue; }
                    if (inString) continue;          // brackets inside strings are not structure
                    if (ch === '{' || ch === '[') stack.push(ch === '{' ? '}' : ']');
                    else if (ch === '}' || ch === ']') {
                        stack.pop();
                        if (stack.length === 0) { end = i + 1; break; }
                    }
                }

                if (end === -1) {
                    // 🆕 V14.89: models sometimes omit only the trailing bracket(s) while the payload
                    // itself is complete. Repair that rather than discarding a usable answer — but
                    // only when the content is genuinely finished: not mid-string, and not ending on a
                    // comma, either of which would mean real content is missing.
                    const body = raw.slice(start);
                    const trimmed = body.replace(/\s+$/, '');
                    const repairable = !inString && stack.length > 0 && !trimmed.endsWith(',');

                    if (repairable) {
                        const closers = stack.slice().reverse().join('');
                        try {
                            const repaired = JSON.parse(trimmed + closers);
                            console.warn(
                                `[parseLooseJson] 🔧 repaired incomplete JSON by appending "${closers}" ` +
                                `(${closers.length} bracket${closers.length === 1 ? '' : 's'}). ` +
                                `Payload was ${trimmed.length} chars and otherwise complete.`
                            );
                            return repaired;
                        } catch (repairError) {
                            console.error('[parseLooseJson] repair attempt failed:', repairError.message, '| tried:', trimmed + closers);
                        }
                    }

                    console.error(
                        `[parseLooseJson] TRUNCATED or unbalanced JSON — no closing "${close}" found. ` +
                        `Received ${raw.length} chars${inString ? ', ending inside an unterminated string' : ''}` +
                        `${trimmed.endsWith(',') ? ', ending on a comma so content is genuinely missing' : ''}.`,
                        '\nRaw response:', raw
                    );
                    throw new Error(`Incomplete JSON in response (truncated after ${raw.length} characters)`);
                }

                try {
                    return JSON.parse(raw.substring(start, end));
                } catch (e) {
                    console.error('[parseLooseJson] extracted value still invalid:', raw.substring(start, end), '| full raw:', raw);
                    throw e;
                }
            }

            // 🆕 V14.73: Gemini-first with automatic Groq fallback — the same pattern Magic Fill and
            // AI Improve use, packaged so the exercise features can share it. `groqFallback` is the
            // call site's existing Groq path, untouched, and runs whenever Gemini is unavailable or fails.
            async function aiGenerateWithFallback({ label, systemContent = null, userPrompt, maxOutputTokens = 800, temperature = 0.2, json = true, groqFallback }) {
                const geminiKey = geminiApiKey.trim();

                if (geminiReady()) {
                    try {
                        const raw = await callGemini(geminiKey, systemContent, userPrompt, label, { maxOutputTokens, temperature, json });
                        console.log(`%c[${label}] ✨ Model used: GEMINI`, 'color:#4ade80;font-weight:bold');
                        return json ? parseLooseJson(raw) : raw.trim();
                    } catch (e) {
                        console.warn(`%c[${label}] ↩️ Falling back to GROQ — reason: ${e.message}`, 'color:#fb923c;font-weight:bold');
                    }
                } else if (geminiKey) {
                    // 🆕 V14.73: quota is gone — skip the attempt entirely rather than burn a failed call
                    console.log(`[${label}] ⏭️ Gemini skipped (daily quota exhausted) — using Groq`);
                } else {
                    console.log(`[${label}] ℹ️ No Gemini key configured — using Groq directly`);
                }

                const result = await groqFallback();
                console.log(`%c[${label}] ✨ Model used: GROQ`, 'color:#fb923c;font-weight:bold');
                return result;
            }

            // 🆕 V14.84: the synonyms field must be a comma-separated list of terms and nothing else.
            // Groq returned prose for "overturn" — "upset, reverse, overturn is often used as a verb,
            // so other synonyms are overturn's verb forms: capsize, topple" — and with ~4,300 records
            // to generate, a systematic tendency would be expensive to undo later.
            function sanitiseSynonyms(rawSynonyms, vocabularyWord) {
                const entries = String(rawSynonyms || '').split(',').map(s => s.trim()).filter(Boolean);
                const word = String(vocabularyWord || '').trim().toLowerCase();
                const kept = [], dropped = [];

                for (const entry of entries) {
                    const lower = entry.toLowerCase();
                    let reason = null;

                    if (word && (lower === word || new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(lower))) {
                        reason = 'contains the vocabulary word';
                    } else if (entry.split(/\s+/).length > 5) {
                        reason = 'too long to be a term';
                    } else if (/:\s/.test(entry) || /\bis\b/.test(lower) || /\bare\b/.test(lower)) {
                        reason = 'reads as a sentence';
                    }

                    if (reason) dropped.push({ entry, reason }); else kept.push(entry);
                }

                return { clean: kept.join(', '), kept, dropped };
            }

            // Keeps the valid entries and drops the rest, rather than failing the whole record.
            function cleanSynonymsField(rawSynonyms, vocabularyWord, tag = '[Synonyms]') {
                const { clean, dropped } = sanitiseSynonyms(rawSynonyms, vocabularyWord);
                if (dropped.length) {
                    console.warn(`${tag} dropped ${dropped.length} invalid synonym entr${dropped.length === 1 ? 'y' : 'ies'} for "${vocabularyWord}":`,
                        dropped.map(d => `"${d.entry}" (${d.reason})`).join(' | '),
                        clean ? `→ kept: "${clean}"` : '→ nothing valid left, leaving synonyms empty');
                }
                return clean;
            }

            // 🆕 V14.86: the gpt-oss models format answers as markdown where Llama returned plain
            // prose, so **bold** and "- " bullets were rendering literally. Several prompts explicitly
            // ASK for bold labels and bullets, so the right fix is to render them rather than strip.
            // Renders React elements, never HTML, so AI output cannot inject markup.
            const AIText = ({ text, className = '' }) => {
                if (!text || !String(text).trim()) return null;

                // gpt-oss often runs bullets together on one line ("... context. - **Target Idiom**: ...")
                const normalised = String(text)
                    .replace(/\s+[-*•]\s+(?=\*\*)/g, '\n- ')
                    .replace(/\s*\n\s*/g, '\n');

                const lines = normalised.split('\n').map(l => l.trim()).filter(Boolean);

                const renderInline = (s, keyPrefix) =>
                    String(s).split(/(\*\*[^*]+\*\*)/g).filter(p => p !== '').map((part, i) =>
                        /^\*\*[^*]+\*\*$/.test(part)
                            ? <strong key={`${keyPrefix}${i}`} className="font-black">{part.slice(2, -2)}</strong>
                            : <React.Fragment key={`${keyPrefix}${i}`}>{part}</React.Fragment>
                    );

                return (
                    <div className={className}>
                        {lines.map((line, i) => {
                            const isBullet = /^[-*•]\s+/.test(line);
                            const content = isBullet
                                ? line.replace(/^[-*•]\s+/, '')
                                : line.replace(/^#{1,6}\s*/, '');
                            return isBullet ? (
                                <div key={i} className="flex gap-1.5 mt-1 first:mt-0">
                                    <span className="opacity-50 flex-shrink-0">•</span>
                                    <span>{renderInline(content, `${i}-`)}</span>
                                </div>
                            ) : (
                                <p key={i} className="mt-1 first:mt-0">{renderInline(content, `${i}-`)}</p>
                            );
                        })}
                    </div>
                );
            };

            // 🆕 V14.81: provenance dot. Deliberately not a table column — the list is dense and
            // mostly used on mobile, so this rides alongside the word itself.
            const AiSourceDot = ({ source }) => {
                if (source !== 'gemini' && source !== 'groq') return null;
                return (
                    <span
                        title={AI_SOURCE_LABELS[source]}
                        className={`inline-block w-2 h-2 rounded-full align-middle ml-1.5 flex-shrink-0 ${
                            source === 'gemini' ? 'bg-blue-400' : 'bg-orange-400'
                        }`}
                    />
                );
            };

            // 🆕 V14.67: Shared "which model wrote this" chip
            // 🆕 V14.68: filled rather than translucent — the AI Improve panel is itself green,
            // so a tinted green chip would disappear into its background
            const ModelBadge = ({ model, prominent }) => {
                if (!model) return null;
                const isGemini = model === 'Gemini';
                return (
                    <div className={`flex items-center gap-2 flex-wrap ${prominent ? 'justify-center' : ''}`}>
                        <span className={`font-black rounded-full border-2 whitespace-nowrap shadow-lg ${
                            prominent ? 'text-xs px-3 py-1.5' : 'text-[10px] px-2 py-0.5'
                        } ${
                            isGemini
                                ? 'bg-green-400 text-green-950 border-green-200 shadow-green-500/30'
                                : 'bg-orange-400 text-orange-950 border-orange-200 shadow-orange-500/30'
                        }`}>{isGemini ? '✨' : '⚡'} Generated by {model}</span>
                    </div>
                );
            };

            // 🆕 V13.0: Separate API call for usage frequency — always reliable
            // 🆕 V13.2: Usage frequency — precise, using 70b model
            async function fetchUsageInfo(word) {
                const apiKey = groqApiKey.trim();
                if (!apiKey || !word) return;
                try {
                    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                        body: JSON.stringify({
                            model: GROQ_MODEL_LARGE,
                            messages: [{ 
                                role: 'system', 
                                content: 'You are an expert corpus linguist. You classify English words by their real-world usage frequency based on major English corpora (BNC, COCA). Reply ONLY with valid JSON, nothing else.' 
                            }, { 
                                role: 'user', 
                                content: `Classify the English word/expression "${word}":

1. USAGE: Based on actual corpus frequency data, classify as ONE of:
   - "very common" = top 3000 words, used daily in speech and writing (e.g. "big", "run", "happy")
   - "common" = top 10000 words, regularly used in educated conversation, journalism, reviews (e.g. "unsettling", "sturdy", "reluctant")  
   - "uncommon" = used but not everyday, more typical of formal or academic writing (e.g. "auspicious", "beguile", "pernicious")
   - "rare" = seldom encountered, highly specialised or archaic (e.g. "defenestrate", "sesquipedalian")
   - "formal" = common in formal/professional contexts but unusual in casual speech (e.g. "henceforth", "notwithstanding")
   - "literary" = common in literature but uncommon in everyday speech (e.g. "ethereal", "ephemeral")

2. ALTERNATIVE: If there is a MORE COMMONLY USED word/phrase that is an EXACT synonym (truly interchangeable, same meaning), provide it. 
   - ONLY exact synonyms that could directly replace "${word}" in any sentence
   - If "${word}" is already very common or has no more common exact synonym, use empty string ""
   - Do NOT provide "near-synonyms" or "related words" — only true drop-in replacements

Reply ONLY: {"usage":"...","alternative":"..."}`
                            }],
                            temperature: 0.0,
                            max_tokens: 400, reasoning_effort: GROQ_REASONING_EFFORT
                        })
                    });
                    if (!resp.ok) { console.warn('Usage API error:', resp.status); return; }
                    const data = await resp.json();
                    // 🆕 V14.88: hardened parser instead of a lastIndexOf slice + bare JSON.parse
                    const result = parseLooseJson(groqContent('usage-info', data));
                    if (result.usage) {
                        setUsageInfo({ word, usage: result.usage, alternative: result.alternative || '' });
                    }
                } catch(e) {
                    console.warn('Usage info fetch error:', e);
                }
            }
            const [dupCheck, setDupCheck] = useState({ loading: false, morphLoading: false, exact: [], partial: [], morphForms: [], term: '' });
            const dupDebounceTimer = React.useRef(null);
            const voiceRunningRef = useRef(false);
            const voiceRecognitionRef = useRef(null);
            const voiceScrollRef = useRef(null);
            const [showImproveModal, setShowImproveModal] = useState(false);
            const [improveData, setImproveData] = useState(null);
            const [showMergeModal, setShowMergeModal] = useState(false);
            const [mergeData, setMergeData] = useState(null);
            const [selectedSimilar, setSelectedSimilar] = useState(null);
            const [showFlashcards, setShowFlashcards] = useState(false);
            const [flashcardWords, setFlashcardWords] = useState([]);
            const [flashcardIndex, setFlashcardIndex] = useState(0);
            const [isFlipped, setIsFlipped] = useState(false);
            const [fieldSelections, setFieldSelections] = useState({ 
                vocabulary: 'current', 
                synonyms: 'current', 
                context: 'current', 
                level: 'current', 
                family: 'current',
                keepSynonyms: [],
                deleteSynonyms: []
            });
            const [findingSimilar, setFindingSimilar] = useState(null);
            const [spellCheckResult, setSpellCheckResult] = useState(null); // 🆕 V11.96
            const [spellCheckLoading, setSpellCheckLoading] = useState(false); // 🆕 V11.96 // 🆕 V11.93: Independent AI toggle for Find & Merge
            const [addModalAIMode, setAddModalAIMode] = useState(false); // 🆕 V11.93: Independent AI toggle for Add modal
            const [magicFillPrompt, setMagicFillPrompt] = useState(localStorage.getItem('magic_fill_prompt') || 'For the English word/expression "{word}", provide:\n\n1. SYNONYMS: ONLY a comma-separated list of 2-4 British English synonyms — terms only, no explanation or commentary\n   - IMPORTANT: Synonyms MUST match the same grammatical FAMILY as "{word}"\n   - Example: If "{word}" is a phrasal verb, give phrasal verb synonyms\n   - Example: If "{word}" is an idiom, give idiomatic expression synonyms\n\n2. CONTEXT: A natural sentence (12-15 words) using EXACTLY "{word}" in British English\n   ⛔ CRITICAL: You MUST use the EXACT word/phrase "{word}" in your sentence\n   ⛔ DO NOT use synonyms - use "{word}" EXACTLY as written\n   ⛔ DO NOT substitute with similar words\n   ✅ EXAMPLE: If word is "suck at", sentence MUST contain "suck at" or "sucked at"\n   ✅ EXAMPLE: If word is "keep in check", sentence MUST contain "keep in check"\n   - The sentence should demonstrate correct grammatical function\n   - Make it sound natural and conversational\n\n3. FAMILY: Choose ONE that matches the PRIMARY grammatical function:\n   - Noun: Names a thing/person/concept\n   - Adjective: Describes a noun\n   - Adverb: Modifies verb/adjective (often ends in -ly)\n   - Verb: Action or state word\n   - Phrasal Verb: Verb + preposition (give up, look after)\n   - Idiom: Fixed expression with non-literal meaning (piece of cake, break the ice)\n   - Preposition: Word showing relationship (in, on, at, by, with, about)\n   - Chunk: Multi-word expression or collocation\n\nREMINDER: The context sentence MUST include "{word}" exactly - no synonyms!\n\nRespond ONLY in this exact JSON format (no markdown, no backticks):\n{\n  "synonyms": "synonym1, synonym2, synonym3",\n  "context": "Example sentence with {word} here.",\n  "family": "Noun",\n  "usage": "very common|common|uncommon|rare|formal|informal|literary",\n  "alternative": "more commonly used word/phrase, or empty string if already very common"\n}');
            
            // 🆕 V11.2: New states
            // 🆕 V11.24: Search mode (0=vocabulary only, 1=vocabulary+synonyms, 2=AI Deep Search)
            const [searchMode, setSearchMode] = useState(0);
            const [deepSearchLoading, setDeepSearchLoading] = useState(false);
            const [showRecycleBin, setShowRecycleBin] = useState(false);
            const [deletedWords, setDeletedWords] = useState([]);
            const [selectedForRestore, setSelectedForRestore] = useState([]);
            
            // 🆕 V11.21: Change History states
            const [showChangeHistory, setShowChangeHistory] = useState(false);
            const [changedWords, setChangedWords] = useState([]);
            const [selectedForHistory, setSelectedForHistory] = useState([]);
            
            // 🆕 V11.4: Recycle bin count & Dictation
            const [recycleBinCount, setRecycleBinCount] = useState(0);
            const [changeHistoryCount, setChangeHistoryCount] = useState(0); // 🆕 V11.24
            const [showDictation, setShowDictation] = useState(false);
            const [dictationWords, setDictationWords] = useState([]);
            const [dictationIndex, setDictationIndex] = useState(0);
            const [dictationInput, setDictationInput] = useState('');
            const [showDictationAnswer, setShowDictationAnswer] = useState(false);
            const [dictationErrorCount, setDictationErrorCount] = useState(0); // 🆕 V11.5
            const [dictationNoticeCount, setDictationNoticeCount] = useState(0); // 🆕 V14.74: variants, never counted as errors
            const [dictationDifficulty, setDictationDifficulty] = useState(''); // 🆕 V11.5
            
            // 🆕 V11.12: Dictation playback control
            const [dictationPlayCount, setDictationPlayCount] = useState(0);
            const [dictationPlaySpeed, setDictationPlaySpeed] = useState('normal');
            const MAX_DICTATION_PLAYS = 4;
            
            // 🆕 V14.6: Dictation AI feedback states
            const [dictationDiff, setDictationDiff] = useState(null); // 🆕 V14.75: single source of truth
            const [dictationExplanations, setDictationExplanations] = useState(null); // 🆕 V14.75: AI text only
            const [dictationAILoading, setDictationAILoading] = useState(false);
            const [dictationPopup, setDictationPopup] = useState(null);
            
            // 🆕 V11.11: Selection exercise states
            const [showSelection, setShowSelection] = useState(false);
            const [selectionWords, setSelectionWords] = useState([]);
            const [selectionIndex, setSelectionIndex] = useState(0);
            const [selectionOptions, setSelectionOptions] = useState([]);
            const [selectedAnswer, setSelectedAnswer] = useState(null);
            const [showSelectionAnswer, setShowSelectionAnswer] = useState(false);
            const [selectionAttempts, setSelectionAttempts] = useState(0);
            const [selectionDifficulty, setSelectionDifficulty] = useState('');
            
            // 🆕 V11.64: Wrong answers tracking & explanation
            const [selectionWrongAnswers, setSelectionWrongAnswers] = useState([]);
            const [selectionExplanation, setSelectionExplanation] = useState('');
            const [selectionExplLoading, setSelectionExplLoading] = useState(false);
            
            // 🆕 V11.64: Guesswork synonym state
            const [showGuessworkSynonymModal, setShowGuessworkSynonymModal] = useState(false);
            
            // 🆕 V11.16: Selection countdown (blur options)
            const [selectionCountdown, setSelectionCountdown] = useState(
                parseInt(localStorage.getItem('selection_countdown') || '5')
            );
            const [selectionTimeLeft, setSelectionTimeLeft] = useState(0);
            const [selectionOptionsVisible, setSelectionOptionsVisible] = useState(false);
            
            // 🆕 V11.16: Guesswork exercise states
            const [showGuesswork, setShowGuesswork] = useState(false);
            const [guessworkWords, setGuessworkWords] = useState([]);
            const [guessworkIndex, setGuessworkIndex] = useState(0);
            const [guessworkInput, setGuessworkInput] = useState('');
            const [showGuessworkAnswer, setShowGuessworkAnswer] = useState(false);
            const [guessworkDifficulty, setGuessworkDifficulty] = useState('');
            const [guessworkAttempts, setGuessworkAttempts] = useState(0);
            const [guessworkAIValidating, setGuessworkAIValidating] = useState(false);
            const [guessworkAIResult, setGuessworkAIResult] = useState(null);
            const [showGuessworkHint, setShowGuessworkHint] = useState(false); // 🆕 V11.20
            const [guessworkHintMeaning, setGuessworkHintMeaning] = useState(''); // 🆕 V11.22
            const [guessworkHintLoading, setGuessworkHintLoading] = useState(false); // 🆕 V11.22
            
            // 🆕 V11.31: Translation exercise states
            const [showTranslation, setShowTranslation] = useState(false);
            const [translationWords, setTranslationWords] = useState([]);
            const [translationIndex, setTranslationIndex] = useState(0);
            const [translationSpanish, setTranslationSpanish] = useState('');
            const [translationInput, setTranslationInput] = useState('');
            const [showTranslationAnswer, setShowTranslationAnswer] = useState(false);
            const [translationDifficulty, setTranslationDifficulty] = useState('');
            const [translationAttempts, setTranslationAttempts] = useState(0);
            const [translationAIValidating, setTranslationAIValidating] = useState(false);
            const [translationAIResult, setTranslationAIResult] = useState(null);
            const [showTranslationHint, setShowTranslationHint] = useState(false); // 🆕 V14.76
            const [translationHintMeaning, setTranslationHintMeaning] = useState(''); // 🆕 V14.76
            const [translationHintLoading, setTranslationHintLoading] = useState(false); // 🆕 V14.76
            const [translationLoading, setTranslationLoading] = useState(false);
            const [translationVoiceListening, setTranslationVoiceListening] = useState(false); // 🆕 V11.38: Voice-to-text
            
            // 🆕 V13.7: Writing exercise states
            const [showWriting, setShowWriting] = useState(false);
            const [writingWords, setWritingWords] = useState([]);
            const [writingText, setWritingText] = useState('');
            const [writingFeedback, setWritingFeedback] = useState(null);
            const [writingLoading, setWritingLoading] = useState(false);
            const [writingWordCount, setWritingWordCount] = useState(0);
            const [writingPopup, setWritingPopup] = useState(null); // {x, y, yAbove, correction}
            const [translationPopup, setTranslationPopup] = useState(null); // 🆕 V14.6: clickable correction popup
            
            // 🆕 V11.41: Stats dashboard states
            const [showStats, setShowStats] = useState(false);
            const [statsData, setStatsData] = useState(null);
            const [loadingStats, setLoadingStats] = useState(false);
            
            // 🆕 V11.47: Reset confirmation modal
            const [showResetConfirm, setShowResetConfirm] = useState(false);
            const [resetType, setResetType] = useState(null); // 'difficulty', 'stats', 'all'
            
            // 🆕 V11.44: Exercise drill-down states
            const [showExerciseDrillDown, setShowExerciseDrillDown] = useState(false);
            const [drillDownExercise, setDrillDownExercise] = useState(null);
            const [drillDownWords, setDrillDownWords] = useState([]);
            const [selectedDrillDownWords, setSelectedDrillDownWords] = useState([]);

            
            // 🆕 V11.6: Exercise modes and audio control
            const [exerciseMode, setExerciseMode] = useState('random'); // 'random' or 'memory'
            const [flashcardAudioEnabled, setFlashcardAudioEnabled] = useState(
                localStorage.getItem('flashcard_audio') !== 'false'
            );
            
            // 🆕 V11.7: Preferred voice selection
            const [preferredVoice, setPreferredVoice] = useState(
                localStorage.getItem('preferred_voice') || 'auto'
            );
            const [availableVoices, setAvailableVoices] = useState([]);
            
            const searchInputRef = useRef(null);

            // 🆕 V11.7: Load available voices
            useEffect(() => {
                const loadVoices = () => {
                    const voices = window.speechSynthesis.getVoices();
                    // Filter British English voices
                    const gbVoices = voices.filter(v => 
                        v.lang.includes('en-GB') || v.lang.includes('en_GB') || v.lang.includes('GB')
                    );
                    setAvailableVoices(gbVoices.length > 0 ? gbVoices : voices.filter(v => v.lang.startsWith('en')));
                };
                
                loadVoices();
                if (window.speechSynthesis.onvoiceschanged !== undefined) {
                    window.speechSynthesis.onvoiceschanged = loadVoices;
                }
            }, []);

            // 🆕 V11.28: Auto-focus search input on mount
            useEffect(() => {
                if (searchInputRef.current) {
                    searchInputRef.current.focus();
                }
            }, []);

            // 🆕 V11.6: Auto-play audio when flashcard flips
            useEffect(() => {
                if (showFlashcards && isFlipped && flashcardAudioEnabled && flashcardWords[flashcardIndex]?.context) {
                    // Small delay to let the flip animation complete
                    setTimeout(() => {
                        speakText(flashcardWords[flashcardIndex].context, 1.0);
                    }, 300);
                }
            }, [isFlipped, flashcardIndex, showFlashcards]);

            // 🆕 V11.14: Handle second Enter key in Dictation (after answer shown)
            useEffect(() => {
                if (!showDictation || !showDictationAnswer) return;
                
                const handleEnterAfterCheck = async (e) => {
                    // 🆕 V11.18: Ignore if Enter comes from textarea/input to prevent double execution
                    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') {
                        return;
                    }
                    
                    if (e.key === 'Enter' && showDictationAnswer) {
                        e.preventDefault();
                        
                        // Save difficulty
                        try {
                            const currentDictationWord = dictationWords[dictationIndex];
                                                        await supabase.from('vocabulary_v4').update({ 

                                                            dictation_count: (currentDictationWord.dictation_count || 0) + 1,
                                                            dictation_errors_total: (currentDictationWord.dictation_errors_total || 0) + dictationErrorCount,
                                                            last_practiced_date: new Date().toISOString()
                                                        }).eq('id', currentDictationWord.id);
                        } catch (error) {
                            console.error('Error saving difficulty:', error);
                        }
                        
                        // Move to next word
                        if (dictationIndex < dictationWords.length - 1) {
                            const nextIndex = dictationIndex + 1;
                            setDictationIndex(nextIndex);
                            setDictationInput('');
                            setShowDictationAnswer(false);
                            setDictationErrorCount(0);
                            setDictationDifficulty('');
                            setDictationPlayCount(0);
                            setDictationPlaySpeed('normal');
                            setDictationExplanations(null); setDictationDiff(null); setDictationNoticeCount(0);
                            setDictationPopup(null);
                            
                            // Auto-play the next word after a short delay
                            setTimeout(() => {
                                if (dictationWords[nextIndex]?.context) {
                                    speakText(dictationWords[nextIndex].context, 1.0);
                                }
                            }, 500);
                        } else {
                            alert('🎉 Exercise completed!');
                            setShowDictation(false);
                            setDictationWords([]);
                            setDictationIndex(0);
                            setDictationInput('');
                            setShowDictationAnswer(false);
                            setDictationErrorCount(0);
                            setDictationDifficulty('');
                            setDictationPlayCount(0);
                            setDictationPlaySpeed('normal');
                            setShowExercisesModal(true);
                        }
                    }
                };
                
                window.addEventListener('keydown', handleEnterAfterCheck);
                return () => window.removeEventListener('keydown', handleEnterAfterCheck);
            }, [showDictation, showDictationAnswer, dictationIndex, dictationWords, dictationDifficulty]);

            // 🆕 V11.26: Handle second Enter key in Guesswork (after answer shown)
            useEffect(() => {
                if (!showGuesswork || !showGuessworkAnswer) return;
                
                const handleEnterAfterCheck = async (e) => {
                    // Ignore if Enter comes from textarea/input to prevent double execution
                    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') {
                        return;
                    }
                    
                    if (e.key === 'Enter' && showGuessworkAnswer) {
                        e.preventDefault();
                        
                        // Save difficulty
                        try {
                            const currentGuessworkWord = guessworkWords[guessworkIndex];
                                                    try {
                                                        await supabase.from('vocabulary_v4').update({ 
                                                            difficulty: guessworkDifficulty || 'Emerging',
                                                            guesswork_count: (currentGuessworkWord.guesswork_count || 0) + 1,
                                                            last_practiced_date: new Date().toISOString()
                                                        }).eq('id', currentGuessworkWord.id);
                                                    } catch (colErr) {
                                                        // guesswork_count column missing - save without it
                                                        await supabase.from('vocabulary_v4').update({ 
                                                            difficulty: guessworkDifficulty || 'Emerging',
                                                            last_practiced_date: new Date().toISOString()
                                                        }).eq('id', currentGuessworkWord.id);
                                                        console.warn('guesswork_count column missing - run DB migration in Settings');
                                                    }
                                                        // Update local state to keep counts accurate
                                                        const updatedGW = {...currentGuessworkWord, difficulty: guessworkDifficulty || 'Emerging', guesswork_count: (currentGuessworkWord.guesswork_count || 0) + 1};
                                                        setGuessworkWords(prev => prev.map(w => w.id === currentGuessworkWord.id ? updatedGW : w));
                                                        setWords(prev => prev.map(w => w.id === currentGuessworkWord.id ? updatedGW : w));
                        } catch (error) {
                            console.error('Error saving difficulty:', error);
                        }
                        
                        // Move to next word or finish
                        if (guessworkIndex < guessworkWords.length - 1) {
                            setGuessworkIndex(guessworkIndex + 1);
                            setGuessworkInput('');
                            setShowGuessworkAnswer(false);
                            setGuessworkDifficulty('');
                            setGuessworkAttempts(0);
                            setGuessworkAIResult(null);
                        } else {
                            alert('🎉 Exercise completed!');
                            setShowGuesswork(false);
                            setGuessworkWords([]);
                            setGuessworkIndex(0);
                            setGuessworkInput('');
                            setShowGuessworkAnswer(false);
                            setGuessworkDifficulty('');
                            setGuessworkAttempts(0);
                            setGuessworkAIResult(null);
                            setShowExercisesModal(true);
                        }
                    }
                };
                
                window.addEventListener('keydown', handleEnterAfterCheck);
                return () => window.removeEventListener('keydown', handleEnterAfterCheck);
            }, [showGuesswork, showGuessworkAnswer, guessworkIndex, guessworkWords, guessworkDifficulty]);

            // 🆕 V11.32: Handle second Enter key in Translation (after answer shown)
            useEffect(() => {
                if (!showTranslation || !showTranslationAnswer) return;
                
                const handleEnterAfterCheck = async (e) => {
                    // Ignore if Enter comes from textarea/input to prevent double execution
                    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') {
                        return;
                    }
                    
                    if (e.key === 'Enter' && showTranslationAnswer) {
                        e.preventDefault();
                        
                        // Save difficulty
                        try {
                            const currentTranslationWord = translationWords[translationIndex];
                            await supabase
                                .from('vocabulary_v4')
                                .update({ 

                                    translation_count: (currentTranslationWord.translation_count || 0) + 1,
                                    translation_best_grade: translationAIResult?.grade || currentTranslationWord.translation_best_grade,
                                    last_practiced_date: new Date().toISOString()
                                })
                                .eq('id', currentTranslationWord.id);
                        } catch (error) {
                            console.error('Error saving difficulty:', error);
                        }
                        
                        // Move to next word or finish
                        if (translationIndex < translationWords.length - 1) {
                            const nextIndex = translationIndex + 1;
                            setTranslationIndex(nextIndex);
                            setTranslationInput(''); setShowTranslationHint(false); setTranslationHintMeaning('');
                            setShowTranslationAnswer(false);
                            setTranslationDifficulty('');
                            setTranslationAttempts(0);
                            setTranslationAIResult(null);
                            // Generate translation for next word
                            await generateSpanishTranslation(translationWords[nextIndex].context);
                        } else {
                            alert('🎉 Exercise completed!');
                            setShowTranslation(false);
                            setTranslationWords([]);
                            setTranslationIndex(0);
                            setTranslationSpanish('');
                            setTranslationInput(''); setShowTranslationHint(false); setTranslationHintMeaning('');
                            setShowTranslationAnswer(false);
                            setTranslationDifficulty('');
                            setTranslationAttempts(0);
                            setTranslationAIResult(null);
                            setShowExercisesModal(true);
                        }
                    }
                };
                
                window.addEventListener('keydown', handleEnterAfterCheck);
                return () => window.removeEventListener('keydown', handleEnterAfterCheck);
            }, [showTranslation, showTranslationAnswer, translationIndex, translationWords, translationDifficulty]);

            // 🆕 V11.16: Selection countdown timer
            useEffect(() => {
                if (!showSelection || selectionCountdown === 0) {
                    setSelectionOptionsVisible(true);
                    return;
                }
                
                // Reset countdown and hide options when question changes
                setSelectionTimeLeft(selectionCountdown);
                setSelectionOptionsVisible(false);
                
                const interval = setInterval(() => {
                    setSelectionTimeLeft(prev => {
                        if (prev <= 1) {
                            setSelectionOptionsVisible(true);
                            return 0;
                        }
                        return prev - 1;
                    });
                }, 1000);
                
                return () => clearInterval(interval);
            }, [showSelection, selectionIndex, selectionCountdown]);

            // 🆕 V11.91: Debounced search to avoid excessive DB calls
            const searchDebounceRef = useRef(null);
            useEffect(() => { 
                if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
                searchDebounceRef.current = setTimeout(() => {
                    fetchWords(0, true); 
                }, search ? 150 : 0);
                return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
            }, [search, familyFilter, emptyFilter, difficultyFilter, favouriteLevel, searchMode]);

            // 🆕 V14.78: keep the batch button's pending total in step with the active filters
            useEffect(() => {
                refreshPendingTotal();
            }, [search, familyFilter, difficultyFilter, favouriteLevel, emptyFilter, supabaseUrl, supabaseKey]);

            // Auto-scroll voice modal conversation to bottom on new messages or live transcript
            useEffect(() => {
                if (voiceScrollRef.current) {
                    voiceScrollRef.current.scrollTop = voiceScrollRef.current.scrollHeight;
                }
            }, [voiceHistory, voiceLiveTranscript]);

            // 🆕 V11.4: Check recycle bin count on mount
            useEffect(() => {
                checkRecycleBinCount();
                checkChangeHistoryCount(); // 🆕 V11.24
            }, []);

            // 🆕 V11.2: Auto-cleanup deleted words older than 48h
            useEffect(() => {
                const cleanupInterval = setInterval(async () => {
                    if (!supabase) return;
                    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
                    await supabase
                        .from('vocabulary_v4')
                        .delete()
                        .not('deleted_at', 'is', null)
                        .lt('deleted_at', fortyEightHoursAgo);
                    checkRecycleBinCount(); // 🆕 V11.4: Update count after cleanup
                }, 60 * 60 * 1000); // Check every hour

                return () => clearInterval(cleanupInterval);
            }, []);

            // 🆕 V11.4: Check recycle bin count
            async function checkRecycleBinCount() {
                if (!supabase) return;
                const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
                const { count } = await supabase
                    .from('vocabulary_v4')
                    .select('*', { count: 'exact', head: true })
                    .not('deleted_at', 'is', null)
                    .gte('deleted_at', fortyEightHoursAgo);
                
                setRecycleBinCount(count || 0);
            }

            // 🆕 V11.42: Toggle favourite level (0 → 1 → 2 → 0)
            async function toggleFavourite(wordId, currentLevel) {
                const nextLevel = (currentLevel + 1) % 3;
                
                try {
                    await supabase
                        .from('vocabulary_v4')
                        .update({ favourite: nextLevel })
                        .eq('id', wordId);
                    
                    // Update local state without refreshing
                    setWords(prevWords => 
                        prevWords.map(w => w.id === wordId ? { ...w, favourite: nextLevel } : w)
                    );
                    
                    // Update in all active exercise contexts
                    if (showFlashcards) {
                        setFlashcardWords(prevWords => 
                            prevWords.map(w => w.id === wordId ? { ...w, favourite: nextLevel } : w)
                        );
                    }
                    if (showDictation) {
                        setDictationWords(prevWords => 
                            prevWords.map(w => w.id === wordId ? { ...w, favourite: nextLevel } : w)
                        );
                    }
                    if (showSelection) {
                        setSelectionWords(prevWords => 
                            prevWords.map(w => w.id === wordId ? { ...w, favourite: nextLevel } : w)
                        );
                    }
                    if (showGuesswork) {
                        setGuessworkWords(prevWords => 
                            prevWords.map(w => w.id === wordId ? { ...w, favourite: nextLevel } : w)
                        );
                    }
                    if (showTranslation) {
                        setTranslationWords(prevWords => 
                            prevWords.map(w => w.id === wordId ? { ...w, favourite: nextLevel } : w)
                        );
                    }
                    if (showWriting) {
                        setWritingWords(prevWords => 
                            prevWords.map(w => w.id === wordId ? { ...w, favourite: nextLevel } : w)
                        );
                    }
                } catch (error) {
                    console.error('Error toggling favourite:', error);
                }
            }

            // 🆕 V11.24: Check change history count
            async function checkChangeHistoryCount() {
                if (!supabase) return;
                const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
                const { count } = await supabase
                    .from('vocabulary_v4')
                    .select('*', { count: 'exact', head: true })
                    .not('modified_at', 'is', null)
                    .not('previous_version', 'is', null)
                    .gte('modified_at', twoHoursAgo)
                    .is('deleted_at', null);
                
                setChangeHistoryCount(count || 0);
            }


            // 🆕 V11.42: Star icon component for favourite levels
            const StarIcon = ({ level, size = "text-xl", onClick }) => {
                const getStarClass = () => {
                    if (level === 0) return 'far fa-star star-off';
                    if (level === 1) return 'fas fa-star-half-alt star-half';
                    return 'fas fa-star star-on';
                };
                
                return (
                    <button onClick={onClick} className="tooltip" data-tip={
                        level === 0 ? "Not favourite" :
                        level === 1 ? "Favourite level 1" :
                        "Favourite level 2"
                    }>
                        <i className={`${getStarClass()} ${size}`}></i>
                    </button>
                );
            };


            // 🆕 V11.26: Smart partial matching - finds phrases even with missing words
            function highlightWordInContext(context, vocabulary) {
                if (!context || !vocabulary) return context;
                
                const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                
                // 1. Try EXACT match first (fastest path)
                const escapedVocab = escapeRegex(vocabulary);
                let regex = new RegExp(`\\b${escapedVocab}\\b`, 'gi');
                let match = context.match(regex);
                
                if (match) {
                    const parts = context.split(regex);
                    let matchIndex = 0;
                    return parts.map((part, index) => {
                        if (index < parts.length - 1) {
                            return (
                                <React.Fragment key={index}>
                                    {part}
                                    <strong className="text-white font-black">{match[matchIndex++]}</strong>
                                </React.Fragment>
                            );
                        }
                        return part;
                    });
                }
                
                // 2. For SINGLE words: try conjugations
                if (!vocabulary.includes(' ')) {
                    const vocabLower = vocabulary.toLowerCase();
                    const variations = [
                        vocabLower + 's', vocabLower + 'es', vocabLower + 'ed', vocabLower + 'd',
                        vocabLower + 'ing', vocabLower.replace(/e$/, '') + 'ing',
                        vocabLower.replace(/y$/, 'ies'), vocabLower.replace(/y$/, 'ied')
                    ];
                    
                    for (const variation of variations) {
                        const escapedVar = escapeRegex(variation);
                        const varRegex = new RegExp(`\\b${escapedVar}\\b`, 'gi');
                        const varMatch = context.match(varRegex);
                        
                        if (varMatch) {
                            const parts = context.split(varRegex);
                            let matchIndex = 0;
                            return parts.map((part, index) => {
                                if (index < parts.length - 1) {
                                    return (
                                        <React.Fragment key={index}>
                                            {part}
                                            <strong className="text-white font-black">{varMatch[matchIndex++]}</strong>
                                        </React.Fragment>
                                    );
                                }
                                return part;
                            });
                        }
                    }
                    return context;
                }
                
                // 3. For PHRASES: smart partial matching
                const vocabLower = vocabulary.toLowerCase();
                
                // Try without optional prefixes first
                const optionalPrefixes = ['not ', 'to ', 'just ', 'a ', 'an ', 'the '];
                let coreVocab = vocabLower;
                
                for (const prefix of optionalPrefixes) {
                    if (vocabLower.startsWith(prefix)) {
                        coreVocab = vocabLower.substring(prefix.length);
                        
                        // Try exact match without prefix
                        const escapedCore = escapeRegex(coreVocab);
                        const coreRegex = new RegExp(`\\b${escapedCore}\\b`, 'gi');
                        const coreMatch = context.match(coreRegex);
                        
                        if (coreMatch) {
                            const parts = context.split(coreRegex);
                            let matchIndex = 0;
                            return parts.map((part, index) => {
                                if (index < parts.length - 1) {
                                    return (
                                        <React.Fragment key={index}>
                                            {part}
                                            <strong className="text-white font-black">{coreMatch[matchIndex++]}</strong>
                                        </React.Fragment>
                                    );
                                }
                                return part;
                            });
                        }
                        break;
                    }
                }
                
                // 3.5. Gap matching: handles idioms with inserted words (e.g. "keep in check" -> "keep inflation in check")
                const gapCoreWords = coreVocab.split(/\s+/);
                if (gapCoreWords.length >= 2) {
                    const escapedGapWords = gapCoreWords.map(w => escapeRegex(w));
                    const gapPatStr = escapedGapWords.join('(?:\\s+(?:\\w+\\s+){0,2}?)');
                    const flexGapRegex = new RegExp('\\b' + gapPatStr + '\\b', 'gi');
                    const gapMatchArr = context.match(flexGapRegex);
                    if (gapMatchArr) {
                        const parts = context.split(flexGapRegex);
                        let gapMatchIdx = 0;
                        return parts.map((part, index) => {
                            if (index < parts.length - 1) {
                                const span = gapMatchArr[gapMatchIdx++];
                                // Within matched span, bold only the vocab core words (not inserted words)
                                const spanTokens = span.split(/(\s+)/);
                                const highlighted = spanTokens.map((token, ti) => {
                                    const tokenClean = token.toLowerCase().replace(/[^\w]/g, '');
                                    if (tokenClean && gapCoreWords.includes(tokenClean)) {
                                        return <strong key={`g-${index}-${ti}`} className="text-white font-black">{token}</strong>;
                                    }
                                    return token;
                                });
                                return (
                                    <React.Fragment key={index}>
                                        {part}
                                        {highlighted}
                                    </React.Fragment>
                                );
                            }
                            return part;
                        });
                    }
                }

                // 4. Partial word-by-word matching with key words priority
                const vocabWords = coreVocab.split(/\s+/);
                const contextWords = context.split(/\s+/);
                const contextWordsLower = contextWords.map(w => w.toLowerCase());
                
                // Define word types
                const stopWords = ['not', 'to', 'a', 'an', 'the', 'in', 'on', 'at', 'of', 'for', 'with', 'by', 'is', 'are', 'was', 'were', 'just'];
                const flexibleWords = ['my', 'your', 'his', 'her', 'its', 'their', 'our', 'this', 'that', 'these', 'those', 'a', 'an', 'the', 'some', 'any', 'it']; // 🆕 V11.29: Added 'it' for optional pronouns
                const keyWords = vocabWords.filter(w => !stopWords.includes(w) && !flexibleWords.includes(w) && w.length > 2);
                
                let bestMatch = null;
                let bestScore = 0;
                
                // Find the best matching sequence
                for (let start = 0; start < contextWords.length; start++) {
                    let matchedKeyWords = 0;
                    let matchedTotal = 0;
                    let vocabIdx = 0;
                    let contextIdx = start;
                    let endIdx = start;
                    let lastMatchIdx = start;
                    let firstMatchIdx = -1; // 🆕 V11.28: Track where first match starts
                    let matchedIndices = []; // 🆕 V11.29: Track exact indices of matched words
                    
                    while (vocabIdx < vocabWords.length && contextIdx < contextWords.length) {
                        const vocabWord = vocabWords[vocabIdx];
                        const contextWord = contextWordsLower[contextIdx].replace(/[^\w]/g, '');
                        
                        // Check conjugations
                        const isConjugationMatch = contextWord === vocabWord ||
                                                    contextWord === vocabWord + 's' ||
                                                    contextWord === vocabWord + 'es' ||
                                                    contextWord === vocabWord + 'ed' ||
                                                    contextWord === vocabWord + 'd' ||
                                                    contextWord === vocabWord + 'ing' ||
                                                    contextWord === vocabWord.replace(/e$/, '') + 'ing' ||
                                                    contextWord === vocabWord.replace(/y$/, 'ies') ||
                                                    contextWord === vocabWord.replace(/y$/, 'ied');
                        
                        // 🆕 V11.27: Allow flexible word substitutions (your→its, my→her, etc.)
                        const isFlexibleMatch = flexibleWords.includes(vocabWord) && flexibleWords.includes(contextWord);
                        
                        const isMatch = isConjugationMatch || isFlexibleMatch;
                        
                        if (isMatch) {
                            // 🆕 V11.28: Save first match index
                            if (firstMatchIdx === -1) {
                                firstMatchIdx = contextIdx;
                            }
                            matchedIndices.push(contextIdx); // 🆕 V11.29: Save this match index
                            matchedTotal++;
                            if (keyWords.includes(vocabWord)) {
                                matchedKeyWords++;
                            }
                            endIdx = contextIdx;
                            lastMatchIdx = contextIdx;
                            vocabIdx++;
                            contextIdx++;
                        } else {
                            // 🆕 V11.30: If vocab word is optional and doesn't match, skip it without breaking
                            if (flexibleWords.includes(vocabWord)) {
                                // Optional word not found in context - skip it and continue
                                vocabIdx++;
                                // Don't increment contextIdx - try matching next vocab word at same context position
                            } else {
                                // Not optional - search forward in context
                                // 🆕 V11.67: Only skip stopWords/flexibleWords - never skip content words
                                const currentContextWord = contextWordsLower[contextIdx]?.replace(/[^\w]/g, '') || '';
                                const isContextStopWord = stopWords.includes(currentContextWord) || flexibleWords.includes(currentContextWord) || currentContextWord.length <= 2;
                                if (!isContextStopWord) {
                                    // Content word mismatch - this phrase doesn't fit here
                                    break;
                                }
                                contextIdx++;
                                if (matchedTotal > 0 && contextIdx - lastMatchIdx > 3) break;
                            }
                        }
                    }
                    
                    // Calculate scores
                    const keyWordScore = keyWords.length > 0 ? matchedKeyWords / keyWords.length : 0;
                    const totalScore = vocabWords.length > 0 ? matchedTotal / vocabWords.length : 0;
                    
                    // 🆕 V11.27: Prioritize key word matches even more strongly
                    const finalScore = keyWords.length > 0 ? (keyWordScore * 2 + totalScore) / 3 : totalScore;
                    
                    // Accept match if: 70% of key words found OR 50% total words found OR at least 2 words matched
                    if (finalScore > bestScore && (
                        (keyWords.length > 0 && keyWordScore >= 0.7) || 
                        (totalScore >= 0.5) ||
                        matchedTotal >= 2
                    )) {
                        bestScore = finalScore;
                        bestMatch = {
                            start: firstMatchIdx !== -1 ? firstMatchIdx : start, // 🆕 V11.28: Use first match index
                            end: endIdx,
                            words: matchedTotal,
                            keyWords: matchedKeyWords,
                            matchedIndices: matchedIndices // 🆕 V11.29: Save matched indices
                        };
                    }
                }
                
                // 🆕 V11.29: Highlight only matched words, not intermediate words
                if (bestMatch && bestMatch.words >= 2) {
                    const matchedSet = new Set(bestMatch.matchedIndices);
                    const result = [];
                    
                    for (let i = 0; i < contextWords.length; i++) {
                        if (matchedSet.has(i)) {
                            result.push(<strong key={`match-${i}`} className="text-white font-black">{contextWords[i]}</strong>);
                        } else {
                            result.push(contextWords[i]);
                        }
                        
                        // Add space if not last word
                        if (i < contextWords.length - 1) {
                            result.push(' ');
                        }
                    }
                    
                    return <React.Fragment>{result}</React.Fragment>;
                }
                
                return context;
            }

            // 🆕 V11.27: Ultra-flexible matching for hiding words too
            function hideWordInContext(context, vocabulary) {
                if (!context || !vocabulary) return context;
                
                const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                
                // Try exact match first
                const escapedVocab = escapeRegex(vocabulary);
                const exactRegex = new RegExp(`\\b${escapedVocab}\\b`, 'gi');
                if (context.match(exactRegex)) {
                    return context.replace(exactRegex, '______');
                }
                
                // For single words: try conjugations
                if (!vocabulary.includes(' ')) {
                    const vocabLower = vocabulary.toLowerCase();
                    const variations = [
                        vocabLower + 's', vocabLower + 'es', vocabLower + 'ed', vocabLower + 'd',
                        vocabLower + 'ing', vocabLower.replace(/e$/, '') + 'ing',
                        vocabLower.replace(/y$/, 'ies'), vocabLower.replace(/y$/, 'ied')
                    ];
                    
                    for (const variation of variations) {
                        const escapedVar = escapeRegex(variation);
                        const varRegex = new RegExp(`\\b${escapedVar}\\b`, 'gi');
                        if (context.match(varRegex)) {
                            return context.replace(varRegex, '______');
                        }
                    }
                    return context;
                }
                
                // For phrases: try without optional prefixes
                const vocabLower = vocabulary.toLowerCase();
                const optionalPrefixes = ['not ', 'to ', 'just ', 'a ', 'an ', 'the '];
                let coreVocab = vocabLower;
                
                for (const prefix of optionalPrefixes) {
                    if (vocabLower.startsWith(prefix)) {
                        coreVocab = vocabLower.substring(prefix.length);
                        
                        const escapedCore = escapeRegex(coreVocab);
                        const coreRegex = new RegExp(`\\b${escapedCore}\\b`, 'gi');
                        if (context.match(coreRegex)) {
                            return context.replace(coreRegex, '______');
                        }
                        break;
                    }
                }
                
                // 🆕 V11.67: Flexible gap-matching: allows 1-2 words between vocab words
                // e.g. "keep in check" matches "keep inflation in check"
                const gapCoreWords = coreVocab.split(/\s+/);
                if (gapCoreWords.length >= 2) {
                    const escapedGapWords = gapCoreWords.map(w => w.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&'));
                    const gapPatStr = escapedGapWords.join('(?:\\s+(?:\\w+\\s+){0,2}?)');
                    const flexGapRegex = new RegExp('\\b' + gapPatStr + '\\b', 'gi');
                    const gapMatch = context.match(flexGapRegex);
                    if (gapMatch) {
                        // Replace only vocab core words with blanks, keep inserted words visible
                        // e.g. 'keep inflation in check' -> '______ inflation ______'
                        return context.replace(flexGapRegex, (span) => {
                            // Build result: blank vocab words, keep inserted words, merge adjacent blanks
                            const spanWords = span.split(/\s+/);
                            const parts = [];
                            let inBlank = false;
                            for (const token of spanWords) {
                                const tokenClean = token.toLowerCase().replace(/[^\w]/g, '');
                                if (tokenClean && gapCoreWords.includes(tokenClean)) {
                                    if (!inBlank) { parts.push('______'); inBlank = true; }
                                    // merge: don't add another blank
                                } else {
                                    if (inBlank) { inBlank = false; }
                                    parts.push(token);
                                }
                            }
                            return parts.join(' ');
                        });
                    }
                }
                

                 // Partial word-by-word matching
                const vocabWords = coreVocab.split(/\s+/);
                const contextWords = context.split(/\s+/);
                const contextWordsLower = contextWords.map(w => w.toLowerCase());
                
                const stopWords = ['not', 'to', 'a', 'an', 'the', 'in', 'on', 'at', 'of', 'for', 'with', 'by', 'is', 'are', 'was', 'were', 'just'];
                const flexibleWords = ['my', 'your', 'his', 'her', 'its', 'their', 'our', 'this', 'that', 'these', 'those', 'a', 'an', 'the', 'some', 'any', 'it']; // 🆕 V11.29: Added 'it' for optional pronouns
                const keyWords = vocabWords.filter(w => !stopWords.includes(w) && !flexibleWords.includes(w) && w.length > 2);
                
                let bestMatch = null;
                let bestScore = 0;
                
                for (let start = 0; start < contextWords.length; start++) {
                    let matchedKeyWords = 0;
                    let matchedTotal = 0;
                    let vocabIdx = 0;
                    let contextIdx = start;
                    let endIdx = start;
                    let lastMatchIdx = start;
                    let firstMatchIdx = -1; // 🆕 V11.28: Track where first match starts
                    
                    while (vocabIdx < vocabWords.length && contextIdx < contextWords.length) {
                        const vocabWord = vocabWords[vocabIdx];
                        const contextWord = contextWordsLower[contextIdx].replace(/[^\w]/g, '');
                        
                        const isConjugationMatch = contextWord === vocabWord ||
                                                    contextWord === vocabWord + 's' ||
                                                    contextWord === vocabWord + 'es' ||
                                                    contextWord === vocabWord + 'ed' ||
                                                    contextWord === vocabWord + 'd' ||
                                                    contextWord === vocabWord + 'ing' ||
                                                    contextWord === vocabWord.replace(/e$/, '') + 'ing' ||
                                                    contextWord === vocabWord.replace(/y$/, 'ies') ||
                                                    contextWord === vocabWord.replace(/y$/, 'ied');
                        
                        const isFlexibleMatch = flexibleWords.includes(vocabWord) && flexibleWords.includes(contextWord);
                        const isMatch = isConjugationMatch || isFlexibleMatch;
                        
                        if (isMatch) {
                            // 🆕 V11.28: Save first match index
                            if (firstMatchIdx === -1) {
                                firstMatchIdx = contextIdx;
                            }
                            matchedTotal++;
                            if (keyWords.includes(vocabWord)) {
                                matchedKeyWords++;
                            }
                            endIdx = contextIdx;
                            lastMatchIdx = contextIdx;
                            vocabIdx++;
                            contextIdx++;
                        } else {
                            // 🆕 V11.30: If vocab word is optional and doesn't match, skip it without breaking
                            if (flexibleWords.includes(vocabWord)) {
                                // Optional word not found in context - skip it and continue
                                vocabIdx++;
                                // Don't increment contextIdx - try matching next vocab word at same context position
                            } else {
                                // 🆕 V11.67: Only skip if vocab word is a stopWord (can appear at different positions)
                                // Never skip over content words in the context
                                if (stopWords.includes(vocabWord)) {
                                    // StopWord in vocab (e.g. 'in' in 'keep in check') - allow skipping 1 context word
                                    contextIdx++;
                                    if (matchedTotal > 0 && contextIdx - lastMatchIdx > 2) break;
                                } else {
                                    // KeyWord in vocab doesn't match context word - break immediately
                                    break;
                                }
                            }
                        }
                    }
                    
                    const keyWordScore = keyWords.length > 0 ? matchedKeyWords / keyWords.length : 0;
                    const totalScore = vocabWords.length > 0 ? matchedTotal / vocabWords.length : 0;
                    const finalScore = keyWords.length > 0 ? (keyWordScore * 2 + totalScore) / 3 : totalScore;
                    
                    if (finalScore > bestScore && (
                        (keyWords.length > 0 && keyWordScore >= 0.7) || 
                        (totalScore >= 0.5) ||
                        matchedTotal >= 2
                    )) {
                        bestScore = finalScore;
                        bestMatch = {
                            start: firstMatchIdx !== -1 ? firstMatchIdx : start, // 🆕 V11.28: Use first match index
                            end: endIdx,
                            words: matchedTotal
                        };
                    }
                }
                
                if (bestMatch && bestMatch.words >= 2) {
                    const before = contextWords.slice(0, bestMatch.start).join(' ');
                    const after = contextWords.slice(bestMatch.end + 1).join(' ');
                    return before + (before ? ' ' : '') + '______' + (after ? ' ' : '') + after;
                }
                
                return context;
            }

            // 🆕 V13.5: Groq TTS audio ref
            const groqAudioRef = React.useRef(null);
            
            // 🆕 V13.5: Helper — select best British browser voice (Auto logic)
            function getBestBrowserVoice(voices) {
                let v = voices.find(x => x.name === 'Google UK English Female');
                if (!v) v = voices.find(x => x.lang.includes('GB') && x.name.includes('Google'));
                if (!v) v = voices.find(x => ['Google UK English Male', 'Microsoft Hazel Desktop - English (Great Britain)', 'Microsoft George - English (United Kingdom)', 'Karen', 'Daniel'].some(pv => x.name.includes(pv)));
                if (!v) v = voices.find(x => x.lang.includes('en-GB') || x.lang.includes('en_GB'));
                return v;
            }
            
            // 🆕 V13.5: Browser TTS — uses best British voice when Auto or Groq is selected
            function speakBrowserTTS(text, speed, useDelay) {
                if (!('speechSynthesis' in window)) return;
                window.speechSynthesis.cancel();
                const doSpeak = () => {
                    const voices = window.speechSynthesis.getVoices();
                    const utterance = new SpeechSynthesisUtterance(text);
                    utterance.lang = 'en-GB';
                    utterance.rate = speed;
                    utterance.pitch = 1.0;
                    utterance.volume = 1.0;
                    if (preferredVoice === 'auto' || preferredVoice.startsWith('groq-')) {
                        const best = getBestBrowserVoice(voices);
                        if (best) utterance.voice = best;
                    } else {
                        const sel = voices.find(v => v.name === preferredVoice);
                        if (sel) utterance.voice = sel;
                    }
                    window.speechSynthesis.speak(utterance);
                };
                if (useDelay) { setTimeout(doSpeak, 150); } else { doSpeak(); }
            }
            
            // 🆕 V13.5: speakText — Groq HD at normal speed, best browser voice at slow speed
            function speakText(text, speed = 1.0, useDelay = true) {
                if (groqAudioRef.current) { groqAudioRef.current.pause(); groqAudioRef.current = null; }
                if ('speechSynthesis' in window) window.speechSynthesis.cancel();
                
                const useGroq = preferredVoice.startsWith('groq-') && speed >= 1.0 && groqApiKey.trim();
                
                if (useGroq) {
                    const apiKey = groqApiKey.trim();
                    const voiceName = preferredVoice.replace('groq-', '');
                    const doGroqSpeak = async () => {
                        try {
                            // Prepend ellipsis to prevent first-word clipping
                            let inputText = text.length > 190 ? text.substring(0, 190) + '...' : '... ' + text;
                            
                            const response = await fetch('https://api.groq.com/openai/v1/audio/speech', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                                body: JSON.stringify({ model: GROQ_MODEL_TTS, input: inputText, voice: voiceName, response_format: 'wav' })
                            });
                            
                            if (!response.ok) {
                                const errText = await response.text().catch(() => '');
                                if (errText.includes('terms acceptance')) {
                                    alert('⚠️ Accept Orpheus terms first:\nhttps://console.groq.com/playground?model=canopylabs/orpheus-v1-english');
                                }
                                speakBrowserTTS(text, speed, false);
                                return;
                            }
                            
                            const blob = await response.blob();
                            const url = URL.createObjectURL(blob);
                            const audio = new Audio(url);
                            groqAudioRef.current = audio;
                            audio.onended = () => URL.revokeObjectURL(url);
                            audio.onerror = () => { URL.revokeObjectURL(url); speakBrowserTTS(text, speed, false); };
                            await audio.play();
                        } catch(e) {
                            console.error('Groq TTS error:', e);
                            speakBrowserTTS(text, speed, false);
                        }
                    };
                    if (useDelay) { setTimeout(doGroqSpeak, 100); } else { doGroqSpeak(); }
                    return;
                }
                
                speakBrowserTTS(text, speed, useDelay);
            }

            // 🆕 V11.5: Compare user input with correct answer and highlight differences
            // ─── 🆕 V14.74: dictation comparison ──────────────────────────────────────────────
            // Irregular British/American pairs. Regex rules below cover the productive endings;
            // these are the ones no rule catches.
            const DIALECT_VARIANTS = [
                ['grey', 'gray'], ['tyre', 'tire'], ['aluminium', 'aluminum'], ['programme', 'program'],
                ['cheque', 'check'], ['plough', 'plow'], ['mould', 'mold'], ['smoulder', 'smolder'],
                ['draught', 'draft'], ['kerb', 'curb'], ['storey', 'story'], ['pyjamas', 'pajamas'],
                ['jewellery', 'jewelry'], ['jeweller', 'jeweler'], ['sceptic', 'skeptic'],
                ['defence', 'defense'], ['licence', 'license'], ['offence', 'offense'],
                ['pretence', 'pretense'], ['practise', 'practice'], ['travelling', 'traveling'],
                ['travelled', 'traveled'], ['traveller', 'traveler'], ['cancelled', 'canceled'],
                ['cancelling', 'canceling'], ['labelled', 'labeled'], ['modelling', 'modeling'],
                ['marvellous', 'marvelous'], ['counsellor', 'counselor'], ['woollen', 'woolen'],
                ['enrol', 'enroll'], ['fulfil', 'fulfill'], ['instalment', 'installment'],
                ['skilful', 'skillful'], ['wilful', 'willful'], ['speciality', 'specialty'],
                ['moustache', 'mustache'], ['doughnut', 'donut'], ['dialled', 'dialed']
            ];
            const DIALECT_MAP = DIALECT_VARIANTS.reduce((m, [a, b]) => { m[a] = b; m[b] = b; return m; }, {});

            // Collapses British and American spellings onto one form. Length guards stop short,
            // unrelated words being mangled ("four" → "for", "rise" → "rize").
            function canonicalSpelling(word) {
                if (DIALECT_MAP[word]) return DIALECT_MAP[word];
                let s = word;
                if (s.length >= 7) s = s.replace(/isations?$/, m => m.replace('isation', 'ization'));
                if (s.length >= 5) s = s.replace(/is(e|es|ed|ing)$/, 'iz$1').replace(/ys(e|es|ed|ing)$/, 'yz$1');
                if (s.length >= 6) s = s.replace(/ourite(s?)$/, 'orite$1').replace(/ours?$/, m => m.replace('our', 'or'));
                s = s.replace(/([tb])res?$/, m => m.replace('re', 'er'));
                s = s.replace(/ogues?$/, m => m.replace('ogue', 'og'));
                return s;
            }

            const stripEdgePunctuation = s => s.replace(/^[¡¿"'“‘(\[]+/, '').replace(/[.,;:!?"'”’)\]]+$/, '');
            const stripAccents = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

            // One key per word. Two words sharing a key differ only in ways that are NOT real errors.
            function dictationKey(word) {
                return canonicalSpelling(stripAccents(stripEdgePunctuation(word)).toLowerCase());
            }

            const NOTICE_LABELS = {
                dialect: 'Spelling variant (British/American)',
                punctuation: 'Punctuation',
                capitalisation: 'Capitalisation',
                accent: 'Accents/diacritics'
            };

            // 🆕 V14.75: distinguishes a misspelling from a genuinely different word
            function editDistance(a, b) {
                const m = a.length, n = b.length;
                if (!m) return n;
                if (!n) return m;
                let prev = Array.from({ length: n + 1 }, (_, j) => j);
                for (let i = 1; i <= m; i++) {
                    const cur = [i];
                    for (let j = 1; j <= n; j++) {
                        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
                    }
                    prev = cur;
                }
                return prev[n];
            }

            // Only called when two words share a dictationKey, so one of these always applies.
            function noticeKind(userWord, correctWord) {
                const u = stripEdgePunctuation(userWord), c = stripEdgePunctuation(correctWord);
                if (u === c) return 'punctuation';
                if (stripAccents(u) === stripAccents(c)) return 'accent';
                if (u.toLowerCase() === c.toLowerCase()) return 'capitalisation';
                if (stripAccents(u).toLowerCase() === stripAccents(c).toLowerCase()) return 'accent';
                return 'dialect';
            }

            // 🆕 V14.74: aligned word diff. The previous version compared userWords[i] to
            // correctWords[i] positionally, so a single missing or extra word shifted every later
            // word and struck through perfectly correct ones — and that inflated count was written
            // to Supabase. LCS alignment fixes it; notices are reported but never counted.
            function highlightDifferences(userInput, correctAnswer) {
                if (!correctAnswer) return { highlighted: '', errorCount: 0, noticeCount: 0 };

                // 🆕 V11.6: Empty input should be marked as error
                // 🆕 V14.75: returns the same token shape as the main path, so the renderer works
                if (!userInput || userInput.trim() === '') {
                    const missing = correctAnswer.trim().split(/\s+/).map((w, idx) => ({
                        id: idx + 1, kind: 'missing-word', typed: '', expected: w
                    }));
                    return {
                        tokens: missing.map(e => ({ type: 'error', ...e })),
                        errors: missing,
                        errorCount: missing.length,
                        noticeCount: 0
                    };
                }

                const userWords = userInput.trim().split(/\s+/);
                const correctWords = correctAnswer.trim().split(/\s+/);
                const uKey = userWords.map(dictationKey);
                const cKey = correctWords.map(dictationKey);

                // Longest common subsequence, so an insertion/deletion cannot cascade
                const n = uKey.length, m = cKey.length;
                const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
                for (let i = n - 1; i >= 0; i--) {
                    for (let j = m - 1; j >= 0; j--) {
                        dp[i][j] = uKey[i] === cKey[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
                    }
                }

                const ops = [];
                let i = 0, j = 0;
                while (i < n && j < m) {
                    if (uKey[i] === cKey[j]) { ops.push({ op: 'equal', i, j }); i++; j++; }
                    else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ op: 'extra', i }); i++; }
                    else { ops.push({ op: 'missing', j }); j++; }
                }
                while (i < n) { ops.push({ op: 'extra', i }); i++; }
                while (j < m) { ops.push({ op: 'missing', j }); j++; }

                // Within each run of differences, pair up extras with missings: a swapped word is
                // ONE error, not an extra plus a missing. Whatever is left over is a genuine
                // insertion or omission. Pairing across the whole run (not just adjacent ops) keeps
                // two consecutive wrong words at two errors rather than three.
                const merged = [];
                for (let k = 0; k < ops.length; ) {
                    if (ops[k].op === 'equal') { merged.push(ops[k]); k++; continue; }
                    let end = k;
                    while (end < ops.length && ops[end].op !== 'equal') end++;
                    const block = ops.slice(k, end);
                    const extras = block.filter(o => o.op === 'extra');
                    const missings = block.filter(o => o.op === 'missing');
                    const pairs = Math.min(extras.length, missings.length);
                    for (let p = 0; p < pairs; p++) merged.push({ op: 'wrong', i: extras[p].i, j: missings[p].j });
                    for (let p = pairs; p < extras.length; p++) merged.push(extras[p]);
                    for (let p = pairs; p < missings.length; p++) merged.push(missings[p]);
                    k = end;
                }

                // 🆕 V14.75: returns plain data, not JSX. This result is the single source of truth
                // for the counters, the annotations and the difficulty written to Supabase — the AI
                // only ever explains these findings, it never produces or alters them.
                let errorCount = 0, noticeCount = 0;
                const errors = [];
                const tokens = merged.map(o => {
                    if (o.op === 'equal') {
                        const typed = userWords[o.i], expected = correctWords[o.j];
                        if (typed === expected) return { type: 'match', typed };
                        noticeCount++;
                        return { type: 'notice', typed, expected, kind: noticeKind(typed, expected) };
                    }

                    const id = ++errorCount;
                    let entry;
                    if (o.op === 'wrong') {
                        const typed = userWords[o.i], expected = correctWords[o.j];
                        // Near-identical LONG words are misspellings; short ones (was/is, cat/car)
                        // are distinct words even at a small edit distance, so they stay wrong-word.
                        const longEnough = Math.max(typed.length, expected.length) >= 5;
                        const kind = longEnough && editDistance(typed.toLowerCase(), expected.toLowerCase()) <= 2
                            ? 'spelling' : 'wrong-word';
                        entry = { id, kind, typed, expected };
                    } else if (o.op === 'extra') {
                        entry = { id, kind: 'extra-word', typed: userWords[o.i], expected: '' };
                    } else {
                        entry = { id, kind: 'missing-word', typed: '', expected: correctWords[o.j] };
                    }
                    errors.push(entry);
                    return { type: 'error', ...entry };
                });

                return { tokens, errors, errorCount, noticeCount };
            }

            // 🆕 V14.75: fixed annotation format, identical on every run:
            //   wrong word   → typed struck through, correct word in green
            //   missing word → [+word] in green
            //   extra word   → [-word] struck through
            //   notice       → amber with the ▵ marker, never counted
            function renderDictationDiff(diff, onErrorClick) {
                if (!diff || !diff.tokens) return null;
                return diff.tokens.map((t, k) => {
                    if (t.type === 'match') return <span key={k} className="text-green-300">{t.typed} </span>;

                    if (t.type === 'notice') return (
                        <span
                            key={k}
                            className="text-amber-300 border-b border-dashed border-amber-400/70 cursor-help"
                            title={`${NOTICE_LABELS[t.kind] || 'Accepted variant'} — accepted variant, not counted as an error (expected: "${t.expected}")`}
                        >{t.typed}<sup className="text-[9px] text-amber-400 ml-0.5">▵</sup>{' '}</span>
                    );

                    const wrap = 'cursor-pointer border-b-2 border-dashed border-red-400/60 hover:border-red-300';
                    const click = e => { e.stopPropagation(); if (onErrorClick) onErrorClick(t, e.currentTarget); };

                    if (t.kind === 'missing-word') return (
                        <span key={k} onClick={click} className={wrap} title="Missing word — click for details">
                            <span className="text-green-400 font-bold">[+{t.expected}]</span>{' '}
                        </span>
                    );
                    if (t.kind === 'extra-word') return (
                        <span key={k} onClick={click} className={wrap} title="Extra word — click for details">
                            <span className="text-red-400 font-bold line-through">[-{t.typed}]</span>{' '}
                        </span>
                    );
                    return (
                        <span key={k} onClick={click} className={wrap} title="Click for details">
                            <span className="text-red-400 font-bold line-through opacity-80">{t.typed}</span>
                            <span className="text-green-400 font-bold"> {t.expected}</span>{' '}
                        </span>
                    );
                });
            }

            // 🆕 V11.5: Calculate difficulty based on error count
            function calculateDifficulty(errorCount) {
                if (errorCount === 0) return 'Active';
                if (errorCount <= 2) return 'Emerging';
                return 'Passive';
            }

            function isSupabasePausedError(err) {
                if (!err) return false;
                const msg = (err.message || '').toLowerCase();
                return (
                    err instanceof TypeError ||          // network-level failure (fetch failed)
                    err.status === 503 ||
                    msg.includes('failed to fetch') ||
                    msg.includes('network error') ||
                    msg.includes('networkerror') ||
                    msg.includes('connection refused') ||
                    msg.includes('503') ||
                    msg.includes('service unavailable')
                );
            }

            async function fetchWords(pageNum, isNewSearch = false) {
                if (loading && !isNewSearch) return;
                if (!supabase) {
                    alert("⚠️ Supabase not configured!\n\nPlease configure your Supabase credentials in Settings (⚙️) to use the app.");
                    setLoading(false);
                    return;
                }
                setLoading(true);
                const PAGE_SIZE = 50;
                try {
                    let query = supabase.from('vocabulary_v4').select('*', { count: 'exact' });
                    
                    // 🆕 V11.2: Exclude deleted items
                    query = query.is('deleted_at', null);
                    
                    // 🆕 V11.24: Search modes (0=vocabulary only, 1=vocabulary+synonyms, 2=AI Deep Search)
                    if (search) {
                        if (searchMode === 0) {
                            // Mode 0: Search in vocabulary + synonyms
                            query = query.or(`vocabulary.ilike.%${search}%,synonyms.ilike.%${search}%`);
                        } else if (searchMode === 1) {
                            // Mode 2: AI Deep Search
                            const synonyms = await getAIRelatedWords(search, { setLoading: setDeepSearchLoading });
                            if (synonyms.length > 0) {
                                const searchTerms = synonyms.map(term => 
                                    `vocabulary.ilike.%${term}%`
                                ).join(',');
                                query = query.or(searchTerms);
                            } else {
                                query = query.or(`vocabulary.ilike.%${search}%,synonyms.ilike.%${search}%`);
                            }
                        }
                    }
                    
                    if (familyFilter !== 'All') query = query.eq('family', familyFilter);
                    if (difficultyFilter !== 'All') query = query.eq('difficulty', difficultyFilter);
                    // 🆕 V11.42: Filter by favourite level
                    if (favouriteLevel === 1) query = query.eq('favourite', 1);
                    else if (favouriteLevel === 2) query = query.eq('favourite', 2);
                    else if (favouriteLevel === 3) query = query.in('favourite', [1, 2]);
                    
                    // 🆕 V11.54: Fixed to include literal string "NULL" as well
                    if (emptyFilter === 'Synonyms') query = query.or('synonyms.is.null,synonyms.eq.');
                    else if (emptyFilter === 'Context') query = query.or('context.is.null,context.eq.');
                    else if (emptyFilter === 'Family') query = query.or('family.is.null,family.eq.');
                    else if (emptyFilter === 'Difficulty') query = query.or('difficulty.is.null,difficulty.eq.,difficulty.eq.NULL');
                    // 🆕 V14.81: provenance filters — the Groq one drives the Gemini upgrade path
                    else if (emptyFilter === 'GroqFilled') query = query.eq('ai_source', 'groq');
                    else if (emptyFilter === 'GeminiFilled') query = query.eq('ai_source', 'gemini');
                    // 🆕 V14.84: unknown origin = has content, but no recorded model
                    else if (emptyFilter === 'UnknownOrigin') query = query.is('ai_source', null).or(HAS_ANY_CONTENT);

                    const { data, count, error } = await query
                        .order('created_at', { ascending: false })
                        .range(pageNum * PAGE_SIZE, (pageNum * PAGE_SIZE) + PAGE_SIZE - 1);

                    if (error && error.code === 'PGRST103') {
                        setHasMore(false);
                        setLoading(false);
                        return;
                    }
                    if (error && isSupabasePausedError(error)) {
                        if (supabaseUrl && supabaseKey) setShowSupabasePausedModal(true);
                        setLoading(false);
                        return;
                    }

                    setTotalCount(count || 0);
                    
                    if (data) {
                        if (isNewSearch) { 
                            setWords(data); 
                            setPage(1); 
                        } else { 
                            setWords(prev => [...prev, ...data]); 
                            setPage(pageNum + 1); 
                        }
                        setHasMore(data.length === PAGE_SIZE);
                    } else {
                        console.warn('⚠️ Received null data, not updating state');
                        setHasMore(false);
                    }
                } catch (err) {
                    console.error('❌ fetchWords error:', err);
                    if (supabaseUrl && supabaseKey && isSupabasePausedError(err)) {
                        setShowSupabasePausedModal(true);
                    }
                    setHasMore(false);
                } finally {
                    setLoading(false); 
                }
            }

            // 🆕 V11.96: Unified AI search — exact synonyms + morphological forms (deterministic)
            async function getAIRelatedWords(word, { setLoading = null } = {}) {
                const apiKey = groqApiKey.trim();
                if (!apiKey) return [];

                if (setLoading) setLoading(true);
                try {
                    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${apiKey}`
                        },
                        body: JSON.stringify({
                            model: GROQ_MODEL_FAST,
                            messages: [{
                                role: 'user',
                                content: `You are a precise English vocabulary assistant. For the word/expression "${word}" (if it is in Spanish or another language, treat it as if you were given its English equivalent), provide two categories:

CATEGORY A — EXACT SYNONYMS (5-8 words that are truly interchangeable with "${word}" and share the same core meaning):
- Only words that could DIRECTLY REPLACE "${word}" in most sentences
- Must be the same grammatical type (noun for noun, verb for verb, etc.)
- NO loosely related words, NO compounds containing "${word}", NO words that merely share a theme

CATEGORY B — GRAMMATICAL FORMS (all inflected/derived forms of "${word}" itself):
- Past tense, past participle, gerund/present participle, third person singular
- Noun forms, adjective forms, adverb forms derived from "${word}"
- Related phrasal verbs if "${word}" is a verb

Combine both categories into ONE flat JSON array. No duplicates. Do NOT include "${word}" itself.

Return ONLY the JSON array, nothing else.
Example for "sturdy": ["robust","solid","strong","durable","tough","stout","hardy","sturdily","sturdier","sturdiest","sturdiness"]
Example for "run": ["sprint","dash","jog","race","ran","running","runs","runner"]`
                            }],
                            temperature: 0.0,
                            max_tokens: 800, reasoning_effort: GROQ_REASONING_EFFORT
                        })
                    });

                    if (!response.ok) return [];

                    const data = await response.json();
                    const rawRelated = groqContent('related-words', data) || '[]';

                    try {
                        const results = parseLooseJson(rawRelated); // 🆕 V14.88: now handles arrays too
                        return results.filter(w => w.toLowerCase() !== word.toLowerCase()).slice(0, 20);
                    } catch(e) {
                        // Fallback: try comma-separated
                        return raw.split(',').map(s => s.trim().replace(/[\[\]"]/g, '')).filter(s => s && s.toLowerCase() !== word.toLowerCase());
                    }
                } catch (error) {
                    console.error('AI Related Words error:', error);
                    return [];
                } finally {
                    if (setLoading) setLoading(false);
                }
            }

            // 🆕 V11.96: British English spell checker via Groq
            const checkSpelling = async () => {
                const apiKey = groqApiKey.trim();
                if (!apiKey) { alert('Please set your Groq API Key in Settings first.'); return; }
                
                const vocabEl = document.querySelector('[name="vocabulary"]');
                const synsEl = document.querySelector('[name="synonyms"]');
                const ctxEl = document.querySelector('[name="context"]');
                
                const vocab = vocabEl?.value?.trim() || '';
                const syns = synsEl?.value?.trim() || '';
                const ctx = ctxEl?.value?.trim() || '';
                
                if (!vocab && !syns && !ctx) { alert('No text to check.'); return; }
                
                setSpellCheckLoading(true);
                setSpellCheckResult(null);
                
                try {
                    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                        body: JSON.stringify({
                            model: GROQ_MODEL_FAST,
                            messages: [{ role: 'user', content: `You are a British English spell checker. Check ONLY for spelling mistakes (NOT grammar, style, or meaning) in these three fields. Use British English spelling (colour not color, organise not organize, etc.).

VOCABULARY: "${vocab}"
SYNONYMS: "${syns}"
CONTEXT: "${ctx}"

If ALL fields are correctly spelled, respond EXACTLY: {"ok": true}
If there are spelling errors, respond with: {"ok": false, "errors": [{"field": "vocabulary|synonyms|context", "wrong": "misspelled word", "correct": "correct spelling"}]}

Return ONLY valid JSON, no explanation.` }],
                            temperature: 0.0,
                            max_tokens: 800, reasoning_effort: GROQ_REASONING_EFFORT
                        })
                    });
                    
                    const data = await response.json();
                    const result = parseLooseJson(groqContent('spell-check', data) || '{}'); // 🆕 V14.88
                    setSpellCheckResult(result);
                    
                    if (result.ok) {
                        setTimeout(() => setSpellCheckResult(null), 3000);
                    }
                } catch(e) {
                    console.error('Spell check error:', e);
                    setSpellCheckResult({ ok: false, errors: [{ field: 'all', wrong: 'Error', correct: 'Spell check failed' }] });
                } finally {
                    setSpellCheckLoading(false);
                }
            };


            

            // 🆕 V11.2: Load recycle bin
            async function loadRecycleBin() {
                const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
                const { data } = await supabase
                    .from('vocabulary_v4')
                    .select('*')
                    .not('deleted_at', 'is', null)
                    .gte('deleted_at', fortyEightHoursAgo)
                    .order('deleted_at', { ascending: false });
                
                setDeletedWords(data || []);
                setShowRecycleBin(true);
            }

            // 🆕 V11.21: Load change history from last 2 hours
            async function loadChangeHistory() {
                const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
                
                
                const { data, error } = await supabase
                    .from('vocabulary_v4')
                    .select('*')
                    .not('modified_at', 'is', null)
                    .not('previous_version', 'is', null)
                    .gte('modified_at', twoHoursAgo)
                    .is('deleted_at', null)
                    .order('modified_at', { ascending: false });
                
                if (error) {
                    console.error('❌ Change history error:', error);
                    alert('Error loading change history: ' + error.message);
                }
                
                
                setChangedWords(data || []);
                setShowChangeHistory(true);
            }

            // 🆕 V11.21: Restore previous versions of selected words
            async function restorePreviousVersions() {
                if (selectedForHistory.length === 0) {
                    alert('Please select words to restore');
                    return;
                }

                try {
                    for (const id of selectedForHistory) {
                        const word = changedWords.find(w => w.id === id);
                        if (word && word.previous_version) {
                            const previousData = JSON.parse(word.previous_version);
                            await supabase
                                .from('vocabulary_v4')
                                .update({
                                    ...previousData,
                                    previous_version: null,
                                    modified_at: null
                                })
                                .eq('id', id);
                        }
                    }
                    
                    alert(`✅ Restored ${selectedForHistory.length} word(s) to previous version`);
                    setSelectedForHistory([]);
                    loadChangeHistory();
                    checkChangeHistoryCount(); // 🆕 V11.24
                    fetchWords(0, true);
                } catch (error) {
                    console.error('Restore error:', error);
                    alert('Error restoring words');
                }
            }

            // 🆕 V11.2: Restore words from recycle bin
            async function restoreWords() {
                if (selectedForRestore.length === 0) {
                    alert('Please select words to restore');
                    return;
                }

                try {
                    for (const id of selectedForRestore) {
                        await supabase
                            .from('vocabulary_v4')
                            .update({ deleted_at: null })
                            .eq('id', id);
                    }
                    
                    alert(`✅ Restored ${selectedForRestore.length} word(s)`);
                    setSelectedForRestore([]);
                    loadRecycleBin();
                    fetchWords(0, true);
                    checkRecycleBinCount(); // 🆕 V11.4
                } catch (error) {
                    console.error('Restore error:', error);
                    alert('Error restoring words');
                }
            }

            // 🆕 V11.2: Permanently delete from recycle bin
            async function permanentlyDelete() {
                if (selectedForRestore.length === 0) {
                    alert('Please select words to delete permanently');
                    return;
                }

                if (!confirm(`⚠️ Permanently delete ${selectedForRestore.length} word(s)? This cannot be undone!`)) {
                    return;
                }

                try {
                    for (const id of selectedForRestore) {
                        await supabase
                            .from('vocabulary_v4')
                            .delete()
                            .eq('id', id);
                    }
                    
                    alert(`✅ Permanently deleted ${selectedForRestore.length} word(s)`);
                    setSelectedForRestore([]);
                    loadRecycleBin();
                    checkRecycleBinCount(); // 🆕 V11.4
                } catch (error) {
                    console.error('Permanent delete error:', error);
                    alert('Error deleting words');
                }
            }

            // 🆕 V11.41: Load statistics dashboard
            async function loadStats() {
                setLoadingStats(true);
                setShowStats(true);
                
                try {
                    const { data: allWords } = await supabase
                        .from('vocabulary_v4')
                        .select('*')
                        .is('deleted_at', null);
                    
                    if (!allWords) {
                        setStatsData(null);
                        return;
                    }
                    
                    const total = allWords.length;
                    const practiced = allWords.filter(w => 
                        w.flashcard_count > 0 || w.dictation_count > 0 || 
                        w.selection_count > 0 || w.guesswork_count > 0 || w.translation_count > 0
                    ).length;
                    const pending = total - practiced;
                    const favourites = allWords.filter(w => w.favourite).length;
                    
                    const easy = allWords.filter(w => w.difficulty === 'Active' || w.difficulty === 'Easy').length;
                    const medium = allWords.filter(w => w.difficulty === 'Emerging' || w.difficulty === 'Medium').length;
                    const hard = allWords.filter(w => w.difficulty === 'Passive' || w.difficulty === 'Hard').length;
                    const notPracticed = total - easy - medium - hard;
                    
                    const flashcardPracticed = allWords.filter(w => w.flashcard_count > 0).length;
                    const dictationPracticed = allWords.filter(w => w.dictation_count > 0);
                    const dictationAvgErrors = dictationPracticed.length > 0 
                        ? (dictationPracticed.reduce((sum, w) => sum + (w.dictation_errors_total || 0), 0) / dictationPracticed.reduce((sum, w) => sum + w.dictation_count, 0)).toFixed(2)
                        : 0;
                    // 🆕 V14.6: Cambridge grades for Dictation (derived from avg errors)
                    const dictGradeC2 = dictationPracticed.filter(w => ((w.dictation_errors_total||0)/w.dictation_count) === 0).length;
                    const dictGradeC1 = dictationPracticed.filter(w => { const avg = (w.dictation_errors_total||0)/w.dictation_count; return avg > 0 && avg <= 1; }).length;
                    const dictGradeB2 = dictationPracticed.filter(w => { const avg = (w.dictation_errors_total||0)/w.dictation_count; return avg > 1 && avg <= 2; }).length;
                    const dictGradeB1 = dictationPracticed.filter(w => (w.dictation_errors_total||0)/w.dictation_count > 2).length;
                    
                    const selectionPracticed = allWords.filter(w => w.selection_count > 0);
                    const selectionAvgAttempts = selectionPracticed.length > 0
                        ? (selectionPracticed.reduce((sum, w) => sum + (w.selection_attempts_total || 0), 0) / selectionPracticed.reduce((sum, w) => sum + w.selection_count, 0)).toFixed(2)
                        : 0;
                    
                    const guessworkPracticed = allWords.filter(w => w.guesswork_count > 0).length;
                    const translationPracticed = allWords.filter(w => w.translation_count > 0);
                    
                    const gradeC2 = translationPracticed.filter(w => w.translation_best_grade === 'C2').length;
                    const gradeC1 = translationPracticed.filter(w => w.translation_best_grade === 'C1').length;
                    const gradeB2 = translationPracticed.filter(w => w.translation_best_grade === 'B2').length;
                    const gradeB1 = translationPracticed.filter(w => w.translation_best_grade === 'B1').length;
                    
                    // Sorted word lists per exercise for drill-down
                    // Legacy mapping: normalize old Easy/Medium/Hard values to Active/Emerging/Passive
                    const normDiff = d => d === 'Easy' ? 'Active' : d === 'Medium' ? 'Emerging' : d === 'Hard' ? 'Passive' : d;
                    const diffOrder = { 'Passive': 0, 'Emerging': 1, 'Active': 2, null: 3, undefined: 3 };
                    
                    const flashcardSorted = allWords.filter(w => w.flashcard_count > 0)
                        .map(w => ({ id: w.id, word: w.vocabulary, difficulty: normDiff(w.difficulty), count: w.flashcard_count }))
                        .sort((a, b) => (diffOrder[a.difficulty] ?? 3) - (diffOrder[b.difficulty] ?? 3));
                    
                    const dictationSorted = dictationPracticed
                        .map(w => ({ id: w.id, word: w.vocabulary, difficulty: normDiff(w.difficulty), count: w.dictation_count, errors: w.dictation_errors_total || 0, avgErrors: ((w.dictation_errors_total || 0) / w.dictation_count) }))
                        .sort((a, b) => b.avgErrors - a.avgErrors);
                    
                    const selectionSorted = selectionPracticed
                        .map(w => ({ id: w.id, word: w.vocabulary, difficulty: normDiff(w.difficulty), count: w.selection_count, attempts: w.selection_attempts_total || 0, avgAttempts: ((w.selection_attempts_total || 0) / w.selection_count) }))
                        .sort((a, b) => b.avgAttempts - a.avgAttempts);
                    
                    const guessworkSorted = allWords.filter(w => w.guesswork_count > 0)
                        .map(w => ({ id: w.id, word: w.vocabulary, difficulty: normDiff(w.difficulty), count: w.guesswork_count }))
                        .sort((a, b) => (diffOrder[a.difficulty] ?? 3) - (diffOrder[b.difficulty] ?? 3));
                    
                    const translationSorted = translationPracticed
                        .map(w => ({ id: w.id, word: w.vocabulary, grade: w.translation_best_grade, count: w.translation_count }))
                        .sort((a, b) => {
                            const order = { 'B1': 0, 'B2': 1, 'C1': 2, 'C2': 3, null: 4 };
                            return (order[a.grade] ?? 4) - (order[b.grade] ?? 4);
                        });
                    
                    // Difficulty distribution for flashcard/guesswork stats
                    const fcActive = flashcardSorted.filter(w => w.difficulty === 'Active').length;
                    const fcEmerging = flashcardSorted.filter(w => w.difficulty === 'Emerging').length;
                    const fcPassive = flashcardSorted.filter(w => w.difficulty === 'Passive').length;
                    const seActive = selectionSorted.filter(w => w.difficulty === 'Active').length;
                    const seEmerging = selectionSorted.filter(w => w.difficulty === 'Emerging').length;
                    const sePassive = selectionSorted.filter(w => w.difficulty === 'Passive').length;
                    const gwActive = guessworkSorted.filter(w => w.difficulty === 'Active').length;
                    const gwEmerging = guessworkSorted.filter(w => w.difficulty === 'Emerging').length;
                    const gwPassive = guessworkSorted.filter(w => w.difficulty === 'Passive').length;
                    
                    setStatsData({
                        overview: { 
                            total, practiced, pending, favourites, 
                            practicedPercent: total > 0 ? ((practiced / total) * 100).toFixed(1) : 0 
                        },
                        difficulty: { easy, medium, hard, notPracticed },
                        exercises: {
                            flashcard: { count: flashcardPracticed, active: fcActive, emerging: fcEmerging, passive: fcPassive },
                            dictation: { count: dictationPracticed.length, avgErrors: dictationAvgErrors, gradeC2: dictGradeC2, gradeC1: dictGradeC1, gradeB2: dictGradeB2, gradeB1: dictGradeB1 },
                            selection: { count: selectionPracticed.length, active: seActive, emerging: seEmerging, passive: sePassive },
                            guesswork: { count: guessworkPracticed, active: gwActive, emerging: gwEmerging, passive: gwPassive },
                            translation: { count: translationPracticed.length, gradeC2, gradeC1, gradeB2, gradeB1 }
                        },
                        wordLists: { flashcard: flashcardSorted, dictation: dictationSorted, selection: selectionSorted, guesswork: guessworkSorted, translation: translationSorted }
                    });
                } catch (error) {
                    console.error('Stats error:', error);
                    alert('Error loading statistics');
                } finally {
                    setLoadingStats(false);
                }
            }
            
            // 🆕 V11.44: Open exercise drill-down to practice difficult words
            function openExerciseDrillDown(exerciseType) {
                if (!statsData || !statsData.wordLists) return;
                const wordList = statsData.wordLists[exerciseType] || [];
                setShowStats(false);
                setDrillDownExercise(exerciseType);
                setDrillDownWords(wordList);
                setSelectedDrillDownWords([]);
                setShowExerciseDrillDown(true);
            }
            
            // 🆕 V11.44: Practice selected difficult words
            async function practiceSelectedWords() {
                if (selectedDrillDownWords.length === 0) {
                    alert('Please select at least one word to practice');
                    return;
                }
                
                // Fetch FULL word data from DB so exercises get all fields (vocabulary, context, family, etc.)
                const { data: fullWords, error } = await supabase
                    .from('vocabulary_v4')
                    .select('*')
                    .in('id', selectedDrillDownWords)
                    .is('deleted_at', null);
                
                if (error || !fullWords || fullWords.length === 0) {
                    alert('Error loading word data. Please try again.');
                    return;
                }
                
                // Close drill-down modal and go back to Stats
                setShowExerciseDrillDown(false);
                
                // Sort by exercise mode
                let sortedWords = [...fullWords];
                if (exerciseMode === 'memory') {
                    const difficultyOrder = { 'Passive': 0, 'Emerging': 1, 'Active': 2 };
                    sortedWords.sort((a, b) => {
                        const aOrder = difficultyOrder[a.difficulty] ?? 3;
                        const bOrder = difficultyOrder[b.difficulty] ?? 3;
                        return aOrder - bOrder;
                    });
                } else {
                    sortedWords = sortedWords.sort(() => Math.random() - 0.5);
                }
                
                // Launch appropriate exercise
                switch(drillDownExercise) {
                    case 'flashcard':
                        setFlashcardWords(sortedWords);
                        setFlashcardIndex(0);
                        setIsFlipped(false);
                        setShowFlashcards(true);
                        break;
                        
                    case 'dictation':
                        setDictationWords(sortedWords);
                        setDictationIndex(0);
                        setDictationInput('');
                        setShowDictationAnswer(false);
                        setDictationErrorCount(0);
                        setDictationDifficulty('');
                        setDictationPlayCount(0);
                        setDictationPlaySpeed('normal');
                        setShowDictation(true);
                        break;
                        
                    case 'selection':
                        // Filter to only include words with enough same level+family options
                        const validWords = sortedWords.filter(word => {
                            const sameLevelFamily = sortedWords.filter(w => 
                                w.vocabulary !== word.vocabulary && w.family === word.family
                            );
                            return sameLevelFamily.length >= 1;
                        });
                        
                        if (validWords.length === 0) {
                            alert('⚠️ Not enough words with matching family for Selection exercise!\n\nTip: Select more words or try a different exercise.');
                            return;
                        }
                        
                        setSelectionWords(validWords);
                        setSelectionIndex(0);
                        setSelectedAnswer(null);
                        setShowSelectionAnswer(false);
                        setSelectionAttempts(0);
                        setSelectionDifficulty('');
                        
                        const firstOptions = generateSelectionOptions(validWords[0], validWords);
                        if (!firstOptions) {
                            alert('Error generating options');
                            return;
                        }
                        setSelectionOptions(firstOptions);
                        setShowSelection(true);
                        break;
                        
                    case 'guesswork':
                        setGuessworkWords(sortedWords);
                        setGuessworkIndex(0);
                        setGuessworkInput('');
                        setShowGuessworkAnswer(false);
                        setGuessworkDifficulty('');
                        setGuessworkAttempts(0);
                        setGuessworkAIResult(null);
                        setShowGuesswork(true);
                        break;
                        
                    case 'translation':
                        setTranslationWords(sortedWords);
                        setTranslationIndex(0);
                        setTranslationSpanish('');
                        setTranslationInput(''); setShowTranslationHint(false); setTranslationHintMeaning('');
                        setShowTranslationAnswer(false);
                        setTranslationDifficulty('');
                        setTranslationAttempts(0);
                        setTranslationAIResult(null);
                        setShowTranslation(true);
                        // Generate translation for first word
                        await generateSpanishTranslation(sortedWords[0].context);
                        break;
                }
            }
            
            // 🆕 V11.41: Reset difficulty only
            async function resetDifficulty() {
                setResetType('difficulty');
                setShowResetConfirm(true);
            }
            
            async function executeResetDifficulty() {
                try {
                    await supabase.from('vocabulary_v4').update({ difficulty: null }).is('deleted_at', null);
                    alert('✅ Difficulty reset!');
                    loadStats();
                    fetchWords(0, true);
                    setShowResetConfirm(false);
                } catch (error) {
                    alert('Error resetting difficulty');
                }
            }
            
            // 🆕 V11.41: Reset exercise stats only
            async function resetExerciseStats() {
                setResetType('stats');
                setShowResetConfirm(true);
            }
            
            async function executeResetExerciseStats() {
                try {
                    await supabase.from('vocabulary_v4').update({
                        flashcard_count: 0, dictation_count: 0, dictation_errors_total: 0,
                        selection_count: 0, selection_attempts_total: 0, guesswork_count: 0,
                        translation_count: 0, translation_best_grade: null, last_practiced_date: null
                    }).is('deleted_at', null);
                    alert('✅ Exercise stats reset!');
                    loadStats();
                    fetchWords(0, true);
                    setShowResetConfirm(false);
                } catch (error) {
                    alert('Error resetting stats');
                }
            }
            
            // 🆕 V11.41: Reset all progress (difficulty + stats)
            async function resetAllProgress() {
                setResetType('all');
                setShowResetConfirm(true);
            }
            
            async function executeResetAllProgress() {
                try {
                    await supabase.from('vocabulary_v4').update({
                        difficulty: null, flashcard_count: 0, dictation_count: 0, dictation_errors_total: 0,
                        selection_count: 0, selection_attempts_total: 0, guesswork_count: 0,
                        translation_count: 0, translation_best_grade: null, last_practiced_date: null
                    }).is('deleted_at', null);
                    alert('✅ All progress reset!');
                    loadStats();
                    fetchWords(0, true);
                    setShowResetConfirm(false);
                } catch (error) {
                    alert('Error resetting progress');
                }
            }


            async function loadFlashcards() {
                try {
                    let query = supabase.from('vocabulary_v4').select('*');
                    
                    // 🆕 V11.2: Exclude deleted items
                    query = query.is('deleted_at', null);
                    
                    // 🆕 V11.38: Respect searchMode like fetchWords
                    if (search) {
                        if (searchMode === 0) {
                            query = query.or(`vocabulary.ilike.%${search}%,synonyms.ilike.%${search}%`);
                        } else if (searchMode === 1) {
                            const synonyms = await getAIRelatedWords(search, { setLoading: setDeepSearchLoading });
                            if (synonyms.length > 0) {
                                const searchTerms = synonyms.map(term => 
                                    `vocabulary.ilike.%${term}%`
                                ).join(',');
                                query = query.or(searchTerms);
                            } else {
                                query = query.or(`vocabulary.ilike.%${search}%,synonyms.ilike.%${search}%`);
                            }
                        }
                    }
                    if (familyFilter !== 'All') query = query.eq('family', familyFilter);
                    if (difficultyFilter !== 'All') query = query.eq('difficulty', difficultyFilter);
                    // 🆕 V11.42: Filter by favourite level
                    if (favouriteLevel === 1) query = query.eq('favourite', 1);
                    else if (favouriteLevel === 2) query = query.eq('favourite', 2);
                    else if (favouriteLevel === 3) query = query.in('favourite', [1, 2]);
                    
                    // 🆕 V11.54: Fixed to include literal string "NULL" as well
                    if (emptyFilter === 'Synonyms') query = query.or('synonyms.is.null,synonyms.eq.');
                    else if (emptyFilter === 'Context') query = query.or('context.is.null,context.eq.');
                    else if (emptyFilter === 'Family') query = query.or('family.is.null,family.eq.');
                    else if (emptyFilter === 'Difficulty') query = query.or('difficulty.is.null,difficulty.eq.,difficulty.eq.NULL');
                    // 🆕 V14.81: provenance filters — the Groq one drives the Gemini upgrade path
                    else if (emptyFilter === 'GroqFilled') query = query.eq('ai_source', 'groq');
                    else if (emptyFilter === 'GeminiFilled') query = query.eq('ai_source', 'gemini');
                    // 🆕 V14.84: unknown origin = has content, but no recorded model
                    else if (emptyFilter === 'UnknownOrigin') query = query.is('ai_source', null).or(HAS_ANY_CONTENT);

                    const { data, error } = await query.order('created_at', { ascending: false });
                    
                    if (error) throw error;
                    
                    if (data && data.length > 0) {
                        // 🆕 V11.6: Sort by mode
                        let sortedData = [...data];
                        if (exerciseMode === 'memory') {
                            // Memory mode: Hard → Medium → Easy → No difficulty
                            const difficultyOrder = { 'Passive': 0, 'Emerging': 1, 'Active': 2 };
                            sortedData.sort((a, b) => {
                                const aOrder = difficultyOrder[a.difficulty] ?? 3;
                                const bOrder = difficultyOrder[b.difficulty] ?? 3;
                                return aOrder - bOrder;
                            });
                        } else {
                            // Random mode: Shuffle
                            sortedData = sortedData.sort(() => Math.random() - 0.5);
                        }
                        
                        setFlashcardWords(sortedData);
                        setFlashcardIndex(0);
                        setIsFlipped(false);
                        setShowFlashcards(true);
                    } else {
                        alert('No words found with current filters!');
                    }
                } catch (err) {
                    console.error('Error loading flashcards:', err);
                    alert('Error loading flashcards');
                }
            }

            // 🆕 V11.2: Set difficulty and move to next card
            async function setDifficulty(difficulty) {
                const currentWord = flashcardWords[flashcardIndex];
                
                try {
                    await supabase
                        .from('vocabulary_v4')
                        .update({ 
                            difficulty,
                            flashcard_count: (currentWord.flashcard_count || 0) + 1,
                            last_practiced_date: new Date().toISOString()
                        })
                        .eq('id', currentWord.id);
                    
                    // Update local state
                    const newFlashcards = [...flashcardWords];
                    newFlashcards[flashcardIndex] = {
                        ...newFlashcards[flashcardIndex],
                        difficulty
                    };
                    setFlashcardWords(newFlashcards);
                    
                    // Move to next card
                    if (flashcardIndex < flashcardWords.length - 1) {
                        setFlashcardIndex(flashcardIndex + 1);
                        setIsFlipped(false);
                    }
                } catch (error) {
                    console.error('Error setting difficulty:', error);
                    alert('Error saving difficulty');
                }
            }

            // 🆕 V11.4: Load Dictation Exercise
            async function loadDictation() {
                try {
                    let query = supabase.from('vocabulary_v4').select('*');
                    
                    query = query.is('deleted_at', null);
                    query = query.not('context', 'is', null);
                    query = query.neq('context', '');
                    
                    // 🆕 V11.38: Respect searchMode like fetchWords
                    if (search) {
                        if (searchMode === 0) {
                            query = query.or(`vocabulary.ilike.%${search}%,synonyms.ilike.%${search}%`);
                        } else if (searchMode === 1) {
                            const synonyms = await getAIRelatedWords(search, { setLoading: setDeepSearchLoading });
                            if (synonyms.length > 0) {
                                const searchTerms = synonyms.map(term => 
                                    `vocabulary.ilike.%${term}%`
                                ).join(',');
                                query = query.or(searchTerms);
                            } else {
                                query = query.or(`vocabulary.ilike.%${search}%,synonyms.ilike.%${search}%`);
                            }
                        }
                    }
                    if (familyFilter !== 'All') query = query.eq('family', familyFilter);
                    if (difficultyFilter !== 'All') query = query.eq('difficulty', difficultyFilter);
                    // 🆕 V11.42: Filter by favourite level
                    if (favouriteLevel === 1) query = query.eq('favourite', 1);
                    else if (favouriteLevel === 2) query = query.eq('favourite', 2);
                    else if (favouriteLevel === 3) query = query.in('favourite', [1, 2]);

                    const { data, error } = await query.order('created_at', { ascending: false });
                    
                    if (error) throw error;
                    
                    if (data && data.length > 0) {
                        // 🆕 V11.6: Sort by mode
                        let sortedData = [...data];
                        if (exerciseMode === 'memory') {
                            // Memory mode: Hard → Medium → Easy → No difficulty
                            const difficultyOrder = { 'Passive': 0, 'Emerging': 1, 'Active': 2 };
                            sortedData.sort((a, b) => {
                                const aOrder = difficultyOrder[a.difficulty] ?? 3;
                                const bOrder = difficultyOrder[b.difficulty] ?? 3;
                                return aOrder - bOrder;
                            });
                        } else {
                            // Random mode: Shuffle
                            sortedData = sortedData.sort(() => Math.random() - 0.5);
                        }
                        
                        setDictationWords(sortedData);
                        setDictationIndex(0);
                        setDictationInput('');
                        setShowDictationAnswer(false);
                        setDictationPlayCount(0);
                        setDictationPlaySpeed('normal');
                        setShowDictation(true);
                    } else {
                        alert('No words with context found!');
                    }
                } catch (err) {
                    console.error('Error loading dictation:', err);
                    alert('Error loading dictation');
                }
            }

            // 🆕 V11.11: Load Selection exercise
            async function loadSelection() {
                try {
                    let query = supabase.from('vocabulary_v4').select('*');
                    
                    query = query.is('deleted_at', null);
                    query = query.not('context', 'is', null);
                    query = query.neq('context', '');
                    
                    // 🆕 V11.38: Respect searchMode like fetchWords
                    if (search) {
                        if (searchMode === 0) {
                            query = query.or(`vocabulary.ilike.%${search}%,synonyms.ilike.%${search}%`);
                        } else if (searchMode === 1) {
                            const synonyms = await getAIRelatedWords(search, { setLoading: setDeepSearchLoading });
                            if (synonyms.length > 0) {
                                const searchTerms = synonyms.map(term => 
                                    `vocabulary.ilike.%${term}%`
                                ).join(',');
                                query = query.or(searchTerms);
                            } else {
                                query = query.or(`vocabulary.ilike.%${search}%,synonyms.ilike.%${search}%`);
                            }
                        }
                    }
                    if (familyFilter !== 'All') query = query.eq('family', familyFilter);
                    if (difficultyFilter !== 'All') query = query.eq('difficulty', difficultyFilter);
                    // 🆕 V11.42: Filter by favourite level
                    if (favouriteLevel === 1) query = query.eq('favourite', 1);
                    else if (favouriteLevel === 2) query = query.eq('favourite', 2);
                    else if (favouriteLevel === 3) query = query.in('favourite', [1, 2]);

                    const { data, error } = await query.order('created_at', { ascending: false });
                    
                    if (error) throw error;
                    
                    if (data && data.length > 0) {
                        // 🆕 V11.19: Filter words to only include those with enough same family options
                        const validWords = data.filter(word => {
                            const sameLevelFamily = data.filter(w => 
                                w.vocabulary !== word.vocabulary &&
                                w.family === word.family);
                            // Need at least 1 other word (will show minimum 2 options: correct + 1 wrong)
                            return sameLevelFamily.length >= 1;
                        });
                        
                        if (validWords.length === 0) {
                            alert('⚠️ Not enough words with matching family!\n\nTip: Add more words with the same Family to enable this exercise.');
                            return;
                        }
                        
                        // Sort by mode
                        let sortedData = [...validWords];
                        if (exerciseMode === 'memory') {
                            const difficultyOrder = { 'Passive': 0, 'Emerging': 1, 'Active': 2 };
                            sortedData.sort((a, b) => {
                                const aOrder = difficultyOrder[a.difficulty] ?? 3;
                                const bOrder = difficultyOrder[b.difficulty] ?? 3;
                                return aOrder - bOrder;
                            });
                        } else {
                            sortedData = sortedData.sort(() => Math.random() - 0.5);
                        }
                        
                        setSelectionWords(sortedData);
                        setSelectionIndex(0);
                        setSelectedAnswer(null);
                        setShowSelectionAnswer(false);
                        setSelectionAttempts(0);
                        setSelectionDifficulty('');
                        
                        // 🆕 V11.64: Reset new states
                        setSelectionWrongAnswers([]);
                        setSelectionExplanation('');
                        
                        // 🆕 V11.64: Try AI options first for first word
                        const aiFirstOpts = await generateAISelectionOptions(sortedData[0]);
                        let firstOptions;
                        if (aiFirstOpts && aiFirstOpts.length >= 3) {
                            firstOptions = [sortedData[0], ...aiFirstOpts.slice(0, 5)].sort(() => Math.random() - 0.5);
                        } else {
                            firstOptions = generateSelectionOptions(sortedData[0], sortedData);
                        }
                        if (!firstOptions) {
                            alert('Error generating options for first word');
                            return;
                        }
                        setSelectionOptions(firstOptions);
                        
                        setShowSelection(true);
                    } else {
                        alert('No words with context found!');
                    }
                } catch (err) {
                    console.error('Error loading selection:', err);
                    alert('Error loading selection');
                }
            }

            // 🆕 V11.11: Generate 6 options (1 correct + 5 wrong) for Selection
            // 🆕 V11.16: Generate options with same level and family for increased difficulty
            // 🆕 V11.19: Generate Selection options - STRICT: same level AND family ONLY
            function generateSelectionOptions(correctWord, allWords) {
                const options = [correctWord];
                
                // 🆕 V11.19: ALWAYS filter by same family (no fallbacks)
                // This ensures all options are truly similar and prevents elimination by deduction
                const filteredWords = allWords.filter(w => 
                    w.vocabulary !== correctWord.vocabulary &&
                    w.family === correctWord.family
                );
                
                // If not enough words available, show warning but still use what we have
                if (filteredWords.length < 5) {
                    console.warn(`⚠️ Only ${filteredWords.length} words found with only family="${correctWord.family}". Need at least 5 for best results.`);
                }
                
                // Get up to 5 random wrong answers from filtered words
                const shuffled = filteredWords.sort(() => Math.random() - 0.5);
                for (let i = 0; i < Math.min(5, shuffled.length); i++) {
                    options.push(shuffled[i]);
                }
                
                // If we don't have enough options (less than 2 total), skip this word
                if (options.length < 2) {
                    console.error(`❌ Not enough options for "${correctWord.vocabulary}" family=${correctWord.family}). Skipping.`);
                    return null;
                }
                
                // Shuffle all options
                return options.sort(() => Math.random() - 0.5);
            }

            // 🆕 V11.22: Generate meaning for Guesswork hint with AI
            // 🆕 V14.76: shared by the Guesswork and Translation hints
            async function generateWordMeaning(word) {
                const apiKey = groqApiKey.trim();
                if (!apiKey || apiKey === '') {
                    return '⚠️ API key not configured. Please set your Groq API Key in Settings.';
                }
                try {
                    const prompt = `What does "${word}" mean? Provide ONLY the definition/meaning in British English. Keep it simple and clear, maximum 2 sentences. IMPORTANT: Do NOT mention the word "${word}" itself in your response - just explain what it means. Do NOT include examples, synonyms, or usage notes.`;

                    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${apiKey}`
                        },
                        body: JSON.stringify({
                            model: GROQ_MODEL_FAST,
                            messages: [{ role: 'user', content: prompt }],
                            temperature: 0.5,
                            max_tokens: 500, reasoning_effort: GROQ_REASONING_EFFORT
                        })
                    });

                    if (!response.ok) {
                        throw new Error('Failed to generate meaning');
                    }

                    const data = await response.json();
                    return groqContent('word-meaning', data) || 'Unable to generate meaning.';
                } catch (error) {
                    console.error('Generate meaning error:', error);
                    return '❌ Error generating meaning. Please try again.';
                }
            }

            async function generateGuessworkHintMeaning(word) {
                setGuessworkHintLoading(true);
                setGuessworkHintMeaning(await generateWordMeaning(word));
                setGuessworkHintLoading(false);
            }

            // 🆕 V14.76: Translation hint — same behaviour as the Guesswork one
            async function generateTranslationHintMeaning(word) {
                setTranslationHintLoading(true);
                setTranslationHintMeaning(await generateWordMeaning(word));
                setTranslationHintLoading(false);
            }

            // 🆕 V14.76: does the answer contain the vocabulary word being practised? Checked locally
            // rather than asked of the model, so the one hard requirement is never subject to drift.
            function containsVocabularyWord(text, vocabulary) {
                if (!text || !vocabulary) return true;
                const haystack = ' ' + text.toLowerCase().replace(/[^\p{L}\p{N}\s'-]/gu, ' ').replace(/\s+/g, ' ') + ' ';
                const stopWords = ['a', 'an', 'the', 'in', 'on', 'at', 'to', 'of', 'for', 'with', 'by'];
                const optionalWords = ['my', 'your', 'his', 'her', 'its', 'their', 'our', 'this', 'that', 'it'];
                const keyWords = vocabulary.toLowerCase().split(/\s+/)
                    .filter(w => !stopWords.includes(w) && !optionalWords.includes(w) && w.length > 2);
                // nothing substantive to look for (e.g. "in on") — treat as present
                if (keyWords.length === 0) return haystack.includes(' ' + vocabulary.toLowerCase() + ' ');
                return keyWords.every(kw => {
                    const stem = kw.replace(/e$/, '').replace(/y$/, '');
                    const forms = [kw, kw + 's', kw + 'es', kw + 'ed', kw + 'd', kw + 'ing',
                                   stem + 'ing', stem + 'ed', stem + 'ies', stem + 'ied'];
                    return forms.some(f => haystack.includes(' ' + f + ' ') || haystack.includes(' ' + f + "'"));
                });
            }

            // 🆕 V11.16: Load Guesswork Exercise
            async function loadGuesswork() {
                try {
                    let query = supabase.from('vocabulary_v4').select('*');
                    
                    query = query.is('deleted_at', null);
                    query = query.not('context', 'is', null);
                    query = query.neq('context', '');
                    
                    // 🆕 V11.38: Respect searchMode like fetchWords
                    if (search) {
                        if (searchMode === 0) {
                            query = query.or(`vocabulary.ilike.%${search}%,synonyms.ilike.%${search}%`);
                        } else if (searchMode === 1) {
                            const synonyms = await getAIRelatedWords(search, { setLoading: setDeepSearchLoading });
                            if (synonyms.length > 0) {
                                const searchTerms = synonyms.map(term => 
                                    `vocabulary.ilike.%${term}%`
                                ).join(',');
                                query = query.or(searchTerms);
                            } else {
                                query = query.or(`vocabulary.ilike.%${search}%,synonyms.ilike.%${search}%`);
                            }
                        }
                    }
                    if (familyFilter !== 'All') query = query.eq('family', familyFilter);
                    if (difficultyFilter !== 'All') query = query.eq('difficulty', difficultyFilter);
                    // 🆕 V11.42: Filter by favourite level
                    if (favouriteLevel === 1) query = query.eq('favourite', 1);
                    else if (favouriteLevel === 2) query = query.eq('favourite', 2);
                    else if (favouriteLevel === 3) query = query.in('favourite', [1, 2]);

                    const { data, error } = await query.order('created_at', { ascending: false });
                    
                    if (error) throw error;
                    
                    if (data && data.length > 0) {
                        // Sort by mode
                        let sortedData = [...data];
                        if (exerciseMode === 'memory') {
                            const difficultyOrder = { 'Passive': 0, 'Emerging': 1, 'Active': 2 };
                            sortedData.sort((a, b) => {
                                const aOrder = difficultyOrder[a.difficulty] ?? 3;
                                const bOrder = difficultyOrder[b.difficulty] ?? 3;
                                return aOrder - bOrder;
                            });
                        } else {
                            sortedData = sortedData.sort(() => Math.random() - 0.5);
                        }
                        
                        setGuessworkWords(sortedData);
                        setGuessworkIndex(0);
                        setGuessworkInput('');
                        setShowGuessworkAnswer(false);
                        setGuessworkDifficulty('');
                        setGuessworkAttempts(0);
                        setGuessworkAIResult(null);
                        setShowGuesswork(true);
                    } else {
                        alert('No words with context found!');
                    }
                } catch (err) {
                    console.error('Error loading guesswork:', err);
                    alert('Error loading guesswork');
                }
            }

            // 🆕 V11.31: Load Translation Exercise
            async function loadTranslation() {
                try {
                    let query = supabase.from('vocabulary_v4').select('*');
                    
                    query = query.is('deleted_at', null);
                    query = query.not('context', 'is', null);
                    query = query.neq('context', '');
                    
                    // 🆕 V11.38: Respect searchMode like fetchWords
                    if (search) {
                        if (searchMode === 0) {
                            query = query.or(`vocabulary.ilike.%${search}%,synonyms.ilike.%${search}%`);
                        } else if (searchMode === 1) {
                            const synonyms = await getAIRelatedWords(search, { setLoading: setDeepSearchLoading });
                            if (synonyms.length > 0) {
                                const searchTerms = synonyms.map(term => 
                                    `vocabulary.ilike.%${term}%`
                                ).join(',');
                                query = query.or(searchTerms);
                            } else {
                                query = query.or(`vocabulary.ilike.%${search}%,synonyms.ilike.%${search}%`);
                            }
                        }
                    }
                    if (familyFilter !== 'All') query = query.eq('family', familyFilter);
                    if (difficultyFilter !== 'All') query = query.eq('difficulty', difficultyFilter);
                    // 🆕 V11.42: Filter by favourite level
                    if (favouriteLevel === 1) query = query.eq('favourite', 1);
                    else if (favouriteLevel === 2) query = query.eq('favourite', 2);
                    else if (favouriteLevel === 3) query = query.in('favourite', [1, 2]);

                    const { data, error } = await query.order('created_at', { ascending: false });
                    
                    if (error) throw error;
                    
                    if (data && data.length > 0) {
                        // Sort by mode
                        let sortedData = [...data];
                        if (exerciseMode === 'memory') {
                            const difficultyOrder = { 'Passive': 0, 'Emerging': 1, 'Active': 2 };
                            sortedData.sort((a, b) => {
                                const aOrder = difficultyOrder[a.difficulty] ?? 3;
                                const bOrder = difficultyOrder[b.difficulty] ?? 3;
                                return aOrder - bOrder;
                            });
                        } else {
                            sortedData = sortedData.sort(() => Math.random() - 0.5);
                        }
                        
                        setTranslationWords(sortedData);
                        setTranslationIndex(0);
                        setTranslationSpanish('');
                        setTranslationInput(''); setShowTranslationHint(false); setTranslationHintMeaning('');
                        setShowTranslationAnswer(false);
                        setTranslationDifficulty('');
                        setTranslationAttempts(0);
                        setTranslationAIResult(null);
                        setShowTranslation(true);
                        
                        // Generate Spanish translation for first word
                        await generateSpanishTranslation(sortedData[0].context);
                    } else {
                        alert('No words with context found!');
                    }
                } catch (err) {
                    console.error('Error loading translation:', err);
                    alert('Error loading translation');
                }
            }

            // 🆕 V11.31: Generate Spanish translation using AI
            async function generateSpanishTranslation(englishContext) {
                const apiKey = groqApiKey.trim();
                if (!apiKey) {
                    alert('⚠️ Please set your Groq API Key in Settings first!');
                    setShowTranslation(false);
                    setShowSettings(true);
                    return;
                }

                setTranslationLoading(true);
                try {
                    const prompt = `Translate this English sentence to Spanish (Castilian Spanish from Spain):

"${englishContext}"

Provide ONLY the Spanish translation, nothing else. Use natural, native Spanish.`;

                    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${apiKey}`
                        },
                        body: JSON.stringify({
                            model: GROQ_MODEL_FAST,
                            messages: [{ role: 'user', content: prompt }],
                            temperature: 0.3,
                            max_tokens: 600, reasoning_effort: GROQ_REASONING_EFFORT
                        })
                    });

                    if (!response.ok) throw new Error('Translation failed');

                    const data = await response.json();
                    const translation = groqContent('spanish', data) || '';
                    setTranslationSpanish(translation);
                } catch (error) {
                    console.error('Translation error:', error);
                    setTranslationSpanish('❌ Error generating translation');
                } finally {
                    setTranslationLoading(false);
                }
            }

            // 🆕 V13.7: Load Writing exercise — pick 6-8 random words
            async function loadWriting() {
                const apiKey = groqApiKey.trim();
                if (!apiKey) {
                    alert('⚠️ Please set your Groq API Key in Settings first!');
                    setShowSettings(true);
                    return;
                }
                try {
                    let query = supabase.from('vocabulary_v4').select('*').is('deleted_at', null);
                    
                    if (search) {
                        if (searchMode === 0) {
                            query = query.or(`vocabulary.ilike.%${search}%,synonyms.ilike.%${search}%`);
                        } else if (searchMode === 1) {
                            const synonyms = await getAIRelatedWords(search, { setLoading: setDeepSearchLoading });
                            if (synonyms.length > 0) {
                                query = query.or(synonyms.map(t => `vocabulary.ilike.%${t}%`).join(','));
                            } else {
                                query = query.or(`vocabulary.ilike.%${search}%,synonyms.ilike.%${search}%`);
                            }
                        }
                    }
                    if (familyFilter !== 'All') query = query.eq('family', familyFilter);
                    if (difficultyFilter !== 'All') query = query.eq('difficulty', difficultyFilter);
                    if (favouriteLevel === 1) query = query.eq('favourite', 1);
                    else if (favouriteLevel === 2) query = query.eq('favourite', 2);
                    else if (favouriteLevel === 3) query = query.in('favourite', [1, 2]);

                    const { data, error } = await query;
                    if (error) throw error;
                    
                    if (!data || data.length < 4) {
                        alert('Need at least 4 vocabulary words to start this exercise!');
                        return;
                    }
                    
                    // Pick 4 random words
                    const shuffled = [...data].sort(() => Math.random() - 0.5);
                    const selected = shuffled.slice(0, 4);
                    
                    setWritingWords(selected);
                    setWritingText('');
                    setWritingFeedback(null);
                    setWritingLoading(false);
                    setWritingWordCount(0);
                    setShowWriting(true);
                } catch (err) {
                    console.error('Error loading writing:', err);
                    alert('Error loading writing exercise');
                }
            }
            
            // 🆕 V13.7: Evaluate user's writing with AI
            // 🆕 V14.6: Shared Groq helper — DeepSeek R1 first, auto-fallback to LLaMA 70b
            // Strips <think> blocks, handles all error cases, returns parsed JSON or throws
            async function callGroqWithFallback(apiKey, messages, maxTokens = 2000) {
                const modelsToTry = [GROQ_MODEL_LARGE, GROQ_MODEL_FAST];
                let lastError = '';
                for (const model of modelsToTry) {
                    try {
                        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                            body: JSON.stringify({ model, messages, temperature: 0.0, max_tokens: maxTokens, reasoning_effort: GROQ_REASONING_EFFORT })
                        });
                        if (!res.ok) {
                            const errData = await res.json().catch(() => ({}));
                            lastError = `${model}: HTTP ${res.status} — ${errData?.error?.message || 'unknown'}`;
                            console.warn('Groq fallback — model failed:', lastError);
                            continue;
                        }
                        const data = await res.json();
                        let raw = groqContent(`fallback:${model}`, data);
                        // 🆕 V14.85: strip any reasoning the model emits into the content
                        raw = stripReasoningBlocks(raw);
                        // 🆕 V14.88: hardened parser — a truncated response now falls through to the
                        // next model instead of throwing an opaque parse error
                        let parsedResult;
                        try {
                            parsedResult = parseLooseJson(raw);
                        } catch (parseErr) {
                            lastError = `${model}: ${parseErr.message}`;
                            console.warn('Groq fallback — unparseable response:', lastError, '| raw:', raw);
                            continue;
                        }
                        console.log('✅ Groq model used:', model);
                        bumpAiDaily('groq'); // 🆕 V14.82
                        return parsedResult;
                    } catch (err) {
                        lastError = `${model}: ${err.message}`;
                        console.warn('Groq fallback — exception:', lastError);
                    }
                }
                throw new Error(`All models failed. Last: ${lastError}`);
            }

            async function evaluateWriting() {
                const apiKey = groqApiKey.trim();
                if ((!apiKey && !geminiApiKey.trim()) || !writingText.trim()) return;
                setWritingLoading(true);
                try {
                    const wordList = writingWords.map(w => w.vocabulary).join(', ');
                    const systemPrompt = `You are a strict Cambridge English examiner. Your job is to identify ONLY real errors in a student's short English paragraph. You do NOT suggest improvements — you only correct genuine mistakes.

━━━ DECISION TREE — apply this before marking ANYTHING ━━━
Before flagging any word or phrase, ask these questions in order:
1. Is it grammatically incorrect? If NO → do NOT mark it.
2. Is it a recognised idiom, phrasal verb, or set expression in any major English dictionary? If YES → do NOT mark it.
3. Would a Cambridge examiner clearly deduct marks for this? If UNSURE → do NOT mark it. Use <note> at most.
If you cannot answer YES to question 1 AND YES to question 3 → leave it completely unmarked.

━━━ ABSOLUTE PROHIBITIONS ━━━
✗ NEVER produce a correction where <del> and <ins> contain identical text. If no change is needed, do not mark it.
✗ NEVER insert explanations, definitions, or relative clauses into the student text.
✗ NEVER add "which means...", "i.e.", or any explanatory content inside annotated_text.
✗ NEVER restructure or rephrase correct sentences.
✗ NEVER penalise unusual but valid collocations. A collocation is only wrong if impossible in English or changes the meaning incorrectly.
✗ NEVER flag British spellings (colour, organise, realise, behaviour, neighbour) as errors.
✗ NEVER flag stylistic choices as errors.
✗ Only modify the minimal incorrect segment — never the whole clause.

━━━ COLLOCATION RULE ━━━
Unusual collocations are NOT automatically incorrect.
Examples that must NOT be flagged: "greedy to the marrow", "strong rain", "big effort".
Only flag a collocation if it is genuinely impossible in English or clearly changes the intended meaning.

━━━ NATURALNESS EVALUATION (COMPLETELY SEPARATE — DOES NOT AFFECT GRADE) ━━━
After completing the error check, evaluate fluency separately.
If a sentence or phrase is grammatically correct but sounds unnatural or uncommon to a native British English speaker:
- Do NOT mark it in annotated_text.
- Do NOT include it in corrections_list.
- Do NOT let it affect the grade or percentage.
- Add a short, helpful observation (max 12 words) in naturalness_notes.
If everything sounds natural, return an empty array: []

━━━ CAMBRIDGE GRADE CALIBRATION ━━━
Count ONLY confirmed grammar/spelling errors from corrections_list:
- 0 errors → C1 or C2 based on sophistication (C2 if complex/varied grammar, C1 if simpler)
- 1 minor grammar error → C1, percentage 80–88%
- 2 grammar errors → B2 high, percentage 70–79%
- 3+ grammar errors affecting clarity → B1, percentage 50–65%
Stylistic awkwardness alone does NOT reduce the grade.
naturalness_notes do NOT reduce the grade.

━━━ OUTPUT FORMAT ━━━
Return ONLY valid JSON — no markdown, no backticks, no preamble, no thinking text:
{
  "grade": "C2" or "C1" or "B2" or "B1",
  "percentage": 0-100,
  "summary": "1 sentence, factual assessment of real errors found",
  "words_used": ["target words the student used"],
  "words_missed": ["target words NOT used"],
  "word_usage_notes": ["word — brief factual note on usage correctness"],
  "naturalness_notes": ["short observation about fluency/naturalness, max 12 words each"],
  "annotated_text": "Student's FULL original text. Mark ONLY real errors: <del>wrong</del><ins>correct</ins>. Optional <note>3-8 words max</note> for genuine style issues only. Leave all correct text — including valid idioms — completely unmarked.",
  "corrections_list": [
    {"id": 1, "original": "exact wrong text from student", "corrected": "corrected text", "type": "grammar/spelling/punctuation", "explanation": "precise reason"}
  ],
  "improved_version": "Student's full text with only the real errors corrected. Every target vocabulary word must appear exactly as the student wrote it."
}`;
                    const userPrompt = `TARGET VOCABULARY (preserve exactly in improved_version): ${wordList}

STUDENT'S TEXT:
"${writingText.trim()}"

Think step by step before producing the JSON:
Step 1 — List every candidate error you notice.
Step 2 — For each candidate, apply the decision tree: grammatically wrong? Known idiom? Would Cambridge penalise it?
Step 3 — Only include confirmed errors in corrections_list.
Step 4 — Separately, note phrases that are correct but unnatural → naturalness_notes only.
Step 5 — Build annotated_text with confirmed errors only.
Step 6 — Assign grade based solely on confirmed error count.

Return ONLY the JSON object.`;
                    const feedback = await aiGenerateWithFallback({
                        label: 'Writing',
                        systemContent: systemPrompt,
                        userPrompt,
                        // Gemini gets extra headroom because thinking tokens share this budget
                        maxOutputTokens: 3000,
                        temperature: 0.0,
                        groqFallback: () => callGroqWithFallback(apiKey, [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: userPrompt }
                        ], 4000)
                    });
                    setWritingFeedback(feedback);
                } catch (error) {
                    console.error('Writing evaluation error:', error);
                    alert(`❌ Error evaluating writing.\n\n${error.message}`);
                } finally {
                    setWritingLoading(false);
                }
            }

            // 🆕 V14.75: EXPLANATION ONLY. The local diff has already decided what the errors are;
            // this call may only say WHY each one is an error. It never counts, adds, removes or
            // reclassifies anything, and the exercise renders fully with or without it.
            async function explainDictationErrors(diff, correctText, userInput) {
                const apiKey = groqApiKey.trim();
                if ((!apiKey && !geminiApiKey.trim()) || !diff || diff.errors.length === 0) return;
                setDictationAILoading(true);
                try {
                    const systemPrompt = `You are a Cambridge English teacher explaining dictation mistakes to a student.

You are given a list of errors that have ALREADY been identified and classified by the application.
Your ONLY job is to explain, for each one, why it is an error.

━━━ ABSOLUTE RULES ━━━
- Do NOT count errors. Do NOT add errors. Do NOT remove errors. Do NOT reclassify them.
- Do NOT comment on anything that is not in the list. Spelling variants (colour/color),
  punctuation, capitalisation and accents have deliberately been excluded and are NOT errors.
- Return exactly one explanation per error id you are given, no more and no fewer.
- Keep each explanation under 20 words, concrete and useful.

━━━ WHAT MAKES A GOOD EXPLANATION ━━━
- spelling     → name the rule or letters involved ("double 'l' before -ing")
- wrong-word   → contrast the meanings ("'above' means higher; 'about' means concerning")
- missing-word → say what its grammatical job was ("article needed before a singular noun")
- extra-word   → say why it does not belong ("no preposition needed after this verb")

Return ONLY valid JSON — no markdown, no backticks, no preamble, no thinking text:
{
  "explanations": [
    {"id": 1, "explanation": "under 20 words, why this specific error is an error"}
  ]
}`;
                    const errorLines = diff.errors.map(e => {
                        if (e.kind === 'missing-word') return `id ${e.id} [missing-word] the student omitted "${e.expected}"`;
                        if (e.kind === 'extra-word') return `id ${e.id} [extra-word] the student added "${e.typed}"`;
                        return `id ${e.id} [${e.kind}] the student wrote "${e.typed}" instead of "${e.expected}"`;
                    }).join('\n');

                    const userPrompt = `ORIGINAL SENTENCE: "${correctText}"
STUDENT'S TRANSCRIPTION: "${userInput}"

ERRORS ALREADY IDENTIFIED (explain these and ONLY these):
${errorLines}

Return one explanation for each id listed above. Explain only; change nothing.`;

                    const result = await aiGenerateWithFallback({
                        label: 'Dictation',
                        systemContent: systemPrompt,
                        userPrompt,
                        maxOutputTokens: 1200,
                        temperature: 0.0,
                        groqFallback: () => callGroqWithFallback(apiKey, [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: userPrompt }
                        ], 2000)
                    });

                    // Keep only explanations matching an error the local diff actually found, so a
                    // stray or invented item can never reach the screen.
                    const validIds = new Set(diff.errors.map(e => e.id));
                    const explanations = (result && Array.isArray(result.explanations) ? result.explanations : [])
                        .filter(x => x && validIds.has(Number(x.id)))
                        .map(x => ({ id: Number(x.id), explanation: String(x.explanation || '').trim() }));

                    setDictationExplanations(explanations);
                } catch (error) {
                    // Explanations are optional — the diff is already on screen either way
                    console.warn('Dictation explanation unavailable (diff unaffected):', error.message);
                } finally {
                    setDictationAILoading(false);
                }
            }

            // 🆕 V11.16: Validate answer with AI for Guesswork exercise
            async function validateGuessworkWithAI(userAnswer, correctAnswer, context) {
                const apiKey = groqApiKey.trim();
                if (!apiKey && !geminiApiKey.trim()) {
                    alert('⚠️ Please set your Gemini or Groq API Key in Settings first!\n\nAI validation requires an API key.');
                    return null;
                }

                setGuessworkAIValidating(true);
                try {
                    const prompt = `You are an expert English vocabulary teacher. Your task is to evaluate the user's answer and give SPECIFIC, CONCISE feedback.

CONTEXT SENTENCE: "${context}"
CORRECT ANSWER: "${correctAnswer}"
USER'S ANSWER: "${userAnswer}"

SCORING RULES - Be GENEROUS with Emerging (not Passive):
1. EXACT MATCH (same word, correct spelling) -> score='Active', is_synonym=false
   - explanation: 'Perfect! Exact match.'
2. VALID SYNONYM or VERY CLOSE ALTERNATIVE (communicates the same idea, fits the context) -> score='Emerging', is_synonym=true
   - This includes: near-synonyms, informal equivalents, words a native speaker might use
   - Example: 'thanks a lot' vs 'thanks a bunch' -> Emerging (both express gratitude)
   - Example: 'walk the line' vs 'toe the line' -> Emerging (related but subtly different)
3. UNDERSTANDABLE BUT WRONG (clearly different meaning, doesn't fit well) -> score='Passive', is_synonym=false

FEEDBACK FORMAT (for Emerging and Passive only - NOT for exact match):
- DO NOT say the user is wrong or incorrect
- 2-3 bullet points MAX with SHORT bold labels (**label**)
- Be SPECIFIC to these exact words/phrases
- For Emerging: acknowledge the user's answer is valid, then explain the subtle difference
- Maximum 80 words

Example GOOD feedback for Emerging ('thanks a lot' vs 'thanks a bunch'):
In everyday conversation, 'thanks a lot' is perfectly understandable. However, 'thanks a bunch' is preferred here:
- **Collocation**: 'Thanks a bunch' is a warmer, more casual British idiom between friends.
- **Ambiguity risk**: 'Thanks a lot' is frequently sarcastic in British English, which could create the wrong tone here.

Respond ONLY in this exact JSON format (no markdown, no backticks):
{
  "explanation": "Feedback using the format above",
  "score": "Active/Emerging/Passive",
  "is_synonym": true/false,
  "synonym_note": "Brief nuance note if is_synonym=true, else empty string"
}`;

                    const result = await aiGenerateWithFallback({
                        label: 'Guesswork',
                        // this prompt has no system message — it stays a single user prompt on both providers
                        userPrompt: prompt,
                        maxOutputTokens: 800,
                        temperature: 0.3,
                        groqFallback: async () => {
                            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${apiKey}`
                                },
                                body: JSON.stringify({
                                    model: GROQ_MODEL_FAST,
                                    messages: [{ role: 'user', content: prompt }],
                                    temperature: 0.3,
                                    max_tokens: 1200, reasoning_effort: GROQ_REASONING_EFFORT
                                })
                            });

                            if (!response.ok) {
                                throw new Error(`API Error ${response.status}`);
                            }

                            const data = await response.json();
                            return parseLooseJson(groqContent('guesswork-validate', data));
                        }
                    });

                    return result;
                } catch (error) {
                    console.error('AI Validation Error:', error);
                    alert('❌ AI validation failed. Please check your API key.');
                    return null;
                } finally {
                    setGuessworkAIValidating(false);
                }
            }

            // 🆕 V11.64: Generate AI-based near-synonym distractors for Selection exercise
            async function generateAISelectionOptions(correctWord) {
                const apiKey = groqApiKey.trim();
                if (!apiKey) return null;
                
                try {
                    const prompt = `You are an English vocabulary expert. Generate distractors for a fill-in-the-blank exercise.

CORRECT ANSWER: "${correctWord.vocabulary}"
WORD FAMILY: "${correctWord.family}"
CONTEXT SENTENCE: "${correctWord.context}"

GRAMMAR RULE: Look at the context sentence. Identify the TENSE and GRAMMATICAL FORM required.
All options (including the correct answer) MUST use the same grammatical form.
Example: if the sentence is past tense, all options must be past tense.

Generate EXACTLY 4 distractors:
- Distractor 1: ONE plausible 'red herring' - semantically related, same grammar, but wrong for this specific context
- Distractor 2, 3, 4: THREE clearly unsuitable options - same grammatical category but obviously wrong in meaning or register

Rules:
- ALL options must match the grammatical form/tense of the correct answer in context
- Real English words/phrases only
- Do NOT include the correct answer itself
- Short (1-4 words max), matching the style of the correct answer

Respond ONLY in this JSON format (no markdown, no backticks):
{
  "distractors": ["red_herring", "clearly_wrong1", "clearly_wrong2", "clearly_wrong3"]
}`;
                    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${apiKey}`
                        },
                        body: JSON.stringify({
                            model: GROQ_MODEL_FAST,
                            messages: [{ role: 'user', content: prompt }],
                            temperature: 0.7,
                            max_tokens: 800, reasoning_effort: GROQ_REASONING_EFFORT
                        })
                    });
                    
                    if (!response.ok) throw new Error('API Error');
                    
                    const data = await response.json();
                    // 🆕 V14.85: reasoning-safe, and brace-recovery instead of a bare JSON.parse
                    const result = parseLooseJson(groqContent('selection-options', data));
                    
                    // Convert distractors to word objects like the correct word
                    return (result.distractors || []).map(word => ({
                        vocabulary: word,
                        family: correctWord.family,
                        _isAIGenerated: true
                    }));
                } catch (error) {
                    console.error('🆕 AI Selection Options Error:', error);
                    return null;
                }
            }

            // 🆕 V11.65: Explain why correct answer is best (only if user made wrong attempts)
            async function explainSelectionAnswer(correctWord, wrongAnswers, context) {
                const apiKey = groqApiKey.trim();
                if ((!apiKey && !geminiApiKey.trim()) || !wrongAnswers || wrongAnswers.length === 0) return;
                
                setSelectionExplLoading(true);
                try {
                    const prompt = `You are an expert English vocabulary teacher. Give a CONCISE, PRECISE explanation of why the correct answer is better than the wrong ones.

CONTEXT SENTENCE: "${context}"
CORRECT ANSWER: "${correctWord}"
WRONG ANSWERS TRIED: ${wrongAnswers.join(", ")}

RULES:
- Be SPECIFIC to these exact words/phrases and this exact context
- NO generic language-learning advice
- Format: 2-3 bullet points with SHORT bold labels (**label**)
- Start with: "While [wrong answer] is understandable, [correct answer] is better here:"
- End with ONE sentence about why it fits this specific context
- Maximum 100 words total

Example of GOOD output:
While "on the fly" is understandable, "off the cuff" is better here:
- **Speech focus**: "Off the cuff" is used almost exclusively for unscripted speaking.
- **Action vs speech**: "On the fly" means quick decisions during a task in progress, not speech delivery.
Since she is giving a speech, "off the cuff" is the most natural and idiomatic choice.`;

                    const explanation = await aiGenerateWithFallback({
                        label: 'Selection explanation',
                        userPrompt: prompt,
                        maxOutputTokens: 800,
                        temperature: 0.5,
                        // this one wants prose back, not JSON
                        json: false,
                        groqFallback: async () => {
                            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${apiKey}`
                                },
                                body: JSON.stringify({
                                    model: GROQ_MODEL_FAST,
                                    messages: [{ role: 'user', content: prompt }],
                                    temperature: 0.5,
                                    max_tokens: 900, reasoning_effort: GROQ_REASONING_EFFORT
                                })
                            });

                            if (!response.ok) throw new Error('API Error');

                            const data = await response.json();
                            return groqContent('selection-explain', data);
                        }
                    });
                    setSelectionExplanation(explanation);
                } catch (error) {
                    console.error('Selection Explanation Error:', error);
                    setSelectionExplanation('');
                } finally {
                    setSelectionExplLoading(false);
                }
            }

            // 🆕 V14.6: Validate translation — DeepSeek R1 + fallback, same quality as Writing
            // 🆕 V14.77: rebuild the annotations from corrections_list so what is marked in the text
            // always corresponds 1:1 to what is listed. Returns null when nothing could be located.
            function buildAnnotatedFromCorrections(text, corrections) {
                const lower = text.toLowerCase();
                const used = new Array(text.length).fill(false);
                const ranges = [];
                // longest first, so a short original cannot claim text inside a longer one
                const ordered = [...corrections].sort((a, b) => (b.original || '').length - (a.original || '').length);

                for (const c of ordered) {
                    const orig = (c.original || '').trim();
                    if (!orig) continue;
                    let from = 0, idx;
                    while ((idx = lower.indexOf(orig.toLowerCase(), from)) !== -1) {
                        if (!used.slice(idx, idx + orig.length).some(Boolean)) {
                            for (let i = idx; i < idx + orig.length; i++) used[i] = true;
                            ranges.push({ start: idx, end: idx + orig.length, corrected: c.corrected || '', id: c.id });
                            break;
                        }
                        from = idx + 1;
                    }
                }
                if (!ranges.length) return null;

                ranges.sort((a, b) => a.start - b.start);
                let out = '', pos = 0;
                for (const r of ranges) {
                    out += text.slice(pos, r.start) + '<del>' + text.slice(r.start, r.end) + '</del><ins>' + r.corrected + '</ins>';
                    pos = r.end;
                }
                return out + text.slice(pos);
            }

            // 🆕 V14.77: make grade, summary and annotations agree. corrections_list is the authority:
            // the model was reporting an error in its feedback and lowering the grade while leaving
            // the text unmarked, so nothing was clickable.
            function reconcileTranslationResult(raw, userTranslation) {
                console.log('[Translation] raw AI response:', raw);

                const listed = Array.isArray(raw?.corrections_list) ? raw.corrections_list : [];

                // Corrections whose "original" appears in the answer can be shown inline. Ones that
                // cannot (e.g. a missing vocabulary word) are still real, but listed separately.
                const inline = [], general = [];
                listed.forEach(c => {
                    if (!c) return;
                    const orig = (c.original || '').trim();
                    const found = orig && userTranslation.toLowerCase().includes(orig.toLowerCase());
                    (found ? inline : general).push(c);
                });

                const corrections = [...inline, ...general].map((c, i) => ({ ...c, id: i + 1 }));
                const errorCount = corrections.length;

                // Grade and percentage derived from the confirmed count, never from the model's own
                // arithmetic — 0 corrections can no longer produce a marked-down grade.
                let grade, percentage;
                if (errorCount === 0) {
                    grade = raw?.grade === 'C1' ? 'C1' : 'C2';
                    percentage = Math.max(Number(raw?.percentage) || 0, 95);
                } else if (errorCount === 1) {
                    grade = 'C1'; percentage = 85;
                } else if (errorCount === 2) {
                    grade = 'B2'; percentage = 75;
                } else {
                    grade = 'B1'; percentage = 60;
                }

                const feedback = errorCount === 0
                    ? 'Correct translation — it accurately conveys the Spanish sentence.'
                    : (raw?.feedback || `${errorCount} point${errorCount === 1 ? '' : 's'} to review.`);

                const annotated_text = errorCount === 0
                    ? null // nothing to mark — render the answer plain
                    : (buildAnnotatedFromCorrections(userTranslation, corrections) || null);

                if ((raw?.grade && raw.grade !== grade) || (Array.isArray(raw?.corrections_list) && raw.corrections_list.length !== errorCount)) {
                    console.log('[Translation] reconciled →', {
                        aiGrade: raw?.grade, finalGrade: grade,
                        aiCorrections: listed.length, usable: errorCount,
                        droppedUnlocatable: listed.length - errorCount
                    });
                }

                return { ...raw, grade, percentage, feedback, corrections_list: corrections, general_notes: general, annotated_text };
            }

            async function validateTranslationWithAI(userTranslation, originalEnglish, spanishSource, vocabularyWord) {
                const apiKey = groqApiKey.trim();
                if (!apiKey && !geminiApiKey.trim()) {
                    alert('⚠️ Please set your Gemini or Groq API Key in Settings first!\n\nAI validation requires an API key.');
                    return null;
                }
                setTranslationAIValidating(true);
                try {
                    // 🆕 V14.76: checked here, not by the model — this is the one hard requirement
                    const vocabPresent = containsVocabularyWord(userTranslation, vocabularyWord);

                    const systemPrompt = `You are a Cambridge English examiner marking a Spanish-to-English translation.

━━━ WHAT YOU ARE JUDGING ━━━
You are judging whether the student's English is a CORRECT translation of the SPANISH sentence.
You are NOT checking whether it matches the reference English sentence.

The reference English is ONE valid way to translate the Spanish. It is NOT the required answer.
Many different wordings can all be correct. If the student's English accurately conveys the Spanish
and reads naturally, it is CORRECT — even if every single word differs from the reference.

━━━ MARK AS AN ERROR ONLY ━━━
1. Wrong meaning — the English does not convey what the Spanish says
2. Grammar mistakes — wrong tense, agreement, article, word order
3. Unnatural phrasing — no competent native speaker would say it that way
4. Misspellings

━━━ NEVER MARK AS AN ERROR ━━━
✗ A different but accurate and natural wording. This is the most important rule.
  Example: if the reference says "it can recover" and the student writes "taking over it" in a way
  that correctly renders the Spanish, that is CORRECT — do not "fix" it towards the reference.
✗ A different valid synonym, tense choice or sentence structure that still conveys the Spanish
✗ TENSE CHOICES that accurately render the Spanish. Spanish future ("tendrá que") can legitimately
  become "will need to", "needs to", "is going to have to" — all correct. Never mark one as wrong
  because the reference chose another.
✗ LEXICAL CHOICES within the meaning of the Spanish word. "pérdidas" can be "losses", "deficits"
  or "shortfalls" — all correct. Never mark a valid synonym because the reference chose another.

━━━ WORKED EXAMPLE — THIS MUST BE MARKED FULLY CORRECT, ZERO ERRORS ━━━
SPANISH:   "La empresa tendrá que soportar la tormenta de pérdidas financieras antes de poder recuperarse"
REFERENCE: "The company will need to weather the storm of financial losses before it can recover."
STUDENT:   "The company needs to weather the storm of financial deficits before it can recover."
Correct verdict: grade C2, percentage 100, corrections_list EMPTY, annotated_text unmarked.
Why: "needs to" accurately renders "tendrá que", and "deficits" is a legitimate reading of
"pérdidas". Neither is an error. Marking either one would be WRONG.
Any response that flags "needs to" or "deficits" here is a failure.
✗ he/she/his/her differences — Spanish often does not specify gender
✗ Punctuation-only differences
✗ British spellings
✗ Unusual but valid collocations
✗ NEVER produce a correction where <del> and <ins> contain identical text
✗ NEVER rewrite a correct sentence to look more like the reference

━━━ THE ONE HARD REQUIREMENT ━━━
The student is practising a specific vocabulary word. It MUST appear in their translation
(any inflection is fine). The application pre-checks this and tells you the result.
- Told PRESENT → never comment on it. The check is reliable here.
- Told NOT FOUND → the check only understands regular inflections, so verify yourself first.
  If the student DID use the word in any form, including an irregular one ("took" for "take",
  "brought" for "bring"), treat it as PRESENT and say nothing.
  Only if it is genuinely absent, add exactly one error of type "vocabulary" saying the practised
  word is missing, and cap the grade at B2 — however good the rest of the translation is.

━━━ CAMBRIDGE GRADE CALIBRATION ━━━
Count ONLY confirmed errors from corrections_list:
- 0 errors → C1 or C2 based on sophistication (C2 if complex/varied, C1 if simpler)
- 1 minor error → C1, percentage 80–88%
- 2 errors → B2 high, percentage 70–79%
- 3+ errors → B1, percentage 50–65%

━━━ OUTPUT FORMAT ━━━
Return ONLY valid JSON — no markdown, no backticks, no preamble, no thinking text:
{
  "grade": "C2/C1/B2/B1",
  "percentage": 0-100,
  "annotated_text": "Student's FULL English translation with inline markup. Use <del>wrong</del><ins>correct</ins> for confirmed errors ONLY. Use <note>3-8 words max</note> for style notes only. Keep ALL correct text exactly as written — if there are no errors, return the student's text completely unmarked.",
  "corrections_list": [
    {"id": 1, "original": "wrong text", "corrected": "correct text", "type": "grammar/spelling/vocabulary/meaning", "explanation": "precise reason"}
  ],
  "feedback": "1 sentence. If the translation is correct, say so and note it is a valid alternative wording."
}

━━━ CONSISTENCY — CHECK BEFORE YOU ANSWER ━━━
Your three outputs must agree with each other:
- Every error you mention in "feedback" MUST have an entry in corrections_list.
- Every entry in corrections_list MUST appear marked in annotated_text, and its "original" MUST be
  text copied EXACTLY from the student's translation so it can be located.
- If corrections_list is empty, the grade is C1 or C2, the percentage is 95-100, and "feedback"
  must NOT mention any error, mistake or improvement.
Never lower the grade for something you did not put in corrections_list.`;
                    const userPrompt = `SPANISH SENTENCE (this is what must be translated): "${spanishSource}"
REFERENCE ENGLISH (one valid rendering — NOT the required answer, never correct towards it): "${originalEnglish}"
STUDENT'S ENGLISH TRANSLATION: "${userTranslation}"

PRACTISED VOCABULARY WORD: "${vocabularyWord || '(none)'}"
PRE-CHECK BY THE APPLICATION — the practised word is: ${vocabPresent ? 'PRESENT (reliable — do not comment on it)' : 'NOT FOUND (verify yourself: if the student used any form of it, including an irregular one, treat it as PRESENT; only flag it if genuinely absent)'}

Think step by step:
Step 1 — Read the SPANISH. What does it actually mean?
Step 2 — Does the student's English convey that meaning? If yes, it is correct so far, no matter how
         differently it is worded from the reference.
Step 3 — Now check ONLY for: wrong meaning, grammar mistakes, unnatural phrasing, misspellings.
Step 4 — Before writing each correction, ask: "am I fixing a real mistake, or just making it look
         more like the reference?" If the latter, discard it.
Step 5 — Apply the vocabulary-word result given above.
Step 6 — Assign the grade from the confirmed error count alone.
Step 7 — Re-read your own feedback. Does it mention anything that is not in corrections_list?
         If so, either add the correction properly or remove the claim from the feedback.

Return ONLY the JSON object.`;
                    const result = await aiGenerateWithFallback({
                        label: 'Translation',
                        systemContent: systemPrompt,
                        userPrompt,
                        maxOutputTokens: 1500,
                        temperature: 0.0,
                        groqFallback: () => callGroqWithFallback(apiKey, [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: userPrompt }
                        ], 2500)
                    });
                    // 🆕 V14.77: grade, summary and annotations reconciled against corrections_list
                    return reconcileTranslationResult(result, userTranslation);
                } catch (error) {
                    console.error('Translation Validation Error:', error);
                    alert(`❌ Translation validation failed.\n\n${error.message}`);
                    return null;
                } finally {
                    setTranslationAIValidating(false);
                }
            }

            // 🆕 V11.38: Voice-to-text function for Translation exercise
            // 🆕 V11.38: Voice-to-text with file:// protocol detection
            function startTranslationVoiceRecognition() {
                if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
                    alert('❌ Voice recognition not supported in this browser.\n\nPlease use Chrome, Edge, or Safari.');
                    return;
                }

                // 🆕 V11.38: Detect file:// protocol (microphone won't work in Chrome)
                if (window.location.protocol === 'file:') {
                    alert('⚠️ MICROPHONE NOT AVAILABLE\n\n📁 You are running this file locally (file://)\n\nChrome blocks microphone access for local files for security reasons.\n\n✅ SOLUTIONS:\n• Type your translation manually (recommended)\n• Upload file to a web server (http:// or https://)\n• Use Firefox (may work with local files)');
                    return;
                }

                const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
                const recognition = new SpeechRecognition();
                
                recognition.lang = 'en-GB'; // British English
                recognition.continuous = false; // Stop after one result
                recognition.interimResults = false;

                recognition.onstart = () => {
                    setTranslationVoiceListening(true);
                };

                recognition.onresult = (event) => {
                    const transcript = event.results[0][0].transcript;
                    setTranslationInput(prev => prev ? prev + ' ' + transcript : transcript);
                    setTranslationVoiceListening(false);
                };

                recognition.onerror = (event) => {
                    console.error('Voice recognition error:', event.error);
                    setTranslationVoiceListening(false);
                    
                    // 🆕 V11.38: Improved mobile error messages
                    if (event.error === 'no-speech') {
                        alert('⚠️ No speech detected. Please try again.');
                    } else if (event.error === 'not-allowed' || event.error === 'audio-capture') {
                        alert('❌ Microphone access denied.\n\n📱 MOBILE: Open browser settings → Find this site → Enable microphone\n\n🖥️ DESKTOP: Click the microphone icon in address bar → Allow');
                    } else if (event.error === 'network') {
                        alert('❌ Network error. Please check your internet connection.');
                    } else {
                        alert(`❌ Voice recognition error: ${event.error}\n\nTry again or type manually.`);
                    }
                };

                recognition.onend = () => {
                    setTranslationVoiceListening(false);
                };

                try {
                    recognition.start();
                } catch (error) {
                    console.error('Failed to start recognition:', error);
                    setTranslationVoiceListening(false);
                    alert('❌ Could not start voice recognition.\n\nPlease ensure microphone permissions are granted.');
                }
            }

            // 🆕 V11.6: Open word in dictionary
            function openInDictionary(word) {
                const urls = {
                    wordreference: `https://www.wordreference.com/enes/${word}`,
                    cambridge: `https://dictionary.cambridge.org/dictionary/english/${word}`,
                    youglish: `https://youglish.com/pronounce/${word}/english`
                };
                window.open(urls[clickAction] || urls.wordreference, '_blank');
            }

            const resetFilters = () => {
                setSearch(''); setFamilyFilter('All'); setEmptyFilter('None'); setDifficultyFilter('All'); setFavouriteLevel(0); setSearchMode(0);                 setTimeout(() => searchInputRef.current?.focus(), 50);
            };

            const getFormattedDate = () => new Date().toISOString().split('T')[0];

            const exportCSV = async () => {
                // 🆕 V11.2: Export only non-deleted items
                const { data } = await supabase.from('vocabulary_v4').select('*').is('deleted_at', null).order('created_at', { ascending: false });
                if (!data || data.length === 0) return;
                const headers = Object.keys(data[0]);
                const rows = data.map(w => headers.map(h => `"${(w[h] || '').toString().replace(/"/g, '""')}"`).join(";"));
                const csvContent = "\ufeff" + [headers.join(";"), ...rows].join("\n");
                const link = document.createElement("a");
                link.href = URL.createObjectURL(new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }));
                link.download = `Booster_Export_${getFormattedDate()}.csv`;
                link.click();
            };

            const handleImport = async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = async (evt) => {
                    try {
                        let parsedData;
                        
                        // Parse file
                        if (file.name.endsWith('.json')) {
                            parsedData = JSON.parse(evt.target.result);
                        } else {
                            const lines = evt.target.result.split("\n").filter(l => l.trim());
                            const sep = lines[0].includes(';') ? ';' : ',';
                            const headers = lines[0].replace(/^\ufeff/, "").split(sep).map(h => h.replace(/"/g, "").trim().toLowerCase());
                            
                            
                            parsedData = lines.slice(1).map(line => {
                                const values = line.split(sep).map(v => v.replace(/^"|"$/g, "").replace(/""/g, '"').trim());
                                return headers.reduce((obj, h, i) => {
                                    obj[h] = values[i] === "" ? null : values[i];
                                    return obj;
                                }, {});
                            });
                        }
                        
                        // Log first raw record
                        if (parsedData.length > 0) {
                        }
                        
                        // 🆕 V11.50: Enhanced conversion with validation
                        const finalUpload = parsedData.filter(d => d.vocabulary).map((d, index) => {
                            
                            const convertToInt = (val, fieldName) => {
                                if (val === null || val === undefined || val === '') return 0;
                                if (val === 'null' || val === 'false' || val === 'true' || val === 'undefined') return 0;
                                const num = parseInt(val);
                                if (isNaN(num)) {
                                    console.warn(`⚠️ Record ${index}: ${fieldName} = "${val}" (invalid integer, using 0)`);
                                    return 0;
                                }
                                return num;
                            };
                            
                            const convertToBoolean = (val, fieldName) => {
                                if (val === true || val === 'true' || val === '1' || val === 1) return true;
                                if (val === false || val === 'false' || val === '0' || val === 0 || !val) return false;
                                console.warn(`⚠️ Record ${index}: ${fieldName} = "${val}" (invalid boolean, using false)`);
                                return false;
                            };
                            
                            const convertToDate = (val, fieldName) => {
                                if (!val || val === '' || val === 'null' || val === 'undefined') return null;
                                try {
                                    const date = new Date(val);
                                    if (isNaN(date.getTime())) {
                                        console.warn(`⚠️ Record ${index}: ${fieldName} = "${val}" (invalid date, using null)`);
                                        return null;
                                    }
                                    return date.toISOString();
                                } catch {
                                    console.warn(`⚠️ Record ${index}: ${fieldName} = "${val}" (date parse error, using null)`);
                                    return null;
                                }
                            };
                            
                            const convertToString = (val, fieldName) => {
                                if (!val || val === '' || val === 'null' || val === 'undefined') return null;
                                return val.toString();
                            };
                            
                            // 🆕 V11.50: Build ONLY known valid fields, nothing else
                            const cleanRecord = {
                                vocabulary: convertToString(d.vocabulary, 'vocabulary'),
                                family: convertToString(d.family, 'family'),
                                synonyms: convertToString(d.synonyms, 'synonyms'),
                                context: convertToString(d.context, 'context'),
                                difficulty: convertToString(d.difficulty, 'difficulty'),
                                favourite: convertToInt(d.favourite, 'favourite'),
                                flashcard_count: convertToInt(d.flashcard_count, 'flashcard_count'),
                                dictation_count: convertToInt(d.dictation_count, 'dictation_count'),
                                dictation_errors_total: convertToInt(d.dictation_errors_total, 'dictation_errors_total'),
                                selection_count: convertToInt(d.selection_count, 'selection_count'),
                                selection_attempts_total: convertToInt(d.selection_attempts_total, 'selection_attempts_total'),
                                guesswork_count: convertToInt(d.guesswork_count, 'guesswork_count'),
                                translation_count: convertToInt(d.translation_count, 'translation_count'),
                                translation_best_grade: convertToString(d.translation_best_grade, 'translation_best_grade'),
                                last_practiced_date: convertToDate(d.last_practiced_date, 'last_practiced_date'),
                                deleted_at: convertToDate(d.deleted_at, 'deleted_at')
                            };
                            
                            // Add id if valid
                            if (d.id && d.id !== "null" && d.id !== "" && d.id !== "undefined") {
                                cleanRecord.id = d.id;
                            }
                            
                            // Add created_at if valid
                            const createdAt = convertToDate(d.created_at, 'created_at');
                            if (createdAt) {
                                cleanRecord.created_at = createdAt;
                            }
                            
                            return cleanRecord;
                        });
                        
                        // 🆕 V11.50: Extensive validation logging
                        if (finalUpload.length > 0) {
                            Object.keys(finalUpload[0]).forEach(key => {
                                const val = finalUpload[0][key];
                            });
                        }
                        
                        const { error } = await supabase.from('vocabulary_v4').upsert(finalUpload);
                        if (error) throw error;
                        
                        alert("✅ Sync Complete!");
                        setWords([]);
                        fetchWords(0, true);
                    } catch (err) { 
                        console.error('❌ Import error details:', err);
                        console.error('Error code:', err.code);
                        console.error('Error message:', err.message);
                        console.error('Error details:', err.details);
                        console.error('Error hint:', err.hint);
                        alert(`Import Error: ${err.message || 'Structure mismatch'}\n\nError Code: ${err.code || 'Unknown'}\n\nCheck console for full details.`); 
                    }
                };
                reader.readAsText(file);
            };

            // V11.85: Highlight matching text in results
            const highlightMatch = (text, term) => {
                if (!text || !term) return text;
                const idx = text.toLowerCase().indexOf(term.toLowerCase());
                if (idx === -1) return text;
                return <>{text.slice(0, idx)}<mark className="bg-yellow-400/40 text-yellow-200 rounded px-0.5">{text.slice(idx, idx + term.length)}</mark>{text.slice(idx + term.length)}</>;
            };

            // V11.85: Duplicate check - real-time basic search
            const searchDuplicates = async (term) => {
                if (!term || term.trim().length < 2) { setDupCheck({ loading: false, morphLoading: false, exact: [], partial: [], morphForms: [], term: '' }); return; }
                const t = term.trim().toLowerCase();
                setDupCheck(prev => ({ ...prev, loading: true }));
                try {
                    const { data } = await supabase
                        .from('vocabulary_v4')
                        .select('id, vocabulary, synonyms, context')
                        .or(`vocabulary.ilike.%${t}%,synonyms.ilike.%${t}%`)
                        .is('deleted_at', null)
                        .limit(8);
                    const exact = (data || []).filter(w => w.vocabulary.toLowerCase() === t);
                    const partial = (data || []).filter(w => w.vocabulary.toLowerCase() !== t);
                    setDupCheck(prev => ({ ...prev, loading: false, exact, partial, term: t }));
                } catch(e) {
                    setDupCheck(prev => ({ ...prev, loading: false }));
                }
            };

            // 🆕 V11.95: Unified AI search for add modal — uses getAIRelatedWords
            const searchMorphological = async (term) => {
                if (!groqApiKey.trim()) { alert('Please set your Groq API Key in Settings first.'); return; }
                if (!term || term.trim().length < 2) return;
                const t = term.trim();
                setDupCheck(prev => ({ ...prev, morphLoading: true, morphForms: [] }));
                try {
                    const forms = await getAIRelatedWords(t);
                    const searchTerms = forms.map(f => `vocabulary.ilike.%${f}%`).join(',');
                    if (searchTerms) {
                        const { data: morphData } = await supabase
                            .from('vocabulary_v4')
                            .select('id, vocabulary, synonyms, context')
                            .or(searchTerms)
                            .is('deleted_at', null)
                            .limit(15);
                        setDupCheck(prev => {
                            const existingIds = new Set([...prev.exact, ...prev.partial].map(w => w.id));
                            const deduped = (morphData || []).filter(w => !existingIds.has(w.id));
                            return { ...prev, morphLoading: false, morphForms: deduped };
                        });
                    } else {
                        setDupCheck(prev => ({ ...prev, morphLoading: false, morphForms: [] }));
                    }
                } catch(e) {
                    setDupCheck(prev => ({ ...prev, morphLoading: false }));
                }
            };

            // ─── 🆕 V14.78: batch AI fill ─────────────────────────────────────────────────────
            const BATCH_SIZE = 25;
            const BATCH_DELAY_MS = 6000; // ~10 requests/minute, inside Gemini's free per-minute limit
            // 🆕 V14.80: backoff for transient 5xx / timeouts. 429 is never retried — it stops the batch.
            const BATCH_RETRY_DELAYS = [5000, 15000, 40000];

            const isRecordPending = w => !w.synonyms?.trim() || !w.context?.trim() || !w.family?.trim();

            const [batchRunning, setBatchRunning] = useState(false);
            const [batchProgress, setBatchProgress] = useState(null);
            const [batchSummary, setBatchSummary] = useState(null);
            const [batchPendingTotal, setBatchPendingTotal] = useState(0);
            const batchStopRef = React.useRef(false);

            // 🆕 V14.81: model chooser. Remembered for the session, defaulting to whatever is configured.
            const [showBatchChooser, setShowBatchChooser] = useState(false);
            const [batchModelChoice, setBatchModelChoice] = useState(null);

            // Filters whose records already HAVE content of unverified quality. Combined with Gemini
            // these become the upgrade path, which REPLACES existing content rather than filling blanks.
            // 🆕 V14.84: 'Unknown origin' joins 'Filled with Groq' here.
            const UPGRADE_FILTERS = ['GroqFilled', 'UnknownOrigin'];
            const isGroqFilledFilter = UPGRADE_FILTERS.includes(emptyFilter);

            // 🆕 V14.84: "has content in at least one field" — a bare ai_source IS NULL would also
            // match the ~4,300 genuinely empty records, which nothing has filled.
            const HAS_ANY_CONTENT = 'and(synonyms.not.is.null,synonyms.neq.),and(context.not.is.null,context.neq.),and(family.not.is.null,family.neq.)';

            const AI_SOURCE_LABELS = { gemini: 'Filled by Gemini', groq: 'Filled by Groq' };

            // Total pending across the WHOLE current filter, not just the rows loaded so far
            async function refreshPendingTotal() {
                if (!supabase) return;
                try {
                    let query = supabase.from('vocabulary_v4')
                        .select('id', { count: 'exact', head: true })
                        .is('deleted_at', null);

                    // 🆕 V14.83: apply the SAME emptyFilter constraint the list uses. Without this the
                    // count ranged over the whole table, so "No Context" could report more pending
                    // than the filter contains — records that have a context but lack family were
                    // being counted even though the batch would never see them.
                    if (emptyFilter === 'Synonyms') query = query.or('synonyms.is.null,synonyms.eq.');
                    else if (emptyFilter === 'Context') query = query.or('context.is.null,context.eq.');
                    else if (emptyFilter === 'Family') query = query.or('family.is.null,family.eq.');
                    else if (emptyFilter === 'Difficulty') query = query.or('difficulty.is.null,difficulty.eq.,difficulty.eq.NULL');
                    else if (emptyFilter === 'GroqFilled') query = query.eq('ai_source', 'groq');
                    else if (emptyFilter === 'GeminiFilled') query = query.eq('ai_source', 'gemini');
                    // 🆕 V14.84: unknown origin = has content, but no recorded model
                    else if (emptyFilter === 'UnknownOrigin') query = query.is('ai_source', null).or(HAS_ANY_CONTENT);

                    // 🆕 V14.81: on the upgrade path every Groq-filled record is a candidate, blanks
                    // or not. Everywhere else "pending" still means missing at least one field, which
                    // is ANDed with the filter above so the count can never exceed the filtered rows.
                    if (!isGroqFilledFilter) {
                        query = query.or('synonyms.is.null,synonyms.eq.,context.is.null,context.eq.,family.is.null,family.eq.');
                    }

                    if (search.trim()) query = query.ilike('vocabulary', `%${search.trim()}%`);
                    if (familyFilter !== 'All') query = query.eq('family', familyFilter);
                    if (difficultyFilter !== 'All') query = query.eq('difficulty', difficultyFilter);
                    if (favouriteLevel === 1) query = query.eq('favourite', 1);
                    else if (favouriteLevel === 2) query = query.eq('favourite', 2);
                    else if (favouriteLevel === 3) query = query.in('favourite', [1, 2]);

                    const { count, error } = await query;
                    if (!error) setBatchPendingTotal(count || 0);
                } catch (e) {
                    console.warn('[Batch fill] pending count unavailable:', e.message);
                }
            }

            // One record, Gemini only. Returns 'filled' | 'skipped' | 'failed' | 'quota'.
            // Deliberately NO Groq fallback: the point of batching is Gemini quality, and quietly
            // filling thousands of records with the weaker model is worse than stopping.
            // 🆕 V14.81: Groq path for batch fill. Same prompt, different transport.
            async function callGroqForBatch(prompt) {
                const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqApiKey.trim()}` },
                    body: JSON.stringify({
                        model: GROQ_MODEL_LARGE,
                        messages: [
                            { role: 'system', content: MAGIC_FILL_SYSTEM },
                            { role: 'user', content: prompt }
                        ],
                        temperature: 0.2,
                        max_tokens: 1500, reasoning_effort: GROQ_REASONING_EFFORT
                    })
                });

                if (!response.ok) {
                    const bodyText = await response.text().catch(() => '');
                    const err = new Error(`Groq API Error ${response.status}: ${bodyText.slice(0, 200)}`);
                    err.status = response.status;
                    // Groq 5xx is transient in the same way Gemini's is; 429 is rate limiting,
                    // which for Groq recovers quickly, so it is retriable here unlike Gemini's quota.
                    err.retriable = [429, 500, 502, 503, 504].includes(response.status);
                    throw err;
                }

                const data = await response.json();
                const text = groqContent('batch-fill', data);
                if (!text.trim()) throw new Error('Empty Groq response');
                bumpAiDaily('groq'); // 🆕 V14.82
                return text;
            }

            // 🆕 V14.79: returns { outcome, reason, detail } so every failure is explainable.
            // "Failed: 4" with no cause was not actionable — each stage now reports why it stopped.
            // 🆕 V14.81: `model` selects the provider and is recorded in ai_source; `overwrite`
            // replaces existing content instead of only filling blanks (the Gemini upgrade path).
            async function batchFillRecord(record, model = 'gemini', overwrite = false) {
                const missing = {
                    synonyms: overwrite || !record.synonyms?.trim(),
                    context: overwrite || !record.context?.trim(),
                    family: overwrite || !record.family?.trim()
                };
                if (!missing.synonyms && !missing.context && !missing.family) {
                    return { outcome: 'skipped', reason: 'already complete' };
                }

                const tag = `[Batch fill] "${record.vocabulary}"`;
                console.log(`${tag} → requesting. Missing:`, Object.keys(missing).filter(k => missing[k]).join(', '));

                // ── 1. API call, with backoff on transient 5xx / timeouts ──────────────────────
                let raw;
                let retries = 0;
                const prompt = buildMagicFillPrompt(record.vocabulary, record.family || '');

                for (let attempt = 0; ; attempt++) {
                    try {
                        raw = model === 'groq'
                            ? await callGroqForBatch(prompt)
                            : await callGemini(geminiApiKey.trim(), MAGIC_FILL_SYSTEM, prompt, 'Batch fill');
                        console.log(`${tag} raw ${model} response:`, raw);
                        break;
                    } catch (e) {
                        // Gemini 429 means the daily quota is gone — stop the batch, never retry.
                        // Groq 429 is short-term rate limiting and falls through to the retry path.
                        if (model === 'gemini' && (e.quotaExhausted || e.status === 429)) {
                            return { outcome: 'quota', reason: 'quota exhausted' };
                        }

                        const canRetry = e.retriable && attempt < BATCH_RETRY_DELAYS.length && !batchStopRef.current;
                        if (canRetry) {
                            const wait = BATCH_RETRY_DELAYS[attempt];
                            retries++;
                            const why = e.timedOut ? 'timed out' : `HTTP ${e.status}`;
                            console.warn(`${tag} ⏳ ${why} — retry ${retries}/${BATCH_RETRY_DELAYS.length} in ${wait / 1000}s`);
                            setBatchProgress(p => p ? { ...p, status: `${why}, retrying in ${wait / 1000}s (${retries}/${BATCH_RETRY_DELAYS.length})` } : p);
                            await new Promise(r => setTimeout(r, wait));
                            setBatchProgress(p => p ? { ...p, status: '' } : p);
                            continue;
                        }

                        console.error(`${tag} ✗ API call failed after ${retries} retr${retries === 1 ? 'y' : 'ies'}:`, e.message, e);
                        // Google capacity problems are reported separately from genuine errors
                        if (e.retriable) {
                            return {
                                outcome: 'unavailable', retries,
                                reason: `temporarily unavailable (retried ${retries}×)`,
                                detail: e.timedOut ? 'request timed out' : `HTTP ${e.status}`
                            };
                        }
                        return { outcome: 'failed', reason: 'API error', detail: e.message };
                    }
                }

                // ── 2. Parse ───────────────────────────────────────────────────────────────────
                let result;
                try {
                    result = parseLooseJson(raw);
                    console.log(`${tag} parsed result:`, result);
                } catch (e) {
                    console.error(`${tag} ✗ could not parse response as JSON:`, e.message, '| raw was:', raw);
                    return { outcome: 'failed', reason: 'unparseable response', detail: e.message };
                }

                // ── 3. Context guard — drops ONLY the context, never the whole record ──────────
                let contextRejected = false;
                if (result.context && !containsVocabularyWord(result.context, record.vocabulary)) {
                    contextRejected = true;
                    console.warn(`${tag} ⚠ context did not contain the word, dropping context only:`, result.context);
                    result.context = '';
                }

                // ── 4. Field selection — never overwrite existing content ──────────────────────
                // 🆕 V14.84: strip prose out of the synonyms list before it reaches the database
                if (result.synonyms) {
                    result.synonyms = cleanSynonymsField(result.synonyms, record.vocabulary, tag);
                }

                const update = {};
                if (missing.synonyms && result.synonyms) update.synonyms = String(result.synonyms).trim();
                if (missing.context && result.context) update.context = String(result.context).trim();
                if (missing.family && result.family) update.family = String(result.family).trim();
                console.log(`${tag} fields selected for writing:`, Object.keys(update).join(', ') || '(none)');

                if (Object.keys(update).length === 0) {
                    // Distinguish "the AI never returned it" from "we rejected what it returned"
                    const absent = Object.keys(missing).filter(k => missing[k] && !result[k] && !(k === 'context' && contextRejected));
                    const parts = [];
                    if (contextRejected) parts.push("context rejected (didn't use the word)");
                    if (absent.length) parts.push(`AI returned nothing for: ${absent.join(', ')}`);
                    const reason = parts.join('; ') || 'AI returned nothing usable';
                    console.error(`${tag} ✗ nothing writable. ${reason}. Parsed keys:`, Object.keys(result || {}));
                    return { outcome: 'failed', reason, detail: `parsed keys: ${Object.keys(result || {}).join(', ') || 'none'}` };
                }

                update.modified_at = new Date().toISOString();
                update.ai_source = model; // 🆕 V14.81: provenance — which model actually wrote this
                update.previous_version = JSON.stringify({
                    vocabulary: record.vocabulary, synonyms: record.synonyms,
                    context: record.context, family: record.family, favourite: record.favourite
                });

                // ── 5. Supabase write ──────────────────────────────────────────────────────────
                try {
                    const { data, error } = await supabase.from('vocabulary_v4')
                        .update(update).eq('id', record.id).select('id');

                    if (error) {
                        console.error(`${tag} ✗ Supabase rejected the update:`, error, '| payload:', update);
                        return { outcome: 'failed', reason: `database: ${error.message || 'update rejected'}`, detail: error.code || '' };
                    }
                    if (!data || data.length === 0) {
                        console.error(`${tag} ✗ Supabase matched no row for id`, record.id, '— check RLS/permissions');
                        return { outcome: 'failed', reason: 'database: no row updated (RLS or id mismatch)', detail: `id ${record.id}` };
                    }

                    console.log(`${tag} ✓ written:`, Object.keys(update).filter(k => k !== 'modified_at' && k !== 'previous_version').join(', '));
                    setWords(prev => prev.map(w => w.id === record.id ? { ...w, ...update } : w));
                    return {
                        outcome: 'filled',
                        reason: contextRejected ? 'filled, but context was rejected' : 'filled'
                    };
                } catch (e) {
                    console.error(`${tag} ✗ Supabase threw:`, e);
                    return { outcome: 'failed', reason: `database: ${e.message}`, detail: '' };
                }
            }

            // 🆕 V14.80: retryRecords lets the summary re-run just the ones that did not succeed
            // 🆕 V14.81: model chosen by the user; overwrite is the Groq→Gemini upgrade path
            async function runBatchFill(retryRecords = null, model = 'gemini', overwrite = false) {
                if (batchRunning) return;

                if (model === 'gemini') {
                    if (!geminiApiKey.trim()) {
                        alert('⚠️ Gemini batch fill needs a Gemini API key.\n\nSet it in Settings, or choose Groq instead.');
                        setShowSettings(true);
                        return;
                    }
                    if (readGeminiQuota().exhausted) {
                        alert("⚠️ Gemini's daily quota is exhausted.\n\nChoose Groq, or wait for the reset at midnight US Pacific.");
                        return;
                    }
                } else if (!groqApiKey.trim()) {
                    alert('⚠️ Groq batch fill needs a Groq API key.\n\nSet it in Settings, or choose Gemini instead.');
                    setShowSettings(true);
                    return;
                }

                const queue = Array.isArray(retryRecords) && retryRecords.length
                    ? retryRecords.slice(0, BATCH_SIZE)
                    // on the upgrade path every loaded record is a candidate, blanks or not
                    : (overwrite ? words : words.filter(isRecordPending)).slice(0, BATCH_SIZE);
                if (queue.length === 0) {
                    alert('✅ Nothing pending in the current filter.\n\nEvery loaded record already has synonyms, context and family.');
                    return;
                }

                batchStopRef.current = false;
                setBatchRunning(true);
                setBatchSummary(null);
                setBatchProgress({ current: 0, total: queue.length, word: '', filled: 0, failed: 0, skipped: 0, unavailable: 0, status: '', model });

                let filled = 0, failed = 0, skipped = 0, unavailable = 0, stoppedBy = null;
                const failures = []; // 🆕 V14.79: per-record reasons, surfaced in the summary

                for (let i = 0; i < queue.length; i++) {
                    if (batchStopRef.current) { stoppedBy = 'user'; break; }

                    const record = queue[i];
                    setBatchProgress({ current: i + 1, total: queue.length, word: record.vocabulary, filled, failed, skipped });

                    const { outcome, reason, detail } = await batchFillRecord(record, model, overwrite);
                    if (outcome === 'filled') filled++;
                    else if (outcome === 'skipped') skipped++;
                    else if (outcome === 'quota') { stoppedBy = 'quota'; break; }
                    else {
                        // 🆕 V14.80: Google capacity problems counted apart from genuine errors
                        if (outcome === 'unavailable') unavailable++; else failed++;
                        failures.push({
                            word: record.vocabulary, reason: reason || 'unknown',
                            detail: detail || '', kind: outcome, record
                        });
                    }

                    setBatchProgress({ current: i + 1, total: queue.length, word: record.vocabulary, filled, failed, skipped, unavailable, status: '', model });

                    // Throttle between records — a full batch takes 2-3 minutes by design
                    if (i < queue.length - 1 && !batchStopRef.current) {
                        await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
                    }
                }

                setBatchRunning(false);
                setBatchProgress(null);
                if (failures.length) console.table(failures);
                setBatchSummary({ filled, failed, skipped, unavailable, stoppedBy, model, overwrite, attempted: filled + failed + skipped + unavailable, failures });
                await refreshPendingTotal();
            }

            // 🆕 V14.78: single definition of the Magic Fill prompt, shared by the ✨ button and the
            // batch filler so both produce identical results.
            const MAGIC_FILL_SYSTEM = 'You are an expert British English lexicographer. Synonyms must be EXACT: truly interchangeable, drop-in replacements sharing the same core meaning. Never include near-synonyms, loosely related words, or words with overlapping but different meanings.';

            // 🆕 V14.84: appended at build time rather than only added to the default template,
            // because the prompt is user-editable and already persisted in localStorage — editing
            // the default alone would not reach an existing installation.
            function synonymsRule(word) {
                return `

━━━ SYNONYMS FIELD — STRICT FORMAT ━━━
The "synonyms" value MUST be ONLY a comma-separated list of terms.
✗ NO explanation, commentary, or notes of any kind
✗ NO sentences — never write things like "X is often used as a verb, so..."
✗ NO colons, and never mention "${word}" itself inside the synonyms value
✓ Just the terms: "term one, term two, term three"
If you cannot produce clean synonyms, return an empty string for synonyms rather than prose.`;
            }

            function buildMagicFillPrompt(word, currentFamily) {
                // 🆕 V11.38: Enhance prompt with current family if available
                const base = magicFillPrompt.replace(/{word}/g, word) + synonymsRule(word);
                if (!currentFamily) return base;

                return `CRITICAL INSTRUCTION: The word "${word}" is a ${currentFamily}.

${base}

MANDATORY RULES FOR "${word}" (${currentFamily}):
- Synonyms MUST be EXACT synonyms: truly interchangeable drop-in replacements for "${word}" in ANY sentence
- Each synonym must share the SAME core meaning AND same grammatical family (${currentFamily})
- TEST: Could you swap "${word}" for the synonym in any sentence without changing the meaning? If not, do NOT include it
- DO NOT include near-synonyms, loosely related words, or words with merely overlapping meaning
- If ${currentFamily} = "Noun": Synonyms MUST be nouns. Context MUST use "${word}" as a noun.
- If ${currentFamily} = "Verb": Synonyms MUST be verbs. Context MUST use "${word}" as a verb (conjugate if needed: ${word}, ${word}s, ${word}ed, ${word}ing).
- If ${currentFamily} = "Adjective": Synonyms MUST be adjectives. Context MUST use "${word}" as an adjective describing a noun.
- If ${currentFamily} = "Adverb": Synonyms MUST be adverbs. Context MUST use "${word}" as an adverb modifying a verb/adjective.
- If ${currentFamily} = "Phrasal Verb": Synonyms MUST be phrasal verbs. Context MUST use "${word}" as a phrasal verb.
- If ${currentFamily} = "Idiom": Synonyms MUST be idioms/expressions. Context MUST use "${word}" as an idiomatic expression.
- If ${currentFamily} = "Preposition": Synonyms MUST be prepositions. Context MUST use "${word}" as a preposition.
- Context sentence MUST help understand the meaning of "${word}" — a reader should be able to infer what it means from context.

RESPOND WITH family: "${currentFamily}" (DO NOT change this)`;
            }

            const handleMagicFill = async (word, targetFields = null, wordId = null) => {
                if (!word) return;

                // 🆕 V14.68: first line of the flow — confirms the key reached React state AND is in localStorage
                console.log('[Magic Fill] Gemini key found:', !!geminiApiKey, '| in localStorage:', !!(localStorage.getItem('gemini_api_key') || '').trim(), '| Groq key found:', !!groqApiKey);

                const apiKey = groqApiKey.trim();
                const geminiKey = geminiApiKey.trim(); // 🆕 V14.67

                if (!apiKey && !geminiKey) {
                    alert('⚠️ Please set your Gemini or Groq API Key in Settings first!\n\nGet a FREE Groq key at: https://console.groq.com\nGet a FREE Gemini key at: https://aistudio.google.com/apikey');
                    setShowSettings(true);
                    return;
                }

                setMagicFillModel(null); // 🆕 V14.67

                // 🆕 V11.38: Get current word data to check family BEFORE AI request
                let currentData = null;
                if (wordId) {
                    const wordData = words.find(w => w.id === wordId);
                    currentData = wordData || null;
                } else {
                    currentData = words.find(w => w.vocabulary === word) || null;
                }
                
                // 🆕 V11.38: Get family - from DB if exists, from modal dropdown if creating new word
                let currentFamily = currentData?.family || '';
                if (!currentFamily && targetFields?.family) {
                    // 🆕 V11.38: Read from modal dropdown - targetFields.family is a DOM select element
                    currentFamily = targetFields.family.value || '';
                }

                setMagicLoading(true);

                try {
                    // 🆕 V14.78: shared with batch fill so both use the identical prompt
                    const prompt = buildMagicFillPrompt(word, currentFamily);

                    const systemContent = MAGIC_FILL_SYSTEM;

                    let textResponse = null;
                    let modelUsed = null;
                    let geminiError = null;

                    // 🆕 V14.67: Gemini first when a key is configured
                    // 🆕 V14.73: ...and only while the daily quota holds
                    if (geminiReady()) {
                        try {
                            textResponse = await callGemini(geminiKey, systemContent, prompt, 'Magic Fill', { maxOutputTokens: 1500 }); // 🆕 V14.88
                            modelUsed = 'Gemini';
                            console.log('%c[Magic Fill] ✨ Model used: GEMINI (no fallback needed)', 'color:#60a5fa;font-weight:bold');
                        } catch (e) {
                            geminiError = e;
                            textResponse = null;
                            console.warn(
                                apiKey
                                    ? `%c[Magic Fill] ↩️ Falling back to GROQ — reason: ${e.message}`
                                    : `%c[Magic Fill] ⛔ Gemini failed and no Groq key is set, cannot fall back — reason: ${e.message}`,
                                'color:#fb923c;font-weight:bold'
                            );
                        }
                    } else if (geminiKey) {
                        console.log('[Magic Fill] ⏭️ Gemini skipped (daily quota exhausted) — using Groq');
                    } else {
                        console.log('[Magic Fill] ℹ️ No Gemini key configured — using Groq directly');
                    }

                    // 🆕 V14.67: Groq fallback (unchanged behaviour)
                    if (textResponse === null) {
                        if (!apiKey) {
                            throw new Error(`Gemini failed and no Groq API key is configured for fallback.\n\n${geminiError ? geminiError.message : ''}`);
                        }

                        const response = await fetch(
                            'https://api.groq.com/openai/v1/chat/completions',
                            {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${apiKey}`
                                },
                                body: JSON.stringify({
                                    model: GROQ_MODEL_LARGE,
                                    messages: [
                                        {
                                            role: 'system',
                                            content: systemContent
                                        },
                                        {
                                            role: 'user',
                                            content: prompt
                                        }
                                    ],
                                    temperature: 0.2,
                                    max_tokens: 1500, reasoning_effort: GROQ_REASONING_EFFORT
                                })
                            }
                        );

                        if (!response.ok) {
                            const errorData = await response.json();
                            console.error('Groq API Error:', errorData);
                            throw new Error(errorData.error?.message || `API Error ${response.status}`);
                        }

                        const data = await response.json();

                        if (!data.choices || !data.choices[0]) {
                            throw new Error('No response from AI');
                        }

                        textResponse = groqContent('magic-fill', data);
                        bumpAiDaily('groq'); // 🆕 V14.82
                        modelUsed = 'Groq';
                        console.log(
                            `%c[Magic Fill] ✨ Model used: GROQ${geminiError ? ' (fallback after Gemini failure)' : ''}`,
                            'color:#fb923c;font-weight:bold'
                        );
                    }

                    
                    // 🆕 V14.88: same hardened parser as everywhere else, instead of a private copy
                    let result;
                    try {
                        result = parseLooseJson(textResponse);
                    } catch (e) {
                        console.error('[Magic Fill] ✗ could not parse the response for', word,
                            '| model:', modelUsed, '| raw response:', textResponse);
                        throw new Error(`AI returned invalid JSON.\n\n${e.message}`);
                    }
                    

                    // 🆕 V11.30: Validate that context uses EXACT word - improved for multi-word phrases
                    if (result.context) {
                        const contextLower = result.context.toLowerCase();
                        const wordLower = word.toLowerCase();
                        
                        // Split phrase into words to check each separately
                        const vocabWords = wordLower.split(/\s+/);
                        const stopWords = ['a', 'an', 'the', 'in', 'on', 'at', 'to', 'of', 'for', 'with', 'by'];
                        const optionalWords = ['my', 'your', 'his', 'her', 'its', 'their', 'our', 'this', 'that', 'it'];
                        
                        // Identify key words (content words that MUST appear)
                        const keyWords = vocabWords.filter(w => !stopWords.includes(w) && !optionalWords.includes(w) && w.length > 2);
                        
                        // Check each key word appears (with conjugations)
                        for (const keyWord of keyWords) {
                            // Generate possible conjugations
                            const conjugations = [
                                keyWord,
                                keyWord + 's',
                                keyWord + 'es',
                                keyWord + 'ed',
                                keyWord + 'd',
                                keyWord + 'ing',
                                keyWord.replace(/e$/, '') + 'ing',
                                keyWord.replace(/y$/, 'ies'),
                                keyWord.replace(/y$/, 'ied')
                            ];
                            
                            // Check if ANY conjugation appears in context
                            const found = conjugations.some(conj => contextLower.includes(conj));
                            
                            if (!found) {
                                throw new Error(`❌ AI didn't use "${word}" - missing word: "${keyWord}"\n\nGenerated: "${result.context}"\n\nPlease try again. Context MUST use "${word}" exactly.`);
                            }
                        }
                        
                        // If phrase has no key words (all stop/optional words), check whole phrase
                        if (keyWords.length === 0 && !contextLower.includes(wordLower)) {
                            throw new Error(`❌ AI used a synonym instead of "${word}"\n\nGenerated: "${result.context}"\n\nPlease try again. Context MUST use "${word}" exactly.`);
                        }
                    }

                    // currentData already obtained at the beginning of function (V11.38)

                    // 🆕 V14.84: same synonyms hardening as the batch path, for both models
                    if (result.synonyms) {
                        result.synonyms = cleanSynonymsField(result.synonyms, word, '[Magic Fill]');
                    }

                    // 🆕 V14.67: Show which model produced this fill
                    setMagicFillModel(modelUsed);

                    // 🆕 V13.0: Fetch usage info separately (reliable, independent call)
                    fetchUsageInfo(word);

                    if (targetFields) {
                        // 🆕 V11.8: Only fill empty fields in modal
                        if (result.synonyms && !targetFields.synonyms.value) targetFields.synonyms.value = result.synonyms;
                        if (result.context && !targetFields.context.value) targetFields.context.value = result.context;
                        if (result.family && !targetFields.family.value) targetFields.family.value = result.family;
                        
                    } else if (wordId || currentData) {
                        // 🆕 V11.8: Respect existing data - only update empty fields
                        const updateData = {
                            synonyms: currentData?.synonyms || result.synonyms,
                            context: currentData?.context || result.context,
                            family: currentData?.family || result.family
                        };
                        
                        const targetId = wordId || currentData.id;
                        
                        // 🆕 V11.22: Save previous version for change history
                        const updateDataWithHistory = {
                            ...updateData,
                            ai_source: (modelUsed || '').toLowerCase() || null, // 🆕 V14.81
                            previous_version: JSON.stringify({
                                vocabulary: currentData?.vocabulary,
                                synonyms: currentData?.synonyms,
                                context: currentData?.context,
                                family: currentData?.family,
                                favourite: currentData?.favourite
                            }),
                            modified_at: new Date().toISOString()
                        };
                        
                        await supabase.from('vocabulary_v4').update(updateDataWithHistory).eq('id', targetId);
                        
                        // 🆕 V11.20: Update all active contexts without refreshing
                        const updatedWord = { ...(currentData || words.find(w => w.id === targetId)), ...updateData };
                        
                        if (showFlashcards) {
                            const newFlashcards = [...flashcardWords];
                            newFlashcards[flashcardIndex] = updatedWord;
                            setFlashcardWords(newFlashcards);
                        }
                        if (showDictation) {
                            const newDictation = [...dictationWords];
                            newDictation[dictationIndex] = updatedWord;
                            setDictationWords(newDictation);
                        }
                        if (showSelection) {
                            const newSelection = [...selectionWords];
                            newSelection[selectionIndex] = updatedWord;
                            setSelectionWords(newSelection);
                        }
                        if (showGuesswork) {
                            const newGuesswork = [...guessworkWords];
                            newGuesswork[guessworkIndex] = updatedWord;
                            setGuessworkWords(newGuesswork);
                        }
                        
                        // Update main table if not in exercise
                        if (!showFlashcards && !showDictation && !showSelection && !showGuesswork) {
                            setWords(prevWords => 
                                prevWords.map(w => w.id === targetId ? updatedWord : w)
                            );
                        }
                        
                        
                    }

                } catch (error) {
                    console.error('Magic Fill Error:', error);
                    
                    let errorMessage = '❌ Magic Fill failed:\n\n';
                    
                    if (error.message.includes('401') || error.message.includes('invalid')) {
                        errorMessage += 'Invalid API Key. Please check your key in Settings.\n\nGet a FREE key at: https://console.groq.com';
                    } else if (error.message.includes('429')) {
                        errorMessage += 'Rate limit exceeded. Please wait a moment and try again.';
                    } else {
                        errorMessage += error.message;
                    }
                    
                    alert(errorMessage);
                } finally {
                    setMagicLoading(false);
                }
            };

            const handleImproveWord = async (word, wordId) => {
                if (!word) return;

                // 🆕 V14.68: first line of the flow — confirms the key reached React state AND is in localStorage
                console.log('[AI Improve] Gemini key found:', !!geminiApiKey, '| in localStorage:', !!(localStorage.getItem('gemini_api_key') || '').trim(), '| Groq key found:', !!groqApiKey);

                const apiKey = groqApiKey.trim();
                const geminiKey = geminiApiKey.trim(); // 🆕 V14.68

                if (!apiKey && !geminiKey) {
                    alert('⚠️ Please set your Gemini or Groq API Key in Settings first!\n\nGet a FREE Groq key at: https://console.groq.com\nGet a FREE Gemini key at: https://aistudio.google.com/apikey');
                    setShowSettings(true);
                    return;
                }

                // 🆕 V11.38: Get current word data to check family BEFORE AI request
                const currentWord = words.find(w => w.id === wordId) ||
                                   flashcardWords.find(w => w.id === wordId) ||
                                   dictationWords.find(w => w.id === wordId) ||
                                   selectionWords.find(w => w.id === wordId) ||
                                   guessworkWords.find(w => w.id === wordId);
                
                if (!currentWord) {
                    alert('❌ Word not found');
                    return;
                }
                
                const currentFamily = currentWord.family || '';

                setMagicLoading(true);

                try {
                    // 🆕 V14.71: sense anchoring inputs. Without the current synonyms the model only sees
                    // the word plus one sentence, and the "be COMPLETELY DIFFERENT" pressure further down
                    // can tip a polysemous word into the wrong sense entirely (peck = kiss vs peck = jab).
                    const currentSynonyms = (currentWord?.synonyms || '').trim();
                    const currentContext = (currentWord?.context || '').trim();

                    // 🆕 V11.38: Enhanced prompt with strict family enforcement
                    const familyExamples = {
                        'Noun': 'If word is a noun like "house", give noun synonyms like "home, dwelling, residence"',
                        'Verb': 'If word is a verb like "run", give verb synonyms like "sprint, dash, race"',
                        'Adjective': 'If word is an adjective like "happy", give adjective synonyms like "joyful, cheerful, glad"',
                        'Phrasal Verb': 'If word is a phrasal verb like "give up", give phrasal verb synonyms like "quit, abandon, surrender"',
                        'Idiom': 'If word is an idiom, give idiomatic expression synonyms with similar meaning',
                        'Preposition': 'If word is a preposition like "throughout", give preposition synonyms like "across, during, all through"'
                    };
                    
                    const contextExamples = {
                        'Noun': `Use "${word}" as a NOUN (thing/person/concept)`,
                        'Verb': `Use "${word}" as a VERB (action word, can conjugate: ${word}, ${word}s, ${word}ed, ${word}ing)`,
                        'Adjective': `Use "${word}" as an ADJECTIVE (describing a noun)`,
                        'Adverb': `Use "${word}" as an ADVERB (modifying verb/adjective)`,
                        'Phrasal Verb': `Use "${word}" as a PHRASAL VERB (verb + preposition)`,
                        'Idiom': `Use "${word}" as an IDIOM (fixed expression)`,
                        'Preposition': `Use "${word}" as a PREPOSITION (showing relationship between words)`
                    };
                    
                    const prompt = `CRITICAL INSTRUCTION: The word "${word}" is a ${currentFamily}.

IMPORTANT — SENSE ANCHORING:
The user is learning THIS specific sense of the word:
- Current synonyms: ${currentSynonyms || '(none recorded)'}
- Current context: "${currentContext || '(none recorded)'}"

Your improved synonyms and context MUST refer to the SAME sense and meaning as above.
Do NOT switch to a different meaning of "${word}", even if that other meaning is more common or more frequent.
If "${word}" has several meanings, IGNORE every meaning except the one shown above.
The new context sentence must be different from the current one in WORDING and SCENARIO, but must illustrate the SAME meaning.

For the English word/expression "${word}", provide ALTERNATIVE/IMPROVED suggestions:

1. SYNONYMS: 2-4 EXACT British English synonyms (comma-separated)
   - MANDATORY: All synonyms MUST match the ANCHORED SENSE above — the same meaning as the current synonyms
   - MANDATORY: All synonyms MUST be ${currentFamily}s (same grammatical family as "${word}")
   - MANDATORY: Synonyms must be truly INTERCHANGEABLE drop-in replacements for "${word}" in ANY sentence
   - TEST: Could you swap "${word}" for the synonym in the CURRENT CONTEXT SENTENCE above without changing its meaning? If not, do NOT include it
   - DO NOT include near-synonyms, loosely related words, or words with merely overlapping meaning
   - DO NOT include synonyms that belong to a different sense of "${word}"
   - Example: ${familyExamples[currentFamily] || 'Provide synonyms of the same type'}

2. CONTEXT: A NEW sentence (12-15 words) in British English, using the SAME meaning anchored above
   ⛔️ CRITICAL: Your sentence must use a different subject, situation and structure from the current context sentence
   ⛔️ CRITICAL: "Different" applies to the WORDING and the SCENARIO only — the MEANING of "${word}" must stay exactly the same
   ⛔️ DO NOT paraphrase or lightly reword the current sentence — invent a new scenario for that SAME meaning
   ⛔️ You MUST use "${word}" as a ${currentFamily} in your sentence
   ⛔️ DO NOT use synonyms instead of "${word}"
   ✅ REQUIRED: ${contextExamples[currentFamily] || ('Use "' + word + '" correctly')}
   ✅ The sentence should clearly illustrate the anchored meaning of "${word}" in a new situation

3. FAMILY: RESPOND WITH "${currentFamily}" - DO NOT CHANGE THIS VALUE

FINAL MANDATORY RULES:
- Sense = IDENTICAL to the anchored sense above (never a different meaning of "${word}")
- Synonyms = EXACT ${currentFamily} synonyms only (interchangeable, same meaning, same sense)
- Context = NEW sentence, different scenario from the current one, SAME meaning, uses "${word}" as a ${currentFamily}
- Family field in JSON = "${currentFamily}" (DO NOT modify)

Respond ONLY in this exact JSON format (no markdown, no backticks):
{
  "synonyms": "synonym1, synonym2, synonym3",
  "context": "Example sentence with exact word ${word} here.",
  "family": "${currentFamily}"
}`;


                    const systemContent = 'You are an expert British English lexicographer. Synonyms must be EXACT: truly interchangeable, drop-in replacements sharing the same core meaning. Never include near-synonyms, loosely related words, or words with overlapping but different meanings.';

                    let rawResponse = null;
                    let modelUsed = null;
                    let geminiError = null;

                    // 🆕 V14.68: Gemini first when a key is configured
                    // 🆕 V14.73: ...and only while the daily quota holds
                    if (geminiReady()) {
                        try {
                            // 🆕 V14.88: the Improve prompt is long (sense anchoring, mandatory rules,
                            // worked example), so its answer needs more room than Magic Fill's default.
                            rawResponse = await callGemini(geminiKey, systemContent, prompt, 'AI Improve', { maxOutputTokens: 2500 });
                            modelUsed = 'Gemini';
                            console.log('%c[AI Improve] ✨ Model used: GEMINI (no fallback needed)', 'color:#4ade80;font-weight:bold');
                        } catch (e) {
                            geminiError = e;
                            rawResponse = null;
                            console.warn(
                                apiKey
                                    ? `%c[AI Improve] ↩️ Falling back to GROQ — reason: ${e.message}`
                                    : `%c[AI Improve] ⛔ Gemini failed and no Groq key is set, cannot fall back — reason: ${e.message}`,
                                'color:#fb923c;font-weight:bold'
                            );
                        }
                    } else if (geminiKey) {
                        console.log('[AI Improve] ⏭️ Gemini skipped (daily quota exhausted) — using Groq');
                    } else {
                        console.log('[AI Improve] ℹ️ No Gemini key configured — using Groq directly');
                    }

                    // 🆕 V14.68: Groq fallback (unchanged behaviour)
                    if (rawResponse === null) {
                        if (!apiKey) {
                            throw new Error(`Gemini failed and no Groq API key is configured for fallback.\n\n${geminiError ? geminiError.message : ''}`);
                        }

                        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${apiKey}`
                            },
                            body: JSON.stringify({
                                model: GROQ_MODEL_LARGE,
                                messages: [
                                    { role: 'system', content: systemContent },
                                    { role: 'user', content: prompt }
                                ],
                                temperature: 0.2,
                                max_tokens: 1500, reasoning_effort: GROQ_REASONING_EFFORT
                            })
                        });

                        if (!response.ok) {
                            const errorData = await response.json();
                            throw new Error(errorData.error?.message || `API Error ${response.status}`);
                        }

                        const data = await response.json();
                        if (!data.choices || !data.choices[0]) {
                            throw new Error('No response from AI');
                        }

                        rawResponse = groqContent('ai-improve', data);
                        bumpAiDaily('groq'); // 🆕 V14.82
                        modelUsed = 'Groq';
                        console.log(
                            `%c[AI Improve] ✨ Model used: GROQ${geminiError ? ' (fallback after Gemini failure)' : ''}`,
                            'color:#fb923c;font-weight:bold'
                        );
                    }

                    // 🆕 V14.88: was its own brace scan, and on a truncated response endIndex stayed
                    // -1, so substring(first, -1) returned "" and JSON.parse("") threw the opaque
                    // "Unexpected end of JSON input". parseLooseJson reports truncation and logs the raw text.
                    let result;
                    try {
                        result = parseLooseJson(rawResponse);
                    } catch (e) {
                        console.error('[AI Improve] ✗ could not parse the response for', word,
                            '| model:', modelUsed, '| raw response:', rawResponse);
                        throw e;
                    }

                    // 🆕 V11.30: Validate that context uses EXACT word - improved for multi-word phrases
                    if (result.context) {
                        const contextLower = result.context.toLowerCase();
                        const wordLower = word.toLowerCase();
                        
                        // Split phrase into words to check each separately
                        const vocabWords = wordLower.split(/\s+/);
                        const stopWords = ['a', 'an', 'the', 'in', 'on', 'at', 'to', 'of', 'for', 'with', 'by'];
                        const optionalWords = ['my', 'your', 'his', 'her', 'its', 'their', 'our', 'this', 'that', 'it'];
                        
                        // Identify key words (content words that MUST appear)
                        const keyWords = vocabWords.filter(w => !stopWords.includes(w) && !optionalWords.includes(w) && w.length > 2);
                        
                        // Check each key word appears (with conjugations)
                        for (const keyWord of keyWords) {
                            // Generate possible conjugations
                            const conjugations = [
                                keyWord,
                                keyWord + 's',
                                keyWord + 'es',
                                keyWord + 'ed',
                                keyWord + 'd',
                                keyWord + 'ing',
                                keyWord.replace(/e$/, '') + 'ing',
                                keyWord.replace(/y$/, 'ies'),
                                keyWord.replace(/y$/, 'ied')
                            ];
                            
                            // Check if ANY conjugation appears in context
                            const found = conjugations.some(conj => contextLower.includes(conj));
                            
                            if (!found) {
                                throw new Error(`❌ AI didn't use "${word}" - missing word: "${keyWord}"\n\nGenerated: "${result.context}"\n\nPlease try again. Context MUST use "${word}" exactly.`);
                            }
                        }
                        
                        // If phrase has no key words (all stop/optional words), check whole phrase
                        if (keyWords.length === 0 && !contextLower.includes(wordLower)) {
                            throw new Error(`❌ AI used a synonym instead of "${word}"\n\nGenerated: "${result.context}"\n\nPlease try again. Context MUST use "${word}" exactly.`);
                        }
                    }

                    // currentWord already defined above (used in prompt)
                    
                    const currentSyns = (currentWord.synonyms || '').split(',').map(s => s.trim()).filter(s => s);
                    // 🆕 V14.84: keep prose out of the suggestion chips too
                    const improvedSyns = sanitiseSynonyms(result.synonyms, word).kept;
                    
                    const currentCtx = currentWord.context ? [currentWord.context] : [];
                    const improvedCtx = result.context ? [result.context] : [];
                    
                    // 🆕 V14.67: tag the suggestions with the model that actually answered, carried on
                    // the data itself rather than shared state, so the chip can never show a stale model
                    // from an earlier Magic Fill run.
                    setImproveData({
                        wordId,
                        vocabulary: word,
                        model: modelUsed,
                        current: {
                            synonyms: currentWord.synonyms,
                            context: currentWord.context,
                            family: currentWord.family
                        },
                        improved: {
                            synonyms: result.synonyms,
                            context: result.context,
                            family: result.family
                        },
                        selections: {
                            family: 'improved',
                            currentSynonyms: currentSyns,
                            improvedSynonyms: improvedSyns,
                            currentContext: [],
                            improvedContext: improvedCtx
                        }
                    });
                    setUsageInfo(null); setShowImproveModal(true); fetchUsageInfo(word);

                } catch (error) {
                    console.error('Improve Error:', error);
                    alert(`❌ Improve failed: ${error.message}`);
                } finally {
                    setMagicLoading(false);
                }
            };

            // 🆕 V11.93: Unified search with independent AI toggle
            // 🆕 V13.6: Find & Merge — AI synonyms + DB search + AI post-filter
            const handleFindSimilar = async (currentWord) => {
                if (!groqApiKey.trim()) { alert('Please set your Groq API Key in Settings first.'); return; }
                setFindingSimilar(currentWord.id);
                try {
                    const term = currentWord.vocabulary.trim().toLowerCase();
                    const seen = new Set();
                    let candidates = [];
                    
                    const addResults = (data) => {
                        (data || []).forEach(w => { if (!seen.has(w.id)) { seen.add(w.id); candidates.push(w); } });
                    };
                    
                    // Step 1: AI generates synonyms + grammatical forms → search vocabulary
                    const forms = await getAIRelatedWords(term);
                    if (forms.length > 0) {
                        const orClauses = forms.map(f => `vocabulary.ilike.%${f}%`).join(',');
                        const { data } = await supabase.from('vocabulary_v4').select('*')
                            .or(orClauses).neq('id', currentWord.id).is('deleted_at', null).limit(25);
                        addResults(data);
                    }
                    
                    // Step 2: Search the term in synonyms column of other records
                    {
                        const { data } = await supabase.from('vocabulary_v4').select('*')
                            .ilike('synonyms', `%${term}%`).neq('id', currentWord.id).is('deleted_at', null).limit(10);
                        addResults(data);
                    }
                    
                    // Step 3: Current word's own synonyms → search as vocabulary in other records
                    if (currentWord.synonyms) {
                        const synTerms = currentWord.synonyms.split(',').map(s => s.trim().toLowerCase()).filter(s => s.length >= 3);
                        if (synTerms.length > 0) {
                            const synClauses = synTerms.map(s => `vocabulary.ilike.%${s}%`).join(',');
                            const { data } = await supabase.from('vocabulary_v4').select('*')
                                .or(synClauses).neq('id', currentWord.id).is('deleted_at', null).limit(10);
                            addResults(data);
                        }
                    }
                    
                    if (candidates.length === 0) {
                        alert('✅ No similar words found!');
                        return;
                    }
                    
                    // Step 4: AI POST-FILTER — ask AI which candidates are truly related
                    const candidateList = candidates.map(w => w.vocabulary).join(', ');
                    try {
                        const filterResp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqApiKey.trim()}` },
                            body: JSON.stringify({
                                model: GROQ_MODEL_LARGE,
                                messages: [{ 
                                    role: 'system', 
                                    content: 'You are a vocabulary deduplication assistant. Given a reference word and a list of candidates, return ONLY those that should be merged because they are: (a) exact synonyms, (b) near-synonyms with essentially the same meaning, (c) different grammatical forms of the same word (e.g. run/running/ran), or (d) variant expressions of the same concept (e.g. "fed up" / "fed up with"). Exclude words that merely share a word but have different meanings (e.g. "break down" vs "sit down"). Reply ONLY with a JSON array of the matching words, e.g. ["word1","word2"].'
                                }, {
                                    role: 'user',
                                    content: `Reference word: "${currentWord.vocabulary}"${currentWord.synonyms ? ' (synonyms: ' + currentWord.synonyms + ')' : ''}\n\nCandidate list: ${candidateList}\n\nWhich candidates are truly synonyms, near-synonyms, or grammatical variants of "${currentWord.vocabulary}"? Return ONLY the JSON array.`
                                }],
                                temperature: 0.0,
                                max_tokens: 1200, reasoning_effort: GROQ_REASONING_EFFORT
                            })
                        });
                        
                        if (filterResp.ok) {
                            const filterData = await filterResp.json();
                            const rawFilter = groqContent('find-similar', filterData);
                            {
                                const approved = parseLooseJson(rawFilter) // 🆕 V14.88: now handles arrays too
                                    .map(w => w.toLowerCase().trim());
                                candidates = candidates.filter(c => 
                                    approved.some(a => 
                                        c.vocabulary.toLowerCase().includes(a) || 
                                        a.includes(c.vocabulary.toLowerCase())
                                    )
                                );
                            }
                        }
                    } catch(filterErr) {
                        console.warn('AI filter failed, showing all candidates:', filterErr);
                    }
                    
                    if (candidates.length === 0) {
                        alert('✅ No similar words found after filtering!');
                        return;
                    }

                    setMergeData({
                        current: currentWord,
                        similar: candidates
                    });
                    setShowMergeModal(true);

                } catch (error) {
                    console.error('Find Similar Error:', error);
                    alert('❌ Error finding similar words');
                } finally {
                    setFindingSimilar(null);
                }
            };


            const handleMergeWords = async (selections, similarWord) => {
                try {
                    const { current } = mergeData;
                    
                    let mergedSynonyms;
                    if (selections.synonyms === 'merged' && selections.finalSynonyms) {
                        mergedSynonyms = selections.finalSynonyms;
                    } else {
                        mergedSynonyms = selections.synonyms === 'current' ? current.synonyms : similarWord.synonyms;
                    }
                    
                    const merged = {
                        vocabulary: current.vocabulary,
                        synonyms: mergedSynonyms,
                        context: selections.context === 'current' ? current.context : similarWord.context,
                        family: selections.family === 'current' ? current.family : similarWord.family,
                        favourite: current.favourite || similarWord.favourite
                    };
                    
                    await supabase.from('vocabulary_v4').update(merged).eq('id', current.id);
                    
                    // 🆕 V11.2: Soft delete instead of hard delete
                    await supabase.from('vocabulary_v4').update({ deleted_at: new Date().toISOString() }).eq('id', similarWord.id);
                    
                    alert('✅ Words merged successfully!');
                    setShowMergeModal(false);
                    setMergeData(null);
                    setSelectedSimilar(null);
                    setFieldSelections({ 
                        vocabulary: 'current', 
                        synonyms: 'current', 
                        context: 'current', 
                        level: 'current', 
                        family: 'current',
                        keepSynonyms: [],
                        deleteSynonyms: []
                    });
                    fetchWords(0, true);
                    
                } catch (error) {
                    console.error('Merge Error:', error);
                    alert('❌ Error merging words');
                }
            };


            async function handleSave(e) {
                e.preventDefault();
                const formData = new FormData(e.target);
                const wordData = Object.fromEntries(formData);

                wordData.favourite = parseInt(formData.get('favourite')) || 0;

                // 🆕 V14.81: content saved through the form is the user's own, so provenance clears.
                // The exception is a modal the user just Magic Filled — those fields ARE AI-written,
                // and magicFillModel records which model produced them.
                wordData.ai_source = magicFillModel ? magicFillModel.toLowerCase() : null;
                
                if (editingWord) {
                    
                    // 🆕 V11.21: Save previous version for change history
                    const updateDataWithHistory = {
                        ...wordData,
                        previous_version: JSON.stringify({
                            vocabulary: editingWord.vocabulary,
                            synonyms: editingWord.synonyms,
                            context: editingWord.context,
                            family: editingWord.family,
                            favourite: editingWord.favourite
                        }),
                        modified_at: new Date().toISOString()
                    };
                    
                    
                    await supabase.from('vocabulary_v4').update(updateDataWithHistory).eq('id', editingWord.id);
                    
                    // 🆕 V11.38: Properly preserve all fields when updating
                    const updatedWord = { 
                        ...editingWord,  // Keep all original fields (id, created_at, difficulty, etc.)
                        ...wordData,     // Override with new data from form
                        // Ensure critical fields are never overridden:
                        id: editingWord.id,
                        created_at: editingWord.created_at,
                        deleted_at: editingWord.deleted_at,
                        difficulty: editingWord.difficulty,
                        previous_version: updateDataWithHistory.previous_version,
                        modified_at: updateDataWithHistory.modified_at
                    };
                    
                    
                    // 🆕 V11.38: Update exercises if active (including Translation)
                    if (showFlashcards) {
                        const newFlashcards = [...flashcardWords];
                        newFlashcards[flashcardIndex] = updatedWord;
                        setFlashcardWords(newFlashcards);
                    }
                    if (showDictation) {
                        const newDictation = [...dictationWords];
                        newDictation[dictationIndex] = updatedWord;
                        setDictationWords(newDictation);
                    }
                    if (showSelection) {
                        const newSelection = [...selectionWords];
                        newSelection[selectionIndex] = updatedWord;
                        setSelectionWords(newSelection);
                    }
                    if (showGuesswork) {
                        const newGuesswork = [...guessworkWords];
                        newGuesswork[guessworkIndex] = updatedWord;
                        setGuessworkWords(newGuesswork);
                    }
                    if (showTranslation) {
                        const newTranslation = [...translationWords];
                        newTranslation[translationIndex] = updatedWord;
                        setTranslationWords(newTranslation);
                        // 🆕 V11.38: Regenerate Spanish translation with updated context
                        if (updatedWord.context) {
                            await generateSpanishTranslation(updatedWord.context);
                        }
                    }
                    if (showWriting) {
                        setWritingWords(prev => prev.map(w => w.id === editingWord.id ? updatedWord : w));
                    }
                    
                    // 🆕 V11.20: Update main table state without refreshing filters
                    if (!showFlashcards && !showDictation && !showSelection && !showGuesswork && !showTranslation && !showWriting) {
                        // Only update if editing from main table
                        setWords(prevWords => 
                            prevWords.map(w => w.id === editingWord.id ? updatedWord : w)
                        );
                    }
                } else {
                    // New word - need to refresh to show it
                    await supabase.from('vocabulary_v4').insert([wordData]);
                    fetchWords(0, true);
                }
                
                checkChangeHistoryCount(); // 🆕 V11.24
                setShowAddModal(false); 
                setEditingWord(null);
            }

            // 🆕 V11.13: Reusable Exercise Header Component
            const ExerciseHeader = ({ 
                title, 
                currentIndex, 
                totalCount, 
                currentWord,
                onClose, 
                onModeToggle, 
                onDictionary, 
                onInfo, 
                onEdit,
                onAudioToggle,
                onHint, // 🆕 V11.20
                exerciseMode,
                audioEnabled
            }) => (
                <div className="flex flex-col gap-3 mb-4 sticky top-0 bg-black/95 backdrop-blur-md z-10 pb-4">
                    {/* Title and Close - Always visible */}
                    <div className="flex justify-between items-start">
                        <div className="text-white">
                            <h2 className="text-2xl sm:text-3xl font-black main-gradient">{title}</h2>
                            <p className="text-slate-400 text-sm mt-1">
                                {currentIndex + 1} of {totalCount}
                            </p>
                        </div>
                        <button 
                            onClick={onClose}
                            className="text-slate-400 hover:text-white text-3xl flex-shrink-0"
                            title="Close"
                        >
                            ×
                        </button>
                    </div>
                    
                    {/* Controls - Compact for mobile */}
                    <div className="flex flex-wrap gap-2">
                        {onModeToggle && (
                            <button
                                onClick={onModeToggle}
                                className={`px-3 py-2 rounded-xl font-bold text-xs transition-colors flex-shrink-0 ${
                                    exerciseMode === 'memory' 
                                        ? 'bg-purple-600 text-white' 
                                        : 'bg-slate-700 text-slate-300'
                                }`}
                                title={exerciseMode === 'memory' ? 'Memory Mode' : 'Random Mode'}
                            >
                                {exerciseMode === 'memory' ? '🧠' : '🎲'}
                            </button>
                        )}
                        {onAudioToggle !== undefined && (
                            <button
                                onClick={onAudioToggle}
                                className={`px-3 py-2 rounded-xl font-bold text-xs transition-colors flex-shrink-0 ${
                                    audioEnabled 
                                        ? 'bg-green-600 text-white' 
                                        : 'bg-slate-700 text-slate-300'
                                }`}
                                title={audioEnabled ? 'Audio On' : 'Audio Off'}
                            >
                                {audioEnabled ? '🔊' : '🔇'}
                            </button>
                        )}
                        {onHint && (
                            <button
                                onClick={onHint}
                                className="px-3 py-2 rounded-xl font-bold text-xs bg-yellow-600 text-white hover:bg-yellow-500 flex-shrink-0"
                                title="Hint"
                            >
                                💡
                            </button>
                        )}
                        {onDictionary && currentWord && (
                            <button
                                onClick={() => onDictionary(currentWord)}
                                className="px-3 py-2 rounded-xl font-bold text-xs bg-blue-600 text-white hover:bg-blue-500 flex-shrink-0"
                                title="Dictionary"
                            >
                                📖
                            </button>
                        )}
                        {onInfo && (
                            <button
                                onClick={onInfo}
                                className="px-3 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-white flex-shrink-0"
                                title="Info"
                            >
                                ℹ️
                            </button>
                        )}
                        {onEdit && currentWord && (
                            <button
                                onClick={onEdit}
                                className="px-3 py-2 rounded-xl font-bold text-xs bg-indigo-600 text-white hover:bg-indigo-500 flex-shrink-0"
                                title="Edit"
                            >
                                ✏️
                            </button>
                        )}
                    </div>
                </div>
            );

            return (
                <div className="h-screen flex flex-col">
                    <header className="p-4 lg:p-6 bg-slate-900 border-b border-white/10 relative z-30">
                        {/* 🆕 V14.73: AI provider status. Absolutely positioned in the header's empty
                            top-right corner so it adds nothing to the flow — no existing element moves
                            or resizes. Click opens the explainer modal. */}
                        <button
                            type="button"
                            onClick={() => setShowGeminiInfo(true)}
                            title="Which AI is handling your features — click for details"
                            className={`absolute top-2 right-3 lg:top-3 lg:right-5 z-40 flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] lg:text-xs font-black whitespace-nowrap transition-colors ${
                                geminiQuota.exhausted
                                    ? 'bg-orange-500/15 text-orange-300 border-orange-400/50 hover:bg-orange-500/25'
                                    : 'bg-green-500/15 text-green-300 border-green-400/50 hover:bg-green-500/25'
                            }`}
                        >
                            {geminiQuota.exhausted ? '⚡ Groq' : '✨ Gemini'}
                        </button>

                        <div className="max-w-[1850px] mx-auto flex flex-col gap-4">
                            <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                                <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
                                    <h1 className="text-xl sm:text-2xl lg:text-3xl font-black italic main-gradient uppercase tracking-tighter text-center sm:text-left">
                                        English Booster <span className="version-text">v14.89</span>
                                    </h1>
                                    {/* 🆕 V11.60: Reorganized header - title and buttons in mobile */}
                                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 lg:gap-3 bg-slate-800/50 p-2 px-3 lg:px-4 sm:ml-4 lg:ml-8 rounded-2xl border border-white/5 shadow-lg w-full sm:w-auto">
                                        <span className="text-base lg:text-lg font-black text-indigo-400 tracking-wider">{totalCount}</span>
                                        
                                        <div className="border-l border-white/10 pl-2 lg:pl-3 ml-1 flex items-center gap-1.5 lg:gap-2">
                                            {/* Add button */}
                                            <button 
                                                onClick={() => {setEditingWord(null); setShowAddModal(true); setAddModalAIMode(false); setSpellCheckResult(null); setUsageInfo(null); setMagicFillModel(null); setDupCheck({ loading: false, morphLoading: false, exact: [], partial: [], morphForms: [], term: '' }); setTimeout(() => { const input = document.getElementById('modalVocabInput'); if (input && search.trim()) { input.value = search.trim(); searchDuplicates(search.trim()); } }, 50);}} 
                                                className="p-2 lg:p-2 rounded-lg border border-indigo-500/30 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 transition-colors"
                                                title="Add New Word"
                                            >
                                                <i className="fas fa-plus text-xl lg:text-base"></i>
                                            </button>
                                            
                                            {/* Recycle Bin */}
                                            <button 
                                                onClick={loadRecycleBin} 
                                                className={`p-2 lg:p-2 rounded-lg border transition-colors ${recycleBinCount > 0 ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'border-slate-700/30 text-slate-500 hover:text-red-400 hover:border-red-500/30'}`}
                                                title={`Recycle Bin${recycleBinCount > 0 ? ` (${recycleBinCount})` : ''}`}
                                            >
                                                <i className="fas fa-trash-restore text-xl lg:text-base"></i>
                                            </button>
                                            
                                            {/* Change History */}
                                            <button 
                                                onClick={loadChangeHistory} 
                                                className={`p-2 lg:p-2 rounded-lg border transition-colors ${changeHistoryCount > 0 ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' : 'border-slate-700/30 text-slate-500 hover:text-blue-400 hover:border-blue-500/30'}`}
                                                title={`Change History${changeHistoryCount > 0 ? ` (${changeHistoryCount})` : ''}`}
                                            >
                                                <i className="fas fa-history text-xl lg:text-base"></i>
                                            </button>

                                        </div>
                                        
                                        <div className="border-l border-white/10 pl-2 lg:pl-3 ml-1 flex items-center gap-1.5 lg:gap-2">
                                            {/* Talk to me */}
                                            <button
                                                onClick={() => talkToMeMethod === 'builtin' ? setShowVoiceModal(true) : setShowTalkToMeModal(true)}
                                                className="p-2 lg:px-3 lg:py-2 rounded-lg bg-teal-600/20 border border-teal-500/30 text-teal-400 hover:bg-teal-600/30 transition-colors flex items-center gap-1.5"
                                                title="Talk to me — practice vocabulary"
                                            >
                                                <i className="fas fa-comments text-xl lg:text-sm"></i>
                                                <span className="hidden lg:inline text-sm font-bold">Talk to me</span>
                                            </button>

                                            {/* 🆕 V11.62: Exercises button - icon only on mobile, text on desktop */}
                                            <button
                                                onClick={() => setShowExercisesModal(true)}
                                                className="p-2 lg:px-3 lg:py-2 rounded-lg bg-purple-600/20 border border-purple-500/30 text-purple-400 hover:bg-purple-600/30 transition-colors flex items-center gap-1.5"
                                                title="Practice Exercises"
                                            >
                                                <i className="fas fa-dumbbell text-xl lg:text-sm"></i>
                                                <span className="hidden lg:inline text-sm font-bold">Exercises</span>
                                            </button>
                                            
                                            {/* 🆕 V11.62: Stats button - icon only on mobile, text on desktop */}
                                            <button 
                                                onClick={() => loadStats()} 
                                                className="p-2 lg:px-3 lg:py-2 rounded-lg bg-blue-600/20 border border-blue-500/30 text-blue-400 hover:bg-blue-600/30 transition-colors flex items-center gap-1.5"
                                                title="Statistics"
                                            >
                                                <i className="fas fa-chart-bar text-xl lg:text-sm"></i>
                                                <span className="hidden lg:inline text-sm font-bold">Stats</span>
                                            </button>
                                            
                                            {/* Settings */}
                                            <button onClick={() => setShowSettings(true)} className="p-2 lg:p-2 text-slate-400 hover:text-white transition-colors" title="Settings">
                                                <i className="fas fa-cog text-xl lg:text-base"></i>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 lg:gap-3 justify-center lg:justify-start relative">
                                {/* Reset button */}
                                <button onClick={resetFilters} className="p-2 lg:p-3 bg-slate-800 rounded-xl text-slate-400 hover:text-white flex-shrink-0"><i className="fas fa-broom text-sm"></i></button>
                                

                                
                                {/* 🆕 V11.58: Search input FIRST */}
                                <input ref={searchInputRef} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="px-2 lg:px-4 py-2 lg:py-2.5 rounded-xl text-sm w-24 sm:w-40 lg:w-56 shadow-inner" />
                                
                                {/* 🆕 V11.58: Search mode toggle AFTER input */}
                                <button 
                                    onClick={() => setSearchMode((searchMode + 1) % 2)} 
                                    className={`p-2 lg:p-3 rounded-xl border transition-colors flex-shrink-0 ${
                                        searchMode === 0 ? 'border-slate-700 text-slate-500' :
                                        'bg-purple-500/20 border-purple-500 text-purple-400'
                                    } ${deepSearchLoading ? 'animate-pulse' : ''}`}
                                    title={
                                        searchMode === 0 
                                            ? '🔍 Standard Search: finds text matches in Vocabulary + Synonyms columns' 
                                            : '🧠 AI Search: generates exact synonyms & grammatical forms, then searches the Vocabulary column. Also works with Spanish words.'
                                    }
                                >
                                    <i className={`fas ${
                                        searchMode === 0 ? 'fa-search' :
                                        'fa-brain'
                                    } text-sm`}></i>
                                </button>
                                

                                
                                {/* 🆕 V11.58: Favourite filter AFTER search mode */}
                                <button 
                                    onClick={() => setFavouriteLevel((favouriteLevel + 1) % 4)} 
                                    className={`p-2 lg:p-3 rounded-xl border flex-shrink-0 ${
                                        favouriteLevel === 0 ? 'border-slate-700 text-slate-500' :
                                        favouriteLevel === 1 ? 'bg-yellow-500/20 border-yellow-500 text-yellow-500' :
                                        favouriteLevel === 2 ? 'bg-yellow-600/30 border-yellow-600 text-yellow-600' :
                                        'bg-yellow-700/40 border-yellow-700 text-yellow-700'
                                    }`}
                                    title={
                                        favouriteLevel === 0 ? 'Show all' :
                                        favouriteLevel === 1 ? 'Show level 1 favourites' :
                                        favouriteLevel === 2 ? 'Show level 2 favourites' :
                                        'Show both levels'
                                    }
                                >
                                    <i className={`fas ${
                                        favouriteLevel === 0 ? 'fa-star' :
                                        favouriteLevel === 1 ? 'fa-star-half-alt' :
                                        favouriteLevel === 2 ? 'fa-star' :
                                        'fa-star'
                                    } text-sm`}></i>
                                </button>
                                
                                {/* Other filters */}
                                <select value={emptyFilter} onChange={e => setEmptyFilter(e.target.value)} className="p-2 lg:p-2.5 rounded-xl text-xs font-bold uppercase bg-slate-800 text-red-400 flex-1 min-w-[85px] sm:flex-initial">
                                    <option value="None">Records</option>
                                    <option value="Synonyms">No Synonyms</option><option value="Context">No Context</option>
                                    <option value="Family">No Family</option>
                                    <option value="Difficulty">No Difficulty</option>
                                    {/* 🆕 V14.81: provenance — 'Filled with Groq' is the Gemini upgrade path */}
                                    <option value="GroqFilled">⚡ Filled with Groq</option>
                                    <option value="GeminiFilled">✨ Filled with Gemini</option>
                                    {/* 🆕 V14.84: not "filled manually" — this covers both records you
                                        edited yourself and everything that predates provenance tracking,
                                        and the two cannot be told apart. */}
                                    <option
                                        value="UnknownOrigin"
                                        title="Records that have content but no recorded model: either you wrote or edited them yourself, or they already existed before provenance tracking was added in V14.81. The two cannot be distinguished."
                                    >❓ Unknown origin</option>
                                </select>
                                {/* 🆕 V14.78: batch AI fill for the current filtered list
                                    🆕 V14.79: hidden entirely when nothing is pending, rather than shown disabled */}
                                {batchPendingTotal > 0 && (
                                    <div className="flex items-center gap-2 flex-1 sm:flex-initial">
                                        <button
                                            onClick={() => {
                                                // 🆕 V14.81: choose the model before spending any quota
                                                setBatchModelChoice(batchModelChoice
                                                    || (geminiApiKey.trim() ? 'gemini' : 'groq'));
                                                setShowBatchChooser(true);
                                            }}
                                            disabled={batchRunning}
                                            title={`Fill up to ${BATCH_SIZE} records with Gemini, about 6 seconds apart (2-3 minutes)`}
                                            className={`p-2 lg:p-2.5 rounded-xl text-xs font-bold uppercase whitespace-nowrap transition-colors ${
                                                batchRunning
                                                    ? 'bg-purple-600/40 text-purple-200 cursor-wait'
                                                    : 'bg-purple-600/20 text-purple-300 border border-purple-500/40 hover:bg-purple-600/30'
                                            }`}
                                        >
                                            {batchRunning
                                                ? '✨ Filling…'
                                                : `✨ Fill ${Math.min(BATCH_SIZE, batchPendingTotal)} of ${batchPendingTotal.toLocaleString()} pending`}
                                        </button>
                                        {/* 🆕 V14.82: Gemini specifically — it is the one with a real daily limit */}
                                        {aiDailyCounts.gemini > 0 && (
                                            <span className="text-[10px] text-blue-400/70 whitespace-nowrap" title="Successful Gemini calls today, across all features. Gemini has a small free daily quota; Groq does not. Resets at midnight US Pacific.">
                                                ✨ {aiDailyCounts.gemini.toLocaleString()} Gemini today
                                            </span>
                                        )}
                                    </div>
                                )}
                                <select value={familyFilter} onChange={e => setFamilyFilter(e.target.value)} className="p-2 lg:p-2.5 rounded-xl text-xs font-bold uppercase flex-1 min-w-[80px] sm:flex-initial"><option value="All">Family</option>{FAMILIES.map(f => <option key={f} value={f}>{f}</option>)}</select>
                                <select value={difficultyFilter} onChange={e => setDifficultyFilter(e.target.value)} className="p-2 lg:p-2.5 rounded-xl text-xs font-bold uppercase flex-1 min-w-[100px] sm:flex-initial"><option value="All">Difficulty</option>{DIFFICULTIES.map(eff => <option key={eff} value={eff}>{eff}</option>)}</select>
                            </div>
                        </div>
                    </header>

                    <main className="w-full mx-auto px-6 flex-1 overflow-hidden py-6">

                        <div onScroll={(e) => {if(e.target.scrollHeight - e.target.scrollTop <= e.target.clientHeight + 100 && hasMore && !loading) fetchWords(page)}} className="glass-card rounded-2xl h-full overflow-y-auto custom-scroll shadow-2xl">
                            <table className="desktop-table w-full text-left border-collapse">
                                <thead className="sticky top-0 bg-slate-900/95 backdrop-blur-md text-[10px] uppercase font-black text-slate-500 tracking-widest border-b border-white/5 z-20">
                                    <tr>
                                        <th className="p-5 pl-8 w-16 text-center">Fav</th>
                                        <th className="p-5 w-32">Difficulty</th>
                                        <th className="p-5 w-64 text-indigo-400">Vocabulary</th>
                                        <th className="p-5 w-40">Family</th>
                                        <th className={`p-5 w-64 ${search ? 'text-blue-400' : ''}`}>Synonyms</th>
                                        <th className="p-5">Context</th>
                                        <th className="p-5 text-right pr-10 w-48 font-black">Actions</th>
                                    </tr>
                                </thead>
                                <tbody key={`table-${words.length}-${search}-${familyFilter}-${emptyFilter}-${favouriteLevel}`} className="divide-y divide-white/5">
                                    {words.map(w => (
                                        <tr key={w.id} className="hover:bg-indigo-500/[0.03] transition-colors">
                                            <td className="p-5 pl-8 text-center"><button onClick={() => toggleFavourite(w.id, w.favourite || 0)} className="tooltip" data-tip="Toggle favourite"><i className={`fa-star ${w.favourite === 0 ? 'far star-off' : w.favourite === 1 ? 'fas fa-star-half-alt star-half' : 'fas star-on'} text-xl`}></i></button></td>
                                            <td className="p-5"><span className="text-[10px] font-black px-2 py-1 rounded border border-indigo-500/20 text-indigo-300 uppercase">{w.difficulty || '—'}</span></td>
                                            <td 
                                                className="p-5 font-black text-slate-100 text-lg cursor-pointer hover:text-indigo-400 transition-colors" 
                                                onClick={() => speakText(w.vocabulary, 1.0)}
                                                title="Click to hear pronunciation"
                                            >{search ? highlightMatch(w.vocabulary, search) : w.vocabulary}<AiSourceDot source={w.ai_source} /></td>
                                            <td className="p-5"><span className="text-[10px] font-black px-2 py-1 rounded border bg-slate-800 text-slate-400 uppercase">{w.family || '—'}</span></td>
                                            <td className="p-5 font-bold text-slate-100 text-sm italic">{search ? (w.synonyms ? highlightMatch(w.synonyms, search) : '—') : (w.synonyms || '—')}</td>
                                            <td 
                                                className="p-5 text-sm text-slate-400 italic leading-relaxed cursor-pointer hover:text-slate-200 transition-colors"
                                                onClick={() => w.context && speakText(w.context, 1.0)}
                                                title="Click to hear pronunciation"
                                            >
                                                {w.context ? highlightWordInContext(w.context, w.vocabulary) : '—'}
                                            </td>
                                            <td className="p-5 text-right pr-10">
                                                <div className="flex justify-end gap-1">
                                                    {(() => {
                                                        const hasAllData = w.family && w.synonyms && w.context;
                                                        return (
                                                            <button 
                                                                onClick={() => hasAllData ? handleImproveWord(w.vocabulary, w.id) : handleMagicFill(w.vocabulary, null, w.id)} 
                                                                disabled={magicLoading}
                                                                className={`${hasAllData ? 'improve-btn' : 'magic-btn'} p-1 rounded-lg tooltip`}
                                                                data-tip={hasAllData ? "Improve with AI" : "Auto-fill with AI"}
                                                            >
                                                                <span className={`text-xl ${magicLoading ? 'animate-spin-slow inline-block' : ''}`}>
                                                                    ✨
                                                                </span>
                                                            </button>
                                                        );
                                                    })()}
                                                    {/* 🆕 V11.61: Reduced padding in desktop buttons */}
                                                    <button 
                                                         onClick={() => { setSelectedWordForDict(w.vocabulary); setShowDictionaryModal(true); }}
                                                        className="text-blue-500 hover:text-blue-400 tooltip p-1" 
                                                        data-tip="Open in Dictionary"
                                                    >
                                                        <i className="fas fa-book text-xl"></i>
                                                    </button>
                                                    <button 
                                                        onClick={() => handleFindSimilar(w)}
                                                        disabled={findingSimilar === w.id}
                                                        className="text-orange-500 hover:text-orange-400 tooltip p-1" 
                                                        data-tip="Find & Merge Similar"
                                                    >
                                                        <i className={`fas ${findingSimilar === w.id ? 'fa-spinner fa-spin' : 'fa-link'} text-xl`}></i>
                                                    </button>
                                                    {/* Edit button */}
                                                    <button onClick={() => { setEditingWord(w); setOriginalEditData({...w}); setShowAddModal(true); setSpellCheckResult(null); setUsageInfo(null); setMagicFillModel(null); }} className="text-slate-500 hover:text-white tooltip p-1" data-tip="Edit word"><i className="fas fa-edit text-xl"></i></button>
                                                    {/* Delete button */}
                                                    <button onClick={async () => {
                                                        if(confirm('Move to recycle bin?')) {
                                                            // 🆕 V11.2: Soft delete
                                                            await supabase.from('vocabulary_v4').update({ deleted_at: new Date().toISOString() }).eq('id', w.id); 
                                                            fetchWords(0, true);
                                                            checkRecycleBinCount(); // 🆕 V11.4
                                                        }
                                                    }} className="text-slate-700 hover:text-red-500 tooltip p-1" data-tip="Delete word"><i className="fas fa-trash text-xl"></i></button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            
                            {/* Mobile Cards View */}
                            <div className="mobile-cards p-4">
                                {words.map(w => (
                                    <div key={w.id} className="vocab-card">
                                        <div className="flex justify-between items-start mb-4">
                                            <div className="flex items-center gap-3">
                                                <button 
                                                    onClick={() => toggleFavourite(w.id, w.favourite || 0)} 
                                                    className="text-2xl"
                                                >
                                                    <i className={`fa-star ${w.favourite === 0 ? 'far star-off' : w.favourite === 1 ? 'fas fa-star-half-alt star-half' : 'fas star-on'}`}></i>
                                                </button>
                                                <span className="text-[10px] font-black px-3 py-1 rounded border border-indigo-500/20 text-indigo-300 uppercase">
                                                    {w.difficulty || '—'}
                                                </span>
                                            </div>
                                            <span className="text-[10px] font-black px-3 py-1 rounded border bg-slate-800 text-slate-400 uppercase">
                                                {w.family || '—'}
                                            </span>
                                        </div>
                                        
                                        <div 
                                            className="text-2xl font-black text-white mb-4 cursor-pointer hover:text-indigo-400 transition-colors"
                                            onClick={() => speakText(w.vocabulary, 1.0)}
                                            title="Click to hear pronunciation"
                                        >
                                            {search ? highlightMatch(w.vocabulary, search) : w.vocabulary}<AiSourceDot source={w.ai_source} />
                                        </div>
                                        
                                        {w.synonyms && (
                                            <div className="mb-4">
                                                <div className="text-[10px] uppercase font-black text-slate-500 mb-1">Synonyms</div>
                                                <div className="text-sm font-bold text-slate-100 italic">{search ? highlightMatch(w.synonyms, search) : w.synonyms}</div>
                                            </div>
                                        )}
                                        
                                        {w.context && (
                                            <div className="mb-4">
                                                <div className="text-[10px] uppercase font-black text-slate-500 mb-1">Context</div>
                                                <div 
                                                    className="text-sm text-slate-400 italic leading-relaxed cursor-pointer hover:text-slate-200 transition-colors"
                                                    onClick={() => speakText(w.context, 1.0)}
                                                    title="Click to hear pronunciation"
                                                >
                                                    {highlightWordInContext(w.context, w.vocabulary)}
                                                </div>
                                            </div>
                                        )}
                                        
                                        {/* 🆕 V11.61: Reduced padding and gap for more compact mobile buttons */}
                                        <div className="flex justify-between items-center gap-1 pt-2 border-t border-white/5">
                                            {(() => {
                                                const hasAllData = w.family && w.synonyms && w.context;
                                                return (
                                                    <button 
                                                        onClick={() => hasAllData ? handleImproveWord(w.vocabulary, w.id) : handleMagicFill(w.vocabulary, null, w.id)} 
                                                        disabled={magicLoading}
                                                        className={`${hasAllData ? 'improve-btn' : 'magic-btn'} p-2 rounded-xl flex-1 text-xl`}
                                                    >
                                                        ✨
                                                    </button>
                                                );
                                            })()}
                                            {/* 🆕 V11.58: Reduced padding for mobile buttons to fit all */}
                                            <button 
                                                 onClick={() => { setSelectedWordForDict(w.vocabulary); setShowDictionaryModal(true); }}
                                                className="p-2 text-blue-500 bg-blue-500/10 rounded-xl flex-1 text-xl"
                                            >
                                                📖
                                            </button>
                                            <button 
                                                onClick={() => handleFindSimilar(w)}
                                                disabled={findingSimilar === w.id}
                                                className="p-2 text-orange-500 bg-orange-500/10 rounded-xl flex-1 text-xl" 
                                            >
                                                <i className={`fas ${findingSimilar === w.id ? "fa-spinner fa-spin" : "fa-link"}`}></i>
                                            </button>
                                            {/* 🆕 V11.11: Edit button (3rd position) */}
                                            <button 
                                                onClick={() => { setEditingWord(w); setOriginalEditData({...w}); setShowAddModal(true); setSpellCheckResult(null); setUsageInfo(null); setMagicFillModel(null); }} 
                                                className="p-2 text-slate-400 bg-slate-800 rounded-xl flex-1 text-xl"
                                            >
                                                ✏️
                                            </button>
                                            {/* Delete button */}
                                            <button 
                                                onClick={async () => {
                                                    if(confirm('Move to recycle bin?')) {
                                                        await supabase.from('vocabulary_v4').update({ deleted_at: new Date().toISOString() }).eq('id', w.id); 
                                                        fetchWords(0, true);
                                                        checkRecycleBinCount(); // 🆕 V11.4
                                                    }
                                                }} 
                                                className="p-2 text-red-500 bg-red-500/10 rounded-xl flex-1 text-xl"
                                            >
                                                🗑️
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </main>

                    {showSettings && (
                        <div className="fixed inset-0 bg-black/95 z-[100] flex items-center justify-center p-4 backdrop-blur-md">
                            <div className="glass-card p-10 rounded-[2.5rem] w-full max-w-2xl border-indigo-500/30 max-h-[90vh] overflow-y-auto custom-scroll">
                                <h2 className="text-2xl font-black mb-8 main-gradient uppercase text-center italic">Booster Control</h2>
                                <div className="space-y-6">
                                    {/* 🆕 V11.15: Supabase Configuration */}
                                    <div>
                                        <label className="text-[10px] uppercase font-black text-slate-500 mb-2 block tracking-widest">Supabase URL</label>
                                        <input 
                                            type="text" 
                                            value={supabaseUrl} 
                                            onChange={e => {
                                                const trimmedUrl = e.target.value.trim();
                                                setSupabaseUrl(trimmedUrl); 
                                                localStorage.setItem('supabase_url', trimmedUrl);
                                            }}
                                            placeholder="https://your-project.supabase.co" 
                                            className="w-full p-4 rounded-xl text-sm font-mono"
                                        />
                                        <p className="text-xs text-slate-500 mt-2">Your Supabase project URL</p>
                                        {supabaseUrl && (
                                            <div className="mt-2 p-2 bg-green-900/20 border border-green-500/30 rounded text-xs text-green-400">
                                                ✓ URL configured ({supabaseUrl.length} chars)
                                            </div>
                                        )}
                                    </div>
                                    <div>
                                        <label className="text-[10px] uppercase font-black text-slate-500 mb-2 block tracking-widest">Supabase Anon Key</label>
                                        <input 
                                            type="password" 
                                            value={supabaseKey} 
                                            onChange={e => {
                                                const trimmedKey = e.target.value.trim();
                                                setSupabaseKey(trimmedKey); 
                                                localStorage.setItem('supabase_key', trimmedKey);
                                            }}
                                            placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." 
                                            className="w-full p-4 rounded-xl text-sm font-mono"
                                        />
                                        <p className="text-xs text-slate-500 mt-2">Your Supabase anon/public key (safe to share)</p>
                                        {supabaseKey && (
                                            <div className="mt-2 p-2 bg-green-900/20 border border-green-500/30 rounded text-xs text-green-400">
                                                ✓ Key configured ({supabaseKey.length} chars)
                                            </div>
                                        )}
                                    </div>
                                    <div>
                                        <label className="text-[10px] uppercase font-black text-slate-500 mb-2 block tracking-widest">Groq AI API Key</label>
                                        <input 
                                            type="password" 
                                            value={groqApiKey} 
                                            onChange={e => {
                                                const trimmedKey = e.target.value.trim();
                                                setGroqApiKey(trimmedKey); 
                                                localStorage.setItem('groq_api_key', trimmedKey);
                                            }} 
                                            onBlur={e => {
                                                const trimmedKey = e.target.value.trim();
                                                setGroqApiKey(trimmedKey); 
                                                localStorage.setItem('groq_api_key', trimmedKey);
                                            }}
                                            placeholder="gsk_..." 
                                            className="w-full p-4 rounded-xl text-sm font-mono"
                                        />
                                        <p className="text-xs text-slate-500 mt-2">Get your free key at: <a href="https://console.groq.com" target="_blank" className="text-indigo-400 underline">Groq Console</a></p>
                                        {groqApiKey && (
                                            <div className="mt-2 p-2 bg-green-900/20 border border-green-500/30 rounded text-xs text-green-400">
                                                ✓ Key configured ({groqApiKey.length} chars)
                                            </div>
                                        )}
                                    </div>
                                    {/* 🆕 V14.67: Gemini key — primary model for Magic Fill, Groq stays as automatic fallback */}
                                    <div>
                                        <label className="text-[10px] uppercase font-black text-slate-500 mb-2 block tracking-widest">Gemini API Key</label>
                                        <input
                                            type="password"
                                            value={geminiApiKey}
                                            onChange={e => {
                                                const trimmedKey = e.target.value.trim();
                                                setGeminiApiKey(trimmedKey);
                                                localStorage.setItem('gemini_api_key', trimmedKey);
                                            }}
                                            onBlur={e => {
                                                const trimmedKey = e.target.value.trim();
                                                setGeminiApiKey(trimmedKey);
                                                localStorage.setItem('gemini_api_key', trimmedKey);
                                            }}
                                            placeholder="AIza..."
                                            className="w-full p-4 rounded-xl text-sm font-mono"
                                        />
                                        <p className="text-xs text-slate-500 mt-2">Used first for Magic Fill (gemini-2.5-flash), with Groq as automatic fallback. Get your free key at: <a href="https://aistudio.google.com/apikey" target="_blank" className="text-indigo-400 underline">Google AI Studio</a></p>
                                        {geminiApiKey && (
                                            <div className="mt-2 p-2 bg-green-900/20 border border-green-500/30 rounded text-xs text-green-400">
                                                ✓ Key configured ({geminiApiKey.length} chars)
                                            </div>
                                        )}
                                    </div>
                                    <div>
                                        <label className="text-[10px] uppercase font-black text-slate-500 mb-2 block tracking-widest">Magic Fill Prompt (use {'{word}'} placeholder)</label>
                                        <textarea 
                                            value={magicFillPrompt} 
                                            onChange={e => {
                                                setMagicFillPrompt(e.target.value);
                                                localStorage.setItem('magic_fill_prompt', e.target.value);
                                            }}
                                            rows="6"
                                            className="w-full p-4 rounded-xl text-xs font-mono"
                                            placeholder="Enter your custom prompt for Magic Fill..."
                                        />
                                        <p className="text-xs text-slate-500 mt-2">Customize how AI generates vocabulary data. Use {'{word}'} to insert the word being processed.</p>
                                    </div>
                                    
                                    {/* 🆕 V11.55: Web Search Prompt for Perplexity in dictionary modal */}
                                    <div>
                                        <label className="text-[10px] uppercase font-black text-slate-500 mb-2 block tracking-widest">Web Search Prompt (use {'{word}'} placeholder)</label>
                                        <textarea 
                                            value={aiSearchPrompt} 
                                            onChange={e => {
                                                setAiSearchPrompt(e.target.value);
                                                localStorage.setItem('ai_search_prompt', e.target.value);
                                            }}
                                            rows="5"
                                            className="w-full p-4 rounded-xl text-xs font-mono"
                                            placeholder="For the English word/expression {word}, provide meaning, synonyms, context..."
                                        />
                                        <p className="text-xs text-slate-500 mt-2">This prompt is used when opening Perplexity AI from the dictionary modal 📖. Use {'{word}'} as placeholder.</p>
                                    </div>
                                    
                                    {/* 🆕 V11.7: Voice selection */}
                                    <div>
                                        <label className="text-[10px] uppercase font-black text-slate-500 mb-2 block tracking-widest">Text-to-Speech Voice</label>
                                        <select 
                                            value={preferredVoice} 
                                            onChange={e => {
                                                setPreferredVoice(e.target.value);
                                                localStorage.setItem('preferred_voice', e.target.value);
                                            }} 
                                            className="w-full p-4 rounded-xl text-sm font-bold"
                                        >
                                            <option value="auto">🤖 Auto (Best Available)</option>
                                            <optgroup label="🔊 Groq Orpheus HD (requires API key)">
                                                <option value="groq-autumn">🎙️ Autumn (Female)</option>
                                                <option value="groq-diana">🎙️ Diana (Female)</option>
                                                <option value="groq-hannah">🎙️ Hannah (Female)</option>
                                                <option value="groq-austin">🎙️ Austin (Male)</option>
                                                <option value="groq-daniel">🎙️ Daniel (Male)</option>
                                                <option value="groq-troy">🎙️ Troy (Male)</option>
                                            </optgroup>
                                            <optgroup label="🔈 Browser voices">
                                            {availableVoices.map(voice => (
                                                <option key={voice.name} value={voice.name}>
                                                    {voice.name} ({voice.lang})
                                                </option>
                                            ))}
                                            </optgroup>
                                        </select>
                                        <div className="flex items-center gap-2 mt-2">
                                            <p className="text-xs text-slate-500 flex-1">Groq Orpheus voices are hyper-realistic AI (uses your Groq API key, max 200 chars). Browser voices are free.</p>
                                            <button 
                                                type="button"
                                                onClick={async () => {
                                                    const testText = 'This is a voice test from English Booster.';
                                                    if (preferredVoice.startsWith('groq-')) {
                                                        const apiKey = groqApiKey.trim();
                                                        if (!apiKey) { alert('❌ Please set your Groq API Key first.'); return; }
                                                        try {
                                                            const voiceName = preferredVoice.replace('groq-', '');
                                                            const resp = await fetch('https://api.groq.com/openai/v1/audio/speech', {
                                                                method: 'POST',
                                                                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                                                                body: JSON.stringify({ model: GROQ_MODEL_TTS, input: testText, voice: voiceName, response_format: 'wav' })
                                                            });
                                                            if (!resp.ok) {
                                                                const errText = await resp.text().catch(() => '');
                                                                if (errText.includes('terms acceptance')) {
                                                                    alert('⚠️ You need to accept the Orpheus model terms first.\n\nGo to:\nhttps://console.groq.com/playground?model=canopylabs/orpheus-v1-english\n\nAccept the terms, then try again.');
                                                                } else {
                                                                    alert('❌ Groq TTS Error ' + resp.status + ':\n' + errText.substring(0, 200));
                                                                }
                                                                return;
                                                            }
                                                            const blob = await resp.blob();
                                                            const url = URL.createObjectURL(blob);
                                                            const audio = new Audio(url);
                                                            audio.onended = () => URL.revokeObjectURL(url);
                                                            audio.onerror = (e) => { alert('❌ Audio playback error: ' + e.type); URL.revokeObjectURL(url); };
                                                            await audio.play();
                                                        } catch(e) {
                                                            alert('❌ Groq TTS failed:\n' + e.message + '\n\nThis may be a CORS issue. Groq TTS may not support browser calls.');
                                                        }
                                                    } else {
                                                        speakText(testText, 1.0, false);
                                                    }
                                                }}
                                                className="px-3 py-1.5 text-xs font-bold rounded-lg bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/30 transition-colors whitespace-nowrap"
                                            >
                                                🔊 Test
                                            </button>
                                        </div>
                                    </div>
                                    
                                    {/* 🆕 V11.16: Selection Exercise Countdown */}
                                    <div>
                                        <label className="text-[10px] uppercase font-black text-slate-500 mb-2 block tracking-widest">Selection Exercise - Countdown (seconds)</label>
                                        <input 
                                            type="number"
                                            min="0"
                                            max="30"
                                            value={selectionCountdown} 
                                            onChange={e => {
                                                const value = parseInt(e.target.value) || 0;
                                                setSelectionCountdown(value);
                                                localStorage.setItem('selection_countdown', value.toString());
                                            }} 
                                            className="w-full p-4 rounded-xl text-sm font-bold"
                                        />
                                        <p className="text-xs text-slate-500 mt-2">How many seconds to blur options before showing them (0 = no blur, default: 5)</p>
                                    </div>
                                    
                                    <div>
                                        <label className="text-[10px] uppercase font-black text-slate-500 mb-2 block tracking-widest">Talk to me — Method</label>
                                        <div className="flex gap-3">
                                            <button
                                                onClick={() => { setTalkToMeMethod('chatgpt'); localStorage.setItem('talk_to_me_method', 'chatgpt'); }}
                                                className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${talkToMeMethod === 'chatgpt' ? 'bg-teal-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                                            >🤖 Open ChatGPT</button>
                                            <button
                                                onClick={() => { setTalkToMeMethod('builtin'); localStorage.setItem('talk_to_me_method', 'builtin'); }}
                                                className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${talkToMeMethod === 'builtin' ? 'bg-teal-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                                            >🎙️ Built-in Voice</button>
                                        </div>
                                        <p className="text-xs text-slate-500 mt-2">ChatGPT opens a browser tab. Built-in uses Groq AI + Web Speech API (requires Groq key).</p>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <button onClick={async () => {
                                            const {data} = await supabase.from('vocabulary_v4').select('*').is('deleted_at', null);
                                            const link = document.createElement("a");
                                            link.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
                                            link.download = `Booster_Backup_${getFormattedDate()}.json`; link.click();
                                        }} data-tip="SAFE BACKUP: Reliable JSON format with all database metadata." className="tooltip bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest">JSON Backup</button>
                                        
                                        <button onClick={exportCSV} data-tip="EXCEL EDIT: Best for reading/editing. Remember to save as CSV." className="tooltip bg-blue-600/20 text-blue-400 border border-blue-500/30 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest">Excel Export</button>
                                        
                                        <label data-tip="RESTORE: Drag your file here to sync updates and new words." className="tooltip col-span-2 bg-slate-800 text-slate-300 border border-white/10 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest text-center cursor-pointer">
                                            <i className="fas fa-upload mr-2"></i> Import/Restore
                                            <input type="file" accept=".json,.csv" onChange={handleImport} className="hidden" />
                                        </label>
                                    </div>
                                    <button onClick={() => setShowSettings(false)} className="w-full bg-indigo-600 py-4 rounded-2xl font-black uppercase shadow-xl">Close</button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 🆕 V11.59: Exercises Modal */}
                    {showExercisesModal && (
                        <div className="fixed inset-0 bg-black/95 z-[100] flex items-center justify-center p-4 backdrop-blur-md">
                            <div className="glass-card p-10 rounded-[2.5rem] w-full max-w-3xl max-h-[90vh] overflow-y-auto">
                                <div className="flex justify-between items-center mb-8">
                                    <h2 className="text-2xl font-black main-gradient uppercase text-center italic">🏋️ Choose Exercise</h2>
                                    <button onClick={() => setShowExercisesModal(false)} className="text-slate-400 hover:text-white text-3xl">&times;</button>
                                </div>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* Flashcards */}
                                    <button
                                        onClick={() => {
                                            setShowExercisesModal(false);
                                            loadFlashcards();
                                        }}
                                        className="group relative overflow-hidden bg-purple-600 hover:bg-purple-500 p-6 rounded-2xl text-left transition-all hover:scale-105 hover:shadow-2xl"
                                    >
                                        <div className="flex items-center gap-4 mb-3">
                                            <span className="text-4xl">🎴</span>
                                            <h3 className="text-xl font-black text-white uppercase">Flashcards</h3>
                                        </div>
                                        <p className="text-sm text-white/80">Flip cards to test your vocabulary memory. Rate your knowledge level.</p>
                                    </button>
                                    
                                    {/* Dictation */}
                                    <button
                                        onClick={() => {
                                            setShowExercisesModal(false);
                                            loadDictation();
                                        }}
                                        className="group relative overflow-hidden bg-blue-600 hover:bg-blue-500 p-6 rounded-2xl text-left transition-all hover:scale-105 hover:shadow-2xl"
                                    >
                                        <div className="flex items-center gap-4 mb-3">
                                            <span className="text-4xl">🎤</span>
                                            <h3 className="text-xl font-black text-white uppercase">Dictation</h3>
                                        </div>
                                        <p className="text-sm text-white/80">Listen and type what you hear. Improve listening and spelling skills.</p>
                                    </button>
                                    
                                    {/* Selection */}
                                    <button
                                        onClick={() => {
                                            setShowExercisesModal(false);
                                            loadSelection();
                                        }}
                                        className="group relative overflow-hidden bg-green-600 hover:bg-green-500 p-6 rounded-2xl text-left transition-all hover:scale-105 hover:shadow-2xl"
                                    >
                                        <div className="flex items-center gap-4 mb-3">
                                            <span className="text-4xl">✓</span>
                                            <h3 className="text-xl font-black text-white uppercase">Selection</h3>
                                        </div>
                                        <p className="text-sm text-white/80">Choose the correct word from multiple options to complete sentences.</p>
                                    </button>
                                    
                                    {/* Guesswork */}
                                    <button
                                        onClick={() => {
                                            setShowExercisesModal(false);
                                            loadGuesswork();
                                        }}
                                        className="group relative overflow-hidden bg-orange-600 hover:bg-orange-500 p-6 rounded-2xl text-left transition-all hover:scale-105 hover:shadow-2xl"
                                    >
                                        <div className="flex items-center gap-4 mb-3">
                                            <span className="text-4xl">🤔</span>
                                            <h3 className="text-xl font-black text-white uppercase">Guesswork</h3>
                                        </div>
                                        <p className="text-sm text-white/80">Write sentences using vocabulary words. AI evaluates your guesswork.</p>
                                    </button>
                                    
                                    {/* Translation */}
                                    <button
                                        onClick={() => {
                                            setShowExercisesModal(false);
                                            loadTranslation();
                                        }}
                                        className="group relative overflow-hidden bg-pink-600 hover:bg-pink-500 p-6 rounded-2xl text-left transition-all hover:scale-105 hover:shadow-2xl"
                                    >
                                        <div className="flex items-center gap-4 mb-3">
                                            <span className="text-4xl">🌐</span>
                                            <h3 className="text-xl font-black text-white uppercase">Translation</h3>
                                        </div>
                                        <p className="text-sm text-white/80">Translate Spanish sentences to English. Practice language conversion skills.</p>
                                    </button>
                                    
                                    {/* 🆕 V13.7: Writing */}
                                    <button
                                        onClick={() => {
                                            setShowExercisesModal(false);
                                            loadWriting();
                                        }}
                                        className="group relative overflow-hidden bg-teal-600 hover:bg-teal-500 p-6 rounded-2xl text-left transition-all hover:scale-105 hover:shadow-2xl"
                                    >
                                        <div className="flex items-center gap-4 mb-3">
                                            <span className="text-4xl">✍️</span>
                                            <h3 className="text-xl font-black text-white uppercase">Writing</h3>
                                        </div>
                                        <p className="text-sm text-white/80">Write a paragraph using given vocabulary. AI evaluates grammar, spelling and style.</p>
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {showAddModal && (
                        <div className="fixed inset-0 bg-black/95 z-[200] flex items-center justify-center p-4 backdrop-blur-md">
                            <div className="glass-card rounded-[2.5rem] w-full max-w-2xl flex flex-col max-h-[90vh] overflow-hidden">
                                <div className="flex justify-between items-center px-8 pt-8 pb-5 shrink-0 border-b border-white/5">
                                    <h2 className="text-2xl font-black italic main-gradient uppercase tracking-widest">{editingWord ? 'Edit Word' : 'New Word'}</h2>
                                    <div className="flex items-center gap-2">
                                        {/* 🆕 V11.56: Dictionary button updated to use modal */}
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const vocabValue = document.getElementById('modalVocabInput')?.value || editingWord?.vocabulary || '';
                                                if (vocabValue) {
                                                    setSelectedWordForDict(vocabValue);
                                                    setShowDictionaryModal(true);
                                                } else {
                                                    alert('Please enter a word first!');
                                                }
                                            }}
                                            className="tooltip bg-blue-600/20 text-blue-400 border border-blue-500/30 px-3 py-2 rounded-xl font-bold text-xs hover:bg-blue-600/30"
                                            data-tip="Open in dictionary"
                                        >
                                            📖
                                        </button>
                                        
                                        {/* 🆕 V11.9: Restore button */}
                                        {editingWord && originalEditData && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (confirm('Restore original data before editing?')) {
                                                        document.querySelector('[name="vocabulary"]').value = originalEditData.vocabulary;
                                                        document.querySelector('[name="synonyms"]').value = originalEditData.synonyms || '';
                                                        document.querySelector('[name="context"]').value = originalEditData.context || '';
                                                        document.querySelector('[name="family"]').value = originalEditData.family || '';
                                                        alert('✅ Original data restored!');
                                                    }
                                                }}
                                                className="tooltip bg-yellow-600/20 text-yellow-400 border border-yellow-500/30 px-3 py-2 rounded-xl font-bold text-xs hover:bg-yellow-600/30"
                                                data-tip="Restore data as it was before editing"
                                            >
                                                <i className="fas fa-history"></i>
                                            </button>
                                        )}
                                        
                                        {/* 🆕 V11.32: Delete button in header (small) */}
                                        {editingWord && (
                                            <button
                                                type="button"
                                                onClick={async () => {
                                                    if(confirm('🗑️ Move to recycle bin?')) {
                                                        await supabase.from('vocabulary_v4').update({ deleted_at: new Date().toISOString() }).eq('id', editingWord.id);
                                                        setShowAddModal(false);
                                                        setEditingWord(null);
                                                        fetchWords(0, true);
                                                        checkRecycleBinCount();
                                                    }
                                                }}
                                                className="tooltip bg-red-600/20 text-red-400 border border-red-500/30 px-3 py-2 rounded-xl font-bold text-xs hover:bg-red-600/30"
                                                data-tip="Delete word (move to recycle bin)"
                                            >
                                                <i className="fas fa-trash"></i>
                                            </button>
                                        )}
                                        
                                        {editingWord && <span className="text-slate-500 text-xs font-mono">ID: {editingWord.id}</span>}
                                    </div>
                                </div>
                                <form onSubmit={handleSave} className="grid grid-cols-2 gap-5 overflow-y-auto custom-scroll px-8 py-6 flex-1">
                                    {/* 🆕 V14.67: which model generated the fields below — pinned to the top of the form */}
                                    {magicFillModel && (
                                        <div className="col-span-2 -mb-1 py-2 px-3 rounded-xl bg-slate-800/60 border border-slate-700/60">
                                            <ModelBadge model={magicFillModel} prominent />
                                        </div>
                                    )}
                                    <div className="col-span-2 flex flex-col gap-1">
                                        <label className="text-[10px] uppercase font-bold text-slate-500 ml-1">Vocabulary</label>
                                        <div className="relative">
                                            <input name="vocabulary" id="modalVocabInput" required defaultValue={editingWord?.vocabulary} className="p-4 rounded-xl w-full pr-20"
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    if (dupDebounceTimer.current) clearTimeout(dupDebounceTimer.current);
                                                    if (!editingWord) {
                                                        dupDebounceTimer.current = setTimeout(() => searchDuplicates(val), 500);
                                                    }
                                                }}
                                            />
                                            <button 
                                                type="button" 
                                                onClick={async () => {
                                                    const vocabValue = document.getElementById('modalVocabInput').value;
                                                    if (!vocabValue) {
                                                        alert('Please enter a word first!');
                                                        return;
                                                    }
                                                    const hasSynonyms = editingWord?.synonyms && editingWord.synonyms.trim();
                                                    const hasContext = editingWord?.context && editingWord.context.trim();
                                                    const hasFamily = editingWord?.family && editingWord.family.trim();
                                                    
                                                    if (editingWord && hasSynonyms && hasContext && hasFamily) {
                                                        // 🆕 V11.2: Close edit modal and open improve modal directly
                                                        setShowAddModal(false);
                                                        await handleImproveWord(vocabValue, editingWord.id);
                                                    } else {
                                                        handleMagicFill(vocabValue, {
                                                            synonyms: document.querySelector('[name="synonyms"]'),
                                                            context: document.querySelector('[name="context"]'),
                                                            family: document.querySelector('[name="family"]')
                                                        });
                                                    }
                                                }} 
                                                disabled={magicLoading}
                                                className={`absolute right-14 top-2 p-2 rounded-lg tooltip ${(editingWord?.synonyms && editingWord?.context && editingWord?.family) ? 'improve-btn' : 'magic-btn'}`}
                                                data-tip={(editingWord?.synonyms && editingWord?.context && editingWord?.family) ? "Improve with AI" : "Auto-fill with AI"}
                                            >
                                                <span className={`text-xl ${magicLoading ? 'animate-spin-slow inline-block' : ''}`}>
                                                    ✨
                                                </span>
                                            </button>
                                            {/* 🆕 V11.93: Unified lupa/brain toggle for add modal */}
                                            {!editingWord && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const newMode = !addModalAIMode;
                                                        setAddModalAIMode(newMode);
                                                        const val = document.getElementById('modalVocabInput')?.value;
                                                        if (newMode && val && val.trim().length >= 2) {
                                                            searchMorphological(val);
                                                        } else if (!newMode) {
                                                            setDupCheck(prev => ({ ...prev, morphForms: [], morphLoading: false }));
                                                            if (val && val.trim().length >= 2) searchDuplicates(val);
                                                        }
                                                    }}
                                                    disabled={dupCheck.morphLoading}
                                                    className={`absolute right-2 top-2 p-2 rounded-lg tooltip border transition-colors ${
                                                        addModalAIMode 
                                                            ? 'bg-purple-500/20 border-purple-500 text-purple-400' 
                                                            : 'border-slate-600 text-slate-500 hover:text-slate-300'
                                                    }`}
                                                    data-tip={addModalAIMode ? 'AI search active (vocabulary only)' : 'Toggle AI search'}
                                                >
                                                    <i className={`fas ${addModalAIMode ? 'fa-brain' : 'fa-search'} ${dupCheck.morphLoading ? 'animate-pulse' : ''}`}></i>
                                                </button>
                                            )}
                                        </div>
                                        {/* V11.87: Duplicate detection results - no View button, deduped, scrollable */}
                                        {!editingWord && (dupCheck.exact.length > 0 || dupCheck.partial.length > 0 || dupCheck.morphForms.length > 0 || dupCheck.loading || dupCheck.morphLoading) && (
                                            <div className="mt-1 rounded-xl border border-slate-600/50 bg-slate-900/90 overflow-hidden text-xs">
                                                {/* Sticky header with close button */}
                                                <div className="sticky top-0 flex items-center justify-between px-3 py-1.5 bg-slate-800 border-b border-slate-700/50 z-10">
                                                    <span className="text-slate-400 text-[9px] uppercase font-black tracking-widest">Duplicate Check</span>
                                                    <button type="button" onClick={() => setDupCheck({ loading: false, morphLoading: false, exact: [], partial: [], morphForms: [], term: '' })} className="text-slate-400 hover:text-white text-lg leading-none px-1">&times;</button>
                                                </div>
                                                {/* Scrollable results area - max-h so it never hides form buttons */}
                                                <div className="overflow-y-auto max-h-48 custom-scroll">
                                                    {dupCheck.loading && <div className="px-3 py-2 text-slate-400 italic">Searching...</div>}
                                                    {dupCheck.exact.length > 0 && (
                                                        <div className="bg-red-900/30">
                                                            <div className="px-3 py-1 bg-red-900/40">
                                                                <span className="text-red-400 font-black text-[9px] uppercase tracking-widest">⚠️ Exact match already exists</span>
                                                            </div>
                                                            {dupCheck.exact.map(w => (
                                                                <div key={w.id} className="px-3 py-1.5 border-t border-red-900/40 flex items-start justify-between gap-2">
                                                                    <div>
                                                                        <div className="text-white font-bold">{highlightMatch(w.vocabulary, dupCheck.term)}</div>
                                                                        {w.synonyms && <div className="text-slate-400 text-[10px] mt-0.5 leading-tight">{highlightMatch(w.synonyms.slice(0,100), dupCheck.term)}</div>}
                                                                    </div>
                                                                                                                                    <button type="button" onClick={() => {
                                                                    setShowAddModal(false);
                                                                    setDupCheck({ loading: false, morphLoading: false, exact: [], partial: [], morphForms: [], term: '' });
                                                                    setTimeout(() => {
                                                                        setEditingWord(w);
                                                                        setOriginalEditData({...w});
                                                                        setShowAddModal(true);
                                                                    }, 50);
                                                                }} className="mt-1 text-[8px] font-black uppercase border border-slate-600 text-slate-400 hover:border-indigo-500 hover:text-indigo-300 px-2 py-0.5 rounded-full transition-colors">→ Open &amp; edit</button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                    {dupCheck.partial.length > 0 && (
                                                        <div>
                                                            <div className="px-3 py-1 bg-slate-800/60">
                                                                <span className="text-yellow-400 font-black text-[9px] uppercase tracking-widest">🔎 Similar words</span>
                                                            </div>
                                                            {dupCheck.partial.map(w => (
                                                                <div key={w.id} className="px-3 py-1.5 border-t border-slate-700/30 flex items-start justify-between gap-2">
                                                                    <div>
                                                                        <div className="text-white font-semibold">{highlightMatch(w.vocabulary, dupCheck.term)}</div>
                                                                        {w.synonyms && <div className="text-slate-400 text-[10px] mt-0.5 leading-tight">{highlightMatch(w.synonyms.slice(0,100), dupCheck.term)}</div>}
                                                                    </div>
                                                                                                                                    <button type="button" onClick={() => {
                                                                    setShowAddModal(false);
                                                                    setDupCheck({ loading: false, morphLoading: false, exact: [], partial: [], morphForms: [], term: '' });
                                                                    setTimeout(() => {
                                                                        setEditingWord(w);
                                                                        setOriginalEditData({...w});
                                                                        setShowAddModal(true);
                                                                    }, 50);
                                                                }} className="mt-1 text-[8px] font-black uppercase border border-slate-600 text-slate-400 hover:border-indigo-500 hover:text-indigo-300 px-2 py-0.5 rounded-full transition-colors">→ Open &amp; edit</button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                    {dupCheck.morphLoading && <div className="px-3 py-2 text-teal-400 flex items-center gap-1.5"><span className="animate-spin inline-block">🔍</span> Searching word forms...</div>}
                                                    {!dupCheck.morphLoading && dupCheck.morphForms.length > 0 && (
                                                        <div>
                                                            <div className="px-3 py-1 bg-slate-800/60 border-t border-slate-700/50">
                                                                <span className="text-teal-400 font-black text-[9px] uppercase tracking-widest">🔗 Related word forms</span>
                                                            </div>
                                                            {dupCheck.morphForms.map(w => (
                                                                <div key={w.id} className="px-3 py-1.5 border-t border-slate-700/30 flex items-start justify-between gap-2">
                                                                    <div>
                                                                        <div className="text-white font-semibold">{highlightMatch(w.vocabulary, dupCheck.term)}</div>
                                                                        {w.synonyms && <div className="text-slate-400 text-[10px] mt-0.5 leading-tight">{highlightMatch(w.synonyms.slice(0,100), dupCheck.term)}</div>}
                                                                    </div>
                                                                                                                                    <button type="button" onClick={() => {
                                                                    setShowAddModal(false);
                                                                    setDupCheck({ loading: false, morphLoading: false, exact: [], partial: [], morphForms: [], term: '' });
                                                                    setTimeout(() => {
                                                                        setEditingWord(w);
                                                                        setOriginalEditData({...w});
                                                                        setShowAddModal(true);
                                                                    }, 50);
                                                                }} className="mt-1 text-[8px] font-black uppercase border border-slate-600 text-slate-400 hover:border-indigo-500 hover:text-indigo-300 px-2 py-0.5 rounded-full transition-colors">→ Open &amp; edit</button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    
                                    <div className="flex flex-col gap-1">
                                        <label className="text-[10px] uppercase font-bold text-slate-500 ml-1">Favourite Level</label>
                                        <div className="flex items-center gap-3 bg-slate-800/50 p-4 rounded-xl">
                                            <input 
                                                type="hidden" 
                                                name="favourite"
                                                id="favouriteInput"
                                                defaultValue={editingWord?.favourite || 0}
                                            />
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    const input = document.getElementById('favouriteInput');
                                                    const currentLevel = parseInt(input.value) || 0;
                                                    const nextLevel = (currentLevel + 1) % 3;
                                                    input.value = nextLevel;
                                                    
                                                    const icon = e.currentTarget.querySelector('i');
                                                    if (nextLevel === 0) {
                                                        icon.className = 'far fa-star star-off text-2xl transition-colors';
                                                    } else if (nextLevel === 1) {
                                                        icon.className = 'fas fa-star-half-alt star-half text-2xl transition-colors';
                                                    } else {
                                                        icon.className = 'fas fa-star star-on text-2xl transition-colors';
                                                    }
                                                }}
                                                className="cursor-pointer"
                                            >
                                                <i className={`${
                                                    (editingWord?.favourite || 0) === 0 ? 'far fa-star star-off' :
                                                    (editingWord?.favourite || 0) === 1 ? 'fas fa-star-half-alt star-half' :
                                                    'fas fa-star star-on'
                                                } text-2xl transition-colors`}></i>
                                            </button>
                                            <span className="text-slate-400 text-sm">
                                                {(editingWord?.favourite || 0) === 0 ? 'Not favourite' :
                                                 (editingWord?.favourite || 0) === 1 ? 'Favourite level 1' :
                                                 'Favourite level 2'}
                                            </span>
                                        </div>
                                    </div>
                                    
                                    <div className="flex flex-col gap-1"><label className="text-[10px] uppercase font-bold text-slate-500 ml-1">Family</label><select name="family" defaultValue={editingWord?.family} className="p-4 rounded-xl font-bold"><option value="">Family...</option>{FAMILIES.map(f => <option key={f} value={f}>{f}</option>)}</select></div>
                                    <div className="col-span-2 flex flex-col gap-1"><label className="text-[10px] uppercase font-bold text-slate-500 ml-1">Synonyms</label><input name="synonyms" defaultValue={editingWord?.synonyms} className="p-4 rounded-xl" /></div>
                                    <div className="col-span-2 flex flex-col gap-1"><label className="text-[10px] uppercase font-bold text-slate-500 ml-1">Context</label><textarea name="context" defaultValue={editingWord?.context} className="p-4 rounded-xl h-20 resize-none shadow-inner" /></div>
                                    {/* 🆕 V12.8: Usage frequency info */}
                                    {usageInfo && (
                                        <div className="col-span-2 px-3 py-2 rounded-xl bg-slate-800/50 border border-slate-700/50 text-xs">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-slate-500 uppercase font-black text-[9px]">Usage:</span>
                                                <span className={`font-bold px-2 py-0.5 rounded-full text-[10px] ${
                                                    /very common|common/.test(usageInfo.usage) && !/uncommon/.test(usageInfo.usage) ? 'bg-green-500/20 text-green-400' :
                                                    /uncommon|formal|literary/.test(usageInfo.usage) ? 'bg-yellow-500/20 text-yellow-400' :
                                                    /rare/.test(usageInfo.usage) ? 'bg-red-500/20 text-red-400' :
                                                    'bg-slate-600/30 text-slate-300'
                                                }`}>{usageInfo.usage || 'unknown'}</span>
                                                {usageInfo.alternative && usageInfo.alternative.trim() && (
                                                    <>
                                                        <span className="text-slate-600">|</span>
                                                        <span className="text-slate-500 text-[9px]">More common:</span>
                                                        <span className="text-blue-400 font-bold">{usageInfo.alternative}</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                    {/* 🆕 V11.96: Spell check results */}
                                    {spellCheckResult && (
                                        <div className={`col-span-2 rounded-xl p-3 text-sm ${spellCheckResult.ok ? 'bg-green-900/30 border border-green-500/30' : 'bg-red-900/30 border border-red-500/30'}`}>
                                            {spellCheckResult.ok ? (
                                                <div className="text-green-400 flex items-center gap-2"><i className="fas fa-check-circle"></i> All spelling correct!</div>
                                            ) : (
                                                <div>
                                                    <div className="text-red-400 font-bold text-xs uppercase mb-2 flex items-center gap-2">
                                                        <i className="fas fa-exclamation-triangle"></i> Spelling errors found
                                                        <button type="button" onClick={() => setSpellCheckResult(null)} className="ml-auto text-slate-400 hover:text-white">&times;</button>
                                                    </div>
                                                    {(spellCheckResult.errors || []).map((err, i) => (
                                                        <div key={i} className="flex items-center gap-2 text-xs py-1">
                                                            <span className="text-slate-500 uppercase font-bold w-20">{err.field}</span>
                                                            <span className="text-red-400 line-through">{err.wrong}</span>
                                                            <i className="fas fa-arrow-right text-slate-600 text-[8px]"></i>
                                                            <span className="text-green-400 font-bold">{err.correct}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    <div className="col-span-2 flex gap-4 mt-4">
                                        <button type="button" onClick={() => {setEditingWord(null); setShowAddModal(false); setAddModalAIMode(false); setDupCheck({ loading: false, morphLoading: false, exact: [], partial: [], morphForms: [], term: '' }); setSpellCheckResult(null);}} className="flex-1 font-black text-slate-500 uppercase text-[10px]">Discard</button>
                                        <button 
                                            type="button"
                                            onClick={checkSpelling}
                                            disabled={spellCheckLoading}
                                            className="px-4 py-3 rounded-2xl border border-teal-500/30 text-teal-400 hover:bg-teal-500/10 font-black uppercase text-[10px] transition-colors flex items-center gap-2"
                                        >
                                            <i className={`fas fa-spell-check ${spellCheckLoading ? 'animate-pulse' : ''}`}></i>
                                            {spellCheckLoading ? 'Checking...' : 'Spell Check'}
                                        </button>
                                        <button type="submit" className="flex-[2] bg-indigo-600 py-4 rounded-2xl font-black uppercase text-sm shadow-lg shadow-indigo-500/20">Commit Changes</button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    )}

                    {/* 🆕 V14.81: MODEL CHOOSER */}
                    {showBatchChooser && (() => {
                        const count = Math.min(BATCH_SIZE, batchPendingTotal);
                        const isUpgrade = isGroqFilledFilter && batchModelChoice === 'gemini';
                        const mins = t => t < 60 ? `${Math.round(t)}s` : `${Math.round(t / 60)}-${Math.ceil(t / 60) + 1} min`;
                        return (
                            <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[210] p-4" onClick={() => setShowBatchChooser(false)}>
                                <div className="bg-slate-900 rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-white/10" onClick={e => e.stopPropagation()}>
                                    <div className="flex justify-between items-start mb-1">
                                        <h2 className="text-xl font-black text-white">{isUpgrade ? '⬆️ Upgrade to Gemini' : '✨ Fill with AI'}</h2>
                                        <button onClick={() => setShowBatchChooser(false)} className="text-slate-400 hover:text-white text-2xl leading-none">&times;</button>
                                    </div>
                                    <p className="text-slate-400 text-sm mb-5">
                                        {count} record{count === 1 ? '' : 's'} from the current filter, of {batchPendingTotal.toLocaleString()} pending.
                                    </p>

                                    <div className="space-y-3 mb-5">
                                        <button
                                            onClick={() => setBatchModelChoice('gemini')}
                                            className={`w-full text-left p-4 rounded-2xl border-2 transition-colors ${
                                                batchModelChoice === 'gemini'
                                                    ? 'bg-blue-500/15 border-blue-400'
                                                    : 'bg-slate-800/60 border-slate-700 hover:border-slate-500'
                                            }`}
                                        >
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="font-black text-blue-300">✨ Gemini</span>
                                                <span className="text-[10px] text-slate-500">~{mins(count * 6)}</span>
                                            </div>
                                            <p className="text-slate-400 text-xs">Best quality. Free quota is small (~15 requests/day) — {aiDailyCounts.gemini} used today.</p>
                                            {readGeminiQuota().exhausted && <p className="text-orange-400 text-xs mt-1 font-bold">Quota currently exhausted.</p>}
                                        </button>

                                        <button
                                            onClick={() => setBatchModelChoice('groq')}
                                            className={`w-full text-left p-4 rounded-2xl border-2 transition-colors ${
                                                batchModelChoice === 'groq'
                                                    ? 'bg-orange-500/15 border-orange-400'
                                                    : 'bg-slate-800/60 border-slate-700 hover:border-slate-500'
                                            }`}
                                        >
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="font-black text-orange-300">⚡ Groq</span>
                                                <span className="text-[10px] text-slate-500">~{mins(count * 6)}</span>
                                            </div>
                                            <p className="text-slate-400 text-xs">Lower quality, but no practical daily limit — use it for bulk filling.</p>
                                        </button>
                                    </div>

                                    {/* The upgrade path replaces content, so say so plainly */}
                                    {isUpgrade ? (
                                        <div className="bg-amber-500/10 border border-amber-500/40 rounded-2xl p-3 mb-5">
                                            <p className="text-amber-300 text-xs font-bold mb-1">⚠️ This is an upgrade — existing content will be replaced</p>
                                            <p className="text-amber-200/80 text-xs">
                                                {emptyFilter === 'UnknownOrigin'
                                                    ? 'These records have content but no recorded model, so their quality is unverified. '
                                                    : 'These records were filled by Groq. '}
                                                Gemini will rewrite their synonyms, context and family, overwriting what is there now.
                                                The previous values are kept in change history.
                                            </p>
                                        </div>
                                    ) : (
                                        <p className="text-slate-500 text-xs mb-5">Only empty fields are filled — existing content is never overwritten.</p>
                                    )}

                                    <button
                                        onClick={() => {
                                            setShowBatchChooser(false);
                                            runBatchFill(null, batchModelChoice, isUpgrade);
                                        }}
                                        className={`w-full py-3 rounded-2xl font-black uppercase text-sm text-white ${
                                            batchModelChoice === 'gemini' ? 'bg-blue-600 hover:bg-blue-500' : 'bg-orange-600 hover:bg-orange-500'
                                        }`}
                                    >
                                        {isUpgrade ? `⬆️ Upgrade ${count}` : `Start — ${count} with ${batchModelChoice === 'gemini' ? 'Gemini' : 'Groq'}`}
                                    </button>
                                </div>
                            </div>
                        );
                    })()}

                    {/* 🆕 V14.78: BATCH FILL PROGRESS */}
                    {batchProgress && (
                        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[210] p-4">
                            <div className="bg-slate-900 rounded-3xl p-7 max-w-lg w-full shadow-2xl border border-purple-500/30">
                                {/* 🆕 V14.83: title and note follow the model actually running */}
                                <h2 className="text-xl font-black text-white mb-1">
                                    {batchProgress.model === 'groq' ? '⚡ Filling with Groq' : '✨ Filling with Gemini'}
                                </h2>
                                <p className="text-slate-500 text-xs mb-5">
                                    {batchProgress.model === 'groq'
                                        ? 'Requests are spaced ~6s apart to keep the load steady — a full batch takes 2-3 minutes.'
                                        : "Requests are spaced ~6s apart to stay inside Gemini's per-minute limit — a full batch takes 2-3 minutes."}
                                </p>

                                <div className="flex justify-between items-end mb-2">
                                    <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Progress</span>
                                    <span className="text-white font-black">{batchProgress.current} / {batchProgress.total}</span>
                                </div>
                                <div className="h-3 bg-slate-800 rounded-full overflow-hidden mb-5">
                                    <div
                                        className="h-full bg-gradient-to-r from-purple-500 to-indigo-400 transition-all duration-500"
                                        style={{ width: `${Math.round((batchProgress.current / batchProgress.total) * 100)}%` }}
                                    />
                                </div>

                                <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3 mb-5">
                                    <p className="text-[10px] uppercase font-black text-slate-500 mb-1">Currently processing</p>
                                    <p className="text-indigo-300 font-bold truncate">{batchProgress.word || '—'}</p>
                                    {/* 🆕 V14.80: a retry in progress is not a hang — say so */}
                                    {batchProgress.status && (
                                        <p className="text-amber-400 text-xs mt-1.5 flex items-center gap-2">
                                            <i className="fas fa-spinner fa-spin"></i>{batchProgress.status}
                                        </p>
                                    )}
                                </div>

                                <div className="grid grid-cols-4 gap-2 mb-6 text-center">
                                    <div className="bg-green-500/10 border border-green-500/30 rounded-xl py-2">
                                        <p className="text-[9px] uppercase font-black text-green-500/80">Filled</p>
                                        <p className="text-2xl font-black text-green-400">{batchProgress.filled}</p>
                                    </div>
                                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl py-2" title="Google returned a temporary capacity error after all retries">
                                        <p className="text-[9px] uppercase font-black text-amber-500/80">Busy</p>
                                        <p className="text-2xl font-black text-amber-400">{batchProgress.unavailable || 0}</p>
                                    </div>
                                    <div className="bg-red-500/10 border border-red-500/30 rounded-xl py-2">
                                        <p className="text-[9px] uppercase font-black text-red-500/80">Failed</p>
                                        <p className="text-2xl font-black text-red-400">{batchProgress.failed}</p>
                                    </div>
                                    <div className="bg-slate-700/40 border border-slate-600/40 rounded-xl py-2">
                                        <p className="text-[9px] uppercase font-black text-slate-500">Skipped</p>
                                        <p className="text-2xl font-black text-slate-300">{batchProgress.skipped}</p>
                                    </div>
                                </div>

                                <button
                                    onClick={() => { batchStopRef.current = true; }}
                                    className="w-full bg-red-600/20 border border-red-500/40 text-red-300 hover:bg-red-600/30 py-3 rounded-2xl font-black uppercase text-sm"
                                >
                                    {batchStopRef.current ? 'Stopping after this record…' : '⏹ Stop'}
                                </button>
                                <p className="text-slate-600 text-[10px] text-center mt-2">
                                    Records already filled are saved — stopping never loses work.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* 🆕 V14.78: BATCH FILL SUMMARY */}
                    {batchSummary && (
                        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[210] p-4" onClick={() => setBatchSummary(null)}>
                            <div className="bg-slate-900 rounded-3xl p-7 max-w-lg w-full shadow-2xl border border-white/10" onClick={e => e.stopPropagation()}>
                                <h2 className="text-xl font-black text-white mb-1">
                                    {batchSummary.stoppedBy === 'quota' ? '🚫 Stopped — Gemini quota reached'
                                        : batchSummary.stoppedBy === 'user' ? '⏹ Batch stopped'
                                        : '✅ Batch complete'}
                                </h2>
                                <p className="text-slate-400 text-sm mb-5">
                                    {batchSummary.stoppedBy === 'quota'
                                        ? `Gemini's daily quota ran out mid-batch. ${batchSummary.filled} record${batchSummary.filled === 1 ? '' : 's'} were filled before stopping. Nothing was filled with Groq — batch fill is Gemini-only by design.`
                                        : batchSummary.stoppedBy === 'user'
                                            ? `Stopped at your request after ${batchSummary.attempted} record${batchSummary.attempted === 1 ? '' : 's'}.`
                                            : 'All records in this batch have been processed.'}
                                </p>

                                <div className="grid grid-cols-4 gap-2 mb-4 text-center">
                                    <div className="bg-green-500/10 border border-green-500/30 rounded-xl py-3">
                                        <p className="text-[9px] uppercase font-black text-green-500/80">Filled</p>
                                        <p className="text-3xl font-black text-green-400">{batchSummary.filled}</p>
                                    </div>
                                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl py-3">
                                        <p className="text-[9px] uppercase font-black text-amber-500/80">Busy</p>
                                        <p className="text-3xl font-black text-amber-400">{batchSummary.unavailable || 0}</p>
                                    </div>
                                    <div className="bg-red-500/10 border border-red-500/30 rounded-xl py-3">
                                        <p className="text-[9px] uppercase font-black text-red-500/80">Failed</p>
                                        <p className="text-3xl font-black text-red-400">{batchSummary.failed}</p>
                                    </div>
                                    <div className="bg-slate-700/40 border border-slate-600/40 rounded-xl py-3">
                                        <p className="text-[9px] uppercase font-black text-slate-500">Skipped</p>
                                        <p className="text-3xl font-black text-slate-300">{batchSummary.skipped}</p>
                                    </div>
                                </div>

                                {/* 🆕 V14.80: separate Google capacity problems from genuine errors */}
                                {(batchSummary.unavailable > 0 || batchSummary.failed > 0) && (
                                    <p className="text-slate-400 text-xs mb-4 leading-relaxed">
                                        {batchSummary.unavailable > 0 && (
                                            <>
                                                <span className="text-amber-400 font-bold">{batchSummary.unavailable}</span> could not be processed because
                                                Google's servers were busy (HTTP 503) even after retrying — these are temporary and usually succeed later.{' '}
                                            </>
                                        )}
                                        {batchSummary.failed > 0 && (
                                            <>
                                                <span className="text-red-400 font-bold">{batchSummary.failed}</span> hit a real error and need attention.
                                            </>
                                        )}
                                    </p>
                                )}

                                {/* 🆕 V14.79: why each record failed — "Failed: 4" alone is not actionable */}
                                {batchSummary.failures?.length > 0 && (
                                    <div className="mb-5">
                                        <p className="text-[10px] uppercase font-black text-red-400/80 mb-2">Why they failed</p>
                                        <div className="max-h-48 overflow-y-auto custom-scroll space-y-1.5">
                                            {batchSummary.failures.map((f, i) => (
                                                <div key={i} className={`rounded-lg px-3 py-2 text-xs border ${
                                                    f.kind === 'unavailable'
                                                        ? 'bg-amber-900/15 border-amber-500/25'
                                                        : 'bg-red-900/15 border-red-500/25'
                                                }`}>
                                                    <span className="text-indigo-300 font-bold">{f.word}</span>
                                                    <span className="text-slate-500 mx-1.5">—</span>
                                                    <span className={f.kind === 'unavailable' ? 'text-amber-300' : 'text-red-300'}>{f.reason}</span>
                                                    {f.detail && <span className="text-slate-500 block mt-0.5">{f.detail}</span>}
                                                </div>
                                            ))}
                                        </div>
                                        <p className="text-slate-600 text-[10px] mt-2">Full details, including the raw responses, are in the browser console.</p>
                                    </div>
                                )}

                                <div className="flex items-center justify-between bg-slate-800/60 border border-slate-700/60 rounded-xl p-3 mb-5 text-sm">
                                    <span className="text-slate-400">Still pending in this filter</span>
                                    <span className="text-white font-black">{batchPendingTotal.toLocaleString()}</span>
                                </div>
                                {/* 🆕 V14.82: report the counter for the model this batch actually used */}
                                <p className="text-slate-500 text-xs mb-5">
                                    {batchSummary.model === 'groq'
                                        ? `⚡ ${aiDailyCounts.groq.toLocaleString()} Groq calls today.`
                                        : `✨ ${aiDailyCounts.gemini.toLocaleString()} Gemini calls today (quota is limited).`}
                                </p>

                                <div className="flex gap-3">
                                    {/* 🆕 V14.80: re-run only the records that did not succeed */}
                                    {batchSummary.failures?.length > 0 && batchSummary.stoppedBy !== 'quota' && (
                                        <button
                                            onClick={() => {
                                                const retryRecords = batchSummary.failures.map(f => f.record).filter(Boolean);
                                                const { model, overwrite } = batchSummary;
                                                setBatchSummary(null);
                                                runBatchFill(retryRecords, model, overwrite);
                                            }}
                                            className="flex-1 bg-amber-600/20 border border-amber-500/40 text-amber-300 hover:bg-amber-600/30 py-3 rounded-2xl font-black uppercase text-sm"
                                        >
                                            ↻ Retry {batchSummary.failures.length}
                                        </button>
                                    )}
                                    <button
                                        onClick={() => setBatchSummary(null)}
                                        className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-2xl font-black uppercase text-sm"
                                    >Close</button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 🆕 V14.73: AI PROVIDER STATUS MODAL */}
                    {showGeminiInfo && (
                        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[200] p-3 sm:p-6 overflow-y-auto" onClick={() => setShowGeminiInfo(false)}>
                            <div className="bg-slate-900 rounded-2xl sm:rounded-3xl p-5 sm:p-7 max-w-2xl w-full max-h-[92vh] overflow-y-auto shadow-2xl border border-white/10 my-4" onClick={e => e.stopPropagation()}>

                                <div className="flex justify-between items-start gap-3 mb-5">
                                    <h2 className="text-xl sm:text-2xl font-black text-white">AI provider status</h2>
                                    <button onClick={() => setShowGeminiInfo(false)} className="text-slate-400 hover:text-white text-2xl sm:text-3xl leading-none">&times;</button>
                                </div>

                                {/* Current state, in a full sentence */}
                                <div className={`rounded-2xl p-4 mb-5 border ${
                                    geminiQuota.exhausted
                                        ? 'bg-orange-500/10 border-orange-400/40'
                                        : 'bg-green-500/10 border-green-400/40'
                                }`}>
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className={`font-black rounded-full border px-2.5 py-1 text-xs whitespace-nowrap ${
                                            geminiQuota.exhausted
                                                ? 'bg-orange-500/20 text-orange-300 border-orange-400/50'
                                                : 'bg-green-500/20 text-green-300 border-green-400/50'
                                        }`}>{geminiQuota.exhausted ? '⚡ Groq' : '✨ Gemini'}</span>
                                        <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Right now</span>
                                    </div>
                                    <p className={`text-sm leading-relaxed ${geminiQuota.exhausted ? 'text-orange-100' : 'text-green-100'}`}>
                                        {geminiQuota.exhausted
                                            ? "Gemini's free daily quota is used up, so Groq is handling the features listed below instead. Everything keeps working exactly as normal — the only difference is which AI answers."
                                            : 'Gemini is handling the features listed below. If it ever becomes unavailable, Groq takes over automatically and nothing stops working.'}
                                    </p>
                                    {geminiQuota.exhausted && (
                                        <p className="text-orange-200/80 text-xs mt-3 leading-relaxed">
                                            Gemini should be back in about {Math.max(1, Math.round(msUntilPacificMidnight() / 3600000))} hour{Math.max(1, Math.round(msUntilPacificMidnight() / 3600000)) === 1 ? '' : 's'} — around {new Date(Date.now() + msUntilPacificMidnight()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} your time.
                                        </p>
                                    )}
                                </div>

                                {/* How the fallback works */}
                                <div className="mb-5">
                                    <h3 className="text-white font-black text-sm uppercase tracking-wider mb-2">How this works</h3>
                                    <p className="text-slate-300 text-sm leading-relaxed">
                                        Gemini allows a limited number of free requests per day. While those last, it handles the
                                        features below. When they run out, the app switches to Groq automatically — there is no
                                        interruption, nothing to click, and no work is lost. The quota resets every 24 hours at
                                        midnight US Pacific time, and Gemini resumes on its own from the next request onwards.
                                    </p>
                                </div>

                                {/* Feature split */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4">
                                        <h3 className="text-green-300 font-black text-xs uppercase tracking-wider mb-1">✨ Uses Gemini</h3>
                                        <p className="text-slate-500 text-[11px] mb-3">falls back to Groq when the quota runs out</p>
                                        <ul className="text-slate-300 text-sm space-y-1.5">
                                            {['Magic Fill', 'AI Improve', 'Writing feedback', 'Dictation feedback', 'Guesswork validation', 'Translation validation', 'Selection explanations'].map(f => (
                                                <li key={f} className="flex gap-2"><span className="text-green-400">•</span>{f}</li>
                                            ))}
                                        </ul>
                                    </div>

                                    <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4">
                                        <h3 className="text-orange-300 font-black text-xs uppercase tracking-wider mb-1">⚡ Always uses Groq</h3>
                                        <p className="text-slate-500 text-[11px] mb-3">never changes, whatever the badge says</p>
                                        <ul className="text-slate-300 text-sm space-y-1.5">
                                            {['Talk to me', 'All audio / TTS', 'AI search', 'Spell check', 'Guesswork hints', 'Selection options', 'Usage frequency badge', 'Find & Merge'].map(f => (
                                                <li key={f} className="flex gap-2"><span className="text-orange-400">•</span>{f}</li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>

                                <p className="text-slate-500 text-xs mt-5 leading-relaxed">
                                    The right-hand list never switches provider — those features always run on Groq regardless of
                                    whether the badge shows Gemini or Groq.
                                </p>

                            </div>
                        </div>
                    )}

                    {/* 🔍 IMPROVE MODAL */}
                    {showImproveModal && improveData && (
                        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[150] p-2 sm:p-6 overflow-y-auto" onClick={() => setShowImproveModal(false)}>
                            <div className="bg-slate-900 rounded-2xl sm:rounded-3xl p-4 sm:p-8 max-w-6xl w-full max-h-[95vh] overflow-y-auto shadow-2xl border border-white/10 my-2" onClick={e => e.stopPropagation()}>
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 sm:mb-6">
                                    <div className="flex items-center gap-2 sm:gap-3">
                                        <h2 className="text-xl sm:text-3xl font-black text-white">🔄 AI Improve</h2>
                                        <button 
                                            onClick={() => alert('ℹ️ AI IMPROVE:\n\n🔴 RED: Current data\n🟢 GREEN: AI suggestions\n\n📱 MOBILE: Tap items to move\n🖥️ DESKTOP: Drag between panels\n\n• Move SYNONYMS between panels\n• Move CONTEXT between panels\n• Select LEVEL and FAMILY\n\nFinal result = GREEN panel items')}
                                            className="text-blue-400 hover:text-blue-300 text-lg sm:text-xl flex-shrink-0"
                                            title="How to use"
                                        >
                                            ℹ️
                                        </button>
                                    </div>
                                    <button onClick={() => setShowImproveModal(false)} className="text-slate-400 hover:text-white text-2xl sm:text-3xl self-end sm:self-auto">&times;</button>
                                </div>

                                <div className="bg-indigo-900/20 border border-indigo-500/50 rounded-xl p-2 sm:p-3 mb-3 sm:mb-4 text-center">
                                    <p className="text-indigo-300 text-xs sm:text-sm"><strong>Word:</strong> {improveData.vocabulary}</p>
                                    {usageInfo && (
                                        <div className="flex items-center justify-center gap-2 flex-wrap mt-1.5">
                                            <span className="text-slate-500 uppercase font-black text-[9px]">Usage:</span>
                                            <span className={`font-bold px-2 py-0.5 rounded-full text-[10px] ${
                                                /very common|common/.test(usageInfo.usage) && !/uncommon/.test(usageInfo.usage) ? 'bg-green-500/20 text-green-400' :
                                                /uncommon|formal|literary/.test(usageInfo.usage) ? 'bg-yellow-500/20 text-yellow-400' :
                                                /rare/.test(usageInfo.usage) ? 'bg-red-500/20 text-red-400' :
                                                'bg-slate-600/30 text-slate-300'
                                            }`}>{usageInfo.usage || 'unknown'}</span>
                                            {usageInfo.alternative && usageInfo.alternative.trim() && (
                                                <>
                                                    <span className="text-slate-600">|</span>
                                                    <span className="text-slate-500 text-[9px]">More common:</span>
                                                    <span className="text-blue-400 font-bold text-xs">{usageInfo.alternative}</span>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>
                                
                                {/* 🆕 V11.21: Responsive grid - vertical on mobile, horizontal on desktop */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-4 sm:mb-6">
                                    {/* LEFT PANEL - RED - CURRENT DATA */}
                                    <div className="bg-red-900/20 border-2 border-red-500 rounded-2xl p-6">
                                        {/* 🆕 V14.72: header block mirrors the right panel exactly (same rule,
                                            same min-height) so FAMILY / SYNONYMS / CONTEXT line up across both */}
                                        <div className="flex items-center justify-center gap-3 flex-wrap mb-4 pb-3 border-b border-red-500/30 min-h-[3rem]">
                                            <h3 className="text-red-300 font-bold text-center text-lg">🔴 CURRENT DATA</h3>
                                        </div>

                                        <div className="mb-6">
                                            <div className="text-xs font-bold uppercase text-red-400 mb-2">Family</div>
                                            <label className="flex items-center bg-red-950/50 border border-red-500/50 rounded-lg p-3 cursor-pointer hover:bg-red-950/70">
                                                <input 
                                                    type="radio" 
                                                    name="improve_family"
                                                    checked={(improveData.selections?.family || 'improved') === 'current'}
                                                    onChange={() => setImproveData({...improveData, selections: {...(improveData.selections || {}), family: 'current'}})}
                                                    className="mr-3 w-5 h-5"
                                                />
                                                <span className="text-red-200">{improveData.current.family || '—'}</span>
                                            </label>
                                        </div>

                                        <div className="mb-6">
                                            <div className="text-xs font-bold uppercase text-red-400 mb-2">Synonyms (📱 Tap | 🖥️ Drag to AI panel →)</div>
                                            <div className="bg-red-950/30 border border-red-500/30 rounded-lg p-3 min-h-[100px]"
                                                onDragOver={(e) => e.preventDefault()}
                                                onDrop={(e) => {
                                                    e.preventDefault();
                                                    const synonym = e.dataTransfer.getData('synonym');
                                                    const source = e.dataTransfer.getData('improveSynSource');
                                                    if (source === 'improved') {
                                                        const currentSyns = improveData.selections?.currentSynonyms || [];
                                                        const improvedSyns = (improveData.selections?.improvedSynonyms || []).filter(s => s !== synonym);
                                                        setImproveData({
                                                            ...improveData, 
                                                            selections: {
                                                                ...(improveData.selections || {}),
                                                                currentSynonyms: [...currentSyns, synonym],
                                                                improvedSynonyms: improvedSyns
                                                            }
                                                        });
                                                    }
                                                }}
                                            >
                                                {(improveData.selections?.currentSynonyms || []).map((syn, i) => (
                                                    <div
                                                        key={i}
                                                        draggable
                                                        onDragStart={(e) => {
                                                            e.dataTransfer.setData('synonym', syn);
                                                            e.dataTransfer.setData('improveSynSource', 'current');
                                                        }}
                                                        className="bg-red-700/50 hover:bg-red-700/70 text-red-100 px-3 sm:px-4 py-2 sm:py-3 rounded-lg mb-2 cursor-move inline-block mr-2 text-sm sm:text-base touch-manipulation select-none active:scale-95 active:opacity-70 transition-transform"
                                                        onClick={() => {
                                                            // 📱 MOBILE: Tap to move between panels (drag&drop not supported on touch devices) to green panel (mobile-friendly)
                                                            const currentSyns = (improveData.selections?.currentSynonyms || []).filter(s => s !== syn);
                                                            const improvedSyns = improveData.selections?.improvedSynonyms || [];
                                                            setImproveData({
                                                                ...improveData, 
                                                                selections: {
                                                                    ...(improveData.selections || {}),
                                                                    currentSynonyms: currentSyns,
                                                                    improvedSynonyms: [...improvedSyns, syn]
                                                                }
                                                            });
                                                        }}
                                                    >
                                                        {syn}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div>
                                            <div className="text-xs font-bold uppercase text-red-400 mb-2">Context (📱 Tap | 🖥️ Drag to AI panel →)</div>
                                            <div 
                                                className="bg-red-950/30 border border-red-500/30 rounded-lg p-3 min-h-[80px]"
                                                onDragOver={(e) => e.preventDefault()}
                                                onDrop={(e) => {
                                                    e.preventDefault();
                                                    const context = e.dataTransfer.getData('improveContext');
                                                    const source = e.dataTransfer.getData('improveContextSource');
                                                    if (source === 'improved') {
                                                        setImproveData({
                                                            ...improveData, 
                                                            selections: {
                                                                ...(improveData.selections || {}),
                                                                currentContext: [context],
                                                                improvedContext: []
                                                            }
                                                        });
                                                    }
                                                }}
                                            >
                                                {(improveData.selections?.currentContext || []).map((ctx, i) => (
                                                    <div
                                                        key={i}
                                                        draggable
                                                        onDragStart={(e) => {
                                                            e.dataTransfer.setData('improveContext', ctx);
                                                            e.dataTransfer.setData('improveContextSource', 'current');
                                                        }}
                                                        onClick={() => {
                                                            // 📱 MOBILE: Tap to move to green panel
                                                            setImproveData({
                                                                ...improveData,
                                                                selections: {
                                                                    ...(improveData.selections || {}),
                                                                    currentContext: [],
                                                                    improvedContext: [ctx]
                                                                }
                                                            });
                                                        }}
                                                        className="bg-red-700/50 hover:bg-red-700/70 text-red-100 px-3 py-2 rounded-lg cursor-pointer text-sm touch-manipulation select-none active:scale-95 active:opacity-70 transition-transform"
                                                    >
                                                        {ctx}
                                                    </div>
                                                ))}
                                                {(improveData.selections?.currentContext || []).length === 0 && improveData.current.context && (
                                                    <div
                                                        draggable
                                                        onDragStart={(e) => {
                                                            e.dataTransfer.setData('improveContext', improveData.current.context);
                                                            e.dataTransfer.setData('improveContextSource', 'current');
                                                        }}
                                                        onClick={() => {
                                                            // 📱 MOBILE: Tap original context to move to green panel (keep it)
                                                            setImproveData({
                                                                ...improveData,
                                                                selections: {
                                                                    ...(improveData.selections || {}),
                                                                    currentContext: [],
                                                                    improvedContext: [improveData.current.context]
                                                                }
                                                            });
                                                        }}
                                                        className="bg-red-700/50 hover:bg-red-700/70 text-red-100 px-3 py-2 rounded-lg cursor-pointer text-sm touch-manipulation select-none active:scale-95 active:opacity-70 transition-transform"
                                                    >
                                                        {improveData.current.context}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* RIGHT PANEL - GREEN - AI SUGGESTIONS */}
                                    <div className="bg-green-900/20 border-2 border-green-500 rounded-2xl p-6">
                                        {/* 🆕 V14.68: header row — title and source-model chip share one line
                                            (wrapping to a second line only when too narrow), separated from the
                                            fields below by a rule so the chip never reads as part of Family
                                            🆕 V14.72: min-height matches the left panel so the chip cannot push
                                            this panel's fields out of alignment with the ones opposite */}
                                        <div className="flex items-center justify-center gap-3 flex-wrap mb-4 pb-3 border-b border-green-500/30 min-h-[3rem]">
                                            <h3 className="text-green-300 font-bold text-center text-lg">🟢 AI SUGGESTIONS</h3>
                                            <ModelBadge model={improveData.model} prominent />
                                        </div>

                                        <div className="mb-6">
                                            <div className="text-xs font-bold uppercase text-green-400 mb-2">Family</div>
                                            <label className="flex items-center bg-green-950/50 border border-green-500/50 rounded-lg p-3 cursor-pointer hover:bg-green-950/70">
                                                <input 
                                                    type="radio" 
                                                    name="improve_family"
                                                    checked={(improveData.selections?.family || 'improved') === 'improved'}
                                                    onChange={() => setImproveData({...improveData, selections: {...(improveData.selections || {}), family: 'improved'}})}
                                                    className="mr-3 w-5 h-5"
                                                />
                                                <span className="text-green-200">{improveData.improved.family || '—'}</span>
                                            </label>
                                        </div>

                                        <div className="mb-6">
                                            <div className="text-xs font-bold uppercase text-green-400 mb-2">← Synonyms (📱 Tap | 🖥️ Drag to current panel)</div>
                                            <div className="bg-green-950/30 border border-green-500/30 rounded-lg p-3 min-h-[100px]"
                                                onDragOver={(e) => e.preventDefault()}
                                                onDrop={(e) => {
                                                    e.preventDefault();
                                                    const synonym = e.dataTransfer.getData('synonym');
                                                    const source = e.dataTransfer.getData('improveSynSource');
                                                    if (source === 'current') {
                                                        const currentSyns = (improveData.selections?.currentSynonyms || []).filter(s => s !== synonym);
                                                        const improvedSyns = improveData.selections?.improvedSynonyms || [];
                                                        setImproveData({
                                                            ...improveData, 
                                                            selections: {
                                                                ...(improveData.selections || {}),
                                                                currentSynonyms: currentSyns,
                                                                improvedSynonyms: [...improvedSyns, synonym]
                                                            }
                                                        });
                                                    }
                                                }}
                                            >
                                                {(improveData.selections?.improvedSynonyms || []).map((syn, i) => (
                                                    <div
                                                        key={i}
                                                        draggable
                                                        onDragStart={(e) => {
                                                            e.dataTransfer.setData('synonym', syn);
                                                            e.dataTransfer.setData('improveSynSource', 'improved');
                                                        }}
                                                        className="bg-green-700/50 hover:bg-green-700/70 text-green-100 px-3 sm:px-4 py-2 sm:py-3 rounded-lg mb-2 cursor-move inline-block mr-2 text-sm sm:text-base touch-manipulation select-none active:scale-95 active:opacity-70 transition-transform"
                                                        onClick={() => {
                                                            // 🆕 V11.21: Tap to move to red panel (mobile-friendly)
                                                            const improvedSyns = (improveData.selections?.improvedSynonyms || []).filter(s => s !== syn);
                                                            const currentSyns = improveData.selections?.currentSynonyms || [];
                                                            setImproveData({
                                                                ...improveData, 
                                                                selections: {
                                                                    ...(improveData.selections || {}),
                                                                    improvedSynonyms: improvedSyns,
                                                                    currentSynonyms: [...currentSyns, syn]
                                                                }
                                                            });
                                                        }}
                                                    >
                                                        {syn}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div>
                                            <div className="text-xs font-bold uppercase text-green-400 mb-2">← Context (📱 Tap | 🖥️ Drag to current panel)</div>
                                            <div 
                                                className="bg-green-950/30 border border-green-500/30 rounded-lg p-3 min-h-[80px]"
                                                onDragOver={(e) => e.preventDefault()}
                                                onDrop={(e) => {
                                                    e.preventDefault();
                                                    const context = e.dataTransfer.getData('improveContext');
                                                    const source = e.dataTransfer.getData('improveContextSource');
                                                    if (source === 'current') {
                                                        setImproveData({
                                                            ...improveData, 
                                                            selections: {
                                                                ...(improveData.selections || {}),
                                                                currentContext: [],
                                                                improvedContext: [context]
                                                            }
                                                        });
                                                    }
                                                }}
                                            >
                                                {(improveData.selections?.improvedContext || []).map((ctx, i) => (
                                                    <div
                                                        key={i}
                                                        draggable
                                                        onDragStart={(e) => {
                                                            e.dataTransfer.setData('improveContext', ctx);
                                                            e.dataTransfer.setData('improveContextSource', 'improved');
                                                        }}
                                                        onClick={() => {
                                                            // 📱 MOBILE: Tap to move back to red panel
                                                            setImproveData({
                                                                ...improveData,
                                                                selections: {
                                                                    ...(improveData.selections || {}),
                                                                    currentContext: [ctx],
                                                                    improvedContext: []
                                                                }
                                                            });
                                                        }}
                                                        className="bg-green-700/50 hover:bg-green-700/70 text-green-100 px-3 py-2 rounded-lg cursor-pointer text-sm touch-manipulation select-none active:scale-95 active:opacity-70 transition-transform"
                                                    >
                                                        {ctx}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex gap-4 mt-6">
                                    <button 
                                        onClick={async () => {
                                            const selections = improveData.selections || {};
                                            
                                            const finalSynonyms = (selections.improvedSynonyms || 
                                                (improveData.improved.synonyms || '').split(',').map(s => s.trim()).filter(s => s)
                                            ).join(', ');
                                            
                                            const finalContext = (selections.improvedContext && selections.improvedContext.length > 0) 
                                                ? selections.improvedContext[0] 
                                                : improveData.improved.context;
                                            
                                            const updateData = {
                                                family: (selections.family || 'improved') === 'improved' ? improveData.improved.family : improveData.current.family,
                                                synonyms: finalSynonyms,
                                                context: finalContext
                                            };
                                            
                                            // 🆕 V11.22: Save previous version for change history
                                            const updateDataWithHistory = {
                                                ...updateData,
                                                ai_source: (improveData.model || '').toLowerCase() || null, // 🆕 V14.81
                                                previous_version: JSON.stringify({
                                                    vocabulary: improveData.vocabulary,
                                                    synonyms: improveData.current.synonyms,
                                                    context: improveData.current.context,
                                                    family: improveData.current.family,
                                                    favourite: improveData.current.favourite || false
                                                }),
                                                modified_at: new Date().toISOString()
                                            };
                                            
                                            await supabase.from('vocabulary_v4').update(updateDataWithHistory).eq('id', improveData.wordId);
                                            
                                            // 🆕 V11.20: Update all active contexts without refreshing
                                            const updatedWord = { 
                                                ...(words.find(w => w.id === improveData.wordId) || 
                                                    flashcardWords.find(w => w.id === improveData.wordId) ||
                                                    dictationWords.find(w => w.id === improveData.wordId) ||
                                                    selectionWords.find(w => w.id === improveData.wordId) ||
                                                    guessworkWords.find(w => w.id === improveData.wordId)),
                                                ...updateData
                                            };
                                            
                                            if (showFlashcards) {
                                                const newFlashcards = [...flashcardWords];
                                                newFlashcards[flashcardIndex] = updatedWord;
                                                setFlashcardWords(newFlashcards);
                                            }
                                            if (showDictation) {
                                                const newDictation = [...dictationWords];
                                                newDictation[dictationIndex] = updatedWord;
                                                setDictationWords(newDictation);
                                            }
                                            if (showSelection) {
                                                const newSelection = [...selectionWords];
                                                newSelection[selectionIndex] = updatedWord;
                                                setSelectionWords(newSelection);
                                            }
                                            if (showGuesswork) {
                                                const newGuesswork = [...guessworkWords];
                                                newGuesswork[guessworkIndex] = updatedWord;
                                                setGuessworkWords(newGuesswork);
                                            }
                                            
                                            // Update main table if not in exercise
                                            if (!showFlashcards && !showDictation && !showSelection && !showGuesswork) {
                                                setWords(prevWords => 
                                                    prevWords.map(w => w.id === improveData.wordId ? updatedWord : w)
                                                );
                                            }
                                            
                                            setShowImproveModal(false);
                                            setImproveData(null);
                                        }}
                                        className="flex-1 bg-green-600 hover:bg-green-500 text-white py-4 rounded-2xl font-black uppercase text-sm"
                                    >
                                        ✅ Apply Green Panel
                                    </button>
                                    <button 
                                        onClick={() => setShowImproveModal(false)}
                                        className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-4 rounded-2xl font-black uppercase text-sm"
                                    >
                                        ❌ Cancel
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 🔀 MERGE SIMILAR MODAL (keeping same as V11.1) */}
                    {showMergeModal && mergeData && (
                        !selectedSimilar ? (
                            <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-6" onClick={() => {setShowMergeModal(false); setMergeData(null);}}>
                                <div className="bg-slate-900 rounded-3xl p-8 max-w-4xl w-full shadow-2xl border border-white/10" onClick={e => e.stopPropagation()}>
                                    <div className="flex justify-between items-center mb-6">
                                        <div>
                                            <h2 className="text-3xl font-black text-white"><i className="fas fa-link text-indigo-400"></i> Find & Merge Similar</h2>
                                            {mergeData?.current && <p className="text-lg mt-1">Searching for: <span className="text-indigo-400 font-black text-xl">"{mergeData.current.vocabulary}"</span></p>}
                                        </div>
                                        <button onClick={() => {setShowMergeModal(false); setMergeData(null);}} className="text-slate-400 hover:text-white text-3xl">&times;</button>
                                    </div>
                                    <p className="text-slate-400 mb-4">{findingSimilar ? '🔄 Searching...' : `Found ${mergeData?.similar?.length || 0} similar words. Select one to merge:`}</p>
                                    <div className="space-y-3 max-h-96 overflow-y-auto">
                                        {mergeData?.similar?.map(word => (
                                            <button
                                                key={word.id}
                                                onClick={() => {
                                                    setSelectedSimilar(word);
                                                    const currentSyns = (mergeData.current.synonyms || '').split(',').map(s => s.trim()).filter(s => s);
                                                    const similarSyns = (word.synonyms || '').split(',').map(s => s.trim()).filter(s => s);
                                                    setFieldSelections({
                                                        vocabulary: 'current',
                                                        synonyms: 'current',
                                                        context: 'current',
                                                        level: 'current',
                                                        family: 'current',
                                                        keepSynonyms: currentSyns,
                                                        deleteSynonyms: similarSyns
                                                    });
                                                }}
                                                className="w-full text-left bg-slate-800/50 hover:bg-slate-700/50 border border-orange-500/30 rounded-2xl p-4 transition"
                                            >
                                                <p className="text-white font-bold mb-1">{word.vocabulary}</p>
                                                <p className="text-slate-400 text-xs">Family: {word.family || '—'}</p>
                                                <p className="text-slate-500 text-xs mt-1">Synonyms: {word.synonyms || '—'}</p>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-6" onClick={() => {setShowMergeModal(false); setMergeData(null); setSelectedSimilar(null);}}>
                                <div className="bg-slate-900 rounded-3xl p-8 max-w-6xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-white/10" onClick={e => e.stopPropagation()}>
                                    <div className="flex justify-between items-center mb-6">
                                        <div>
                                            <h2 className="text-3xl font-black text-white"><i className="fas fa-link text-indigo-400"></i> Drag & Drop Merge</h2>
                                            <p className="text-slate-400 text-sm mt-1">📱 MOBILE: Tap items to move | 🖥️ DESKTOP: Drag items | RED = Delete | GREEN = Keep</p>
                                        </div>
                                        <button onClick={() => {setShowMergeModal(false); setMergeData(null); setSelectedSimilar(null);}} className="text-slate-400 hover:text-white text-3xl">&times;</button>
                                    </div>

                                    <div className="grid grid-cols-2 gap-6 mb-6">
                                        <div className="bg-red-900/20 border-2 border-red-500 rounded-2xl p-6">
                                            <h3 className="text-red-300 font-bold mb-4 text-center text-lg">🔴 TO DELETE</h3>
                                            
                                            <div className="mb-6">
                                                <div className="text-xs font-bold uppercase text-red-400 mb-2">Vocabulary (will be deleted)</div>
                                                <div className="bg-red-950/50 border border-red-500/50 rounded-lg p-3">
                                                    <span className="text-red-200 font-bold text-lg">{selectedSimilar.vocabulary}</span>
                                                </div>
                                            </div>


                                            <div className="mb-6">
                                                <div className="text-xs font-bold uppercase text-red-400 mb-2">Family</div>
                                                <label className="flex items-center bg-red-950/50 border border-red-500/50 rounded-lg p-3 cursor-pointer hover:bg-red-950/70">
                                                    <input 
                                                        type="radio" 
                                                        name="family"
                                                        checked={fieldSelections.family === 'similar'}
                                                        onChange={() => setFieldSelections({...fieldSelections, family: 'similar'})}
                                                        className="mr-3 w-5 h-5"
                                                    />
                                                    <span className="text-red-200">{selectedSimilar.family || '—'}</span>
                                                </label>
                                            </div>

                                            <div className="mb-6">
                                                <div className="text-xs font-bold uppercase text-red-400 mb-2">Synonyms (drag to keep →)</div>
                                                <div className="bg-red-950/30 border border-red-500/30 rounded-lg p-3 min-h-[100px]"
                                                    onDragOver={(e) => e.preventDefault()}
                                                    onDrop={(e) => {
                                                        e.preventDefault();
                                                        const synonym = e.dataTransfer.getData('synonym');
                                                        const source = e.dataTransfer.getData('source');
                                                        if (source === 'keep') {
                                                            setFieldSelections(prev => ({
                                                                ...prev,
                                                                keepSynonyms: (prev.keepSynonyms || []).filter(s => s !== synonym),
                                                                deleteSynonyms: [...(prev.deleteSynonyms || []), synonym]
                                                            }));
                                                        }
                                                    }}
                                                >
                                                    {(fieldSelections.deleteSynonyms || (selectedSimilar.synonyms || '').split(',').map(s => s.trim()).filter(s => s)).map((syn, i) => (
                                                        <div
                                                            key={i}
                                                            draggable
                                                            onDragStart={(e) => {
                                                                e.dataTransfer.setData('synonym', syn);
                                                                e.dataTransfer.setData('source', 'delete');
                                                            }}
                                                            className="bg-red-700/50 hover:bg-red-700/70 text-red-100 px-3 py-2 rounded-lg mb-2 cursor-move inline-block mr-2"
                                                        >
                                                            {syn}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            <div>
                                                <div className="text-xs font-bold uppercase text-red-400 mb-2">Context (drag to keep →)</div>
                                                <div 
                                                    className="bg-red-950/30 border border-red-500/30 rounded-lg p-3 min-h-[80px]"
                                                    onDragOver={(e) => e.preventDefault()}
                                                    onDrop={(e) => {
                                                        e.preventDefault();
                                                        const source = e.dataTransfer.getData('contextSource');
                                                        if (source === 'keep') {
                                                            setFieldSelections(prev => ({...prev, context: 'similar'}));
                                                        }
                                                    }}
                                                >
                                                    {fieldSelections.context === 'similar' && (
                                                        <div
                                                            draggable
                                                            onDragStart={(e) => {
                                                                e.dataTransfer.setData('contextSource', 'delete');
                                                            }}
                                                            className="bg-red-700/50 hover:bg-red-700/70 text-red-100 px-3 py-2 rounded-lg cursor-move text-sm"
                                                        >
                                                            {selectedSimilar.context || '—'}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="bg-green-900/20 border-2 border-green-500 rounded-2xl p-6">
                                            <h3 className="text-green-300 font-bold mb-4 text-center text-lg">🟢 TO KEEP</h3>
                                            
                                            <div className="mb-6">
                                                <div className="text-xs font-bold uppercase text-green-400 mb-2">Vocabulary (will be kept)</div>
                                                <div className="bg-green-950/50 border border-green-500/50 rounded-lg p-3">
                                                    <span className="text-green-200 font-bold text-lg">{mergeData.current.vocabulary}</span>
                                                </div>
                                            </div>


                                            <div className="mb-6">
                                                <div className="text-xs font-bold uppercase text-green-400 mb-2">Family</div>
                                                <label className="flex items-center bg-green-950/50 border border-green-500/50 rounded-lg p-3 cursor-pointer hover:bg-green-950/70">
                                                    <input 
                                                        type="radio" 
                                                        name="family"
                                                        checked={fieldSelections.family === 'current'}
                                                        onChange={() => setFieldSelections({...fieldSelections, family: 'current'})}
                                                        className="mr-3 w-5 h-5"
                                                    />
                                                    <span className="text-green-200">{mergeData.current.family || '—'}</span>
                                                </label>
                                            </div>

                                            <div className="mb-6">
                                                <div className="text-xs font-bold uppercase text-green-400 mb-2">← Synonyms (drag to delete)</div>
                                                <div className="bg-green-950/30 border border-green-500/30 rounded-lg p-3 min-h-[100px]"
                                                    onDragOver={(e) => e.preventDefault()}
                                                    onDrop={(e) => {
                                                        e.preventDefault();
                                                        const synonym = e.dataTransfer.getData('synonym');
                                                        const source = e.dataTransfer.getData('source');
                                                        if (source === 'delete') {
                                                            setFieldSelections(prev => ({
                                                                ...prev,
                                                                deleteSynonyms: (prev.deleteSynonyms || []).filter(s => s !== synonym),
                                                                keepSynonyms: [...(prev.keepSynonyms || []), synonym]
                                                            }));
                                                        }
                                                    }}
                                                >
                                                    {(fieldSelections.keepSynonyms || (mergeData.current.synonyms || '').split(',').map(s => s.trim()).filter(s => s)).map((syn, i) => (
                                                        <div
                                                            key={i}
                                                            draggable
                                                            onDragStart={(e) => {
                                                                e.dataTransfer.setData('synonym', syn);
                                                                e.dataTransfer.setData('source', 'keep');
                                                            }}
                                                            className="bg-green-700/50 hover:bg-green-700/70 text-green-100 px-3 py-2 rounded-lg mb-2 cursor-move inline-block mr-2"
                                                        >
                                                            {syn}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            <div>
                                                <div className="text-xs font-bold uppercase text-green-400 mb-2">← Context (drag to delete)</div>
                                                <div 
                                                    className="bg-green-950/30 border border-green-500/30 rounded-lg p-3 min-h-[80px]"
                                                    onDragOver={(e) => e.preventDefault()}
                                                    onDrop={(e) => {
                                                        e.preventDefault();
                                                        const source = e.dataTransfer.getData('contextSource');
                                                        if (source === 'delete') {
                                                            setFieldSelections(prev => ({...prev, context: 'current'}));
                                                        }
                                                    }}
                                                >
                                                    {fieldSelections.context === 'current' && (
                                                        <div
                                                            draggable
                                                            onDragStart={(e) => {
                                                                e.dataTransfer.setData('contextSource', 'keep');
                                                            }}
                                                            className="bg-green-700/50 hover:bg-green-700/70 text-green-100 px-3 py-2 rounded-lg cursor-move text-sm"
                                                        >
                                                            {mergeData.current.context || '—'}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex gap-4 mt-6">
                                        <button 
                                            onClick={() => {
                                                const finalSynonyms = [...(fieldSelections.keepSynonyms || [])].join(', ');
                                                const mergedFields = {
                                                    ...fieldSelections,
                                                    synonyms: 'merged',
                                                    finalSynonyms
                                                };
                                                handleMergeWords(mergedFields, selectedSimilar);
                                                setSelectedSimilar(null);
                                            }}
                                            className="flex-1 bg-orange-600 hover:bg-orange-500 text-white py-4 rounded-2xl font-black uppercase text-sm"
                                        >
                                            🔀 Merge & Delete Red Panel
                                        </button>
                                        <button 
                                            onClick={() => {setShowMergeModal(false); setMergeData(null); setSelectedSimilar(null);}}
                                            className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-4 rounded-2xl font-black uppercase text-sm"
                                        >
                                            ❌ Cancel
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )
                    )}

                    {/* 🆕 V11.2: RECYCLE BIN MODAL */}
                    {showRecycleBin && (
                        <div className="fixed inset-0 bg-black/95 z-[100] flex items-center justify-center p-4 backdrop-blur-md">
                            <div className="glass-card p-10 rounded-[2.5rem] w-full max-w-4xl border-red-500/30 max-h-[80vh] flex flex-col">
                                <div className="flex justify-between items-center mb-6">
                                    <h2 className="text-2xl font-black main-gradient uppercase text-center italic">🗑️ Recycle Bin (48h)</h2>
                                    <button onClick={() => setShowRecycleBin(false)} className="text-slate-400 hover:text-white text-3xl">&times;</button>
                                </div>
                                
                                <p className="text-slate-400 mb-4">
                                    {deletedWords.length} deleted word(s) - Auto-delete after 48h
                                </p>
                                
                                <div className="flex-1 overflow-y-auto custom-scroll mb-6 space-y-2">
                                    {deletedWords.length === 0 ? (
                                        <div className="text-center text-slate-500 py-12">
                                            <i className="fas fa-trash text-6xl mb-4 opacity-20"></i>
                                            <p>Recycle bin is empty</p>
                                        </div>
                                    ) : (
                                        deletedWords.map(word => (
                                            <label key={word.id} className="flex items-start gap-4 bg-slate-800/50 hover:bg-slate-800 p-4 rounded-xl cursor-pointer transition-colors">
                                                <input 
                                                    type="checkbox"
                                                    checked={selectedForRestore.includes(word.id)}
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            setSelectedForRestore([...selectedForRestore, word.id]);
                                                        } else {
                                                            setSelectedForRestore(selectedForRestore.filter(id => id !== word.id));
                                                        }
                                                    }}
                                                    className="mt-1 w-5 h-5"
                                                />
                                                <div className="flex-1">
                                                    <p className="text-white font-bold">{word.vocabulary}</p>
                                                    <p className="text-slate-400 text-xs mt-1">
                                                        Family: {word.family || '—'}
                                                    </p>
                                                    <p className="text-slate-500 text-xs mt-1">
                                                        Synonyms: {word.synonyms || '—'}
                                                    </p>
                                                    <p className="text-red-400 text-xs mt-2">
                                                        Deleted: {new Date(word.deleted_at).toLocaleString()}
                                                    </p>
                                                </div>
                                            </label>
                                        ))
                                    )}
                                </div>
                                
                                {deletedWords.length > 0 && (
                                    <div className="flex gap-4">
                                        <button 
                                            onClick={restoreWords}
                                            disabled={selectedForRestore.length === 0}
                                            className="flex-1 bg-green-600 hover:bg-green-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white py-4 rounded-2xl font-black uppercase text-sm"
                                        >
                                            ♻️ Restore Selected ({selectedForRestore.length})
                                        </button>
                                        <button 
                                            onClick={permanentlyDelete}
                                            disabled={selectedForRestore.length === 0}
                                            className="flex-1 bg-red-600 hover:bg-red-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white py-4 rounded-2xl font-black uppercase text-sm"
                                        >
                                            🔥 Delete Forever ({selectedForRestore.length})
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* 🆕 V11.21: CHANGE HISTORY MODAL */}
                    {showChangeHistory && (
                        <div className="fixed inset-0 bg-black/95 z-[100] flex items-center justify-center p-4 backdrop-blur-md">
                            <div className="glass-card p-10 rounded-[2.5rem] w-full max-w-4xl border-blue-500/30 max-h-[80vh] flex flex-col">
                                <div className="flex justify-between items-center mb-6">
                                    <div className="flex items-center gap-3">
                                        <h2 className="text-2xl font-black main-gradient uppercase italic">📜 Change History (2h)</h2>
                                        <button 
                                            onClick={() => loadChangeHistory()}
                                            className="text-blue-400 hover:text-blue-300 text-sm bg-blue-900/30 px-3 py-1 rounded-lg"
                                            title="Refresh history"
                                        >
                                            🔄 Refresh
                                        </button>
                                    </div>
                                    <button onClick={() => { setShowChangeHistory(false); setSelectedForHistory([]); }} className="text-slate-400 hover:text-white text-3xl">&times;</button>
                                </div>
                                
                                <p className="text-slate-400 mb-4">
                                    {changedWords.length} modified word(s) in the last 2 hours
                                </p>
                                
                                <div className="flex-1 overflow-y-auto custom-scroll mb-6 space-y-2">
                                    {changedWords.length === 0 ? (
                                        <div className="text-center text-slate-500 py-12">
                                            <i className="fas fa-history text-6xl mb-4 opacity-20"></i>
                                            <p className="text-lg mb-2">No recent changes</p>
                                            <p className="text-xs text-slate-600 mt-4">
                                                💡 Note: Make sure your database has columns:<br/>
                                                <code className="text-blue-400">previous_version</code> (text) and <code className="text-blue-400">modified_at</code> (timestamptz)
                                            </p>
                                            <p className="text-xs text-slate-600 mt-2">
                                                Check browser console (F12) for debug info
                                            </p>
                                        </div>
                                    ) : (
                                        changedWords.map(word => {
                                            const previousData = word.previous_version ? JSON.parse(word.previous_version) : {};
                                            return (
                                                <label key={word.id} className="flex items-start gap-4 bg-slate-800/50 hover:bg-slate-800 p-4 rounded-xl cursor-pointer transition-colors">
                                                    <input 
                                                        type="checkbox"
                                                        checked={selectedForHistory.includes(word.id)}
                                                        onChange={(e) => {
                                                            if (e.target.checked) {
                                                                setSelectedForHistory([...selectedForHistory, word.id]);
                                                            } else {
                                                                setSelectedForHistory(selectedForHistory.filter(id => id !== word.id));
                                                            }
                                                        }}
                                                        className="mt-1 w-5 h-5"
                                                    />
                                                    <div className="flex-1">
                                                        <p className="text-white font-bold text-lg mb-2">{word.vocabulary}</p>
                                                        
                                                        <div className="grid grid-cols-2 gap-4 text-xs">
                                                            <div className="bg-red-900/20 border border-red-500/30 rounded p-2">
                                                                <p className="text-red-400 font-bold mb-1">BEFORE:</p>
                                                                <p className="text-slate-300">Family: {previousData.family || '—'}</p>
                                                                <p className="text-slate-300 truncate">Synonyms: {previousData.synonyms || '—'}</p>
                                                                <p className="text-slate-300 truncate">Context: {previousData.context || '—'}</p>
                                                            </div>
                                                            <div className="bg-green-900/20 border border-green-500/30 rounded p-2">
                                                                <p className="text-green-400 font-bold mb-1">AFTER:</p>
                                                                <p className="text-slate-300">Family: {word.family || '—'}</p>
                                                                <p className="text-slate-300 truncate">Synonyms: {word.synonyms || '—'}</p>
                                                                <p className="text-slate-300 truncate">Context: {word.context || '—'}</p>
                                                            </div>
                                                        </div>
                                                        
                                                        <p className="text-blue-400 text-xs mt-2">
                                                            Modified: {new Date(word.modified_at).toLocaleString()}
                                                        </p>
                                                    </div>
                                                </label>
                                            );
                                        })
                                    )}
                                </div>
                                
                                {changedWords.length > 0 && (
                                    <div className="flex gap-4">
                                        <button 
                                            onClick={restorePreviousVersions}
                                            disabled={selectedForHistory.length === 0}
                                            className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white py-4 rounded-2xl font-black uppercase text-sm"
                                        >
                                            ⏪ Restore to BEFORE ({selectedForHistory.length})
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* 🆕 V11.13: FLASHCARDS with consistent UI */}
                    {showFlashcards && flashcardWords.length > 0 && (
                        <div className="fixed inset-0 bg-black/95 z-[100] flex items-center justify-center p-2 sm:p-4 backdrop-blur-md overflow-y-auto">
                            <div className="w-full max-w-4xl my-2 sm:my-8">
                                <ExerciseHeader
                                    title="🎴 Flashcards"
                                    currentIndex={flashcardIndex}
                                    totalCount={flashcardWords.length}
                                    currentWord={flashcardWords[flashcardIndex].vocabulary}
                                    exerciseMode={exerciseMode}
                                    audioEnabled={flashcardAudioEnabled}
                                    onClose={() => {
                                        setShowFlashcards(false);
                                        setFlashcardWords([]);
                                        setFlashcardIndex(0);
                                        setIsFlipped(false);
                                        setShowExercisesModal(true);
                                    }}
                                    onModeToggle={() => {
                                        setExerciseMode(exerciseMode === 'random' ? 'memory' : 'random');
                                        setShowFlashcards(false);
                                        setTimeout(() => loadFlashcards(), 100);
                                    }}
                                    onAudioToggle={() => {
                                        const newState = !flashcardAudioEnabled;
                                        setFlashcardAudioEnabled(newState);
                                        localStorage.setItem('flashcard_audio', newState.toString());
                                    }}
                                    onDictionary={(word) => {
                                        setSelectedWordForDict(word);
                                        setShowDictionaryModal(true);
                                    }}
                                    onEdit={() => {
                                        setEditingWord(flashcardWords[flashcardIndex]);
                                        setOriginalEditData({...flashcardWords[flashcardIndex]});
                                        setShowAddModal(true);
                                    }}
                                    onInfo={() => alert('🎴 FLASHCARDS EXERCISE\n✅ CLASSIFIES vocabulary (Active / Emerging / Passive)\n\n📊 HOW IT CLASSIFIES:\n🟢 Active: You know it well\n🟡 Emerging: Need more practice\n🔴 Passive: Difficult to remember\n\n🎯 HOW TO USE:\n• Click card to flip and see answer\n• Rate your knowledge (Active/Emerging/Passive)\n• 🧠 Memory mode: Shows hardest cards first\n• 🎲 Random mode: Shuffles all cards\n\n🔊 AUDIO:\n• Auto-plays context when card flips (if enabled)\n\n🎮 BUTTONS:\n• 🧠/🎲 = Toggle Memory/Random mode\n• 🔊/🔇 = Toggle audio on/off\n• 📖 = Open in dictionary\n• ℹ️ = Show this help\n• ✏️ = Edit current word\n• × = Close exercise\n• ← → = Navigate between cards\n• Active/Emerging/Passive = Rate difficulty')}
                                />

                                {/* 🆕 V11.2: Difficulty indicator */}
                                {flashcardWords[flashcardIndex].difficulty && (
                                    <div className="text-center mb-4">
                                        <span className={`inline-block px-4 py-2 rounded-full text-sm font-bold ${
                                            flashcardWords[flashcardIndex].difficulty === 'Active' ? 'bg-green-600/30 text-green-400 border border-green-500' :
                                            flashcardWords[flashcardIndex].difficulty === 'Emerging' ? 'bg-yellow-600/30 text-yellow-400 border border-yellow-500' :
                                            'bg-red-600/30 text-red-400 border border-red-500'
                                        }`}>
                                            {flashcardWords[flashcardIndex].difficulty}
                                        </span>
                                    </div>
                                )}

                                <div 
                                    className="relative w-full h-96 cursor-pointer mb-6"
                                    style={{ perspective: '1000px' }}
                                    onClick={() => setIsFlipped(!isFlipped)}
                                >
                                    <div 
                                        className="absolute w-full h-full transition-all duration-500"
                                        style={{
                                            transformStyle: 'preserve-3d',
                                            transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)'
                                        }}
                                    >
                                        <div 
                                            className="absolute w-full h-full bg-gradient-to-br from-indigo-600 to-purple-600 rounded-3xl p-12 flex flex-col items-center justify-center shadow-2xl"
                                            style={{ backfaceVisibility: 'hidden' }}
                                        >
                                            {/* 🆕 V11.42: Favourite star in top-right corner */}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    toggleFavourite(flashcardWords[flashcardIndex].id, flashcardWords[flashcardIndex].favourite || 0);
                                                }}
                                                className="absolute top-6 right-6 z-10 bg-white/20 hover:bg-white/30 p-3 rounded-full transition-all hover:scale-110"
                                                title="Toggle favourite"
                                            >
                                                <i className={`${
                                                    (flashcardWords[flashcardIndex].favourite || 0) === 0 ? 'far fa-star star-off' :
                                                    (flashcardWords[flashcardIndex].favourite || 0) === 1 ? 'fas fa-star-half-alt star-half' :
                                                    'fas fa-star star-on'
                                                } text-3xl`}></i>
                                            </button>
                                            
                                            <div className="text-center">
                                                <div className="inline-block mb-4">
                                                    <span className="bg-white/20 text-white px-4 py-2 rounded-full text-sm font-bold mr-2">
                                                        {flashcardWords[flashcardIndex].difficulty || '—'}
                                                    </span>
                                                    <span className="bg-white/20 text-white px-4 py-2 rounded-full text-sm font-bold">
                                                        {flashcardWords[flashcardIndex].family || '—'}
                                                    </span>
                                                </div>
                                                <h3 className="text-6xl font-black text-white mb-4">
                                                    {flashcardWords[flashcardIndex].vocabulary}
                                                </h3>
                                                <p className="text-white/60 text-lg">Click to flip</p>
                                            </div>
                                        </div>

                                        <div 
                                            className="absolute w-full h-full bg-gradient-to-br from-purple-600 to-pink-600 rounded-3xl p-12 flex flex-col justify-center shadow-2xl"
                                            style={{ 
                                                backfaceVisibility: 'hidden',
                                                transform: 'rotateY(180deg)'
                                            }}
                                        >
                                            <div className="space-y-6">
                                                <div>
                                                    <h4 className="text-white/70 text-sm font-bold uppercase mb-2">Synonyms:</h4>
                                                    <p className="text-white text-2xl font-bold">
                                                        {flashcardWords[flashcardIndex].synonyms || 'No synonyms available'}
                                                    </p>
                                                </div>
                                                <div>
                                                    <h4 className="text-white/70 text-sm font-bold uppercase mb-2">Context:</h4>
                                                    <p className="text-white text-xl leading-relaxed">
                                                        {flashcardWords[flashcardIndex].context || 'No context available'}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* 🆕 V11.2: Difficulty buttons */}
                                <div className="flex gap-4 mb-6">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setDifficulty('Active');
                                        }}
                                        className="flex-1 bg-green-600 hover:bg-green-500 text-white py-4 rounded-2xl font-black uppercase text-sm tooltip"
                                        data-tip="Active: Retrieves the word instantly. Speak without thinking."
                                    >
                                        ✅ Active
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setDifficulty('Emerging');
                                        }}
                                        className="flex-1 bg-yellow-600 hover:bg-yellow-500 text-white py-4 rounded-2xl font-black uppercase text-sm tooltip"
                                        data-tip="Emerging: Searches for the word in your mental archive. Write a formal email calmly."
                                    >
                                        ⚠️ Emerging
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setDifficulty('Passive');
                                        }}
                                        className="flex-1 bg-red-600 hover:bg-red-500 text-white py-4 rounded-2xl font-black uppercase text-sm tooltip"
                                        data-tip="Passive: Decodes others' messages. Read a New York Times article."
                                    >
                                        ❌ Passive
                                    </button>
                                </div>

                                <div className="flex gap-4 items-center justify-between">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (flashcardIndex > 0) {
                                                setFlashcardIndex(flashcardIndex - 1);
                                                setIsFlipped(false);
                                            }
                                        }}
                                        disabled={flashcardIndex === 0}
                                        className={`px-8 py-4 rounded-2xl font-black text-lg ${
                                            flashcardIndex === 0 
                                                ? 'bg-slate-800 text-slate-600 cursor-not-allowed' 
                                                : 'bg-white text-slate-900 hover:bg-slate-200'
                                        }`}
                                    >
                                        ← Previous
                                    </button>

                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (flashcardIndex < flashcardWords.length - 1) {
                                                setFlashcardIndex(flashcardIndex + 1);
                                                setIsFlipped(false);
                                            }
                                        }}
                                        disabled={flashcardIndex === flashcardWords.length - 1}
                                        className={`px-8 py-4 rounded-2xl font-black text-lg ${
                                            flashcardIndex === flashcardWords.length - 1 
                                                ? 'bg-slate-800 text-slate-600 cursor-not-allowed' 
                                                : 'bg-white text-slate-900 hover:bg-slate-200'
                                        }`}
                                    >
                                        Next →
                                    </button>
                                </div>

                                <div className="mt-6 bg-slate-800 rounded-full h-2 overflow-hidden">
                                    <div 
                                        className="bg-gradient-to-r from-indigo-500 to-purple-500 h-full transition-all duration-300"
                                        style={{ width: `${((flashcardIndex + 1) / flashcardWords.length) * 100}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                    
                    {/* 🆕 V11.13: DICTATION with consistent UI */}
                    {showDictation && dictationWords.length > 0 && (
                        <div className="fixed inset-0 bg-black/95 z-[100] flex items-center justify-center p-2 sm:p-4 backdrop-blur-md overflow-y-auto">
                            <div className="w-full max-w-4xl my-2 sm:my-8">
                                <ExerciseHeader
                                    title="🎤 Dictation"
                                    currentIndex={dictationIndex}
                                    totalCount={dictationWords.length}
                                    currentWord={dictationWords[dictationIndex].vocabulary}
                                    exerciseMode={exerciseMode}
                                    onClose={() => {
                                        setShowDictation(false);
                                        setDictationWords([]);
                                        setDictationIndex(0);
                                        setDictationInput('');
                                        setShowDictationAnswer(false);
                                        setDictationErrorCount(0);
                                        setDictationDifficulty('');
                                        setDictationPlayCount(0);
                                        setDictationPlaySpeed('normal');
                                    }}
                                    onModeToggle={() => {
                                        setExerciseMode(exerciseMode === 'random' ? 'memory' : 'random');
                                        setShowDictation(false);
                                        setTimeout(() => loadDictation(), 100);
                                    }}
                                    onDictionary={(word) => {
                                        setSelectedWordForDict(word);
                                        setShowDictionaryModal(true);
                                    }}
                                    onInfo={() => alert('🎤 DICTATION EXERCISE\n⛔ PRACTICE ONLY — does NOT classify vocabulary\n\n📊 PERFORMANCE TRACKING (for your own reference):\n🟢 Active: 0 errors\n🟡 Emerging: 1-2 errors\n🔴 Passive: 3+ errors\n\n⌨️ SHORTCUTS:\n• Press ENTER to check your answer\n• Press ENTER again to move to next word and auto-play\n\n🔊 AUDIO:\n• First play: Normal speed (1.0x)\n• Second play: Slow speed (0.7x)\n• Maximum 4 plays per word\n\n🎮 BUTTONS:\n• 🧠/🎲 = Toggle Memory/Random mode\n• 📖 = Open in dictionary\n• ℹ️ = Show this help\n• ✏️ = Edit current word\n• × = Close exercise\n• 🔊 = Play audio\n• Check Answer = Verify your answer\n• Skip = Skip to next word\n• Edit Word = Modify current word\n• Next Word/Finish = Continue or complete')}
                                    onEdit={() => {
                                        setEditingWord(dictationWords[dictationIndex]);
                                        setOriginalEditData({...dictationWords[dictationIndex]});
                                        setShowAddModal(true);
                                    }}
                                />

                                <div className="glass-card rounded-3xl p-12 mb-6">
                                    <div className="text-center mb-8">
                                        <div className="flex justify-center items-center gap-4 mb-4">
                                            <button
                                                onClick={() => {
                                                    if (dictationPlayCount < MAX_DICTATION_PLAYS) {
                                                        const speed = dictationPlaySpeed === 'normal' ? 1.0 : 0.7;
                                                        speakText(dictationWords[dictationIndex].context, speed);
                                                        setDictationPlaySpeed(speed === 1.0 ? 'slow' : 'normal');
                                                        setDictationPlayCount(dictationPlayCount + 1);
                                                    }
                                                }}
                                                disabled={dictationPlayCount >= MAX_DICTATION_PLAYS}
                                                className={`text-white p-6 rounded-full text-4xl shadow-2xl transition-all hover:scale-110 ${
                                                    dictationPlayCount >= MAX_DICTATION_PLAYS 
                                                        ? 'bg-slate-600 cursor-not-allowed' 
                                                        : 'bg-blue-600 hover:bg-blue-500'
                                                }`}
                                            >
                                                🔊
                                            </button>
                                            <div className="text-center">
                                                <div className="text-white font-black text-2xl">
                                                    {MAX_DICTATION_PLAYS - dictationPlayCount}
                                                </div>
                                                <div className="text-slate-400 text-xs uppercase font-bold">
                                                    Plays Left
                                                </div>
                                            </div>
                                        </div>
                                        <p className="text-slate-400 text-sm">
                                            Click speaker to hear • Speed: {dictationPlaySpeed === 'normal' ? 'Normal' : 'Slow'}
                                        </p>
                                    </div>

                                    {!showDictationAnswer ? (
                                        <>
                                            <textarea
                                                value={dictationInput}
                                                onChange={(e) => setDictationInput(e.target.value)}
                                                onKeyDown={async (e) => {
                                                    if (e.key === 'Enter' && !e.shiftKey) {
                                                        e.preventDefault();
                                                        
                                                        if (!showDictationAnswer) {
                                                            // First Enter: Check answer
                                                            // 🆕 V14.75: the local diff decides everything shown and saved
                                                            const diff = highlightDifferences(dictationInput, dictationWords[dictationIndex].context);
                                                            const { errorCount, noticeCount } = diff;
                                                            const difficulty = calculateDifficulty(errorCount);
                                                            setDictationDiff(diff);
                                                            setDictationErrorCount(errorCount);
                                                            setDictationNoticeCount(noticeCount);
                                                            setDictationDifficulty(difficulty);
                                                            setShowDictationAnswer(true);
                                                            setDictationExplanations(null);
                                                            setDictationPopup(null);
                                                            // 🆕 V14.75: optional explanations only — never changes the counts above
                                                            explainDictationErrors(diff, dictationWords[dictationIndex].context, dictationInput);
                                                            // Save immediately so closing won't lose data
                                                            try {
                                                                const w = dictationWords[dictationIndex];
                                                                await supabase.from('vocabulary_v4').update({ dictation_count: (w.dictation_count||0)+1, dictation_errors_total: (w.dictation_errors_total||0)+errorCount, last_practiced_date: new Date().toISOString() }).eq('id', w.id);
                                                                dictationWords[dictationIndex] = { ...w, dictation_count: (w.dictation_count||0)+1, dictation_errors_total: (w.dictation_errors_total||0)+errorCount };
                                                            } catch(e) { /* silent */ }
                                                        } else {
                                                            // Second Enter: Save and move to next word (same as Next Word button)
                                                            try {
                                                                const currentDictationWord = dictationWords[dictationIndex];
                                                        await supabase.from('vocabulary_v4').update({ 

                                                            dictation_count: (currentDictationWord.dictation_count || 0) + 1,
                                                            dictation_errors_total: (currentDictationWord.dictation_errors_total || 0) + dictationErrorCount,
                                                            last_practiced_date: new Date().toISOString()
                                                        }).eq('id', currentDictationWord.id);
                                                            } catch (error) {
                                                                console.error('Error saving difficulty:', error);
                                                            }
                                                            
                                                            if (dictationIndex < dictationWords.length - 1) {
                                                                setDictationIndex(dictationIndex + 1);
                                                                setDictationInput('');
                                                                setShowDictationAnswer(false);
                                                                setDictationErrorCount(0);
                                                                setDictationDifficulty('');
                                                                setDictationPlayCount(0);
                                                                setDictationPlaySpeed('normal');
                                                            } else {
                                                                alert('🎉 Exercise completed!');
                                                                setShowDictation(false);
                                                                setDictationWords([]);
                                                                setDictationIndex(0);
                                                                setDictationInput('');
                                                                setShowDictationAnswer(false);
                                                                setDictationErrorCount(0);
                                                                setDictationDifficulty('');
                                                                setDictationPlayCount(0);
                                                                setDictationPlaySpeed('normal');
                                                                setShowExercisesModal(true);
                                                            }
                                                        }
                                                    }
                                                }}
                                                placeholder="Write what you hear..."
                                                className="w-full p-6 rounded-xl text-lg min-h-[120px] resize-none mb-4"
                                                autoFocus
                                            />
                                            <div className="flex gap-4">
                                                <button
                                                    onClick={async () => {
                                                        // 🆕 V11.5: Calculate errors and difficulty
                                                        // 🆕 V14.75: the local diff decides everything shown and saved
                                                        const diff = highlightDifferences(dictationInput, dictationWords[dictationIndex].context);
                                                        const { errorCount, noticeCount } = diff;
                                                        const difficulty = calculateDifficulty(errorCount);
                                                        setDictationDiff(diff);
                                                        setDictationErrorCount(errorCount);
                                                        setDictationNoticeCount(noticeCount);
                                                        setDictationDifficulty(difficulty);
                                                        setShowDictationAnswer(true);
                                                        setDictationExplanations(null);
                                                        setDictationPopup(null);
                                                        // 🆕 V14.75: optional explanations only — never changes the counts above
                                                        explainDictationErrors(diff, dictationWords[dictationIndex].context, dictationInput);
                                                        // Save immediately so closing won't lose data
                                                        try {
                                                            const w = dictationWords[dictationIndex];
                                                            await supabase.from('vocabulary_v4').update({ dictation_count: (w.dictation_count||0)+1, dictation_errors_total: (w.dictation_errors_total||0)+errorCount, last_practiced_date: new Date().toISOString() }).eq('id', w.id);
                                                            dictationWords[dictationIndex] = { ...w, dictation_count: (w.dictation_count||0)+1, dictation_errors_total: (w.dictation_errors_total||0)+errorCount };
                                                        } catch(e) { /* silent */ }
                                                    }}
                                                    className="flex-1 bg-green-600 hover:bg-green-500 text-white py-4 rounded-2xl font-black uppercase text-sm"
                                                >
                                                    ✅ Check Answer
                                                </button>
                                                {/* 🆕 V11.6: Skip button */}
                                                <button
                                                    onClick={() => {
                                                        // Skip to next word without saving anything
                                                        if (dictationIndex < dictationWords.length - 1) {
                                                            setDictationIndex(dictationIndex + 1);
                                                            setDictationInput('');
                                                            setShowDictationAnswer(false);
                                                            setDictationErrorCount(0);
                                                            setDictationDifficulty('');
                                                            setDictationPlayCount(0);
                                                            setDictationPlaySpeed('normal');
                                                        } else {
                                                            alert('🎉 Exercise completed!');
                                                            setShowDictation(false);
                                                            setDictationWords([]);
                                                            setDictationIndex(0);
                                                            setDictationInput('');
                                                            setShowDictationAnswer(false);
                                                            setDictationErrorCount(0);
                                                            setDictationDifficulty('');
                                                            setDictationPlayCount(0);
                                                            setDictationPlaySpeed('normal');
                                                            setShowExercisesModal(true);
                                                        }
                                                    }}
                                                    className="px-6 bg-slate-700 hover:bg-slate-600 text-white py-4 rounded-2xl font-black uppercase text-sm"
                                                >
                                                    ⏭️ Skip
                                                </button>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            {/* 🆕 V14.6: Score bar with Cambridge grade + Info icon */}
                                            <div className="flex justify-center items-center gap-4 mb-6 p-4 bg-slate-800/50 rounded-2xl relative">
                                                <button
                                                    onClick={() => alert('🎤 DICTATION GRADING CRITERIA\n\n📊 CAMBRIDGE LEVELS (real errors only):\n🏆 C2: Perfect transcription — 0 errors\n⭐ C1: Excellent — 1 error\n📝 B2: Good — 2 errors\n🔴 B1: Needs practice — 3+ errors\n\n🔴 REAL ERRORS (counted, affect grade and difficulty):\n• Wrong words\n• Missing or extra words\n• Genuine spelling mistakes\n• Grammatical errors\n\n▵ NOTICES (shown in amber, NOT counted):\n• British vs American spelling (colour/color)\n• Final punctuation, missing or extra\n• Initial capitalisation\n• Accents and diacritics\n\nNotices never affect your grade or the difficulty saved for the word.\n\nClick on highlighted errors to see details.')}
                                                    className="absolute right-3 top-3 text-blue-400 hover:text-blue-300 text-base leading-none"
                                                    title="Grading criteria"
                                                >ℹ️</button>
                                                <div className="text-center">
                                                    <p className="text-xs uppercase font-black text-slate-500 mb-1">Errors</p>
                                                    <p className="text-2xl font-black text-white">{dictationErrorCount}</p>
                                                </div>
                                                {/* 🆕 V14.74: notices are shown but never counted as errors */}
                                                {dictationNoticeCount > 0 && (
                                                    <>
                                                        <div className="h-12 w-px bg-slate-700"></div>
                                                        <div className="text-center cursor-help" title="Accepted variants — British/American spelling, final punctuation, initial capitalisation or accents. These do not affect your grade or the word's difficulty.">
                                                            <p className="text-xs uppercase font-black text-amber-500/80 mb-1">Notices ▵</p>
                                                            <p className="text-2xl font-black text-amber-300">{dictationNoticeCount}</p>
                                                        </div>
                                                    </>
                                                )}
                                                <div className="h-12 w-px bg-slate-700"></div>
                                                <div className="text-center">
                                                    <p className="text-xs uppercase font-black text-slate-500 mb-1">Grade</p>
                                                    {/* 🆕 V14.75: derived from the local error count, so it never changes between runs */}
                                                    <p className={`text-2xl font-black ${
                                                        dictationErrorCount === 0 ? 'text-green-400' :
                                                        dictationErrorCount === 1 ? 'text-teal-400' :
                                                        dictationErrorCount === 2 ? 'text-yellow-400' :
                                                        'text-red-400'
                                                    }`}>
                                                        {dictationErrorCount === 0 ? '🏆 C2' : dictationErrorCount === 1 ? '⭐ C1' : dictationErrorCount === 2 ? '📝 B2' : '🔴 B1'}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* 🆕 V14.6: AI-annotated your answer (clickable corrections) */}
                                            <div className="space-y-4 relative" onClick={() => dictationPopup && setDictationPopup(null)}>
                                                <div className="bg-slate-900/50 border border-slate-700 rounded-2xl p-5 relative">
                                                    <h4 className="text-slate-300 font-bold uppercase text-xs mb-3 flex items-center gap-2">
                                                        <span>📝</span> Your Answer
                                                        {dictationAILoading && <span className="text-blue-400 text-xs font-normal normal-case animate-pulse">🤖 explanations loading...</span>}
                                                        {dictationDiff && dictationDiff.errorCount > 0 && !dictationAILoading && <span className="text-slate-500 text-xs font-normal normal-case">(click corrections for details)</span>}
                                                    </h4>
                                                    {/* 🆕 V14.75: rendered from the local diff only, so the annotations are identical
                                                        on every run and appear immediately — the AI never touches this. */}
                                                    <div className="text-base text-white leading-loose">
                                                        {dictationDiff
                                                            ? renderDictationDiff(dictationDiff, (token, el) => {
                                                                const rect = el.getBoundingClientRect();
                                                                setDictationPopup({ x: rect.left + rect.width / 2, y: rect.bottom + 8, yAbove: rect.top - 8, error: token });
                                                            })
                                                            : <span className="text-slate-600 italic">No input</span>
                                                        }
                                                    </div>

                                                    {/* Correction popup - smart positioning */}
                                                    {dictationPopup && (() => {
                                                        const pw = 280, ph = 180;
                                                        const left = Math.max(pw/2 + 8, Math.min(dictationPopup.x, window.innerWidth - pw/2 - 8));
                                                        const top = dictationPopup.y + ph > window.innerHeight
                                                            ? Math.max(8, dictationPopup.yAbove - ph)
                                                            : dictationPopup.y;
                                                        return (
                                                            <div
                                                                className="fixed z-[200] bg-slate-800 border border-slate-600 rounded-xl p-4 shadow-2xl"
                                                                style={{ left: left + 'px', top: top + 'px', transform: 'translateX(-50%)', width: pw + 'px' }}
                                                                onClick={(e) => e.stopPropagation()}
                                                            >
                                                                {/* 🆕 V14.75: the correction itself comes from the local diff and is always
                                                                    present; the AI explanation is optional extra text below it. */}
                                                                <div className="flex justify-between items-start mb-2">
                                                                    <span className={`text-xs uppercase font-black ${
                                                                        dictationPopup.error.kind === 'spelling' ? 'text-red-300' :
                                                                        dictationPopup.error.kind === 'wrong-word' ? 'text-red-400' :
                                                                        dictationPopup.error.kind === 'missing-word' ? 'text-yellow-400' :
                                                                        'text-orange-400'
                                                                    }`}>
                                                                        {dictationPopup.error.kind === 'spelling' ? '🔤' :
                                                                         dictationPopup.error.kind === 'wrong-word' ? '❌' :
                                                                         dictationPopup.error.kind === 'missing-word' ? '➕' : '➖'} {dictationPopup.error.kind}
                                                                    </span>
                                                                    <button onClick={() => setDictationPopup(null)} className="text-slate-400 hover:text-white text-lg leading-none ml-3">&times;</button>
                                                                </div>
                                                                <p className="text-sm mb-2">
                                                                    {dictationPopup.error.typed && <span className="text-red-300 line-through">{dictationPopup.error.typed}</span>}
                                                                    {dictationPopup.error.typed && dictationPopup.error.expected && <span className="text-white mx-2">→</span>}
                                                                    {dictationPopup.error.expected && <span className="text-green-300 font-bold">{dictationPopup.error.expected}</span>}
                                                                    {!dictationPopup.error.expected && <span className="text-slate-400 ml-2 text-xs">(should not be there)</span>}
                                                                </p>
                                                                {(() => {
                                                                    const found = (dictationExplanations || []).find(x => x.id === dictationPopup.error.id);
                                                                    if (found && found.explanation) return <AIText text={found.explanation} className="text-slate-300 text-sm" />;
                                                                    if (dictationAILoading) return <p className="text-slate-500 text-sm italic">Explanation loading…</p>;
                                                                    return <p className="text-slate-500 text-sm italic">No explanation available.</p>;
                                                                })()}
                                                            </div>
                                                        );
                                                    })()}
                                                </div>

                                                <div>
                                                    <h4 className="text-xs uppercase font-black text-green-400 mb-2">✅ Correct Answer:</h4>
                                                    <div className="bg-green-900/20 border border-green-500/30 p-4 rounded-xl text-base text-green-100">
                                                        {highlightWordInContext(dictationWords[dictationIndex].context, dictationWords[dictationIndex].vocabulary)}
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            <div className="mt-6">
                                                <button
                                                    onClick={async () => {
                                                        try {
                                                            const currentDictationWord = dictationWords[dictationIndex];
                                                            await supabase.from('vocabulary_v4').update({ 
                                                                dictation_count: (currentDictationWord.dictation_count || 0) + 1,
                                                                dictation_errors_total: (currentDictationWord.dictation_errors_total || 0) + dictationErrorCount,
                                                                last_practiced_date: new Date().toISOString()
                                                            }).eq('id', currentDictationWord.id);
                                                        } catch (error) {
                                                            console.error('Error saving difficulty:', error);
                                                        }
                                                        
                                                        if (dictationIndex < dictationWords.length - 1) {
                                                            setDictationIndex(dictationIndex + 1);
                                                            setDictationInput('');
                                                            setShowDictationAnswer(false);
                                                            setDictationErrorCount(0);
                                                            setDictationDifficulty('');
                                                            setDictationPlayCount(0);
                                                            setDictationPlaySpeed('normal');
                                                            setDictationExplanations(null); setDictationDiff(null); setDictationNoticeCount(0);
                                                            setDictationPopup(null);
                                                        } else {
                                                            alert('🎉 Exercise completed!');
                                                            setShowDictation(false);
                                                            setDictationWords([]);
                                                            setDictationIndex(0);
                                                            setDictationInput('');
                                                            setShowDictationAnswer(false);
                                                            setDictationErrorCount(0);
                                                            setDictationDifficulty('');
                                                            setDictationPlayCount(0);
                                                            setDictationPlaySpeed('normal');
                                                            setDictationExplanations(null); setDictationDiff(null); setDictationNoticeCount(0);
                                                            setDictationPopup(null);
                                                            setShowExercisesModal(true);
                                                        }
                                                    }}
                                                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-4 rounded-2xl font-black uppercase text-sm"
                                                >
                                                    {dictationIndex < dictationWords.length - 1 ? 'Next Word →' : '✅ Finish'}
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>

                                <div className="mt-6 bg-slate-800 rounded-full h-2 overflow-hidden">
                                    <div 
                                        className="bg-gradient-to-r from-blue-500 to-indigo-500 h-full transition-all duration-300"
                                        style={{ width: `${((dictationIndex + 1) / dictationWords.length) * 100}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 🆕 V11.13: SELECTION with consistent UI */}
                    {showSelection && selectionWords.length > 0 && (
                        <div className="fixed inset-0 bg-black/95 z-[100] flex items-center justify-center p-2 sm:p-4 backdrop-blur-md overflow-y-auto">
                            <div className="w-full max-w-4xl my-2 sm:my-8">
                                <ExerciseHeader
                                    title="✓ Selection"
                                    currentIndex={selectionIndex}
                                    totalCount={selectionWords.length}
                                    currentWord={selectionWords[selectionIndex].vocabulary}
                                    exerciseMode={exerciseMode}
                                    onClose={() => {
                                        setShowSelection(false);
                                        setSelectionWords([]);
                                        setSelectionIndex(0);
                                        setSelectedAnswer(null);
                                        setShowSelectionAnswer(false);
                                        setSelectionAttempts(0);
                                        setSelectionDifficulty('');
                                        setShowExercisesModal(true);
                                    }}
                                    onModeToggle={() => {
                                        const newMode = exerciseMode === 'random' ? 'memory' : 'random';
                                        setExerciseMode(newMode);
                                        localStorage.setItem('exercise_mode', newMode);
                                        setShowSelection(false);
                                        setTimeout(() => loadSelection(), 100);
                                    }}
                                    onDictionary={(word) => {
                                        setSelectedWordForDict(word);
                                        setShowDictionaryModal(true);
                                    }}
                                    onInfo={() => alert('✓ SELECTION EXERCISE\n✅ CLASSIFIES vocabulary (Active / Emerging / Passive)\n\n📊 HOW IT CLASSIFIES:\n✅ First try correct = Active\n⚠️ Second try correct = Emerging\n❌ Third or more tries = Passive\n\n🎯 HOW TO PLAY:\n• Read the sentence with the blank\n• Choose the correct word from 6 options\n• You have unlimited attempts\n• Difficulty is based on number of tries\n\n🎮 BUTTONS:\n• 🧠/🎲 = Toggle Memory/Random mode\n• 📖 = Open in dictionary\n• ℹ️ = Show this help\n• ✏️ = Edit current word\n• × = Close exercise\n• Word options = Click to select answer\n• Edit Word = Modify current word\n• Next Word/Finish = Continue or complete')}
                                    onEdit={() => {
                                        setEditingWord(selectionWords[selectionIndex]);
                                        setOriginalEditData({...selectionWords[selectionIndex]});
                                        setShowAddModal(true);
                                    }}
                                />

                                {/* Context with hidden word - 🆕 V11.19: Responsive padding */}
                                <div className="bg-gradient-to-br from-green-600 to-teal-600 rounded-2xl sm:rounded-3xl p-4 sm:p-8 mb-4 sm:mb-6 shadow-2xl">
                                    <div className="text-center">
                                        <h3 className="text-white/70 text-xs sm:text-sm font-bold uppercase mb-2 sm:mb-4">Complete the sentence:</h3>
                                        <p className="text-white text-lg sm:text-2xl font-bold leading-relaxed">
                                            {hideWordInContext(selectionWords[selectionIndex].context, selectionWords[selectionIndex].vocabulary)}
                                        </p>
                                    </div>
                                </div>

                                {/* 🆕 V11.16: Countdown display - V11.19: Responsive */}
                                {!selectionOptionsVisible && selectionTimeLeft > 0 && (
                                    <div className="text-center mb-4 sm:mb-6">
                                        <div className="inline-block bg-indigo-600/30 border-2 border-indigo-500 rounded-full px-6 py-3 sm:px-8 sm:py-4">
                                            <p className="text-indigo-300 text-xs sm:text-sm font-bold uppercase mb-1">Options visible in</p>
                                            <p className="text-white text-4xl sm:text-5xl font-black">{selectionTimeLeft}</p>
                                        </div>
                                    </div>
                                )}

                                {/* Options grid (6 options) - 🆕 V11.19: Responsive padding and text */}
                                <div className="grid grid-cols-2 gap-2 sm:gap-4 mb-4 sm:mb-6">
                                    {selectionOptions.map((option, index) => (
                                        <button
                                            key={index}
                                            onClick={async () => {
                                                // 🆕 V11.64: Block if already wrong, answered, or not visible
                                                if (showSelectionAnswer || !selectionOptionsVisible || selectionWrongAnswers.includes(option.vocabulary)) return;
                                                
                                                setSelectedAnswer(option.vocabulary);
                                                const isCorrect = option.vocabulary === selectionWords[selectionIndex].vocabulary;
                                                
                                                if (!isCorrect) {
                                                    // 🆕 V11.64: Track wrong answers
                                                    setSelectionAttempts(prev => prev + 1);
                                                    setSelectionWrongAnswers(prev => [...prev, option.vocabulary]);
                                                } else {
                                                    // Correct answer - calculate difficulty
                                                    const newAttempts = selectionAttempts + 1;
                                                    let difficulty;
                                                    if (newAttempts === 1) difficulty = 'Active';
                                                    else if (newAttempts === 2) difficulty = 'Emerging';
                                                    else difficulty = 'Passive';
                                                    
                                                    setSelectionDifficulty(difficulty);
                                                    setShowSelectionAnswer(true);
                                                    // Save immediately so closing won't lose data
                                                    const totalAttempts = (selectionAttempts + 1);
                                                    try {
                                                        const w = selectionWords[selectionIndex];
                                                        await supabase.from('vocabulary_v4').update({ difficulty, selection_count: (w.selection_count||0)+1, selection_attempts_total: (w.selection_attempts_total||0)+totalAttempts, last_practiced_date: new Date().toISOString() }).eq('id', w.id);
                                                        selectionWords[selectionIndex] = { ...w, selection_count: (w.selection_count||0)+1, selection_attempts_total: (w.selection_attempts_total||0)+totalAttempts };
                                                    } catch(e) { /* silent */ }
                                                    
                                                    // 🆕 V11.64: Only explain if there were wrong attempts
                                                    if (selectionWrongAnswers.length > 0) {
                                                        explainSelectionAnswer(
                                                            selectionWords[selectionIndex].vocabulary,
                                                            selectionWrongAnswers,
                                                            selectionWords[selectionIndex].context
                                                        );
                                                    }
                                                }
                                            }}
                                            disabled={showSelectionAnswer || !selectionOptionsVisible || selectionWrongAnswers.includes(option.vocabulary)}
                                            className={`p-3 sm:p-6 rounded-xl sm:rounded-2xl font-bold text-base sm:text-lg transition-all ${
                                                !selectionOptionsVisible 
                                                    ? 'blur-lg cursor-not-allowed bg-slate-800 text-slate-600'
                                                    : selectionWrongAnswers.includes(option.vocabulary)
                                                        ? 'bg-red-900/40 text-red-400 line-through cursor-not-allowed border-2 border-red-800'
                                                        : showSelectionAnswer
                                                            ? option.vocabulary === selectionWords[selectionIndex].vocabulary
                                                                ? 'bg-green-600 text-white border-2 border-green-400'
                                                                : 'bg-slate-800 text-slate-500'
                                                            : selectedAnswer === option.vocabulary
                                                                ? 'bg-blue-600 text-white border-2 border-blue-400 scale-105'
                                                                : 'bg-slate-800 hover:bg-slate-700 text-white hover:scale-105'
                                            }`}
                                        >
                                            {option.vocabulary}
                                        </button>
                                    ))}
                                </div>

                                {/* 🆕 V11.18: Skip button - V11.19: Responsive */}
                                {!showSelectionAnswer && (
                                    <div className="mt-4 sm:mt-6">
                                        <button
                                            onClick={async () => {
                                                // Skip to next word without saving anything
                                                if (selectionIndex < selectionWords.length - 1) {
                                                    const nextIndex = selectionIndex + 1;
                                                    setSelectionIndex(nextIndex);
                                                    setSelectedAnswer(null);
                                                    setShowSelectionAnswer(false);
                                                    setSelectionAttempts(0);
                                                    setSelectionDifficulty('');
                                                    // 🆕 V11.64: Reset wrong answers & explanation
                                                    setSelectionWrongAnswers([]);
                                                    setSelectionExplanation('');
                                                    // 🆕 V11.64: Try AI options first, fallback to DB
                                                    const nextWord = selectionWords[nextIndex];
                                                    const aiOpts = await generateAISelectionOptions(nextWord);
                                                    let nextOptions;
                                                    if (aiOpts && aiOpts.length >= 3) {
                                                        nextOptions = [nextWord, ...aiOpts.slice(0, 5)].sort(() => Math.random() - 0.5);
                                                    } else {
                                                        nextOptions = generateSelectionOptions(nextWord, selectionWords);
                                                    }
                                                    if (!nextOptions) {
                                                        alert('⚠️ Cannot generate options. Ending exercise.');
                                                        setShowSelection(false);
                                                        return;
                                                    }
                                                    setSelectionOptions(nextOptions);
                                                } else {
                                                    alert('🎉 Exercise completed!');
                                                    setShowSelection(false);
                                                    setSelectionWords([]);
                                                    setSelectionIndex(0);
                                                    setSelectedAnswer(null);
                                                    setShowSelectionAnswer(false);
                                                    setSelectionAttempts(0);
                                                    setSelectionDifficulty('');
                                                    setSelectionWrongAnswers([]);
                                                    setSelectionExplanation('');
                                                    setShowExercisesModal(true);
                                                }
                                            }}
                                            className="w-full bg-slate-700 hover:bg-slate-600 text-white py-3 sm:py-4 rounded-xl sm:rounded-2xl font-black uppercase text-sm"
                                        >
                                            ⏭️ Skip
                                        </button>
                                    </div>
                                )}

                                {/* Answer feedback and navigation - 🆕 V11.19: Responsive */}
                                {showSelectionAnswer && (
                                    <div className="space-y-3 sm:space-y-4">
                                        {/* Difficulty display - 🆕 V11.19: Responsive */}
                                        <div className="flex justify-center items-center gap-3 sm:gap-4 p-3 sm:p-4 bg-slate-800/50 rounded-xl sm:rounded-2xl">
                                            <div className="text-center">
                                                <p className="text-[10px] sm:text-xs uppercase font-black text-slate-500 mb-1">Attempts</p>
                                                <p className="text-xl sm:text-2xl font-black text-white">{selectionAttempts + 1}</p>
                                            </div>
                                            <div className="text-center">
                                                <p className="text-[10px] sm:text-xs uppercase font-black text-slate-500 mb-1">Difficulty</p>
                                                <p className={`text-xl sm:text-2xl font-black ${
                                                    selectionDifficulty === 'Active' ? 'text-green-400' :
                                                    selectionDifficulty === 'Emerging' ? 'text-yellow-400' : 'text-red-400'
                                                }`}>
                                                    {selectionDifficulty}
                                                </p>
                                            </div>
                                        </div>

                                        {/* 🆕 V11.64: AI Explanation Panel - shown only if user made wrong attempts */}
                                        {showSelectionAnswer && selectionWrongAnswers.length > 0 && (
                                            <div className="mt-4 p-4 bg-blue-900/20 border border-blue-500/40 rounded-xl">
                                                {selectionExplLoading ? (
                                                    <div className="flex items-center gap-2 text-blue-300">
                                                        <span className="text-xl">🤖</span>
                                                        <span className="text-sm">AI is explaining...</span>
                                                    </div>
                                                ) : selectionExplanation ? (
                                                    <>
                                                        <h4 className="text-blue-300 text-xs font-black uppercase mb-2">💡 Why {selectionWords[selectionIndex].vocabulary} is the best answer</h4>
                                                        <AIText text={selectionExplanation} className="text-white/80 text-sm leading-relaxed" />
                                                    </>
                                                ) : null}
                                            </div>
                                        )}

                                        {/* 🆕 V11.16: Removed Edit button - V11.19: Responsive */}
                                        <div className="mt-4 sm:mt-6">
                                            <button
                                                onClick={async () => {
                                                    // Save difficulty to database
                                                    try {
                                                        const currentSelectionWord = selectionWords[selectionIndex];
                                                    await supabase.from('vocabulary_v4').update({ 
                                                        difficulty: selectionDifficulty,
                                                        selection_count: (currentSelectionWord.selection_count || 0) + 1,
                                                        selection_attempts_total: (currentSelectionWord.selection_attempts_total || 0) + (selectionAttempts + 1),
                                                        last_practiced_date: new Date().toISOString()
                                                    }).eq('id', currentSelectionWord.id);
                                                    } catch (error) {
                                                        console.error('Error saving difficulty:', error);
                                                    }
                                                    
                                                    if (selectionIndex < selectionWords.length - 1) {
                                                        const nextIndex = selectionIndex + 1;
                                                        setSelectionIndex(nextIndex);
                                                        setSelectedAnswer(null);
                                                        setShowSelectionAnswer(false);
                                                        setSelectionAttempts(0);
                                                        setSelectionDifficulty('');
                                                        // 🆕 V11.64: Reset wrong answers & explanation
                                                        setSelectionWrongAnswers([]);
                                                        setSelectionExplanation('');
                                                        // 🆕 V11.64: Try AI options first, fallback to DB
                                                        const nextWord = selectionWords[nextIndex];
                                                        const aiOpts = await generateAISelectionOptions(nextWord);
                                                        let nextOptions;
                                                        if (aiOpts && aiOpts.length >= 3) {
                                                            nextOptions = [nextWord, ...aiOpts.slice(0, 5)].sort(() => Math.random() - 0.5);
                                                        } else {
                                                            nextOptions = generateSelectionOptions(nextWord, selectionWords);
                                                        }
                                                        if (!nextOptions) {
                                                            alert('⚠️ Cannot generate options. Ending exercise.');
                                                            setShowSelection(false);
                                                            return;
                                                        }
                                                        setSelectionOptions(nextOptions);
                                                    } else {
                                                        alert('🎉 Exercise completed!');
                                                        setShowSelection(false);
                                                        setSelectionWords([]);
                                                        setSelectionIndex(0);
                                                        setSelectedAnswer(null);
                                                        setShowSelectionAnswer(false);
                                                        setSelectionAttempts(0);
                                                        setSelectionDifficulty('');
                                                        setSelectionWrongAnswers([]);
                                                        setSelectionExplanation('');
                                                        setShowExercisesModal(true);
                                                    }
                                                }}
                                                className="w-full bg-green-600 hover:bg-green-500 text-white py-3 sm:py-4 rounded-xl sm:rounded-2xl font-black uppercase text-sm"
                                            >
                                                {selectionIndex < selectionWords.length - 1 ? 'Next Word →' : '✅ Finish'}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Progress bar */}
                                <div className="mt-6 bg-slate-800 rounded-full h-2 overflow-hidden">
                                    <div 
                                        className="bg-gradient-to-r from-green-500 to-teal-500 h-full transition-all duration-300"
                                        style={{ width: `${((selectionIndex + 1) / selectionWords.length) * 100}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 🆕 V11.16: GUESSWORK EXERCISE MODAL */}
                    {showGuesswork && guessworkWords.length > 0 && (
                        <div className="fixed inset-0 bg-black/95 z-[100] flex items-center justify-center p-2 sm:p-4 backdrop-blur-md overflow-y-auto">
                            <div className="w-full max-w-4xl my-2 sm:my-8">
                                {/* Header */}
                                <ExerciseHeader
                                    title="🤔 Guesswork"
                                    currentIndex={guessworkIndex}
                                    totalCount={guessworkWords.length}
                                    currentWord={guessworkWords[guessworkIndex].vocabulary}
                                    exerciseMode={exerciseMode}
                                    audioEnabled={false}
                                    onClose={() => {
                                        setShowGuesswork(false);
                                        setGuessworkWords([]);
                                        setGuessworkIndex(0);
                                        setGuessworkInput('');
                                        setShowGuessworkAnswer(false);
                                        setGuessworkDifficulty('');
                                        setGuessworkAttempts(0);
                                        setGuessworkAIResult(null);
                                        setShowExercisesModal(true);
                                    }}
                                    onModeToggle={() => {
                                        setExerciseMode(exerciseMode === 'random' ? 'memory' : 'random');
                                        setShowGuesswork(false);
                                        setTimeout(() => loadGuesswork(), 100);
                                    }}
                                    onAudioToggle={null}
                                    onDictionary={(word) => {
                                        setSelectedWordForDict(word);
                                        setShowDictionaryModal(true);
                                    }}
                                    onEdit={() => {
                                        setEditingWord(guessworkWords[guessworkIndex]);
                                        setOriginalEditData({...guessworkWords[guessworkIndex]});
                                        setShowAddModal(true);
                                    }}
                                    onInfo={() => alert('🤔 GUESSWORK EXERCISE\n✅ CLASSIFIES vocabulary (Active / Emerging / Passive)\n\n📊 HOW IT CLASSIFIES:\n✅ Exact match = Active\n🤖 AI evaluates quality when not exact match:\n  • Active = Exact match or perfect synonym\n  • Emerging = Valid synonym with subtle difference\n  • Passive = Different meaning or doesn\'t fit context\n\n🎯 HOW TO PLAY:\n• Read the sentence with the blank\n• Write the correct word\n• Click 💡 Hint button (top-right of sentence) for help\n• Non-exact → AI evaluates and scores Active/Emerging/Passive\n\n🎮 BUTTONS:\n• 🧠/🎲 = Toggle Memory/Random mode\n• 💡 = Show hint (in sentence panel)\n• 📖 = Open in dictionary\n• ℹ️ = Show this help\n• ✏️ = Edit current word\n• × = Close exercise\n• Check Answer = Verify your answer (uses AI if not exact match)\n• Next Word/Finish = Continue or complete')}
                                />

                                {/* Context with blank - 🆕 V11.21: Hint button in top-right corner */}
                                <div className="bg-gradient-to-br from-orange-600 to-red-600 rounded-3xl p-8 mb-6 shadow-2xl relative">
                                    {/* Hint button in top-right corner */}
                                    <button
                                        onClick={async () => {
                                            setShowGuessworkHint(true);
                                            await generateGuessworkHintMeaning(guessworkWords[guessworkIndex].vocabulary);
                                        }}
                                        className="absolute top-4 right-4 bg-yellow-500 hover:bg-yellow-400 text-white px-4 py-2 rounded-xl font-bold text-sm shadow-lg transition-all hover:scale-110"
                                        title="Show hint"
                                    >
                                        💡 Hint
                                    </button>
                                    
                                    <div className="text-center">
                                        <h3 className="text-white/70 text-sm font-bold uppercase mb-4">Complete the sentence:</h3>
                                        <p className="text-white text-2xl font-bold leading-relaxed">
                                            {hideWordInContext(guessworkWords[guessworkIndex].context, guessworkWords[guessworkIndex].vocabulary)}
                                        </p>
                                    </div>
                                </div>

                                {!showGuessworkAnswer ? (
                                    <>
                                        {/* Input field */}
                                        <input
                                            type="text"
                                            value={guessworkInput}
                                            onChange={(e) => setGuessworkInput(e.target.value)}
                                            onKeyDown={async (e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    
                                                    if (!showGuessworkAnswer && guessworkInput.trim()) {
                                                        // First Enter: Check answer
                                                        const userAnswer = guessworkInput.trim().toLowerCase();
                                                        const correctAnswer = guessworkWords[guessworkIndex].vocabulary.toLowerCase();
                                                        
                                                        if (userAnswer === correctAnswer) {
                                                            // Exact match - Easy
                                                            setGuessworkDifficulty('Active');
                                                            setGuessworkAttempts(prev => prev + 1);
                                                            setGuessworkAIResult({
                                                                is_correct: true,
                                                                explanation: 'Perfect! Exact match.',
                                                                score: 'Active'
                                                            });
                                                            setShowGuessworkAnswer(true);
                                                    // Save immediately so closing won't lose data
                                                    try { const w = guessworkWords[guessworkIndex]; await supabase.from('vocabulary_v4').update({ difficulty: 'Active', guesswork_count: (w.guesswork_count||0)+1, last_practiced_date: new Date().toISOString() }).eq('id', w.id); guessworkWords[guessworkIndex] = { ...w, guesswork_count: (w.guesswork_count||0)+1 }; } catch(e) { /* silent */ }
                                                        } else {
                                                            // Not exact - validate with AI
                                                            const aiResult = await validateGuessworkWithAI(
                                                                userAnswer,
                                                                correctAnswer,
                                                                guessworkWords[guessworkIndex].context
                                                            );
                                                            if (aiResult) {
                                                                // 🆕 V11.65: Score is now returned directly as Active/Emerging/Passive
                                                                const finalScore = aiResult.score || 'Passive';
                                                                setGuessworkAIResult(aiResult);
                                                                setGuessworkDifficulty(finalScore);
                                                                setGuessworkAttempts(prev => prev + 1);
                                                                setShowGuessworkAnswer(true);
                                                    // Save immediately so closing won't lose data
                                                    try { const w = guessworkWords[guessworkIndex]; await supabase.from('vocabulary_v4').update({ difficulty: finalScore, guesswork_count: (w.guesswork_count||0)+1, last_practiced_date: new Date().toISOString() }).eq('id', w.id); guessworkWords[guessworkIndex] = { ...w, guesswork_count: (w.guesswork_count||0)+1 }; } catch(e) { /* silent */ }
                                                            } else {
                                                                // AI unavailable - show answer with fallback so save can proceed
                                                                setGuessworkDifficulty('Passive');
                                                                setGuessworkAIResult({ is_correct: false, explanation: 'AI validation unavailable. Please check your API key in Settings.', score: 'Passive', is_synonym: false, synonym_note: '' });
                                                                setGuessworkAttempts(prev => prev + 1);
                                                                setShowGuessworkAnswer(true);
                                                    // Save immediately so closing won't lose data
                                                    try { const w = guessworkWords[guessworkIndex]; await supabase.from('vocabulary_v4').update({ difficulty: 'Passive', guesswork_count: (w.guesswork_count||0)+1, last_practiced_date: new Date().toISOString() }).eq('id', w.id); guessworkWords[guessworkIndex] = { ...w, guesswork_count: (w.guesswork_count||0)+1 }; } catch(e) { /* silent */ }
                                                            }
                                                        }
                                                    } else if (showGuessworkAnswer) {
                                                        // Second Enter: Save and move to next word
                                                        try {
                                                            const currentGuessworkWord = guessworkWords[guessworkIndex];
                                                    try {
                                                        await supabase.from('vocabulary_v4').update({ 
                                                            difficulty: guessworkDifficulty || 'Emerging',
                                                            guesswork_count: (currentGuessworkWord.guesswork_count || 0) + 1,
                                                            last_practiced_date: new Date().toISOString()
                                                        }).eq('id', currentGuessworkWord.id);
                                                    } catch (colErr) {
                                                        // guesswork_count column missing - save without it
                                                        await supabase.from('vocabulary_v4').update({ 
                                                            difficulty: guessworkDifficulty || 'Emerging',
                                                            last_practiced_date: new Date().toISOString()
                                                        }).eq('id', currentGuessworkWord.id);
                                                        console.warn('guesswork_count column missing - run DB migration in Settings');
                                                    }
                                                        // Update local state to keep counts accurate
                                                        const updatedGW = {...currentGuessworkWord, difficulty: guessworkDifficulty || 'Emerging', guesswork_count: (currentGuessworkWord.guesswork_count || 0) + 1};
                                                        setGuessworkWords(prev => prev.map(w => w.id === currentGuessworkWord.id ? updatedGW : w));
                                                        setWords(prev => prev.map(w => w.id === currentGuessworkWord.id ? updatedGW : w));
                                                        } catch (error) {
                                                            console.error('Error saving difficulty:', error);
                                                        }
                                                        
                                                        if (guessworkIndex < guessworkWords.length - 1) {
                                                            setGuessworkIndex(guessworkIndex + 1);
                                                            setGuessworkInput('');
                                                            setShowGuessworkAnswer(false);
                                                            setGuessworkAttempts(0);
                                                            setGuessworkDifficulty('');
                                                            setGuessworkAIResult(null);
                                                        } else {
                                                            alert('🎉 Exercise completed!');
                                                            setShowGuesswork(false);
                                                            setGuessworkWords([]);
                                                            setGuessworkIndex(0);
                                                            setGuessworkInput('');
                                                            setShowGuessworkAnswer(false);
                                                            setGuessworkAttempts(0);
                                                            setGuessworkDifficulty('');
                                                            setGuessworkAIResult(null);
                                                            setShowExercisesModal(true);
                                                        }
                                                    }
                                                }
                                            }}
                                            placeholder="Write your answer here..."
                                            className="w-full p-6 rounded-xl text-lg text-center mb-4 font-bold"
                                            autoFocus
                                        />
                                        
                                        <div className="flex gap-4">
                                            <button
                                                onClick={async () => {
                                                    if (!guessworkInput.trim()) return;
                                                    
                                                    const userAnswer = guessworkInput.trim().toLowerCase();
                                                    const correctAnswer = guessworkWords[guessworkIndex].vocabulary.toLowerCase();
                                                    
                                                    if (userAnswer === correctAnswer) {
                                                        // Exact match - Easy
                                                        setGuessworkDifficulty('Active');
                                                        setGuessworkAttempts(prev => prev + 1);
                                                        setGuessworkAIResult({
                                                            is_correct: true,
                                                            explanation: 'Perfect! Exact match.',
                                                            score: 'Active'
                                                        });
                                                        setShowGuessworkAnswer(true);
                                                    // Save immediately so closing won't lose data
                                                    try { const w = guessworkWords[guessworkIndex]; await supabase.from('vocabulary_v4').update({ difficulty: 'Active', guesswork_count: (w.guesswork_count||0)+1, last_practiced_date: new Date().toISOString() }).eq('id', w.id); guessworkWords[guessworkIndex] = { ...w, guesswork_count: (w.guesswork_count||0)+1 }; } catch(e) { /* silent */ }
                                                    } else {
                                                        // Not exact - validate with AI
                                                        const aiResult = await validateGuessworkWithAI(
                                                            userAnswer,
                                                            correctAnswer,
                                                            guessworkWords[guessworkIndex].context
                                                        );
                                                        if (aiResult) {
                                                            // 🆕 V11.65: Score returned directly as Active/Emerging/Passive
                                                            const finalScore2 = aiResult.score || 'Passive';
                                                            setGuessworkAIResult(aiResult);
                                                            setGuessworkDifficulty(finalScore2);
                                                            setGuessworkAttempts(prev => prev + 1);
                                                            setShowGuessworkAnswer(true);
                                                    // Save immediately so closing won't lose data
                                                    try { const w = guessworkWords[guessworkIndex]; await supabase.from('vocabulary_v4').update({ difficulty: finalScore2, guesswork_count: (w.guesswork_count||0)+1, last_practiced_date: new Date().toISOString() }).eq('id', w.id); guessworkWords[guessworkIndex] = { ...w, guesswork_count: (w.guesswork_count||0)+1 }; } catch(e) { /* silent */ }
                                                        } else {
                                                            // AI unavailable - show answer with fallback so save can proceed
                                                            setGuessworkDifficulty('Passive');
                                                            setGuessworkAIResult({ is_correct: false, explanation: 'AI validation unavailable. Please check your API key in Settings.', score: 'Passive', is_synonym: false, synonym_note: '' });
                                                            setGuessworkAttempts(prev => prev + 1);
                                                            setShowGuessworkAnswer(true);
                                                    // Save immediately so closing won't lose data
                                                    try { const w = guessworkWords[guessworkIndex]; await supabase.from('vocabulary_v4').update({ difficulty: 'Passive', guesswork_count: (w.guesswork_count||0)+1, last_practiced_date: new Date().toISOString() }).eq('id', w.id); guessworkWords[guessworkIndex] = { ...w, guesswork_count: (w.guesswork_count||0)+1 }; } catch(e) { /* silent */ }
                                                        }
                                                    }
                                                }}
                                                disabled={guessworkAIValidating || !guessworkInput.trim()}
                                                className="flex-1 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white py-4 rounded-2xl font-black uppercase text-sm"
                                            >
                                                {guessworkAIValidating ? '🤖 AI Validating...' : '✅ Check Answer'}
                                            </button>
                                            
                                            <button
                                                onClick={() => {
                                                    // Skip to next word
                                                    if (guessworkIndex < guessworkWords.length - 1) {
                                                        setGuessworkIndex(guessworkIndex + 1);
                                                        setGuessworkInput('');
                                                        setShowGuessworkAnswer(false);
                                                        setGuessworkDifficulty('');
                                                        setGuessworkAttempts(0);
                                                        setGuessworkAIResult(null);
                                                    } else {
                                                        alert('🎉 Exercise completed!');
                                                        setShowGuesswork(false);
                                                        setGuessworkWords([]);
                                                        setGuessworkIndex(0);
                                                        setGuessworkInput('');
                                                        setShowGuessworkAnswer(false);
                                                        setGuessworkDifficulty('');
                                                        setGuessworkAttempts(0);
                                                        setGuessworkAIResult(null);
                                                        setShowExercisesModal(true);
                                                    }
                                                }}
                                                className="px-6 bg-slate-700 hover:bg-slate-600 text-white py-4 rounded-2xl font-black uppercase text-sm"
                                            >
                                                ⏭️ Skip
                                            </button>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        {/* Result display */}
                                        <div className="space-y-6">
                                            {/* 🆕 V11.65: AI Result - Educational comparison, never 'Incorrect' */}
                                            {guessworkAIResult && (
                                                <div className={`p-6 rounded-2xl border-2 ${
                                                    guessworkAIResult.score === 'Active'
                                                        ? 'bg-green-900/20 border-green-500'
                                                        : guessworkAIResult.score === 'Emerging'
                                                            ? 'bg-yellow-900/20 border-yellow-500'
                                                            : 'bg-blue-900/20 border-blue-500'
                                                }`}>
                                                    <div className="flex items-center gap-3 mb-3">
                                                        <span className="text-3xl">
                                                            {guessworkAIResult.score === 'Active' ? '✅' : guessworkAIResult.score === 'Emerging' ? '↔️' : '📚'}
                                                        </span>
                                                        <h4 className="text-xl font-black text-white">
                                                            {guessworkAIResult.score === 'Active' ? 'Perfect match!' : guessworkAIResult.score === 'Emerging' ? 'Valid synonym!' : "Here's the difference"}
                                                        </h4>
                                                    </div>
                                                    <AIText text={guessworkAIResult.explanation} className="text-white/90 text-sm leading-relaxed" />
                                                    {guessworkAIResult.is_synonym && guessworkAIResult.synonym_note && (
                                                        <div className="text-yellow-200/80 text-xs mt-2 italic flex gap-1">
                                                            <span>💡</span><AIText text={guessworkAIResult.synonym_note} />
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                            
                                                                                  {/* Context sentence with correct answer highlighted */}
                                            <div className="bg-slate-800/50 p-4 rounded-xl">
                                                <p className="text-xs uppercase font-black text-slate-500 mb-2">Context:</p>
                                                <p className="text-white/90 text-sm leading-relaxed italic">
                                                    {highlightWordInContext(guessworkWords[guessworkIndex].context, guessworkWords[guessworkIndex].vocabulary)}
                                                </p>
                                            </div>

                                            {/* Your answer vs Correct answer */}
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <h4 className="text-xs uppercase font-black text-slate-500 mb-2">Your Answer:</h4>
                                                    <div className="bg-slate-800 p-4 rounded-xl text-lg text-white font-bold">
                                                        {guessworkInput || '(empty)'}
                                                    </div>
                                                </div>
                                                <div>
                                                    <h4 className="text-xs uppercase font-black text-green-400 mb-2">Correct Answer:</h4>
                                                    <div className="bg-green-900/20 border border-green-500/30 p-4 rounded-xl text-lg text-green-100 font-bold">
                                                        {guessworkWords[guessworkIndex].vocabulary}
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            {/* Difficulty */}
                                            <div className="flex justify-center items-center gap-4 p-4 bg-slate-800/50 rounded-2xl">
                                                <div className="text-center">
                                                    <p className="text-xs uppercase font-black text-slate-500 mb-1">Attempts</p>
                                                    <p className="text-2xl font-black text-white">{guessworkAttempts}</p>
                                                </div>
                                                <div className="text-center">
                                                    <p className="text-xs uppercase font-black text-slate-500 mb-1">Difficulty</p>
                                                    <p className={`text-2xl font-black ${
                                                        guessworkDifficulty === 'Active' ? 'text-green-400' :
                                                        guessworkDifficulty === 'Emerging' ? 'text-yellow-400' : 'text-red-400'
                                                    }`}>
                                                        {guessworkDifficulty}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        {/* Next button */}
                                        <div className="mt-6">
                                            <button
                                                onClick={async () => {
                                                    // Save difficulty
                                                    try {
                                                        const currentGuessworkWord = guessworkWords[guessworkIndex];
                                                    try {
                                                        await supabase.from('vocabulary_v4').update({ 
                                                            difficulty: guessworkDifficulty || 'Emerging',
                                                            guesswork_count: (currentGuessworkWord.guesswork_count || 0) + 1,
                                                            last_practiced_date: new Date().toISOString()
                                                        }).eq('id', currentGuessworkWord.id);
                                                    } catch (colErr) {
                                                        // guesswork_count column missing - save without it
                                                        await supabase.from('vocabulary_v4').update({ 
                                                            difficulty: guessworkDifficulty || 'Emerging',
                                                            last_practiced_date: new Date().toISOString()
                                                        }).eq('id', currentGuessworkWord.id);
                                                        console.warn('guesswork_count column missing - run DB migration in Settings');
                                                    }
                                                        // Update local state to keep counts accurate
                                                        const updatedGW = {...currentGuessworkWord, difficulty: guessworkDifficulty || 'Emerging', guesswork_count: (currentGuessworkWord.guesswork_count || 0) + 1};
                                                        setGuessworkWords(prev => prev.map(w => w.id === currentGuessworkWord.id ? updatedGW : w));
                                                        setWords(prev => prev.map(w => w.id === currentGuessworkWord.id ? updatedGW : w));
                                                    } catch (error) {
                                                        console.error('Error saving difficulty:', error);
                                                    }
                                                    
                                                    if (guessworkIndex < guessworkWords.length - 1) {
                                                        setGuessworkIndex(guessworkIndex + 1);
                                                        setGuessworkInput('');
                                                        setShowGuessworkAnswer(false);
                                                        setGuessworkDifficulty('');
                                                        setGuessworkAttempts(0);
                                                        setGuessworkAIResult(null);
                                                    } else {
                                                        alert('🎉 Exercise completed!');
                                                        setShowGuesswork(false);
                                                        setGuessworkWords([]);
                                                        setGuessworkIndex(0);
                                                        setGuessworkInput('');
                                                        setShowGuessworkAnswer(false);
                                                        setGuessworkDifficulty('');
                                                        setGuessworkAttempts(0);
                                                        setGuessworkAIResult(null);
                                                        setShowExercisesModal(true);
                                                    }
                                                }}
                                                className="w-full bg-orange-600 hover:bg-orange-500 text-white py-4 rounded-2xl font-black uppercase text-sm"
                                            >
                                                {guessworkIndex < guessworkWords.length - 1 ? 'Next Word →' : '✅ Finish'}
                                            </button>
                                        </div>
                                    </>
                                )}

                                {/* Progress bar */}
                                <div className="mt-6 bg-slate-800 rounded-full h-2 overflow-hidden">
                                    <div 
                                        className="bg-gradient-to-r from-orange-500 to-red-500 h-full transition-all duration-300"
                                        style={{ width: `${((guessworkIndex + 1) / guessworkWords.length) * 100}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 🆕 V11.20: Guesswork Hint Modal */}
                    {showGuessworkHint && guessworkWords.length > 0 && (
                        <div 
                            className="fixed inset-0 bg-black/80 z-[150] flex items-center justify-center p-4"
                            onClick={() => setShowGuessworkHint(false)}
                        >
                            <div 
                                className="bg-slate-900 rounded-3xl p-8 max-w-md w-full shadow-2xl border border-yellow-500/30"
                                onClick={e => e.stopPropagation()}
                            >
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="text-2xl font-black text-yellow-400 flex items-center gap-2">
                                        💡 Hint
                                    </h3>
                                    <button 
                                        onClick={() => setShowGuessworkHint(false)}
                                        className="text-slate-400 hover:text-white text-3xl"
                                    >
                                        ×
                                    </button>
                                </div>
                                
                                <div className="space-y-6">
                                    {/* 🆕 V11.21: Show only first letter */}
                                    <div>
                                        <p className="text-xs uppercase font-black text-slate-500 mb-2">First Letter</p>
                                        <p className="text-6xl font-black text-white">
                                            {guessworkWords[guessworkIndex].vocabulary[0].toUpperCase()}
                                            <span className="text-slate-700">______</span>
                                        </p>
                                    </div>
                                    
                                    {/* 🆕 V11.22: Show AI-generated meaning */}
                                    <div>
                                        <p className="text-xs uppercase font-black text-slate-500 mb-2">Meaning</p>
                                        {guessworkHintLoading ? (
                                            <div className="flex items-center gap-2 text-yellow-400">
                                                <i className="fas fa-spinner fa-spin"></i>
                                                <span className="text-sm">Generating meaning...</span>
                                            </div>
                                        ) : (
                                            <p className="text-lg text-yellow-300 leading-relaxed">
                                                {guessworkHintMeaning || 'Click the Hint button to generate meaning.'}
                                            </p>
                                        )}
                                    </div>
                                    
                                    {/* 🆕 V11.31: Show Family */}
                                    <div>
                                        <p className="text-xs uppercase font-black text-slate-500 mb-2">Family</p>
                                        <p className="text-2xl font-bold text-yellow-300">
                                            {guessworkWords[guessworkIndex].family || 'Not specified'}
                                        </p>
                                    </div>
                                </div>
                                
                                <button
                                    onClick={() => setShowGuessworkHint(false)}
                                    className="w-full mt-6 bg-yellow-600 hover:bg-yellow-500 text-white py-3 rounded-xl font-black uppercase text-sm"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    )}

                    {/* 🆕 V11.31: TRANSLATION EXERCISE MODAL */}
                    {showTranslation && translationWords.length > 0 && (
                        <div className="fixed inset-0 bg-black/95 z-[100] flex items-center justify-center p-2 sm:p-4 backdrop-blur-md overflow-y-auto">
                            <div className="w-full max-w-4xl my-2 sm:my-8">
                                {/* Header */}
                                <ExerciseHeader
                                    title="🌐 Translation"
                                    currentIndex={translationIndex}
                                    totalCount={translationWords.length}
                                    currentWord={translationWords[translationIndex].vocabulary}
                                    exerciseMode={exerciseMode}
                                    audioEnabled={false}
                                    onClose={() => {
                                        setShowTranslation(false);
                                        setTranslationWords([]);
                                        setTranslationIndex(0);
                                        setTranslationSpanish('');
                                        setTranslationInput(''); setShowTranslationHint(false); setTranslationHintMeaning('');
                                        setShowTranslationAnswer(false);
                                        setTranslationDifficulty('');
                                        setTranslationAttempts(0);
                                        setTranslationAIResult(null);
                                        setShowExercisesModal(true);
                                    }}
                                    onModeToggle={() => {
                                        setExerciseMode(exerciseMode === 'random' ? 'memory' : 'random');
                                        setShowTranslation(false);
                                        setTimeout(() => loadTranslation(), 100);
                                    }}
                                    onAudioToggle={null}
                                    onDictionary={(word) => {
                                        setSelectedWordForDict(word);
                                        setShowDictionaryModal(true);
                                    }}
                                    onEdit={() => {
                                        setEditingWord(translationWords[translationIndex]);
                                        setOriginalEditData({...translationWords[translationIndex]});
                                        setShowAddModal(true);
                                    }}
                                    onInfo={() => alert('🌐 TRANSLATION EXERCISE\n⛔ PRACTICE ONLY — does NOT classify vocabulary\n\n📊 CAMBRIDGE GRADING (V11.38):\n🟢 C1/C2: 0 errors - Perfect! 90-100%\n  • C2 = Very sophisticated grammar\n  • C1 = Advanced grammar\n🟡 B2: 1 error - Good, minor mistake, 70-85%\n🔴 B1: 2+ errors - Needs practice, 40-65%\n\n✅ Exact match = AI evaluates C1 or C2\n\n🎯 HOW TO PLAY:\n• Read Spanish translation\n• Translate to English\n• Type OR use 🎤 voice\n• Press ENTER to check\n• Get Cambridge evaluation\n• Detailed feedback on ENGLISH errors only\n\n🎤 VOICE TO TEXT:\n• Click microphone 🎤\n• Speak English translation\n• Text appears automatically\n• 📱 Mobile: Enable mic in browser settings\n\n🎮 BUTTONS:\n• 🧠/🎲 = Memory/Random\n• 🎤 = Voice input\n• 📖 = Dictionary\n• ✏️ = Edit word\n• × = Close\n• Check Translation = Evaluate\n• Next/Finish = Continue')}
                                />

                                {/* Spanish translation panel */}
                                {/* 🆕 V14.76: Hint button in the top-right corner, same as Guesswork.
                                    Opt-in only — the Spanish prompt itself is never altered or highlighted. */}
                                <div className="bg-gradient-to-br from-pink-600 to-purple-600 rounded-3xl p-8 mb-6 shadow-2xl relative">
                                    <button
                                        onClick={async () => {
                                            setShowTranslationHint(true);
                                            await generateTranslationHintMeaning(translationWords[translationIndex].vocabulary);
                                        }}
                                        className="absolute top-4 right-4 bg-yellow-500 hover:bg-yellow-400 text-white px-4 py-2 rounded-xl font-bold text-sm shadow-lg transition-all hover:scale-110"
                                        title="Show hint"
                                    >
                                        💡 Hint
                                    </button>

                                    <div className="text-center">
                                        <h3 className="text-white/70 text-sm font-bold uppercase mb-4">Translate to English:</h3>
                                        {translationLoading ? (
                                            <div className="flex items-center justify-center gap-3 text-white">
                                                <i className="fas fa-spinner fa-spin text-2xl"></i>
                                                <span className="text-xl">Generating Spanish translation...</span>
                                            </div>
                                        ) : (
                                            <p className="text-white text-2xl font-bold leading-relaxed">
                                                {translationSpanish}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {/* 🆕 V14.76: Hint panel — first letter of the practised word plus its meaning */}
                                {showTranslationHint && (
                                    <div className="bg-slate-800/70 border-2 border-yellow-500/40 rounded-3xl p-6 mb-6 shadow-xl">
                                        <div className="flex justify-between items-start mb-4">
                                            <h3 className="text-yellow-400 font-black uppercase text-sm">💡 Hint</h3>
                                            <button
                                                onClick={() => setShowTranslationHint(false)}
                                                className="text-slate-400 hover:text-white text-2xl leading-none"
                                            >×</button>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                            <div>
                                                <p className="text-xs uppercase font-black text-slate-500 mb-2">First Letter</p>
                                                <p className="text-5xl font-black text-white">
                                                    {translationWords[translationIndex].vocabulary[0].toUpperCase()}
                                                    <span className="text-slate-700">______</span>
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-xs uppercase font-black text-slate-500 mb-2">Meaning</p>
                                                {translationHintLoading ? (
                                                    <div className="flex items-center gap-2 text-yellow-400">
                                                        <i className="fas fa-spinner fa-spin"></i>
                                                        <span className="text-sm">Generating meaning...</span>
                                                    </div>
                                                ) : (
                                                    <p className="text-base text-yellow-300 leading-relaxed">
                                                        {translationHintMeaning || 'Click the Hint button to generate meaning.'}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {!showTranslationAnswer ? (
                                    <>
                                        {/* Input field with voice button */}
                                        <div className="relative mb-4">
                                            <textarea
                                                value={translationInput}
                                                onChange={(e) => setTranslationInput(e.target.value)}
                                                onKeyDown={async (e) => {
                                                    if (e.key === 'Enter' && !e.shiftKey) {
                                                        e.preventDefault();
                                                        
                                                        if (!showTranslationAnswer && translationInput.trim()) {
                                                            // First Enter: Validate translation
                                                            const aiResult = await validateTranslationWithAI(
                                                                translationInput,
                                                                translationWords[translationIndex].context,
                                                                translationSpanish,
                                                                translationWords[translationIndex].vocabulary
                                                            );
                                                            if (aiResult) {
                                                                setTranslationAIResult(aiResult);
                                                                setTranslationDifficulty(aiResult.score || 'Passive');
                                                                setTranslationAttempts(prev => prev + 1);
                                                                setShowTranslationAnswer(true);
                                                            }
                                                        }
                                                        // Second Enter is handled by useEffect
                                                    }
                                                }}
                                                placeholder="Write your English translation here... (Press ENTER to check)"
                                                className="w-full p-6 pr-16 rounded-xl text-lg min-h-[120px] resize-none"
                                                autoFocus
                                            />
                                            
                                            {/* 🆕 V11.38: Voice-to-text button */}
                                            <button
                                                onClick={() => startTranslationVoiceRecognition()}
                                                disabled={translationVoiceListening}
                                                className={`absolute top-3 right-3 p-3 rounded-lg transition-all ${
                                                    translationVoiceListening 
                                                        ? 'bg-red-500 animate-pulse' 
                                                        : 'bg-blue-500 hover:bg-blue-600'
                                                }`}
                                                title={translationVoiceListening ? "Listening..." : "Voice to text"}
                                            >
                                                <i className={`fas ${translationVoiceListening ? 'fa-microphone-slash' : 'fa-microphone'} text-white text-xl`}></i>
                                            </button>
                                        </div>
                                        
                                        <div className="flex gap-4">
                                            <button
                                                onClick={async () => {
                                                    if (!translationInput.trim()) return;
                                                    
                                                    const aiResult = await validateTranslationWithAI(
                                                        translationInput,
                                                        translationWords[translationIndex].context,
                                                        translationSpanish,
                                                        translationWords[translationIndex].vocabulary
                                                    );
                                                    if (aiResult) {
                                                        setTranslationAIResult(aiResult);
                                                        setTranslationDifficulty(aiResult.score || 'Passive');
                                                        setTranslationAttempts(prev => prev + 1);
                                                        setShowTranslationAnswer(true);
                                                    }
                                                }}
                                                disabled={translationAIValidating || !translationInput.trim()}
                                                className="flex-1 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white py-4 rounded-2xl font-black uppercase text-sm"
                                            >
                                                {translationAIValidating ? '🤖 Cambridge Examiner Evaluating...' : '✅ Check Translation'}
                                            </button>
                                            
                                            <button
                                                onClick={async () => {
                                                    // Skip to next word
                                                    if (translationIndex < translationWords.length - 1) {
                                                        const nextIndex = translationIndex + 1;
                                                        setTranslationIndex(nextIndex);
                                                        setTranslationInput(''); setShowTranslationHint(false); setTranslationHintMeaning('');
                                                        setShowTranslationAnswer(false);
                                                        setTranslationDifficulty('');
                                                        setTranslationAttempts(0);
                                                        setTranslationAIResult(null);
                                                        // Generate translation for next word
                                                        await generateSpanishTranslation(translationWords[nextIndex].context);
                                                    } else {
                                                        alert('🎉 Exercise completed!');
                                                        setShowTranslation(false);
                                                        setTranslationWords([]);
                                                        setTranslationIndex(0);
                                                        setTranslationSpanish('');
                                                        setTranslationInput(''); setShowTranslationHint(false); setTranslationHintMeaning('');
                                                        setShowTranslationAnswer(false);
                                                        setTranslationDifficulty('');
                                                        setTranslationAttempts(0);
                                                        setTranslationAIResult(null);
                                                        setShowExercisesModal(true);
                                                    }
                                                }}
                                                className="px-6 bg-slate-700 hover:bg-slate-600 text-white py-4 rounded-2xl font-black uppercase text-sm"
                                            >
                                                ⏭️ Skip
                                            </button>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        {/* 🆕 V14.6: Writing-style feedback with annotated text */}
                                        {translationAIResult && (
                                            <div className="space-y-4" onClick={() => translationPopup && setTranslationPopup(null)}>
                                                {/* Cambridge grade bar */}
                                                <div className={`flex items-center gap-3 px-5 py-3 rounded-2xl mb-2 ${
                                                    translationAIResult.grade === 'C2' ? 'bg-green-900/30 border border-green-500/40' :
                                                    translationAIResult.grade === 'C1' ? 'bg-teal-900/30 border border-teal-500/40' :
                                                    translationAIResult.grade === 'B2' ? 'bg-yellow-900/30 border border-yellow-500/40' :
                                                    'bg-red-900/30 border border-red-500/40'
                                                }`}>
                                                    <span className="text-2xl">
                                                        {translationAIResult.grade === 'C2' ? '🏆' : translationAIResult.grade === 'C1' ? '⭐' : translationAIResult.grade === 'B2' ? '📝' : '🔴'}
                                                    </span>
                                                    <span className={`text-xl font-black ${
                                                        translationAIResult.grade === 'C2' ? 'text-green-400' : translationAIResult.grade === 'C1' ? 'text-teal-400' : translationAIResult.grade === 'B2' ? 'text-yellow-400' : 'text-red-400'
                                                    }`}>Grade {translationAIResult.grade}</span>
                                                    <span className="text-slate-300 text-sm">({translationAIResult.percentage}%)</span>
                                                    <div className="text-slate-400 text-sm flex-1"><AIText text={translationAIResult.feedback} /></div>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); alert('🌐 TRANSLATION GRADING CRITERIA\n\n📊 CAMBRIDGE LEVELS:\n🏆 C2 (90–100%): Perfect or near-perfect, sophisticated expression\n⭐ C1 (75–89%): Advanced, at most 1 minor imprecision\n📝 B2 (60–74%): Good but 1–2 clear errors\n🔴 B1 (0–59%): 3+ errors or significant issues\n\n🔍 WHAT IS EVALUATED:\n• Grammar: tenses, articles, prepositions, agreement\n• Vocabulary: right word choice, spelling\n• Style: natural English expression\n\n❌ NOT penalised:\n• He/she gender differences\n• Punctuation-only differences\n• Correct idioms & set expressions\n\nClick on highlighted corrections to see details.'); }}
                                                        className="text-blue-400 hover:text-blue-300 text-base shrink-0"
                                                    >ℹ️</button>
                                                </div>

                                                {/* Annotated text — clickable corrections */}
                                                <div className="bg-slate-900/50 border border-slate-700 rounded-2xl p-5 relative">
                                                    <h4 className="text-slate-300 font-bold uppercase text-xs mb-3 flex items-center gap-2">
                                                        <span>📝</span> Your Translation
                                                        {/* 🆕 V14.77: only promise clickable corrections when some are actually marked */}
                                                        {translationAIResult.annotated_text && <span className="text-slate-500 text-xs font-normal normal-case">(click corrections for details)</span>}
                                                        {!translationAIResult.corrections_list?.length && <span className="text-green-400 text-xs font-normal normal-case">✓ no corrections</span>}
                                                    </h4>
                                                    {translationAIResult.annotated_text ? (
                                                        <div
                                                            className="text-base text-white leading-loose"
                                                            onClick={(e) => {
                                                                const target = e.target.closest('[data-trans-correction-id]');
                                                                if (target && translationAIResult.corrections_list) {
                                                                    const id = parseInt(target.dataset.transCorrectionId);
                                                                    const correction = translationAIResult.corrections_list.find(c => c.id === id);
                                                                    if (correction) {
                                                                        const rect = target.getBoundingClientRect();
                                                                        setTranslationPopup({ x: rect.left + rect.width / 2, y: rect.bottom + 8, yAbove: rect.top - 8, correction });
                                                                        e.stopPropagation();
                                                                    }
                                                                }
                                                            }}
                                                            dangerouslySetInnerHTML={{ __html: (() => {
                                                                let html = translationAIResult.annotated_text;
                                                                html = html.replace(/<(?!\/?(?:del|ins|note)(?:\s|>))[^>]*>/g, '');
                                                                let corrId = 0;
                                                                html = html.replace(/<del>(.*?)<\/del><ins>(.*?)<\/ins>/g, (match, del_text, ins_text) => {
                                                                    corrId++;
                                                                    return '<span data-trans-correction-id="' + corrId + '" style="cursor:pointer;border-bottom:2px dashed #f87171;padding-bottom:1px"><span style="color:#f87171;text-decoration:line-through;opacity:0.8">' + del_text + '</span><span style="color:#4ade80;font-weight:bold">' + ins_text + '</span></span>';
                                                                });
                                                                html = html.replace(/<ins>(.*?)<\/ins>/g, (match, ins_text) => {
                                                                    corrId++;
                                                                    return '<span data-trans-correction-id="' + corrId + '" style="cursor:pointer;color:#4ade80;font-weight:bold;border-bottom:2px dashed #4ade80;padding-bottom:1px">' + ins_text + '</span>';
                                                                });
                                                                html = html.replace(/<del>(.*?)<\/del>/g, (match, del_text) => {
                                                                    corrId++;
                                                                    return '<span data-trans-correction-id="' + corrId + '" style="cursor:pointer;color:#f87171;text-decoration:line-through;opacity:0.8;border-bottom:2px dashed #f87171;padding-bottom:1px">' + del_text + '</span>';
                                                                });
                                                                html = html.replace(/<note>(.*?)<\/note>/g, '<span style="color:#fb923c;font-style:italic;font-size:0.85em"> — $1</span>');
                                                                return html;
                                                            })() }}
                                                        />
                                                    ) : (
                                                        <p className="text-base text-white leading-loose">{translationInput}</p>
                                                    )}

                                                    {/* 🆕 V14.77: corrections that could not be located in the text are listed
                                                        here, so every counted error is visible somewhere. */}
                                                    {translationAIResult.general_notes?.length > 0 && (
                                                        <ul className="mt-4 space-y-2">
                                                            {translationAIResult.general_notes.map((n, i) => (
                                                                <li key={i} className="text-sm bg-red-900/20 border border-red-500/30 rounded-xl p-3">
                                                                    <span className="text-red-300 font-black uppercase text-[10px] mr-2">{n.type || 'note'}</span>
                                                                    <span className="text-slate-200">{n.explanation || n.corrected || ''}</span>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    )}

                                                    {/* Popup - smart positioning */}
                                                    {translationPopup && (() => {
                                                        const pw = 300, ph = 190;
                                                        const left = Math.max(pw/2 + 8, Math.min(translationPopup.x, window.innerWidth - pw/2 - 8));
                                                        const top = translationPopup.y + ph > window.innerHeight
                                                            ? Math.max(8, translationPopup.yAbove - ph)
                                                            : translationPopup.y;
                                                        return (
                                                            <div
                                                                className="fixed z-[200] bg-slate-800 border border-slate-600 rounded-xl p-4 shadow-2xl"
                                                                style={{ left: left + 'px', top: top + 'px', transform: 'translateX(-50%)', width: pw + 'px' }}
                                                                onClick={(e) => e.stopPropagation()}
                                                            >
                                                                <div className="flex justify-between items-start mb-2">
                                                                    <span className={`text-xs uppercase font-black ${
                                                                        translationPopup.correction.type === 'grammar' ? 'text-red-400' :
                                                                        translationPopup.correction.type === 'vocabulary' ? 'text-orange-400' :
                                                                        translationPopup.correction.type === 'spelling' ? 'text-red-300' :
                                                                        'text-yellow-400'
                                                                    }`}>
                                                                        {translationPopup.correction.type === 'grammar' ? '⚠️' : translationPopup.correction.type === 'spelling' ? '🔤' : translationPopup.correction.type === 'vocabulary' ? '📖' : '💡'} {translationPopup.correction.type}
                                                                    </span>
                                                                    <button onClick={() => setTranslationPopup(null)} className="text-slate-400 hover:text-white text-lg leading-none ml-3">&times;</button>
                                                                </div>
                                                                {translationPopup.correction.original && (
                                                                    <p className="text-sm mb-1">
                                                                        <span className="text-red-300 line-through">{translationPopup.correction.original}</span>
                                                                        <span className="text-white mx-2">→</span>
                                                                        <span className="text-green-300 font-bold">{translationPopup.correction.corrected}</span>
                                                                    </p>
                                                                )}
                                                                <AIText text={translationPopup.correction.explanation} className="text-slate-300 text-sm" />
                                                            </div>
                                                        );
                                                    })()}
                                                </div>

                                                {/* 🆕 V14.76: when the answer is correct but worded differently, the stored
                                                    sentence is an ALTERNATIVE, not a correction. Decided here rather than by
                                                    the model, so the label can't contradict the marking. */}
                                                {(() => {
                                                    const stored = translationWords[translationIndex].context;
                                                    const norm = s => (s || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
                                                    const noErrors = !(translationAIResult?.corrections_list?.length);
                                                    const isAlternative = noErrors && norm(translationInput) !== norm(stored);
                                                    return (
                                                        <div>
                                                            <h4 className={`text-xs uppercase font-black mb-2 ${isAlternative ? 'text-emerald-400' : 'text-indigo-400'}`}>
                                                                {isAlternative ? '💡 Another way to say it:' : 'Original English:'}
                                                            </h4>
                                                            <div className={`p-4 rounded-xl text-base ${
                                                                isAlternative
                                                                    ? 'bg-emerald-900/20 border border-emerald-500/30 text-emerald-100'
                                                                    : 'bg-indigo-900/20 border border-indigo-500/30 text-indigo-100'
                                                            }`}>
                                                                {stored}
                                                            </div>
                                                            {isAlternative && (
                                                                <p className="text-slate-500 text-xs mt-2">
                                                                    Your translation is correct — this is simply another valid way to express the same sentence.
                                                                </p>
                                                            )}
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        )}
                                        
                                        {/* Next button */}
                                        <div className="mt-6">
                                            <button
                                                onClick={async () => {
                                                    // Save difficulty
                                                    try {
                                                        const currentTranslationWord = translationWords[translationIndex];
                            await supabase
                                .from('vocabulary_v4')
                                .update({ 

                                    translation_count: (currentTranslationWord.translation_count || 0) + 1,
                                    translation_best_grade: translationAIResult?.grade || currentTranslationWord.translation_best_grade,
                                    last_practiced_date: new Date().toISOString()
                                })
                                .eq('id', currentTranslationWord.id);
                                                    } catch (error) {
                                                        console.error('Error saving difficulty:', error);
                                                    }
                                                    
                                                    if (translationIndex < translationWords.length - 1) {
                                                        const nextIndex = translationIndex + 1;
                                                        setTranslationIndex(nextIndex);
                                                        setTranslationInput(''); setShowTranslationHint(false); setTranslationHintMeaning('');
                                                        setShowTranslationAnswer(false);
                                                        setTranslationDifficulty('');
                                                        setTranslationAttempts(0);
                                                        setTranslationAIResult(null);
                                                        // Generate translation for next word
                                                        await generateSpanishTranslation(translationWords[nextIndex].context);
                                                    } else {
                                                        alert('🎉 Exercise completed!');
                                                        setShowTranslation(false);
                                                        setTranslationWords([]);
                                                        setTranslationIndex(0);
                                                        setTranslationSpanish('');
                                                        setTranslationInput(''); setShowTranslationHint(false); setTranslationHintMeaning('');
                                                        setShowTranslationAnswer(false);
                                                        setTranslationDifficulty('');
                                                        setTranslationAttempts(0);
                                                        setTranslationAIResult(null);
                                                        setShowExercisesModal(true);
                                                    }
                                                }}
                                                className="w-full bg-pink-600 hover:bg-pink-500 text-white py-4 rounded-2xl font-black uppercase text-sm"
                                            >
                                                {translationIndex < translationWords.length - 1 ? 'Next Word →' : '✅ Finish'}
                                            </button>
                                        </div>
                                    </>
                                )}

                                {/* Progress bar */}
                                <div className="mt-6 bg-slate-800 rounded-full h-2 overflow-hidden">
                                    <div 
                                        className="bg-gradient-to-r from-pink-500 to-purple-500 h-full transition-all duration-300"
                                        style={{ width: `${((translationIndex + 1) / translationWords.length) * 100}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 🆕 V14.0: WRITING EXERCISE */}
                    {showWriting && writingWords.length > 0 && (
                        <div className="fixed inset-0 bg-black/95 z-[100] flex items-center justify-center p-2 sm:p-4 backdrop-blur-md overflow-y-auto" onClick={() => writingPopup && setWritingPopup(null)}>
                            <div className="w-full max-w-4xl my-2 sm:my-8">
                                {/* Header — always visible */}
                                <div className="flex justify-between items-center mb-6">
                                    <h2 className="text-2xl font-black main-gradient uppercase italic">✍️ Writing</h2>
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={() => alert('✍️ WRITING EXERCISE — GRADING CRITERIA\n\n📊 CAMBRIDGE LEVELS:\n🏆 C2 (90–100%): Near-native, sophisticated, no real errors\n⭐ C1 (75–89%): Advanced, at most 1 minor imprecision\n📝 B2 (60–74%): Good but 1–2 clear errors\n🔴 B1 (0–59%): 3+ errors or clarity issues\n\n🔍 WHAT IS EVALUATED:\n• Grammar: articles, tenses, prepositions, agreement\n• Spelling: British English (colour, organise, etc.)\n• Semantics: Words used with correct meaning in context\n• Vocabulary: Target words used naturally and correctly\n• Punctuation & Style\n\n✅ NOT penalised:\n• Correct idioms & set expressions\n• Alternative correct phrasings\n\n💡 TIPS:\n• Write 25–75 words\n• Use ALL target words naturally\n• Click on highlighted corrections to see details')}
                                            className="text-blue-400 hover:text-blue-300 text-lg p-1"
                                        >ℹ️</button>
                                        <button
                                            onClick={() => {
                                                setShowWriting(false);
                                                setWritingWords([]);
                                                setWritingText('');
                                                setWritingFeedback(null);
                                                setWritingLoading(false);
                                                setWritingPopup(null);
                                                setShowExercisesModal(true);
                                            }}
                                            className="text-slate-400 hover:text-white text-3xl leading-none p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl hover:bg-slate-700/50 transition-colors"
                                            aria-label="Close"
                                        >&times;</button>
                                    </div>
                                </div>

                                {/* Target words — only shown when writing, hidden during feedback */}
                                {!writingFeedback && (
                                    <div className="bg-gradient-to-br from-teal-600 to-emerald-600 rounded-3xl p-6 mb-6 shadow-2xl">
                                        <h3 className="text-white/70 text-sm font-bold uppercase mb-4 text-center">Use these words in your paragraph:</h3>
                                        <div className="flex flex-wrap justify-center gap-3">
                                            {writingWords.map((w, i) => (
                                                <span key={i} className="px-4 py-2 rounded-full text-base font-bold bg-white/20 text-white">
                                                    {w.vocabulary}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {!writingFeedback ? (
                                    <>
                                        {/* Writing area */}
                                        <textarea
                                            value={writingText}
                                            onChange={(e) => {
                                                setWritingText(e.target.value);
                                                setWritingWordCount(e.target.value.trim() ? e.target.value.trim().split(/\s+/).length : 0);
                                            }}
                                            placeholder="Write your paragraph here (25-75 words). Try to use the vocabulary words naturally in context..."
                                            className="w-full p-6 rounded-xl text-lg min-h-[200px] resize-none mb-2"
                                            autoFocus
                                        />
                                        
                                        {/* Word count */}
                                        <div className="flex justify-between items-center mb-4">
                                            <span className={`text-sm font-bold ${
                                                writingWordCount < 15 ? 'text-red-400' : 
                                                writingWordCount < 25 ? 'text-yellow-400' : 
                                                writingWordCount > 100 ? 'text-yellow-400' : 'text-green-400'
                                            }`}>
                                                {writingWordCount} words {writingWordCount < 15 ? '(too short)' : writingWordCount < 25 ? '(almost there)' : writingWordCount > 100 ? '(quite long)' : '✓'}
                                            </span>
                                            <span className="text-slate-500 text-sm">Target: 25-75 words</span>
                                        </div>
                                        
                                        <div className="flex gap-4">
                                            <button
                                                onClick={evaluateWriting}
                                                disabled={writingLoading || writingWordCount < 10}
                                                className="flex-1 bg-teal-600 hover:bg-teal-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white py-4 rounded-2xl font-black uppercase text-sm"
                                            >
                                                {writingLoading ? '🤖 Evaluating your writing...' : '📝 Submit for Evaluation'}
                                            </button>
                                            <button
                                                onClick={() => loadWriting()}
                                                className="px-6 bg-slate-700 hover:bg-slate-600 text-white py-4 rounded-2xl font-black uppercase text-sm"
                                            >
                                                🔄 New Words
                                            </button>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        {/* Compact grade line - Cambridge levels */}
                                        <div className={`flex items-center gap-3 px-5 py-3 rounded-2xl mb-6 ${
                                            writingFeedback.grade === 'C2' ? 'bg-green-900/30 border border-green-500/40' :
                                            writingFeedback.grade === 'C1' ? 'bg-teal-900/30 border border-teal-500/40' :
                                            writingFeedback.grade === 'B2' ? 'bg-yellow-900/30 border border-yellow-500/40' :
                                            'bg-red-900/30 border border-red-500/40'
                                        }`}>
                                            <span className="text-2xl">
                                                {writingFeedback.grade === 'C2' ? '🏆' : writingFeedback.grade === 'C1' ? '⭐' : writingFeedback.grade === 'B2' ? '📝' : '🔴'}
                                            </span>
                                            <span className={`text-xl font-black ${
                                                writingFeedback.grade === 'C2' ? 'text-green-400' : writingFeedback.grade === 'C1' ? 'text-teal-400' : writingFeedback.grade === 'B2' ? 'text-yellow-400' : 'text-red-400'
                                            }`}>Grade {writingFeedback.grade}</span>
                                            <span className="text-slate-300 text-sm">({writingFeedback.percentage}%)</span>
                                            <div className="text-slate-400 text-sm flex-1"><AIText text={writingFeedback.summary} /></div>
                                        </div>

                                        {/* Annotated text — clickable corrections */}
                                        <div className="bg-slate-900/50 border border-slate-700 rounded-2xl p-6 mb-6 relative">
                                            <h4 className="text-slate-300 font-bold uppercase text-sm mb-4 flex items-center gap-2">
                                                <span className="text-2xl">📝</span> Your Text <span className="text-slate-500 font-normal normal-case">(click corrections for details)</span>
                                            </h4>
                                            <div 
                                                className="text-base text-white leading-loose"
                                                onClick={(e) => {
                                                    const target = e.target.closest('[data-correction-id]');
                                                    if (target && writingFeedback.corrections_list) {
                                                        const id = parseInt(target.dataset.correctionId);
                                                        const correction = writingFeedback.corrections_list.find(c => c.id === id);
                                                        if (correction) {
                                                            const rect = target.getBoundingClientRect();
                                                            setWritingPopup({
                                                                x: rect.left + rect.width / 2,
                                                                y: rect.bottom + 8,
                                                                yAbove: rect.top - 8,
                                                                correction
                                                            });
                                                            e.stopPropagation();
                                                        }
                                                    }
                                                }}
                                                dangerouslySetInnerHTML={{ __html: (() => {
                                                    let html = (writingFeedback.annotated_text || writingText);
                                                    html = html.replace(/<(?!\/?(?:del|ins|note)(?:\s|>))[^>]*>/g, '');
                                                    let corrId = 0;
                                                    html = html.replace(/<del>(.*?)<\/del><ins>(.*?)<\/ins>/g, (match, del_text, ins_text) => {
                                                        corrId++;
                                                        return '<span data-correction-id="' + corrId + '" style="cursor:pointer;border-bottom:2px dashed #f87171;padding-bottom:1px"><span style="color:#f87171;text-decoration:line-through;opacity:0.8">' + del_text + '</span><span style="color:#4ade80;font-weight:bold">' + ins_text + '</span></span>';
                                                    });
                                                    html = html.replace(/<ins>(.*?)<\/ins>/g, (match, ins_text) => {
                                                        corrId++;
                                                        return '<span data-correction-id="' + corrId + '" style="cursor:pointer;color:#4ade80;font-weight:bold;border-bottom:2px dashed #4ade80;padding-bottom:1px">' + ins_text + '</span>';
                                                    });
                                                    html = html.replace(/<del>(.*?)<\/del>/g, (match, del_text) => {
                                                        corrId++;
                                                        return '<span data-correction-id="' + corrId + '" style="cursor:pointer;color:#f87171;text-decoration:line-through;opacity:0.8;border-bottom:2px dashed #f87171;padding-bottom:1px">' + del_text + '</span>';
                                                    });
                                                    html = html.replace(/<note>(.*?)<\/note>/g, '<span style="color:#fb923c;font-style:italic;font-size:0.85em"> — $1</span>');
                                                    return html;
                                                })() }}
                                            />
                                            
                                            {/* Popup for correction details - smart positioning */}
                                            {writingPopup && (() => {
                                                const pw = 300, ph = 190;
                                                const left = Math.max(pw/2 + 8, Math.min(writingPopup.x, window.innerWidth - pw/2 - 8));
                                                const top = writingPopup.y + ph > window.innerHeight
                                                    ? Math.max(8, writingPopup.yAbove - ph)
                                                    : writingPopup.y;
                                                return (
                                                    <div 
                                                        className="fixed z-[200] bg-slate-800 border border-slate-600 rounded-xl p-4 shadow-2xl"
                                                        style={{ left: left + 'px', top: top + 'px', transform: 'translateX(-50%)', width: pw + 'px' }}
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        <div className="flex justify-between items-start mb-2">
                                                            <span className={`text-xs uppercase font-black ${
                                                                writingPopup.correction.type === 'semantic' ? 'text-orange-400' :
                                                                writingPopup.correction.type === 'grammar' ? 'text-red-400' :
                                                                writingPopup.correction.type === 'spelling' ? 'text-red-300' :
                                                                'text-yellow-400'
                                                            }`}>
                                                                {writingPopup.correction.type === 'grammar' ? '⚠️' : writingPopup.correction.type === 'spelling' ? '🔤' : writingPopup.correction.type === 'semantic' ? '🧠' : writingPopup.correction.type === 'punctuation' ? '📌' : '💡'} {writingPopup.correction.type}
                                                            </span>
                                                            <button onClick={() => setWritingPopup(null)} className="text-slate-400 hover:text-white text-lg leading-none ml-3">&times;</button>
                                                        </div>
                                                        {writingPopup.correction.original && (
                                                            <p className="text-sm mb-1">
                                                                <span className="text-red-300 line-through">{writingPopup.correction.original}</span>
                                                                <span className="text-white mx-2">→</span>
                                                                <span className="text-green-300 font-bold">{writingPopup.correction.corrected}</span>
                                                            </p>
                                                        )}
                                                        <AIText text={writingPopup.correction.explanation} className="text-slate-300 text-sm" />
                                                    </div>
                                                );
                                            })()}
                                        </div>

                                        {/* Improved version */}
                                        {writingFeedback.improved_version && (
                                            <div className="bg-teal-900/20 border border-teal-500/30 rounded-2xl p-6 mb-6">
                                                <h4 className="text-teal-400 font-bold uppercase text-sm mb-4 flex items-center gap-2">
                                                    <span className="text-2xl">✨</span> Improved Version
                                                </h4>
                                                <div className="text-base text-teal-100 leading-loose">
                                                    {writingFeedback.improved_version}
                                                </div>
                                            </div>
                                        )}

                                        {/* Vocabulary usage notes */}
                                        {writingFeedback.word_usage_notes && writingFeedback.word_usage_notes.length > 0 && (
                                            <div className="bg-teal-900/20 border border-teal-500/30 rounded-2xl p-6 mb-6">
                                                <h4 className="text-teal-300 font-bold uppercase text-sm mb-3 flex items-center gap-2">
                                                    <span className="text-2xl">📚</span> Vocabulary Usage ({writingFeedback.words_used?.length || 0}/{writingWords.length} words)
                                                </h4>
                                                <div className="space-y-2">
                                                    {writingFeedback.word_usage_notes.map((note, i) => (
                                                        <div key={i} className="text-sm text-teal-100/80 flex gap-1.5">
                                                            <span className="opacity-50">•</span><AIText text={note} />
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* 🆕 V14.6: Naturalness notes — separate from grade */}
                                        {writingFeedback.naturalness_notes && writingFeedback.naturalness_notes.length > 0 && (
                                            <div className="bg-blue-900/20 border border-blue-500/30 rounded-2xl p-6 mb-6">
                                                <h4 className="text-blue-300 font-bold uppercase text-sm mb-3 flex items-center gap-2">
                                                    <span className="text-2xl">🗣️</span> Naturalness & Fluency
                                                    <span className="text-blue-500 text-xs font-normal normal-case">(does not affect grade)</span>
                                                </h4>
                                                <div className="space-y-2">
                                                    {writingFeedback.naturalness_notes.map((note, i) => (
                                                        <div key={i} className="text-sm text-blue-100/80 flex gap-1.5">
                                                            <span className="opacity-50">•</span><AIText text={note} />
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Action buttons */}
                                        <div className="flex gap-3">
                                            <button
                                                onClick={() => {
                                                    setWritingText('');
                                                    setWritingFeedback(null);
                                                    setWritingWordCount(0);
                                                    setWritingPopup(null);
                                                }}
                                                className="flex-1 bg-teal-600 hover:bg-teal-500 text-white py-4 rounded-2xl font-black uppercase text-sm"
                                            >
                                                ✍️ Try Again
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setWritingFeedback(null);
                                                    setWritingText('');
                                                    setWritingWordCount(0);
                                                    setWritingPopup(null);
                                                    loadWriting();
                                                }}
                                                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-4 rounded-2xl font-black uppercase text-sm"
                                            >
                                                🔄 New Words
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    )}

                    {/* 🆕 V11.41: STATS DASHBOARD MODAL */}
                    {showStats && (
                        <div className="fixed inset-0 bg-black/95 z-[100] flex items-start sm:items-center justify-center p-2 sm:p-4 backdrop-blur-md overflow-y-auto">
                            <div className="glass-card w-full max-w-5xl border-indigo-500/30 rounded-2xl sm:rounded-[2rem] my-2 sm:my-0 overflow-hidden">
                                {/* Header */}
                                <div className="flex justify-between items-center px-4 sm:px-8 py-3 sm:py-5 border-b border-white/10">
                                    <div className="flex items-center gap-2">
                                        <h2 className="text-lg sm:text-2xl font-black main-gradient uppercase italic">📊 Statistics Dashboard</h2>
                                        <button
                                            onClick={() => alert('ℹ️ HOW EFFORT LEVELS WORK\n\n🎯 SYSTEM: Single classification across all exercises\n\n🟢 ACTIVE: You retrieve it instantly\n🟡 EMERGING: You find it after a moment\n🔴 PASSIVE: You recognise but can\'t produce it\n⫪ UNRATED: Not yet classified')}
                                            className="text-blue-400 hover:text-blue-300 text-base"
                                            title="How Effort levels work"
                                        >
                                            ℹ️
                                        </button>
                                    </div>
                                    <button onClick={() => setShowStats(false)} className="text-slate-400 hover:text-white text-2xl sm:text-3xl leading-none">&times;</button>
                                </div>

                                <div className="px-4 sm:px-8 py-4 sm:py-6 overflow-y-auto max-h-[85vh] sm:max-h-[80vh] custom-scroll">
                                {statsData ? (
                                    <div className="space-y-3">

                                        {/* Overview — 4 numbers in a row */}
                                        <div className="grid grid-cols-4 gap-2 sm:gap-3">
                                            <div className="glass-card rounded-xl p-2 sm:p-3 text-center">
                                                <p className="text-slate-400 text-[8px] sm:text-[10px] uppercase font-bold tracking-widest">Total</p>
                                                <p className="text-white text-base sm:text-2xl font-black">{statsData.overview.total}</p>
                                            </div>
                                            <div className="glass-card rounded-xl p-2 sm:p-3 text-center">
                                                <p className="text-slate-400 text-[8px] sm:text-[10px] uppercase font-bold tracking-widest">Practiced</p>
                                                <p className="text-green-400 text-base sm:text-2xl font-black">{statsData.overview.practiced}</p>
                                                <p className="text-green-300 text-[8px]">{statsData.overview.practicedPercent}%</p>
                                            </div>
                                            <div className="glass-card rounded-xl p-2 sm:p-3 text-center">
                                                <p className="text-slate-400 text-[8px] sm:text-[10px] uppercase font-bold tracking-widest">Pending</p>
                                                <p className="text-yellow-400 text-base sm:text-2xl font-black">{statsData.overview.pending}</p>
                                            </div>
                                            <div className="glass-card rounded-xl p-2 sm:p-3 text-center">
                                                <p className="text-slate-400 text-[8px] sm:text-[10px] uppercase font-bold tracking-widest">Favourites</p>
                                                <p className="text-purple-400 text-base sm:text-2xl font-black">{statsData.overview.favourites}</p>
                                            </div>
                                        </div>

                                        {/* Difficulty Distribution — coloured cards, no big emoji circles */}
                                        <div className="glass-card rounded-xl px-3 sm:px-5 py-3">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-[9px] sm:text-xs font-black uppercase text-slate-400 tracking-widest">Difficulty Distribution</span>
                                                <button onClick={resetDifficulty} className="text-[8px] sm:text-[9px] font-black uppercase bg-yellow-600/20 hover:bg-yellow-600/30 border border-yellow-500/30 text-yellow-300 px-2 sm:px-3 py-1 rounded-full transition-colors">🟡 Reset Difficulty</button>
                                            </div>
                                            <div className="grid grid-cols-4 gap-2">
                                                <div className="text-center bg-green-900/20 border border-green-500/20 rounded-xl py-2 sm:py-3 tooltip" data-tip="Active: Retrieves the word instantly. Speak without thinking.">
                                                    <p className="text-white font-black text-xl sm:text-3xl">{statsData.difficulty.easy}</p>
                                                    <p className="text-green-400 text-[10px] sm:text-xs font-bold mt-0.5">🟢 Active</p>
                                                </div>
                                                <div className="text-center bg-yellow-900/20 border border-yellow-500/20 rounded-xl py-2 sm:py-3 tooltip" data-tip="Emerging: Searches for the word in your mental archive.">
                                                    <p className="text-white font-black text-xl sm:text-3xl">{statsData.difficulty.medium}</p>
                                                    <p className="text-yellow-400 text-[10px] sm:text-xs font-bold mt-0.5">🟡 Emerging</p>
                                                </div>
                                                <div className="text-center bg-red-900/20 border border-red-500/20 rounded-xl py-2 sm:py-3 tooltip" data-tip="Passive: Decodes others' messages.">
                                                    <p className="text-white font-black text-xl sm:text-3xl">{statsData.difficulty.hard}</p>
                                                    <p className="text-red-400 text-[10px] sm:text-xs font-bold mt-0.5">🔴 Passive</p>
                                                </div>
                                                <div className="text-center bg-slate-800/60 border border-slate-600/30 rounded-xl py-2 sm:py-3">
                                                    <p className="text-white font-black text-xl sm:text-3xl">{statsData.difficulty.notPracticed}</p>
                                                    <p className="text-slate-500 text-[10px] sm:text-xs font-bold mt-0.5">⫪ Unrated</p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Exercise Statistics */}
                                        <div className="glass-card rounded-xl px-3 sm:px-5 py-3">
                                            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                                                <h3 className="text-base sm:text-lg font-black text-white">Exercise Statistics</h3>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="text-[8px] text-slate-500 italic hidden sm:inline">(Click to see words hardest→easiest)</span>
                                                    <button onClick={resetExerciseStats} className="text-[8px] sm:text-[9px] font-black uppercase bg-orange-600/20 hover:bg-orange-600/30 border border-orange-500/30 text-orange-300 px-2 sm:px-3 py-1 rounded-full transition-colors">🔠 Reset Exercise Stats</button>
                                                </div>
                                            </div>
                                            <div className="space-y-1.5">

                                                {/* Flashcards */}
                                                <button onClick={() => openExerciseDrillDown('flashcard')} className="w-full bg-purple-900/20 hover:bg-purple-900/40 px-3 sm:px-4 py-2.5 rounded-xl transition-all border border-green-500/20 hover:border-purple-500 text-left">
                                                    <div className="flex flex-wrap justify-between items-center gap-1">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-white font-bold text-sm">🃏 Flashcards</span>
                                                            <span className="text-[8px] font-black uppercase bg-green-900/40 text-green-400 border border-green-500/40 px-1.5 py-0.5 rounded-full">Classifies</span>
                                                        </div>
                                                        <div className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm">
                                                            <span className="text-green-400 font-bold">🟢 {statsData.exercises.flashcard.active}</span>
                                                            <span className="text-yellow-400 font-bold">🟡 {statsData.exercises.flashcard.emerging}</span>
                                                            <span className="text-red-400 font-bold">🔴 {statsData.exercises.flashcard.passive}</span>
                                                            <span className="text-purple-300 font-black">{statsData.exercises.flashcard.count} practiced</span>
                                                        </div>
                                                    </div>
                                                </button>

                                                {/* Dictation */}
                                                <button onClick={() => openExerciseDrillDown('dictation')} className="w-full flex flex-wrap justify-between items-center gap-1 bg-blue-900/20 hover:bg-blue-900/40 px-3 sm:px-4 py-2.5 rounded-xl transition-all border border-transparent hover:border-blue-500 text-left">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-white font-bold text-sm">🎤 Dictation</span>
                                                        <span className="text-[8px] font-black uppercase bg-slate-800 text-slate-500 border border-slate-600 px-1.5 py-0.5 rounded-full">Practice only</span>
                                                    </div>
                                                    <div className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm">
                                                        <span className="text-green-300 font-semibold">C2: <span className="font-black text-white">{statsData.exercises.dictation.gradeC2 || 0}</span></span>
                                                        <span className="text-teal-300 font-semibold">C1: <span className="font-black text-white">{statsData.exercises.dictation.gradeC1 || 0}</span></span>
                                                        <span className="text-yellow-300 font-semibold">B2: <span className="font-black text-white">{statsData.exercises.dictation.gradeB2 || 0}</span></span>
                                                        <span className="text-orange-300 font-semibold">B1: <span className="font-black text-white">{statsData.exercises.dictation.gradeB1 || 0}</span></span>
                                                        <span className="text-blue-300 font-black">{statsData.exercises.dictation.count} practiced</span>
                                                    </div>
                                                </button>

                                                {/* Selection */}
                                                <button onClick={() => openExerciseDrillDown('selection')} className="w-full bg-green-900/20 hover:bg-green-900/40 px-3 sm:px-4 py-2.5 rounded-xl transition-all border border-green-500/20 hover:border-green-500 text-left">
                                                    <div className="flex flex-wrap justify-between items-center gap-1">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-white font-bold text-sm">✔ Selection</span>
                                                            <span className="text-[8px] font-black uppercase bg-green-900/40 text-green-400 border border-green-500/40 px-1.5 py-0.5 rounded-full">Classifies</span>
                                                        </div>
                                                        <div className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm">
                                                            <span className="text-green-400 font-bold">🟢 {statsData.exercises.selection.active}</span>
                                                            <span className="text-yellow-400 font-bold">🟡 {statsData.exercises.selection.emerging}</span>
                                                            <span className="text-red-400 font-bold">🔴 {statsData.exercises.selection.passive}</span>
                                                            <span className="text-green-300 font-black">{statsData.exercises.selection.count} practiced</span>
                                                        </div>
                                                    </div>
                                                </button>

                                                {/* Guesswork */}
                                                <button onClick={() => openExerciseDrillDown('guesswork')} className="w-full bg-orange-900/20 hover:bg-orange-900/40 px-3 sm:px-4 py-2.5 rounded-xl transition-all border border-green-500/20 hover:border-orange-500 text-left">
                                                    <div className="flex flex-wrap justify-between items-center gap-1">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-white font-bold text-sm">✏️ Guesswork</span>
                                                            <span className="text-[8px] font-black uppercase bg-green-900/40 text-green-400 border border-green-500/40 px-1.5 py-0.5 rounded-full">Classifies</span>
                                                        </div>
                                                        <div className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm">
                                                            <span className="text-green-400 font-bold">🟢 {statsData.exercises.guesswork.active}</span>
                                                            <span className="text-yellow-400 font-bold">🟡 {statsData.exercises.guesswork.emerging}</span>
                                                            <span className="text-red-400 font-bold">🔴 {statsData.exercises.guesswork.passive}</span>
                                                            <span className="text-orange-300 font-black">{statsData.exercises.guesswork.count} practiced</span>
                                                        </div>
                                                    </div>
                                                </button>

                                                {/* Translation */}
                                                <button onClick={() => openExerciseDrillDown('translation')} className="w-full bg-pink-900/20 hover:bg-pink-900/40 px-3 sm:px-4 py-2.5 rounded-xl transition-all border border-transparent hover:border-pink-500 text-left">
                                                    <div className="flex flex-wrap justify-between items-center gap-1">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-white font-bold text-sm">🌐 Translation</span>
                                                            <span className="text-[8px] font-black uppercase bg-slate-800 text-slate-500 border border-slate-600 px-1.5 py-0.5 rounded-full">Practice only</span>
                                                        </div>
                                                        <div className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm">
                                                            <span className="text-green-300 font-semibold">C2: <span className="font-black text-white">{statsData.exercises.translation.gradeC2}</span></span>
                                                            <span className="text-blue-300 font-semibold">C1: <span className="font-black text-white">{statsData.exercises.translation.gradeC1}</span></span>
                                                            <span className="text-yellow-300 font-semibold">B2: <span className="font-black text-white">{statsData.exercises.translation.gradeB2}</span></span>
                                                            <span className="text-orange-300 font-semibold">B1: <span className="font-black text-white">{statsData.exercises.translation.gradeB1}</span></span>
                                                            <span className="text-pink-300 font-black">{statsData.exercises.translation.count} practiced</span>
                                                        </div>
                                                    </div>
                                                </button>

                                            </div>
                                        </div>

                                    </div>
                                ) : (
                                    <div className="text-center py-12"><p className="text-slate-500 text-xl">No data yet. Start practicing!</p></div>
                                )}
                                </div>
                            </div>
                        </div>
                    )}


                    {/* 🆕 V11.44: EXERCISE DRILL-DOWN MODAL - Practice Difficult Words */}
                    {showExerciseDrillDown && (
                        <div className="fixed inset-0 bg-black/95 z-[100] flex items-center justify-center p-4 backdrop-blur-md overflow-y-auto">
                            <div className="glass-card p-10 rounded-[2.5rem] w-full max-w-5xl border-indigo-500/30 max-h-[85vh] flex flex-col">
                                <div className="flex justify-between items-center mb-6">
                                    <div>
                                        <h2 className="text-2xl font-black main-gradient uppercase italic">
                                            {drillDownExercise === 'flashcard' && '🎴 Flashcard Difficult Words'}
                                            {drillDownExercise === 'dictation' && '🎤 Dictation Difficult Words'}
                                            {drillDownExercise === 'selection' && '✓ Selection Difficult Words'}
                                            {drillDownExercise === 'guesswork' && '✏️ Guesswork Difficult Words'}
                                            {drillDownExercise === 'translation' && '🌍 Translation Difficult Words'}
                                        </h2>
                                        <p className="text-slate-400 text-sm mt-2">
                                            {drillDownExercise === 'flashcard' && 'All practiced words — ordered by difficulty (Passive → Active)'}
                                            {drillDownExercise === 'dictation' && 'All practiced words — ordered by avg errors (most difficult first)'}
                                            {drillDownExercise === 'selection' && 'All practiced words — ordered by avg attempts (most failed first)'}
                                            {drillDownExercise === 'guesswork' && 'All practiced words — ordered by difficulty (Passive → Active)'}
                                            {drillDownExercise === 'translation' && 'All practiced words — ordered by grade (lowest first)'}
                                        </p>
                                    </div>
                                    <button onClick={() => { setShowExerciseDrillDown(false); setShowStats(true); }} className="text-slate-400 hover:text-white text-3xl">&times;</button>
                                </div>
                                
                                {drillDownWords.length === 0 ? (
                                    <div className="text-center py-20">
                                        <p className="text-slate-500 text-xl mb-4">🎉 No difficult words found!</p>
                                        <p className="text-slate-600 text-sm">All words in this exercise are performing well.</p>
                                    </div>
                                ) : (
                                    <>
                                        <p className="text-slate-300 mb-4">
                                            Found {drillDownWords.length} word(s) • Selected: {selectedDrillDownWords.length}
                                        </p>
                                        
                                        <div className="flex-1 overflow-y-auto custom-scroll mb-6 space-y-2">
                                            {drillDownWords.map((word, idx) => {
                                                // Build metric text per exercise
                                                let metricText = '';
                                                let metricColor = 'text-slate-400';
                                                if (drillDownExercise === 'dictation') {
                                                    const avg = word.avgErrors || 0;
                                                    metricText = `${avg.toFixed(2)} avg errors/attempt · ${word.errors} total`;
                                                    metricColor = avg > 1 ? 'text-red-400' : avg > 0 ? 'text-yellow-400' : 'text-green-400';
                                                } else if (drillDownExercise === 'selection') {
                                                    const avg = word.avgAttempts || 0;
                                                    metricText = `${avg.toFixed(2)} avg attempts/word · ${word.attempts} total`;
                                                    metricColor = avg > 2 ? 'text-red-400' : avg > 1 ? 'text-yellow-400' : 'text-green-400';
                                                } else if (drillDownExercise === 'translation') {
                                                    metricText = `Best grade: ${word.grade || 'N/A'} · ${word.count} practiced`;
                                                    metricColor = (word.grade === 'B1' || word.grade === 'B2') ? 'text-yellow-400' : 'text-green-400';
                                                } else {
                                                    metricText = `${word.count} practiced`;
                                                }
                                                // Difficulty badge color (handles legacy Hard/Medium/Easy already normalized)
                                                const diffColor = word.difficulty === 'Active' ? 'bg-green-600/30 text-green-400 border-green-500/40' :
                                                    word.difficulty === 'Emerging' ? 'bg-yellow-600/30 text-yellow-400 border-yellow-500/40' :
                                                    word.difficulty === 'Passive' ? 'bg-red-600/30 text-red-400 border-red-500/40' :
                                                    'bg-slate-700/50 text-slate-500 border-slate-600';
                                                const hasClassifier = drillDownExercise === 'flashcard' || drillDownExercise === 'guesswork' || drillDownExercise === 'selection';
                                                return (
                                                    <div
                                                        key={word.id}
                                                        className="flex items-center gap-3 bg-slate-800/50 hover:bg-slate-800 px-3 py-3 rounded-xl transition-colors"
                                                    >
                                                        {/* Number + Checkbox */}
                                                        <span className="text-slate-600 text-xs font-mono w-4 text-right shrink-0">{idx+1}</span>
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedDrillDownWords.includes(word.id)}
                                                            onChange={(e) => {
                                                                if (e.target.checked) { setSelectedDrillDownWords([...selectedDrillDownWords, word.id]); }
                                                                else { setSelectedDrillDownWords(selectedDrillDownWords.filter(id => id !== word.id)); }
                                                            }}
                                                            className="w-4 h-4 shrink-0"
                                                        />
                                                        {/* Word + badges */}
                                                        <div className="flex-1 flex flex-wrap items-center gap-2 min-w-0">
                                                            <span className="text-white font-bold">{word.word}</span>
                                                            {hasClassifier && (
                                                                <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${diffColor}`}>
                                                                    {word.difficulty || 'Not rated'}
                                                                </span>
                                                            )}
                                                            <span className={`text-xs font-semibold ${metricColor}`}>{metricText}</span>
                                                        </div>
                                                        {/* RIGHT: Reset buttons */}
                                                        <div className="flex gap-1 shrink-0">
                                                            {hasClassifier && (
                                                                <button
                                                                    onClick={async (e) => {
                                                                        e.stopPropagation();
                                                                        const { error } = await supabase.from('vocabulary_v4').update({ difficulty: null }).eq('id', word.id);
                                                                        if (error) { alert('Reset failed: ' + error.message); return; }
                                                                        setDrillDownWords(prev => prev.map(w => w.id === word.id ? {...w, difficulty: null} : w));
                                                                        setStatsData(prev => {
                                                                            if (!prev) return prev;
                                                                            const newList = prev.wordLists[drillDownExercise].map(w => w.id === word.id ? {...w, difficulty: null} : w);
                                                                            const exUp = ['flashcard','selection','guesswork'].includes(drillDownExercise) ? {
                                                                                active: newList.filter(w => w.difficulty === 'Active').length,
                                                                                emerging: newList.filter(w => w.difficulty === 'Emerging').length,
                                                                                passive: newList.filter(w => w.difficulty === 'Passive').length
                                                                            } : {};
                                                                            return {...prev,
                                                                                wordLists: {...prev.wordLists, [drillDownExercise]: newList},
                                                                                exercises: {...prev.exercises, [drillDownExercise]: {...prev.exercises[drillDownExercise], ...exUp}},
                                                                                difficulty: {...prev.difficulty, easy: prev.difficulty.easy - (word.difficulty==='Active'?1:0), medium: prev.difficulty.medium - (word.difficulty==='Emerging'?1:0), hard: prev.difficulty.hard - (word.difficulty==='Passive'?1:0), notPracticed: prev.difficulty.notPracticed + 1}
                                                                            };
                                                                        });
                                                                    }}
                                                                    className="text-[10px] px-2 py-1 rounded-lg bg-slate-700 hover:bg-yellow-900/40 text-slate-400 hover:text-yellow-300 border border-slate-600 hover:border-yellow-500/50 transition-colors whitespace-nowrap"
                                                                    title="Reset difficulty classification"
                                                                >
                                                                    ↺ A/E/P
                                                                </button>
                                                            )}
                                                            <button
                                                                onClick={async (e) => {
                                                                    e.stopPropagation();
                                                                    const statsReset = drillDownExercise === 'flashcard' ? { flashcard_count: 0 } :
                                                                        drillDownExercise === 'dictation' ? { dictation_count: 0, dictation_errors_total: 0 } :
                                                                        drillDownExercise === 'selection' ? { selection_count: 0, selection_attempts_total: 0 } :
                                                                        drillDownExercise === 'guesswork' ? { guesswork_count: 0 } :
                                                                        { translation_count: 0, translation_best_grade: null };
                                                                    const { error } = await supabase.from('vocabulary_v4').update(statsReset).eq('id', word.id);
                                                                    if (error) { alert('Reset failed: ' + error.message); return; }
                                                                    // Remove from local drill-down list
                                                                    setDrillDownWords(prev => prev.filter(w => w.id !== word.id));
                                                                    // Also remove from cached statsData so drill-down stays fresh on reopen
                                                                    setStatsData(prev => {
                                                                            if (!prev) return prev;
                                                                            const newList = prev.wordLists[drillDownExercise].filter(w => w.id !== word.id);
                                                                            const exUp = ['flashcard','selection','guesswork'].includes(drillDownExercise) ? {
                                                                                count: newList.length,
                                                                                active: newList.filter(w => w.difficulty === 'Active').length,
                                                                                emerging: newList.filter(w => w.difficulty === 'Emerging').length,
                                                                                passive: newList.filter(w => w.difficulty === 'Passive').length
                                                                            } : { count: newList.length };
                                                                            return {...prev,
                                                                                wordLists: {...prev.wordLists, [drillDownExercise]: newList},
                                                                                exercises: {...prev.exercises, [drillDownExercise]: {...prev.exercises[drillDownExercise], ...exUp}}
                                                                            };
                                                                        });
                                                                }}
                                                                className="text-[10px] px-2 py-1 rounded-lg bg-slate-700 hover:bg-red-900/40 text-slate-400 hover:text-red-300 border border-slate-600 hover:border-red-500/50 transition-colors whitespace-nowrap"
                                                                title="Reset exercise stats for this word"
                                                            >
                                                                🗑 Stats
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        
                                        <div className="flex gap-4 mt-4">
                                            <button
                                                onClick={() => {
                                                    if (selectedDrillDownWords.length === drillDownWords.length) {
                                                        setSelectedDrillDownWords([]);
                                                    } else {
                                                        setSelectedDrillDownWords(drillDownWords.map(w => w.id));
                                                    }
                                                }}
                                                className="px-6 bg-slate-700 hover:bg-slate-600 text-white py-3 rounded-xl font-bold text-sm"
                                            >
                                                {selectedDrillDownWords.length === drillDownWords.length ? '❌ Deselect All' : '✅ Select All'}
                                            </button>
                                            <button
                                                onClick={practiceSelectedWords}
                                                disabled={selectedDrillDownWords.length === 0}
                                                className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white py-3 rounded-xl font-black uppercase text-sm"
                                            >
                                                🎯 Practice Selected ({selectedDrillDownWords.length})
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    )}


                    {/* 🆕 V11.47: Reset Confirmation Modal */}
                    {showResetConfirm && (
                        <div className="fixed inset-0 bg-black/95 z-[100] flex items-center justify-center p-4 backdrop-blur-md">
                            <div className="glass-card p-8 rounded-3xl w-full max-w-2xl border-red-500/30">
                                <div className="text-center">
                                    <div className="text-6xl mb-4">
                                        {resetType === 'difficulty' && '🟡'}
                                        {resetType === 'stats' && '🟠'}
                                        {resetType === 'all' && '🔴'}
                                    </div>
                                    <h2 className="text-3xl font-black text-white mb-4">
                                        {resetType === 'difficulty' && 'Reset Difficulty Ratings?'}
                                        {resetType === 'stats' && 'Reset Exercise Statistics?'}
                                        {resetType === 'all' && 'Reset ALL Progress?'}
                                    </h2>
                                    
                                    <div className="bg-slate-800/50 rounded-xl p-6 mb-6 text-left">
                                        <p className="text-slate-300 mb-3 font-semibold">This action will:</p>
                                        
                                        {resetType === 'difficulty' && (
                                            <>
                                                <p className="text-red-400 mb-2">❌ Clear all difficulty ratings (Active/Emerging/Passive)</p>
                                                <p className="text-slate-400 mb-2">→ Words will need to be re-classified through practice</p>
                                                <p className="text-green-400 mt-4">✅ Keep your vocabulary list intact</p>
                                                <p className="text-green-400">✅ Keep all exercise statistics (counts, grades, errors)</p>
                                            </>
                                        )}
                                        
                                        {resetType === 'stats' && (
                                            <>
                                                <p className="text-red-400 mb-2">❌ Clear ALL exercise counters and statistics:</p>
                                                <p className="text-slate-400 ml-6 mb-1">• Flashcard practice counts</p>
                                                <p className="text-slate-400 ml-6 mb-1">• Dictation errors and attempts</p>
                                                <p className="text-slate-400 ml-6 mb-1">• Selection attempts</p>
                                                <p className="text-slate-400 ml-6 mb-1">• Guesswork practice counts</p>
                                                <p className="text-slate-400 ml-6 mb-2">• Translation grades</p>
                                                <p className="text-green-400 mt-4">✅ Keep your vocabulary list intact</p>
                                                <p className="text-green-400">✅ Keep difficulty ratings</p>
                                            </>
                                        )}
                                        
                                        {resetType === 'all' && (
                                            <>
                                                <p className="text-red-400 mb-2">❌ Clear EVERYTHING:</p>
                                                <p className="text-red-300 ml-6 mb-1 font-semibold">• All difficulty ratings</p>
                                                <p className="text-red-300 ml-6 mb-1 font-semibold">• All exercise statistics</p>
                                                <p className="text-red-300 ml-6 mb-1 font-semibold">• All practice history</p>
                                                <p className="text-red-300 ml-6 mb-2 font-semibold">• All performance data</p>
                                                <p className="text-green-400 mt-4">✅ Keep your vocabulary list intact</p>
                                                <p className="text-yellow-300 mt-3 font-semibold">⚠️ This gives you a completely fresh start!</p>
                                            </>
                                        )}
                                    </div>
                                    
                                    <p className="text-slate-500 italic mb-6">
                                        {resetType === 'all' 
                                            ? '⚠️ This action cannot be undone. All your progress will be permanently lost.' 
                                            : 'This action cannot be undone. Make sure this is what you want.'}
                                    </p>
                                    
                                    <div className="flex gap-4 justify-center">
                                        <button
                                            onClick={() => setShowResetConfirm(false)}
                                            className="px-8 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold"
                                        >
                                            ❌ Cancel
                                        </button>
                                        <button
                                            onClick={() => {
                                                if (resetType === 'difficulty') executeResetDifficulty();
                                                else if (resetType === 'stats') executeResetExerciseStats();
                                                else if (resetType === 'all') executeResetAllProgress();
                                            }}
                                            className={`px-8 py-3 rounded-xl font-bold ${
                                                resetType === 'difficulty' ? 'bg-yellow-600 hover:bg-yellow-500 text-white' :
                                                resetType === 'stats' ? 'bg-orange-600 hover:bg-orange-500 text-white' :
                                                'bg-red-600 hover:bg-red-500 text-white'
                                            }`}
                                        >
                                            {resetType === 'difficulty' && '🟡 Yes, Reset Difficulty'}
                                            {resetType === 'stats' && '🟠 Yes, Reset Stats'}
                                            {resetType === 'all' && '🔴 Yes, Reset Everything'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 🆕 V11.57: Dictionary Modal - Increased z-index to appear above all other modals */}
                    {showVoiceModal && (
                        <div className="fixed inset-0 bg-black/95 z-[100] flex items-center justify-center p-4 backdrop-blur-md">
                            <div className="glass-card p-8 rounded-[2.5rem] w-full max-w-lg flex flex-col gap-5" style={{maxHeight: '90vh'}}>
                                <div className="flex justify-between items-center">
                                    <h2 className="text-2xl font-black main-gradient uppercase italic">🎙️ Voice Mode</h2>
                                    <button onClick={stopVoiceSession} className="text-slate-400 hover:text-white text-3xl">&times;</button>
                                </div>

                                {voiceStatus === 'idle' ? (
                                    <div className="flex flex-col gap-3">
                                        <p className="text-slate-400 text-sm mb-1">Choose which words to practise, then start:</p>
                                        {[
                                            { key: 'top_favourites', label: '⭐⭐ Top Favourites', desc: 'Level-2 favourites' },
                                            { key: 'favourites',     label: '⭐ All Favourites',  desc: 'Level 1 and 2' },
                                            { key: 'passive',        label: '🌱 Passive',          desc: 'Words you recognise' },
                                            { key: 'emerging',       label: '📈 Emerging',         desc: "Words you're activating" },
                                            { key: 'all',            label: '📚 All Words',        desc: 'Random selection' },
                                        ].map(opt => (
                                            <button
                                                key={opt.key}
                                                onClick={() => setVoiceFilter(opt.key)}
                                                className={`p-3 rounded-xl text-left transition-all border flex items-center gap-3 ${voiceFilter === opt.key ? 'bg-teal-600/30 border-teal-500 text-teal-300' : 'border-slate-700 text-slate-400 hover:border-slate-500'}`}
                                            >
                                                <span className="font-bold text-sm flex-1">{opt.label}</span>
                                                <span className="text-xs text-slate-500">{opt.desc}</span>
                                            </button>
                                        ))}
                                        <button
                                            onClick={() => startVoiceSession(voiceFilter)}
                                            className="mt-2 w-full py-4 bg-teal-600 hover:bg-teal-500 text-white font-black rounded-2xl text-lg uppercase tracking-wide transition-all hover:scale-[1.02]"
                                        >
                                            🎙️ Start Conversation
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-4" style={{minHeight: 0}}>
                                        <div className={`text-center py-2 rounded-xl font-bold text-sm animate-pulse ${
                                            voiceStatus === 'listening' ? 'bg-red-500/20 text-red-400' :
                                            voiceStatus === 'retrying'  ? 'bg-orange-500/20 text-orange-400' :
                                            voiceStatus === 'thinking'  ? 'bg-yellow-500/20 text-yellow-400' :
                                            voiceStatus === 'speaking'  ? 'bg-blue-500/20 text-blue-400' :
                                            'bg-slate-800 text-slate-500'
                                        }`}>
                                            {voiceStatus === 'listening' ? '🔴 Listening... (speak now)' :
                                             voiceStatus === 'retrying'  ? '🔴 No speech detected, trying again...' :
                                             voiceStatus === 'thinking'  ? '🤖 Thinking...' :
                                             voiceStatus === 'speaking'  ? '🔊 Speaking...' :
                                             '⏳ Loading words...'}
                                        </div>

                                        <div ref={voiceScrollRef} className="overflow-y-auto flex flex-col gap-2 custom-scroll" style={{maxHeight: '42vh'}}>
                                            {voiceHistory.map((msg, i) => (
                                                <div key={i} className={`p-3 rounded-xl text-sm ${msg.role === 'assistant' ? 'bg-teal-900/30 border border-teal-700/30 text-teal-200' : 'bg-slate-800 border border-slate-700/30 text-slate-300'}`}>
                                                    <span className="text-xs font-black uppercase text-slate-500 block mb-1">{msg.role === 'assistant' ? '🤖 Tutor' : '🎤 You'}</span>
                                                    {msg.content}
                                                </div>
                                            ))}
                                            {voiceLiveTranscript && (
                                                <div className="p-3 rounded-xl text-sm bg-slate-800/50 border border-dashed border-slate-600 text-slate-400 italic">
                                                    <span className="text-xs font-black uppercase text-slate-500 block mb-1">🎤 You (live)</span>
                                                    {voiceLiveTranscript}
                                                </div>
                                            )}
                                        </div>

                                        <button
                                            onClick={stopVoiceSession}
                                            className="w-full py-3 bg-red-600 hover:bg-red-500 text-white font-black rounded-2xl uppercase tracking-wide transition-all"
                                        >
                                            ⏹ Stop
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {showTalkToMeModal && (
                        <div className="fixed inset-0 bg-black/95 z-[100] flex items-center justify-center p-4 backdrop-blur-md">
                            <div className="glass-card p-10 rounded-[2.5rem] w-full max-w-lg">
                                <div className="flex justify-between items-center mb-8">
                                    <h2 className="text-2xl font-black main-gradient uppercase italic">💬 Talk to me</h2>
                                    <button onClick={() => setShowTalkToMeModal(false)} className="text-slate-400 hover:text-white text-3xl">&times;</button>
                                </div>
                                <p className="text-slate-400 text-sm mb-6">Choose which words to practise. ChatGPT will open with up to 30 randomly selected words and start a conversation with you.</p>
                                <div className="grid grid-cols-1 gap-3">
                                    <button onClick={() => openTalkToMe('top_favourites')} className="group bg-yellow-600 hover:bg-yellow-500 p-5 rounded-2xl text-left transition-all hover:scale-[1.02]">
                                        <div className="flex items-center gap-3 mb-1">
                                            <span className="text-2xl">⭐⭐</span>
                                            <h3 className="text-lg font-black text-white uppercase">Top Favourites</h3>
                                        </div>
                                        <p className="text-sm text-white/75">Words marked as level-2 favourites — your highest priority.</p>
                                    </button>
                                    <button onClick={() => openTalkToMe('favourites')} className="group bg-amber-600 hover:bg-amber-500 p-5 rounded-2xl text-left transition-all hover:scale-[1.02]">
                                        <div className="flex items-center gap-3 mb-1">
                                            <span className="text-2xl">⭐</span>
                                            <h3 className="text-lg font-black text-white uppercase">All Favourites</h3>
                                        </div>
                                        <p className="text-sm text-white/75">All words marked as favourites (level 1 and 2).</p>
                                    </button>
                                    <button onClick={() => openTalkToMe('passive')} className="group bg-blue-600 hover:bg-blue-500 p-5 rounded-2xl text-left transition-all hover:scale-[1.02]">
                                        <div className="flex items-center gap-3 mb-1">
                                            <span className="text-2xl">🌱</span>
                                            <h3 className="text-lg font-black text-white uppercase">Passive</h3>
                                        </div>
                                        <p className="text-sm text-white/75">Words you recognise but haven't fully activated yet.</p>
                                    </button>
                                    <button onClick={() => openTalkToMe('emerging')} className="group bg-green-600 hover:bg-green-500 p-5 rounded-2xl text-left transition-all hover:scale-[1.02]">
                                        <div className="flex items-center gap-3 mb-1">
                                            <span className="text-2xl">📈</span>
                                            <h3 className="text-lg font-black text-white uppercase">Emerging</h3>
                                        </div>
                                        <p className="text-sm text-white/75">Words you're starting to use but need more practice.</p>
                                    </button>
                                    <button onClick={() => openTalkToMe('all')} className="group bg-slate-600 hover:bg-slate-500 p-5 rounded-2xl text-left transition-all hover:scale-[1.02]">
                                        <div className="flex items-center gap-3 mb-1">
                                            <span className="text-2xl">📚</span>
                                            <h3 className="text-lg font-black text-white uppercase">All Words</h3>
                                        </div>
                                        <p className="text-sm text-white/75">Pick 30 random words from your entire vocabulary.</p>
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {showDictionaryModal && (
                        <div className="fixed inset-0 bg-black/95 z-[300] flex items-center justify-center p-4 backdrop-blur-md overflow-y-auto">
                            <div className="glass-card p-8 rounded-3xl w-full max-w-2xl border-blue-500/30 my-8 max-h-[90vh] overflow-y-auto">
                                <div className="flex justify-between items-center mb-6 sticky top-0 bg-slate-900/95 backdrop-blur-md pb-4 -mt-2 z-10">
                                    <h2 className="text-2xl font-black text-white">📖 Open in Dictionary</h2>
                                    <button onClick={() => setShowDictionaryModal(false)} className="text-slate-400 hover:text-white text-3xl">&times;</button>
                                </div>
                                
                                <div className="mb-6">
                                    <p className="text-slate-300 mb-2">Word to search:</p>
                                    <p className="text-2xl font-bold text-blue-400">{selectedWordForDict || '(no word selected)'}</p>
                                </div>
                                
                                {selectedWordForDict ? (
                                    <div className="space-y-3">
                                        {/* Web Search - Perplexity */}
                                        <button
                                            onClick={() => {
                                                const encodedPrompt = encodeURIComponent(aiSearchPrompt.replace('{word}', selectedWordForDict));
                                                window.open(`https://www.perplexity.ai/search?q=${encodedPrompt}`, '_blank');
                                                setShowDictionaryModal(false);
                                            }}
                                            className="w-full px-6 py-4 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-xl font-bold text-left flex items-center gap-3 shadow-lg"
                                        >
                                            <span className="text-2xl">🔍</span>
                                            <div>
                                                <div className="text-base">Perplexity AI Search</div>
                                                <div className="text-xs opacity-80">Deep web research with AI</div>
                                            </div>
                                        </button>
                                        
                                        {/* Youglish */}
                                        <button
                                            onClick={() => {
                                                window.open(`https://youglish.com/pronounce/${encodeURIComponent(selectedWordForDict)}/english`, '_blank');
                                                setShowDictionaryModal(false);
                                            }}
                                            className="w-full px-6 py-4 bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-500 hover:to-pink-500 text-white rounded-xl font-bold text-left flex items-center gap-3 shadow-lg"
                                        >
                                            <span className="text-2xl">🎬</span>
                                            <div>
                                                <div className="text-base">YouGlish</div>
                                                <div className="text-xs opacity-80">Learn pronunciation from YouTube videos</div>
                                            </div>
                                        </button>
                                        
                                        <div className="border-t border-slate-700 my-4 pt-4">
                                            <p className="text-xs uppercase text-slate-500 font-black mb-3">📚 Dictionaries</p>
                                        </div>
                                        
                                        {/* WordReference */}
                                        <button
                                            onClick={() => {
                                                window.open(`https://www.wordreference.com/es/translation.asp?tranword=${encodeURIComponent(selectedWordForDict)}`, '_blank');
                                                setShowDictionaryModal(false);
                                            }}
                                            className="w-full px-6 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-left flex items-center gap-3"
                                        >
                                            <span className="text-2xl">📘</span>
                                            <span>WordReference</span>
                                        </button>
                                        
                                        {/* Cambridge */}
                                        <button
                                            onClick={() => {
                                                window.open(`https://dictionary.cambridge.org/dictionary/english/${encodeURIComponent(selectedWordForDict)}`, '_blank');
                                                setShowDictionaryModal(false);
                                            }}
                                            className="w-full px-6 py-4 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold text-left flex items-center gap-3"
                                        >
                                            <span className="text-2xl">🎓</span>
                                            <span>Cambridge Dictionary</span>
                                        </button>
                                        
                                        {/* Collins */}
                                        <button
                                            onClick={() => {
                                                window.open(`https://www.collinsdictionary.com/dictionary/english/${encodeURIComponent(selectedWordForDict)}`, '_blank');
                                                setShowDictionaryModal(false);
                                            }}
                                            className="w-full px-6 py-4 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-bold text-left flex items-center gap-3"
                                        >
                                            <span className="text-2xl">📖</span>
                                            <span>Collins Dictionary</span>
                                        </button>
                                        
                                        {/* Oxford */}
                                        <button
                                            onClick={() => {
                                                window.open(`https://www.oxfordlearnersdictionaries.com/definition/english/${encodeURIComponent(selectedWordForDict)}`, '_blank');
                                                setShowDictionaryModal(false);
                                            }}
                                            className="w-full px-6 py-4 bg-orange-600 hover:bg-orange-500 text-white rounded-xl font-bold text-left flex items-center gap-3"
                                        >
                                            <span className="text-2xl">🎯</span>
                                            <span>Oxford Learner's</span>
                                        </button>
                                        
                                        {/* Merriam-Webster */}
                                        <button
                                            onClick={() => {
                                                window.open(`https://www.merriam-webster.com/dictionary/${encodeURIComponent(selectedWordForDict)}`, '_blank');
                                                setShowDictionaryModal(false);
                                            }}
                                            className="w-full px-6 py-4 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold text-left flex items-center gap-3"
                                        >
                                            <span className="text-2xl">📕</span>
                                            <span>Merriam-Webster</span>
                                        </button>
                                    </div>
                                ) : (
                                    <div className="text-center py-8">
                                        <p className="text-slate-500 text-sm">No word selected. Click the dictionary icon 📖 on any word to open this menu.</p>
                                    </div>
                                )}
                                
                                <button
                                    onClick={() => setShowDictionaryModal(false)}
                                    className="w-full mt-6 px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold sticky bottom-0"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}


                    {showSupabasePausedModal && (
                        <div className="fixed inset-0 bg-black/95 z-[200] flex items-center justify-center p-4 backdrop-blur-md">
                            <div className="glass-card p-10 rounded-[2.5rem] w-full max-w-lg border-yellow-500/30">
                                <div className="flex items-center gap-3 mb-6">
                                    <span className="text-4xl">⚠️</span>
                                    <h2 className="text-2xl font-black text-yellow-400 uppercase">Database Unavailable</h2>
                                </div>
                                <p className="text-slate-300 text-sm leading-relaxed mb-6">
                                    Your Supabase project may be <span className="text-yellow-400 font-bold">paused due to inactivity</span>. Free tier projects pause automatically after 7 days without activity.
                                </p>
                                <div className="bg-slate-800/60 rounded-2xl p-5 mb-6 space-y-2">
                                    <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">To restore it:</p>
                                    <p className="text-sm text-slate-300">1. Go to <span className="text-indigo-400 font-bold">supabase.com/dashboard</span></p>
                                    <p className="text-sm text-slate-300">2. Find your project</p>
                                    <p className="text-sm text-slate-300">3. Click <span className="text-green-400 font-bold">Restore project</span></p>
                                    <p className="text-sm text-slate-300">4. Wait 1–2 minutes, then reload the app</p>
                                </div>
                                <div className="flex flex-col gap-3">
                                    <button
                                        onClick={() => window.open('https://supabase.com/dashboard', '_blank')}
                                        className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-2xl uppercase tracking-wide transition-all hover:scale-[1.02] flex items-center justify-center gap-2"
                                    >
                                        <i className="fas fa-external-link-alt text-sm"></i>
                                        Go to Supabase Dashboard
                                    </button>
                                    <button
                                        onClick={() => window.location.reload()}
                                        className="w-full py-4 bg-slate-700 hover:bg-slate-600 text-white font-black rounded-2xl uppercase tracking-wide transition-all"
                                    >
                                        🔄 Reload App
                                    </button>
                                    <button
                                        onClick={() => setShowSupabasePausedModal(false)}
                                        className="w-full py-3 text-slate-500 hover:text-slate-300 text-sm transition-colors"
                                    >
                                        Dismiss
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                </div>
            );
        }


export default App
