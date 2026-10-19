(() => {
  'use strict';

  // --- Configuration ---
  const TOTAL_FRAMES = 192;
  const FRAME_PREFIX = 'video_frames_24fps/frame_';
  const FRAME_EXT = '.png';
  const LERP_FACTOR = 0.085; // Butter-smooth easing for scrubbing

  // --- DOM Elements ---
  const canvas = document.getElementById('animation-canvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const loader = document.getElementById('loader');
  const loaderBar = document.getElementById('loader-bar');
  const loaderPercent = document.getElementById('loader-percent');
  const loaderCount = document.getElementById('loader-count');
  const scrollPrompt = document.getElementById('scroll-prompt');
  const currentFrameNum = document.getElementById('current-frame-num');
  const navLinks = document.querySelectorAll('.nav-link');
  const sections = document.querySelectorAll('section[id]');
  const backToTopBtn = document.getElementById('back-to-top');

  // --- State Variables ---
  const images = new Array(TOTAL_FRAMES + 1);
  const loadedStatus = new Array(TOTAL_FRAMES + 1).fill(false);
  let loadedCount = 0;
  let targetFrame = 1;
  let currentFrame = 1;
  let lastRenderedFrame = -1;
  let isReady = false;
  let lenisInstance = null;

  // --- Helper Functions ---
  const formatIndex = (i) => String(i).padStart(4, '0');
  const getFrameUrl = (i) => `${FRAME_PREFIX}${formatIndex(i)}${FRAME_EXT}`;

  // Smart fallback lookup: searches nearest loaded frame to eliminate black frame flicker
  function getNearestLoadedImage(targetIdx) {
    if (loadedStatus[targetIdx] && images[targetIdx]) {
      return images[targetIdx];
    }
    for (let offset = 1; offset < TOTAL_FRAMES; offset++) {
      const prev = targetIdx - offset;
      if (prev >= 1 && loadedStatus[prev] && images[prev]) {
        return images[prev];
      }
      const next = targetIdx + offset;
      if (next <= TOTAL_FRAMES && loadedStatus[next] && images[next]) {
        return images[next];
      }
    }
    return images[1] || null;
  }

  // --- Canvas Sizing & High-DPI (Retina) Scaling ---
  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const displayWidth = window.innerWidth;
    const displayHeight = window.innerHeight;

    if (canvas.width !== Math.floor(displayWidth * dpr) || canvas.height !== Math.floor(displayHeight * dpr)) {
      canvas.width = Math.floor(displayWidth * dpr);
      canvas.height = Math.floor(displayHeight * dpr);
      lastRenderedFrame = -1; // force redraw
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    if (isReady || loadedStatus[1]) {
      renderFrame(Math.round(currentFrame), true);
    }
  }

  // --- Draw Frame (object-fit: cover) ---
  function renderFrame(frameIdx, force = false) {
    const boundedIdx = Math.max(1, Math.min(TOTAL_FRAMES, frameIdx));
    if (!force && boundedIdx === lastRenderedFrame) return;

    const img = getNearestLoadedImage(boundedIdx);
    if (!img || !img.complete || img.naturalWidth === 0) return;

    const cW = canvas.width;
    const cH = canvas.height;
    const iW = img.naturalWidth;
    const iH = img.naturalHeight;

    // object-fit: cover calculation
    const scale = Math.max(cW / iW, cH / iH);
    const drawW = Math.ceil(iW * scale);
    const drawH = Math.ceil(iH * scale);
    const drawX = Math.floor((cW - drawW) * 0.5);
    const drawY = Math.floor((cH - drawH) * 0.5);

    ctx.drawImage(img, drawX, drawY, drawW, drawH);
    lastRenderedFrame = boundedIdx;

    if (currentFrameNum) {
      currentFrameNum.textContent = String(boundedIdx).padStart(3, '0');
    }
  }

  // --- Preloader Management ---
  function updateProgress() {
    const percent = Math.round((loadedCount / TOTAL_FRAMES) * 100);
    if (loaderBar) loaderBar.style.width = `${percent}%`;
    if (loaderPercent) loaderPercent.textContent = `${percent}%`;
    if (loaderCount) loaderCount.textContent = `${loadedCount} / ${TOTAL_FRAMES}`;

    // Reveal page as soon as a comfortable initial buffer (25+ frames) or all are ready
    if (!isReady && (loadedCount >= Math.min(25, TOTAL_FRAMES) || loadedCount === TOTAL_FRAMES)) {
      isReady = true;
      setTimeout(() => {
        if (loader) loader.classList.add('loaded');
      }, 300);
    }
  }

  function preloadImages() {
    // 1. Prioritize frame 1 for instant display
    const firstImg = new Image();
    firstImg.onload = () => {
      images[1] = firstImg;
      loadedStatus[1] = true;
      loadedCount++;
      updateProgress();
      resizeCanvas();
      renderFrame(1, true);

      // 2. Load remaining frames concurrently
      loadRemainingFrames();
    };
    firstImg.onerror = () => {
      console.error('Failed to load frame 1 from', getFrameUrl(1));
      loadRemainingFrames();
    };
    firstImg.src = getFrameUrl(1);
  }

  function loadRemainingFrames() {
    for (let i = 2; i <= TOTAL_FRAMES; i++) {
      const img = new Image();
      img.onload = () => {
        images[i] = img;
        loadedStatus[i] = true;
        loadedCount++;
        updateProgress();

        if (Math.round(currentFrame) === i) {
          renderFrame(i, true);
        }
      };
      img.onerror = () => {
        console.warn(`Frame ${i} failed to load.`);
        loadedCount++;
        updateProgress();
      };
      img.src = getFrameUrl(i);
    }
  }

  // --- Scroll Tracking & Active Navigation ---
  function onScroll() {
    const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const progress = Math.max(0, Math.min(1, scrollTop / maxScroll));

    // Map scroll percentage to frames 1 -> 192
    targetFrame = 1 + progress * (TOTAL_FRAMES - 1);

    // Toggle scroll prompt
    if (scrollPrompt) {
      if (scrollTop > 60) {
        scrollPrompt.classList.add('hidden');
      } else {
        scrollPrompt.classList.remove('hidden');
      }
    }

    // Active Section Spy for Navigation Pills
    updateActiveNav(scrollTop);
  }

  function updateActiveNav(scrollTop) {
    const scrollPos = scrollTop + 200;
    sections.forEach((sec) => {
      const top = sec.offsetTop;
      const height = sec.offsetHeight;
      const id = sec.getAttribute('id');

      if (scrollPos >= top && scrollPos < top + height) {
        navLinks.forEach((link) => {
          if (link.getAttribute('href') === `#${id}`) {
            link.classList.add('active');
          } else {
            link.classList.remove('active');
          }
        });
      }
    });
  }

  // --- Animation / Lerp Loop ---
  function tick() {
    const diff = targetFrame - currentFrame;
    if (Math.abs(diff) > 0.001) {
      currentFrame += diff * LERP_FACTOR;
    } else {
      currentFrame = targetFrame;
    }

    renderFrame(Math.round(currentFrame));
    requestAnimationFrame(tick);
  }

  // --- Lenis Smooth Scroll Setup ---
  function initSmoothScroll() {
    if (typeof window.Lenis !== 'undefined') {
      try {
        lenisInstance = new window.Lenis({
          duration: 1.25,
          easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
          orientation: 'vertical',
          gestureOrientation: 'vertical',
          smoothWheel: true,
          wheelMultiplier: 1.0,
          touchMultiplier: 1.5,
          infinite: false,
        });

        lenisInstance.on('scroll', onScroll);

        function lenisRaf(time) {
          lenisInstance.raf(time);
          requestAnimationFrame(lenisRaf);
        }
        requestAnimationFrame(lenisRaf);

        // Smooth anchor link scrolling via Lenis
        document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
          anchor.addEventListener('click', (e) => {
            const targetId = anchor.getAttribute('href');
            if (targetId === '#' || !targetId) return;
            const targetEl = document.querySelector(targetId);
            if (targetEl) {
              e.preventDefault();
              lenisInstance.scrollTo(targetEl, { offset: -30, duration: 1.3 });
            }
          });
        });

        return;
      } catch (e) {
        console.warn('Lenis initialization failed, falling back to native smooth scroll', e);
      }
    }

    // Fallback: standard scroll listener & smooth scroll
    window.addEventListener('scroll', onScroll, { passive: true });
    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
      anchor.addEventListener('click', (e) => {
        const targetId = anchor.getAttribute('href');
        if (targetId === '#' || !targetId) return;
        const targetEl = document.querySelector(targetId);
        if (targetEl) {
          e.preventDefault();
          targetEl.scrollIntoView({ behavior: 'smooth' });
        }
      });
    });
  }

  // Back to top button handler
  if (backToTopBtn) {
    backToTopBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (lenisInstance) {
        lenisInstance.scrollTo(0, { duration: 1.5 });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  }

  // --- 1-Click Copy Email ---
  const copyBtn = document.getElementById('copy-email-btn');
  const emailTextEl = document.getElementById('email-text');
  if (copyBtn && emailTextEl) {
    copyBtn.addEventListener('click', () => {
      const email = emailTextEl.textContent.trim();
      navigator.clipboard.writeText(email).then(() => {
        copyBtn.classList.add('copied');
        copyBtn.querySelector('.copy-text').textContent = 'Copied!';
        setTimeout(() => {
          copyBtn.classList.remove('copied');
          copyBtn.querySelector('.copy-text').textContent = 'Copy';
        }, 2500);
      }).catch(() => {
        // Fallback for older browsers
        const temp = document.createElement('textarea');
        temp.value = email;
        document.body.appendChild(temp);
        temp.select();
        document.execCommand('copy');
        document.body.removeChild(temp);
        copyBtn.classList.add('copied');
        copyBtn.querySelector('.copy-text').textContent = 'Copied!';
        setTimeout(() => {
          copyBtn.classList.remove('copied');
          copyBtn.querySelector('.copy-text').textContent = 'Copy';
        }, 2500);
      });
    });
  }

  // --- Contact Form Submission Handler ---
  const contactForm = document.getElementById('portfolio-contact-form');
  const formStatus = document.getElementById('form-status');
  if (contactForm) {
    contactForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('form-name').value;
      const submitBtn = contactForm.querySelector('.btn-submit span');
      const originalText = submitBtn.textContent;

      submitBtn.textContent = 'Sending...';

      setTimeout(() => {
        submitBtn.textContent = originalText;
        if (formStatus) {
          formStatus.className = 'form-status-msg success';
          formStatus.innerHTML = `✓ Thank you, <strong>${name}</strong>! Your message has been sent. I'll reply within 24 hours.`;
          formStatus.style.display = 'block';
        }
        contactForm.reset();
        setTimeout(() => {
          if (formStatus) formStatus.style.display = 'none';
        }, 6000);
      }, 700);
    });
  }

  // ==========================================================================
  // CERTIFICATES SHOWCASE (Currently removed per user request)
  // ==========================================================================

  // Keyboard navigation
  window.addEventListener('keydown', (e) => {
    const scrollStep = window.innerHeight * 0.45;
    if (e.key === 'ArrowDown' || e.key === 'PageDown' || (e.key === ' ' && !e.target.matches('input, textarea'))) {
      if (lenisInstance) {
        lenisInstance.scrollTo(window.scrollY + scrollStep, { duration: 0.8 });
      } else {
        window.scrollBy({ top: scrollStep, behavior: 'smooth' });
      }
    } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
      if (lenisInstance) {
        lenisInstance.scrollTo(window.scrollY - scrollStep, { duration: 0.8 });
      } else {
        window.scrollBy({ top: -scrollStep, behavior: 'smooth' });
      }
    } else if (e.key === 'Home') {
      if (lenisInstance) {
        lenisInstance.scrollTo(0, { duration: 1.2 });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } else if (e.key === 'End') {
      if (lenisInstance) {
        lenisInstance.scrollTo(document.documentElement.scrollHeight, { duration: 1.2 });
      } else {
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
      }
    }
  });

  // --- Initialization ---
  window.addEventListener('resize', resizeCanvas, { passive: true });
  window.addEventListener('scroll', onScroll, { passive: true });

  resizeCanvas();
  initSmoothScroll();
  preloadImages();
  onScroll();
  requestAnimationFrame(tick);

})();
