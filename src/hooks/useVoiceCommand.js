import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * useVoiceCommand — webkitSpeechRecognition hook for Electron / Chromium
 *
 * States exposed:
 *   isListening : boolean — whether the mic is active
 *   transcript  : string  — latest final transcript
 *   interimText : string  — real-time partial transcript (for live preview)
 *   error       : string  — error message (null when ok)
 *
 * Methods:
 *   startListening()  — begin recording
 *   stopListening()   — manually stop
 *   toggleListening() — convenience toggle
 *
 * Behaviour:
 *   - Continuous mode while active
 *   - Auto-stops on silence (via SpeechRecognition's `onend`)
 *   - Calls `onResult(finalTranscript)` when a final result arrives
 */
export default function useVoiceCommand({ onResult, lang = 'en-US' } = {}) {
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [interimText, setInterimText] = useState('');
    const [error, setError] = useState(null);
    const recognitionRef = useRef(null);
    const onResultRef = useRef(onResult);

    // Keep callback ref fresh without re-creating recognition
    useEffect(() => {
        onResultRef.current = onResult;
    }, [onResult]);

    const getRecognition = useCallback(() => {
        if (recognitionRef.current) return recognitionRef.current;

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            setError('Speech recognition not supported in this browser.');
            return null;
        }

        const recognition = new SpeechRecognition();
        recognition.lang = lang;
        recognition.interimResults = true;    // Show live partial results
        recognition.continuous = true;        // Keep listening until manually stopped
        recognition.maxAlternatives = 1;

        recognition.onstart = () => {
            setIsListening(true);
            setError(null);
            setInterimText('');
        };

        recognition.onresult = (event) => {
            let interim = '';
            let final = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const result = event.results[i];
                if (result.isFinal) {
                    final += result[0].transcript;
                } else {
                    interim += result[0].transcript;
                }
            }

            if (interim) setInterimText(interim);

            if (final) {
                const trimmed = final.trim();
                setTranscript(trimmed);
                setInterimText('');
                // Auto-stop after getting a final result
                try { recognition.stop(); } catch { }
                // Deliver result to consumer
                if (onResultRef.current) onResultRef.current(trimmed);
            }
        };

        recognition.onerror = (event) => {
            // 'no-speech' and 'aborted' are not real errors
            if (event.error === 'no-speech' || event.error === 'aborted') {
                setIsListening(false);
                return;
            }
            setError(`Voice error: ${event.error}`);
            setIsListening(false);
        };

        recognition.onend = () => {
            setIsListening(false);
            setInterimText('');
        };

        recognitionRef.current = recognition;
        return recognition;
    }, [lang]);

    const startListening = useCallback(() => {
        setError(null);
        setTranscript('');
        const recognition = getRecognition();
        if (!recognition) return;
        try {
            recognition.start();
        } catch (e) {
            // Already started — ignore
            if (!e.message?.includes('already started')) {
                setError(e.message);
            }
        }
    }, [getRecognition]);

    const stopListening = useCallback(() => {
        if (recognitionRef.current) {
            try { recognitionRef.current.stop(); } catch { }
        }
        setIsListening(false);
        setInterimText('');
    }, []);

    const toggleListening = useCallback(() => {
        if (isListening) {
            stopListening();
        } else {
            startListening();
        }
    }, [isListening, startListening, stopListening]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (recognitionRef.current) {
                try { recognitionRef.current.stop(); } catch { }
                recognitionRef.current = null;
            }
        };
    }, []);

    return {
        isListening,
        transcript,
        interimText,
        error,
        startListening,
        stopListening,
        toggleListening,
    };
}
