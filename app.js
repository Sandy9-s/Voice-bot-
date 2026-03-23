const micBtn = document.getElementById('mic-btn');
const micBtnText = document.getElementById('mic-btn-text');
const statusIndicator = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');
const transcriptContainer = document.getElementById('transcript-container');

// Browser API checks
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const synth = window.speechSynthesis;

if (!SpeechRecognition) {
    appendMessage('system', 'Your browser does not support the Web Speech API. Please try Google Chrome or Edge.');
    micBtn.disabled = true;
    micBtn.style.opacity = '0.5';
}

const recognition = new (SpeechRecognition || Object)();
if (SpeechRecognition) {
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
}

let isListening = false;
let interimMessageDiv = null;
let speechTimeout = null;
const SPEECH_PAUSE_THRESHOLD = 1500;

// Function utilizing basic logic and free Wikipedia APIs for factual answers (No API Keys)
async function getAIResponse(text) {
    const lower = text.toLowerCase().trim();

    // Core Conversational
    if (lower.includes('tell me about yourself')) {
        return "I am a free browser-based voice assistant. I can perform basic math calculations and answer questions by securely searching Wikipedia!";
    }
    if (lower.match(/^(hello|hi|hey|greetings)/)) {
        return "Hello there! I'm your real-time voice assistant. How can I help you today?";
    }
    if (lower.includes('who are you') || lower.includes('your name')) {
        return "I am a client-side neural voice agent. I answer your questions dynamically using public information.";
    }

    // Mathematical calculations
    if (lower.includes('area of') && lower.includes('square')) {
        return "The area of a square is calculated by multiplying the length of one side by itself.";
    }
    const mathMatch = lower.match(/(what is|calculate)\s+([\d\.\+\-\*\/\s]+)/);
    if (mathMatch && mathMatch[2]) {
        try {
            const sanitized = mathMatch[2].replace(/[^-()\d/*+.]/g, '');
            if (sanitized.length > 0) {
                const result = new Function(`return ${sanitized}`)();
                if (!isNaN(result)) return `The answer is ${result}.`;
            }
        } catch (e) { }
    }

    // Factual queries using public Wikipedia API
    try {
        let query = text.replace(/^(what is|who is|tell me about)\s+/i, '');
        if (query.trim() === '') query = text;
        const encodedQuery = encodeURIComponent(query);

        const extractUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exsentences=2&exlimit=1&titles=${encodedQuery}&explaintext=1&formatversion=2&format=json&origin=*`;
        const res = await fetch(extractUrl);
        const parseData = await res.json();

        if (parseData.query.pages && parseData.query.pages[0].extract && parseData.query.pages[0].extract.length > 10) {
            return "According to Wikipedia: " + parseData.query.pages[0].extract;
        } else {
            const snippetUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodedQuery}&utf8=&format=json&origin=*`;
            const snippetRes = await fetch(snippetUrl);
            const snippetData = await snippetRes.json();

            if (snippetData.query.search && snippetData.query.search.length > 0) {
                const tempDiv = document.createElement("div");
                tempDiv.innerHTML = snippetData.query.search[0].snippet;
                let plainText = tempDiv.textContent || tempDiv.innerText || "";
                return plainText.replace(/\.\.\.$/, '') + ".";
            }
        }
    } catch (e) {
        console.warn("Wikipedia fetch failed", e);
    }

    // Fallback
    return "I heard what you said, but I couldn't find a factual answer for that. Tell me something else!";
}

function setStatus(state) {
    statusIndicator.className = 'status-indicator';
    if (state !== 'idle') {
        statusIndicator.classList.add(`state-${state}`);
    }

    const textMap = {
        'idle': 'System Idle',
        'listening': 'Listening...',
        'computing': 'Processing...',
        'speaking': 'Speaking...'
    };
    statusText.textContent = textMap[state];
}

function appendMessage(role, text, isInterim = false) {
    if (isInterim && interimMessageDiv) {
        interimMessageDiv.textContent = text;
        scrollToBottom();
        return interimMessageDiv;
    }

    const div = document.createElement('div');
    div.className = `message ${role}-message`;
    div.textContent = text;
    transcriptContainer.appendChild(div);
    scrollToBottom();

    if (isInterim) {
        interimMessageDiv = div;
    }

    return div;
}

function scrollToBottom() {
    transcriptContainer.scrollTop = transcriptContainer.scrollHeight;
}

function speakResponse(text) {
    setStatus('speaking');

    const utterance = new SpeechSynthesisUtterance(text);
    const voices = synth.getVoices();

    const neuralVoice = voices.find(v => (v.name.includes('Google') || v.name.includes('Neural')) && v.lang.startsWith('en')) || voices.find(v => v.lang.startsWith('en')) || voices[0];
    if (neuralVoice) {
        utterance.voice = neuralVoice;
    }

    utterance.rate = 1.05;
    utterance.pitch = 1.0;

    utterance.onend = () => {
        if (isListening) setStatus('listening');
        else setStatus('idle');
    };

    utterance.onerror = () => {
        if (isListening) setStatus('listening');
        else setStatus('idle');
    };

    synth.speak(utterance);
}

async function streamAIResponse(fullText) {
    const messageDiv = appendMessage('ai', '');
    let currentText = '';
    const delay = ms => new Promise(res => setTimeout(res, ms));

    const words = fullText.split(' ');
    for (let i = 0; i < words.length; i++) {
        currentText += words[i] + ' ';
        messageDiv.textContent = currentText;
        scrollToBottom();
        await delay(Math.random() * 30 + 10);
    }

    speakResponse(fullText);
}

async function processUserUtterance(textToProcess) {
    if (!textToProcess.trim()) return;
    setStatus('computing');

    recognition.pauseProcessing = true;

    const responseText = await getAIResponse(textToProcess);
    await streamAIResponse(responseText);

    recognition.pauseProcessing = false;
}

if (SpeechRecognition) {
    recognition.onstart = () => {
        isListening = true;
        recognition.pauseProcessing = false;
        micBtn.classList.add('active');
        micBtnText.textContent = 'Stop Conversation';
        setStatus('listening');
        interimMessageDiv = null;
    };

    recognition.onresult = (event) => {
        if (recognition.pauseProcessing || statusIndicator.classList.contains('state-computing')) {
            return;
        }

        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript;
            } else {
                interimTranscript += event.results[i][0].transcript;
            }
        }

        if (finalTranscript) {
            if (interimMessageDiv) {
                interimMessageDiv.textContent = finalTranscript;
                interimMessageDiv.classList.remove('system-message');
                interimMessageDiv = null;
            } else {
                appendMessage('user', finalTranscript);
            }
            processUserUtterance(finalTranscript);

        } else if (interimTranscript) {
            appendMessage('user', interimTranscript + '...', true);

            clearTimeout(speechTimeout);
            speechTimeout = setTimeout(() => {
                if (interimMessageDiv && interimMessageDiv.textContent.trim()) {
                    let extractedPhrase = interimMessageDiv.textContent.replace('...', '');
                    interimMessageDiv.textContent = extractedPhrase;
                    interimMessageDiv.classList.remove('system-message');
                    interimMessageDiv = null;
                    processUserUtterance(extractedPhrase);
                }
            }, SPEECH_PAUSE_THRESHOLD);
        }
    };

    recognition.onerror = (event) => {
        if (event.error !== 'no-speech') console.error('Speech recognition error:', event.error);
        if (event.error === 'not-allowed') {
            isListening = false;
            micBtn.classList.remove('active');
            micBtnText.textContent = 'Start Conversation';
            setStatus('idle');
        }
    };

    recognition.onend = () => {
        if (isListening) {
            try { recognition.start(); } catch (e) { }
            return;
        }
        micBtn.classList.remove('active');
        micBtnText.textContent = 'Start Conversation';
        setStatus('idle');
    };

    micBtn.addEventListener('click', () => {
        if (isListening) {
            isListening = false;
            recognition.stop();
            if (synth.speaking) synth.cancel();
        } else {
            if (synth.speaking) synth.cancel();
            try { recognition.start(); } catch (e) { console.error("Could not start", e); }
        }
    });

    if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = () => synth.getVoices();
    }
}