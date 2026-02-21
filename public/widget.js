(function () {
    // MAIce Widget Injection Script
    // Usage: <script src="https://your-domain.vercel.app/widget.js"></script>

    const WIDGET_URL = window.location.origin === 'http://localhost:3000'
        ? 'http://localhost:3000'
        : (window.location.origin.includes('vercel.app') ? window.location.origin : 'https://maice.vercel.app');

    // 1. Create Styles
    const style = document.createElement('style');
    style.innerHTML = `
        #maice-widget-container {
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 60px;
            height: 60px;
            z-index: 999999;
            transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        #maice-widget-container.expanded {
            width: 450px; /* Wider for persona */
            height: 500px;
            bottom: 20px;
            right: 20px;
            border-radius: 20px;
            box-shadow: 0 12px 40px rgba(0,0,0,0.4);
            overflow: hidden;
            display: flex;
        }
        #maice-widget-persona {
            width: 150px;
            height: 100%;
            background: #000;
            display: none;
            border-right: 1px solid rgba(255,255,255,0.1);
        }
        #maice-widget-container.expanded #maice-widget-persona {
            display: block;
        }
        #maice-widget-persona img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            opacity: 0.8;
        }
        #maice-widget-launcher {
            width: 60px;
            height: 60px;
            background: #0097b2;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            box-shadow: 0 4px 15px rgba(0, 151, 178, 0.4);
            font-size: 24px;
            color: white;
            transition: transform 0.2s;
        }
        #maice-widget-launcher:hover {
            transform: scale(1.1);
        }
        #maice-widget-frame {
            width: 100%;
            height: 100%;
            border: none;
            display: none;
            background: #291b25;
        }
        #maice-widget-container.expanded #maice-widget-launcher {
            display: none;
        }
        #maice-widget-container.expanded #maice-widget-frame {
            display: block;
        }
        #maice-widget-close {
            position: absolute;
            top: 10px;
            right: 15px;
            background: rgba(255,255,255,0.1);
            border: none;
            color: white;
            width: 30px;
            height: 30px;
            border-radius: 50%;
            cursor: pointer;
            z-index: 1000000;
            display: none;
            align-items: center;
            justify-content: center;
            font-weight: bold;
        }
        #maice-widget-container.expanded #maice-widget-close {
            display: flex;
        }
        @media (max-width: 480px) {
            #maice-widget-container.expanded {
                width: 100%;
                height: 100%;
                bottom: 0;
                right: 0;
                border-radius: 0;
            }
        }
    `;
    document.head.appendChild(style);

    // 2. Create Elements
    const container = document.createElement('div');
    container.id = 'maice-widget-container';

    const launcher = document.createElement('div');
    launcher.id = 'maice-widget-launcher';
    launcher.innerHTML = '✨';
    launcher.onclick = toggleWidget;

    const closeBtn = document.createElement('button');
    closeBtn.id = 'maice-widget-close';
    closeBtn.innerHTML = '✕';
    closeBtn.onclick = toggleWidget;

    const persona = document.createElement('div');
    persona.id = 'maice-widget-persona';
    // Use Macie2.png for the rectangular side image
    persona.innerHTML = `
        <img src="${WIDGET_URL}/images/Macie2.png" 
             onerror="this.src='${WIDGET_URL}/images/MAGGIE.png'" 
             alt="MAGGIE" 
             style="object-position: top center;">`;

    const frame = document.createElement('iframe');
    frame.id = 'maice-widget-frame';
    frame.src = WIDGET_URL + '?widget=true';
    frame.style.flex = "1";
    frame.allow = "microphone; camera; clipboard-write";

    container.appendChild(closeBtn);
    container.appendChild(launcher);
    container.appendChild(persona);
    container.appendChild(frame);
    document.body.appendChild(container);

    function toggleWidget() {
        container.classList.toggle('expanded');
    }
})();
