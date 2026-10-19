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
  // CERTIFICATES MASTER DATA & INTERACTIVE SHOWCASE
  // ==========================================================================
  const certificatesData = [
    {
      index: 0,
      img: 'assets/certificates/google-gemini-ambassador.jpg',
      title: 'Google Student Ambassador 2026 Candidate',
      org: 'Google Gemini Community (#TeamGoogle)',
      badge: 'Google AI • Student Ambassador',
      id: 'GG-GEMINI-AMB-2026',
      category: 'google',
      skills: ['Google Gemini 1.5/2.0', 'Generative AI', 'AI Prompting', 'Developer Outreach'],
      desc: "Official Google Student Ambassador 2026 candidate badge for Ayush Rawat, representing Google Gemini AI technologies to empower student developers with cutting-edge generative tools."
    },
    {
      index: 1,
      img: 'assets/certificates/iit-delhi-tryst26.jpg',
      title: 'Campus Ambassador — Certificate of Excellence',
      org: 'Indian Institute of Technology (IIT) Delhi • TRYST\'26',
      badge: 'IIT Delhi • Excellence Award',
      id: 'IITD-TRYST26-CA-7201',
      category: 'iit',
      skills: ['Technical Conclave', 'Student Outreach', 'Event Leadership', 'IIT Delhi TRYST'],
      desc: "Awarded to Ayush Rawat for outstanding performance and high-impact contributions as Campus Ambassador at TRYST'26, signed by Chairman Anup Singh, Co-Chairman Agam Gupta, and Overall Coordinator Abhayveer Singh."
    },
    {
      index: 2,
      img: 'assets/certificates/iit-delhi-becon26.jpg',
      title: 'Campus Ambassador — Certificate of Participation',
      org: 'Entrepreneurship Development Cell (eDC), IIT Delhi',
      badge: 'eDC IIT Delhi • BECON \'26',
      id: 'IITD-BECON26-EDC-489',
      category: 'iit',
      skills: ['Startup Ecosystem', 'Conclave Management', 'Campus Relations', 'Entrepreneurship'],
      desc: "Awarded to Ayush Rawat for remarkable dedication and significant impact as a Campus Ambassador for BECON '26, the Annual Business and Entrepreneurship Conclave of eDC IIT Delhi (Tenure: 15th Dec 2025 – 2nd Feb 2026)."
    },
    {
      index: 3,
      img: 'assets/certificates/gfg-completion-certificate.png',
      title: 'Campus Mantri — Official Completion Certificate',
      org: 'GeeksforGeeks • Campus Body (Signed by Mr. Sandeep Jain, CEO)',
      badge: 'GeeksforGeeks • 1-Year Honor',
      id: 'GfG#CM2026-0178',
      category: 'gfg',
      skills: ['Campus Leadership', 'Student Community Mentorship', 'Tech Outreach', 'GeeksforGeeks Campus Body'],
      desc: "Official Completion Certificate presented to Ayush Rawat for outstanding contribution to GeeksforGeeks through the Campus Mantri program, signed by Mr. Sandeep Jain, Founder and CEO of GeeksforGeeks (Certificate ID: GfG#CM2026-0178)."
    },
    {
      index: 4,
      img: 'assets/certificates/gfg-campus-mantri.png',
      title: 'Campus Mantri — Official Campus Body Appointment',
      org: 'GeeksforGeeks Campus Body & MVIET',
      badge: 'GeeksforGeeks • Campus Leadership',
      id: 'GFG-MVIET-MANTRI-2025',
      category: 'gfg',
      skills: ['DSA Bootcamps', 'Student Chapter Leader', 'Peer Mentoring', 'MVIET CSE Chapter'],
      desc: "Official GeeksforGeeks Campus Body appointment poster featuring Ayush Rawat, Campus Mantri, BTech CSE 2nd Year, Madhu Vachaspati Institute of Engineering & Technology (MVIET)."
    }
  ];

  // --- 1. 3D Mouse Tilt & Holographic Sheen on Bento Cards ---
  const bentoCards = document.querySelectorAll('.cert-card-3d');
  bentoCards.forEach((card) => {
    card.addEventListener('mousemove', (e) => {
      if (card.classList.contains('flipped')) return;
      const rect = card.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      const rotateX = (0.5 - y) * 14;
      const rotateY = (x - 0.5) * 14;
      const inner = card.querySelector('.cert-card-inner');
      if (inner) {
        inner.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.015, 1.015, 1.015)`;
      }
      const sheen = card.querySelector('.cert-hologram-sheen');
      if (sheen) {
        sheen.style.background = `radial-gradient(circle at ${x * 100}% ${y * 100}%, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 65%)`;
      }
    });

    card.addEventListener('mouseleave', () => {
      const inner = card.querySelector('.cert-card-inner');
      if (inner && !card.classList.contains('flipped')) {
        inner.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
      }
    });
  });

  // --- 2. Interactive 3D Card Flip Handlers ---
  document.querySelectorAll('.btn-cert-flip').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const card = btn.closest('.cert-card-3d');
      if (card) {
        card.classList.add('flipped');
        const inner = card.querySelector('.cert-card-inner');
        if (inner) inner.style.transform = 'rotateY(180deg)';
      }
    });
  });

  document.querySelectorAll('.btn-cert-flip-back').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const card = btn.closest('.cert-card-3d');
      if (card) {
        card.classList.remove('flipped');
        const inner = card.querySelector('.cert-card-inner');
        if (inner) inner.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
      }
    });
  });

  document.querySelectorAll('.btn-cert-inspect-trigger').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const targetIdx = Number(btn.getAttribute('data-target') || 0);
      openLightboxByIndex(targetIdx);
    });
  });

  // --- 3. View Mode Switcher: Bento Grid vs 3D Deck Carousel ---
  const viewGridBtn = document.getElementById('view-mode-grid');
  const viewDeckBtn = document.getElementById('view-mode-deck');
  const gridShowcase = document.getElementById('cert-grid-showcase');
  const deckShowcase = document.getElementById('cert-deck-showcase');
  const deckViewport = document.getElementById('deck-viewport');
  const deckDotsWrap = document.getElementById('deck-dots');
  let currentDeckIndex = 0;
  let activeFilteredCerts = [...certificatesData];

  function buildDeckCarousel() {
    if (!deckViewport || !deckDotsWrap) return;
    deckViewport.innerHTML = '';
    deckDotsWrap.innerHTML = '';

    if (activeFilteredCerts.length === 0) {
      deckViewport.innerHTML = '<p style="color:var(--text-muted); padding:40px;">No credentials found in this category.</p>';
      return;
    }

    if (currentDeckIndex >= activeFilteredCerts.length) {
      currentDeckIndex = 0;
    }

    activeFilteredCerts.forEach((cert, idx) => {
      const slide = document.createElement('div');
      slide.className = 'deck-card-slide';
      slide.setAttribute('data-deck-index', idx);
      slide.innerHTML = `
        <div class="cert-image-container">
          <img src="${cert.img}" alt="${cert.title}" class="cert-thumb" loading="lazy">
          <span class="cert-corner-badge ${cert.category.includes('google') ? 'google-badge' : cert.category.includes('iit') ? 'iit-badge' : cert.category.includes('gfg') ? 'gfg-badge' : cert.category.includes('internships') ? 'ibm-badge' : 'leet-badge'}">${cert.badge.split('•')[0].trim()}</span>
          <div class="cert-verified-pill">
            <span class="pulse-dot"></span> Verified Credential
          </div>
        </div>
        <div class="cert-info">
          <div class="cert-meta-row">
            <span class="cert-tag">${cert.category.toUpperCase()}</span>
            <span class="cert-id-badge">${cert.id}</span>
          </div>
          <h3 class="cert-title">${cert.title}</h3>
          <h4 class="cert-issuer">${cert.org}</h4>
          <p class="cert-desc">${cert.desc}</p>
          <button class="btn-cert-open" style="margin-top:auto;" onclick="window.openLightboxByIndexGlobal(${cert.index})">
            <span>View Fullscreen &amp; Zoom</span>
            <span class="cert-arrow">↗</span>
          </button>
        </div>
      `;

      slide.addEventListener('click', (e) => {
        if (!e.target.closest('button')) {
          if (idx === currentDeckIndex) {
            openLightboxByIndex(cert.index);
          } else {
            setDeckSlide(idx);
          }
        }
      });

      deckViewport.appendChild(slide);

      // Dot indicator
      const dot = document.createElement('div');
      dot.className = `deck-dot ${idx === currentDeckIndex ? 'active' : ''}`;
      dot.addEventListener('click', () => setDeckSlide(idx));
      deckDotsWrap.appendChild(dot);
    });

    updateDeckSlides();
  }

  function setDeckSlide(newIndex) {
    if (activeFilteredCerts.length === 0) return;
    const len = activeFilteredCerts.length;
    currentDeckIndex = (newIndex + len) % len;
    updateDeckSlides();
  }

  function updateDeckSlides() {
    const slides = deckViewport.querySelectorAll('.deck-card-slide');
    const dots = deckDotsWrap.querySelectorAll('.deck-dot');
    const len = slides.length;
    if (len === 0) return;

    slides.forEach((slide, idx) => {
      slide.className = 'deck-card-slide';
      if (idx === currentDeckIndex) {
        slide.classList.add('active');
      } else if (idx === (currentDeckIndex - 1 + len) % len) {
        slide.classList.add('prev');
      } else if (idx === (currentDeckIndex + 1) % len) {
        slide.classList.add('next');
      }
    });

    dots.forEach((dot, idx) => {
      dot.classList.toggle('active', idx === currentDeckIndex);
    });
  }

  const deckPrevBtn = document.getElementById('deck-prev');
  const deckNextBtn = document.getElementById('deck-next');
  if (deckPrevBtn) deckPrevBtn.addEventListener('click', () => setDeckSlide(currentDeckIndex - 1));
  if (deckNextBtn) deckNextBtn.addEventListener('click', () => setDeckSlide(currentDeckIndex + 1));

  if (viewGridBtn && viewDeckBtn && gridShowcase && deckShowcase) {
    viewGridBtn.addEventListener('click', () => {
      viewGridBtn.classList.add('active');
      viewDeckBtn.classList.remove('active');
      gridShowcase.style.display = 'grid';
      deckShowcase.style.display = 'none';
    });

    viewDeckBtn.addEventListener('click', () => {
      viewDeckBtn.classList.add('active');
      viewGridBtn.classList.remove('active');
      gridShowcase.style.display = 'none';
      deckShowcase.style.display = 'block';
      buildDeckCarousel();
    });
  }

  // --- 4. Interactive Category Filtering ---
  const certFilterBtns = document.querySelectorAll('.cert-filter-btn');
  if (certFilterBtns.length > 0) {
    certFilterBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        certFilterBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const filter = btn.getAttribute('data-filter');

        // Filter Bento Grid
        bentoCards.forEach((card) => {
          const category = card.getAttribute('data-category') || '';
          if (filter === 'all' || category.includes(filter)) {
            card.classList.remove('hidden');
          } else {
            card.classList.add('hidden');
          }
        });

        // Filter active dataset for deck
        if (filter === 'all') {
          activeFilteredCerts = [...certificatesData];
        } else {
          activeFilteredCerts = certificatesData.filter((c) => c.category.includes(filter));
        }
        currentDeckIndex = 0;
        if (deckShowcase && deckShowcase.style.display !== 'none') {
          buildDeckCarousel();
        }
      });
    });
  }

  // --- 5. Enhanced Fullscreen Lightbox Modal with Zoom & Keyboard Controls ---
  const certLightbox = document.getElementById('cert-lightbox');
  const lightboxImg = document.getElementById('lightbox-img');
  const lightboxTitle = document.getElementById('lightbox-title');
  const lightboxOrg = document.getElementById('lightbox-org');
  const lightboxBadge = document.getElementById('lightbox-badge');
  const lightboxDesc = document.getElementById('lightbox-desc');
  const lightboxIdText = document.getElementById('lightbox-id-text');
  const lightboxCopyIdBtn = document.getElementById('lightbox-copy-id');
  const lightboxSkillsWrap = document.getElementById('lightbox-skills-pills');
  const lightboxOpenRaw = document.getElementById('lightbox-open-raw');
  const lightboxCounterIdx = document.getElementById('lightbox-counter-idx');
  const lightboxCounterTotal = document.getElementById('lightbox-counter-total');
  const lightboxClose = document.getElementById('lightbox-close');
  const lightboxBackdrop = document.getElementById('lightbox-backdrop');

  const lightboxPrevBtn = document.getElementById('lightbox-prev-btn');
  const lightboxNextBtn = document.getElementById('lightbox-next-btn');
  const lightboxNavMiniPrev = document.getElementById('lightbox-nav-mini-prev');
  const lightboxNavMiniNext = document.getElementById('lightbox-nav-mini-next');

  const zoomInBtn = document.getElementById('lightbox-zoom-in');
  const zoomOutBtn = document.getElementById('lightbox-zoom-out');
  const zoomResetBtn = document.getElementById('lightbox-zoom-reset');

  let currentLightboxIndex = 0;
  let lightboxZoomScale = 1;

  function applyZoom(scale) {
    lightboxZoomScale = Math.min(Math.max(scale, 0.75), 3.0);
    if (lightboxImg) {
      lightboxImg.style.transform = `scale(${lightboxZoomScale})`;
    }
  }

  function openLightboxByIndex(index) {
    if (!certLightbox) return;
    const len = certificatesData.length;
    currentLightboxIndex = (index + len) % len;
    const data = certificatesData[currentLightboxIndex];

    if (lightboxImg) {
      lightboxImg.src = data.img;
      lightboxZoomScale = 1;
      lightboxImg.style.transform = 'scale(1)';
    }
    if (lightboxTitle) lightboxTitle.textContent = data.title;
    if (lightboxOrg) lightboxOrg.textContent = data.org;
    if (lightboxBadge) lightboxBadge.textContent = data.badge;
    if (lightboxDesc) lightboxDesc.textContent = data.desc;
    if (lightboxIdText) lightboxIdText.textContent = `ID: ${data.id}`;
    if (lightboxOpenRaw) lightboxOpenRaw.href = data.img;

    if (lightboxCounterIdx) lightboxCounterIdx.textContent = currentLightboxIndex + 1;
    if (lightboxCounterTotal) lightboxCounterTotal.textContent = len;

    // Populate skills tags
    if (lightboxSkillsWrap) {
      lightboxSkillsWrap.innerHTML = '';
      data.skills.forEach((skill) => {
        const tag = document.createElement('span');
        tag.className = 'lightbox-skill-tag';
        tag.textContent = skill;
        lightboxSkillsWrap.appendChild(tag);
      });
    }

    certLightbox.classList.add('active');
    certLightbox.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  // Global helper so inline onclick in deck cards works reliably
  window.openLightboxByIndexGlobal = openLightboxByIndex;

  function closeLightbox() {
    if (!certLightbox) return;
    certLightbox.classList.remove('active');
    certLightbox.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function nextLightbox() {
    openLightboxByIndex(currentLightboxIndex + 1);
  }

  function prevLightbox() {
    openLightboxByIndex(currentLightboxIndex - 1);
  }

  // Wire Lightbox Open Buttons
  document.querySelectorAll('.btn-cert-open').forEach((btn) => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.cert-card-3d');
      const idx = card ? Number(card.getAttribute('data-cert-index') || 0) : 0;
      openLightboxByIndex(idx);
    });
  });

  // Wire Card Thumbnail clicks for quick-open
  document.querySelectorAll('.cert-image-container').forEach((wrap) => {
    wrap.addEventListener('click', () => {
      const card = wrap.closest('.cert-card-3d');
      if (card) {
        const idx = Number(card.getAttribute('data-cert-index') || 0);
        openLightboxByIndex(idx);
      }
    });
  });

  // Lightbox Close
  if (lightboxClose) lightboxClose.addEventListener('click', closeLightbox);
  if (lightboxBackdrop) lightboxBackdrop.addEventListener('click', closeLightbox);

  // Lightbox Navigation Controls
  if (lightboxPrevBtn) lightboxPrevBtn.addEventListener('click', prevLightbox);
  if (lightboxNextBtn) lightboxNextBtn.addEventListener('click', nextLightbox);
  if (lightboxNavMiniPrev) lightboxNavMiniPrev.addEventListener('click', prevLightbox);
  if (lightboxNavMiniNext) lightboxNavMiniNext.addEventListener('click', nextLightbox);

  // Zoom Controls
  if (zoomInBtn) zoomInBtn.addEventListener('click', () => applyZoom(lightboxZoomScale + 0.25));
  if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => applyZoom(lightboxZoomScale - 0.25));
  if (zoomResetBtn) zoomResetBtn.addEventListener('click', () => applyZoom(1));

  // Copy ID button
  if (lightboxCopyIdBtn) {
    lightboxCopyIdBtn.addEventListener('click', () => {
      const data = certificatesData[currentLightboxIndex];
      if (data && data.id) {
        navigator.clipboard.writeText(data.id).then(() => {
          lightboxCopyIdBtn.textContent = '✓';
          setTimeout(() => { lightboxCopyIdBtn.textContent = '📋'; }, 2000);
        });
      }
    });
  }

  // Keyboard navigation for Lightbox and Deck
  window.addEventListener('keydown', (e) => {
    if (certLightbox && certLightbox.classList.contains('active')) {
      if (e.key === 'Escape') {
        closeLightbox();
      } else if (e.key === 'ArrowRight') {
        nextLightbox();
      } else if (e.key === 'ArrowLeft') {
        prevLightbox();
      } else if (e.key === '+' || e.key === '=') {
        applyZoom(lightboxZoomScale + 0.25);
      } else if (e.key === '-' || e.key === '_') {
        applyZoom(lightboxZoomScale - 0.25);
      } else if (e.key === '0') {
        applyZoom(1);
      }
    } else if (deckShowcase && deckShowcase.style.display !== 'none') {
      if (e.key === 'ArrowRight') {
        setDeckSlide(currentDeckIndex + 1);
      } else if (e.key === 'ArrowLeft') {
        setDeckSlide(currentDeckIndex - 1);
      }
    }
  });

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
