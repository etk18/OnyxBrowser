import { useState, useRef, useCallback, useEffect } from 'react';

const BACKEND_URL = 'http://localhost:8000';

/**
 * useVoiceCommand — MediaRecorder + FastAPI Whisper transcription
 *
 * Replaces the broken webkitSpeechRecognition approach.
 * Records audio via MediaRecorder, sends the WebM blob to
 * POST /api/agent/voice for server-side Whisper transcription.
 *
 * States exposed:
 *   isListening : boolean — whether the mic is active
 *   transcript  : string  — latest final transcript
 *   interimText : string  — status text while recording/processing
 *   error       : string  — error message (null when ok)
 *
 * Methods:
 *   startListening()  — begin recording
 *   stopListening()   — stop and send for transcription
 *   toggleListening() — convenience toggle
 */
export default function useVoiceCommand({ onResult } = {}) {
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [interimText, setInterimText] = useState('');
    const [error, setError] = useState(null);

    const mediaRecorderRef = useRef(null);
    const chunksRef = useRef([]);
    const streamRef = useRef(null);
    const onResultRef = useRef(onResult);

    // Keep callback ref fresh without re-creating recorder
    useEffect(() => {
        onResultRef.current = onResult;
    }, [onResult]);

    const stopMedia = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            try { mediaRecorderRef.current.stop(); } catch { }
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
        }
        mediaRecorderRef.current = null;
    }, []);

    const sendAudioForTranscription = useCallback(async (blob) => {
        setInterimText('Transcribing...');
        try {
            const formData = new FormData();
            formData.append('file', blob, 'recording.webm');

            const res = await fetch(`${BACKEND_URL}/api/agent/voice`, {
                method: 'POST',
                body: formData,
            });

            if (!res.ok) {
                const text = await res.text().catch(() => '');
                throw new Error(`Transcription failed (${res.status}): ${text || res.statusText}`);
            }

            const data = await res.json();
            const text = (data.transcript || '').trim();

            if (text) {
                setTranscript(text);
                setInterimText('');
                if (onResultRef.current) onResultRef.current(text);
            } else {
                setInterimText('');
                setError('No speech detected. Try again.');
            }
        } catch (err) {
            setInterimText('');
            setError(`Voice error: ${err.message}`);
        }
    }, []);

    const startListening = useCallback(async () => {
        setError(null);
        setTranscript('');
        setInterimText('');
        chunksRef.current = [];

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            const recorder = new MediaRecorder(stream, {
                mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                    ? 'audio/webm;codecs=opus'
                    : 'audio/webm',
            });

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };

            recorder.onstop = () => {
                setIsListening(false);
                const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
                chunksRef.current = [];

                // Only send if we have meaningful audio (> 1KB)
                if (blob.size > 1024) {
                    sendAudioForTranscription(blob);
                } else {
                    setError('Recording too short. Hold the button longer.');
                }
            };

            recorder.onerror = () => {
                setIsListening(false);
                setError('Microphone recording failed.');
                stopMedia();
            };

            mediaRecorderRef.current = recorder;
            recorder.start(250); // Collect chunks every 250ms
            setIsListening(true);
            setInterimText('Listening...');
        } catch (err) {
            setIsListening(false);
            if (err.name === 'NotAllowedError') {
                setError('Microphone access denied. Check your system permissions.');
            } else {
                setError(`Mic error: ${err.message}`);
            }
        }
    }, [sendAudioForTranscription, stopMedia]);

    const stopListening = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop(); // triggers onstop -> transcription
        }
        // Stream tracks are cleaned up in onstop via stopMedia after transcription,
        // but stop tracks immediately so the mic indicator turns off
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
        }
        setIsListening(false);
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
            stopMedia();
        };
    }, [stopMedia]);

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
