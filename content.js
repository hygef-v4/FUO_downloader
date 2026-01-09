(() => {
  const ROOT_ID = 'fuo-downloader-floating-root';

  if (document.getElementById(ROOT_ID)) return;

  const rootHost = document.createElement('div');
  rootHost.id = ROOT_ID;
  rootHost.style.all = 'initial';
  rootHost.style.position = 'fixed';
  rootHost.style.right = '16px';
  rootHost.style.bottom = '16px';
  rootHost.style.zIndex = '2147483647';

  const shadow = rootHost.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = `
    :host { all: initial; }

    .wrap {
      position: relative;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
    }

    .fab {
      width: 64px;
      height: 64px;
      border-radius: 999px;
      border: none;
      cursor: pointer;
      color: #fff;
      font-size: 22px;
      line-height: 1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #4f46e5, #7c3aed);
      box-shadow: 0 10px 25px rgba(79, 70, 229, 0.25);
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }

    .fab:hover {
      transform: translateY(-2px);
      box-shadow: 0 14px 28px rgba(79, 70, 229, 0.3);
    }

    .fab:active { transform: translateY(0); }

    .panel {
      position: absolute;
      right: 0;
      bottom: 76px;
      width: 420px;
      height: 560px;
      max-width: min(420px, calc(100vw - 24px));
      max-height: min(560px, calc(100vh - 120px));
      border-radius: 14px;
      overflow: hidden;
      background: transparent;
      box-shadow: 0 18px 60px rgba(0,0,0,0.22);
      border: 1px solid rgba(0,0,0,0.12);
      display: none;
    }

    .panel.open { display: block; }

    iframe {
      width: 100%;
      height: 100%;
      border: 0;
      background: transparent;
    }
  `;

  const wrap = document.createElement('div');
  wrap.className = 'wrap';

  const button = document.createElement('button');
  button.className = 'fab';
  button.type = 'button';
  button.setAttribute('aria-label', 'Open FUO Downloader');
  button.setAttribute('aria-expanded', 'false');
  button.textContent = '⬇️';

  const panel = document.createElement('div');
  panel.className = 'panel';

  const iframe = document.createElement('iframe');
  iframe.src = chrome.runtime.getURL('popup.html?embedded=1');
  iframe.setAttribute('title', 'FUO Downloader');

  panel.appendChild(iframe);
  wrap.appendChild(panel);
  wrap.appendChild(button);

  shadow.appendChild(style);
  shadow.appendChild(wrap);

  button.addEventListener('click', () => {
    const isOpen = panel.classList.toggle('open');
    button.setAttribute('aria-expanded', String(isOpen));
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.action === 'toggleFloatingUI') {
      button.click();
    }
  });

  document.documentElement.appendChild(rootHost);
})();
