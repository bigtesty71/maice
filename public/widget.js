(function () {
    //  MAGGIE Widget Injection Script
    // Usage: <script src="https://maice-eosin.vercel.app/widget.js"></script>

    const WIDGET_URL = window.location.origin === 'http://localhost:3000' || window.location.origin === 'http://localhost:8000'
        ? window.location.origin
        : (window.location.origin.includes('vercel.app') ? window.location.origin : 'https://maice-eosin.vercel.app');

    // 1. Create Styles
    const style = document.createElement('style');
    style.innerHTML = `
        #MAGGIE-widget-container {
            position: fixed !important;
            bottom: 40px !important;
            right: 40px !important;
            width: 85px;
            height: 85px;
            z-index: 2147483647 !important;
            transition: all 0.2s ease-in-out;
            font-family: 'Poppins', sans-serif;
        }
        #MAGGIE-widget-container.expanded {
            width: 500px;
            height: 600px;
            bottom: 30px !important;
            right: 30px !important;
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.5);
            overflow: hidden;
            display: flex;
            background: #291b25;
            border: 1px solid rgba(255,255,255,0.1);
        }
        #MAGGIE-widget-persona {
            width: 150px;
            height: 100%;
            background: #000;
            display: none;
            border-right: 1px solid rgba(255,255,255,0.1);
            flex-shrink: 0;
            order: 1; 
            position: relative;
        }
        #MAGGIE-widget-container.expanded #MAGGIE-widget-persona {
            display: block;
        }
        #MAGGIE-widget-persona img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            object-position: top center;
            opacity: 0.7;
        }
        .maggie-form-overlay {
            position: absolute;
            bottom: 0;
            left: 0;
            width: 100%;
            padding: 15px;
            background: linear-gradient(to top, #291b25, transparent);
            display: flex;
            flex-direction: column;
            gap: 10px;
            box-sizing: border-box;
        }
        .maggie-form-overlay input {
            width: 100%;
            padding: 8px;
            background: rgba(255,255,255,0.1);
            border: 1px solid rgba(255,255,255,0.2);
            border-radius: 6px;
            color: white;
            font-size: 0.8rem;
            outline: none;
            box-sizing: border-box;
        }
        .maggie-form-overlay button {
            width: 100%;
            padding: 8px;
            background: #0097b2;
            border: none;
            border-radius: 6px;
            color: white;
            font-weight: 600;
            cursor: pointer;
            font-size: 0.8rem;
        }
        #MAGGIE-widget-launcher {
            width: 85px;
            height: 85px;
            background: #0097b2;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            box-shadow: 0 8px 25px rgba(0, 151, 178, 0.5);
            font-size: 40px;
            color: white;
            transition: transform 0.2s;
        }
        #MAGGIE-widget-launcher:hover {
            transform: scale(1.05);
        }
        #MAGGIE-widget-frame {
            width: 100%;
            height: 100%;
            border: none;
            display: none;
            background: #291b25;
            flex: 1;
            order: 2;
        }
        #MAGGIE-widget-container.expanded #MAGGIE-widget-launcher {
            display: none;
        }
        #MAGGIE-widget-container.expanded #MAGGIE-widget-frame {
            display: block;
        }
        #MAGGIE-widget-close {
            position: absolute;
            top: 10px;
            right: 10px; 
            background: #291b25;
            border: 1px solid rgba(255,255,255,0.2);
            color: white;
            width: 28px;
            height: 28px;
            border-radius: 50%;
            cursor: pointer;
            z-index: 1000001;
            display: none;
            align-items: center;
            justify-content: center;
            font-size: 12px;
        }
        #MAGGIE-widget-close:hover {
            background: #eb6e20;
        }
        #MAGGIE-widget-container.expanded #MAGGIE-widget-close {
            display: flex;
        }
        @media (max-width: 550px) {
            #MAGGIE-widget-container.expanded {
                width: 100vw;
                height: 100vh;
                bottom: 0;
                right: 0;
                border-radius: 0;
            }
            #MAGGIE-widget-persona {
                display: none !important;
            }
            #MAGGIE-widget-close {
                right: 15px;
            }
        }
    `;
    document.head.appendChild(style);

    // 2. Create Elements
    const container = document.createElement('div');
    container.id = 'MAGGIE-widget-container';

    const launcher = document.createElement('div');
    launcher.id = 'MAGGIE-widget-launcher';
    launcher.innerHTML = '✨';
    launcher.onclick = toggleWidget;

    const closeBtn = document.createElement('button');
    closeBtn.id = 'MAGGIE-widget-close';
    closeBtn.innerHTML = '✕';
    closeBtn.onclick = toggleWidget;

    const persona = document.createElement('div');
    persona.id = 'MAGGIE-widget-persona';
    persona.innerHTML = `<img src="https://assets.zyrosite.com/Y22lADx6iVA0O5YU/widget-tPI2NbVGTaB38COe.png" alt="MAGGIE">`;

    const frame = document.createElement('iframe');
    frame.id = 'MAGGIE-widget-frame';
    const timestamp = new Date().getTime();
    frame.src = WIDGET_URL + '?widget=true&v=' + timestamp;
    frame.allow = "microphone; camera; clipboard-write";

    container.appendChild(closeBtn);
    container.appendChild(launcher);
    container.appendChild(persona);
    container.appendChild(frame);
    document.body.appendChild(container);

    function toggleWidget() {
        container.classList.toggle('expanded');
    }

    // 3. TTS Bridge (Handles speech for cross-origin iframes)
    let widgetVoice = null;

    function loadWidgetVoices() {
        const voices = window.speechSynthesis.getVoices();
        if (voices.length === 0) return;
        widgetVoice =
            voices.find(v => v.name.includes('Zira')) ||
            voices.find(v => v.name.includes('Google UK English Female')) ||
            voices.find(v => v.name.toLowerCase().includes('female') && v.lang.startsWith('en')) ||
            voices.find(v => v.lang === 'en-US') ||
            voices[0];
    }
    loadWidgetVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = loadWidgetVoices;
    }

    window.addEventListener('message', function (event) {
        if (event.data && event.data.type === 'MAGGIE_SPEAK') {
            const synth = window.speechSynthesis;
            synth.cancel();

            let clean = event.data.text;
            clean = clean.replace(/```[\s\S]*?```/g, ' code block ');
            clean = clean.replace(/`([^`]+)`/g, '$1');
            clean = clean.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');
            clean = clean.replace(/[\*\_]{1,3}([^\*\_]+)[\*\_]{1,3}/g, '$1');
            clean = clean.replace(/#{1,6}\s*/g, '');
            clean = clean.replace(/[->\+\|]/g, '');
            clean = clean.replace(/\n{2,}/g, '. ');
            clean = clean.replace(/\s{2,}/g, ' ').trim();

            if (!clean) return;

            const chunks = clean.match(/[^.!?]+[.!?]*/g) || [clean];

            const speakSequentially = async () => {
                for (const chunk of chunks) {
                    const trimmed = chunk.trim();
                    if (!trimmed) continue;
                    await new Promise((resolve) => {
                        const utterance = new SpeechSynthesisUtterance(trimmed);
                        if (widgetVoice) utterance.voice = widgetVoice;
                        utterance.rate = 1.05;
                        utterance.pitch = 1.05;
                        utterance.onend = resolve;
                        utterance.onerror = resolve;
                        synth.speak(utterance);
                    });
                }
            };

            speakSequentially();
        }
    });

})();


