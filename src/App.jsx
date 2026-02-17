import React, { useState, useEffect, useRef, useMemo } from 'react'

        const FAMILIES = ["Noun", "Adjective", "Adverb", "Verb", "Phrasal Verb", "Preposition", "Idiom", "Chunk"];
        const DIFFICULTIES = ["Passive", "Emerging", "Active"];
        const DEFAULT_PROMPT = 'Define the "{word}", with exact synonyms, in context, word family and level of difficulty for language learning, in a concise way.';


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
            const [showDictionaryModal, setShowDictionaryModal] = useState(false); // 🆕 V11.55: Dictionary modal
            const [selectedWordForDict, setSelectedWordForDict] = useState(''); // 🆕 V11.55: Selected word for dictionary
            const [editingWord, setEditingWord] = useState(null);
            const [clickAction, setClickAction] = useState(localStorage.getItem('click_action') || 'wordreference');
            const [aiPrompt, setAiPrompt] = useState(localStorage.getItem('ai_prompt') || DEFAULT_PROMPT);
            
            // 🆕 V11.13: Web Search prompt for Perplexity/ChatGPT/Claude
            const [aiSearchPrompt, setAiSearchPrompt] = useState(
                localStorage.getItem('ai_search_prompt') || 'For the English word/expression "{word}", provide:\n· Meaning.\n· Family: provide if the "{word}" is a noun, adjective, phrasal verb, idiom, etc.\n· Synonyms: some exact British English synonyms.\n· Context: Some natural sentences using this "{word}" in a sentence in British English.\n· Level: give the related level according to the Cambridge school.'
            );
            
            // 🆕 V11.9: Undo history (stores last change for each word)
            const [undoHistory, setUndoHistory] = useState({});
            
            // 🆕 V11.9: Original data before editing (for restore in modal)
            const [originalEditData, setOriginalEditData] = useState(null);
            
            const [groqApiKey, setGroqApiKey] = useState((localStorage.getItem('groq_api_key') || '').trim());
            const [magicLoading, setMagicLoading] = useState(false);
            const [dupCheck, setDupCheck] = useState({ loading: false, morphLoading: false, exact: [], partial: [], morphForms: [], term: '' });
            const dupDebounceTimer = React.useRef(null);
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
            const [mergeAIMode, setMergeAIMode] = useState(false);
            const [showSearchInfo, setShowSearchInfo] = useState(false); // 🆕 V11.96
            const [spellCheckResult, setSpellCheckResult] = useState(null); // 🆕 V11.96
            const [spellCheckLoading, setSpellCheckLoading] = useState(false); // 🆕 V11.96 // 🆕 V11.93: Independent AI toggle for Find & Merge
            const [addModalAIMode, setAddModalAIMode] = useState(false); // 🆕 V11.93: Independent AI toggle for Add modal
            const [magicFillPrompt, setMagicFillPrompt] = useState(localStorage.getItem('magic_fill_prompt') || 'For the English word/expression "{word}", provide:\n\n1. SYNONYMS: 2-4 British English synonyms (comma-separated)\n   - IMPORTANT: Synonyms MUST match the same grammatical FAMILY as "{word}"\n   - Example: If "{word}" is a phrasal verb, give phrasal verb synonyms\n   - Example: If "{word}" is an idiom, give idiomatic expression synonyms\n\n2. CONTEXT: A natural sentence (12-15 words) using EXACTLY "{word}" in British English\n   ⛔ CRITICAL: You MUST use the EXACT word/phrase "{word}" in your sentence\n   ⛔ DO NOT use synonyms - use "{word}" EXACTLY as written\n   ⛔ DO NOT substitute with similar words\n   ✅ EXAMPLE: If word is "suck at", sentence MUST contain "suck at" or "sucked at"\n   ✅ EXAMPLE: If word is "keep in check", sentence MUST contain "keep in check"\n   - The sentence should demonstrate correct grammatical function\n   - Make it sound natural and conversational\n\n3. FAMILY: Choose ONE that matches the PRIMARY grammatical function:\n   - Noun: Names a thing/person/concept\n   - Adjective: Describes a noun\n   - Adverb: Modifies verb/adjective (often ends in -ly)\n   - Verb: Action or state word\n   - Phrasal Verb: Verb + preposition (give up, look after)\n   - Idiom: Fixed expression with non-literal meaning (piece of cake, break the ice)\n   - Preposition: Word showing relationship (in, on, at, by, with, about)\n   - Chunk: Multi-word expression or collocation\n\nREMINDER: The context sentence MUST include "{word}" exactly - no synonyms!\n\nRespond ONLY in this exact JSON format (no markdown, no backticks):\n{\n  "synonyms": "synonym1, synonym2, synonym3",\n  "context": "Example sentence with {word} here.",\n  "family": "Noun"\n}');
            
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
            const [dictationDifficulty, setDictationDifficulty] = useState(''); // 🆕 V11.5
            
            // 🆕 V11.12: Dictation playback control
            const [dictationPlayCount, setDictationPlayCount] = useState(0);
            const [dictationPlaySpeed, setDictationPlaySpeed] = useState('normal');
            const MAX_DICTATION_PLAYS = 4;
            
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
            const [translationLoading, setTranslationLoading] = useState(false);
            const [translationVoiceListening, setTranslationVoiceListening] = useState(false); // 🆕 V11.38: Voice-to-text
            
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
                            setTranslationInput('');
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
                            setTranslationInput('');
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

            // 🆕 V11.12: Updated speakText with speed control
            function speakText(text, speed = 1.0, useDelay = true) {
                if ('speechSynthesis' in window) {
                    window.speechSynthesis.cancel(); // Cancel any ongoing speech
                    
                    const doSpeak = () => {
                        const voices = window.speechSynthesis.getVoices();
                        
                        const utterance = new SpeechSynthesisUtterance(text);
                        utterance.lang = 'en-GB'; // British English
                        utterance.rate = speed; // Use the speed parameter
                        utterance.pitch = 1.0; // Natural pitch
                        utterance.volume = 1.0; // Full volume
                        
                        // 🆕 V11.7: Use preferred voice if selected
                        if (preferredVoice !== 'auto') {
                            const selectedVoice = voices.find(v => v.name === preferredVoice);
                            if (selectedVoice) {
                                utterance.voice = selectedVoice;
                            }
                        } else {
                            // Auto mode: Try to find a natural-sounding British voice
                            const preferredVoices = [
                                'Google UK English Female',
                                'Google UK English Male',
                                'Microsoft Hazel Desktop - English (Great Britain)',
                                'Microsoft George - English (United Kingdom)',
                                'Karen', // macOS British voice
                                'Daniel' // macOS British voice
                            ];
                            
                            let selectedVoice = voices.find(voice => 
                                voice.lang.includes('GB') && voice.name.includes('Google')
                            );
                            
                            if (!selectedVoice) {
                                selectedVoice = voices.find(voice => 
                                    preferredVoices.some(pv => voice.name.includes(pv))
                                );
                            }
                            
                            if (!selectedVoice) {
                                selectedVoice = voices.find(voice => voice.lang.includes('en-GB') || voice.lang.includes('en_GB'));
                            }
                            
                            if (selectedVoice) {
                                utterance.voice = selectedVoice;
                            }
                        }
                        
                        window.speechSynthesis.speak(utterance);
                    };
                    
                    // 🆕 V11.8: Apply delay by default (changed from V11.7)
                    if (useDelay) {
                        setTimeout(doSpeak, 150);
                    } else {
                        doSpeak();
                    }
                } else {
                    alert('❌ Text-to-speech not supported in this browser');
                }
            }

            // 🆕 V11.5: Compare user input with correct answer and highlight differences
            function highlightDifferences(userInput, correctAnswer) {
                if (!correctAnswer) return { highlighted: '', errorCount: 0 };
                
                // 🆕 V11.6: Empty input should be marked as error
                if (!userInput || userInput.trim() === '') {
                    // Count all words as errors
                    const correctWords = correctAnswer.toLowerCase().trim().split(/\s+/);
                    return { 
                        highlighted: <span className="text-red-400 italic">(No answer provided)</span>, 
                        errorCount: correctWords.length 
                    };
                }
                
                // Normalize: lowercase and split into words
                const userWords = userInput.toLowerCase().trim().split(/\s+/);
                const correctWords = correctAnswer.toLowerCase().trim().split(/\s+/);
                
                let errorCount = 0;
                
                // Compare word by word
                const highlighted = userWords.map((word, index) => {
                    const correctWord = correctWords[index];
                    
                    if (!correctWord) {
                        // Extra word that shouldn't be there
                        errorCount++;
                        return <span key={index} className="text-red-400 font-bold">{word} </span>;
                    }
                    
                    if (word === correctWord) {
                        // Correct word
                        return <span key={index} className="text-green-300">{word} </span>;
                    } else {
                        // Incorrect word
                        errorCount++;
                        return <span key={index} className="text-red-400 font-bold line-through">{word} </span>;
                    }
                });
                
                // Check for missing words
                if (correctWords.length > userWords.length) {
                    errorCount += (correctWords.length - userWords.length);
                }
                
                return { highlighted, errorCount };
            }

            // 🆕 V11.5: Calculate difficulty based on error count
            function calculateDifficulty(errorCount) {
                if (errorCount === 0) return 'Active';
                if (errorCount <= 2) return 'Emerging';
                return 'Passive';
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

                    const { data, count, error } = await query
                        .order('created_at', { ascending: false })
                        .range(pageNum * PAGE_SIZE, (pageNum * PAGE_SIZE) + PAGE_SIZE - 1);

                    if (error && error.code === 'PGRST103') {
                        setHasMore(false);
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
                    setHasMore(false);
                } finally { 
                    setLoading(false); 
                }
            }

            // 🆕 V11.2: Get AI synonyms for deep search
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
                            model: 'llama-3.1-8b-instant',
                            messages: [{
                                role: 'user',
                                content: `You are a precise English vocabulary assistant. For the word/expression "${word}", provide two categories:

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
                            max_tokens: 300
                        })
                    });

                    if (!response.ok) return [];

                    const data = await response.json();
                    let raw = data.choices?.[0]?.message?.content || '[]';
                    raw = raw.replace(/```json|```/g, '').trim();
                    
                    try {
                        const results = JSON.parse(raw);
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
                            model: 'llama-3.1-8b-instant',
                            messages: [{ role: 'user', content: `You are a British English spell checker. Check ONLY for spelling mistakes (NOT grammar, style, or meaning) in these three fields. Use British English spelling (colour not color, organise not organize, etc.).

VOCABULARY: "${vocab}"
SYNONYMS: "${syns}"
CONTEXT: "${ctx}"

If ALL fields are correctly spelled, respond EXACTLY: {"ok": true}
If there are spelling errors, respond with: {"ok": false, "errors": [{"field": "vocabulary|synonyms|context", "wrong": "misspelled word", "correct": "correct spelling"}]}

Return ONLY valid JSON, no explanation.` }],
                            temperature: 0.0,
                            max_tokens: 300
                        })
                    });
                    
                    const data = await response.json();
                    let raw = data.choices?.[0]?.message?.content || '{}';
                    raw = raw.replace(/```json|```/g, '').trim();
                    const result = JSON.parse(raw);
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

            // 🆕 V11.97: Bulk spell check for filtered Vocabulary table
            const [bulkSpellResult, setBulkSpellResult] = useState(null);
            const [bulkSpellLoading, setBulkSpellLoading] = useState(false);
            
            const checkSpellingBulk = async () => {
                const apiKey = groqApiKey.trim();
                if (!apiKey) { alert('Please set your Groq API Key in Settings first.'); return; }
                if (!words || words.length === 0) { alert('No words to check.'); return; }
                
                setBulkSpellLoading(true);
                setBulkSpellResult(null);
                
                try {
                    // Build compact text of all filtered words
                    const entries = words.map((w, i) => 
                        `${i}|${w.vocabulary}|${w.synonyms || ''}|${w.context || ''}`
                    ).join('\n');
                    
                    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                        body: JSON.stringify({
                            model: 'llama-3.1-8b-instant',
                            messages: [{ role: 'user', content: `You are a British English spell checker. Check ONLY for spelling mistakes (NOT grammar, style, or meaning). Use British English spelling (colour not color, organise not organize, etc.).

Each line has format: index|vocabulary|synonyms|context
Check ALL fields for spelling errors.

${entries}

If ALL entries are correctly spelled, respond EXACTLY: {"ok": true}
If there are errors, respond: {"ok": false, "errors": [{"index": 0, "field": "vocabulary|synonyms|context", "wrong": "misspelled", "correct": "correct spelling"}]}
Return ONLY valid JSON, nothing else.` }],
                            temperature: 0.0,
                            max_tokens: 2000
                        })
                    });
                    
                    const data = await response.json();
                    let raw = data.choices?.[0]?.message?.content || '{}';
                    raw = raw.replace(/```json|```/g, '').trim();
                    const result = JSON.parse(raw);
                    
                    // Enrich errors with word data
                    if (!result.ok && result.errors) {
                        result.errors = result.errors.map(err => ({
                            ...err,
                            vocabulary: words[err.index]?.vocabulary || '?'
                        }));
                    }
                    
                    setBulkSpellResult(result);
                    if (result.ok) {
                        setTimeout(() => setBulkSpellResult(null), 5000);
                    }
                } catch(e) {
                    console.error('Bulk spell check error:', e);
                    setBulkSpellResult({ ok: false, errors: [{ index: 0, field: 'all', wrong: 'Error', correct: 'Spell check failed: ' + e.message, vocabulary: '—' }] });
                } finally {
                    setBulkSpellLoading(false);
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
                            dictation: { count: dictationPracticed.length, avgErrors: dictationAvgErrors },
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
                        setTranslationInput('');
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
            async function generateGuessworkHintMeaning(word) {
                const apiKey = groqApiKey.trim();
                if (!apiKey || apiKey === '') {
                    setGuessworkHintMeaning('⚠️ API key not configured. Please set your Groq API Key in Settings.');
                    return;
                }

                setGuessworkHintLoading(true);

                try {
                    const prompt = `What does "${word}" mean? Provide ONLY the definition/meaning in British English. Keep it simple and clear, maximum 2 sentences. IMPORTANT: Do NOT mention the word "${word}" itself in your response - just explain what it means. Do NOT include examples, synonyms, or usage notes.`;

                    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${apiKey}`
                        },
                        body: JSON.stringify({
                            model: 'llama-3.1-8b-instant',
                            messages: [{ role: 'user', content: prompt }],
                            temperature: 0.5,
                            max_tokens: 150
                        })
                    });

                    if (!response.ok) {
                        throw new Error('Failed to generate meaning');
                    }

                    const data = await response.json();
                    const meaning = data.choices?.[0]?.message?.content || 'Unable to generate meaning.';
                    setGuessworkHintMeaning(meaning.trim());
                } catch (error) {
                    console.error('Generate meaning error:', error);
                    setGuessworkHintMeaning('❌ Error generating meaning. Please try again.');
                } finally {
                    setGuessworkHintLoading(false);
                }
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
                        setTranslationInput('');
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
                            model: 'llama-3.1-8b-instant',
                            messages: [{ role: 'user', content: prompt }],
                            temperature: 0.3,
                            max_tokens: 200
                        })
                    });

                    if (!response.ok) throw new Error('Translation failed');

                    const data = await response.json();
                    const translation = data.choices?.[0]?.message?.content?.trim() || '';
                    setTranslationSpanish(translation);
                } catch (error) {
                    console.error('Translation error:', error);
                    setTranslationSpanish('❌ Error generating translation');
                } finally {
                    setTranslationLoading(false);
                }
            }

            // 🆕 V11.16: Validate answer with AI for Guesswork exercise
            async function validateGuessworkWithAI(userAnswer, correctAnswer, context) {
                const apiKey = groqApiKey.trim();
                if (!apiKey) {
                    alert('⚠️ Please set your Groq API Key in Settings first!\n\nAI validation requires an API key.');
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

                    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${apiKey}`
                        },
                        body: JSON.stringify({
                            model: 'llama-3.1-8b-instant',
                            messages: [{ role: 'user', content: prompt }],
                            temperature: 0.3,
                            max_tokens: 300
                        })
                    });

                    if (!response.ok) {
                        throw new Error(`API Error ${response.status}`);
                    }

                    const data = await response.json();
                    let textResponse = data.choices[0].message.content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
                    
                    // Parse JSON
                    let result;
                    try {
                        result = JSON.parse(textResponse);
                    } catch (e) {
                        const firstBraceIndex = textResponse.indexOf('{');
                        let braceCount = 0, endIndex = -1;
                        for (let i = firstBraceIndex; i < textResponse.length; i++) {
                            if (textResponse[i] === '{') braceCount++;
                            if (textResponse[i] === '}') braceCount--;
                            if (braceCount === 0) { endIndex = i + 1; break; }
                        }
                        result = JSON.parse(textResponse.substring(firstBraceIndex, endIndex));
                    }
                    
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
                            model: 'llama-3.1-8b-instant',
                            messages: [{ role: 'user', content: prompt }],
                            temperature: 0.7,
                            max_tokens: 200
                        })
                    });
                    
                    if (!response.ok) throw new Error('API Error');
                    
                    const data = await response.json();
                    let textResponse = data.choices[0].message.content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
                    const result = JSON.parse(textResponse);
                    
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
                if (!apiKey || !wrongAnswers || wrongAnswers.length === 0) return;
                
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

                    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${apiKey}`
                        },
                        body: JSON.stringify({
                            model: 'llama-3.1-8b-instant',
                            messages: [{ role: 'user', content: prompt }],
                            temperature: 0.5,
                            max_tokens: 300
                        })
                    });
                    
                    if (!response.ok) throw new Error('API Error');
                    
                    const data = await response.json();
                    const explanation = data.choices[0].message.content.trim();
                    setSelectionExplanation(explanation);
                } catch (error) {
                    console.error('Selection Explanation Error:', error);
                    setSelectionExplanation('');
                } finally {
                    setSelectionExplLoading(false);
                }
            }

            // 🆕 V11.38: Validate translation with Cambridge grading (C1/C2/B2/B1)
            async function validateTranslationWithAI(userTranslation, originalEnglish, spanishSource) {
                const apiKey = groqApiKey.trim();
                if (!apiKey) {
                    alert('⚠️ Please set your Groq API Key in Settings first!\n\nAI validation requires an API key.');
                    return null;
                }

                // 🆕 V11.38: Check for EXACT match - AI evaluates C1 vs C2
                const userClean = userTranslation.trim().toLowerCase();
                const originalClean = originalEnglish.trim().toLowerCase();
                
                if (userClean === originalClean) {
                    // Perfect match - let AI decide C1 or C2 based on grammar sophistication
                    setTranslationAIValidating(true);
                    try {
                        const levelCheckPrompt = `Evaluate this English sentence for grammatical sophistication:

"${originalEnglish}"

Is this sentence at **C2 level** (very sophisticated grammar, complex structures, advanced vocabulary) or **C1 level** (advanced but less complex)?

Respond ONLY with "C2" or "C1" - nothing else.`;

                        const levelResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${apiKey}`
                            },
                            body: JSON.stringify({
                                model: 'llama-3.1-8b-instant',
                                messages: [{ role: 'user', content: levelCheckPrompt }],
                                temperature: 0.3,
                                max_tokens: 10
                            })
                        });

                        const levelData = await levelResponse.json();
                        const levelText = levelData.choices?.[0]?.message?.content?.trim() || 'C1';
                        const gradeLevel = levelText.includes('C2') ? 'C2' : 'C1';

                        setTranslationAIValidating(false);
                        return {
                            grade: gradeLevel,
                            score: "Active",
                            percentage: 100,
                            grammar_errors: [],
                            vocabulary_issues: [],
                            feedback: "🎉 Perfect! Your translation matches the original exactly. Excellent work!"
                        };
                    } catch (error) {
                        console.error('Level check error:', error);
                        setTranslationAIValidating(false);
                        // Fallback to C1 if check fails
                        return {
                            grade: "C1",
                            score: "Active",
                            percentage: 100,
                            grammar_errors: [],
                            vocabulary_issues: [],
                            feedback: "🎉 Perfect! Your translation matches the original exactly. Excellent work!"
                        };
                    }
                }

                setTranslationAIValidating(true);
                try {
                    const prompt = `You are a strict Cambridge English examiner evaluating a Spanish-to-English translation task.

**ORIGINAL ENGLISH**: "${originalEnglish}"
**SPANISH VERSION**: "${spanishSource}"
**STUDENT'S ENGLISH TRANSLATION**: "${userTranslation}"

**STRICT GRADING CRITERIA** (V11.38 - Cambridge Levels):
- **0 errors** → Grade **C1** or **C2** (score: Easy), percentage: 90-100%
  * C2: Very sophisticated grammar, complex structures
  * C1: Advanced but less complex
- **1 error** (grammar OR vocabulary) → Grade **B2** (score: Medium), percentage: 70-85%
- **2+ errors** → Grade **B1** (score: Hard), percentage: 40-65%

**IMPORTANT**: Easy/Medium/Hard represents student's memorization difficulty, NOT the Cambridge level itself.

**SPECIAL RULES**:
⚠️ IGNORE he/she/his/her differences (Spanish doesn't specify gender)
⚠️ Be STRICT but FAIR - count only real errors
⚠️ Punctuation differences are NOT errors

**EVALUATION STEPS**:
1. Count GRAMMAR errors in the **ENGLISH translation**: tense, subject-verb agreement, word order, articles, prepositions
2. Count VOCABULARY errors in the **ENGLISH translation**: wrong word choice, spelling mistakes in English, missing/extra words (except he/she)
3. Total errors = grammar_errors.length + vocabulary_issues.length
4. Assign grade based on TOTAL ERROR COUNT:
   - 0 errors → Evaluate grammar sophistication: **C2** (very complex) or **C1** (advanced), score: **Easy**
   - 1 error → **B2**, score: **Medium**
   - 2+ errors → **B1**, score: **Hard**

**FEEDBACK REQUIREMENTS**:
✅ Correct errors in the **ENGLISH translation** only (NOT the Spanish)
✅ Format: "Error in English: [wrong part] → Should be: [English correction]. Reason: [why]"
✅ If 0 errors: "Perfect translation! No errors found. ✅"
✅ Be CONCISE and SPECIFIC about **ENGLISH** corrections
❌ NO generic praise like "good attempt", "with revision could improve", etc.
❌ NO vague or encouraging comments
❌ NO suggestions if translation is already correct
❌ DO NOT correct the Spanish text - only the English translation

Respond ONLY in this JSON format (no markdown, no backticks):
{
  "grade": "B1/B2/C1/C2",
  "score": "Easy/Medium/Hard",
  "percentage": 95,
  "grammar_errors": ["specific grammar error in English 1", "error 2"],
  "vocabulary_issues": ["specific vocabulary issue in English 1"],
  "feedback": "Concise list of English corrections. If no errors: 'Perfect translation! No errors found. ✅'"
}`;

                    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${apiKey}`
                        },
                        body: JSON.stringify({
                            model: 'llama-3.1-8b-instant',
                            messages: [{ role: 'user', content: prompt }],
                            temperature: 0.3,
                            max_tokens: 800
                        })
                    });

                    if (!response.ok) {
                        throw new Error(`API Error ${response.status}`);
                    }

                    const data = await response.json();
                    let textResponse = data.choices[0].message.content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
                    
                    // Parse JSON
                    let result;
                    try {
                        result = JSON.parse(textResponse);
                    } catch (e) {
                        const firstBraceIndex = textResponse.indexOf('{');
                        let braceCount = 0, endIndex = -1;
                        for (let i = firstBraceIndex; i < textResponse.length; i++) {
                            if (textResponse[i] === '{') braceCount++;
                            if (textResponse[i] === '}') braceCount--;
                            if (braceCount === 0) { endIndex = i + 1; break; }
                        }
                        result = JSON.parse(textResponse.substring(firstBraceIndex, endIndex));
                    }
                    
                    return result;
                } catch (error) {
                    console.error('Translation Validation Error:', error);
                    alert('❌ Translation validation failed. Please check your API key.');
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
                setSearch(''); setFamilyFilter('All'); setEmptyFilter('None'); setDifficultyFilter('All'); setFavouriteLevel(0); setSearchMode(0); setShowSearchInfo(false); setBulkSpellResult(null);
                setTimeout(() => searchInputRef.current?.focus(), 50);
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

            const handleMagicFill = async (word, targetFields = null, wordId = null) => {
                if (!word) return;
                
                const apiKey = groqApiKey.trim();
                
                if (!apiKey || apiKey === '') {
                    alert('⚠️ Please set your Groq API Key in Settings first!\n\nGet a FREE key at: https://console.groq.com');
                    setShowSettings(true);
                    return;
                }

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
                    // 🆕 V11.38: Enhance prompt with current family if available
                    let prompt = magicFillPrompt.replace(/{word}/g, word);
                    
                    if (currentFamily) {
                        prompt = `CRITICAL INSTRUCTION: The word "${word}" is a ${currentFamily}.

${prompt}

MANDATORY RULES FOR "${word}" (${currentFamily}):
- Synonyms MUST be EXACT synonyms: truly interchangeable with "${word}", same core meaning, same grammatical family (${currentFamily})
- DO NOT include loosely related or tangential words — only true synonyms that could directly replace "${word}"
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

                    const response = await fetch(
                        'https://api.groq.com/openai/v1/chat/completions',
                        {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${apiKey}`
                            },
                            body: JSON.stringify({
                                model: 'llama-3.1-8b-instant',
                                messages: [
                                    {
                                        role: 'user',
                                        content: prompt
                                    }
                                ],
                                temperature: 0.4,
                                max_tokens: 500
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
                    
                    let textResponse = data.choices[0].message.content;
                    
                    
                    textResponse = textResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
                    
                    let result;
                    try {
                        result = JSON.parse(textResponse);
                    } catch (e1) {
                        console.warn('⚠️ Direct parse failed, extracting first JSON object...');
                        try {
                            const firstBraceIndex = textResponse.indexOf('{');
                            if (firstBraceIndex === -1) {
                                throw new Error('No JSON object found');
                            }
                            
                            let braceCount = 0;
                            let endIndex = -1;
                            for (let i = firstBraceIndex; i < textResponse.length; i++) {
                                if (textResponse[i] === '{') braceCount++;
                                if (textResponse[i] === '}') braceCount--;
                                if (braceCount === 0) {
                                    endIndex = i + 1;
                                    break;
                                }
                            }
                            
                            if (endIndex === -1) {
                                throw new Error('Could not find end of JSON object');
                            }
                            
                            const firstJsonStr = textResponse.substring(firstBraceIndex, endIndex);
                            result = JSON.parse(firstJsonStr);
                        } catch (e2) {
                            console.error('❌ All parsing failed:', e2);
                            throw new Error(`AI returned invalid JSON. Please check your API key and try again.\n\nResponse: ${textResponse.substring(0, 100)}...`);
                        }
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
                
                const apiKey = groqApiKey.trim();
                if (!apiKey || apiKey === '') {
                    alert('⚠️ Please set your Groq API Key in Settings first!\n\nGet a FREE key at: https://console.groq.com');
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

For the English word/expression "${word}", provide ALTERNATIVE/IMPROVED suggestions:

1. SYNONYMS: 2-4 EXACT British English synonyms (comma-separated)
   - MANDATORY: All synonyms MUST be ${currentFamily}s (same grammatical family as "${word}")
   - MANDATORY: Synonyms must be INTERCHANGEABLE with "${word}" in most contexts — they must share the same core meaning
   - DO NOT include loosely related words — only true synonyms that could replace "${word}" directly
   - Example: ${familyExamples[currentFamily] || 'Provide synonyms of the same type'}

2. CONTEXT: A natural sentence (12-15 words) in British English that HELPS UNDERSTAND THE MEANING of "${word}"
   ⛔️ CRITICAL: You MUST use "${word}" as a ${currentFamily} in your sentence
   ⛔️ DO NOT use synonyms instead of "${word}"
   ✅ REQUIRED: ${contextExamples[currentFamily] || ('Use "' + word + '" correctly')}
   ✅ The sentence should clearly illustrate what "${word}" means — a reader unfamiliar with the word should be able to infer its meaning from the context

3. FAMILY: RESPOND WITH "${currentFamily}" - DO NOT CHANGE THIS VALUE

FINAL MANDATORY RULES:
- Synonyms = EXACT ${currentFamily} synonyms only (interchangeable, same meaning)
- Context = use "${word}" as a ${currentFamily}, and the sentence must help understand the meaning
- Family field in JSON = "${currentFamily}" (DO NOT modify)

Respond ONLY in this exact JSON format (no markdown, no backticks):
{
  "synonyms": "synonym1, synonym2, synonym3",
  "context": "Example sentence with exact word ${word} here.",
  "family": "${currentFamily}"
}`;


                    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${apiKey}`
                        },
                        body: JSON.stringify({
                            model: 'llama-3.1-8b-instant',
                            messages: [{ role: 'user', content: prompt }],
                            temperature: 0.4,
                            max_tokens: 500
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
                    
                    let textResponse = data.choices[0].message.content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
                    
                    let result;
                    try {
                        result = JSON.parse(textResponse);
                    } catch (e) {
                        const firstBraceIndex = textResponse.indexOf('{');
                        let braceCount = 0, endIndex = -1;
                        for (let i = firstBraceIndex; i < textResponse.length; i++) {
                            if (textResponse[i] === '{') braceCount++;
                            if (textResponse[i] === '}') braceCount--;
                            if (braceCount === 0) { endIndex = i + 1; break; }
                        }
                        result = JSON.parse(textResponse.substring(firstBraceIndex, endIndex));
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

                    // 🆕 V11.20: Find current word in all possible contexts
                    const currentWord = words.find(w => w.id === wordId) || 
                                       flashcardWords.find(w => w.id === wordId) ||
                                       dictationWords.find(w => w.id === wordId) ||
                                       selectionWords.find(w => w.id === wordId) ||
                                       guessworkWords.find(w => w.id === wordId);
                    
                    if (!currentWord) {
                        throw new Error('Word not found in current context');
                    }
                    
                    const currentSyns = (currentWord.synonyms || '').split(',').map(s => s.trim()).filter(s => s);
                    const improvedSyns = (result.synonyms || '').split(',').map(s => s.trim()).filter(s => s);
                    
                    const currentCtx = currentWord.context ? [currentWord.context] : [];
                    const improvedCtx = result.context ? [result.context] : [];
                    
                    setImproveData({
                        wordId,
                        vocabulary: word,
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
                    setShowImproveModal(true);

                } catch (error) {
                    console.error('Improve Error:', error);
                    alert(`❌ Improve failed: ${error.message}`);
                } finally {
                    setMagicLoading(false);
                }
            };

            // 🆕 V11.93: Unified search with independent AI toggle
            const handleFindSimilar = async (currentWord, useAI = false) => {
                setFindingSimilar(currentWord.id);
                try {
                    const term = currentWord.vocabulary.trim().toLowerCase();
                    const currentSyns = currentWord.synonyms 
                        ? currentWord.synonyms.split(',').map(s => s.trim().toLowerCase()).filter(s => s) 
                        : [];
                    
                    let allResults = [];
                    
                    if (!useAI) {
                        // 🔍 Lupa mode: ilike on vocabulary + synonyms (same logic as main search & modal +)
                        const { data } = await supabase
                            .from('vocabulary_v4')
                            .select('*')
                            .or(`vocabulary.ilike.%${term}%,synonyms.ilike.%${term}%`)
                            .neq('id', currentWord.id)
                            .is('deleted_at', null)
                            .limit(20);
                        allResults = data || [];
                    } else {
                        // 🧠 Brain mode: AI generates synonyms + forms → search ONLY vocabulary
                        if (!groqApiKey.trim()) { alert('Please set your Groq API Key in Settings first.'); setFindingSimilar(null); return; }
                        
                        const forms = await getAIRelatedWords(term);
                        if (forms.length > 0) {
                            const orClauses = forms.map(f => `vocabulary.ilike.%${f}%`).join(',');
                            const { data: results } = await supabase
                                .from('vocabulary_v4')
                                .select('*')
                                .or(orClauses)
                                .neq('id', currentWord.id)
                                .is('deleted_at', null)
                                .limit(20);
                            allResults = results || [];
                        }
                    }

                    if (allResults.length === 0) {
                        alert('✅ No similar words found!');
                        return;
                    }

                    setMergeData({
                        current: currentWord,
                        similar: allResults
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

            // 🆕 V11.9: Save to undo history before updating
            function saveToUndoHistory(wordId, originalData) {
                setUndoHistory(prev => ({
                    ...prev,
                    [wordId]: {
                        ...originalData,
                        timestamp: new Date().toISOString()
                    }
                }));
            }

            // 🆕 V11.9: Undo last change for a word
            async function handleUndo(wordId) {
                const historyEntry = undoHistory[wordId];
                if (!historyEntry) {
                    alert('No undo history for this word');
                    return;
                }
                
                try {
                    const { timestamp, ...restoreData } = historyEntry;
                    await supabase.from('vocabulary_v4').update(restoreData).eq('id', wordId);
                    
                    // Remove from history after restoring
                    setUndoHistory(prev => {
                        const newHistory = { ...prev };
                        delete newHistory[wordId];
                        return newHistory;
                    });
                    
                    fetchWords(0, true);
                    alert('✅ Changes undone successfully!');
                } catch (error) {
                    console.error('Undo error:', error);
                    alert('❌ Error undoing changes');
                }
            }

            async function handleSave(e) {
                e.preventDefault();
                const formData = new FormData(e.target);
                const wordData = Object.fromEntries(formData);
                
                wordData.favourite = parseInt(formData.get('favourite')) || 0;
                
                if (editingWord) {
                    // 🆕 V11.9: Save current state to undo history before updating
                    saveToUndoHistory(editingWord.id, editingWord);
                    
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
                    
                    // 🆕 V11.20: Update main table state without refreshing filters
                    if (!showFlashcards && !showDictation && !showSelection && !showGuesswork && !showTranslation) {
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
                        <div className="max-w-[1850px] mx-auto flex flex-col gap-4">
                            <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                                <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
                                    <h1 className="text-xl sm:text-2xl lg:text-3xl font-black italic main-gradient uppercase tracking-tighter text-center sm:text-left">
                                        English Booster <span className="version-text">v11.97</span>
                                    </h1>
                                    {/* 🆕 V11.60: Reorganized header - title and buttons in mobile */}
                                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 lg:gap-3 bg-slate-800/50 p-2 px-3 lg:px-4 sm:ml-4 lg:ml-8 rounded-2xl border border-white/5 shadow-lg w-full sm:w-auto">
                                        <span className="text-base lg:text-lg font-black text-indigo-400 tracking-wider">{totalCount}</span>
                                        
                                        <div className="border-l border-white/10 pl-2 lg:pl-3 ml-1 flex items-center gap-1.5 lg:gap-2">
                                            {/* Add button */}
                                            <button 
                                                onClick={() => {setEditingWord(null); setShowAddModal(true); setAddModalAIMode(false); setSpellCheckResult(null); setDupCheck({ loading: false, morphLoading: false, exact: [], partial: [], morphForms: [], term: '' }); setTimeout(() => { const input = document.getElementById('modalVocabInput'); if (input && search.trim()) { input.value = search.trim(); searchDuplicates(search.trim()); } }, 50);}} 
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
                                
                                {/* 🆕 V11.97: Bulk spell check button */}
                                <button 
                                    onClick={checkSpellingBulk}
                                    disabled={bulkSpellLoading || words.length === 0}
                                    className={`p-2 lg:p-3 rounded-xl border flex-shrink-0 transition-colors ${
                                        bulkSpellLoading ? 'border-teal-500 text-teal-400 animate-pulse' :
                                        'border-slate-700 text-slate-600 hover:text-teal-400 hover:border-teal-500/50'
                                    }`}
                                    title={`Spell check ${words.length} filtered words (British English)`}
                                >
                                    <i className={`fas fa-spell-check text-sm`}></i>
                                </button>
                                
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
                                        searchMode === 0 ? 'Search: Vocabulary + Synonyms' :
                                        'Search: AI Deep Search - AI generates synonyms and searches all fields'
                                    }
                                >
                                    <i className={`fas ${
                                        searchMode === 0 ? 'fa-search' :
                                        'fa-brain'
                                    } text-sm`}></i>
                                </button>
                                
                                {/* 🆕 V11.96: Search info icon */}
                                <button 
                                    onClick={() => setShowSearchInfo(!showSearchInfo)}
                                    className="p-2 lg:p-3 rounded-xl border border-slate-700 text-slate-600 hover:text-slate-300 flex-shrink-0 relative"
                                    title="How search works"
                                >
                                    <i className="fas fa-info-circle text-sm"></i>
                                </button>
                                {showSearchInfo && (
                                    <div className="absolute top-full left-0 mt-2 bg-slate-800 border border-slate-600 rounded-2xl p-5 z-50 shadow-2xl w-96 text-sm" style={{maxWidth: 'calc(100vw - 2rem)'}}>
                                        <div className="flex justify-between items-center mb-3">
                                            <span className="text-white font-black text-xs uppercase tracking-widest">How Search Works</span>
                                            <button onClick={() => setShowSearchInfo(false)} className="text-slate-400 hover:text-white">&times;</button>
                                        </div>
                                        <div className="space-y-3 text-slate-300">
                                            <div>
                                                <div className="flex items-center gap-2 mb-1"><i className="fas fa-search text-slate-400"></i><span className="font-bold text-white">Standard Search</span></div>
                                                <p className="text-slate-400 text-xs leading-relaxed">Searches for text matches in both <span className="text-indigo-400">Vocabulary</span> and <span className="text-blue-400">Synonyms</span> columns. Finds any word containing your search text.</p>
                                            </div>
                                            <div className="border-t border-slate-700 pt-3">
                                                <div className="flex items-center gap-2 mb-1"><i className="fas fa-brain text-purple-400"></i><span className="font-bold text-white">AI Search</span></div>
                                                <p className="text-slate-400 text-xs leading-relaxed">AI generates <span className="text-purple-300">exact synonyms</span> and <span className="text-purple-300">grammatical forms</span> of your word, then searches only the <span className="text-indigo-400">Vocabulary</span> column for matches. Does NOT search Synonyms column. Does NOT include the original word.</p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                
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
                                </select>
                                <select value={familyFilter} onChange={e => setFamilyFilter(e.target.value)} className="p-2 lg:p-2.5 rounded-xl text-xs font-bold uppercase flex-1 min-w-[80px] sm:flex-initial"><option value="All">Family</option>{FAMILIES.map(f => <option key={f} value={f}>{f}</option>)}</select>
                                <select value={difficultyFilter} onChange={e => setDifficultyFilter(e.target.value)} className="p-2 lg:p-2.5 rounded-xl text-xs font-bold uppercase flex-1 min-w-[100px] sm:flex-initial"><option value="All">Difficulty</option>{DIFFICULTIES.map(eff => <option key={eff} value={eff}>{eff}</option>)}</select>
                            </div>
                        </div>
                    </header>

                    <main className="w-full mx-auto px-6 flex-1 overflow-hidden py-6">
                        {/* 🆕 V11.97: Bulk spell check results */}
                        {bulkSpellResult && (
                            <div className={`mb-3 rounded-2xl p-4 text-sm ${bulkSpellResult.ok ? 'bg-green-900/20 border border-green-500/30' : 'bg-red-900/20 border border-red-500/30'}`}>
                                {bulkSpellResult.ok ? (
                                    <div className="text-green-400 flex items-center gap-2"><i className="fas fa-check-circle"></i> All {words.length} filtered words are correctly spelled!</div>
                                ) : (
                                    <div>
                                        <div className="flex items-center justify-between mb-3">
                                            <span className="text-red-400 font-bold text-xs uppercase flex items-center gap-2"><i className="fas fa-exclamation-triangle"></i> Spelling errors found in {bulkSpellResult.errors?.length || 0} field(s)</span>
                                            <button onClick={() => setBulkSpellResult(null)} className="text-slate-400 hover:text-white text-lg">&times;</button>
                                        </div>
                                        <div className="grid gap-1.5 max-h-48 overflow-y-auto custom-scroll">
                                            {(bulkSpellResult.errors || []).map((err, i) => (
                                                <div key={i} className="flex items-center gap-3 text-xs bg-slate-800/50 rounded-lg px-3 py-2">
                                                    <span className="text-white font-bold min-w-[100px] truncate">{err.vocabulary}</span>
                                                    <span className="text-slate-500 uppercase font-bold text-[9px] min-w-[60px]">{err.field}</span>
                                                    <span className="text-red-400 line-through">{err.wrong}</span>
                                                    <i className="fas fa-arrow-right text-slate-600 text-[8px]"></i>
                                                    <span className="text-green-400 font-bold">{err.correct}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
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
                                            >{search ? highlightMatch(w.vocabulary, search) : w.vocabulary}</td>
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
                                                        <span className="text-xl">{findingSimilar === w.id ? '⏳' : '🔀'}</span>
                                                    </button>
                                                    {/* Edit button */}
                                                    <button onClick={() => { setEditingWord(w); setOriginalEditData({...w}); setShowAddModal(true); setSpellCheckResult(null); }} className="text-slate-500 hover:text-white tooltip p-1" data-tip="Edit word"><i className="fas fa-edit text-xl"></i></button>
                                                    {/* Undo button */}
                                                    <button 
                                                        onClick={() => handleUndo(w.id)}
                                                        disabled={!undoHistory[w.id]}
                                                        className={`tooltip p-1 ${undoHistory[w.id] ? 'text-yellow-500 hover:text-yellow-400' : 'text-slate-700 cursor-not-allowed'}`}
                                                        data-tip={undoHistory[w.id] ? "Undo last change" : "No changes to undo"}
                                                    >
                                                        <i className="fas fa-undo text-lg"></i>
                                                    </button>
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
                                            {search ? highlightMatch(w.vocabulary, search) : w.vocabulary}
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
                                                {findingSimilar === w.id ? '⏳' : '🔀'}
                                            </button>
                                            {/* 🆕 V11.11: Edit button (3rd position) */}
                                            <button 
                                                onClick={() => { setEditingWord(w); setOriginalEditData({...w}); setShowAddModal(true); setSpellCheckResult(null); }} 
                                                className="p-2 text-slate-400 bg-slate-800 rounded-xl flex-1 text-xl"
                                            >
                                                ✏️
                                            </button>
                                            {/* 🆕 V11.11: Undo button (4th position) */}
                                            <button 
                                                onClick={() => handleUndo(w.id)}
                                                disabled={!undoHistory[w.id]}
                                                className={`p-2 rounded-xl flex-1 text-xl ${undoHistory[w.id] ? 'text-yellow-500 bg-yellow-500/10' : 'text-slate-700 bg-slate-800 cursor-not-allowed'}`}
                                            >
                                                ↩️
                                            </button>
                                            {/* 🆕 V11.11: Delete button (5th position) */}
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
                                            {availableVoices.map(voice => (
                                                <option key={voice.name} value={voice.name}>
                                                    {voice.name} ({voice.lang})
                                                </option>
                                            ))}
                                        </select>
                                        <p className="text-xs text-slate-500 mt-2">Select the voice used for audio playback in exercises and context sentences.</p>
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
                                        className="group relative overflow-hidden bg-pink-600 hover:bg-pink-500 p-6 rounded-2xl text-left transition-all hover:scale-105 hover:shadow-2xl md:col-span-2"
                                    >
                                        <div className="flex items-center gap-4 mb-3">
                                            <span className="text-4xl">🌐</span>
                                            <h3 className="text-xl font-black text-white uppercase">Translation</h3>
                                        </div>
                                        <p className="text-sm text-white/80">Translate Spanish sentences to English. Practice language conversion skills.</p>
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
                                </div>
                                
                                {/* 🆕 V11.21: Responsive grid - vertical on mobile, horizontal on desktop */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-4 sm:mb-6">
                                    {/* LEFT PANEL - RED - CURRENT DATA */}
                                    <div className="bg-red-900/20 border-2 border-red-500 rounded-2xl p-6">
                                        <h3 className="text-red-300 font-bold mb-4 text-center text-lg">🔴 CURRENT DATA</h3>
                                        

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
                                                        className="bg-red-700/50 hover:bg-red-700/70 text-red-100 px-3 py-2 rounded-lg cursor-move text-sm"
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
                                                        className="bg-red-700/50 hover:bg-red-700/70 text-red-100 px-3 py-2 rounded-lg cursor-move text-sm"
                                                    >
                                                        {improveData.current.context}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* RIGHT PANEL - GREEN - AI SUGGESTIONS */}
                                    <div className="bg-green-900/20 border-2 border-green-500 rounded-2xl p-6">
                                        <h3 className="text-green-300 font-bold mb-4 text-center text-lg">🟢 AI SUGGESTIONS</h3>
                                        

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
                                                        className="bg-green-700/50 hover:bg-green-700/70 text-green-100 px-3 py-2 rounded-lg cursor-move text-sm"
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
                            <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-6" onClick={() => {setShowMergeModal(false); setMergeData(null); setMergeAIMode(false);}}>
                                <div className="bg-slate-900 rounded-3xl p-8 max-w-4xl w-full shadow-2xl border border-white/10" onClick={e => e.stopPropagation()}>
                                    <div className="flex justify-between items-center mb-6">
                                        <h2 className="text-3xl font-black text-white">🔀 Find & Merge Similar</h2>
                                        <div className="flex items-center gap-3">
                                            {/* 🆕 V11.93: Lupa/Brain toggle for merge modal */}
                                            <button 
                                                onClick={() => {
                                                    const newMode = !mergeAIMode;
                                                    setMergeAIMode(newMode);
                                                    if (mergeData?.current) {
                                                        handleFindSimilar(mergeData.current, newMode);
                                                    }
                                                }}
                                                disabled={!!findingSimilar}
                                                className={`p-2.5 rounded-xl border transition-colors ${
                                                    mergeAIMode 
                                                        ? 'bg-purple-500/20 border-purple-500 text-purple-400' 
                                                        : 'border-slate-600 text-slate-500 hover:text-slate-300'
                                                }`}
                                                title={mergeAIMode ? 'AI search active (vocabulary only)' : 'Toggle AI search'}
                                            >
                                                <i className={`fas ${mergeAIMode ? 'fa-brain' : 'fa-search'} ${findingSimilar ? 'animate-pulse' : ''}`}></i>
                                            </button>
                                            <button onClick={() => {setShowMergeModal(false); setMergeData(null); setMergeAIMode(false);}} className="text-slate-400 hover:text-white text-3xl">&times;</button>
                                        </div>
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
                            <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-6" onClick={() => {setShowMergeModal(false); setMergeData(null); setSelectedSimilar(null); setMergeAIMode(false);}}>
                                <div className="bg-slate-900 rounded-3xl p-8 max-w-6xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-white/10" onClick={e => e.stopPropagation()}>
                                    <div className="flex justify-between items-center mb-6">
                                        <div>
                                            <h2 className="text-3xl font-black text-white">🔀 Drag & Drop Merge</h2>
                                            <p className="text-slate-400 text-sm mt-1">📱 MOBILE: Tap items to move | 🖥️ DESKTOP: Drag items | RED = Delete | GREEN = Keep</p>
                                        </div>
                                        <button onClick={() => {setShowMergeModal(false); setMergeData(null); setSelectedSimilar(null); setMergeAIMode(false);}} className="text-slate-400 hover:text-white text-3xl">&times;</button>
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
                                            onClick={() => {setShowMergeModal(false); setMergeData(null); setSelectedSimilar(null); setMergeAIMode(false);}}
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
                                                            const { errorCount } = highlightDifferences(dictationInput, dictationWords[dictationIndex].context);
                                                            const difficulty = calculateDifficulty(errorCount);
                                                            setDictationErrorCount(errorCount);
                                                            setDictationDifficulty(difficulty);
                                                            setShowDictationAnswer(true);
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
                                                        const { errorCount } = highlightDifferences(dictationInput, dictationWords[dictationIndex].context);
                                                        const difficulty = calculateDifficulty(errorCount);
                                                        setDictationErrorCount(errorCount);
                                                        setDictationDifficulty(difficulty);
                                                        setShowDictationAnswer(true);
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
                                            {/* 🆕 V11.5: Auto-difficulty display */}
                                            <div className="flex justify-center items-center gap-4 mb-6 p-4 bg-slate-800/50 rounded-2xl">
                                                <div className="text-center">
                                                    <p className="text-xs uppercase font-black text-slate-500 mb-1">Errors</p>
                                                    <p className="text-2xl font-black text-white">{dictationErrorCount}</p>
                                                </div>
                                                <div className="h-12 w-px bg-slate-700"></div>
                                                <div className="text-center">
                                                    <p className="text-xs uppercase font-black text-slate-500 mb-1">Difficulty</p>
                                                    <p className={`text-2xl font-black ${
                                                        dictationDifficulty === 'Active' ? 'text-green-400' :
                                                        dictationDifficulty === 'Emerging' ? 'text-yellow-400' :
                                                        'text-red-400'
                                                    }`}>
                                                        {dictationDifficulty === 'Active' ? '🟢' :
                                                         dictationDifficulty === 'Emerging' ? '🟡' : '🔴'} {dictationDifficulty}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="space-y-6">
                                                {/* 🆕 V11.5: Your answer with error highlighting */}
                                                <div>
                                                    <h4 className="text-xs uppercase font-black text-slate-500 mb-2">Your Answer (🟢 correct, 🔴 errors):</h4>
                                                    <div className="bg-slate-800 p-4 rounded-xl text-lg">
                                                        {dictationInput ? 
                                                            highlightDifferences(dictationInput, dictationWords[dictationIndex].context).highlighted 
                                                            : <span className="text-slate-600 italic">No input</span>
                                                        }
                                                    </div>
                                                </div>
                                                <div>
                                                    <h4 className="text-xs uppercase font-black text-green-400 mb-2">Correct Answer:</h4>
                                                    <div className="bg-green-900/20 border border-green-500/30 p-4 rounded-xl text-lg text-green-100">
                                                        {highlightWordInContext(dictationWords[dictationIndex].context, dictationWords[dictationIndex].vocabulary)}
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            {/* 🆕 V11.16: Removed Edit button - already in header */}
                                            <div className="mt-6">
                                                <button
                                                    onClick={async () => {
                                                        // 🆕 V11.5: Save difficulty to database
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
                                                        <p className="text-white/80 text-sm leading-relaxed">{selectionExplanation}</p>
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
                                                    <p className="text-white/90 text-sm leading-relaxed">{guessworkAIResult.explanation}</p>
                                                    {guessworkAIResult.is_synonym && guessworkAIResult.synonym_note && (
                                                        <p className="text-yellow-200/80 text-xs mt-2 italic">💡 {guessworkAIResult.synonym_note}</p>
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
                                        setTranslationInput('');
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
                                <div className="bg-gradient-to-br from-pink-600 to-purple-600 rounded-3xl p-8 mb-6 shadow-2xl">
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
                                                                translationSpanish
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
                                                        translationSpanish
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
                                                        setTranslationInput('');
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
                                                        setTranslationInput('');
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
                                        {/* Cambridge-style feedback */}
                                        {translationAIResult && (
                                            <div className="space-y-6">
                                                {/* Grade badge */}
                                                <div className="flex justify-center">
                                                    <div className={`inline-flex items-center gap-3 px-8 py-4 rounded-2xl border-2 ${
                                                        translationAIResult.grade === 'A' ? 'bg-green-900/20 border-green-500' :
                                                        translationAIResult.grade === 'B' ? 'bg-yellow-900/20 border-yellow-500' :
                                                        'bg-red-900/20 border-red-500'
                                                    }`}>
                                                        <span className="text-4xl">
                                                            {translationAIResult.grade === 'A' ? '🏆' :
                                                             translationAIResult.grade === 'B' ? '⭐' : '📝'}
                                                        </span>
                                                        <div>
                                                            <p className={`text-3xl font-black ${
                                                                translationAIResult.grade === 'A' ? 'text-green-400' :
                                                                translationAIResult.grade === 'B' ? 'text-yellow-400' :
                                                                'text-red-400'
                                                            }`}>
                                                                Grade {translationAIResult.grade}
                                                            </p>
                                                            <p className="text-white text-sm">
                                                                {translationAIResult.percentage}% - Cambridge Assessment
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* 🆕 V11.38: Improved feedback - single clear panel, no repetition */}
                                                {((translationAIResult.grammar_errors && translationAIResult.grammar_errors.length > 0) || 
                                                  (translationAIResult.vocabulary_issues && translationAIResult.vocabulary_issues.length > 0)) ? (
                                                    <div className="bg-slate-900/50 border border-slate-700 rounded-2xl p-6">
                                                        <h4 className="text-slate-300 font-bold uppercase text-sm mb-4 flex items-center gap-2">
                                                            <span className="text-2xl">🔍</span>
                                                            Errors Found
                                                        </h4>
                                                        
                                                        <div className="space-y-4">
                                                            {/* Grammar errors */}
                                                            {translationAIResult.grammar_errors && translationAIResult.grammar_errors.map((error, i) => (
                                                                <div key={`grammar-${i}`} className="bg-red-900/20 border-l-4 border-red-500 rounded-r-lg p-4">
                                                                    <div className="flex items-start gap-3">
                                                                        <span className="text-2xl shrink-0">⚠️</span>
                                                                        <div className="flex-1">
                                                                            <p className="text-red-300 font-bold text-xs uppercase mb-2">Grammar Error</p>
                                                                            <p className="text-red-100 text-sm leading-relaxed">{error}</p>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                            
                                                            {/* Vocabulary issues */}
                                                            {translationAIResult.vocabulary_issues && translationAIResult.vocabulary_issues.map((issue, i) => (
                                                                <div key={`vocab-${i}`} className="bg-yellow-900/20 border-l-4 border-yellow-500 rounded-r-lg p-4">
                                                                    <div className="flex items-start gap-3">
                                                                        <span className="text-2xl shrink-0">📝</span>
                                                                        <div className="flex-1">
                                                                            <p className="text-yellow-300 font-bold text-xs uppercase mb-2">Vocabulary Issue</p>
                                                                            <p className="text-yellow-100 text-sm leading-relaxed">{issue}</p>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    // Perfect translation
                                                    <div className="bg-green-900/20 border border-green-500/30 rounded-2xl p-6">
                                                        <div className="flex items-center gap-3">
                                                            <span className="text-4xl">🎉</span>
                                                            <div>
                                                                <p className="text-green-300 font-bold text-lg">Perfect Translation!</p>
                                                                <p className="text-green-200 text-sm">No errors found. Excellent work!</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* 🆕 V11.38: Comparison - Your Translation vs Original English only */}
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <div>
                                                        <h4 className="text-xs uppercase font-black text-slate-500 mb-2">Your Translation:</h4>
                                                        <div className="bg-slate-800 p-4 rounded-xl text-base text-white">
                                                            {translationInput}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <h4 className="text-xs uppercase font-black text-indigo-400 mb-2">Original English:</h4>
                                                        <div className="bg-indigo-900/20 border border-indigo-500/30 p-4 rounded-xl text-base text-indigo-100">
                                                            {translationWords[translationIndex].context}
                                                        </div>
                                                    </div>
                                                </div>
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
                                                        setTranslationInput('');
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
                                                        setTranslationInput('');
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
                                                        <span className="text-blue-300/60 font-semibold">Avg {statsData.exercises.dictation.avgErrors} err/attempt</span>
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


                </div>
            );
        }


export default App
