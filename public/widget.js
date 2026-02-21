(function () {
    //  MAGGIE Widget Injection Script
    // Usage: <script src="https://companain.life/widget.js"></script>

    const WIDGET_URL = window.location.origin === 'http://localhost:3000' || window.location.origin === 'http://localhost:8000'
        ? window.location.origin
        : (window.location.origin.includes('vercel.app') ? window.location.origin : 'https://maice-eosin.vercel.app');

    // 1. Create Styles
    const style = document.createElement('style');
    style.innerHTML = `
        #MAGGIE-widget-container {
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 60px;
            height: 60px;
            z-index: 999999;
            transition: all 0.2s ease-in-out;
            font-family: 'Poppins', sans-serif;
        }
        #MAGGIE-widget-container.expanded {
            width: 500px;
            height: 600px;
            bottom: 20px;
            right: 20px;
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
            order: 1; /* Move to the left */
        }
        #MAGGIE-widget-container.expanded #MAGGIE-widget-persona {
            display: block;
        }
        #MAGGIE-widget-persona img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            object-position: top center;
        }
        #MAGGIE-widget-launcher {
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
            order: 2; /* Move to the right */
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
    persona.innerHTML = `<img src="${WIDGET_URL}/images/MAGGIE.png" alt="MAGGIE">`;

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
})();
