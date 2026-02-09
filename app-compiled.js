import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
const {
  useState,
  useEffect,
  useRef,
  useMemo
} = React;
const FAMILIES = ["Noun", "Adjective", "Adverb", "Verb", "Phrasal Verb", "Idiom", "Chunk"];
const DIFFICULTIES = ["Passive", "Emerging", "Active"];
const DEFAULT_PROMPT = 'Define the "{word}", with exact synonyms, in context, word family and level of difficulty for language learning, in a concise way.';
function App() {
  var _improveData$selectio, _improveData$selectio4, _improveData$selectio7, _improveData$selectio8, _improveData$selectio9, _improveData$selectio10, _improveData$selectio13, _mergeData$similar, _mergeData$similar2;
  // 🆕 V11.17: Supabase credentials configurable in Settings (with defaults for immediate functionality)
  // Note: Anon key is public by design and safe to include in frontend code
  const [supabaseUrl, setSupabaseUrl] = useState(localStorage.getItem('supabase_url') || 'https://hswnwproeongfxavkjey.supabase.co');
  const [supabaseKey, setSupabaseKey] = useState(localStorage.getItem('supabase_key') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhzd253cHJvZW9uZ2Z4YXZramV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMDk2NDksImV4cCI6MjA4NDY4NTY0OX0.zUK7ulrqOe0wSo6z4YG7XU39MYlRm-plB1K0vmSSXSE');

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
  const [aiSearchPrompt, setAiSearchPrompt] = useState(localStorage.getItem('ai_search_prompt') || 'For the English word/expression "{word}", provide:\n· Meaning.\n· Family: provide if the "{word}" is a noun, adjective, phrasal verb, idiom, etc.\n· Synonyms: some exact British English synonyms.\n· Context: Some natural sentences using this "{word}" in a sentence in British English.\n· Level: give the related level according to the Cambridge school.');

  // 🆕 V11.9: Undo history (stores last change for each word)
  const [undoHistory, setUndoHistory] = useState({});

  // 🆕 V11.9: Original data before editing (for restore in modal)
  const [originalEditData, setOriginalEditData] = useState(null);
  const [geminiKey, setGeminiKey] = useState((localStorage.getItem('groq_api_key') || '').trim());
  const [magicLoading, setMagicLoading] = useState(false);
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
  const [magicFillPrompt, setMagicFillPrompt] = useState(localStorage.getItem('magic_fill_prompt') || 'For the English word/expression "{word}", provide:\n\n1. SYNONYMS: 2-4 British English synonyms (comma-separated)\n   - IMPORTANT: Synonyms MUST match the same grammatical FAMILY as "{word}"\n   - Example: If "{word}" is a phrasal verb, give phrasal verb synonyms\n   - Example: If "{word}" is an idiom, give idiomatic expression synonyms\n\n2. CONTEXT: A natural sentence (12-15 words) using EXACTLY "{word}" in British English\n   â›"ï¸ CRITICAL: You MUST use the EXACT word/phrase "{word}" in your sentence\n   â›"ï¸ DO NOT use synonyms - use "{word}" EXACTLY as written\n   â›"ï¸ DO NOT substitute with similar words\n   âœ… EXAMPLE: If word is "suck at", sentence MUST contain "suck at" or "sucked at"\n   âœ… EXAMPLE: If word is "keep in check", sentence MUST contain "keep in check"\n   - The sentence should demonstrate correct grammatical function\n   - Make it sound natural and conversational\n\n3. FAMILY: Choose ONE that matches the PRIMARY grammatical function:\n   - Noun: Names a thing/person/concept\n   - Adjective: Describes a noun\n   - Adverb: Modifies verb/adjective (often ends in -ly)\n   - Verb: Action or state word\n   - Phrasal Verb: Verb + preposition (give up, look after)\n   - Idiom: Fixed expression with non-literal meaning (piece of cake, break the ice)\n   - Chunk: Multi-word expression or collocation\n\nREMINDER: The context sentence MUST include "{word}" exactly - no synonyms!\n\nRespond ONLY in this exact JSON format (no markdown, no backticks):\n{\n  "synonyms": "synonym1, synonym2, synonym3",\n  "context": "Example sentence with {word} here.",\n  "family": "Noun"\n}');

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

  // 🆕 V11.16: Selection countdown (blur options)
  const [selectionCountdown, setSelectionCountdown] = useState(parseInt(localStorage.getItem('selection_countdown') || '5'));
  const [selectionTimeLeft, setSelectionTimeLeft] = useState(0);
  const [selectionOptionsVisible, setSelectionOptionsVisible] = useState(false);

  // 🆕 V11.16: Writing exercise states
  const [showWriting, setShowWriting] = useState(false);
  const [writingWords, setWritingWords] = useState([]);
  const [writingIndex, setWritingIndex] = useState(0);
  const [writingInput, setWritingInput] = useState('');
  const [showWritingAnswer, setShowWritingAnswer] = useState(false);
  const [writingDifficulty, setWritingDifficulty] = useState('');
  const [writingAttempts, setWritingAttempts] = useState(0);
  const [writingAIValidating, setWritingAIValidating] = useState(false);
  const [writingAIResult, setWritingAIResult] = useState(null);
  const [showWritingHint, setShowWritingHint] = useState(false); // 🆕 V11.20
  const [writingHintMeaning, setWritingHintMeaning] = useState(''); // 🆕 V11.22
  const [writingHintLoading, setWritingHintLoading] = useState(false); // 🆕 V11.22

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
  const [flashcardAudioEnabled, setFlashcardAudioEnabled] = useState(localStorage.getItem('flashcard_audio') !== 'false');

  // 🆕 V11.7: Preferred voice selection
  const [preferredVoice, setPreferredVoice] = useState(localStorage.getItem('preferred_voice') || 'auto');
  const [availableVoices, setAvailableVoices] = useState([]);
  const searchInputRef = useRef(null);

  // 🆕 V11.7: Load available voices
  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      // Filter British English voices
      const gbVoices = voices.filter(v => v.lang.includes('en-GB') || v.lang.includes('en_GB') || v.lang.includes('GB'));
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
    var _flashcardWords$flash;
    if (showFlashcards && isFlipped && flashcardAudioEnabled && (_flashcardWords$flash = flashcardWords[flashcardIndex]) !== null && _flashcardWords$flash !== void 0 && _flashcardWords$flash.context) {
      // Small delay to let the flip animation complete
      setTimeout(() => {
        speakText(flashcardWords[flashcardIndex].context, 1.0);
      }, 300);
    }
  }, [isFlipped, flashcardIndex, showFlashcards]);

  // 🆕 V11.14: Handle second Enter key in Dictation (after answer shown)
  useEffect(() => {
    if (!showDictation || !showDictationAnswer) return;
    const handleEnterAfterCheck = async e => {
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
            difficulty: dictationDifficulty,
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
            var _dictationWords$nextI;
            if ((_dictationWords$nextI = dictationWords[nextIndex]) !== null && _dictationWords$nextI !== void 0 && _dictationWords$nextI.context) {
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
        }
      }
    };
    window.addEventListener('keydown', handleEnterAfterCheck);
    return () => window.removeEventListener('keydown', handleEnterAfterCheck);
  }, [showDictation, showDictationAnswer, dictationIndex, dictationWords, dictationDifficulty]);

  // 🆕 V11.26: Handle second Enter key in Writing (after answer shown)
  useEffect(() => {
    if (!showWriting || !showWritingAnswer) return;
    const handleEnterAfterCheck = async e => {
      // Ignore if Enter comes from textarea/input to prevent double execution
      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') {
        return;
      }
      if (e.key === 'Enter' && showWritingAnswer) {
        e.preventDefault();

        // Save difficulty
        try {
          const currentWritingWord = writingWords[writingIndex];
          await supabase.from('vocabulary_v4').update({
            difficulty: writingDifficulty,
            writing_count: (currentWritingWord.writing_count || 0) + 1,
            last_practiced_date: new Date().toISOString()
          }).eq('id', currentWritingWord.id);
        } catch (error) {
          console.error('Error saving difficulty:', error);
        }

        // Move to next word or finish
        if (writingIndex < writingWords.length - 1) {
          setWritingIndex(writingIndex + 1);
          setWritingInput('');
          setShowWritingAnswer(false);
          setWritingDifficulty('');
          setWritingAttempts(0);
          setWritingAIResult(null);
        } else {
          alert('🎉 Exercise completed!');
          setShowWriting(false);
          setWritingWords([]);
          setWritingIndex(0);
          setWritingInput('');
          setShowWritingAnswer(false);
          setWritingDifficulty('');
          setWritingAttempts(0);
          setWritingAIResult(null);
        }
      }
    };
    window.addEventListener('keydown', handleEnterAfterCheck);
    return () => window.removeEventListener('keydown', handleEnterAfterCheck);
  }, [showWriting, showWritingAnswer, writingIndex, writingWords, writingDifficulty]);

  // 🆕 V11.32: Handle second Enter key in Translation (after answer shown)
  useEffect(() => {
    if (!showTranslation || !showTranslationAnswer) return;
    const handleEnterAfterCheck = async e => {
      // Ignore if Enter comes from textarea/input to prevent double execution
      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') {
        return;
      }
      if (e.key === 'Enter' && showTranslationAnswer) {
        e.preventDefault();

        // Save difficulty
        try {
          const currentTranslationWord = translationWords[translationIndex];
          await supabase.from('vocabulary_v4').update({
            difficulty: translationDifficulty,
            translation_count: (currentTranslationWord.translation_count || 0) + 1,
            translation_best_grade: (translationAIResult === null || translationAIResult === void 0 ? void 0 : translationAIResult.grade) || currentTranslationWord.translation_best_grade,
            last_practiced_date: new Date().toISOString()
          }).eq('id', currentTranslationWord.id);
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

  // 🆕 V11.4: Auto-refresh when searchMode changes
  useEffect(() => {
    console.log('📄 Filters changed, fetching words...', {
      search,
      familyFilter,
      emptyFilter,
      favouriteLevel,
      searchMode
    });
    fetchWords(0, true);
  }, [search, familyFilter, emptyFilter, difficultyFilter, favouriteLevel, searchMode]);

  // 🆕 V11.4: Check recycle bin count on mount
  useEffect(() => {
    checkRecycleBinCount();
    checkChangeHistoryCount(); // 🆕 V11.24
  }, []);

  // 🆕 V11.2: Auto-cleanup deleted words older than 48h
  useEffect(() => {
    const cleanupInterval = setInterval(async () => {
      const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      await supabase.from('vocabulary_v4').delete().not('deleted_at', 'is', null).lt('deleted_at', fortyEightHoursAgo);
      checkRecycleBinCount(); // 🆕 V11.4: Update count after cleanup
    }, 60 * 60 * 1000); // Check every hour

    return () => clearInterval(cleanupInterval);
  }, []);

  // 🆕 V11.4: Check recycle bin count
  async function checkRecycleBinCount() {
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const {
      count
    } = await supabase.from('vocabulary_v4').select('*', {
      count: 'exact',
      head: true
    }).not('deleted_at', 'is', null).gte('deleted_at', fortyEightHoursAgo);
    setRecycleBinCount(count || 0);
  }

  // 🆕 V11.42: Toggle favourite level (0 → 1 → 2 → 0)
  async function toggleFavourite(wordId, currentLevel) {
    const nextLevel = (currentLevel + 1) % 3;
    try {
      await supabase.from('vocabulary_v4').update({
        favourite: nextLevel
      }).eq('id', wordId);

      // Update local state without refreshing
      setWords(prevWords => prevWords.map(w => w.id === wordId ? {
        ...w,
        favourite: nextLevel
      } : w));

      // Update in all active exercise contexts
      if (showFlashcards) {
        setFlashcardWords(prevWords => prevWords.map(w => w.id === wordId ? {
          ...w,
          favourite: nextLevel
        } : w));
      }
      if (showDictation) {
        setDictationWords(prevWords => prevWords.map(w => w.id === wordId ? {
          ...w,
          favourite: nextLevel
        } : w));
      }
      if (showSelection) {
        setSelectionWords(prevWords => prevWords.map(w => w.id === wordId ? {
          ...w,
          favourite: nextLevel
        } : w));
      }
      if (showWriting) {
        setWritingWords(prevWords => prevWords.map(w => w.id === wordId ? {
          ...w,
          favourite: nextLevel
        } : w));
      }
      if (showTranslation) {
        setTranslationWords(prevWords => prevWords.map(w => w.id === wordId ? {
          ...w,
          favourite: nextLevel
        } : w));
      }
    } catch (error) {
      console.error('Error toggling favourite:', error);
    }
  }

  // 🆕 V11.24: Check change history count
  async function checkChangeHistoryCount() {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const {
      count
    } = await supabase.from('vocabulary_v4').select('*', {
      count: 'exact',
      head: true
    }).not('modified_at', 'is', null).not('previous_version', 'is', null).gte('modified_at', twoHoursAgo).is('deleted_at', null);
    setChangeHistoryCount(count || 0);
  }

  // 🆕 V11.42: Star icon component for favourite levels
  const StarIcon = ({
    level,
    size = "text-xl",
    onClick
  }) => {
    const getStarClass = () => {
      if (level === 0) return 'far fa-star star-off';
      if (level === 1) return 'fas fa-star-half-alt star-half';
      return 'fas fa-star star-on';
    };
    return /*#__PURE__*/_jsx("button", {
      onClick: onClick,
      className: "tooltip",
      "data-tip": level === 0 ? "Not favourite" : level === 1 ? "Favourite level 1" : "Favourite level 2",
      children: /*#__PURE__*/_jsx("i", {
        className: `${getStarClass()} ${size}`
      })
    });
  };

  // 🆕 V11.26: Smart partial matching - finds phrases even with missing words
  function highlightWordInContext(context, vocabulary) {
    if (!context || !vocabulary) return context;
    const escapeRegex = str => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // 1. Try EXACT match first (fastest path)
    const escapedVocab = escapeRegex(vocabulary);
    let regex = new RegExp(`\\b${escapedVocab}\\b`, 'gi');
    let match = context.match(regex);
    if (match) {
      const parts = context.split(regex);
      let matchIndex = 0;
      return parts.map((part, index) => {
        if (index < parts.length - 1) {
          return /*#__PURE__*/_jsxs(React.Fragment, {
            children: [part, /*#__PURE__*/_jsx("strong", {
              className: "text-white font-black",
              children: match[matchIndex++]
            })]
          }, index);
        }
        return part;
      });
    }

    // 2. For SINGLE words: try conjugations
    if (!vocabulary.includes(' ')) {
      const vocabLower = vocabulary.toLowerCase();
      const variations = [vocabLower + 's', vocabLower + 'es', vocabLower + 'ed', vocabLower + 'd', vocabLower + 'ing', vocabLower.replace(/e$/, '') + 'ing', vocabLower.replace(/y$/, 'ies'), vocabLower.replace(/y$/, 'ied')];
      for (const variation of variations) {
        const escapedVar = escapeRegex(variation);
        const varRegex = new RegExp(`\\b${escapedVar}\\b`, 'gi');
        const varMatch = context.match(varRegex);
        if (varMatch) {
          const parts = context.split(varRegex);
          let matchIndex = 0;
          return parts.map((part, index) => {
            if (index < parts.length - 1) {
              return /*#__PURE__*/_jsxs(React.Fragment, {
                children: [part, /*#__PURE__*/_jsx("strong", {
                  className: "text-white font-black",
                  children: varMatch[matchIndex++]
                })]
              }, index);
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
              return /*#__PURE__*/_jsxs(React.Fragment, {
                children: [part, /*#__PURE__*/_jsx("strong", {
                  className: "text-white font-black",
                  children: coreMatch[matchIndex++]
                })]
              }, index);
            }
            return part;
          });
        }
        break;
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
        const isConjugationMatch = contextWord === vocabWord || contextWord === vocabWord + 's' || contextWord === vocabWord + 'es' || contextWord === vocabWord + 'ed' || contextWord === vocabWord + 'd' || contextWord === vocabWord + 'ing' || contextWord === vocabWord.replace(/e$/, '') + 'ing' || contextWord === vocabWord.replace(/y$/, 'ies') || contextWord === vocabWord.replace(/y$/, 'ied');

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
            contextIdx++;
            // 🆕 V11.27: More generous skip allowance (up to 5 words)
            if (matchedTotal > 0 && contextIdx - lastMatchIdx > 5) break;
          }
        }
      }

      // Calculate scores
      const keyWordScore = keyWords.length > 0 ? matchedKeyWords / keyWords.length : 0;
      const totalScore = vocabWords.length > 0 ? matchedTotal / vocabWords.length : 0;

      // 🆕 V11.27: Prioritize key word matches even more strongly
      const finalScore = keyWords.length > 0 ? (keyWordScore * 2 + totalScore) / 3 : totalScore;

      // Accept match if: 70% of key words found OR 50% total words found OR at least 2 words matched
      if (finalScore > bestScore && (keyWords.length > 0 && keyWordScore >= 0.7 || totalScore >= 0.5 || matchedTotal >= 2)) {
        bestScore = finalScore;
        bestMatch = {
          start: firstMatchIdx !== -1 ? firstMatchIdx : start,
          // 🆕 V11.28: Use first match index
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
          result.push(/*#__PURE__*/_jsx("strong", {
            className: "text-white font-black",
            children: contextWords[i]
          }, `match-${i}`));
        } else {
          result.push(contextWords[i]);
        }

        // Add space if not last word
        if (i < contextWords.length - 1) {
          result.push(' ');
        }
      }
      return /*#__PURE__*/_jsx(React.Fragment, {
        children: result
      });
    }
    return context;
  }

  // 🆕 V11.27: Ultra-flexible matching for hiding words too
  function hideWordInContext(context, vocabulary) {
    if (!context || !vocabulary) return context;
    const escapeRegex = str => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Try exact match first
    const escapedVocab = escapeRegex(vocabulary);
    const exactRegex = new RegExp(`\\b${escapedVocab}\\b`, 'gi');
    if (context.match(exactRegex)) {
      return context.replace(exactRegex, '______');
    }

    // For single words: try conjugations
    if (!vocabulary.includes(' ')) {
      const vocabLower = vocabulary.toLowerCase();
      const variations = [vocabLower + 's', vocabLower + 'es', vocabLower + 'ed', vocabLower + 'd', vocabLower + 'ing', vocabLower.replace(/e$/, '') + 'ing', vocabLower.replace(/y$/, 'ies'), vocabLower.replace(/y$/, 'ied')];
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
        const isConjugationMatch = contextWord === vocabWord || contextWord === vocabWord + 's' || contextWord === vocabWord + 'es' || contextWord === vocabWord + 'ed' || contextWord === vocabWord + 'd' || contextWord === vocabWord + 'ing' || contextWord === vocabWord.replace(/e$/, '') + 'ing' || contextWord === vocabWord.replace(/y$/, 'ies') || contextWord === vocabWord.replace(/y$/, 'ied');
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
            // Not optional - search forward in context
            contextIdx++;
            if (matchedTotal > 0 && contextIdx - lastMatchIdx > 5) break;
          }
        }
      }
      const keyWordScore = keyWords.length > 0 ? matchedKeyWords / keyWords.length : 0;
      const totalScore = vocabWords.length > 0 ? matchedTotal / vocabWords.length : 0;
      const finalScore = keyWords.length > 0 ? (keyWordScore * 2 + totalScore) / 3 : totalScore;
      if (finalScore > bestScore && (keyWords.length > 0 && keyWordScore >= 0.7 || totalScore >= 0.5 || matchedTotal >= 2)) {
        bestScore = finalScore;
        bestMatch = {
          start: firstMatchIdx !== -1 ? firstMatchIdx : start,
          // 🆕 V11.28: Use first match index
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
          const preferredVoices = ['Google UK English Female', 'Google UK English Male', 'Microsoft Hazel Desktop - English (Great Britain)', 'Microsoft George - English (United Kingdom)', 'Karen',
          // macOS British voice
          'Daniel' // macOS British voice
          ];
          let selectedVoice = voices.find(voice => voice.lang.includes('GB') && voice.name.includes('Google'));
          if (!selectedVoice) {
            selectedVoice = voices.find(voice => preferredVoices.some(pv => voice.name.includes(pv)));
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
    if (!correctAnswer) return {
      highlighted: '',
      errorCount: 0
    };

    // 🆕 V11.6: Empty input should be marked as error
    if (!userInput || userInput.trim() === '') {
      // Count all words as errors
      const correctWords = correctAnswer.toLowerCase().trim().split(/\s+/);
      return {
        highlighted: /*#__PURE__*/_jsx("span", {
          className: "text-red-400 italic",
          children: "(No answer provided)"
        }),
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
        return /*#__PURE__*/_jsxs("span", {
          className: "text-red-400 font-bold",
          children: [word, " "]
        }, index);
      }
      if (word === correctWord) {
        // Correct word
        return /*#__PURE__*/_jsxs("span", {
          className: "text-green-300",
          children: [word, " "]
        }, index);
      } else {
        // Incorrect word
        errorCount++;
        return /*#__PURE__*/_jsxs("span", {
          className: "text-red-400 font-bold line-through",
          children: [word, " "]
        }, index);
      }
    });

    // Check for missing words
    if (correctWords.length > userWords.length) {
      errorCount += correctWords.length - userWords.length;
    }
    return {
      highlighted,
      errorCount
    };
  }

  // 🆕 V11.5: Calculate difficulty based on error count
  function calculateDifficulty(errorCount) {
    if (errorCount <= 1) return 'Active';
    if (errorCount === 2) return 'Emerging';
    return 'Passive';
  }
  async function fetchWords(pageNum, isNewSearch = false) {
    if (loading && !isNewSearch) return;
    console.log('🔥 fetchWords called:', {
      pageNum,
      isNewSearch,
      currentFilters: {
        search,
        familyFilter,
        emptyFilter,
        favouriteLevel
      }
    });
    setLoading(true);
    const PAGE_SIZE = 50;
    try {
      let query = supabase.from('vocabulary_v4').select('*', {
        count: 'exact'
      });

      // 🆕 V11.2: Exclude deleted items
      query = query.is('deleted_at', null);

      // 🆕 V11.24: Search modes (0=vocabulary only, 1=vocabulary+synonyms, 2=AI Deep Search)
      if (search) {
        if (searchMode === 0) {
          // Mode 0: Search only in vocabulary column
          query = query.ilike('vocabulary', `%${search}%`);
        } else if (searchMode === 1) {
          // Mode 1: Search in vocabulary + synonyms
          query = query.or(`vocabulary.ilike.%${search}%,synonyms.ilike.%${search}%`);
        } else if (searchMode === 2) {
          // Mode 2: AI Deep Search
          const synonyms = await getAISynonyms(search);
          if (synonyms.length > 0) {
            const searchTerms = [search, ...synonyms].map(term => `vocabulary.ilike.%${term}%,synonyms.ilike.%${term}%`).join(',');
            query = query.or(searchTerms);
          } else {
            query = query.or(`vocabulary.ilike.%${search}%,synonyms.ilike.%${search}%`);
          }
        }
      }
      if (familyFilter !== 'All') query = query.eq('family', familyFilter);
      if (difficultyFilter !== 'All') query = query.eq('difficulty', difficultyFilter);
      // 🆕 V11.42: Filter by favourite level
      if (favouriteLevel === 1) query = query.eq('favourite', 1);else if (favouriteLevel === 2) query = query.eq('favourite', 2);else if (favouriteLevel === 3) query = query.in('favourite', [1, 2]);

      // 🆕 V11.54: Fixed to include literal string "NULL" as well
      if (emptyFilter === 'Synonyms') query = query.or('synonyms.is.null,synonyms.eq.');else if (emptyFilter === 'Context') query = query.or('context.is.null,context.eq.');else if (emptyFilter === 'Family') query = query.or('family.is.null,family.eq.');else if (emptyFilter === 'Difficulty') query = query.or('difficulty.is.null,difficulty.eq.,difficulty.eq.NULL');
      const {
        data,
        count,
        error
      } = await query.order('created_at', {
        ascending: false
      }).range(pageNum * PAGE_SIZE, pageNum * PAGE_SIZE + PAGE_SIZE - 1);
      if (error && error.code === 'PGRST103') {
        console.log('⚠️ No more data to load (reached end)');
        setHasMore(false);
        setLoading(false);
        return;
      }
      console.log('📦 Received data:', {
        count,
        dataLength: data === null || data === void 0 ? void 0 : data.length,
        isNewSearch,
        hasData: !!data
      });
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
  async function getAISynonyms(word) {
    const apiKey = geminiKey.trim();
    if (!apiKey) return [];
    setDeepSearchLoading(true);
    try {
      var _data$choices;
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
            content: `List 5-8 synonyms for "${word}" in British English. Respond ONLY with comma-separated words, no explanations: synonym1, synonym2, synonym3`
          }],
          temperature: 0.5,
          max_tokens: 100
        })
      });
      if (!response.ok) return [];
      const data = await response.json();
      const synonymsText = ((_data$choices = data.choices) === null || _data$choices === void 0 || (_data$choices = _data$choices[0]) === null || _data$choices === void 0 || (_data$choices = _data$choices.message) === null || _data$choices === void 0 ? void 0 : _data$choices.content) || '';
      const synonyms = synonymsText.split(',').map(s => s.trim()).filter(s => s);
      console.log('🔍 Deep Search synonyms:', synonyms);
      return synonyms;
    } catch (error) {
      console.error('Deep Search error:', error);
      return [];
    } finally {
      setDeepSearchLoading(false);
    }
  }

  // 🆕 V11.2: Load recycle bin
  async function loadRecycleBin() {
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const {
      data
    } = await supabase.from('vocabulary_v4').select('*').not('deleted_at', 'is', null).gte('deleted_at', fortyEightHoursAgo).order('deleted_at', {
      ascending: false
    });
    setDeletedWords(data || []);
    setShowRecycleBin(true);
  }

  // 🆕 V11.21: Load change history from last 2 hours
  async function loadChangeHistory() {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    console.log('🔍 Loading change history from:', twoHoursAgo);
    const {
      data,
      error
    } = await supabase.from('vocabulary_v4').select('*').not('modified_at', 'is', null).not('previous_version', 'is', null).gte('modified_at', twoHoursAgo).is('deleted_at', null).order('modified_at', {
      ascending: false
    });
    if (error) {
      console.error('❌ Change history error:', error);
      alert('Error loading change history: ' + error.message);
    }
    console.log('📊 Change history data:', data);
    console.log('📊 Found', (data === null || data === void 0 ? void 0 : data.length) || 0, 'changed words');
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
          await supabase.from('vocabulary_v4').update({
            ...previousData,
            previous_version: null,
            modified_at: null
          }).eq('id', id);
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
        await supabase.from('vocabulary_v4').update({
          deleted_at: null
        }).eq('id', id);
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
        await supabase.from('vocabulary_v4').delete().eq('id', id);
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
      const {
        data: allWords
      } = await supabase.from('vocabulary_v4').select('*').is('deleted_at', null);
      if (!allWords) {
        setStatsData(null);
        return;
      }
      const total = allWords.length;
      const practiced = allWords.filter(w => w.flashcard_count > 0 || w.dictation_count > 0 || w.selection_count > 0 || w.writing_count > 0 || w.translation_count > 0).length;
      const pending = total - practiced;
      const favourites = allWords.filter(w => w.favourite).length;
      const easy = allWords.filter(w => w.difficulty === 'Active').length;
      const medium = allWords.filter(w => w.difficulty === 'Emerging').length;
      const hard = allWords.filter(w => w.difficulty === 'Passive').length;
      const notPracticed = total - easy - medium - hard;
      const flashcardPracticed = allWords.filter(w => w.flashcard_count > 0).length;
      const dictationPracticed = allWords.filter(w => w.dictation_count > 0);
      const dictationAvgErrors = dictationPracticed.length > 0 ? (dictationPracticed.reduce((sum, w) => sum + (w.dictation_errors_total || 0), 0) / dictationPracticed.reduce((sum, w) => sum + w.dictation_count, 0)).toFixed(2) : 0;
      const selectionPracticed = allWords.filter(w => w.selection_count > 0);
      const selectionAvgAttempts = selectionPracticed.length > 0 ? (selectionPracticed.reduce((sum, w) => sum + (w.selection_attempts_total || 0), 0) / selectionPracticed.reduce((sum, w) => sum + w.selection_count, 0)).toFixed(2) : 0;
      const writingPracticed = allWords.filter(w => w.writing_count > 0).length;
      const translationPracticed = allWords.filter(w => w.translation_count > 0);
      const gradeC2 = translationPracticed.filter(w => w.translation_best_grade === 'C2').length;
      const gradeC1 = translationPracticed.filter(w => w.translation_best_grade === 'C1').length;
      const gradeB2 = translationPracticed.filter(w => w.translation_best_grade === 'B2').length;
      const gradeB1 = translationPracticed.filter(w => w.translation_best_grade === 'B1').length;
      const hardestByErrors = dictationPracticed.map(w => ({
        word: w.vocabulary,
        errors: (w.dictation_errors_total || 0) / w.dictation_count
      })).sort((a, b) => b.errors - a.errors).slice(0, 10);
      const hardestByAttempts = selectionPracticed.map(w => ({
        word: w.vocabulary,
        attempts: (w.selection_attempts_total || 0) / w.selection_count
      })).sort((a, b) => b.attempts - a.attempts).slice(0, 10);
      setStatsData({
        overview: {
          total,
          practiced,
          pending,
          favourites,
          practicedPercent: total > 0 ? (practiced / total * 100).toFixed(1) : 0
        },
        difficulty: {
          easy,
          medium,
          hard,
          notPracticed
        },
        exercises: {
          flashcard: flashcardPracticed,
          dictation: {
            count: dictationPracticed.length,
            avgErrors: dictationAvgErrors
          },
          selection: {
            count: selectionPracticed.length,
            avgAttempts: selectionAvgAttempts
          },
          writing: writingPracticed,
          translation: {
            count: translationPracticed.length,
            gradeC2,
            gradeC1,
            gradeB2,
            gradeB1
          }
        },
        hardest: {
          byErrors: hardestByErrors,
          byAttempts: hardestByAttempts
        }
      });
    } catch (error) {
      console.error('Stats error:', error);
      alert('Error loading statistics');
    } finally {
      setLoadingStats(false);
    }
  }

  // 🆕 V11.44: Open exercise drill-down to practice difficult words
  async function openExerciseDrillDown(exerciseType) {
    try {
      const {
        data: allWords
      } = await supabase.from('vocabulary_v4').select('*').is('deleted_at', null);
      if (!allWords) return;
      let difficultWords = [];

      // Filter words based on exercise-specific difficulty criteria
      switch (exerciseType) {
        case 'flashcard':
          // Words with Passive/Emerging difficulty that have been practiced
          difficultWords = allWords.filter(w => w.flashcard_count > 0 && (w.difficulty === 'Passive' || w.difficulty === 'Emerging'));
          break;
        case 'dictation':
          // Words with average > 2 errors per attempt
          difficultWords = allWords.filter(w => w.dictation_count > 0 && w.dictation_errors_total / w.dictation_count > 2);
          break;
        case 'selection':
          // Words with average > 2 attempts per question
          difficultWords = allWords.filter(w => w.selection_count > 0 && w.selection_attempts_total / w.selection_count > 2);
          break;
        case 'writing':
          // Words with Passive/Emerging difficulty that have been practiced
          difficultWords = allWords.filter(w => w.writing_count > 0 && (w.difficulty === 'Passive' || w.difficulty === 'Emerging'));
          break;
        case 'translation':
          // Words with B1/B2 grade (lower Cambridge levels)
          difficultWords = allWords.filter(w => w.translation_count > 0 && (w.translation_best_grade === 'B1' || w.translation_best_grade === 'B2'));
          break;
      }

      // 🆕 V11.52: Close Stats modal before opening drill-down
      setShowStats(false);
      setDrillDownExercise(exerciseType);
      setDrillDownWords(difficultWords);
      setSelectedDrillDownWords([]);
      setShowExerciseDrillDown(true);
    } catch (error) {
      console.error('Error loading drill-down:', error);
      alert('Error loading exercise details');
    }
  }

  // 🆕 V11.44: Practice selected difficult words
  async function practiceSelectedWords() {
    if (selectedDrillDownWords.length === 0) {
      alert('Please select at least one word to practice');
      return;
    }
    const selectedWords = drillDownWords.filter(w => selectedDrillDownWords.includes(w.id));

    // Close drill-down modal
    setShowExerciseDrillDown(false);

    // Sort by exercise mode
    let sortedWords = [...selectedWords];
    if (exerciseMode === 'memory') {
      const difficultyOrder = {
        'Passive': 0,
        'Emerging': 1,
        'Active': 2
      };
      sortedWords.sort((a, b) => {
        var _difficultyOrder$a$di, _difficultyOrder$b$di;
        const aOrder = (_difficultyOrder$a$di = difficultyOrder[a.difficulty]) !== null && _difficultyOrder$a$di !== void 0 ? _difficultyOrder$a$di : 3;
        const bOrder = (_difficultyOrder$b$di = difficultyOrder[b.difficulty]) !== null && _difficultyOrder$b$di !== void 0 ? _difficultyOrder$b$di : 3;
        return aOrder - bOrder;
      });
    } else {
      sortedWords = sortedWords.sort(() => Math.random() - 0.5);
    }

    // Launch appropriate exercise
    switch (drillDownExercise) {
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
          const sameLevelFamily = selectedWords.filter(w => w.vocabulary !== word.vocabulary && w.family === word.family);
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
      case 'writing':
        setWritingWords(sortedWords);
        setWritingIndex(0);
        setWritingInput('');
        setShowWritingAnswer(false);
        setWritingDifficulty('');
        setWritingAttempts(0);
        setWritingAIResult(null);
        setShowWriting(true);
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
      await supabase.from('vocabulary_v4').update({
        difficulty: null
      }).is('deleted_at', null);
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
        flashcard_count: 0,
        dictation_count: 0,
        dictation_errors_total: 0,
        selection_count: 0,
        selection_attempts_total: 0,
        writing_count: 0,
        translation_count: 0,
        translation_best_grade: null,
        last_practiced_date: null
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
        difficulty: null,
        flashcard_count: 0,
        dictation_count: 0,
        dictation_errors_total: 0,
        selection_count: 0,
        selection_attempts_total: 0,
        writing_count: 0,
        translation_count: 0,
        translation_best_grade: null,
        last_practiced_date: null
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
          query = query.ilike('vocabulary', `%${search}%`);
        } else if (searchMode === 1) {
          query = query.or(`vocabulary.ilike.%${search}%,synonyms.ilike.%${search}%`);
        } else if (searchMode === 2) {
          const synonyms = await getAISynonyms(search);
          if (synonyms.length > 0) {
            const searchTerms = [search, ...synonyms].map(term => `vocabulary.ilike.%${term}%,synonyms.ilike.%${term}%`).join(',');
            query = query.or(searchTerms);
          } else {
            query = query.or(`vocabulary.ilike.%${search}%,synonyms.ilike.%${search}%`);
          }
        }
      }
      if (familyFilter !== 'All') query = query.eq('family', familyFilter);
      if (difficultyFilter !== 'All') query = query.eq('difficulty', difficultyFilter);
      // 🆕 V11.42: Filter by favourite level
      if (favouriteLevel === 1) query = query.eq('favourite', 1);else if (favouriteLevel === 2) query = query.eq('favourite', 2);else if (favouriteLevel === 3) query = query.in('favourite', [1, 2]);

      // 🆕 V11.54: Fixed to include literal string "NULL" as well
      if (emptyFilter === 'Synonyms') query = query.or('synonyms.is.null,synonyms.eq.');else if (emptyFilter === 'Context') query = query.or('context.is.null,context.eq.');else if (emptyFilter === 'Family') query = query.or('family.is.null,family.eq.');else if (emptyFilter === 'Difficulty') query = query.or('difficulty.is.null,difficulty.eq.,difficulty.eq.NULL');
      const {
        data,
        error
      } = await query.order('created_at', {
        ascending: false
      });
      if (error) throw error;
      if (data && data.length > 0) {
        // 🆕 V11.6: Sort by mode
        let sortedData = [...data];
        if (exerciseMode === 'memory') {
          // Memory mode: Hard → Medium → Easy → No difficulty
          const difficultyOrder = {
            'Passive': 0,
            'Emerging': 1,
            'Active': 2
          };
          sortedData.sort((a, b) => {
            var _difficultyOrder$a$di2, _difficultyOrder$b$di2;
            const aOrder = (_difficultyOrder$a$di2 = difficultyOrder[a.difficulty]) !== null && _difficultyOrder$a$di2 !== void 0 ? _difficultyOrder$a$di2 : 3;
            const bOrder = (_difficultyOrder$b$di2 = difficultyOrder[b.difficulty]) !== null && _difficultyOrder$b$di2 !== void 0 ? _difficultyOrder$b$di2 : 3;
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
      await supabase.from('vocabulary_v4').update({
        difficulty,
        flashcard_count: (currentWord.flashcard_count || 0) + 1,
        last_practiced_date: new Date().toISOString()
      }).eq('id', currentWord.id);

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
          query = query.ilike('vocabulary', `%${search}%`);
        } else if (searchMode === 1) {
          query = query.or(`vocabulary.ilike.%${search}%,synonyms.ilike.%${search}%`);
        } else if (searchMode === 2) {
          const synonyms = await getAISynonyms(search);
          if (synonyms.length > 0) {
            const searchTerms = [search, ...synonyms].map(term => `vocabulary.ilike.%${term}%,synonyms.ilike.%${term}%`).join(',');
            query = query.or(searchTerms);
          } else {
            query = query.or(`vocabulary.ilike.%${search}%,synonyms.ilike.%${search}%`);
          }
        }
      }
      if (familyFilter !== 'All') query = query.eq('family', familyFilter);
      if (difficultyFilter !== 'All') query = query.eq('difficulty', difficultyFilter);
      // 🆕 V11.42: Filter by favourite level
      if (favouriteLevel === 1) query = query.eq('favourite', 1);else if (favouriteLevel === 2) query = query.eq('favourite', 2);else if (favouriteLevel === 3) query = query.in('favourite', [1, 2]);
      const {
        data,
        error
      } = await query.order('created_at', {
        ascending: false
      });
      if (error) throw error;
      if (data && data.length > 0) {
        // 🆕 V11.6: Sort by mode
        let sortedData = [...data];
        if (exerciseMode === 'memory') {
          // Memory mode: Hard → Medium → Easy → No difficulty
          const difficultyOrder = {
            'Passive': 0,
            'Emerging': 1,
            'Active': 2
          };
          sortedData.sort((a, b) => {
            var _difficultyOrder$a$di3, _difficultyOrder$b$di3;
            const aOrder = (_difficultyOrder$a$di3 = difficultyOrder[a.difficulty]) !== null && _difficultyOrder$a$di3 !== void 0 ? _difficultyOrder$a$di3 : 3;
            const bOrder = (_difficultyOrder$b$di3 = difficultyOrder[b.difficulty]) !== null && _difficultyOrder$b$di3 !== void 0 ? _difficultyOrder$b$di3 : 3;
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
          query = query.ilike('vocabulary', `%${search}%`);
        } else if (searchMode === 1) {
          query = query.or(`vocabulary.ilike.%${search}%,synonyms.ilike.%${search}%`);
        } else if (searchMode === 2) {
          const synonyms = await getAISynonyms(search);
          if (synonyms.length > 0) {
            const searchTerms = [search, ...synonyms].map(term => `vocabulary.ilike.%${term}%,synonyms.ilike.%${term}%`).join(',');
            query = query.or(searchTerms);
          } else {
            query = query.or(`vocabulary.ilike.%${search}%,synonyms.ilike.%${search}%`);
          }
        }
      }
      if (familyFilter !== 'All') query = query.eq('family', familyFilter);
      if (difficultyFilter !== 'All') query = query.eq('difficulty', difficultyFilter);
      // 🆕 V11.42: Filter by favourite level
      if (favouriteLevel === 1) query = query.eq('favourite', 1);else if (favouriteLevel === 2) query = query.eq('favourite', 2);else if (favouriteLevel === 3) query = query.in('favourite', [1, 2]);
      const {
        data,
        error
      } = await query.order('created_at', {
        ascending: false
      });
      if (error) throw error;
      if (data && data.length > 0) {
        // 🆕 V11.19: Filter words to only include those with enough same family options
        const validWords = data.filter(word => {
          const sameLevelFamily = data.filter(w => w.vocabulary !== word.vocabulary && w.family === word.family);
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
          const difficultyOrder = {
            'Passive': 0,
            'Emerging': 1,
            'Active': 2
          };
          sortedData.sort((a, b) => {
            var _difficultyOrder$a$di4, _difficultyOrder$b$di4;
            const aOrder = (_difficultyOrder$a$di4 = difficultyOrder[a.difficulty]) !== null && _difficultyOrder$a$di4 !== void 0 ? _difficultyOrder$a$di4 : 3;
            const bOrder = (_difficultyOrder$b$di4 = difficultyOrder[b.difficulty]) !== null && _difficultyOrder$b$di4 !== void 0 ? _difficultyOrder$b$di4 : 3;
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

        // Generate options for first word
        const firstOptions = generateSelectionOptions(sortedData[0], sortedData);
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
    const filteredWords = allWords.filter(w => w.vocabulary !== correctWord.vocabulary && w.family === correctWord.family);

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

  // 🆕 V11.22: Generate meaning for Writing hint with AI
  async function generateWritingHintMeaning(word) {
    const apiKey = geminiKey.trim();
    if (!apiKey || apiKey === '') {
      setWritingHintMeaning('⚠️ API key not configured. Please set your Groq API Key in Settings.');
      return;
    }
    setWritingHintLoading(true);
    try {
      var _data$choices2;
      const prompt = `What does "${word}" mean? Provide ONLY the definition/meaning in British English. Keep it simple and clear, maximum 2 sentences. IMPORTANT: Do NOT mention the word "${word}" itself in your response - just explain what it means. Do NOT include examples, synonyms, or usage notes.`;
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
            content: prompt
          }],
          temperature: 0.5,
          max_tokens: 150
        })
      });
      if (!response.ok) {
        throw new Error('Failed to generate meaning');
      }
      const data = await response.json();
      const meaning = ((_data$choices2 = data.choices) === null || _data$choices2 === void 0 || (_data$choices2 = _data$choices2[0]) === null || _data$choices2 === void 0 || (_data$choices2 = _data$choices2.message) === null || _data$choices2 === void 0 ? void 0 : _data$choices2.content) || 'Unable to generate meaning.';
      setWritingHintMeaning(meaning.trim());
    } catch (error) {
      console.error('Generate meaning error:', error);
      setWritingHintMeaning('❌ Error generating meaning. Please try again.');
    } finally {
      setWritingHintLoading(false);
    }
  }

  // 🆕 V11.16: Load Writing Exercise
  async function loadWriting() {
    try {
      let query = supabase.from('vocabulary_v4').select('*');
      query = query.is('deleted_at', null);
      query = query.not('context', 'is', null);
      query = query.neq('context', '');

      // 🆕 V11.38: Respect searchMode like fetchWords
      if (search) {
        if (searchMode === 0) {
          query = query.ilike('vocabulary', `%${search}%`);
        } else if (searchMode === 1) {
          query = query.or(`vocabulary.ilike.%${search}%,synonyms.ilike.%${search}%`);
        } else if (searchMode === 2) {
          const synonyms = await getAISynonyms(search);
          if (synonyms.length > 0) {
            const searchTerms = [search, ...synonyms].map(term => `vocabulary.ilike.%${term}%,synonyms.ilike.%${term}%`).join(',');
            query = query.or(searchTerms);
          } else {
            query = query.or(`vocabulary.ilike.%${search}%,synonyms.ilike.%${search}%`);
          }
        }
      }
      if (familyFilter !== 'All') query = query.eq('family', familyFilter);
      if (difficultyFilter !== 'All') query = query.eq('difficulty', difficultyFilter);
      // 🆕 V11.42: Filter by favourite level
      if (favouriteLevel === 1) query = query.eq('favourite', 1);else if (favouriteLevel === 2) query = query.eq('favourite', 2);else if (favouriteLevel === 3) query = query.in('favourite', [1, 2]);
      const {
        data,
        error
      } = await query.order('created_at', {
        ascending: false
      });
      if (error) throw error;
      if (data && data.length > 0) {
        // Sort by mode
        let sortedData = [...data];
        if (exerciseMode === 'memory') {
          const difficultyOrder = {
            'Passive': 0,
            'Emerging': 1,
            'Active': 2
          };
          sortedData.sort((a, b) => {
            var _difficultyOrder$a$di5, _difficultyOrder$b$di5;
            const aOrder = (_difficultyOrder$a$di5 = difficultyOrder[a.difficulty]) !== null && _difficultyOrder$a$di5 !== void 0 ? _difficultyOrder$a$di5 : 3;
            const bOrder = (_difficultyOrder$b$di5 = difficultyOrder[b.difficulty]) !== null && _difficultyOrder$b$di5 !== void 0 ? _difficultyOrder$b$di5 : 3;
            return aOrder - bOrder;
          });
        } else {
          sortedData = sortedData.sort(() => Math.random() - 0.5);
        }
        setWritingWords(sortedData);
        setWritingIndex(0);
        setWritingInput('');
        setShowWritingAnswer(false);
        setWritingDifficulty('');
        setWritingAttempts(0);
        setWritingAIResult(null);
        setShowWriting(true);
      } else {
        alert('No words with context found!');
      }
    } catch (err) {
      console.error('Error loading writing:', err);
      alert('Error loading writing');
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
          query = query.ilike('vocabulary', `%${search}%`);
        } else if (searchMode === 1) {
          query = query.or(`vocabulary.ilike.%${search}%,synonyms.ilike.%${search}%`);
        } else if (searchMode === 2) {
          const synonyms = await getAISynonyms(search);
          if (synonyms.length > 0) {
            const searchTerms = [search, ...synonyms].map(term => `vocabulary.ilike.%${term}%,synonyms.ilike.%${term}%`).join(',');
            query = query.or(searchTerms);
          } else {
            query = query.or(`vocabulary.ilike.%${search}%,synonyms.ilike.%${search}%`);
          }
        }
      }
      if (familyFilter !== 'All') query = query.eq('family', familyFilter);
      if (difficultyFilter !== 'All') query = query.eq('difficulty', difficultyFilter);
      // 🆕 V11.42: Filter by favourite level
      if (favouriteLevel === 1) query = query.eq('favourite', 1);else if (favouriteLevel === 2) query = query.eq('favourite', 2);else if (favouriteLevel === 3) query = query.in('favourite', [1, 2]);
      const {
        data,
        error
      } = await query.order('created_at', {
        ascending: false
      });
      if (error) throw error;
      if (data && data.length > 0) {
        // Sort by mode
        let sortedData = [...data];
        if (exerciseMode === 'memory') {
          const difficultyOrder = {
            'Passive': 0,
            'Emerging': 1,
            'Active': 2
          };
          sortedData.sort((a, b) => {
            var _difficultyOrder$a$di6, _difficultyOrder$b$di6;
            const aOrder = (_difficultyOrder$a$di6 = difficultyOrder[a.difficulty]) !== null && _difficultyOrder$a$di6 !== void 0 ? _difficultyOrder$a$di6 : 3;
            const bOrder = (_difficultyOrder$b$di6 = difficultyOrder[b.difficulty]) !== null && _difficultyOrder$b$di6 !== void 0 ? _difficultyOrder$b$di6 : 3;
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
    const apiKey = geminiKey.trim();
    if (!apiKey) {
      alert('⚠️ Please set your Groq API Key in Settings first!');
      setShowTranslation(false);
      setShowSettings(true);
      return;
    }
    setTranslationLoading(true);
    try {
      var _data$choices3;
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
          messages: [{
            role: 'user',
            content: prompt
          }],
          temperature: 0.3,
          max_tokens: 200
        })
      });
      if (!response.ok) throw new Error('Translation failed');
      const data = await response.json();
      const translation = ((_data$choices3 = data.choices) === null || _data$choices3 === void 0 || (_data$choices3 = _data$choices3[0]) === null || _data$choices3 === void 0 || (_data$choices3 = _data$choices3.message) === null || _data$choices3 === void 0 || (_data$choices3 = _data$choices3.content) === null || _data$choices3 === void 0 ? void 0 : _data$choices3.trim()) || '';
      setTranslationSpanish(translation);
    } catch (error) {
      console.error('Translation error:', error);
      setTranslationSpanish('❌ Error generating translation');
    } finally {
      setTranslationLoading(false);
    }
  }

  // 🆕 V11.16: Validate answer with AI for Writing exercise
  async function validateWritingWithAI(userAnswer, correctAnswer, context) {
    const apiKey = geminiKey.trim();
    if (!apiKey) {
      alert('⚠️ Please set your Groq API Key in Settings first!\n\nAI validation requires an API key.');
      return null;
    }
    setWritingAIValidating(true);
    try {
      const prompt = `You are an English language expert. Analyze the user's answer and evaluate its quality.

CONTEXT: "${context}"
CORRECT ANSWER: "${correctAnswer}"
USER'S ANSWER: "${userAnswer}"

Evaluate the user's answer on:
1. Grammar correctness
2. Semantic fit in context
3. Lexical appropriateness
4. Spelling accuracy

Assign a difficulty score based on quality:
- **Easy**: Answer is excellent - correct grammar, perfect fit, appropriate word choice
- **Medium**: Answer is acceptable - minor issues but generally correct and understandable
- **Hard**: Answer is poor - significant errors in grammar, meaning, or word choice

Respond ONLY in this JSON format (no markdown, no backticks):
{
  "is_correct": true/false,
  "explanation": "Brief explanation of the evaluation",
  "score": "Easy/Medium/Hard"
}`;
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
            content: prompt
          }],
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
        let braceCount = 0,
          endIndex = -1;
        for (let i = firstBraceIndex; i < textResponse.length; i++) {
          if (textResponse[i] === '{') braceCount++;
          if (textResponse[i] === '}') braceCount--;
          if (braceCount === 0) {
            endIndex = i + 1;
            break;
          }
        }
        result = JSON.parse(textResponse.substring(firstBraceIndex, endIndex));
      }
      return result;
    } catch (error) {
      console.error('AI Validation Error:', error);
      alert('❌ AI validation failed. Please check your API key.');
      return null;
    } finally {
      setWritingAIValidating(false);
    }
  }

  // 🆕 V11.38: Validate translation with Cambridge grading (C1/C2/B2/B1)
  async function validateTranslationWithAI(userTranslation, originalEnglish, spanishSource) {
    const apiKey = geminiKey.trim();
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
        var _levelData$choices;
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
            messages: [{
              role: 'user',
              content: levelCheckPrompt
            }],
            temperature: 0.3,
            max_tokens: 10
          })
        });
        const levelData = await levelResponse.json();
        const levelText = ((_levelData$choices = levelData.choices) === null || _levelData$choices === void 0 || (_levelData$choices = _levelData$choices[0]) === null || _levelData$choices === void 0 || (_levelData$choices = _levelData$choices.message) === null || _levelData$choices === void 0 || (_levelData$choices = _levelData$choices.content) === null || _levelData$choices === void 0 ? void 0 : _levelData$choices.trim()) || 'C1';
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
          messages: [{
            role: 'user',
            content: prompt
          }],
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
        let braceCount = 0,
          endIndex = -1;
        for (let i = firstBraceIndex; i < textResponse.length; i++) {
          if (textResponse[i] === '{') braceCount++;
          if (textResponse[i] === '}') braceCount--;
          if (braceCount === 0) {
            endIndex = i + 1;
            break;
          }
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
    recognition.onresult = event => {
      const transcript = event.results[0][0].transcript;
      setTranslationInput(prev => prev ? prev + ' ' + transcript : transcript);
      setTranslationVoiceListening(false);
    };
    recognition.onerror = event => {
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
    setSearch('');
    setFamilyFilter('All');
    setEmptyFilter('None');
    setDifficultyFilter('All');
    setFavouriteLevel(0);
    setSearchMode(0);
    setTimeout(() => {
      var _searchInputRef$curre;
      return (_searchInputRef$curre = searchInputRef.current) === null || _searchInputRef$curre === void 0 ? void 0 : _searchInputRef$curre.focus();
    }, 50);
  };
  const getFormattedDate = () => new Date().toISOString().split('T')[0];
  const exportCSV = async () => {
    // 🆕 V11.2: Export only non-deleted items
    const {
      data
    } = await supabase.from('vocabulary_v4').select('*').is('deleted_at', null).order('created_at', {
      ascending: false
    });
    if (!data || data.length === 0) return;
    const headers = Object.keys(data[0]);
    const rows = data.map(w => headers.map(h => `"${(w[h] || '').toString().replace(/"/g, '""')}"`).join(";"));
    const csvContent = "\ufeff" + [headers.join(";"), ...rows].join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csvContent], {
      type: 'text/csv;charset=utf-8;'
    }));
    link.download = `Booster_Export_${getFormattedDate()}.csv`;
    link.click();
  };
  const handleImport = async e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async evt => {
      try {
        let parsedData;

        // Parse file
        if (file.name.endsWith('.json')) {
          parsedData = JSON.parse(evt.target.result);
          console.log('📄 JSON parsed, records:', parsedData.length);
        } else {
          const lines = evt.target.result.split("\n").filter(l => l.trim());
          const sep = lines[0].includes(';') ? ';' : ',';
          const headers = lines[0].replace(/^\ufeff/, "").split(sep).map(h => h.replace(/"/g, "").trim().toLowerCase());
          console.log('📄 CSV Headers detected:', headers);
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
          console.log('📝 First RAW record from file:', parsedData[0]);
          console.log('📝 All keys in first record:', Object.keys(parsedData[0]));
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
            writing_count: convertToInt(d.writing_count, 'writing_count'),
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
        console.log(`✅ Converted ${finalUpload.length} records`);
        if (finalUpload.length > 0) {
          console.log('📦 First CONVERTED record:', JSON.stringify(finalUpload[0], null, 2));
          console.log('📦 First record field types:');
          Object.keys(finalUpload[0]).forEach(key => {
            const val = finalUpload[0][key];
            console.log(`  ${key}: ${typeof val} = ${val === null ? 'null' : JSON.stringify(val)}`);
          });
        }
        const {
          error
        } = await supabase.from('vocabulary_v4').upsert(finalUpload);
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
  const handleMagicFill = async (word, targetFields = null, wordId = null) => {
    var _currentData;
    if (!word) return;
    const apiKey = geminiKey.trim();
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
    let currentFamily = ((_currentData = currentData) === null || _currentData === void 0 ? void 0 : _currentData.family) || '';
    if (!currentFamily && targetFields !== null && targetFields !== void 0 && targetFields.family) {
      // 🆕 V11.38: Read from modal dropdown - targetFields.family is a DOM select element
      currentFamily = targetFields.family.value || '';
      console.log('📝 Reading Family from modal dropdown:', currentFamily);
    }
    setMagicLoading(true);
    try {
      // 🆕 V11.38: Enhance prompt with current family if available
      let prompt = magicFillPrompt.replace(/{word}/g, word);
      if (currentFamily) {
        prompt = `CRITICAL INSTRUCTION: The word "${word}" is a ${currentFamily}.

${prompt}

MANDATORY RULES FOR "${word}" (${currentFamily}):
- If ${currentFamily} = "Noun": Synonyms MUST be nouns. Context MUST use "${word}" as a noun.
- If ${currentFamily} = "Verb": Synonyms MUST be verbs. Context MUST use "${word}" as a verb (conjugate if needed: ${word}, ${word}s, ${word}ed, ${word}ing).
- If ${currentFamily} = "Adjective": Synonyms MUST be adjectives. Context MUST use "${word}" as an adjective describing a noun.
- If ${currentFamily} = "Adverb": Synonyms MUST be adverbs. Context MUST use "${word}" as an adverb modifying a verb/adjective.
- If ${currentFamily} = "Phrasal Verb": Synonyms MUST be phrasal verbs. Context MUST use "${word}" as a phrasal verb.
- If ${currentFamily} = "Idiom": Synonyms MUST be idioms/expressions. Context MUST use "${word}" as an idiomatic expression.

RESPOND WITH family: "${currentFamily}" (DO NOT change this)`;
      }
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
            content: prompt
          }],
          temperature: 0.7,
          max_tokens: 500
        })
      });
      if (!response.ok) {
        var _errorData$error;
        const errorData = await response.json();
        console.error('Groq API Error:', errorData);
        throw new Error(((_errorData$error = errorData.error) === null || _errorData$error === void 0 ? void 0 : _errorData$error.message) || `API Error ${response.status}`);
      }
      const data = await response.json();
      if (!data.choices || !data.choices[0]) {
        throw new Error('No response from AI');
      }
      let textResponse = data.choices[0].message.content;
      console.log('🤖 Raw AI Response:', textResponse);
      textResponse = textResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      let result;
      try {
        result = JSON.parse(textResponse);
        console.log('✅ Direct parse successful');
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
          console.log('📦 Extracted first JSON:', firstJsonStr);
          result = JSON.parse(firstJsonStr);
          console.log('✅ Extraction successful');
        } catch (e2) {
          console.error('❌ All parsing failed:', e2);
          throw new Error(`AI returned invalid JSON. Please check your API key and try again.\n\nResponse: ${textResponse.substring(0, 100)}...`);
        }
      }
      console.log('✅ Final result:', result);

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
          const conjugations = [keyWord, keyWord + 's', keyWord + 'es', keyWord + 'ed', keyWord + 'd', keyWord + 'ing', keyWord.replace(/e$/, '') + 'ing', keyWord.replace(/y$/, 'ies'), keyWord.replace(/y$/, 'ied')];

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
        alert('✨ Fields auto-filled successfully!');
      } else if (wordId || currentData) {
        var _currentData2, _currentData3, _currentData4, _currentData5, _currentData6, _currentData7, _currentData8, _currentData9;
        // 🆕 V11.8: Respect existing data - only update empty fields
        const updateData = {
          synonyms: ((_currentData2 = currentData) === null || _currentData2 === void 0 ? void 0 : _currentData2.synonyms) || result.synonyms,
          context: ((_currentData3 = currentData) === null || _currentData3 === void 0 ? void 0 : _currentData3.context) || result.context,
          family: ((_currentData4 = currentData) === null || _currentData4 === void 0 ? void 0 : _currentData4.family) || result.family
        };
        const targetId = wordId || currentData.id;

        // 🆕 V11.22: Save previous version for change history
        const updateDataWithHistory = {
          ...updateData,
          previous_version: JSON.stringify({
            vocabulary: (_currentData5 = currentData) === null || _currentData5 === void 0 ? void 0 : _currentData5.vocabulary,
            synonyms: (_currentData6 = currentData) === null || _currentData6 === void 0 ? void 0 : _currentData6.synonyms,
            context: (_currentData7 = currentData) === null || _currentData7 === void 0 ? void 0 : _currentData7.context,
            family: (_currentData8 = currentData) === null || _currentData8 === void 0 ? void 0 : _currentData8.family,
            favourite: (_currentData9 = currentData) === null || _currentData9 === void 0 ? void 0 : _currentData9.favourite
          }),
          modified_at: new Date().toISOString()
        };
        await supabase.from('vocabulary_v4').update(updateDataWithHistory).eq('id', targetId);

        // 🆕 V11.20: Update all active contexts without refreshing
        const updatedWord = {
          ...(currentData || words.find(w => w.id === targetId)),
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
        if (showWriting) {
          const newWriting = [...writingWords];
          newWriting[writingIndex] = updatedWord;
          setWritingWords(newWriting);
        }

        // Update main table if not in exercise
        if (!showFlashcards && !showDictation && !showSelection && !showWriting) {
          setWords(prevWords => prevWords.map(w => w.id === targetId ? updatedWord : w));
        }
        alert('✨ Word auto-filled successfully!');
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
    const apiKey = geminiKey.trim();
    if (!apiKey || apiKey === '') {
      alert('⚠️ Please set your Groq API Key in Settings first!\n\nGet a FREE key at: https://console.groq.com');
      setShowSettings(true);
      return;
    }

    // 🆕 V11.38: Get current word data to check family BEFORE AI request
    const currentWord = words.find(w => w.id === wordId) || flashcardWords.find(w => w.id === wordId) || dictationWords.find(w => w.id === wordId) || selectionWords.find(w => w.id === wordId) || writingWords.find(w => w.id === wordId);
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
        'Idiom': 'If word is an idiom, give idiomatic expression synonyms with similar meaning'
      };
      const contextExamples = {
        'Noun': `Use "${word}" as a NOUN (thing/person/concept)`,
        'Verb': `Use "${word}" as a VERB (action word, can conjugate: ${word}, ${word}s, ${word}ed, ${word}ing)`,
        'Adjective': `Use "${word}" as an ADJECTIVE (describing a noun)`,
        'Adverb': `Use "${word}" as an ADVERB (modifying verb/adjective)`,
        'Phrasal Verb': `Use "${word}" as a PHRASAL VERB (verb + preposition)`,
        'Idiom': `Use "${word}" as an IDIOM (fixed expression)`
      };
      const prompt = `CRITICAL INSTRUCTION: The word "${word}" is a ${currentFamily}.

For the English word/expression "${word}", provide ALTERNATIVE/IMPROVED suggestions:

1. SYNONYMS: 2-4 DIFFERENT/BETTER British English synonyms (comma-separated)
   - MANDATORY: All synonyms MUST be ${currentFamily}s (same as "${word}")
   - Example: ${familyExamples[currentFamily] || 'Provide synonyms of the same type'}

2. CONTEXT: An ALTERNATIVE natural sentence (12-15 words) in British English
   ⛔️ CRITICAL: You MUST use "${word}" as a ${currentFamily} in your sentence
   ⛔️ DO NOT use synonyms instead of "${word}"
   ✅ REQUIRED: ${contextExamples[currentFamily] || `Use "${word}" correctly`}


3. FAMILY: RESPOND WITH "${currentFamily}" - DO NOT CHANGE THIS VALUE

FINAL MANDATORY RULES:
- Synonyms = ${currentFamily}s only (NOT other grammatical types)
- Context = use "${word}" as a ${currentFamily} (NOT as different grammatical function)
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
          messages: [{
            role: 'user',
            content: prompt
          }],
          temperature: 0.7,
          max_tokens: 500
        })
      });
      if (!response.ok) {
        var _errorData$error2;
        const errorData = await response.json();
        throw new Error(((_errorData$error2 = errorData.error) === null || _errorData$error2 === void 0 ? void 0 : _errorData$error2.message) || `API Error ${response.status}`);
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
        let braceCount = 0,
          endIndex = -1;
        for (let i = firstBraceIndex; i < textResponse.length; i++) {
          if (textResponse[i] === '{') braceCount++;
          if (textResponse[i] === '}') braceCount--;
          if (braceCount === 0) {
            endIndex = i + 1;
            break;
          }
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
          const conjugations = [keyWord, keyWord + 's', keyWord + 'es', keyWord + 'ed', keyWord + 'd', keyWord + 'ing', keyWord.replace(/e$/, '') + 'ing', keyWord.replace(/y$/, 'ies'), keyWord.replace(/y$/, 'ied')];

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
      const currentWord = words.find(w => w.id === wordId) || flashcardWords.find(w => w.id === wordId) || dictationWords.find(w => w.id === wordId) || selectionWords.find(w => w.id === wordId) || writingWords.find(w => w.id === wordId);
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
  const handleFindSimilar = async currentWord => {
    setFindingSimilar(currentWord.id);
    try {
      const {
        data: allWords
      } = await supabase.from('vocabulary_v4').select('*').neq('id', currentWord.id).is('deleted_at', null) // 🆕 V11.2: Exclude deleted
      .order('vocabulary');
      if (!allWords || allWords.length === 0) {
        alert('No other vocabulary found');
        return;
      }
      const similar = [];
      const searchWord = currentWord.vocabulary.toLowerCase().trim();
      const searchSynonyms = currentWord.synonyms ? currentWord.synonyms.split(',').map(s => s.toLowerCase().trim()).filter(s => s) : [];
      const levenshtein = (a, b) => {
        const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
        for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
        for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
        for (let j = 1; j <= b.length; j++) {
          for (let i = 1; i <= a.length; i++) {
            const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[j][i] = Math.min(matrix[j][i - 1] + 1, matrix[j - 1][i] + 1, matrix[j - 1][i - 1] + indicator);
          }
        }
        return matrix[b.length][a.length];
      };
      for (const word of allWords) {
        let isMatch = false;
        const compareWord = word.vocabulary.toLowerCase().trim();
        const distance = levenshtein(searchWord, compareWord);
        const maxLen = Math.max(searchWord.length, compareWord.length);
        const threshold = maxLen <= 4 ? 1 : Math.ceil(maxLen * 0.25);
        if (distance <= threshold) {
          isMatch = true;
        }
        if (!isMatch && word.synonyms) {
          const compareSynonyms = word.synonyms.split(',').map(s => s.toLowerCase().trim()).filter(s => s);
          for (const syn of compareSynonyms) {
            const synDistance = levenshtein(searchWord, syn);
            const synMaxLen = Math.max(searchWord.length, syn.length);
            const synThreshold = synMaxLen <= 4 ? 1 : Math.ceil(synMaxLen * 0.25);
            if (synDistance <= synThreshold) {
              isMatch = true;
              break;
            }
          }
        }
        if (!isMatch && searchSynonyms.length > 0) {
          for (const searchSyn of searchSynonyms) {
            const synDistance = levenshtein(searchSyn, compareWord);
            const synMaxLen = Math.max(searchSyn.length, compareWord.length);
            const synThreshold = synMaxLen <= 4 ? 1 : Math.ceil(synMaxLen * 0.25);
            if (synDistance <= synThreshold) {
              isMatch = true;
              break;
            }
          }
        }
        if (isMatch) {
          similar.push(word);
        }
      }
      if (similar.length === 0) {
        alert('✅ No similar words found!');
        return;
      }
      setMergeData({
        current: currentWord,
        similar: similar
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
      const {
        current
      } = mergeData;
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
      await supabase.from('vocabulary_v4').update({
        deleted_at: new Date().toISOString()
      }).eq('id', similarWord.id);
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
      const {
        timestamp,
        ...restoreData
      } = historyEntry;
      await supabase.from('vocabulary_v4').update(restoreData).eq('id', wordId);

      // Remove from history after restoring
      setUndoHistory(prev => {
        const newHistory = {
          ...prev
        };
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
      console.log('💾 Saving with history:', {
        id: editingWord.id,
        hasHistory: !!updateDataWithHistory.previous_version,
        modified_at: updateDataWithHistory.modified_at
      });
      await supabase.from('vocabulary_v4').update(updateDataWithHistory).eq('id', editingWord.id);

      // 🆕 V11.38: Properly preserve all fields when updating
      const updatedWord = {
        ...editingWord,
        // Keep all original fields (id, created_at, difficulty, etc.)
        ...wordData,
        // Override with new data from form
        // Ensure critical fields are never overridden:
        id: editingWord.id,
        created_at: editingWord.created_at,
        deleted_at: editingWord.deleted_at,
        difficulty: editingWord.difficulty,
        previous_version: updateDataWithHistory.previous_version,
        modified_at: updateDataWithHistory.modified_at
      };
      console.log('🔄 Updated word:', updatedWord);

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
      if (showWriting) {
        const newWriting = [...writingWords];
        newWriting[writingIndex] = updatedWord;
        setWritingWords(newWriting);
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
      if (!showFlashcards && !showDictation && !showSelection && !showWriting && !showTranslation) {
        // Only update if editing from main table
        setWords(prevWords => prevWords.map(w => w.id === editingWord.id ? updatedWord : w));
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
    onHint,
    // 🆕 V11.20
    exerciseMode,
    audioEnabled
  }) => /*#__PURE__*/_jsxs("div", {
    className: "flex flex-col gap-3 mb-4 sticky top-0 bg-black/95 backdrop-blur-md z-10 pb-4",
    children: [/*#__PURE__*/_jsxs("div", {
      className: "flex justify-between items-start",
      children: [/*#__PURE__*/_jsxs("div", {
        className: "text-white",
        children: [/*#__PURE__*/_jsx("h2", {
          className: "text-2xl sm:text-3xl font-black main-gradient",
          children: title
        }), /*#__PURE__*/_jsxs("p", {
          className: "text-slate-400 text-sm mt-1",
          children: [currentIndex + 1, " of ", totalCount]
        })]
      }), /*#__PURE__*/_jsx("button", {
        onClick: onClose,
        className: "text-slate-400 hover:text-white text-3xl flex-shrink-0",
        title: "Close",
        children: "\xD7"
      })]
    }), /*#__PURE__*/_jsxs("div", {
      className: "flex flex-wrap gap-2",
      children: [onModeToggle && /*#__PURE__*/_jsx("button", {
        onClick: onModeToggle,
        className: `px-3 py-2 rounded-xl font-bold text-xs transition-colors flex-shrink-0 ${exerciseMode === 'memory' ? 'bg-purple-600 text-white' : 'bg-slate-700 text-slate-300'}`,
        title: exerciseMode === 'memory' ? 'Memory Mode' : 'Random Mode',
        children: exerciseMode === 'memory' ? '🧠' : '🎲'
      }), onAudioToggle !== undefined && /*#__PURE__*/_jsx("button", {
        onClick: onAudioToggle,
        className: `px-3 py-2 rounded-xl font-bold text-xs transition-colors flex-shrink-0 ${audioEnabled ? 'bg-green-600 text-white' : 'bg-slate-700 text-slate-300'}`,
        title: audioEnabled ? 'Audio On' : 'Audio Off',
        children: audioEnabled ? '🔊' : '🔇'
      }), onHint && /*#__PURE__*/_jsx("button", {
        onClick: onHint,
        className: "px-3 py-2 rounded-xl font-bold text-xs bg-yellow-600 text-white hover:bg-yellow-500 flex-shrink-0",
        title: "Hint",
        children: "\uD83D\uDCA1"
      }), onDictionary && currentWord && /*#__PURE__*/_jsx("button", {
        onClick: () => onDictionary(currentWord),
        className: "px-3 py-2 rounded-xl font-bold text-xs bg-blue-600 text-white hover:bg-blue-500 flex-shrink-0",
        title: "Dictionary",
        children: "\uD83D\uDCD6"
      }), onInfo && /*#__PURE__*/_jsx("button", {
        onClick: onInfo,
        className: "px-3 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-white flex-shrink-0",
        title: "Info",
        children: "\u2139\uFE0F"
      }), onEdit && currentWord && /*#__PURE__*/_jsx("button", {
        onClick: onEdit,
        className: "px-3 py-2 rounded-xl font-bold text-xs bg-indigo-600 text-white hover:bg-indigo-500 flex-shrink-0",
        title: "Edit",
        children: "\u270F\uFE0F"
      })]
    })]
  });
  return /*#__PURE__*/_jsxs("div", {
    className: "h-screen flex flex-col",
    children: [/*#__PURE__*/_jsx("header", {
      className: "p-4 lg:p-6 bg-slate-900 border-b border-white/10 relative z-30",
      children: /*#__PURE__*/_jsxs("div", {
        className: "max-w-[1850px] mx-auto flex flex-col gap-4",
        children: [/*#__PURE__*/_jsx("div", {
          className: "flex flex-col sm:flex-row justify-between items-center gap-4",
          children: /*#__PURE__*/_jsxs("div", {
            className: "flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto",
            children: [/*#__PURE__*/_jsxs("h1", {
              className: "text-xl sm:text-2xl lg:text-3xl font-black italic main-gradient uppercase tracking-tighter text-center sm:text-left",
              children: ["English Booster ", /*#__PURE__*/_jsx("span", {
                className: "version-text",
                children: "v11.62"
              })]
            }), /*#__PURE__*/_jsxs("div", {
              className: "flex flex-wrap items-center justify-center sm:justify-start gap-2 lg:gap-3 bg-slate-800/50 p-2 px-3 lg:px-4 sm:ml-4 lg:ml-8 rounded-2xl border border-white/5 shadow-lg w-full sm:w-auto",
              children: [/*#__PURE__*/_jsx("span", {
                className: "text-base lg:text-lg font-black text-indigo-400 tracking-wider",
                children: totalCount
              }), /*#__PURE__*/_jsxs("div", {
                className: "border-l border-white/10 pl-2 lg:pl-3 ml-1 flex items-center gap-1.5 lg:gap-2",
                children: [/*#__PURE__*/_jsx("button", {
                  onClick: () => {
                    setEditingWord(null);
                    setShowAddModal(true);
                  },
                  className: "p-2 lg:p-2 rounded-lg border border-indigo-500/30 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 transition-colors",
                  title: "Add New Word",
                  children: /*#__PURE__*/_jsx("i", {
                    className: "fas fa-plus text-xl lg:text-base"
                  })
                }), /*#__PURE__*/_jsx("button", {
                  onClick: loadRecycleBin,
                  className: `p-2 lg:p-2 rounded-lg border transition-colors ${recycleBinCount > 0 ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'border-slate-700/30 text-slate-500 hover:text-red-400 hover:border-red-500/30'}`,
                  title: `Recycle Bin${recycleBinCount > 0 ? ` (${recycleBinCount})` : ''}`,
                  children: /*#__PURE__*/_jsx("i", {
                    className: "fas fa-trash-restore text-xl lg:text-base"
                  })
                }), /*#__PURE__*/_jsx("button", {
                  onClick: loadChangeHistory,
                  className: `p-2 lg:p-2 rounded-lg border transition-colors ${changeHistoryCount > 0 ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' : 'border-slate-700/30 text-slate-500 hover:text-blue-400 hover:border-blue-500/30'}`,
                  title: `Change History${changeHistoryCount > 0 ? ` (${changeHistoryCount})` : ''}`,
                  children: /*#__PURE__*/_jsx("i", {
                    className: "fas fa-history text-xl lg:text-base"
                  })
                })]
              }), /*#__PURE__*/_jsxs("div", {
                className: "border-l border-white/10 pl-2 lg:pl-3 ml-1 flex items-center gap-1.5 lg:gap-2",
                children: [/*#__PURE__*/_jsxs("button", {
                  onClick: () => setShowExercisesModal(true),
                  className: "p-2 lg:px-3 lg:py-2 rounded-lg bg-purple-600/20 border border-purple-500/30 text-purple-400 hover:bg-purple-600/30 transition-colors flex items-center gap-1.5",
                  title: "Practice Exercises",
                  children: [/*#__PURE__*/_jsx("i", {
                    className: "fas fa-dumbbell text-xl lg:text-sm"
                  }), /*#__PURE__*/_jsx("span", {
                    className: "hidden lg:inline text-sm font-bold",
                    children: "Exercises"
                  })]
                }), /*#__PURE__*/_jsxs("button", {
                  onClick: () => loadStats(),
                  className: "p-2 lg:px-3 lg:py-2 rounded-lg bg-blue-600/20 border border-blue-500/30 text-blue-400 hover:bg-blue-600/30 transition-colors flex items-center gap-1.5",
                  title: "Statistics",
                  children: [/*#__PURE__*/_jsx("i", {
                    className: "fas fa-chart-bar text-xl lg:text-sm"
                  }), /*#__PURE__*/_jsx("span", {
                    className: "hidden lg:inline text-sm font-bold",
                    children: "Stats"
                  })]
                }), /*#__PURE__*/_jsx("button", {
                  onClick: () => setShowSettings(true),
                  className: "p-2 lg:p-2 text-slate-400 hover:text-white transition-colors",
                  title: "Settings",
                  children: /*#__PURE__*/_jsx("i", {
                    className: "fas fa-cog text-xl lg:text-base"
                  })
                })]
              })]
            })]
          })
        }), /*#__PURE__*/_jsxs("div", {
          className: "flex flex-wrap items-center gap-2 lg:gap-3 justify-center lg:justify-start",
          children: [/*#__PURE__*/_jsx("button", {
            onClick: resetFilters,
            className: "p-2 lg:p-3 bg-slate-800 rounded-xl text-slate-400 hover:text-white flex-shrink-0",
            children: /*#__PURE__*/_jsx("i", {
              className: "fas fa-broom text-sm"
            })
          }), /*#__PURE__*/_jsx("input", {
            ref: searchInputRef,
            value: search,
            onChange: e => setSearch(e.target.value),
            placeholder: "Search...",
            className: "px-2 lg:px-4 py-2 lg:py-2.5 rounded-xl text-sm w-24 sm:w-40 lg:w-56 shadow-inner"
          }), /*#__PURE__*/_jsx("button", {
            onClick: () => setSearchMode((searchMode + 1) % 3),
            className: `p-2 lg:p-3 rounded-xl border transition-colors flex-shrink-0 ${searchMode === 0 ? 'border-slate-700 text-slate-500' : searchMode === 1 ? 'bg-blue-500/20 border-blue-500 text-blue-400' : 'bg-purple-500/20 border-purple-500 text-purple-400'} ${deepSearchLoading ? 'animate-pulse' : ''}`,
            title: searchMode === 0 ? 'Search: Vocabulary only' : searchMode === 1 ? 'Search: Vocabulary + Synonyms' : 'Search: AI Deep Search - AI generates 5-8 synonyms of your search term and searches all vocabulary and synonym fields for matches',
            children: /*#__PURE__*/_jsx("i", {
              className: `fas ${searchMode === 0 ? 'fa-search' : searchMode === 1 ? 'fa-search-plus' : 'fa-brain'} text-sm`
            })
          }), /*#__PURE__*/_jsx("button", {
            onClick: () => setFavouriteLevel((favouriteLevel + 1) % 4),
            className: `p-2 lg:p-3 rounded-xl border flex-shrink-0 ${favouriteLevel === 0 ? 'border-slate-700 text-slate-500' : favouriteLevel === 1 ? 'bg-yellow-500/20 border-yellow-500 text-yellow-500' : favouriteLevel === 2 ? 'bg-yellow-600/30 border-yellow-600 text-yellow-600' : 'bg-yellow-700/40 border-yellow-700 text-yellow-700'}`,
            title: favouriteLevel === 0 ? 'Show all' : favouriteLevel === 1 ? 'Show level 1 favourites' : favouriteLevel === 2 ? 'Show level 2 favourites' : 'Show both levels',
            children: /*#__PURE__*/_jsx("i", {
              className: `fas ${favouriteLevel === 0 ? 'fa-star' : favouriteLevel === 1 ? 'fa-star-half-alt' : favouriteLevel === 2 ? 'fa-star' : 'fa-star'} text-sm`
            })
          }), /*#__PURE__*/_jsxs("select", {
            value: emptyFilter,
            onChange: e => setEmptyFilter(e.target.value),
            className: "p-2 lg:p-2.5 rounded-xl text-xs font-bold uppercase bg-slate-800 text-red-400 flex-1 min-w-[85px] sm:flex-initial",
            children: [/*#__PURE__*/_jsx("option", {
              value: "None",
              children: "Records"
            }), /*#__PURE__*/_jsx("option", {
              value: "Synonyms",
              children: "No Synonyms"
            }), /*#__PURE__*/_jsx("option", {
              value: "Context",
              children: "No Context"
            }), /*#__PURE__*/_jsx("option", {
              value: "Family",
              children: "No Family"
            }), /*#__PURE__*/_jsx("option", {
              value: "Difficulty",
              children: "No Difficulty"
            })]
          }), /*#__PURE__*/_jsxs("select", {
            value: familyFilter,
            onChange: e => setFamilyFilter(e.target.value),
            className: "p-2 lg:p-2.5 rounded-xl text-xs font-bold uppercase flex-1 min-w-[80px] sm:flex-initial",
            children: [/*#__PURE__*/_jsx("option", {
              value: "All",
              children: "Family"
            }), FAMILIES.map(f => /*#__PURE__*/_jsx("option", {
              value: f,
              children: f
            }, f))]
          }), /*#__PURE__*/_jsxs("select", {
            value: difficultyFilter,
            onChange: e => setDifficultyFilter(e.target.value),
            className: "p-2 lg:p-2.5 rounded-xl text-xs font-bold uppercase flex-1 min-w-[100px] sm:flex-initial",
            children: [/*#__PURE__*/_jsx("option", {
              value: "All",
              children: "Difficulty"
            }), DIFFICULTIES.map(eff => /*#__PURE__*/_jsx("option", {
              value: eff,
              children: eff
            }, eff))]
          })]
        })]
      })
    }), /*#__PURE__*/_jsx("main", {
      className: "w-full mx-auto px-6 flex-1 overflow-hidden py-6",
      children: /*#__PURE__*/_jsxs("div", {
        onScroll: e => {
          if (e.target.scrollHeight - e.target.scrollTop <= e.target.clientHeight + 100 && hasMore && !loading) fetchWords(page);
        },
        className: "glass-card rounded-2xl h-full overflow-y-auto custom-scroll shadow-2xl",
        children: [/*#__PURE__*/_jsxs("table", {
          className: "desktop-table w-full text-left border-collapse",
          children: [/*#__PURE__*/_jsx("thead", {
            className: "sticky top-0 bg-slate-900/95 backdrop-blur-md text-[10px] uppercase font-black text-slate-500 tracking-widest border-b border-white/5 z-20",
            children: /*#__PURE__*/_jsxs("tr", {
              children: [/*#__PURE__*/_jsx("th", {
                className: "p-5 pl-8 w-16 text-center",
                children: "Fav"
              }), /*#__PURE__*/_jsx("th", {
                className: "p-5 w-32",
                children: "Difficulty"
              }), /*#__PURE__*/_jsx("th", {
                className: "p-5 w-64 text-indigo-400",
                children: "Vocabulary"
              }), /*#__PURE__*/_jsx("th", {
                className: "p-5 w-40",
                children: "Family"
              }), /*#__PURE__*/_jsx("th", {
                className: "p-5 w-64",
                children: "Synonyms"
              }), /*#__PURE__*/_jsx("th", {
                className: "p-5",
                children: "Context"
              }), /*#__PURE__*/_jsx("th", {
                className: "p-5 text-right pr-10 w-48 font-black",
                children: "Actions"
              })]
            })
          }), /*#__PURE__*/_jsx("tbody", {
            className: "divide-y divide-white/5",
            children: words.map(w => /*#__PURE__*/_jsxs("tr", {
              className: "hover:bg-indigo-500/[0.03] transition-colors",
              children: [/*#__PURE__*/_jsx("td", {
                className: "p-5 pl-8 text-center",
                children: /*#__PURE__*/_jsx("button", {
                  onClick: () => toggleFavourite(w.id, w.favourite || 0),
                  className: "tooltip",
                  "data-tip": "Toggle favourite",
                  children: /*#__PURE__*/_jsx("i", {
                    className: `fa-star ${w.favourite === 0 ? 'far star-off' : w.favourite === 1 ? 'fas fa-star-half-alt star-half' : 'fas star-on'} text-xl`
                  })
                })
              }), /*#__PURE__*/_jsx("td", {
                className: "p-5",
                children: /*#__PURE__*/_jsx("span", {
                  className: "text-[10px] font-black px-2 py-1 rounded border border-indigo-500/20 text-indigo-300 uppercase",
                  children: w.difficulty || '—'
                })
              }), /*#__PURE__*/_jsx("td", {
                className: "p-5 font-black text-slate-100 text-lg cursor-pointer hover:text-indigo-400 transition-colors",
                onClick: () => speakText(w.vocabulary, 1.0),
                title: "Click to hear pronunciation",
                children: w.vocabulary
              }), /*#__PURE__*/_jsx("td", {
                className: "p-5",
                children: /*#__PURE__*/_jsx("span", {
                  className: "text-[10px] font-black px-2 py-1 rounded border bg-slate-800 text-slate-400 uppercase",
                  children: w.family || '—'
                })
              }), /*#__PURE__*/_jsx("td", {
                className: "p-5 font-bold text-slate-100 text-sm italic",
                children: w.synonyms || '—'
              }), /*#__PURE__*/_jsx("td", {
                className: "p-5 text-sm text-slate-400 italic leading-relaxed cursor-pointer hover:text-slate-200 transition-colors",
                onClick: () => w.context && speakText(w.context, 1.0),
                title: "Click to hear pronunciation",
                children: w.context ? highlightWordInContext(w.context, w.vocabulary) : '—'
              }), /*#__PURE__*/_jsx("td", {
                className: "p-5 text-right pr-10",
                children: /*#__PURE__*/_jsxs("div", {
                  className: "flex justify-end gap-1",
                  children: [(() => {
                    const hasAllData = w.family && w.synonyms && w.context;
                    return /*#__PURE__*/_jsx("button", {
                      onClick: () => hasAllData ? handleImproveWord(w.vocabulary, w.id) : handleMagicFill(w.vocabulary, null, w.id),
                      disabled: magicLoading,
                      className: `${hasAllData ? 'improve-btn' : 'magic-btn'} p-1 rounded-lg tooltip`,
                      "data-tip": hasAllData ? "Improve with AI" : "Auto-fill with AI",
                      children: /*#__PURE__*/_jsx("span", {
                        className: `text-xl ${magicLoading ? 'animate-spin-slow inline-block' : ''}`,
                        children: "\u2728"
                      })
                    });
                  })(), /*#__PURE__*/_jsx("button", {
                    onClick: () => {
                      setSelectedWordForDict(w.vocabulary);
                      setShowDictionaryModal(true);
                    },
                    className: "text-blue-500 hover:text-blue-400 tooltip p-1",
                    "data-tip": "Open in Dictionary",
                    children: /*#__PURE__*/_jsx("i", {
                      className: "fas fa-book text-xl"
                    })
                  }), /*#__PURE__*/_jsx("button", {
                    onClick: () => handleFindSimilar(w),
                    disabled: findingSimilar === w.id,
                    className: "text-orange-500 hover:text-orange-400 tooltip p-1",
                    "data-tip": "Find & Merge Similar",
                    children: /*#__PURE__*/_jsx("span", {
                      className: "text-xl",
                      children: findingSimilar === w.id ? '⏳' : '🔀'
                    })
                  }), /*#__PURE__*/_jsx("button", {
                    onClick: () => {
                      setEditingWord(w);
                      setOriginalEditData({
                        ...w
                      });
                      setShowAddModal(true);
                    },
                    className: "text-slate-500 hover:text-white tooltip p-1",
                    "data-tip": "Edit word",
                    children: /*#__PURE__*/_jsx("i", {
                      className: "fas fa-edit text-xl"
                    })
                  }), /*#__PURE__*/_jsx("button", {
                    onClick: () => handleUndo(w.id),
                    disabled: !undoHistory[w.id],
                    className: `tooltip p-1 ${undoHistory[w.id] ? 'text-yellow-500 hover:text-yellow-400' : 'text-slate-700 cursor-not-allowed'}`,
                    "data-tip": undoHistory[w.id] ? "Undo last change" : "No changes to undo",
                    children: /*#__PURE__*/_jsx("i", {
                      className: "fas fa-undo text-lg"
                    })
                  }), /*#__PURE__*/_jsx("button", {
                    onClick: async () => {
                      if (confirm('Move to recycle bin?')) {
                        // 🆕 V11.2: Soft delete
                        await supabase.from('vocabulary_v4').update({
                          deleted_at: new Date().toISOString()
                        }).eq('id', w.id);
                        fetchWords(0, true);
                        checkRecycleBinCount(); // 🆕 V11.4
                      }
                    },
                    className: "text-slate-700 hover:text-red-500 tooltip p-1",
                    "data-tip": "Delete word",
                    children: /*#__PURE__*/_jsx("i", {
                      className: "fas fa-trash text-xl"
                    })
                  })]
                })
              })]
            }, w.id))
          }, `table-${words.length}-${search}-${familyFilter}-${emptyFilter}-${favouriteLevel}`)]
        }), /*#__PURE__*/_jsx("div", {
          className: "mobile-cards p-4",
          children: words.map(w => /*#__PURE__*/_jsxs("div", {
            className: "vocab-card",
            children: [/*#__PURE__*/_jsxs("div", {
              className: "flex justify-between items-start mb-4",
              children: [/*#__PURE__*/_jsxs("div", {
                className: "flex items-center gap-3",
                children: [/*#__PURE__*/_jsx("button", {
                  onClick: () => toggleFavourite(w.id, w.favourite || 0),
                  className: "text-2xl",
                  children: /*#__PURE__*/_jsx("i", {
                    className: `fa-star ${w.favourite === 0 ? 'far star-off' : w.favourite === 1 ? 'fas fa-star-half-alt star-half' : 'fas star-on'}`
                  })
                }), /*#__PURE__*/_jsx("span", {
                  className: "text-[10px] font-black px-3 py-1 rounded border border-indigo-500/20 text-indigo-300 uppercase",
                  children: w.difficulty || '—'
                })]
              }), /*#__PURE__*/_jsx("span", {
                className: "text-[10px] font-black px-3 py-1 rounded border bg-slate-800 text-slate-400 uppercase",
                children: w.family || '—'
              })]
            }), /*#__PURE__*/_jsx("div", {
              className: "text-2xl font-black text-white mb-4 cursor-pointer hover:text-indigo-400 transition-colors",
              onClick: () => speakText(w.vocabulary, 1.0),
              title: "Click to hear pronunciation",
              children: w.vocabulary
            }), w.synonyms && /*#__PURE__*/_jsxs("div", {
              className: "mb-4",
              children: [/*#__PURE__*/_jsx("div", {
                className: "text-[10px] uppercase font-black text-slate-500 mb-1",
                children: "Synonyms"
              }), /*#__PURE__*/_jsx("div", {
                className: "text-sm font-bold text-slate-100 italic",
                children: w.synonyms
              })]
            }), w.context && /*#__PURE__*/_jsxs("div", {
              className: "mb-4",
              children: [/*#__PURE__*/_jsx("div", {
                className: "text-[10px] uppercase font-black text-slate-500 mb-1",
                children: "Context"
              }), /*#__PURE__*/_jsx("div", {
                className: "text-sm text-slate-400 italic leading-relaxed cursor-pointer hover:text-slate-200 transition-colors",
                onClick: () => speakText(w.context, 1.0),
                title: "Click to hear pronunciation",
                children: highlightWordInContext(w.context, w.vocabulary)
              })]
            }), /*#__PURE__*/_jsxs("div", {
              className: "flex justify-between items-center gap-1 pt-2 border-t border-white/5",
              children: [(() => {
                const hasAllData = w.family && w.synonyms && w.context;
                return /*#__PURE__*/_jsx("button", {
                  onClick: () => hasAllData ? handleImproveWord(w.vocabulary, w.id) : handleMagicFill(w.vocabulary, null, w.id),
                  disabled: magicLoading,
                  className: `${hasAllData ? 'improve-btn' : 'magic-btn'} p-2 rounded-xl flex-1 text-xl`,
                  children: "\u2728"
                });
              })(), /*#__PURE__*/_jsx("button", {
                onClick: () => {
                  setSelectedWordForDict(w.vocabulary);
                  setShowDictionaryModal(true);
                },
                className: "p-2 text-blue-500 bg-blue-500/10 rounded-xl flex-1 text-xl",
                children: "\uD83D\uDCD6"
              }), /*#__PURE__*/_jsx("button", {
                onClick: () => handleFindSimilar(w),
                disabled: findingSimilar === w.id,
                className: "p-2 text-orange-500 bg-orange-500/10 rounded-xl flex-1 text-xl",
                children: findingSimilar === w.id ? '⏳' : '🔀'
              }), /*#__PURE__*/_jsx("button", {
                onClick: () => {
                  setEditingWord(w);
                  setOriginalEditData({
                    ...w
                  });
                  setShowAddModal(true);
                },
                className: "p-2 text-slate-400 bg-slate-800 rounded-xl flex-1 text-xl",
                children: "\u270F\uFE0F"
              }), /*#__PURE__*/_jsx("button", {
                onClick: () => handleUndo(w.id),
                disabled: !undoHistory[w.id],
                className: `p-2 rounded-xl flex-1 text-xl ${undoHistory[w.id] ? 'text-yellow-500 bg-yellow-500/10' : 'text-slate-700 bg-slate-800 cursor-not-allowed'}`,
                children: "\u21A9\uFE0F"
              }), /*#__PURE__*/_jsx("button", {
                onClick: async () => {
                  if (confirm('Move to recycle bin?')) {
                    await supabase.from('vocabulary_v4').update({
                      deleted_at: new Date().toISOString()
                    }).eq('id', w.id);
                    fetchWords(0, true);
                    checkRecycleBinCount(); // 🆕 V11.4
                  }
                },
                className: "p-2 text-red-500 bg-red-500/10 rounded-xl flex-1 text-xl",
                children: "\uD83D\uDDD1\uFE0F"
              })]
            })]
          }, w.id))
        })]
      })
    }), showSettings && /*#__PURE__*/_jsx("div", {
      className: "fixed inset-0 bg-black/95 z-[100] flex items-center justify-center p-4 backdrop-blur-md",
      children: /*#__PURE__*/_jsxs("div", {
        className: "glass-card p-10 rounded-[2.5rem] w-full max-w-2xl border-indigo-500/30 max-h-[90vh] overflow-y-auto custom-scroll",
        children: [/*#__PURE__*/_jsx("h2", {
          className: "text-2xl font-black mb-8 main-gradient uppercase text-center italic",
          children: "Booster Control"
        }), /*#__PURE__*/_jsxs("div", {
          className: "space-y-6",
          children: [/*#__PURE__*/_jsxs("div", {
            children: [/*#__PURE__*/_jsx("label", {
              className: "text-[10px] uppercase font-black text-slate-500 mb-2 block tracking-widest",
              children: "Supabase URL"
            }), /*#__PURE__*/_jsx("input", {
              type: "text",
              value: supabaseUrl,
              onChange: e => {
                const trimmedUrl = e.target.value.trim();
                setSupabaseUrl(trimmedUrl);
                localStorage.setItem('supabase_url', trimmedUrl);
              },
              placeholder: "https://your-project.supabase.co",
              className: "w-full p-4 rounded-xl text-sm font-mono"
            }), /*#__PURE__*/_jsx("p", {
              className: "text-xs text-slate-500 mt-2",
              children: "Your Supabase project URL"
            }), supabaseUrl && /*#__PURE__*/_jsxs("div", {
              className: "mt-2 p-2 bg-green-900/20 border border-green-500/30 rounded text-xs text-green-400",
              children: ["\u2713 URL configured (", supabaseUrl.length, " chars)"]
            })]
          }), /*#__PURE__*/_jsxs("div", {
            children: [/*#__PURE__*/_jsx("label", {
              className: "text-[10px] uppercase font-black text-slate-500 mb-2 block tracking-widest",
              children: "Supabase Anon Key"
            }), /*#__PURE__*/_jsx("input", {
              type: "password",
              value: supabaseKey,
              onChange: e => {
                const trimmedKey = e.target.value.trim();
                setSupabaseKey(trimmedKey);
                localStorage.setItem('supabase_key', trimmedKey);
              },
              placeholder: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
              className: "w-full p-4 rounded-xl text-sm font-mono"
            }), /*#__PURE__*/_jsx("p", {
              className: "text-xs text-slate-500 mt-2",
              children: "Your Supabase anon/public key (safe to share)"
            }), supabaseKey && /*#__PURE__*/_jsxs("div", {
              className: "mt-2 p-2 bg-green-900/20 border border-green-500/30 rounded text-xs text-green-400",
              children: ["\u2713 Key configured (", supabaseKey.length, " chars)"]
            })]
          }), /*#__PURE__*/_jsxs("div", {
            children: [/*#__PURE__*/_jsx("label", {
              className: "text-[10px] uppercase font-black text-slate-500 mb-2 block tracking-widest",
              children: "Groq AI API Key"
            }), /*#__PURE__*/_jsx("input", {
              type: "password",
              value: geminiKey,
              onChange: e => {
                const trimmedKey = e.target.value.trim();
                setGeminiKey(trimmedKey);
                localStorage.setItem('groq_api_key', trimmedKey);
              },
              onBlur: e => {
                const trimmedKey = e.target.value.trim();
                setGeminiKey(trimmedKey);
                localStorage.setItem('groq_api_key', trimmedKey);
              },
              placeholder: "gsk_...",
              className: "w-full p-4 rounded-xl text-sm font-mono"
            }), /*#__PURE__*/_jsxs("p", {
              className: "text-xs text-slate-500 mt-2",
              children: ["Get your free key at: ", /*#__PURE__*/_jsx("a", {
                href: "https://console.groq.com",
                target: "_blank",
                className: "text-indigo-400 underline",
                children: "Groq Console"
              })]
            }), geminiKey && /*#__PURE__*/_jsxs("div", {
              className: "mt-2 p-2 bg-green-900/20 border border-green-500/30 rounded text-xs text-green-400",
              children: ["\u2713 Key configured (", geminiKey.length, " chars)"]
            })]
          }), /*#__PURE__*/_jsxs("div", {
            children: [/*#__PURE__*/_jsxs("label", {
              className: "text-[10px] uppercase font-black text-slate-500 mb-2 block tracking-widest",
              children: ["Magic Fill Prompt (use ", '{word}', " placeholder)"]
            }), /*#__PURE__*/_jsx("textarea", {
              value: magicFillPrompt,
              onChange: e => {
                setMagicFillPrompt(e.target.value);
                localStorage.setItem('magic_fill_prompt', e.target.value);
              },
              rows: "6",
              className: "w-full p-4 rounded-xl text-xs font-mono",
              placeholder: "Enter your custom prompt for Magic Fill..."
            }), /*#__PURE__*/_jsxs("p", {
              className: "text-xs text-slate-500 mt-2",
              children: ["Customize how AI generates vocabulary data. Use ", '{word}', " to insert the word being processed."]
            })]
          }), /*#__PURE__*/_jsxs("div", {
            children: [/*#__PURE__*/_jsxs("label", {
              className: "text-[10px] uppercase font-black text-slate-500 mb-2 block tracking-widest",
              children: ["Web Search Prompt (use ", '{word}', " placeholder)"]
            }), /*#__PURE__*/_jsx("textarea", {
              value: aiSearchPrompt,
              onChange: e => {
                setAiSearchPrompt(e.target.value);
                localStorage.setItem('ai_search_prompt', e.target.value);
              },
              rows: "5",
              className: "w-full p-4 rounded-xl text-xs font-mono",
              placeholder: "For the English word/expression {word}, provide meaning, synonyms, context..."
            }), /*#__PURE__*/_jsxs("p", {
              className: "text-xs text-slate-500 mt-2",
              children: ["This prompt is used when opening Perplexity AI from the dictionary modal \uD83D\uDCD6. Use ", '{word}', " as placeholder."]
            })]
          }), /*#__PURE__*/_jsxs("div", {
            children: [/*#__PURE__*/_jsx("label", {
              className: "text-[10px] uppercase font-black text-slate-500 mb-2 block tracking-widest",
              children: "Text-to-Speech Voice"
            }), /*#__PURE__*/_jsxs("select", {
              value: preferredVoice,
              onChange: e => {
                setPreferredVoice(e.target.value);
                localStorage.setItem('preferred_voice', e.target.value);
              },
              className: "w-full p-4 rounded-xl text-sm font-bold",
              children: [/*#__PURE__*/_jsx("option", {
                value: "auto",
                children: "\uD83E\uDD16 Auto (Best Available)"
              }), availableVoices.map(voice => /*#__PURE__*/_jsxs("option", {
                value: voice.name,
                children: [voice.name, " (", voice.lang, ")"]
              }, voice.name))]
            }), /*#__PURE__*/_jsx("p", {
              className: "text-xs text-slate-500 mt-2",
              children: "Select the voice used for audio playback in exercises and context sentences."
            })]
          }), /*#__PURE__*/_jsxs("div", {
            children: [/*#__PURE__*/_jsx("label", {
              className: "text-[10px] uppercase font-black text-slate-500 mb-2 block tracking-widest",
              children: "Selection Exercise - Countdown (seconds)"
            }), /*#__PURE__*/_jsx("input", {
              type: "number",
              min: "0",
              max: "30",
              value: selectionCountdown,
              onChange: e => {
                const value = parseInt(e.target.value) || 0;
                setSelectionCountdown(value);
                localStorage.setItem('selection_countdown', value.toString());
              },
              className: "w-full p-4 rounded-xl text-sm font-bold"
            }), /*#__PURE__*/_jsx("p", {
              className: "text-xs text-slate-500 mt-2",
              children: "How many seconds to blur options before showing them (0 = no blur, default: 5)"
            })]
          }), /*#__PURE__*/_jsxs("div", {
            className: "grid grid-cols-2 gap-4",
            children: [/*#__PURE__*/_jsx("button", {
              onClick: async () => {
                const {
                  data
                } = await supabase.from('vocabulary_v4').select('*').is('deleted_at', null);
                const link = document.createElement("a");
                link.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {
                  type: 'application/json'
                }));
                link.download = `Booster_Backup_${getFormattedDate()}.json`;
                link.click();
              },
              "data-tip": "SAFE BACKUP: Reliable JSON format with all database metadata.",
              className: "tooltip bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest",
              children: "JSON Backup"
            }), /*#__PURE__*/_jsx("button", {
              onClick: exportCSV,
              "data-tip": "EXCEL EDIT: Best for reading/editing. Remember to save as CSV.",
              className: "tooltip bg-blue-600/20 text-blue-400 border border-blue-500/30 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest",
              children: "Excel Export"
            }), /*#__PURE__*/_jsxs("label", {
              "data-tip": "RESTORE: Drag your file here to sync updates and new words.",
              className: "tooltip col-span-2 bg-slate-800 text-slate-300 border border-white/10 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest text-center cursor-pointer",
              children: [/*#__PURE__*/_jsx("i", {
                className: "fas fa-upload mr-2"
              }), " Import/Restore", /*#__PURE__*/_jsx("input", {
                type: "file",
                accept: ".json,.csv",
                onChange: handleImport,
                className: "hidden"
              })]
            })]
          }), /*#__PURE__*/_jsx("button", {
            onClick: () => setShowSettings(false),
            className: "w-full bg-indigo-600 py-4 rounded-2xl font-black uppercase shadow-xl",
            children: "Close"
          })]
        })]
      })
    }), showExercisesModal && /*#__PURE__*/_jsx("div", {
      className: "fixed inset-0 bg-black/95 z-[100] flex items-center justify-center p-4 backdrop-blur-md",
      children: /*#__PURE__*/_jsxs("div", {
        className: "glass-card p-10 rounded-[2.5rem] w-full max-w-3xl max-h-[90vh] overflow-y-auto",
        children: [/*#__PURE__*/_jsxs("div", {
          className: "flex justify-between items-center mb-8",
          children: [/*#__PURE__*/_jsx("h2", {
            className: "text-2xl font-black main-gradient uppercase text-center italic",
            children: "\uD83C\uDFCB\uFE0F Choose Exercise"
          }), /*#__PURE__*/_jsx("button", {
            onClick: () => setShowExercisesModal(false),
            className: "text-slate-400 hover:text-white text-3xl",
            children: "\xD7"
          })]
        }), /*#__PURE__*/_jsxs("div", {
          className: "grid grid-cols-1 md:grid-cols-2 gap-4",
          children: [/*#__PURE__*/_jsxs("button", {
            onClick: () => {
              setShowExercisesModal(false);
              loadFlashcards();
            },
            className: "group relative overflow-hidden bg-purple-600 hover:bg-purple-500 p-6 rounded-2xl text-left transition-all hover:scale-105 hover:shadow-2xl",
            children: [/*#__PURE__*/_jsxs("div", {
              className: "flex items-center gap-4 mb-3",
              children: [/*#__PURE__*/_jsx("span", {
                className: "text-4xl",
                children: "\uD83C\uDFB4"
              }), /*#__PURE__*/_jsx("h3", {
                className: "text-xl font-black text-white uppercase",
                children: "Flashcards"
              })]
            }), /*#__PURE__*/_jsx("p", {
              className: "text-sm text-white/80",
              children: "Flip cards to test your vocabulary memory. Rate your knowledge level."
            })]
          }), /*#__PURE__*/_jsxs("button", {
            onClick: () => {
              setShowExercisesModal(false);
              loadDictation();
            },
            className: "group relative overflow-hidden bg-blue-600 hover:bg-blue-500 p-6 rounded-2xl text-left transition-all hover:scale-105 hover:shadow-2xl",
            children: [/*#__PURE__*/_jsxs("div", {
              className: "flex items-center gap-4 mb-3",
              children: [/*#__PURE__*/_jsx("span", {
                className: "text-4xl",
                children: "\uD83C\uDFA4"
              }), /*#__PURE__*/_jsx("h3", {
                className: "text-xl font-black text-white uppercase",
                children: "Dictation"
              })]
            }), /*#__PURE__*/_jsx("p", {
              className: "text-sm text-white/80",
              children: "Listen and type what you hear. Improve listening and spelling skills."
            })]
          }), /*#__PURE__*/_jsxs("button", {
            onClick: () => {
              setShowExercisesModal(false);
              loadSelection();
            },
            className: "group relative overflow-hidden bg-green-600 hover:bg-green-500 p-6 rounded-2xl text-left transition-all hover:scale-105 hover:shadow-2xl",
            children: [/*#__PURE__*/_jsxs("div", {
              className: "flex items-center gap-4 mb-3",
              children: [/*#__PURE__*/_jsx("span", {
                className: "text-4xl",
                children: "\u2713"
              }), /*#__PURE__*/_jsx("h3", {
                className: "text-xl font-black text-white uppercase",
                children: "Selection"
              })]
            }), /*#__PURE__*/_jsx("p", {
              className: "text-sm text-white/80",
              children: "Choose the correct word from multiple options to complete sentences."
            })]
          }), /*#__PURE__*/_jsxs("button", {
            onClick: () => {
              setShowExercisesModal(false);
              loadWriting();
            },
            className: "group relative overflow-hidden bg-orange-600 hover:bg-orange-500 p-6 rounded-2xl text-left transition-all hover:scale-105 hover:shadow-2xl",
            children: [/*#__PURE__*/_jsxs("div", {
              className: "flex items-center gap-4 mb-3",
              children: [/*#__PURE__*/_jsx("span", {
                className: "text-4xl",
                children: "\u270D\uFE0F"
              }), /*#__PURE__*/_jsx("h3", {
                className: "text-xl font-black text-white uppercase",
                children: "Writing"
              })]
            }), /*#__PURE__*/_jsx("p", {
              className: "text-sm text-white/80",
              children: "Write sentences using vocabulary words. AI evaluates your writing."
            })]
          }), /*#__PURE__*/_jsxs("button", {
            onClick: () => {
              setShowExercisesModal(false);
              loadTranslation();
            },
            className: "group relative overflow-hidden bg-pink-600 hover:bg-pink-500 p-6 rounded-2xl text-left transition-all hover:scale-105 hover:shadow-2xl md:col-span-2",
            children: [/*#__PURE__*/_jsxs("div", {
              className: "flex items-center gap-4 mb-3",
              children: [/*#__PURE__*/_jsx("span", {
                className: "text-4xl",
                children: "\uD83C\uDF10"
              }), /*#__PURE__*/_jsx("h3", {
                className: "text-xl font-black text-white uppercase",
                children: "Translation"
              })]
            }), /*#__PURE__*/_jsx("p", {
              className: "text-sm text-white/80",
              children: "Translate Spanish sentences to English. Practice language conversion skills."
            })]
          })]
        })]
      })
    }), showAddModal && /*#__PURE__*/_jsx("div", {
      className: "fixed inset-0 bg-black/95 z-[200] flex items-center justify-center p-4 backdrop-blur-md",
      children: /*#__PURE__*/_jsxs("div", {
        className: "glass-card p-10 rounded-[2.5rem] w-full max-w-2xl",
        children: [/*#__PURE__*/_jsxs("div", {
          className: "flex justify-between items-center mb-8",
          children: [/*#__PURE__*/_jsx("h2", {
            className: "text-2xl font-black italic main-gradient uppercase tracking-widest",
            children: editingWord ? 'Edit Word' : 'New Word'
          }), /*#__PURE__*/_jsxs("div", {
            className: "flex items-center gap-2",
            children: [/*#__PURE__*/_jsx("button", {
              type: "button",
              onClick: () => {
                var _document$getElementB;
                const vocabValue = ((_document$getElementB = document.getElementById('modalVocabInput')) === null || _document$getElementB === void 0 ? void 0 : _document$getElementB.value) || (editingWord === null || editingWord === void 0 ? void 0 : editingWord.vocabulary) || '';
                if (vocabValue) {
                  setSelectedWordForDict(vocabValue);
                  setShowDictionaryModal(true);
                } else {
                  alert('Please enter a word first!');
                }
              },
              className: "tooltip bg-blue-600/20 text-blue-400 border border-blue-500/30 px-3 py-2 rounded-xl font-bold text-xs hover:bg-blue-600/30",
              "data-tip": "Open in dictionary",
              children: "\uD83D\uDCD6"
            }), editingWord && originalEditData && /*#__PURE__*/_jsx("button", {
              type: "button",
              onClick: () => {
                if (confirm('Restore original data before editing?')) {
                  document.querySelector('[name="vocabulary"]').value = originalEditData.vocabulary;
                  document.querySelector('[name="synonyms"]').value = originalEditData.synonyms || '';
                  document.querySelector('[name="context"]').value = originalEditData.context || '';
                  document.querySelector('[name="family"]').value = originalEditData.family || '';
                  alert('✅ Original data restored!');
                }
              },
              className: "tooltip bg-yellow-600/20 text-yellow-400 border border-yellow-500/30 px-3 py-2 rounded-xl font-bold text-xs hover:bg-yellow-600/30",
              "data-tip": "Restore data as it was before editing",
              children: /*#__PURE__*/_jsx("i", {
                className: "fas fa-history"
              })
            }), editingWord && /*#__PURE__*/_jsx("button", {
              type: "button",
              onClick: async () => {
                if (confirm('🗑️ Move to recycle bin?')) {
                  await supabase.from('vocabulary_v4').update({
                    deleted_at: new Date().toISOString()
                  }).eq('id', editingWord.id);
                  setShowAddModal(false);
                  setEditingWord(null);
                  fetchWords(0, true);
                  checkRecycleBinCount();
                }
              },
              className: "tooltip bg-red-600/20 text-red-400 border border-red-500/30 px-3 py-2 rounded-xl font-bold text-xs hover:bg-red-600/30",
              "data-tip": "Delete word (move to recycle bin)",
              children: /*#__PURE__*/_jsx("i", {
                className: "fas fa-trash"
              })
            }), editingWord && /*#__PURE__*/_jsxs("span", {
              className: "text-slate-500 text-xs font-mono",
              children: ["ID: ", editingWord.id]
            })]
          })]
        }), /*#__PURE__*/_jsxs("form", {
          onSubmit: handleSave,
          className: "grid grid-cols-2 gap-6",
          children: [/*#__PURE__*/_jsxs("div", {
            className: "col-span-2 lg:col-span-1 flex flex-col gap-1",
            children: [/*#__PURE__*/_jsx("label", {
              className: "text-[10px] uppercase font-bold text-slate-500 ml-1",
              children: "Vocabulary"
            }), /*#__PURE__*/_jsxs("div", {
              className: "relative",
              children: [/*#__PURE__*/_jsx("input", {
                name: "vocabulary",
                id: "modalVocabInput",
                required: true,
                defaultValue: editingWord === null || editingWord === void 0 ? void 0 : editingWord.vocabulary,
                className: "p-4 rounded-xl w-full pr-12"
              }), /*#__PURE__*/_jsx("button", {
                type: "button",
                onClick: async () => {
                  const vocabValue = document.getElementById('modalVocabInput').value;
                  if (!vocabValue) {
                    alert('Please enter a word first!');
                    return;
                  }
                  const hasSynonyms = (editingWord === null || editingWord === void 0 ? void 0 : editingWord.synonyms) && editingWord.synonyms.trim();
                  const hasContext = (editingWord === null || editingWord === void 0 ? void 0 : editingWord.context) && editingWord.context.trim();
                  const hasFamily = (editingWord === null || editingWord === void 0 ? void 0 : editingWord.family) && editingWord.family.trim();
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
                },
                disabled: magicLoading,
                className: `absolute right-2 top-2 p-2 rounded-lg tooltip ${editingWord !== null && editingWord !== void 0 && editingWord.synonyms && editingWord !== null && editingWord !== void 0 && editingWord.context && editingWord !== null && editingWord !== void 0 && editingWord.family ? 'improve-btn' : 'magic-btn'}`,
                "data-tip": editingWord !== null && editingWord !== void 0 && editingWord.synonyms && editingWord !== null && editingWord !== void 0 && editingWord.context && editingWord !== null && editingWord !== void 0 && editingWord.family ? "Improve with AI" : "Auto-fill with AI",
                children: /*#__PURE__*/_jsx("span", {
                  className: `text-xl ${magicLoading ? 'animate-spin-slow inline-block' : ''}`,
                  children: "\u2728"
                })
              })]
            })]
          }), /*#__PURE__*/_jsxs("div", {
            className: "flex flex-col gap-1",
            children: [/*#__PURE__*/_jsx("label", {
              className: "text-[10px] uppercase font-bold text-slate-500 ml-1",
              children: "Favourite Level"
            }), /*#__PURE__*/_jsxs("div", {
              className: "flex items-center gap-3 bg-slate-800/50 p-4 rounded-xl",
              children: [/*#__PURE__*/_jsx("input", {
                type: "hidden",
                name: "favourite",
                id: "favouriteInput",
                defaultValue: (editingWord === null || editingWord === void 0 ? void 0 : editingWord.favourite) || 0
              }), /*#__PURE__*/_jsx("button", {
                type: "button",
                onClick: e => {
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
                },
                className: "cursor-pointer",
                children: /*#__PURE__*/_jsx("i", {
                  className: `${((editingWord === null || editingWord === void 0 ? void 0 : editingWord.favourite) || 0) === 0 ? 'far fa-star star-off' : ((editingWord === null || editingWord === void 0 ? void 0 : editingWord.favourite) || 0) === 1 ? 'fas fa-star-half-alt star-half' : 'fas fa-star star-on'} text-2xl transition-colors`
                })
              }), /*#__PURE__*/_jsx("span", {
                className: "text-slate-400 text-sm",
                children: ((editingWord === null || editingWord === void 0 ? void 0 : editingWord.favourite) || 0) === 0 ? 'Not favourite' : ((editingWord === null || editingWord === void 0 ? void 0 : editingWord.favourite) || 0) === 1 ? 'Favourite level 1' : 'Favourite level 2'
              })]
            })]
          }), /*#__PURE__*/_jsxs("div", {
            className: "flex flex-col gap-1",
            children: [/*#__PURE__*/_jsx("label", {
              className: "text-[10px] uppercase font-bold text-slate-500 ml-1",
              children: "Family"
            }), /*#__PURE__*/_jsxs("select", {
              name: "family",
              defaultValue: editingWord === null || editingWord === void 0 ? void 0 : editingWord.family,
              className: "p-4 rounded-xl font-bold",
              children: [/*#__PURE__*/_jsx("option", {
                value: "",
                children: "Family..."
              }), FAMILIES.map(f => /*#__PURE__*/_jsx("option", {
                value: f,
                children: f
              }, f))]
            })]
          }), /*#__PURE__*/_jsxs("div", {
            className: "col-span-2 flex flex-col gap-1",
            children: [/*#__PURE__*/_jsx("label", {
              className: "text-[10px] uppercase font-bold text-slate-500 ml-1",
              children: "Synonyms"
            }), /*#__PURE__*/_jsx("input", {
              name: "synonyms",
              defaultValue: editingWord === null || editingWord === void 0 ? void 0 : editingWord.synonyms,
              className: "p-4 rounded-xl"
            })]
          }), /*#__PURE__*/_jsxs("div", {
            className: "col-span-2 flex flex-col gap-1",
            children: [/*#__PURE__*/_jsx("label", {
              className: "text-[10px] uppercase font-bold text-slate-500 ml-1",
              children: "Context"
            }), /*#__PURE__*/_jsx("textarea", {
              name: "context",
              defaultValue: editingWord === null || editingWord === void 0 ? void 0 : editingWord.context,
              className: "p-4 rounded-xl h-20 resize-none shadow-inner"
            })]
          }), /*#__PURE__*/_jsxs("div", {
            className: "col-span-2 flex gap-4 mt-4",
            children: [/*#__PURE__*/_jsx("button", {
              type: "button",
              onClick: () => {
                setEditingWord(null);
                setShowAddModal(false);
              },
              className: "flex-1 font-black text-slate-500 uppercase text-[10px]",
              children: "Discard"
            }), /*#__PURE__*/_jsx("button", {
              type: "submit",
              className: "flex-[2] bg-indigo-600 py-4 rounded-2xl font-black uppercase text-sm shadow-lg shadow-indigo-500/20",
              children: "Commit Changes"
            })]
          })]
        })]
      })
    }), showImproveModal && improveData && /*#__PURE__*/_jsx("div", {
      className: "fixed inset-0 bg-black/80 flex items-center justify-center z-[150] p-2 sm:p-6 overflow-y-auto",
      onClick: () => setShowImproveModal(false),
      children: /*#__PURE__*/_jsxs("div", {
        className: "bg-slate-900 rounded-2xl sm:rounded-3xl p-4 sm:p-8 max-w-6xl w-full max-h-[95vh] overflow-y-auto shadow-2xl border border-white/10 my-2",
        onClick: e => e.stopPropagation(),
        children: [/*#__PURE__*/_jsxs("div", {
          className: "flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 sm:mb-6",
          children: [/*#__PURE__*/_jsxs("div", {
            className: "flex items-center gap-2 sm:gap-3",
            children: [/*#__PURE__*/_jsx("h2", {
              className: "text-xl sm:text-3xl font-black text-white",
              children: "\uD83D\uDD04 AI Improve"
            }), /*#__PURE__*/_jsx("button", {
              onClick: () => alert('ℹ️ AI IMPROVE:\n\n🔴 RED: Current data\n🟢 GREEN: AI suggestions\n\n📱 MOBILE: Tap items to move\n🖥️ DESKTOP: Drag between panels\n\n• Move SYNONYMS between panels\n• Move CONTEXT between panels\n• Select LEVEL and FAMILY\n\nFinal result = GREEN panel items'),
              className: "text-blue-400 hover:text-blue-300 text-lg sm:text-xl flex-shrink-0",
              title: "How to use",
              children: "\u2139\uFE0F"
            })]
          }), /*#__PURE__*/_jsx("button", {
            onClick: () => setShowImproveModal(false),
            className: "text-slate-400 hover:text-white text-2xl sm:text-3xl self-end sm:self-auto",
            children: "\xD7"
          })]
        }), /*#__PURE__*/_jsx("div", {
          className: "bg-indigo-900/20 border border-indigo-500/50 rounded-xl p-2 sm:p-3 mb-3 sm:mb-4 text-center",
          children: /*#__PURE__*/_jsxs("p", {
            className: "text-indigo-300 text-xs sm:text-sm",
            children: [/*#__PURE__*/_jsx("strong", {
              children: "Word:"
            }), " ", improveData.vocabulary]
          })
        }), /*#__PURE__*/_jsxs("div", {
          className: "grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-4 sm:mb-6",
          children: [/*#__PURE__*/_jsxs("div", {
            className: "bg-red-900/20 border-2 border-red-500 rounded-2xl p-6",
            children: [/*#__PURE__*/_jsx("h3", {
              className: "text-red-300 font-bold mb-4 text-center text-lg",
              children: "\uD83D\uDD34 CURRENT DATA"
            }), /*#__PURE__*/_jsxs("div", {
              className: "mb-6",
              children: [/*#__PURE__*/_jsx("div", {
                className: "text-xs font-bold uppercase text-red-400 mb-2",
                children: "Family"
              }), /*#__PURE__*/_jsxs("label", {
                className: "flex items-center bg-red-950/50 border border-red-500/50 rounded-lg p-3 cursor-pointer hover:bg-red-950/70",
                children: [/*#__PURE__*/_jsx("input", {
                  type: "radio",
                  name: "improve_family",
                  checked: (((_improveData$selectio = improveData.selections) === null || _improveData$selectio === void 0 ? void 0 : _improveData$selectio.family) || 'improved') === 'current',
                  onChange: () => setImproveData({
                    ...improveData,
                    selections: {
                      ...(improveData.selections || {}),
                      family: 'current'
                    }
                  }),
                  className: "mr-3 w-5 h-5"
                }), /*#__PURE__*/_jsx("span", {
                  className: "text-red-200",
                  children: improveData.current.family || '—'
                })]
              })]
            }), /*#__PURE__*/_jsxs("div", {
              className: "mb-6",
              children: [/*#__PURE__*/_jsx("div", {
                className: "text-xs font-bold uppercase text-red-400 mb-2",
                children: "Synonyms (drag to AI panel \u2192)"
              }), /*#__PURE__*/_jsx("div", {
                className: "bg-red-950/30 border border-red-500/30 rounded-lg p-3 min-h-[100px]",
                onDragOver: e => e.preventDefault(),
                onDrop: e => {
                  e.preventDefault();
                  const synonym = e.dataTransfer.getData('synonym');
                  const source = e.dataTransfer.getData('improveSynSource');
                  if (source === 'improved') {
                    var _improveData$selectio2, _improveData$selectio3;
                    const currentSyns = ((_improveData$selectio2 = improveData.selections) === null || _improveData$selectio2 === void 0 ? void 0 : _improveData$selectio2.currentSynonyms) || [];
                    const improvedSyns = (((_improveData$selectio3 = improveData.selections) === null || _improveData$selectio3 === void 0 ? void 0 : _improveData$selectio3.improvedSynonyms) || []).filter(s => s !== synonym);
                    setImproveData({
                      ...improveData,
                      selections: {
                        ...(improveData.selections || {}),
                        currentSynonyms: [...currentSyns, synonym],
                        improvedSynonyms: improvedSyns
                      }
                    });
                  }
                },
                children: (((_improveData$selectio4 = improveData.selections) === null || _improveData$selectio4 === void 0 ? void 0 : _improveData$selectio4.currentSynonyms) || []).map((syn, i) => /*#__PURE__*/_jsx("div", {
                  draggable: true,
                  onDragStart: e => {
                    e.dataTransfer.setData('synonym', syn);
                    e.dataTransfer.setData('improveSynSource', 'current');
                  },
                  className: "bg-red-700/50 hover:bg-red-700/70 text-red-100 px-3 sm:px-4 py-2 sm:py-3 rounded-lg mb-2 cursor-move inline-block mr-2 text-sm sm:text-base touch-manipulation select-none",
                  onClick: () => {
                    var _improveData$selectio5, _improveData$selectio6;
                    // 🆕 V11.21: Tap to move to green panel (mobile-friendly)
                    const currentSyns = (((_improveData$selectio5 = improveData.selections) === null || _improveData$selectio5 === void 0 ? void 0 : _improveData$selectio5.currentSynonyms) || []).filter(s => s !== syn);
                    const improvedSyns = ((_improveData$selectio6 = improveData.selections) === null || _improveData$selectio6 === void 0 ? void 0 : _improveData$selectio6.improvedSynonyms) || [];
                    setImproveData({
                      ...improveData,
                      selections: {
                        ...(improveData.selections || {}),
                        currentSynonyms: currentSyns,
                        improvedSynonyms: [...improvedSyns, syn]
                      }
                    });
                  },
                  children: syn
                }, i))
              })]
            }), /*#__PURE__*/_jsxs("div", {
              children: [/*#__PURE__*/_jsx("div", {
                className: "text-xs font-bold uppercase text-red-400 mb-2",
                children: "Context (drag to AI panel \u2192)"
              }), /*#__PURE__*/_jsxs("div", {
                className: "bg-red-950/30 border border-red-500/30 rounded-lg p-3 min-h-[80px]",
                onDragOver: e => e.preventDefault(),
                onDrop: e => {
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
                },
                children: [(((_improveData$selectio7 = improveData.selections) === null || _improveData$selectio7 === void 0 ? void 0 : _improveData$selectio7.currentContext) || []).map((ctx, i) => /*#__PURE__*/_jsx("div", {
                  draggable: true,
                  onDragStart: e => {
                    e.dataTransfer.setData('improveContext', ctx);
                    e.dataTransfer.setData('improveContextSource', 'current');
                  },
                  className: "bg-red-700/50 hover:bg-red-700/70 text-red-100 px-3 py-2 rounded-lg cursor-move text-sm",
                  children: ctx
                }, i)), (((_improveData$selectio8 = improveData.selections) === null || _improveData$selectio8 === void 0 ? void 0 : _improveData$selectio8.currentContext) || []).length === 0 && improveData.current.context && /*#__PURE__*/_jsx("div", {
                  draggable: true,
                  onDragStart: e => {
                    e.dataTransfer.setData('improveContext', improveData.current.context);
                    e.dataTransfer.setData('improveContextSource', 'current');
                  },
                  className: "bg-red-700/50 hover:bg-red-700/70 text-red-100 px-3 py-2 rounded-lg cursor-move text-sm",
                  children: improveData.current.context
                })]
              })]
            })]
          }), /*#__PURE__*/_jsxs("div", {
            className: "bg-green-900/20 border-2 border-green-500 rounded-2xl p-6",
            children: [/*#__PURE__*/_jsx("h3", {
              className: "text-green-300 font-bold mb-4 text-center text-lg",
              children: "\uD83D\uDFE2 AI SUGGESTIONS"
            }), /*#__PURE__*/_jsxs("div", {
              className: "mb-6",
              children: [/*#__PURE__*/_jsx("div", {
                className: "text-xs font-bold uppercase text-green-400 mb-2",
                children: "Family"
              }), /*#__PURE__*/_jsxs("label", {
                className: "flex items-center bg-green-950/50 border border-green-500/50 rounded-lg p-3 cursor-pointer hover:bg-green-950/70",
                children: [/*#__PURE__*/_jsx("input", {
                  type: "radio",
                  name: "improve_family",
                  checked: (((_improveData$selectio9 = improveData.selections) === null || _improveData$selectio9 === void 0 ? void 0 : _improveData$selectio9.family) || 'improved') === 'improved',
                  onChange: () => setImproveData({
                    ...improveData,
                    selections: {
                      ...(improveData.selections || {}),
                      family: 'improved'
                    }
                  }),
                  className: "mr-3 w-5 h-5"
                }), /*#__PURE__*/_jsx("span", {
                  className: "text-green-200",
                  children: improveData.improved.family || '—'
                })]
              })]
            }), /*#__PURE__*/_jsxs("div", {
              className: "mb-6",
              children: [/*#__PURE__*/_jsx("div", {
                className: "text-xs font-bold uppercase text-green-400 mb-2",
                children: "\u2190 Synonyms (drag to current panel)"
              }), /*#__PURE__*/_jsx("div", {
                className: "bg-green-950/30 border border-green-500/30 rounded-lg p-3 min-h-[100px]",
                onDragOver: e => e.preventDefault(),
                onDrop: e => {
                  e.preventDefault();
                  const synonym = e.dataTransfer.getData('synonym');
                  const source = e.dataTransfer.getData('improveSynSource');
                  if (source === 'current') {
                    var _improveData$selectio0, _improveData$selectio1;
                    const currentSyns = (((_improveData$selectio0 = improveData.selections) === null || _improveData$selectio0 === void 0 ? void 0 : _improveData$selectio0.currentSynonyms) || []).filter(s => s !== synonym);
                    const improvedSyns = ((_improveData$selectio1 = improveData.selections) === null || _improveData$selectio1 === void 0 ? void 0 : _improveData$selectio1.improvedSynonyms) || [];
                    setImproveData({
                      ...improveData,
                      selections: {
                        ...(improveData.selections || {}),
                        currentSynonyms: currentSyns,
                        improvedSynonyms: [...improvedSyns, synonym]
                      }
                    });
                  }
                },
                children: (((_improveData$selectio10 = improveData.selections) === null || _improveData$selectio10 === void 0 ? void 0 : _improveData$selectio10.improvedSynonyms) || []).map((syn, i) => /*#__PURE__*/_jsx("div", {
                  draggable: true,
                  onDragStart: e => {
                    e.dataTransfer.setData('synonym', syn);
                    e.dataTransfer.setData('improveSynSource', 'improved');
                  },
                  className: "bg-green-700/50 hover:bg-green-700/70 text-green-100 px-3 sm:px-4 py-2 sm:py-3 rounded-lg mb-2 cursor-move inline-block mr-2 text-sm sm:text-base touch-manipulation select-none",
                  onClick: () => {
                    var _improveData$selectio11, _improveData$selectio12;
                    // 🆕 V11.21: Tap to move to red panel (mobile-friendly)
                    const improvedSyns = (((_improveData$selectio11 = improveData.selections) === null || _improveData$selectio11 === void 0 ? void 0 : _improveData$selectio11.improvedSynonyms) || []).filter(s => s !== syn);
                    const currentSyns = ((_improveData$selectio12 = improveData.selections) === null || _improveData$selectio12 === void 0 ? void 0 : _improveData$selectio12.currentSynonyms) || [];
                    setImproveData({
                      ...improveData,
                      selections: {
                        ...(improveData.selections || {}),
                        improvedSynonyms: improvedSyns,
                        currentSynonyms: [...currentSyns, syn]
                      }
                    });
                  },
                  children: syn
                }, i))
              })]
            }), /*#__PURE__*/_jsxs("div", {
              children: [/*#__PURE__*/_jsx("div", {
                className: "text-xs font-bold uppercase text-green-400 mb-2",
                children: "\u2190 Context (drag to current panel)"
              }), /*#__PURE__*/_jsx("div", {
                className: "bg-green-950/30 border border-green-500/30 rounded-lg p-3 min-h-[80px]",
                onDragOver: e => e.preventDefault(),
                onDrop: e => {
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
                },
                children: (((_improveData$selectio13 = improveData.selections) === null || _improveData$selectio13 === void 0 ? void 0 : _improveData$selectio13.improvedContext) || []).map((ctx, i) => /*#__PURE__*/_jsx("div", {
                  draggable: true,
                  onDragStart: e => {
                    e.dataTransfer.setData('improveContext', ctx);
                    e.dataTransfer.setData('improveContextSource', 'improved');
                  },
                  className: "bg-green-700/50 hover:bg-green-700/70 text-green-100 px-3 py-2 rounded-lg cursor-move text-sm",
                  children: ctx
                }, i))
              })]
            })]
          })]
        }), /*#__PURE__*/_jsxs("div", {
          className: "flex gap-4 mt-6",
          children: [/*#__PURE__*/_jsx("button", {
            onClick: async () => {
              const selections = improveData.selections || {};
              const finalSynonyms = (selections.improvedSynonyms || (improveData.improved.synonyms || '').split(',').map(s => s.trim()).filter(s => s)).join(', ');
              const finalContext = selections.improvedContext && selections.improvedContext.length > 0 ? selections.improvedContext[0] : improveData.improved.context;
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
                ...(words.find(w => w.id === improveData.wordId) || flashcardWords.find(w => w.id === improveData.wordId) || dictationWords.find(w => w.id === improveData.wordId) || selectionWords.find(w => w.id === improveData.wordId) || writingWords.find(w => w.id === improveData.wordId)),
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
              if (showWriting) {
                const newWriting = [...writingWords];
                newWriting[writingIndex] = updatedWord;
                setWritingWords(newWriting);
              }

              // Update main table if not in exercise
              if (!showFlashcards && !showDictation && !showSelection && !showWriting) {
                setWords(prevWords => prevWords.map(w => w.id === improveData.wordId ? updatedWord : w));
              }
              setShowImproveModal(false);
              setImproveData(null);
              alert('✅ Fields updated with your selection!');
            },
            className: "flex-1 bg-green-600 hover:bg-green-500 text-white py-4 rounded-2xl font-black uppercase text-sm",
            children: "\u2705 Apply Green Panel"
          }), /*#__PURE__*/_jsx("button", {
            onClick: () => setShowImproveModal(false),
            className: "flex-1 bg-slate-700 hover:bg-slate-600 text-white py-4 rounded-2xl font-black uppercase text-sm",
            children: "\u274C Cancel"
          })]
        })]
      })
    }), showMergeModal && mergeData && (!selectedSimilar ? /*#__PURE__*/_jsx("div", {
      className: "fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-6",
      onClick: () => {
        setShowMergeModal(false);
        setMergeData(null);
      },
      children: /*#__PURE__*/_jsxs("div", {
        className: "bg-slate-900 rounded-3xl p-8 max-w-4xl w-full shadow-2xl border border-white/10",
        onClick: e => e.stopPropagation(),
        children: [/*#__PURE__*/_jsxs("div", {
          className: "flex justify-between items-center mb-6",
          children: [/*#__PURE__*/_jsx("h2", {
            className: "text-3xl font-black text-white",
            children: "\uD83D\uDD00 Find & Merge Similar"
          }), /*#__PURE__*/_jsx("button", {
            onClick: () => {
              setShowMergeModal(false);
              setMergeData(null);
            },
            className: "text-slate-400 hover:text-white text-3xl",
            children: "\xD7"
          })]
        }), /*#__PURE__*/_jsxs("p", {
          className: "text-slate-400 mb-4",
          children: ["Found ", (mergeData === null || mergeData === void 0 || (_mergeData$similar = mergeData.similar) === null || _mergeData$similar === void 0 ? void 0 : _mergeData$similar.length) || 0, " similar words. Select one to merge:"]
        }), /*#__PURE__*/_jsx("div", {
          className: "space-y-3 max-h-96 overflow-y-auto",
          children: mergeData === null || mergeData === void 0 || (_mergeData$similar2 = mergeData.similar) === null || _mergeData$similar2 === void 0 ? void 0 : _mergeData$similar2.map(word => /*#__PURE__*/_jsxs("button", {
            onClick: () => {
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
            },
            className: "w-full text-left bg-slate-800/50 hover:bg-slate-700/50 border border-orange-500/30 rounded-2xl p-4 transition",
            children: [/*#__PURE__*/_jsx("p", {
              className: "text-white font-bold mb-1",
              children: word.vocabulary
            }), /*#__PURE__*/_jsxs("p", {
              className: "text-slate-400 text-xs",
              children: ["Family: ", word.family || '—']
            }), /*#__PURE__*/_jsxs("p", {
              className: "text-slate-500 text-xs mt-1",
              children: ["Synonyms: ", word.synonyms || '—']
            })]
          }, word.id))
        })]
      })
    }) : /*#__PURE__*/_jsx("div", {
      className: "fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-6",
      onClick: () => {
        setShowMergeModal(false);
        setMergeData(null);
        setSelectedSimilar(null);
      },
      children: /*#__PURE__*/_jsxs("div", {
        className: "bg-slate-900 rounded-3xl p-8 max-w-6xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-white/10",
        onClick: e => e.stopPropagation(),
        children: [/*#__PURE__*/_jsxs("div", {
          className: "flex justify-between items-center mb-6",
          children: [/*#__PURE__*/_jsxs("div", {
            children: [/*#__PURE__*/_jsx("h2", {
              className: "text-3xl font-black text-white",
              children: "\uD83D\uDD00 Drag & Drop Merge"
            }), /*#__PURE__*/_jsx("p", {
              className: "text-slate-400 text-sm mt-1",
              children: "Drag synonyms and context between panels. RED = Delete | GREEN = Keep"
            })]
          }), /*#__PURE__*/_jsx("button", {
            onClick: () => {
              setShowMergeModal(false);
              setMergeData(null);
              setSelectedSimilar(null);
            },
            className: "text-slate-400 hover:text-white text-3xl",
            children: "\xD7"
          })]
        }), /*#__PURE__*/_jsxs("div", {
          className: "grid grid-cols-2 gap-6 mb-6",
          children: [/*#__PURE__*/_jsxs("div", {
            className: "bg-red-900/20 border-2 border-red-500 rounded-2xl p-6",
            children: [/*#__PURE__*/_jsx("h3", {
              className: "text-red-300 font-bold mb-4 text-center text-lg",
              children: "\uD83D\uDD34 TO DELETE"
            }), /*#__PURE__*/_jsxs("div", {
              className: "mb-6",
              children: [/*#__PURE__*/_jsx("div", {
                className: "text-xs font-bold uppercase text-red-400 mb-2",
                children: "Vocabulary (will be deleted)"
              }), /*#__PURE__*/_jsx("div", {
                className: "bg-red-950/50 border border-red-500/50 rounded-lg p-3",
                children: /*#__PURE__*/_jsx("span", {
                  className: "text-red-200 font-bold text-lg",
                  children: selectedSimilar.vocabulary
                })
              })]
            }), /*#__PURE__*/_jsxs("div", {
              className: "mb-6",
              children: [/*#__PURE__*/_jsx("div", {
                className: "text-xs font-bold uppercase text-red-400 mb-2",
                children: "Family"
              }), /*#__PURE__*/_jsxs("label", {
                className: "flex items-center bg-red-950/50 border border-red-500/50 rounded-lg p-3 cursor-pointer hover:bg-red-950/70",
                children: [/*#__PURE__*/_jsx("input", {
                  type: "radio",
                  name: "family",
                  checked: fieldSelections.family === 'similar',
                  onChange: () => setFieldSelections({
                    ...fieldSelections,
                    family: 'similar'
                  }),
                  className: "mr-3 w-5 h-5"
                }), /*#__PURE__*/_jsx("span", {
                  className: "text-red-200",
                  children: selectedSimilar.family || '—'
                })]
              })]
            }), /*#__PURE__*/_jsxs("div", {
              className: "mb-6",
              children: [/*#__PURE__*/_jsx("div", {
                className: "text-xs font-bold uppercase text-red-400 mb-2",
                children: "Synonyms (drag to keep \u2192)"
              }), /*#__PURE__*/_jsx("div", {
                className: "bg-red-950/30 border border-red-500/30 rounded-lg p-3 min-h-[100px]",
                onDragOver: e => e.preventDefault(),
                onDrop: e => {
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
                },
                children: (fieldSelections.deleteSynonyms || (selectedSimilar.synonyms || '').split(',').map(s => s.trim()).filter(s => s)).map((syn, i) => /*#__PURE__*/_jsx("div", {
                  draggable: true,
                  onDragStart: e => {
                    e.dataTransfer.setData('synonym', syn);
                    e.dataTransfer.setData('source', 'delete');
                  },
                  className: "bg-red-700/50 hover:bg-red-700/70 text-red-100 px-3 py-2 rounded-lg mb-2 cursor-move inline-block mr-2",
                  children: syn
                }, i))
              })]
            }), /*#__PURE__*/_jsxs("div", {
              children: [/*#__PURE__*/_jsx("div", {
                className: "text-xs font-bold uppercase text-red-400 mb-2",
                children: "Context (drag to keep \u2192)"
              }), /*#__PURE__*/_jsx("div", {
                className: "bg-red-950/30 border border-red-500/30 rounded-lg p-3 min-h-[80px]",
                onDragOver: e => e.preventDefault(),
                onDrop: e => {
                  e.preventDefault();
                  const source = e.dataTransfer.getData('contextSource');
                  if (source === 'keep') {
                    setFieldSelections(prev => ({
                      ...prev,
                      context: 'similar'
                    }));
                  }
                },
                children: fieldSelections.context === 'similar' && /*#__PURE__*/_jsx("div", {
                  draggable: true,
                  onDragStart: e => {
                    e.dataTransfer.setData('contextSource', 'delete');
                  },
                  className: "bg-red-700/50 hover:bg-red-700/70 text-red-100 px-3 py-2 rounded-lg cursor-move text-sm",
                  children: selectedSimilar.context || '—'
                })
              })]
            })]
          }), /*#__PURE__*/_jsxs("div", {
            className: "bg-green-900/20 border-2 border-green-500 rounded-2xl p-6",
            children: [/*#__PURE__*/_jsx("h3", {
              className: "text-green-300 font-bold mb-4 text-center text-lg",
              children: "\uD83D\uDFE2 TO KEEP"
            }), /*#__PURE__*/_jsxs("div", {
              className: "mb-6",
              children: [/*#__PURE__*/_jsx("div", {
                className: "text-xs font-bold uppercase text-green-400 mb-2",
                children: "Vocabulary (will be kept)"
              }), /*#__PURE__*/_jsx("div", {
                className: "bg-green-950/50 border border-green-500/50 rounded-lg p-3",
                children: /*#__PURE__*/_jsx("span", {
                  className: "text-green-200 font-bold text-lg",
                  children: mergeData.current.vocabulary
                })
              })]
            }), /*#__PURE__*/_jsxs("div", {
              className: "mb-6",
              children: [/*#__PURE__*/_jsx("div", {
                className: "text-xs font-bold uppercase text-green-400 mb-2",
                children: "Family"
              }), /*#__PURE__*/_jsxs("label", {
                className: "flex items-center bg-green-950/50 border border-green-500/50 rounded-lg p-3 cursor-pointer hover:bg-green-950/70",
                children: [/*#__PURE__*/_jsx("input", {
                  type: "radio",
                  name: "family",
                  checked: fieldSelections.family === 'current',
                  onChange: () => setFieldSelections({
                    ...fieldSelections,
                    family: 'current'
                  }),
                  className: "mr-3 w-5 h-5"
                }), /*#__PURE__*/_jsx("span", {
                  className: "text-green-200",
                  children: mergeData.current.family || '—'
                })]
              })]
            }), /*#__PURE__*/_jsxs("div", {
              className: "mb-6",
              children: [/*#__PURE__*/_jsx("div", {
                className: "text-xs font-bold uppercase text-green-400 mb-2",
                children: "\u2190 Synonyms (drag to delete)"
              }), /*#__PURE__*/_jsx("div", {
                className: "bg-green-950/30 border border-green-500/30 rounded-lg p-3 min-h-[100px]",
                onDragOver: e => e.preventDefault(),
                onDrop: e => {
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
                },
                children: (fieldSelections.keepSynonyms || (mergeData.current.synonyms || '').split(',').map(s => s.trim()).filter(s => s)).map((syn, i) => /*#__PURE__*/_jsx("div", {
                  draggable: true,
                  onDragStart: e => {
                    e.dataTransfer.setData('synonym', syn);
                    e.dataTransfer.setData('source', 'keep');
                  },
                  className: "bg-green-700/50 hover:bg-green-700/70 text-green-100 px-3 py-2 rounded-lg mb-2 cursor-move inline-block mr-2",
                  children: syn
                }, i))
              })]
            }), /*#__PURE__*/_jsxs("div", {
              children: [/*#__PURE__*/_jsx("div", {
                className: "text-xs font-bold uppercase text-green-400 mb-2",
                children: "\u2190 Context (drag to delete)"
              }), /*#__PURE__*/_jsx("div", {
                className: "bg-green-950/30 border border-green-500/30 rounded-lg p-3 min-h-[80px]",
                onDragOver: e => e.preventDefault(),
                onDrop: e => {
                  e.preventDefault();
                  const source = e.dataTransfer.getData('contextSource');
                  if (source === 'delete') {
                    setFieldSelections(prev => ({
                      ...prev,
                      context: 'current'
                    }));
                  }
                },
                children: fieldSelections.context === 'current' && /*#__PURE__*/_jsx("div", {
                  draggable: true,
                  onDragStart: e => {
                    e.dataTransfer.setData('contextSource', 'keep');
                  },
                  className: "bg-green-700/50 hover:bg-green-700/70 text-green-100 px-3 py-2 rounded-lg cursor-move text-sm",
                  children: mergeData.current.context || '—'
                })
              })]
            })]
          })]
        }), /*#__PURE__*/_jsxs("div", {
          className: "flex gap-4 mt-6",
          children: [/*#__PURE__*/_jsx("button", {
            onClick: () => {
              const finalSynonyms = [...(fieldSelections.keepSynonyms || [])].join(', ');
              const mergedFields = {
                ...fieldSelections,
                synonyms: 'merged',
                finalSynonyms
              };
              handleMergeWords(mergedFields, selectedSimilar);
              setSelectedSimilar(null);
            },
            className: "flex-1 bg-orange-600 hover:bg-orange-500 text-white py-4 rounded-2xl font-black uppercase text-sm",
            children: "\uD83D\uDD00 Merge & Delete Red Panel"
          }), /*#__PURE__*/_jsx("button", {
            onClick: () => {
              setShowMergeModal(false);
              setMergeData(null);
              setSelectedSimilar(null);
            },
            className: "flex-1 bg-slate-700 hover:bg-slate-600 text-white py-4 rounded-2xl font-black uppercase text-sm",
            children: "\u274C Cancel"
          })]
        })]
      })
    })), showRecycleBin && /*#__PURE__*/_jsx("div", {
      className: "fixed inset-0 bg-black/95 z-[100] flex items-center justify-center p-4 backdrop-blur-md",
      children: /*#__PURE__*/_jsxs("div", {
        className: "glass-card p-10 rounded-[2.5rem] w-full max-w-4xl border-red-500/30 max-h-[80vh] flex flex-col",
        children: [/*#__PURE__*/_jsxs("div", {
          className: "flex justify-between items-center mb-6",
          children: [/*#__PURE__*/_jsx("h2", {
            className: "text-2xl font-black main-gradient uppercase text-center italic",
            children: "\uD83D\uDDD1\uFE0F Recycle Bin (48h)"
          }), /*#__PURE__*/_jsx("button", {
            onClick: () => setShowRecycleBin(false),
            className: "text-slate-400 hover:text-white text-3xl",
            children: "\xD7"
          })]
        }), /*#__PURE__*/_jsxs("p", {
          className: "text-slate-400 mb-4",
          children: [deletedWords.length, " deleted word(s) - Auto-delete after 48h"]
        }), /*#__PURE__*/_jsx("div", {
          className: "flex-1 overflow-y-auto custom-scroll mb-6 space-y-2",
          children: deletedWords.length === 0 ? /*#__PURE__*/_jsxs("div", {
            className: "text-center text-slate-500 py-12",
            children: [/*#__PURE__*/_jsx("i", {
              className: "fas fa-trash text-6xl mb-4 opacity-20"
            }), /*#__PURE__*/_jsx("p", {
              children: "Recycle bin is empty"
            })]
          }) : deletedWords.map(word => /*#__PURE__*/_jsxs("label", {
            className: "flex items-start gap-4 bg-slate-800/50 hover:bg-slate-800 p-4 rounded-xl cursor-pointer transition-colors",
            children: [/*#__PURE__*/_jsx("input", {
              type: "checkbox",
              checked: selectedForRestore.includes(word.id),
              onChange: e => {
                if (e.target.checked) {
                  setSelectedForRestore([...selectedForRestore, word.id]);
                } else {
                  setSelectedForRestore(selectedForRestore.filter(id => id !== word.id));
                }
              },
              className: "mt-1 w-5 h-5"
            }), /*#__PURE__*/_jsxs("div", {
              className: "flex-1",
              children: [/*#__PURE__*/_jsx("p", {
                className: "text-white font-bold",
                children: word.vocabulary
              }), /*#__PURE__*/_jsxs("p", {
                className: "text-slate-400 text-xs mt-1",
                children: ["Family: ", word.family || '—']
              }), /*#__PURE__*/_jsxs("p", {
                className: "text-slate-500 text-xs mt-1",
                children: ["Synonyms: ", word.synonyms || '—']
              }), /*#__PURE__*/_jsxs("p", {
                className: "text-red-400 text-xs mt-2",
                children: ["Deleted: ", new Date(word.deleted_at).toLocaleString()]
              })]
            })]
          }, word.id))
        }), deletedWords.length > 0 && /*#__PURE__*/_jsxs("div", {
          className: "flex gap-4",
          children: [/*#__PURE__*/_jsxs("button", {
            onClick: restoreWords,
            disabled: selectedForRestore.length === 0,
            className: "flex-1 bg-green-600 hover:bg-green-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white py-4 rounded-2xl font-black uppercase text-sm",
            children: ["\u267B\uFE0F Restore Selected (", selectedForRestore.length, ")"]
          }), /*#__PURE__*/_jsxs("button", {
            onClick: permanentlyDelete,
            disabled: selectedForRestore.length === 0,
            className: "flex-1 bg-red-600 hover:bg-red-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white py-4 rounded-2xl font-black uppercase text-sm",
            children: ["\uD83D\uDD25 Delete Forever (", selectedForRestore.length, ")"]
          })]
        })]
      })
    }), showChangeHistory && /*#__PURE__*/_jsx("div", {
      className: "fixed inset-0 bg-black/95 z-[100] flex items-center justify-center p-4 backdrop-blur-md",
      children: /*#__PURE__*/_jsxs("div", {
        className: "glass-card p-10 rounded-[2.5rem] w-full max-w-4xl border-blue-500/30 max-h-[80vh] flex flex-col",
        children: [/*#__PURE__*/_jsxs("div", {
          className: "flex justify-between items-center mb-6",
          children: [/*#__PURE__*/_jsxs("div", {
            className: "flex items-center gap-3",
            children: [/*#__PURE__*/_jsx("h2", {
              className: "text-2xl font-black main-gradient uppercase italic",
              children: "\uD83D\uDCDC Change History (2h)"
            }), /*#__PURE__*/_jsx("button", {
              onClick: () => loadChangeHistory(),
              className: "text-blue-400 hover:text-blue-300 text-sm bg-blue-900/30 px-3 py-1 rounded-lg",
              title: "Refresh history",
              children: "\uD83D\uDD04 Refresh"
            })]
          }), /*#__PURE__*/_jsx("button", {
            onClick: () => {
              setShowChangeHistory(false);
              setSelectedForHistory([]);
            },
            className: "text-slate-400 hover:text-white text-3xl",
            children: "\xD7"
          })]
        }), /*#__PURE__*/_jsxs("p", {
          className: "text-slate-400 mb-4",
          children: [changedWords.length, " modified word(s) in the last 2 hours"]
        }), /*#__PURE__*/_jsx("div", {
          className: "flex-1 overflow-y-auto custom-scroll mb-6 space-y-2",
          children: changedWords.length === 0 ? /*#__PURE__*/_jsxs("div", {
            className: "text-center text-slate-500 py-12",
            children: [/*#__PURE__*/_jsx("i", {
              className: "fas fa-history text-6xl mb-4 opacity-20"
            }), /*#__PURE__*/_jsx("p", {
              className: "text-lg mb-2",
              children: "No recent changes"
            }), /*#__PURE__*/_jsxs("p", {
              className: "text-xs text-slate-600 mt-4",
              children: ["\uD83D\uDCA1 Note: Make sure your database has columns:", /*#__PURE__*/_jsx("br", {}), /*#__PURE__*/_jsx("code", {
                className: "text-blue-400",
                children: "previous_version"
              }), " (text) and ", /*#__PURE__*/_jsx("code", {
                className: "text-blue-400",
                children: "modified_at"
              }), " (timestamptz)"]
            }), /*#__PURE__*/_jsx("p", {
              className: "text-xs text-slate-600 mt-2",
              children: "Check browser console (F12) for debug info"
            })]
          }) : changedWords.map(word => {
            const previousData = word.previous_version ? JSON.parse(word.previous_version) : {};
            return /*#__PURE__*/_jsxs("label", {
              className: "flex items-start gap-4 bg-slate-800/50 hover:bg-slate-800 p-4 rounded-xl cursor-pointer transition-colors",
              children: [/*#__PURE__*/_jsx("input", {
                type: "checkbox",
                checked: selectedForHistory.includes(word.id),
                onChange: e => {
                  if (e.target.checked) {
                    setSelectedForHistory([...selectedForHistory, word.id]);
                  } else {
                    setSelectedForHistory(selectedForHistory.filter(id => id !== word.id));
                  }
                },
                className: "mt-1 w-5 h-5"
              }), /*#__PURE__*/_jsxs("div", {
                className: "flex-1",
                children: [/*#__PURE__*/_jsx("p", {
                  className: "text-white font-bold text-lg mb-2",
                  children: word.vocabulary
                }), /*#__PURE__*/_jsxs("div", {
                  className: "grid grid-cols-2 gap-4 text-xs",
                  children: [/*#__PURE__*/_jsxs("div", {
                    className: "bg-red-900/20 border border-red-500/30 rounded p-2",
                    children: [/*#__PURE__*/_jsx("p", {
                      className: "text-red-400 font-bold mb-1",
                      children: "BEFORE:"
                    }), /*#__PURE__*/_jsxs("p", {
                      className: "text-slate-300",
                      children: ["Family: ", previousData.family || '—']
                    }), /*#__PURE__*/_jsxs("p", {
                      className: "text-slate-300 truncate",
                      children: ["Synonyms: ", previousData.synonyms || '—']
                    }), /*#__PURE__*/_jsxs("p", {
                      className: "text-slate-300 truncate",
                      children: ["Context: ", previousData.context || '—']
                    })]
                  }), /*#__PURE__*/_jsxs("div", {
                    className: "bg-green-900/20 border border-green-500/30 rounded p-2",
                    children: [/*#__PURE__*/_jsx("p", {
                      className: "text-green-400 font-bold mb-1",
                      children: "AFTER:"
                    }), /*#__PURE__*/_jsxs("p", {
                      className: "text-slate-300",
                      children: ["Family: ", word.family || '—']
                    }), /*#__PURE__*/_jsxs("p", {
                      className: "text-slate-300 truncate",
                      children: ["Synonyms: ", word.synonyms || '—']
                    }), /*#__PURE__*/_jsxs("p", {
                      className: "text-slate-300 truncate",
                      children: ["Context: ", word.context || '—']
                    })]
                  })]
                }), /*#__PURE__*/_jsxs("p", {
                  className: "text-blue-400 text-xs mt-2",
                  children: ["Modified: ", new Date(word.modified_at).toLocaleString()]
                })]
              })]
            }, word.id);
          })
        }), changedWords.length > 0 && /*#__PURE__*/_jsx("div", {
          className: "flex gap-4",
          children: /*#__PURE__*/_jsxs("button", {
            onClick: restorePreviousVersions,
            disabled: selectedForHistory.length === 0,
            className: "flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white py-4 rounded-2xl font-black uppercase text-sm",
            children: ["\u23EA Restore to BEFORE (", selectedForHistory.length, ")"]
          })
        })]
      })
    }), showFlashcards && flashcardWords.length > 0 && /*#__PURE__*/_jsx("div", {
      className: "fixed inset-0 bg-black/95 z-[100] flex items-center justify-center p-2 sm:p-4 backdrop-blur-md overflow-y-auto",
      children: /*#__PURE__*/_jsxs("div", {
        className: "w-full max-w-4xl my-2 sm:my-8",
        children: [/*#__PURE__*/_jsx(ExerciseHeader, {
          title: "\uD83C\uDFB4 Flashcards",
          currentIndex: flashcardIndex,
          totalCount: flashcardWords.length,
          currentWord: flashcardWords[flashcardIndex].vocabulary,
          exerciseMode: exerciseMode,
          audioEnabled: flashcardAudioEnabled,
          onClose: () => {
            setShowFlashcards(false);
            setFlashcardWords([]);
            setFlashcardIndex(0);
            setIsFlipped(false);
          },
          onModeToggle: () => {
            setExerciseMode(exerciseMode === 'random' ? 'memory' : 'random');
            setShowFlashcards(false);
            setTimeout(() => loadFlashcards(), 100);
          },
          onAudioToggle: () => {
            const newState = !flashcardAudioEnabled;
            setFlashcardAudioEnabled(newState);
            localStorage.setItem('flashcard_audio', newState.toString());
          },
          onDictionary: word => {
            setSelectedWordForDict(word);
            setShowDictionaryModal(true);
          },
          onEdit: () => {
            setEditingWord(flashcardWords[flashcardIndex]);
            setOriginalEditData({
              ...flashcardWords[flashcardIndex]
            });
            setShowAddModal(true);
          },
          onInfo: () => alert('🎴 FLASHCARDS EXERCISE\n\n📊 DIFFICULTY TRACKING:\n🟢 Active: You know it well\n🟡 Emerging: Need more practice\n🔴 Passive: Difficult to remember\n\n🎯 HOW TO USE:\n• Click card to flip and see answer\n• Rate your knowledge (Easy/Medium/Hard)\n• 🧠 Memory mode: Shows hardest cards first\n• 🎲 Random mode: Shuffles all cards\n\n🔊 AUDIO:\n• Auto-plays context when card flips (if enabled)\n\n🎮 BUTTONS:\n• 🧠/🎲 = Toggle Memory/Random mode\n• 🔊/🔇 = Toggle audio on/off\n• 📖 = Open in dictionary\n• ℹ️ = Show this help\n• ✏️ = Edit current word\n• × = Close exercise\n• ← → = Navigate between cards\n• Easy/Medium/Passive = Rate difficulty')
        }), flashcardWords[flashcardIndex].difficulty && /*#__PURE__*/_jsx("div", {
          className: "text-center mb-4",
          children: /*#__PURE__*/_jsx("span", {
            className: `inline-block px-4 py-2 rounded-full text-sm font-bold ${flashcardWords[flashcardIndex].difficulty === 'Active' ? 'bg-green-600/30 text-green-400 border border-green-500' : flashcardWords[flashcardIndex].difficulty === 'Emerging' ? 'bg-yellow-600/30 text-yellow-400 border border-yellow-500' : 'bg-red-600/30 text-red-400 border border-red-500'}`,
            children: flashcardWords[flashcardIndex].difficulty
          })
        }), /*#__PURE__*/_jsx("div", {
          className: "relative w-full h-96 cursor-pointer mb-6",
          style: {
            perspective: '1000px'
          },
          onClick: () => setIsFlipped(!isFlipped),
          children: /*#__PURE__*/_jsxs("div", {
            className: "absolute w-full h-full transition-all duration-500",
            style: {
              transformStyle: 'preserve-3d',
              transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)'
            },
            children: [/*#__PURE__*/_jsxs("div", {
              className: "absolute w-full h-full bg-gradient-to-br from-indigo-600 to-purple-600 rounded-3xl p-12 flex flex-col items-center justify-center shadow-2xl",
              style: {
                backfaceVisibility: 'hidden'
              },
              children: [/*#__PURE__*/_jsx("button", {
                onClick: e => {
                  e.stopPropagation();
                  toggleFavourite(flashcardWords[flashcardIndex].id, flashcardWords[flashcardIndex].favourite || 0);
                },
                className: "absolute top-6 right-6 z-10 bg-white/20 hover:bg-white/30 p-3 rounded-full transition-all hover:scale-110",
                title: "Toggle favourite",
                children: /*#__PURE__*/_jsx("i", {
                  className: `${(flashcardWords[flashcardIndex].favourite || 0) === 0 ? 'far fa-star star-off' : (flashcardWords[flashcardIndex].favourite || 0) === 1 ? 'fas fa-star-half-alt star-half' : 'fas fa-star star-on'} text-3xl`
                })
              }), /*#__PURE__*/_jsxs("div", {
                className: "text-center",
                children: [/*#__PURE__*/_jsxs("div", {
                  className: "inline-block mb-4",
                  children: [/*#__PURE__*/_jsx("span", {
                    className: "bg-white/20 text-white px-4 py-2 rounded-full text-sm font-bold mr-2",
                    children: flashcardWords[flashcardIndex].difficulty || '—'
                  }), /*#__PURE__*/_jsx("span", {
                    className: "bg-white/20 text-white px-4 py-2 rounded-full text-sm font-bold",
                    children: flashcardWords[flashcardIndex].family || '—'
                  })]
                }), /*#__PURE__*/_jsx("h3", {
                  className: "text-6xl font-black text-white mb-4",
                  children: flashcardWords[flashcardIndex].vocabulary
                }), /*#__PURE__*/_jsx("p", {
                  className: "text-white/60 text-lg",
                  children: "Click to flip"
                })]
              })]
            }), /*#__PURE__*/_jsx("div", {
              className: "absolute w-full h-full bg-gradient-to-br from-purple-600 to-pink-600 rounded-3xl p-12 flex flex-col justify-center shadow-2xl",
              style: {
                backfaceVisibility: 'hidden',
                transform: 'rotateY(180deg)'
              },
              children: /*#__PURE__*/_jsxs("div", {
                className: "space-y-6",
                children: [/*#__PURE__*/_jsxs("div", {
                  children: [/*#__PURE__*/_jsx("h4", {
                    className: "text-white/70 text-sm font-bold uppercase mb-2",
                    children: "Synonyms:"
                  }), /*#__PURE__*/_jsx("p", {
                    className: "text-white text-2xl font-bold",
                    children: flashcardWords[flashcardIndex].synonyms || 'No synonyms available'
                  })]
                }), /*#__PURE__*/_jsxs("div", {
                  children: [/*#__PURE__*/_jsx("h4", {
                    className: "text-white/70 text-sm font-bold uppercase mb-2",
                    children: "Context:"
                  }), /*#__PURE__*/_jsx("p", {
                    className: "text-white text-xl leading-relaxed",
                    children: flashcardWords[flashcardIndex].context || 'No context available'
                  })]
                })]
              })
            })]
          })
        }), /*#__PURE__*/_jsxs("div", {
          className: "flex gap-4 mb-6",
          children: [/*#__PURE__*/_jsx("button", {
            onClick: e => {
              e.stopPropagation();
              setDifficulty('Active');
            },
            className: "flex-1 bg-green-600 hover:bg-green-500 text-white py-4 rounded-2xl font-black uppercase text-sm tooltip",
            "data-tip": "Active: Retrieves the word instantly. Speak without thinking.",
            children: "\u2705 Active"
          }), /*#__PURE__*/_jsx("button", {
            onClick: e => {
              e.stopPropagation();
              setDifficulty('Emerging');
            },
            className: "flex-1 bg-yellow-600 hover:bg-yellow-500 text-white py-4 rounded-2xl font-black uppercase text-sm tooltip",
            "data-tip": "Emerging: Searches for the word in your mental archive. Write a formal email calmly.",
            children: "\u26A0\uFE0F Emerging"
          }), /*#__PURE__*/_jsx("button", {
            onClick: e => {
              e.stopPropagation();
              setDifficulty('Passive');
            },
            className: "flex-1 bg-red-600 hover:bg-red-500 text-white py-4 rounded-2xl font-black uppercase text-sm tooltip",
            "data-tip": "Passive: Decodes others' messages. Read a New York Times article.",
            children: "\u274C Passive"
          })]
        }), /*#__PURE__*/_jsxs("div", {
          className: "flex gap-4 items-center justify-between",
          children: [/*#__PURE__*/_jsx("button", {
            onClick: e => {
              e.stopPropagation();
              if (flashcardIndex > 0) {
                setFlashcardIndex(flashcardIndex - 1);
                setIsFlipped(false);
              }
            },
            disabled: flashcardIndex === 0,
            className: `px-8 py-4 rounded-2xl font-black text-lg ${flashcardIndex === 0 ? 'bg-slate-800 text-slate-600 cursor-not-allowed' : 'bg-white text-slate-900 hover:bg-slate-200'}`,
            children: "\u2190 Previous"
          }), /*#__PURE__*/_jsx("button", {
            onClick: e => {
              e.stopPropagation();
              if (flashcardIndex < flashcardWords.length - 1) {
                setFlashcardIndex(flashcardIndex + 1);
                setIsFlipped(false);
              }
            },
            disabled: flashcardIndex === flashcardWords.length - 1,
            className: `px-8 py-4 rounded-2xl font-black text-lg ${flashcardIndex === flashcardWords.length - 1 ? 'bg-slate-800 text-slate-600 cursor-not-allowed' : 'bg-white text-slate-900 hover:bg-slate-200'}`,
            children: "Next \u2192"
          })]
        }), /*#__PURE__*/_jsx("div", {
          className: "mt-6 bg-slate-800 rounded-full h-2 overflow-hidden",
          children: /*#__PURE__*/_jsx("div", {
            className: "bg-gradient-to-r from-indigo-500 to-purple-500 h-full transition-all duration-300",
            style: {
              width: `${(flashcardIndex + 1) / flashcardWords.length * 100}%`
            }
          })
        })]
      })
    }), showDictation && dictationWords.length > 0 && /*#__PURE__*/_jsx("div", {
      className: "fixed inset-0 bg-black/95 z-[100] flex items-center justify-center p-2 sm:p-4 backdrop-blur-md overflow-y-auto",
      children: /*#__PURE__*/_jsxs("div", {
        className: "w-full max-w-4xl my-2 sm:my-8",
        children: [/*#__PURE__*/_jsx(ExerciseHeader, {
          title: "\uD83C\uDFA4 Dictation",
          currentIndex: dictationIndex,
          totalCount: dictationWords.length,
          currentWord: dictationWords[dictationIndex].vocabulary,
          exerciseMode: exerciseMode,
          onClose: () => {
            setShowDictation(false);
            setDictationWords([]);
            setDictationIndex(0);
            setDictationInput('');
            setShowDictationAnswer(false);
            setDictationErrorCount(0);
            setDictationDifficulty('');
            setDictationPlayCount(0);
            setDictationPlaySpeed('normal');
          },
          onModeToggle: () => {
            setExerciseMode(exerciseMode === 'random' ? 'memory' : 'random');
            setShowDictation(false);
            setTimeout(() => loadDictation(), 100);
          },
          onDictionary: word => {
            setSelectedWordForDict(word);
            setShowDictionaryModal(true);
          },
          onInfo: () => alert('🎤 DICTATION EXERCISE\n\n📊 SCORING:\n🟢 Active: 0-1 errors\n🟡 Emerging: 2 errors\n🔴 Passive: 3+ errors\n\n⌨️ SHORTCUTS:\n• Press ENTER to check your answer\n• Press ENTER again to move to next word and auto-play\n\n🔊 AUDIO:\n• First play: Normal speed (1.0x)\n• Second play: Slow speed (0.7x)\n• Maximum 4 plays per word\n\n🎮 BUTTONS:\n• 🧠/🎲 = Toggle Memory/Random mode\n• 📖 = Open in dictionary\n• ℹ️ = Show this help\n• ✏️ = Edit current word\n• × = Close exercise\n• 🔊 = Play audio\n• Check Answer = Verify your answer\n• Skip = Skip to next word\n• Edit Word = Modify current word\n• Next Word/Finish = Continue or complete'),
          onEdit: () => {
            setEditingWord(dictationWords[dictationIndex]);
            setOriginalEditData({
              ...dictationWords[dictationIndex]
            });
            setShowAddModal(true);
          }
        }), /*#__PURE__*/_jsxs("div", {
          className: "glass-card rounded-3xl p-12 mb-6",
          children: [/*#__PURE__*/_jsxs("div", {
            className: "text-center mb-8",
            children: [/*#__PURE__*/_jsxs("div", {
              className: "flex justify-center items-center gap-4 mb-4",
              children: [/*#__PURE__*/_jsx("button", {
                onClick: () => {
                  if (dictationPlayCount < MAX_DICTATION_PLAYS) {
                    const speed = dictationPlaySpeed === 'normal' ? 1.0 : 0.7;
                    speakText(dictationWords[dictationIndex].context, speed);
                    setDictationPlaySpeed(speed === 1.0 ? 'slow' : 'normal');
                    setDictationPlayCount(dictationPlayCount + 1);
                  }
                },
                disabled: dictationPlayCount >= MAX_DICTATION_PLAYS,
                className: `text-white p-6 rounded-full text-4xl shadow-2xl transition-all hover:scale-110 ${dictationPlayCount >= MAX_DICTATION_PLAYS ? 'bg-slate-600 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500'}`,
                children: "\uD83D\uDD0A"
              }), /*#__PURE__*/_jsxs("div", {
                className: "text-center",
                children: [/*#__PURE__*/_jsx("div", {
                  className: "text-white font-black text-2xl",
                  children: MAX_DICTATION_PLAYS - dictationPlayCount
                }), /*#__PURE__*/_jsx("div", {
                  className: "text-slate-400 text-xs uppercase font-bold",
                  children: "Plays Left"
                })]
              })]
            }), /*#__PURE__*/_jsxs("p", {
              className: "text-slate-400 text-sm",
              children: ["Click speaker to hear \u2022 Speed: ", dictationPlaySpeed === 'normal' ? 'Normal' : 'Slow']
            })]
          }), !showDictationAnswer ? /*#__PURE__*/_jsxs(_Fragment, {
            children: [/*#__PURE__*/_jsx("textarea", {
              value: dictationInput,
              onChange: e => setDictationInput(e.target.value),
              onKeyDown: async e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (!showDictationAnswer) {
                    // First Enter: Check answer
                    const {
                      errorCount
                    } = highlightDifferences(dictationInput, dictationWords[dictationIndex].context);
                    const difficulty = calculateDifficulty(errorCount);
                    setDictationErrorCount(errorCount);
                    setDictationDifficulty(difficulty);
                    setShowDictationAnswer(true);
                  } else {
                    // Second Enter: Save and move to next word (same as Next Word button)
                    try {
                      const currentDictationWord = dictationWords[dictationIndex];
                      await supabase.from('vocabulary_v4').update({
                        difficulty: dictationDifficulty,
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
                    }
                  }
                }
              },
              placeholder: "Write what you hear...",
              className: "w-full p-6 rounded-xl text-lg min-h-[120px] resize-none mb-4",
              autoFocus: true
            }), /*#__PURE__*/_jsxs("div", {
              className: "flex gap-4",
              children: [/*#__PURE__*/_jsx("button", {
                onClick: () => {
                  // 🆕 V11.5: Calculate errors and difficulty
                  const {
                    errorCount
                  } = highlightDifferences(dictationInput, dictationWords[dictationIndex].context);
                  const difficulty = calculateDifficulty(errorCount);
                  setDictationErrorCount(errorCount);
                  setDictationDifficulty(difficulty);
                  setShowDictationAnswer(true);
                },
                className: "flex-1 bg-green-600 hover:bg-green-500 text-white py-4 rounded-2xl font-black uppercase text-sm",
                children: "\u2705 Check Answer"
              }), /*#__PURE__*/_jsx("button", {
                onClick: () => {
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
                  }
                },
                className: "px-6 bg-slate-700 hover:bg-slate-600 text-white py-4 rounded-2xl font-black uppercase text-sm",
                children: "\u23ED\uFE0F Skip"
              })]
            })]
          }) : /*#__PURE__*/_jsxs(_Fragment, {
            children: [/*#__PURE__*/_jsxs("div", {
              className: "flex justify-center items-center gap-4 mb-6 p-4 bg-slate-800/50 rounded-2xl",
              children: [/*#__PURE__*/_jsxs("div", {
                className: "text-center",
                children: [/*#__PURE__*/_jsx("p", {
                  className: "text-xs uppercase font-black text-slate-500 mb-1",
                  children: "Errors"
                }), /*#__PURE__*/_jsx("p", {
                  className: "text-2xl font-black text-white",
                  children: dictationErrorCount
                })]
              }), /*#__PURE__*/_jsx("div", {
                className: "h-12 w-px bg-slate-700"
              }), /*#__PURE__*/_jsxs("div", {
                className: "text-center",
                children: [/*#__PURE__*/_jsx("p", {
                  className: "text-xs uppercase font-black text-slate-500 mb-1",
                  children: "Difficulty"
                }), /*#__PURE__*/_jsxs("p", {
                  className: `text-2xl font-black ${dictationDifficulty === 'Active' ? 'text-green-400' : dictationDifficulty === 'Emerging' ? 'text-yellow-400' : 'text-red-400'}`,
                  children: [dictationDifficulty === 'Active' ? '🟢' : dictationDifficulty === 'Emerging' ? '🟡' : '🔴', " ", dictationDifficulty]
                })]
              })]
            }), /*#__PURE__*/_jsxs("div", {
              className: "space-y-6",
              children: [/*#__PURE__*/_jsxs("div", {
                children: [/*#__PURE__*/_jsx("h4", {
                  className: "text-xs uppercase font-black text-slate-500 mb-2",
                  children: "Your Answer (\uD83D\uDFE2 correct, \uD83D\uDD34 errors):"
                }), /*#__PURE__*/_jsx("div", {
                  className: "bg-slate-800 p-4 rounded-xl text-lg",
                  children: dictationInput ? highlightDifferences(dictationInput, dictationWords[dictationIndex].context).highlighted : /*#__PURE__*/_jsx("span", {
                    className: "text-slate-600 italic",
                    children: "No input"
                  })
                })]
              }), /*#__PURE__*/_jsxs("div", {
                children: [/*#__PURE__*/_jsx("h4", {
                  className: "text-xs uppercase font-black text-green-400 mb-2",
                  children: "Correct Answer:"
                }), /*#__PURE__*/_jsx("div", {
                  className: "bg-green-900/20 border border-green-500/30 p-4 rounded-xl text-lg text-green-100",
                  children: highlightWordInContext(dictationWords[dictationIndex].context, dictationWords[dictationIndex].vocabulary)
                })]
              })]
            }), /*#__PURE__*/_jsx("div", {
              className: "mt-6",
              children: /*#__PURE__*/_jsx("button", {
                onClick: async () => {
                  // 🆕 V11.5: Save difficulty to database
                  try {
                    const currentDictationWord = dictationWords[dictationIndex];
                    await supabase.from('vocabulary_v4').update({
                      difficulty: dictationDifficulty,
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
                  }
                },
                className: "w-full bg-indigo-600 hover:bg-indigo-500 text-white py-4 rounded-2xl font-black uppercase text-sm",
                children: dictationIndex < dictationWords.length - 1 ? 'Next Word →' : '✅ Finish'
              })
            })]
          })]
        }), /*#__PURE__*/_jsx("div", {
          className: "mt-6 bg-slate-800 rounded-full h-2 overflow-hidden",
          children: /*#__PURE__*/_jsx("div", {
            className: "bg-gradient-to-r from-blue-500 to-indigo-500 h-full transition-all duration-300",
            style: {
              width: `${(dictationIndex + 1) / dictationWords.length * 100}%`
            }
          })
        })]
      })
    }), showSelection && selectionWords.length > 0 && /*#__PURE__*/_jsx("div", {
      className: "fixed inset-0 bg-black/95 z-[100] flex items-center justify-center p-2 sm:p-4 backdrop-blur-md overflow-y-auto",
      children: /*#__PURE__*/_jsxs("div", {
        className: "w-full max-w-4xl my-2 sm:my-8",
        children: [/*#__PURE__*/_jsx(ExerciseHeader, {
          title: "\u2713 Selection",
          currentIndex: selectionIndex,
          totalCount: selectionWords.length,
          currentWord: selectionWords[selectionIndex].vocabulary,
          exerciseMode: exerciseMode,
          onClose: () => {
            setShowSelection(false);
            setSelectionWords([]);
            setSelectionIndex(0);
            setSelectedAnswer(null);
            setShowSelectionAnswer(false);
            setSelectionAttempts(0);
            setSelectionDifficulty('');
          },
          onModeToggle: () => {
            const newMode = exerciseMode === 'random' ? 'memory' : 'random';
            setExerciseMode(newMode);
            localStorage.setItem('exercise_mode', newMode);
            setShowSelection(false);
            setTimeout(() => loadSelection(), 100);
          },
          onDictionary: word => {
            setSelectedWordForDict(word);
            setShowDictionaryModal(true);
          },
          onInfo: () => alert('✓ SELECTION EXERCISE\n\n📊 SCORING:\n✅ First try correct = Easy\n⚠️ Second try correct = Medium\n❌ Third or more tries = Hard\n\n🎯 HOW TO PLAY:\n• Read the sentence with the blank\n• Choose the correct word from 6 options\n• You have unlimited attempts\n• Difficulty is based on number of tries\n\n🎮 BUTTONS:\n• 🧠/🎲 = Toggle Memory/Random mode\n• 📖 = Open in dictionary\n• ℹ️ = Show this help\n• ✏️ = Edit current word\n• × = Close exercise\n• Word options = Click to select answer\n• Edit Word = Modify current word\n• Next Word/Finish = Continue or complete'),
          onEdit: () => {
            setEditingWord(selectionWords[selectionIndex]);
            setOriginalEditData({
              ...selectionWords[selectionIndex]
            });
            setShowAddModal(true);
          }
        }), /*#__PURE__*/_jsx("div", {
          className: "bg-gradient-to-br from-green-600 to-teal-600 rounded-2xl sm:rounded-3xl p-4 sm:p-8 mb-4 sm:mb-6 shadow-2xl",
          children: /*#__PURE__*/_jsxs("div", {
            className: "text-center",
            children: [/*#__PURE__*/_jsx("h3", {
              className: "text-white/70 text-xs sm:text-sm font-bold uppercase mb-2 sm:mb-4",
              children: "Complete the sentence:"
            }), /*#__PURE__*/_jsx("p", {
              className: "text-white text-lg sm:text-2xl font-bold leading-relaxed",
              children: hideWordInContext(selectionWords[selectionIndex].context, selectionWords[selectionIndex].vocabulary)
            })]
          })
        }), !selectionOptionsVisible && selectionTimeLeft > 0 && /*#__PURE__*/_jsx("div", {
          className: "text-center mb-4 sm:mb-6",
          children: /*#__PURE__*/_jsxs("div", {
            className: "inline-block bg-indigo-600/30 border-2 border-indigo-500 rounded-full px-6 py-3 sm:px-8 sm:py-4",
            children: [/*#__PURE__*/_jsx("p", {
              className: "text-indigo-300 text-xs sm:text-sm font-bold uppercase mb-1",
              children: "Options visible in"
            }), /*#__PURE__*/_jsx("p", {
              className: "text-white text-4xl sm:text-5xl font-black",
              children: selectionTimeLeft
            })]
          })
        }), /*#__PURE__*/_jsx("div", {
          className: "grid grid-cols-2 gap-2 sm:gap-4 mb-4 sm:mb-6",
          children: selectionOptions.map((option, index) => /*#__PURE__*/_jsx("button", {
            onClick: () => {
              if (showSelectionAnswer || !selectionOptionsVisible) return; // Don't allow changes after answer shown or while blurred

              setSelectedAnswer(option.vocabulary);
              const isCorrect = option.vocabulary === selectionWords[selectionIndex].vocabulary;
              if (!isCorrect) {
                // Wrong answer - increment attempts
                setSelectionAttempts(prev => prev + 1);
              } else {
                // Correct answer - calculate difficulty
                const newAttempts = selectionAttempts + 1;
                let difficulty;
                if (newAttempts === 1) difficulty = 'Active';else if (newAttempts === 2) difficulty = 'Emerging';else difficulty = 'Passive';
                setSelectionDifficulty(difficulty);
                setShowSelectionAnswer(true);
              }
            },
            disabled: showSelectionAnswer || !selectionOptionsVisible,
            className: `p-3 sm:p-6 rounded-xl sm:rounded-2xl font-bold text-base sm:text-lg transition-all ${!selectionOptionsVisible ? 'blur-lg cursor-not-allowed bg-slate-800 text-slate-600' : showSelectionAnswer ? option.vocabulary === selectionWords[selectionIndex].vocabulary ? 'bg-green-600 text-white border-2 border-green-400' : selectedAnswer === option.vocabulary ? 'bg-red-600/50 text-white border-2 border-red-400' : 'bg-slate-800 text-slate-500' : selectedAnswer === option.vocabulary ? 'bg-blue-600 text-white border-2 border-blue-400 scale-105' : 'bg-slate-800 hover:bg-slate-700 text-white hover:scale-105'}`,
            children: option.vocabulary
          }, index))
        }), !showSelectionAnswer && /*#__PURE__*/_jsx("div", {
          className: "mt-4 sm:mt-6",
          children: /*#__PURE__*/_jsx("button", {
            onClick: () => {
              // Skip to next word without saving anything
              if (selectionIndex < selectionWords.length - 1) {
                const nextIndex = selectionIndex + 1;
                setSelectionIndex(nextIndex);
                setSelectedAnswer(null);
                setShowSelectionAnswer(false);
                setSelectionAttempts(0);
                setSelectionDifficulty('');
                // Generate new options for next word
                const nextOptions = generateSelectionOptions(selectionWords[nextIndex], selectionWords);
                // 🆕 V11.19: Validate options were generated
                if (!nextOptions) {
                  alert('⚠️ Cannot generate options for next word. Ending exercise.');
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
              }
            },
            className: "w-full bg-slate-700 hover:bg-slate-600 text-white py-3 sm:py-4 rounded-xl sm:rounded-2xl font-black uppercase text-sm",
            children: "\u23ED\uFE0F Skip"
          })
        }), showSelectionAnswer && /*#__PURE__*/_jsxs("div", {
          className: "space-y-3 sm:space-y-4",
          children: [/*#__PURE__*/_jsxs("div", {
            className: "flex justify-center items-center gap-3 sm:gap-4 p-3 sm:p-4 bg-slate-800/50 rounded-xl sm:rounded-2xl",
            children: [/*#__PURE__*/_jsxs("div", {
              className: "text-center",
              children: [/*#__PURE__*/_jsx("p", {
                className: "text-[10px] sm:text-xs uppercase font-black text-slate-500 mb-1",
                children: "Attempts"
              }), /*#__PURE__*/_jsx("p", {
                className: "text-xl sm:text-2xl font-black text-white",
                children: selectionAttempts + 1
              })]
            }), /*#__PURE__*/_jsxs("div", {
              className: "text-center",
              children: [/*#__PURE__*/_jsx("p", {
                className: "text-[10px] sm:text-xs uppercase font-black text-slate-500 mb-1",
                children: "Difficulty"
              }), /*#__PURE__*/_jsx("p", {
                className: `text-xl sm:text-2xl font-black ${selectionDifficulty === 'Active' ? 'text-green-400' : selectionDifficulty === 'Emerging' ? 'text-yellow-400' : 'text-red-400'}`,
                children: selectionDifficulty
              })]
            })]
          }), /*#__PURE__*/_jsx("div", {
            className: "mt-4 sm:mt-6",
            children: /*#__PURE__*/_jsx("button", {
              onClick: async () => {
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
                  // Generate new options for next word
                  const nextOptions = generateSelectionOptions(selectionWords[nextIndex], selectionWords);
                  // 🆕 V11.19: Validate options were generated
                  if (!nextOptions) {
                    alert('⚠️ Cannot generate options for next word. Ending exercise.');
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
                }
              },
              className: "w-full bg-green-600 hover:bg-green-500 text-white py-3 sm:py-4 rounded-xl sm:rounded-2xl font-black uppercase text-sm",
              children: selectionIndex < selectionWords.length - 1 ? 'Next Word →' : '✅ Finish'
            })
          })]
        }), /*#__PURE__*/_jsx("div", {
          className: "mt-6 bg-slate-800 rounded-full h-2 overflow-hidden",
          children: /*#__PURE__*/_jsx("div", {
            className: "bg-gradient-to-r from-green-500 to-teal-500 h-full transition-all duration-300",
            style: {
              width: `${(selectionIndex + 1) / selectionWords.length * 100}%`
            }
          })
        })]
      })
    }), showWriting && writingWords.length > 0 && /*#__PURE__*/_jsx("div", {
      className: "fixed inset-0 bg-black/95 z-[100] flex items-center justify-center p-2 sm:p-4 backdrop-blur-md overflow-y-auto",
      children: /*#__PURE__*/_jsxs("div", {
        className: "w-full max-w-4xl my-2 sm:my-8",
        children: [/*#__PURE__*/_jsx(ExerciseHeader, {
          title: "\u270D\uFE0F Writing",
          currentIndex: writingIndex,
          totalCount: writingWords.length,
          currentWord: writingWords[writingIndex].vocabulary,
          exerciseMode: exerciseMode,
          audioEnabled: false,
          onClose: () => {
            setShowWriting(false);
            setWritingWords([]);
            setWritingIndex(0);
            setWritingInput('');
            setShowWritingAnswer(false);
            setWritingDifficulty('');
            setWritingAttempts(0);
            setWritingAIResult(null);
          },
          onModeToggle: () => {
            setExerciseMode(exerciseMode === 'random' ? 'memory' : 'random');
            setShowWriting(false);
            setTimeout(() => loadWriting(), 100);
          },
          onAudioToggle: null,
          onDictionary: word => {
            setSelectedWordForDict(word);
            setShowDictionaryModal(true);
          },
          onEdit: () => {
            setEditingWord(writingWords[writingIndex]);
            setOriginalEditData({
              ...writingWords[writingIndex]
            });
            setShowAddModal(true);
          },
          onInfo: () => alert('✍️ WRITING EXERCISE\n\n📊 SCORING:\n✅ Exact match = Easy\n🤖 AI evaluates quality when not exact match:\n  • Active = Excellent answer (correct grammar, perfect fit)\n  • Emerging = Acceptable answer (minor issues, generally correct)\n  • Passive = Poor answer (significant errors)\n\n🎯 HOW TO PLAY:\n• Read the sentence with the blank\n• Write the correct word\n• Click 💡 Hint button (top-right of sentence) for help\n• Exact match → Easy (accepted immediately)\n• Non-exact → AI validates and scores Easy/Medium/Hard\n\n🎮 BUTTONS:\n• 🧠/🎲 = Toggle Memory/Random mode\n• 💡 = Show hint (in sentence panel)\n• 📖 = Open in dictionary\n• ℹ️ = Show this help\n• ✏️ = Edit current word\n• × = Close exercise\n• Check Answer = Verify your answer (uses AI if not exact match)\n• Next Word/Finish = Continue or complete')
        }), /*#__PURE__*/_jsxs("div", {
          className: "bg-gradient-to-br from-orange-600 to-red-600 rounded-3xl p-8 mb-6 shadow-2xl relative",
          children: [/*#__PURE__*/_jsx("button", {
            onClick: async () => {
              setShowWritingHint(true);
              await generateWritingHintMeaning(writingWords[writingIndex].vocabulary);
            },
            className: "absolute top-4 right-4 bg-yellow-500 hover:bg-yellow-400 text-white px-4 py-2 rounded-xl font-bold text-sm shadow-lg transition-all hover:scale-110",
            title: "Show hint",
            children: "\uD83D\uDCA1 Hint"
          }), /*#__PURE__*/_jsxs("div", {
            className: "text-center",
            children: [/*#__PURE__*/_jsx("h3", {
              className: "text-white/70 text-sm font-bold uppercase mb-4",
              children: "Complete the sentence:"
            }), /*#__PURE__*/_jsx("p", {
              className: "text-white text-2xl font-bold leading-relaxed",
              children: hideWordInContext(writingWords[writingIndex].context, writingWords[writingIndex].vocabulary)
            })]
          })]
        }), !showWritingAnswer ? /*#__PURE__*/_jsxs(_Fragment, {
          children: [/*#__PURE__*/_jsx("input", {
            type: "text",
            value: writingInput,
            onChange: e => setWritingInput(e.target.value),
            onKeyDown: async e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (!showWritingAnswer && writingInput.trim()) {
                  // First Enter: Check answer
                  const userAnswer = writingInput.trim().toLowerCase();
                  const correctAnswer = writingWords[writingIndex].vocabulary.toLowerCase();
                  if (userAnswer === correctAnswer) {
                    // Exact match - Easy
                    setWritingDifficulty('Active');
                    setWritingAttempts(prev => prev + 1);
                    setWritingAIResult({
                      is_correct: true,
                      explanation: 'Perfect! Exact match.',
                      score: 'Active'
                    });
                    setShowWritingAnswer(true);
                  } else {
                    // Not exact - validate with AI
                    const aiResult = await validateWritingWithAI(userAnswer, correctAnswer, writingWords[writingIndex].context);
                    if (aiResult) {
                      setWritingAIResult(aiResult);
                      setWritingDifficulty(aiResult.score || 'Passive');
                      setWritingAttempts(prev => prev + 1);
                      setShowWritingAnswer(true);
                    }
                  }
                } else if (showWritingAnswer) {
                  // Second Enter: Save and move to next word
                  try {
                    const currentWritingWord = writingWords[writingIndex];
                    await supabase.from('vocabulary_v4').update({
                      difficulty: writingDifficulty,
                      writing_count: (currentWritingWord.writing_count || 0) + 1,
                      last_practiced_date: new Date().toISOString()
                    }).eq('id', currentWritingWord.id);
                  } catch (error) {
                    console.error('Error saving difficulty:', error);
                  }
                  if (writingIndex < writingWords.length - 1) {
                    setWritingIndex(writingIndex + 1);
                    setWritingInput('');
                    setShowWritingAnswer(false);
                    setWritingAttempts(0);
                    setWritingDifficulty('');
                    setWritingAIResult(null);
                  } else {
                    alert('🎉 Exercise completed!');
                    setShowWriting(false);
                    setWritingWords([]);
                    setWritingIndex(0);
                    setWritingInput('');
                    setShowWritingAnswer(false);
                    setWritingAttempts(0);
                    setWritingDifficulty('');
                    setWritingAIResult(null);
                  }
                }
              }
            },
            placeholder: "Write your answer here...",
            className: "w-full p-6 rounded-xl text-lg text-center mb-4 font-bold",
            autoFocus: true
          }), /*#__PURE__*/_jsxs("div", {
            className: "flex gap-4",
            children: [/*#__PURE__*/_jsx("button", {
              onClick: async () => {
                if (!writingInput.trim()) return;
                const userAnswer = writingInput.trim().toLowerCase();
                const correctAnswer = writingWords[writingIndex].vocabulary.toLowerCase();
                if (userAnswer === correctAnswer) {
                  // Exact match - Easy
                  setWritingDifficulty('Active');
                  setWritingAttempts(prev => prev + 1);
                  setWritingAIResult({
                    is_correct: true,
                    explanation: 'Perfect! Exact match.',
                    score: 'Active'
                  });
                  setShowWritingAnswer(true);
                } else {
                  // Not exact - validate with AI
                  const aiResult = await validateWritingWithAI(userAnswer, correctAnswer, writingWords[writingIndex].context);
                  if (aiResult) {
                    setWritingAIResult(aiResult);
                    // 🆕 V11.18: Use AI's score evaluation directly (Easy/Medium/Hard)
                    setWritingDifficulty(aiResult.score || 'Passive');
                    setWritingAttempts(prev => prev + 1);
                    setShowWritingAnswer(true);
                  }
                }
              },
              disabled: writingAIValidating || !writingInput.trim(),
              className: "flex-1 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white py-4 rounded-2xl font-black uppercase text-sm",
              children: writingAIValidating ? '🤖 AI Validating...' : '✅ Check Answer'
            }), /*#__PURE__*/_jsx("button", {
              onClick: () => {
                // Skip to next word
                if (writingIndex < writingWords.length - 1) {
                  setWritingIndex(writingIndex + 1);
                  setWritingInput('');
                  setShowWritingAnswer(false);
                  setWritingDifficulty('');
                  setWritingAttempts(0);
                  setWritingAIResult(null);
                } else {
                  alert('🎉 Exercise completed!');
                  setShowWriting(false);
                  setWritingWords([]);
                  setWritingIndex(0);
                  setWritingInput('');
                  setShowWritingAnswer(false);
                  setWritingDifficulty('');
                  setWritingAttempts(0);
                  setWritingAIResult(null);
                }
              },
              className: "px-6 bg-slate-700 hover:bg-slate-600 text-white py-4 rounded-2xl font-black uppercase text-sm",
              children: "\u23ED\uFE0F Skip"
            })]
          })]
        }) : /*#__PURE__*/_jsxs(_Fragment, {
          children: [/*#__PURE__*/_jsxs("div", {
            className: "space-y-6",
            children: [writingAIResult && /*#__PURE__*/_jsxs("div", {
              className: `p-6 rounded-2xl border-2 ${writingAIResult.is_correct ? 'bg-green-900/20 border-green-500' : 'bg-red-900/20 border-red-500'}`,
              children: [/*#__PURE__*/_jsxs("div", {
                className: "flex items-center gap-3 mb-3",
                children: [/*#__PURE__*/_jsx("span", {
                  className: "text-3xl",
                  children: writingAIResult.is_correct ? '✅' : '❌'
                }), /*#__PURE__*/_jsx("h4", {
                  className: "text-xl font-black text-white",
                  children: writingAIResult.is_correct ? 'Correct!' : 'Incorrect'
                })]
              }), /*#__PURE__*/_jsx("p", {
                className: "text-white/90 text-sm leading-relaxed",
                children: writingAIResult.explanation
              })]
            }), /*#__PURE__*/_jsxs("div", {
              className: "grid grid-cols-2 gap-4",
              children: [/*#__PURE__*/_jsxs("div", {
                children: [/*#__PURE__*/_jsx("h4", {
                  className: "text-xs uppercase font-black text-slate-500 mb-2",
                  children: "Your Answer:"
                }), /*#__PURE__*/_jsx("div", {
                  className: "bg-slate-800 p-4 rounded-xl text-lg text-white font-bold",
                  children: writingInput || '(empty)'
                })]
              }), /*#__PURE__*/_jsxs("div", {
                children: [/*#__PURE__*/_jsx("h4", {
                  className: "text-xs uppercase font-black text-green-400 mb-2",
                  children: "Correct Answer:"
                }), /*#__PURE__*/_jsx("div", {
                  className: "bg-green-900/20 border border-green-500/30 p-4 rounded-xl text-lg text-green-100 font-bold",
                  children: writingWords[writingIndex].vocabulary
                })]
              })]
            }), /*#__PURE__*/_jsxs("div", {
              className: "flex justify-center items-center gap-4 p-4 bg-slate-800/50 rounded-2xl",
              children: [/*#__PURE__*/_jsxs("div", {
                className: "text-center",
                children: [/*#__PURE__*/_jsx("p", {
                  className: "text-xs uppercase font-black text-slate-500 mb-1",
                  children: "Attempts"
                }), /*#__PURE__*/_jsx("p", {
                  className: "text-2xl font-black text-white",
                  children: writingAttempts
                })]
              }), /*#__PURE__*/_jsxs("div", {
                className: "text-center",
                children: [/*#__PURE__*/_jsx("p", {
                  className: "text-xs uppercase font-black text-slate-500 mb-1",
                  children: "Difficulty"
                }), /*#__PURE__*/_jsx("p", {
                  className: `text-2xl font-black ${writingDifficulty === 'Active' ? 'text-green-400' : writingDifficulty === 'Emerging' ? 'text-yellow-400' : 'text-red-400'}`,
                  children: writingDifficulty
                })]
              })]
            })]
          }), /*#__PURE__*/_jsx("div", {
            className: "mt-6",
            children: /*#__PURE__*/_jsx("button", {
              onClick: async () => {
                // Save difficulty
                try {
                  const currentWritingWord = writingWords[writingIndex];
                  await supabase.from('vocabulary_v4').update({
                    difficulty: writingDifficulty,
                    writing_count: (currentWritingWord.writing_count || 0) + 1,
                    last_practiced_date: new Date().toISOString()
                  }).eq('id', currentWritingWord.id);
                } catch (error) {
                  console.error('Error saving difficulty:', error);
                }
                if (writingIndex < writingWords.length - 1) {
                  setWritingIndex(writingIndex + 1);
                  setWritingInput('');
                  setShowWritingAnswer(false);
                  setWritingDifficulty('');
                  setWritingAttempts(0);
                  setWritingAIResult(null);
                } else {
                  alert('🎉 Exercise completed!');
                  setShowWriting(false);
                  setWritingWords([]);
                  setWritingIndex(0);
                  setWritingInput('');
                  setShowWritingAnswer(false);
                  setWritingDifficulty('');
                  setWritingAttempts(0);
                  setWritingAIResult(null);
                }
              },
              className: "w-full bg-orange-600 hover:bg-orange-500 text-white py-4 rounded-2xl font-black uppercase text-sm",
              children: writingIndex < writingWords.length - 1 ? 'Next Word →' : '✅ Finish'
            })
          })]
        }), /*#__PURE__*/_jsx("div", {
          className: "mt-6 bg-slate-800 rounded-full h-2 overflow-hidden",
          children: /*#__PURE__*/_jsx("div", {
            className: "bg-gradient-to-r from-orange-500 to-red-500 h-full transition-all duration-300",
            style: {
              width: `${(writingIndex + 1) / writingWords.length * 100}%`
            }
          })
        })]
      })
    }), showWritingHint && writingWords.length > 0 && /*#__PURE__*/_jsx("div", {
      className: "fixed inset-0 bg-black/80 z-[150] flex items-center justify-center p-4",
      onClick: () => setShowWritingHint(false),
      children: /*#__PURE__*/_jsxs("div", {
        className: "bg-slate-900 rounded-3xl p-8 max-w-md w-full shadow-2xl border border-yellow-500/30",
        onClick: e => e.stopPropagation(),
        children: [/*#__PURE__*/_jsxs("div", {
          className: "flex justify-between items-center mb-6",
          children: [/*#__PURE__*/_jsx("h3", {
            className: "text-2xl font-black text-yellow-400 flex items-center gap-2",
            children: "\uD83D\uDCA1 Hint"
          }), /*#__PURE__*/_jsx("button", {
            onClick: () => setShowWritingHint(false),
            className: "text-slate-400 hover:text-white text-3xl",
            children: "\xD7"
          })]
        }), /*#__PURE__*/_jsxs("div", {
          className: "space-y-6",
          children: [/*#__PURE__*/_jsxs("div", {
            children: [/*#__PURE__*/_jsx("p", {
              className: "text-xs uppercase font-black text-slate-500 mb-2",
              children: "First Letter"
            }), /*#__PURE__*/_jsxs("p", {
              className: "text-6xl font-black text-white",
              children: [writingWords[writingIndex].vocabulary[0].toUpperCase(), /*#__PURE__*/_jsx("span", {
                className: "text-slate-700",
                children: "______"
              })]
            })]
          }), /*#__PURE__*/_jsxs("div", {
            children: [/*#__PURE__*/_jsx("p", {
              className: "text-xs uppercase font-black text-slate-500 mb-2",
              children: "Meaning"
            }), writingHintLoading ? /*#__PURE__*/_jsxs("div", {
              className: "flex items-center gap-2 text-yellow-400",
              children: [/*#__PURE__*/_jsx("i", {
                className: "fas fa-spinner fa-spin"
              }), /*#__PURE__*/_jsx("span", {
                className: "text-sm",
                children: "Generating meaning..."
              })]
            }) : /*#__PURE__*/_jsx("p", {
              className: "text-lg text-yellow-300 leading-relaxed",
              children: writingHintMeaning || 'Click the Hint button to generate meaning.'
            })]
          }), /*#__PURE__*/_jsxs("div", {
            children: [/*#__PURE__*/_jsx("p", {
              className: "text-xs uppercase font-black text-slate-500 mb-2",
              children: "Family"
            }), /*#__PURE__*/_jsx("p", {
              className: "text-2xl font-bold text-yellow-300",
              children: writingWords[writingIndex].family || 'Not specified'
            })]
          })]
        }), /*#__PURE__*/_jsx("button", {
          onClick: () => setShowWritingHint(false),
          className: "w-full mt-6 bg-yellow-600 hover:bg-yellow-500 text-white py-3 rounded-xl font-black uppercase text-sm",
          children: "Close"
        })]
      })
    }), showTranslation && translationWords.length > 0 && /*#__PURE__*/_jsx("div", {
      className: "fixed inset-0 bg-black/95 z-[100] flex items-center justify-center p-2 sm:p-4 backdrop-blur-md overflow-y-auto",
      children: /*#__PURE__*/_jsxs("div", {
        className: "w-full max-w-4xl my-2 sm:my-8",
        children: [/*#__PURE__*/_jsx(ExerciseHeader, {
          title: "\uD83C\uDF10 Translation",
          currentIndex: translationIndex,
          totalCount: translationWords.length,
          currentWord: translationWords[translationIndex].vocabulary,
          exerciseMode: exerciseMode,
          audioEnabled: false,
          onClose: () => {
            setShowTranslation(false);
            setTranslationWords([]);
            setTranslationIndex(0);
            setTranslationSpanish('');
            setTranslationInput('');
            setShowTranslationAnswer(false);
            setTranslationDifficulty('');
            setTranslationAttempts(0);
            setTranslationAIResult(null);
          },
          onModeToggle: () => {
            setExerciseMode(exerciseMode === 'random' ? 'memory' : 'random');
            setShowTranslation(false);
            setTimeout(() => loadTranslation(), 100);
          },
          onAudioToggle: null,
          onDictionary: word => {
            setSelectedWordForDict(word);
            setShowDictionaryModal(true);
          },
          onEdit: () => {
            setEditingWord(translationWords[translationIndex]);
            setOriginalEditData({
              ...translationWords[translationIndex]
            });
            setShowAddModal(true);
          },
          onInfo: () => alert('🌐 TRANSLATION EXERCISE\n\n📊 CAMBRIDGE GRADING (V11.38):\n🟢 C1/C2 (Easy): 0 errors - Perfect! 90-100%\n  • C2 = Very sophisticated grammar\n  • C1 = Advanced grammar\n🟡 B2 (Medium): 1 error - Good, minor mistake, 70-85%\n🔴 B1 (Hard): 2+ errors - Needs practice, 40-65%\n\n⚡ IMPORTANT:\n  Easy/Medium/Passive = Your memorization difficulty\n  Cambridge level = English proficiency grade\n\n✅ Exact match = AI evaluates C1 or C2\n\n🎯 HOW TO PLAY:\n• Read Spanish translation\n• Translate to English\n• Type OR use 🎤 voice\n• Press ENTER to check\n• Get Cambridge evaluation\n• Detailed feedback on ENGLISH errors only\n\n🎤 VOICE TO TEXT:\n• Click microphone 🎤\n• Speak English translation\n• Text appears automatically\n• 📱 Mobile: Enable mic in browser settings\n\n🎮 BUTTONS:\n• 🧠/🎲 = Memory/Random\n• 🎤 = Voice input\n• 📖 = Dictionary\n• ✏️ = Edit word\n• × = Close\n• Check Translation = Evaluate\n• Next/Finish = Continue')
        }), /*#__PURE__*/_jsx("div", {
          className: "bg-gradient-to-br from-pink-600 to-purple-600 rounded-3xl p-8 mb-6 shadow-2xl",
          children: /*#__PURE__*/_jsxs("div", {
            className: "text-center",
            children: [/*#__PURE__*/_jsx("h3", {
              className: "text-white/70 text-sm font-bold uppercase mb-4",
              children: "Translate to English:"
            }), translationLoading ? /*#__PURE__*/_jsxs("div", {
              className: "flex items-center justify-center gap-3 text-white",
              children: [/*#__PURE__*/_jsx("i", {
                className: "fas fa-spinner fa-spin text-2xl"
              }), /*#__PURE__*/_jsx("span", {
                className: "text-xl",
                children: "Generating Spanish translation..."
              })]
            }) : /*#__PURE__*/_jsx("p", {
              className: "text-white text-2xl font-bold leading-relaxed",
              children: translationSpanish
            })]
          })
        }), !showTranslationAnswer ? /*#__PURE__*/_jsxs(_Fragment, {
          children: [/*#__PURE__*/_jsxs("div", {
            className: "relative mb-4",
            children: [/*#__PURE__*/_jsx("textarea", {
              value: translationInput,
              onChange: e => setTranslationInput(e.target.value),
              onKeyDown: async e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (!showTranslationAnswer && translationInput.trim()) {
                    // First Enter: Validate translation
                    const aiResult = await validateTranslationWithAI(translationInput, translationWords[translationIndex].context, translationSpanish);
                    if (aiResult) {
                      setTranslationAIResult(aiResult);
                      setTranslationDifficulty(aiResult.score || 'Passive');
                      setTranslationAttempts(prev => prev + 1);
                      setShowTranslationAnswer(true);
                    }
                  }
                  // Second Enter is handled by useEffect
                }
              },
              placeholder: "Write your English translation here... (Press ENTER to check)",
              className: "w-full p-6 pr-16 rounded-xl text-lg min-h-[120px] resize-none",
              autoFocus: true
            }), /*#__PURE__*/_jsx("button", {
              onClick: () => startTranslationVoiceRecognition(),
              disabled: translationVoiceListening,
              className: `absolute top-3 right-3 p-3 rounded-lg transition-all ${translationVoiceListening ? 'bg-red-500 animate-pulse' : 'bg-blue-500 hover:bg-blue-600'}`,
              title: translationVoiceListening ? "Listening..." : "Voice to text",
              children: /*#__PURE__*/_jsx("i", {
                className: `fas ${translationVoiceListening ? 'fa-microphone-slash' : 'fa-microphone'} text-white text-xl`
              })
            })]
          }), /*#__PURE__*/_jsxs("div", {
            className: "flex gap-4",
            children: [/*#__PURE__*/_jsx("button", {
              onClick: async () => {
                if (!translationInput.trim()) return;
                const aiResult = await validateTranslationWithAI(translationInput, translationWords[translationIndex].context, translationSpanish);
                if (aiResult) {
                  setTranslationAIResult(aiResult);
                  setTranslationDifficulty(aiResult.score || 'Passive');
                  setTranslationAttempts(prev => prev + 1);
                  setShowTranslationAnswer(true);
                }
              },
              disabled: translationAIValidating || !translationInput.trim(),
              className: "flex-1 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white py-4 rounded-2xl font-black uppercase text-sm",
              children: translationAIValidating ? '🤖 Cambridge Examiner Evaluating...' : '✅ Check Translation'
            }), /*#__PURE__*/_jsx("button", {
              onClick: async () => {
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
                }
              },
              className: "px-6 bg-slate-700 hover:bg-slate-600 text-white py-4 rounded-2xl font-black uppercase text-sm",
              children: "\u23ED\uFE0F Skip"
            })]
          })]
        }) : /*#__PURE__*/_jsxs(_Fragment, {
          children: [translationAIResult && /*#__PURE__*/_jsxs("div", {
            className: "space-y-6",
            children: [/*#__PURE__*/_jsx("div", {
              className: "flex justify-center",
              children: /*#__PURE__*/_jsxs("div", {
                className: `inline-flex items-center gap-3 px-8 py-4 rounded-2xl border-2 ${translationAIResult.grade === 'A' ? 'bg-green-900/20 border-green-500' : translationAIResult.grade === 'B' ? 'bg-yellow-900/20 border-yellow-500' : 'bg-red-900/20 border-red-500'}`,
                children: [/*#__PURE__*/_jsx("span", {
                  className: "text-4xl",
                  children: translationAIResult.grade === 'A' ? '🏆' : translationAIResult.grade === 'B' ? '⭐' : '📝'
                }), /*#__PURE__*/_jsxs("div", {
                  children: [/*#__PURE__*/_jsxs("p", {
                    className: `text-3xl font-black ${translationAIResult.grade === 'A' ? 'text-green-400' : translationAIResult.grade === 'B' ? 'text-yellow-400' : 'text-red-400'}`,
                    children: ["Grade ", translationAIResult.grade]
                  }), /*#__PURE__*/_jsxs("p", {
                    className: "text-white text-sm",
                    children: [translationAIResult.percentage, "% - Cambridge Assessment"]
                  })]
                })]
              })
            }), translationAIResult.grammar_errors && translationAIResult.grammar_errors.length > 0 || translationAIResult.vocabulary_issues && translationAIResult.vocabulary_issues.length > 0 ? /*#__PURE__*/_jsxs("div", {
              className: "bg-slate-900/50 border border-slate-700 rounded-2xl p-6",
              children: [/*#__PURE__*/_jsxs("h4", {
                className: "text-slate-300 font-bold uppercase text-sm mb-4 flex items-center gap-2",
                children: [/*#__PURE__*/_jsx("span", {
                  className: "text-2xl",
                  children: "\uD83D\uDD0D"
                }), "Errors Found"]
              }), /*#__PURE__*/_jsxs("div", {
                className: "space-y-4",
                children: [translationAIResult.grammar_errors && translationAIResult.grammar_errors.map((error, i) => /*#__PURE__*/_jsx("div", {
                  className: "bg-red-900/20 border-l-4 border-red-500 rounded-r-lg p-4",
                  children: /*#__PURE__*/_jsxs("div", {
                    className: "flex items-start gap-3",
                    children: [/*#__PURE__*/_jsx("span", {
                      className: "text-2xl shrink-0",
                      children: "\u26A0\uFE0F"
                    }), /*#__PURE__*/_jsxs("div", {
                      className: "flex-1",
                      children: [/*#__PURE__*/_jsx("p", {
                        className: "text-red-300 font-bold text-xs uppercase mb-2",
                        children: "Grammar Error"
                      }), /*#__PURE__*/_jsx("p", {
                        className: "text-red-100 text-sm leading-relaxed",
                        children: error
                      })]
                    })]
                  })
                }, `grammar-${i}`)), translationAIResult.vocabulary_issues && translationAIResult.vocabulary_issues.map((issue, i) => /*#__PURE__*/_jsx("div", {
                  className: "bg-yellow-900/20 border-l-4 border-yellow-500 rounded-r-lg p-4",
                  children: /*#__PURE__*/_jsxs("div", {
                    className: "flex items-start gap-3",
                    children: [/*#__PURE__*/_jsx("span", {
                      className: "text-2xl shrink-0",
                      children: "\uD83D\uDCDD"
                    }), /*#__PURE__*/_jsxs("div", {
                      className: "flex-1",
                      children: [/*#__PURE__*/_jsx("p", {
                        className: "text-yellow-300 font-bold text-xs uppercase mb-2",
                        children: "Vocabulary Issue"
                      }), /*#__PURE__*/_jsx("p", {
                        className: "text-yellow-100 text-sm leading-relaxed",
                        children: issue
                      })]
                    })]
                  })
                }, `vocab-${i}`))]
              })]
            }) :
            /*#__PURE__*/
            // Perfect translation
            _jsx("div", {
              className: "bg-green-900/20 border border-green-500/30 rounded-2xl p-6",
              children: /*#__PURE__*/_jsxs("div", {
                className: "flex items-center gap-3",
                children: [/*#__PURE__*/_jsx("span", {
                  className: "text-4xl",
                  children: "\uD83C\uDF89"
                }), /*#__PURE__*/_jsxs("div", {
                  children: [/*#__PURE__*/_jsx("p", {
                    className: "text-green-300 font-bold text-lg",
                    children: "Perfect Translation!"
                  }), /*#__PURE__*/_jsx("p", {
                    className: "text-green-200 text-sm",
                    children: "No errors found. Excellent work!"
                  })]
                })]
              })
            }), /*#__PURE__*/_jsxs("div", {
              className: "grid grid-cols-1 md:grid-cols-2 gap-4",
              children: [/*#__PURE__*/_jsxs("div", {
                children: [/*#__PURE__*/_jsx("h4", {
                  className: "text-xs uppercase font-black text-slate-500 mb-2",
                  children: "Your Translation:"
                }), /*#__PURE__*/_jsx("div", {
                  className: "bg-slate-800 p-4 rounded-xl text-base text-white",
                  children: translationInput
                })]
              }), /*#__PURE__*/_jsxs("div", {
                children: [/*#__PURE__*/_jsx("h4", {
                  className: "text-xs uppercase font-black text-indigo-400 mb-2",
                  children: "Original English:"
                }), /*#__PURE__*/_jsx("div", {
                  className: "bg-indigo-900/20 border border-indigo-500/30 p-4 rounded-xl text-base text-indigo-100",
                  children: translationWords[translationIndex].context
                })]
              })]
            })]
          }), /*#__PURE__*/_jsx("div", {
            className: "mt-6",
            children: /*#__PURE__*/_jsx("button", {
              onClick: async () => {
                // Save difficulty
                try {
                  const currentTranslationWord = translationWords[translationIndex];
                  await supabase.from('vocabulary_v4').update({
                    difficulty: translationDifficulty,
                    translation_count: (currentTranslationWord.translation_count || 0) + 1,
                    translation_best_grade: (translationAIResult === null || translationAIResult === void 0 ? void 0 : translationAIResult.grade) || currentTranslationWord.translation_best_grade,
                    last_practiced_date: new Date().toISOString()
                  }).eq('id', currentTranslationWord.id);
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
                }
              },
              className: "w-full bg-pink-600 hover:bg-pink-500 text-white py-4 rounded-2xl font-black uppercase text-sm",
              children: translationIndex < translationWords.length - 1 ? 'Next Word →' : '✅ Finish'
            })
          })]
        }), /*#__PURE__*/_jsx("div", {
          className: "mt-6 bg-slate-800 rounded-full h-2 overflow-hidden",
          children: /*#__PURE__*/_jsx("div", {
            className: "bg-gradient-to-r from-pink-500 to-purple-500 h-full transition-all duration-300",
            style: {
              width: `${(translationIndex + 1) / translationWords.length * 100}%`
            }
          })
        })]
      })
    }), showStats && /*#__PURE__*/_jsx("div", {
      className: "fixed inset-0 bg-black/95 z-[100] flex items-center justify-center p-4 backdrop-blur-md overflow-y-auto",
      children: /*#__PURE__*/_jsxs("div", {
        className: "glass-card p-10 rounded-[2.5rem] w-full max-w-6xl border-indigo-500/30 max-h-[90vh] overflow-y-auto custom-scroll",
        children: [/*#__PURE__*/_jsxs("div", {
          className: "flex justify-between items-center mb-8",
          children: [/*#__PURE__*/_jsxs("div", {
            className: "flex items-center gap-3",
            children: [/*#__PURE__*/_jsx("h2", {
              className: "text-3xl font-black main-gradient uppercase italic",
              children: "\uD83D\uDCCA Statistics Dashboard"
            }), /*#__PURE__*/_jsx("button", {
              onClick: () => alert('ℹ️ HOW EFFORT LEVELS WORK\n\n🎯 SYSTEM: Single "Difficulty" level per word\n\n📝 UPDATES:\n• Each exercise you complete updates the word\'s effort level\n• The LAST exercise result overwrites previous level\n• Example: Flashcard (Active) → Dictation fails (Passive) → Level becomes Passive\n\n💡 THIS MEANS:\n• "Difficulty" filter shows current overall difficulty\n• Not exercise-specific (coming in future version)\n• Stats show average performance per exercise\n\n📊 DIFFICULT WORDS CRITERIA:\n🎴 Flashcards: Passive/Emerging + practiced\n🎤 Dictation: Avg >2 errors per attempt\n✓ Selection: Avg >2 attempts per question  \n✏️ Writing: Passive/Emerging + practiced\n🌐 Translation: B1/B2 Cambridge grade\n\n💾 BACKUPS:\n✅ All exercise data saved in JSON/CSV exports\n✅ Includes: counts, errors, grades, dates\n\n📌 Click exercise lines to practice difficult words!'),
              className: "text-blue-400 hover:text-blue-300 text-xl",
              title: "How Effort levels work",
              children: "\u2139\uFE0F"
            })]
          }), /*#__PURE__*/_jsx("button", {
            onClick: () => setShowStats(false),
            className: "text-slate-400 hover:text-white text-3xl",
            children: "\xD7"
          })]
        }), statsData ? /*#__PURE__*/_jsxs("div", {
          className: "space-y-8",
          children: [/*#__PURE__*/_jsxs("div", {
            className: "grid grid-cols-2 md:grid-cols-4 gap-4",
            children: [/*#__PURE__*/_jsxs("div", {
              className: "glass-card rounded-xl p-4 text-center",
              children: [/*#__PURE__*/_jsx("p", {
                className: "text-slate-400 text-xs uppercase font-bold mb-2",
                children: "Total Words"
              }), /*#__PURE__*/_jsx("p", {
                className: "text-white text-4xl font-black",
                children: statsData.overview.total
              })]
            }), /*#__PURE__*/_jsxs("div", {
              className: "glass-card rounded-xl p-4 text-center",
              children: [/*#__PURE__*/_jsx("p", {
                className: "text-slate-400 text-xs uppercase font-bold mb-2",
                children: "Practiced"
              }), /*#__PURE__*/_jsx("p", {
                className: "text-green-400 text-4xl font-black",
                children: statsData.overview.practiced
              }), /*#__PURE__*/_jsxs("p", {
                className: "text-green-300 text-xs mt-1",
                children: [statsData.overview.practicedPercent, "%"]
              })]
            }), /*#__PURE__*/_jsxs("div", {
              className: "glass-card rounded-xl p-4 text-center",
              children: [/*#__PURE__*/_jsx("p", {
                className: "text-slate-400 text-xs uppercase font-bold mb-2",
                children: "Pending"
              }), /*#__PURE__*/_jsx("p", {
                className: "text-yellow-400 text-4xl font-black",
                children: statsData.overview.pending
              })]
            }), /*#__PURE__*/_jsxs("div", {
              className: "glass-card rounded-xl p-4 text-center",
              children: [/*#__PURE__*/_jsx("p", {
                className: "text-slate-400 text-xs uppercase font-bold mb-2",
                children: "Favourites"
              }), /*#__PURE__*/_jsx("p", {
                className: "text-purple-400 text-4xl font-black",
                children: statsData.overview.favourites
              })]
            })]
          }), /*#__PURE__*/_jsxs("div", {
            className: "glass-card rounded-2xl p-6",
            children: [/*#__PURE__*/_jsx("h3", {
              className: "text-xl font-black text-white mb-4",
              children: "Difficulty Distribution"
            }), /*#__PURE__*/_jsxs("div", {
              className: "grid grid-cols-2 md:grid-cols-4 gap-4",
              children: [/*#__PURE__*/_jsxs("div", {
                className: "text-center tooltip",
                "data-tip": "Active: Retrieves the word instantly. Speak without thinking.",
                children: [/*#__PURE__*/_jsx("p", {
                  className: "text-5xl mb-2",
                  children: "\uD83D\uDFE2"
                }), /*#__PURE__*/_jsx("p", {
                  className: "text-white text-2xl font-bold",
                  children: statsData.difficulty.easy
                }), /*#__PURE__*/_jsx("p", {
                  className: "text-green-400 text-sm",
                  children: "Active"
                })]
              }), /*#__PURE__*/_jsxs("div", {
                className: "text-center tooltip",
                "data-tip": "Emerging: Searches for the word in your mental archive. Write a formal email calmly.",
                children: [/*#__PURE__*/_jsx("p", {
                  className: "text-5xl mb-2",
                  children: "\uD83D\uDFE1"
                }), /*#__PURE__*/_jsx("p", {
                  className: "text-white text-2xl font-bold",
                  children: statsData.difficulty.medium
                }), /*#__PURE__*/_jsx("p", {
                  className: "text-yellow-400 text-sm",
                  children: "Emerging"
                })]
              }), /*#__PURE__*/_jsxs("div", {
                className: "text-center tooltip",
                "data-tip": "Passive: Decodes others' messages. Read a New York Times article.",
                children: [/*#__PURE__*/_jsx("p", {
                  className: "text-5xl mb-2",
                  children: "\uD83D\uDD34"
                }), /*#__PURE__*/_jsx("p", {
                  className: "text-white text-2xl font-bold",
                  children: statsData.difficulty.hard
                }), /*#__PURE__*/_jsx("p", {
                  className: "text-red-400 text-sm",
                  children: "Passive"
                })]
              }), /*#__PURE__*/_jsxs("div", {
                className: "text-center",
                children: [/*#__PURE__*/_jsx("p", {
                  className: "text-5xl mb-2",
                  children: "\u26AA"
                }), /*#__PURE__*/_jsx("p", {
                  className: "text-white text-2xl font-bold",
                  children: statsData.difficulty.notPracticed
                }), /*#__PURE__*/_jsx("p", {
                  className: "text-slate-400 text-sm",
                  children: "Not Practiced"
                })]
              })]
            })]
          }), /*#__PURE__*/_jsxs("div", {
            className: "glass-card rounded-2xl p-6",
            children: [/*#__PURE__*/_jsxs("h3", {
              className: "text-xl font-black text-white mb-4",
              children: ["Exercise Statistics ", /*#__PURE__*/_jsx("span", {
                className: "text-sm text-slate-400 font-normal",
                children: "(Click to practice difficult words)"
              })]
            }), /*#__PURE__*/_jsxs("div", {
              className: "space-y-4",
              children: [/*#__PURE__*/_jsxs("button", {
                onClick: () => openExerciseDrillDown('flashcard'),
                className: "w-full flex justify-between items-center bg-purple-900/20 hover:bg-purple-900/40 p-4 rounded-xl transition-all cursor-pointer border border-transparent hover:border-purple-500",
                children: [/*#__PURE__*/_jsx("span", {
                  className: "text-white font-bold",
                  children: "\uD83C\uDFB4 Flashcards"
                }), /*#__PURE__*/_jsxs("span", {
                  className: "text-purple-300 text-lg font-bold",
                  children: [statsData.exercises.flashcard, " practiced"]
                })]
              }), /*#__PURE__*/_jsxs("button", {
                onClick: () => openExerciseDrillDown('dictation'),
                className: "w-full flex justify-between items-center bg-blue-900/20 hover:bg-blue-900/40 p-4 rounded-xl transition-all cursor-pointer border border-transparent hover:border-blue-500",
                children: [/*#__PURE__*/_jsx("span", {
                  className: "text-white font-bold",
                  children: "\uD83C\uDFA4 Dictation"
                }), /*#__PURE__*/_jsxs("span", {
                  className: "text-blue-300 text-lg font-bold",
                  children: [statsData.exercises.dictation.count, " practiced \u2022 Avg ", statsData.exercises.dictation.avgErrors, " errors/attempt"]
                })]
              }), /*#__PURE__*/_jsxs("button", {
                onClick: () => openExerciseDrillDown('selection'),
                className: "w-full flex justify-between items-center bg-green-900/20 hover:bg-green-900/40 p-4 rounded-xl transition-all cursor-pointer border border-transparent hover:border-green-500",
                children: [/*#__PURE__*/_jsx("span", {
                  className: "text-white font-bold",
                  children: "\u2713 Selection"
                }), /*#__PURE__*/_jsxs("span", {
                  className: "text-green-300 text-lg font-bold",
                  children: [statsData.exercises.selection.count, " practiced \u2022 Avg ", statsData.exercises.selection.avgAttempts, " attempts/word"]
                })]
              }), /*#__PURE__*/_jsxs("button", {
                onClick: () => openExerciseDrillDown('writing'),
                className: "w-full flex justify-between items-center bg-orange-900/20 hover:bg-orange-900/40 p-4 rounded-xl transition-all cursor-pointer border border-transparent hover:border-orange-500",
                children: [/*#__PURE__*/_jsx("span", {
                  className: "text-white font-bold",
                  children: "\u270F\uFE0F Writing"
                }), /*#__PURE__*/_jsxs("span", {
                  className: "text-orange-300 text-lg font-bold",
                  children: [statsData.exercises.writing, " practiced"]
                })]
              }), /*#__PURE__*/_jsxs("button", {
                onClick: () => openExerciseDrillDown('translation'),
                className: "w-full bg-pink-900/20 hover:bg-pink-900/40 p-4 rounded-xl transition-all cursor-pointer border border-transparent hover:border-pink-500",
                children: [/*#__PURE__*/_jsxs("div", {
                  className: "flex justify-between items-center mb-2",
                  children: [/*#__PURE__*/_jsx("span", {
                    className: "text-white font-bold",
                    children: "\uD83C\uDF0D Translation"
                  }), /*#__PURE__*/_jsxs("span", {
                    className: "text-pink-300 text-lg font-bold",
                    children: [statsData.exercises.translation.count, " practiced"]
                  })]
                }), /*#__PURE__*/_jsxs("div", {
                  className: "grid grid-cols-4 gap-2 mt-3",
                  children: [/*#__PURE__*/_jsxs("div", {
                    className: "text-center",
                    children: [/*#__PURE__*/_jsx("p", {
                      className: "text-green-300 text-xl font-bold",
                      children: statsData.exercises.translation.gradeC2
                    }), /*#__PURE__*/_jsx("p", {
                      className: "text-xs text-green-400",
                      children: "C2"
                    })]
                  }), /*#__PURE__*/_jsxs("div", {
                    className: "text-center",
                    children: [/*#__PURE__*/_jsx("p", {
                      className: "text-blue-300 text-xl font-bold",
                      children: statsData.exercises.translation.gradeC1
                    }), /*#__PURE__*/_jsx("p", {
                      className: "text-xs text-blue-400",
                      children: "C1"
                    })]
                  }), /*#__PURE__*/_jsxs("div", {
                    className: "text-center",
                    children: [/*#__PURE__*/_jsx("p", {
                      className: "text-yellow-300 text-xl font-bold",
                      children: statsData.exercises.translation.gradeB2
                    }), /*#__PURE__*/_jsx("p", {
                      className: "text-xs text-yellow-400",
                      children: "B2"
                    })]
                  }), /*#__PURE__*/_jsxs("div", {
                    className: "text-center",
                    children: [/*#__PURE__*/_jsx("p", {
                      className: "text-orange-300 text-xl font-bold",
                      children: statsData.exercises.translation.gradeB1
                    }), /*#__PURE__*/_jsx("p", {
                      className: "text-xs text-orange-400",
                      children: "B1"
                    })]
                  })]
                })]
              })]
            })]
          }), /*#__PURE__*/_jsxs("div", {
            className: "grid grid-cols-1 md:grid-cols-2 gap-6",
            children: [/*#__PURE__*/_jsxs("div", {
              className: "glass-card rounded-2xl p-6",
              children: [/*#__PURE__*/_jsx("h3", {
                className: "text-xl font-black text-white mb-4",
                children: "\uD83C\uDFA4 Hardest Words (Dictation)"
              }), /*#__PURE__*/_jsx("div", {
                className: "space-y-2",
                children: statsData.hardest.byErrors.slice(0, 10).map((item, i) => /*#__PURE__*/_jsxs("div", {
                  className: "flex justify-between items-center bg-slate-800/50 p-3 rounded-lg",
                  children: [/*#__PURE__*/_jsx("span", {
                    className: "text-white font-bold",
                    children: item.word
                  }), /*#__PURE__*/_jsxs("span", {
                    className: "text-red-400",
                    children: [item.errors.toFixed(2), " errors/attempt"]
                  })]
                }, i))
              })]
            }), /*#__PURE__*/_jsxs("div", {
              className: "glass-card rounded-2xl p-6",
              children: [/*#__PURE__*/_jsx("h3", {
                className: "text-xl font-black text-white mb-4",
                children: "\u2713 Hardest Words (Selection)"
              }), /*#__PURE__*/_jsx("div", {
                className: "space-y-2",
                children: statsData.hardest.byAttempts.slice(0, 10).map((item, i) => /*#__PURE__*/_jsxs("div", {
                  className: "flex justify-between items-center bg-slate-800/50 p-3 rounded-lg",
                  children: [/*#__PURE__*/_jsx("span", {
                    className: "text-white font-bold",
                    children: item.word
                  }), /*#__PURE__*/_jsxs("span", {
                    className: "text-yellow-400",
                    children: [item.attempts.toFixed(2), " attempts/word"]
                  })]
                }, i))
              })]
            })]
          }), /*#__PURE__*/_jsxs("div", {
            className: "glass-card rounded-2xl p-6",
            children: [/*#__PURE__*/_jsx("h3", {
              className: "text-xl font-black text-white mb-4",
              children: "\u26A0\uFE0F Reset Options"
            }), /*#__PURE__*/_jsxs("div", {
              className: "grid grid-cols-1 md:grid-cols-2 gap-4",
              children: [/*#__PURE__*/_jsx("button", {
                onClick: resetDifficulty,
                className: "bg-yellow-600/20 hover:bg-yellow-600/30 border border-yellow-500/30 text-yellow-300 py-4 rounded-xl font-bold",
                title: "Reset difficulty ratings to null. Words will be re-classified as you practice them again. Your vocabulary and exercise statistics will remain intact.",
                children: "\uD83D\uDFE1 Reset Difficulty Only"
              }), /*#__PURE__*/_jsx("button", {
                onClick: resetExerciseStats,
                className: "bg-orange-600/20 hover:bg-orange-600/30 border border-orange-500/30 text-orange-300 py-4 rounded-xl font-bold",
                title: "Reset all exercise counters and statistics (flashcard, dictation, selection, writing, translation counts and grades). Your vocabulary and difficulty ratings will remain intact.",
                children: "\uD83D\uDFE0 Reset Exercise Stats"
              })]
            })]
          })]
        }) : /*#__PURE__*/_jsx("div", {
          className: "text-center py-20",
          children: /*#__PURE__*/_jsx("p", {
            className: "text-slate-500 text-xl",
            children: "No statistics available"
          })
        })]
      })
    }), showExerciseDrillDown && /*#__PURE__*/_jsx("div", {
      className: "fixed inset-0 bg-black/95 z-[100] flex items-center justify-center p-4 backdrop-blur-md overflow-y-auto",
      children: /*#__PURE__*/_jsxs("div", {
        className: "glass-card p-10 rounded-[2.5rem] w-full max-w-5xl border-indigo-500/30 max-h-[85vh] flex flex-col",
        children: [/*#__PURE__*/_jsxs("div", {
          className: "flex justify-between items-center mb-6",
          children: [/*#__PURE__*/_jsxs("div", {
            children: [/*#__PURE__*/_jsxs("h2", {
              className: "text-2xl font-black main-gradient uppercase italic",
              children: [drillDownExercise === 'flashcard' && '🎴 Flashcard Difficult Words', drillDownExercise === 'dictation' && '🎤 Dictation Difficult Words', drillDownExercise === 'selection' && '✓ Selection Difficult Words', drillDownExercise === 'writing' && '✏️ Writing Difficult Words', drillDownExercise === 'translation' && '🌍 Translation Difficult Words']
            }), /*#__PURE__*/_jsxs("p", {
              className: "text-slate-400 text-sm mt-2",
              children: [drillDownExercise === 'flashcard' && 'Words marked as Passive/Emerging in flashcard practice', drillDownExercise === 'dictation' && 'Words with >2 average errors per attempt', drillDownExercise === 'selection' && 'Words with >2 average attempts per question', drillDownExercise === 'writing' && 'Words marked as Passive/Emerging in writing practice', drillDownExercise === 'translation' && 'Words with B1/B2 Cambridge grades']
            })]
          }), /*#__PURE__*/_jsx("button", {
            onClick: () => setShowExerciseDrillDown(false),
            className: "text-slate-400 hover:text-white text-3xl",
            children: "\xD7"
          })]
        }), drillDownWords.length === 0 ? /*#__PURE__*/_jsxs("div", {
          className: "text-center py-20",
          children: [/*#__PURE__*/_jsx("p", {
            className: "text-slate-500 text-xl mb-4",
            children: "\uD83C\uDF89 No difficult words found!"
          }), /*#__PURE__*/_jsx("p", {
            className: "text-slate-600 text-sm",
            children: "All words in this exercise are performing well."
          })]
        }) : /*#__PURE__*/_jsxs(_Fragment, {
          children: [/*#__PURE__*/_jsxs("p", {
            className: "text-slate-300 mb-4",
            children: ["Found ", drillDownWords.length, " word(s) \u2022 Selected: ", selectedDrillDownWords.length]
          }), /*#__PURE__*/_jsx("div", {
            className: "flex-1 overflow-y-auto custom-scroll mb-6 space-y-2",
            children: drillDownWords.map(word => {
              // Calculate difficulty metric for display
              let metric = '';
              if (drillDownExercise === 'dictation') {
                metric = `${(word.dictation_errors_total / word.dictation_count).toFixed(2)} avg errors`;
              } else if (drillDownExercise === 'selection') {
                metric = `${(word.selection_attempts_total / word.selection_count).toFixed(2)} avg attempts`;
              } else if (drillDownExercise === 'translation') {
                metric = `Grade: ${word.translation_best_grade || 'N/A'}`;
              } else {
                metric = `Effort: ${word.difficulty || 'Not rated'}`;
              }
              return /*#__PURE__*/_jsxs("label", {
                className: "flex items-start gap-4 bg-slate-800/50 hover:bg-slate-800 p-4 rounded-xl cursor-pointer transition-colors",
                children: [/*#__PURE__*/_jsx("input", {
                  type: "checkbox",
                  checked: selectedDrillDownWords.includes(word.id),
                  onChange: e => {
                    if (e.target.checked) {
                      setSelectedDrillDownWords([...selectedDrillDownWords, word.id]);
                    } else {
                      setSelectedDrillDownWords(selectedDrillDownWords.filter(id => id !== word.id));
                    }
                  },
                  className: "mt-1 w-5 h-5"
                }), /*#__PURE__*/_jsxs("div", {
                  className: "flex-1",
                  children: [/*#__PURE__*/_jsxs("div", {
                    className: "flex items-center gap-3 mb-2",
                    children: [/*#__PURE__*/_jsx("p", {
                      className: "text-white font-bold text-lg",
                      children: word.vocabulary
                    }), /*#__PURE__*/_jsx("span", {
                      className: `px-3 py-1 rounded-full text-xs font-bold ${word.difficulty === 'Active' ? 'bg-green-600/30 text-green-400' : word.difficulty === 'Emerging' ? 'bg-yellow-600/30 text-yellow-400' : word.difficulty === 'Passive' ? 'bg-red-600/30 text-red-400' : 'bg-slate-700 text-slate-400'}`,
                      children: word.difficulty || 'Not rated'
                    }), /*#__PURE__*/_jsx("span", {
                      className: "text-slate-500 text-xs",
                      children: metric
                    })]
                  }), /*#__PURE__*/_jsxs("p", {
                    className: "text-slate-400 text-sm",
                    children: ["Family: ", word.family || '—']
                  }), word.context && /*#__PURE__*/_jsxs("p", {
                    className: "text-slate-500 text-sm mt-2 italic line-clamp-2",
                    children: ["\"", word.context, "\""]
                  })]
                })]
              }, word.id);
            })
          }), /*#__PURE__*/_jsxs("div", {
            className: "flex gap-4 mt-4",
            children: [/*#__PURE__*/_jsx("button", {
              onClick: () => {
                if (selectedDrillDownWords.length === drillDownWords.length) {
                  setSelectedDrillDownWords([]);
                } else {
                  setSelectedDrillDownWords(drillDownWords.map(w => w.id));
                }
              },
              className: "px-6 bg-slate-700 hover:bg-slate-600 text-white py-3 rounded-xl font-bold text-sm",
              children: selectedDrillDownWords.length === drillDownWords.length ? '❌ Deselect All' : '✅ Select All'
            }), /*#__PURE__*/_jsxs("button", {
              onClick: practiceSelectedWords,
              disabled: selectedDrillDownWords.length === 0,
              className: "flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white py-3 rounded-xl font-black uppercase text-sm",
              children: ["\uD83C\uDFAF Practice Selected (", selectedDrillDownWords.length, ")"]
            })]
          })]
        })]
      })
    }), showResetConfirm && /*#__PURE__*/_jsx("div", {
      className: "fixed inset-0 bg-black/95 z-[100] flex items-center justify-center p-4 backdrop-blur-md",
      children: /*#__PURE__*/_jsx("div", {
        className: "glass-card p-8 rounded-3xl w-full max-w-2xl border-red-500/30",
        children: /*#__PURE__*/_jsxs("div", {
          className: "text-center",
          children: [/*#__PURE__*/_jsxs("div", {
            className: "text-6xl mb-4",
            children: [resetType === 'difficulty' && '🟡', resetType === 'stats' && '🟠', resetType === 'all' && '🔴']
          }), /*#__PURE__*/_jsxs("h2", {
            className: "text-3xl font-black text-white mb-4",
            children: [resetType === 'difficulty' && 'Reset Difficulty Ratings?', resetType === 'stats' && 'Reset Exercise Statistics?', resetType === 'all' && 'Reset ALL Progress?']
          }), /*#__PURE__*/_jsxs("div", {
            className: "bg-slate-800/50 rounded-xl p-6 mb-6 text-left",
            children: [/*#__PURE__*/_jsx("p", {
              className: "text-slate-300 mb-3 font-semibold",
              children: "This action will:"
            }), resetType === 'difficulty' && /*#__PURE__*/_jsxs(_Fragment, {
              children: [/*#__PURE__*/_jsx("p", {
                className: "text-red-400 mb-2",
                children: "\u274C Clear all difficulty ratings (Active/Emerging/Passive)"
              }), /*#__PURE__*/_jsx("p", {
                className: "text-slate-400 mb-2",
                children: "\u2192 Words will need to be re-classified through practice"
              }), /*#__PURE__*/_jsx("p", {
                className: "text-green-400 mt-4",
                children: "\u2705 Keep your vocabulary list intact"
              }), /*#__PURE__*/_jsx("p", {
                className: "text-green-400",
                children: "\u2705 Keep all exercise statistics (counts, grades, errors)"
              })]
            }), resetType === 'stats' && /*#__PURE__*/_jsxs(_Fragment, {
              children: [/*#__PURE__*/_jsx("p", {
                className: "text-red-400 mb-2",
                children: "\u274C Clear ALL exercise counters and statistics:"
              }), /*#__PURE__*/_jsx("p", {
                className: "text-slate-400 ml-6 mb-1",
                children: "\u2022 Flashcard practice counts"
              }), /*#__PURE__*/_jsx("p", {
                className: "text-slate-400 ml-6 mb-1",
                children: "\u2022 Dictation errors and attempts"
              }), /*#__PURE__*/_jsx("p", {
                className: "text-slate-400 ml-6 mb-1",
                children: "\u2022 Selection attempts"
              }), /*#__PURE__*/_jsx("p", {
                className: "text-slate-400 ml-6 mb-1",
                children: "\u2022 Writing practice counts"
              }), /*#__PURE__*/_jsx("p", {
                className: "text-slate-400 ml-6 mb-2",
                children: "\u2022 Translation grades"
              }), /*#__PURE__*/_jsx("p", {
                className: "text-green-400 mt-4",
                children: "\u2705 Keep your vocabulary list intact"
              }), /*#__PURE__*/_jsx("p", {
                className: "text-green-400",
                children: "\u2705 Keep difficulty ratings"
              })]
            }), resetType === 'all' && /*#__PURE__*/_jsxs(_Fragment, {
              children: [/*#__PURE__*/_jsx("p", {
                className: "text-red-400 mb-2",
                children: "\u274C Clear EVERYTHING:"
              }), /*#__PURE__*/_jsx("p", {
                className: "text-red-300 ml-6 mb-1 font-semibold",
                children: "\u2022 All difficulty ratings"
              }), /*#__PURE__*/_jsx("p", {
                className: "text-red-300 ml-6 mb-1 font-semibold",
                children: "\u2022 All exercise statistics"
              }), /*#__PURE__*/_jsx("p", {
                className: "text-red-300 ml-6 mb-1 font-semibold",
                children: "\u2022 All practice history"
              }), /*#__PURE__*/_jsx("p", {
                className: "text-red-300 ml-6 mb-2 font-semibold",
                children: "\u2022 All performance data"
              }), /*#__PURE__*/_jsx("p", {
                className: "text-green-400 mt-4",
                children: "\u2705 Keep your vocabulary list intact"
              }), /*#__PURE__*/_jsx("p", {
                className: "text-yellow-300 mt-3 font-semibold",
                children: "\u26A0\uFE0F This gives you a completely fresh start!"
              })]
            })]
          }), /*#__PURE__*/_jsx("p", {
            className: "text-slate-500 italic mb-6",
            children: resetType === 'all' ? '⚠️ This action cannot be undone. All your progress will be permanently lost.' : 'This action cannot be undone. Make sure this is what you want.'
          }), /*#__PURE__*/_jsxs("div", {
            className: "flex gap-4 justify-center",
            children: [/*#__PURE__*/_jsx("button", {
              onClick: () => setShowResetConfirm(false),
              className: "px-8 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold",
              children: "\u274C Cancel"
            }), /*#__PURE__*/_jsxs("button", {
              onClick: () => {
                if (resetType === 'difficulty') executeResetDifficulty();else if (resetType === 'stats') executeResetExerciseStats();else if (resetType === 'all') executeResetAllProgress();
              },
              className: `px-8 py-3 rounded-xl font-bold ${resetType === 'difficulty' ? 'bg-yellow-600 hover:bg-yellow-500 text-white' : resetType === 'stats' ? 'bg-orange-600 hover:bg-orange-500 text-white' : 'bg-red-600 hover:bg-red-500 text-white'}`,
              children: [resetType === 'difficulty' && '🟡 Yes, Reset Difficulty', resetType === 'stats' && '🟠 Yes, Reset Stats', resetType === 'all' && '🔴 Yes, Reset Everything']
            })]
          })]
        })
      })
    }), showDictionaryModal && /*#__PURE__*/_jsx("div", {
      className: "fixed inset-0 bg-black/95 z-[300] flex items-center justify-center p-4 backdrop-blur-md overflow-y-auto",
      children: /*#__PURE__*/_jsxs("div", {
        className: "glass-card p-8 rounded-3xl w-full max-w-2xl border-blue-500/30 my-8 max-h-[90vh] overflow-y-auto",
        children: [/*#__PURE__*/_jsxs("div", {
          className: "flex justify-between items-center mb-6 sticky top-0 bg-slate-900/95 backdrop-blur-md pb-4 -mt-2 z-10",
          children: [/*#__PURE__*/_jsx("h2", {
            className: "text-2xl font-black text-white",
            children: "\uD83D\uDCD6 Open in Dictionary"
          }), /*#__PURE__*/_jsx("button", {
            onClick: () => setShowDictionaryModal(false),
            className: "text-slate-400 hover:text-white text-3xl",
            children: "\xD7"
          })]
        }), /*#__PURE__*/_jsxs("div", {
          className: "mb-6",
          children: [/*#__PURE__*/_jsx("p", {
            className: "text-slate-300 mb-2",
            children: "Word to search:"
          }), /*#__PURE__*/_jsx("p", {
            className: "text-2xl font-bold text-blue-400",
            children: selectedWordForDict || '(no word selected)'
          })]
        }), selectedWordForDict ? /*#__PURE__*/_jsxs("div", {
          className: "space-y-3",
          children: [/*#__PURE__*/_jsxs("button", {
            onClick: () => {
              const encodedPrompt = encodeURIComponent(aiSearchPrompt.replace('{word}', selectedWordForDict));
              window.open(`https://www.perplexity.ai/search?q=${encodedPrompt}`, '_blank');
              setShowDictionaryModal(false);
            },
            className: "w-full px-6 py-4 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-xl font-bold text-left flex items-center gap-3 shadow-lg",
            children: [/*#__PURE__*/_jsx("span", {
              className: "text-2xl",
              children: "\uD83D\uDD0D"
            }), /*#__PURE__*/_jsxs("div", {
              children: [/*#__PURE__*/_jsx("div", {
                className: "text-base",
                children: "Perplexity AI Search"
              }), /*#__PURE__*/_jsx("div", {
                className: "text-xs opacity-80",
                children: "Deep web research with AI"
              })]
            })]
          }), /*#__PURE__*/_jsxs("button", {
            onClick: () => {
              window.open(`https://youglish.com/pronounce/${encodeURIComponent(selectedWordForDict)}/english`, '_blank');
              setShowDictionaryModal(false);
            },
            className: "w-full px-6 py-4 bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-500 hover:to-pink-500 text-white rounded-xl font-bold text-left flex items-center gap-3 shadow-lg",
            children: [/*#__PURE__*/_jsx("span", {
              className: "text-2xl",
              children: "\uD83C\uDFAC"
            }), /*#__PURE__*/_jsxs("div", {
              children: [/*#__PURE__*/_jsx("div", {
                className: "text-base",
                children: "YouGlish"
              }), /*#__PURE__*/_jsx("div", {
                className: "text-xs opacity-80",
                children: "Learn pronunciation from YouTube videos"
              })]
            })]
          }), /*#__PURE__*/_jsx("div", {
            className: "border-t border-slate-700 my-4 pt-4",
            children: /*#__PURE__*/_jsx("p", {
              className: "text-xs uppercase text-slate-500 font-black mb-3",
              children: "\uD83D\uDCDA Dictionaries"
            })
          }), /*#__PURE__*/_jsxs("button", {
            onClick: () => {
              window.open(`https://www.wordreference.com/es/translation.asp?tranword=${encodeURIComponent(selectedWordForDict)}`, '_blank');
              setShowDictionaryModal(false);
            },
            className: "w-full px-6 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-left flex items-center gap-3",
            children: [/*#__PURE__*/_jsx("span", {
              className: "text-2xl",
              children: "\uD83D\uDCD8"
            }), /*#__PURE__*/_jsx("span", {
              children: "WordReference"
            })]
          }), /*#__PURE__*/_jsxs("button", {
            onClick: () => {
              window.open(`https://dictionary.cambridge.org/dictionary/english/${encodeURIComponent(selectedWordForDict)}`, '_blank');
              setShowDictionaryModal(false);
            },
            className: "w-full px-6 py-4 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold text-left flex items-center gap-3",
            children: [/*#__PURE__*/_jsx("span", {
              className: "text-2xl",
              children: "\uD83C\uDF93"
            }), /*#__PURE__*/_jsx("span", {
              children: "Cambridge Dictionary"
            })]
          }), /*#__PURE__*/_jsxs("button", {
            onClick: () => {
              window.open(`https://www.collinsdictionary.com/dictionary/english/${encodeURIComponent(selectedWordForDict)}`, '_blank');
              setShowDictionaryModal(false);
            },
            className: "w-full px-6 py-4 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-bold text-left flex items-center gap-3",
            children: [/*#__PURE__*/_jsx("span", {
              className: "text-2xl",
              children: "\uD83D\uDCD6"
            }), /*#__PURE__*/_jsx("span", {
              children: "Collins Dictionary"
            })]
          }), /*#__PURE__*/_jsxs("button", {
            onClick: () => {
              window.open(`https://www.oxfordlearnersdictionaries.com/definition/english/${encodeURIComponent(selectedWordForDict)}`, '_blank');
              setShowDictionaryModal(false);
            },
            className: "w-full px-6 py-4 bg-orange-600 hover:bg-orange-500 text-white rounded-xl font-bold text-left flex items-center gap-3",
            children: [/*#__PURE__*/_jsx("span", {
              className: "text-2xl",
              children: "\uD83C\uDFAF"
            }), /*#__PURE__*/_jsx("span", {
              children: "Oxford Learner's"
            })]
          }), /*#__PURE__*/_jsxs("button", {
            onClick: () => {
              window.open(`https://www.merriam-webster.com/dictionary/${encodeURIComponent(selectedWordForDict)}`, '_blank');
              setShowDictionaryModal(false);
            },
            className: "w-full px-6 py-4 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold text-left flex items-center gap-3",
            children: [/*#__PURE__*/_jsx("span", {
              className: "text-2xl",
              children: "\uD83D\uDCD5"
            }), /*#__PURE__*/_jsx("span", {
              children: "Merriam-Webster"
            })]
          })]
        }) : /*#__PURE__*/_jsx("div", {
          className: "text-center py-8",
          children: /*#__PURE__*/_jsx("p", {
            className: "text-slate-500 text-sm",
            children: "No word selected. Click the dictionary icon \uD83D\uDCD6 on any word to open this menu."
          })
        }), /*#__PURE__*/_jsx("button", {
          onClick: () => setShowDictionaryModal(false),
          className: "w-full mt-6 px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold sticky bottom-0",
          children: "Cancel"
        })]
      })
    })]
  });
}
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(/*#__PURE__*/_jsx(App, {}));