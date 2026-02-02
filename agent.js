/**
 * Browser Challenge Agent v11
 * Better modal scrolling + drag-drop support
 */
const { chromium } = require('playwright');
const fs = require('fs');

const CHALLENGE_URL = 'https://serene-frangipane-7fd25b.netlify.app/';
const TOTAL_STEPS = 30;
const MAX_TIME_MS = 5 * 60 * 1000;

const metrics = {
  startTime: null,
  endTime: null,
  stepTimes: [],
  totalTimeMs: 0,
  errors: [],
  stepsCompleted: 0,
  success: false
};

const usedCodes = new Map();

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getCurrentStep(page) {
  try {
    const text = await page.textContent('body', { timeout: 2000 });
    const match = text.match(/Step (\d+) of 30/);
    return match ? parseInt(match[1]) : null;
  } catch (e) { return null; }
}

async function isComplete(page) {
  try {
    const text = await page.textContent('body', { timeout: 2000 });
    return text.toLowerCase().includes('congratulations');
  } catch (e) { return false; }
}

// Extract code from DOM and text
async function extractCode(page) {
  return await page.evaluate(() => {
    // Check data-challenge-code
    const dataCodeEl = document.querySelector('[data-challenge-code]');
    if (dataCodeEl) {
      const code = dataCodeEl.getAttribute('data-challenge-code');
      if (code && code.length === 6) return code;
    }
    
    // Check all data attributes
    for (const el of document.querySelectorAll('*')) {
      for (const attr of el.attributes) {
        if (attr.name.startsWith('data-') && /^[A-Z0-9]{6}$/.test(attr.value)) {
          return attr.value;
        }
      }
    }
    
    // Text content
    const text = document.body.innerText;
    const patterns = [/\b[A-Z]{6}\b/g, /\b\d{6}\b/g, /\b[A-Z0-9]{6}\b/g];
    const skip = ['SUBMIT', 'SELECT', 'OPTION', 'BUTTON', 'SCROLL', 'COOKIE', 'PLEASE', 'ACCEPT', 'REVEAL', 'WRONG', 'HIDDEN'];
    for (const p of patterns) {
      const matches = text.match(p);
      if (matches) {
        for (const m of matches) {
          if (!skip.includes(m)) return m;
        }
      }
    }
    return null;
  });
}

// Close popups
async function closePopups(page) {
  await page.evaluate(() => {
    document.querySelectorAll('button').forEach(btn => {
      const text = (btn.textContent || '').toLowerCase().trim();
      if (['dismiss', 'close', 'accept', 'decline'].includes(text)) {
        try { btn.click(); } catch(e) {}
      }
    });
  });
}

// IMPROVED: Handle scrollable modals - scroll to bottom then find radio
async function handleScrollableModal(page) {
  // First scroll the modal content to bottom to reveal radio buttons
  await page.evaluate(() => {
    // Find modal containers and scroll them
    document.querySelectorAll('.fixed, .modal, [role="dialog"], [class*="modal"]').forEach(modal => {
      // Find scrollable child
      modal.querySelectorAll('*').forEach(el => {
        if (el.scrollHeight > el.clientHeight + 50) {
          el.scrollTop = el.scrollHeight;
        }
      });
      // Also scroll the modal itself
      if (modal.scrollHeight > modal.clientHeight) {
        modal.scrollTop = modal.scrollHeight;
      }
    });
    
    // Also scroll any overflow element
    document.querySelectorAll('*').forEach(el => {
      const style = window.getComputedStyle(el);
      if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && 
          el.scrollHeight > el.clientHeight + 50) {
        el.scrollTop = el.scrollHeight;
      }
    });
  });
  await delay(200);
  
  // Now find and click correct radio button
  await page.evaluate(() => {
    const correctIndicators = ['correct', 'right choice', 'option b - correct', 'correct answer', 'the right'];
    let found = false;
    document.querySelectorAll('input[type="radio"]').forEach(radio => {
      if (found) return;
      const parent = radio.closest('div') || radio.closest('label');
      const text = parent ? parent.textContent.toLowerCase() : '';
      for (const indicator of correctIndicators) {
        if (text.includes(indicator)) {
          radio.click();
          found = true;
          break;
        }
      }
    });
  });
  await delay(100);
  
  // Submit modal
  await page.evaluate(() => {
    document.querySelectorAll('button').forEach(btn => {
      const text = btn.textContent || '';
      if ((text.includes('Submit') && text.includes('Continue')) || text === 'Submit & Continue') {
        if (!btn.disabled) btn.click();
      }
    });
  });
}

// Handle drag and drop puzzle
async function handleDragDrop(page) {
  try {
    // Find draggable pieces and drop zones
    const pieces = await page.$$('[draggable="true"], [class*="piece"], [class*="drag"]');
    const slots = await page.$$('[class*="slot"], [class*="drop"], [class*="zone"]');
    
    for (let i = 0; i < Math.min(pieces.length, slots.length); i++) {
      try {
        await pieces[i].dragTo(slots[i]);
        await delay(100);
      } catch (e) {}
    }
  } catch (e) {}
}

// Click reveal/code buttons
async function clickRevealButtons(page) {
  await page.evaluate(() => {
    document.querySelectorAll('button').forEach(btn => {
      const text = (btn.textContent || '').toLowerCase();
      if (text.includes('reveal') || text === 'code revealed') {
        try { btn.click(); } catch(e) {}
      }
    });
  });
}

// Click floating buttons
async function clickFloatingButtons(page) {
  await page.evaluate(() => {
    const floatingTexts = ['click me!', 'here!', 'link!', 'try this!', 'button!', 'moving!', 'click here!'];
    document.querySelectorAll('*').forEach(el => {
      const text = (el.textContent || '').trim().toLowerCase();
      if (floatingTexts.includes(text)) {
        try { el.click(); } catch(e) {}
      }
    });
  });
}

// Hover
async function handleHover(page) {
  await page.evaluate(() => {
    document.querySelectorAll('[class*="hover"]').forEach(el => {
      el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    });
  });
}

// Page scroll
async function handleScroll(page) {
  await page.evaluate(() => window.scrollTo(0, 600));
  await delay(50);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
}

// Enter code
async function enterCode(page, code) {
  try {
    const input = await page.$('input[placeholder*="code"]');
    if (input) {
      await input.fill(code);
      await delay(100);
    }
  } catch (e) {}
  
  await page.evaluate(() => {
    document.querySelectorAll('button').forEach(btn => {
      const text = (btn.textContent || '');
      if (text.includes('Submit') && !btn.disabled) {
        btn.click();
      }
    });
  });
}

async function solveStep(page, step) {
  // Close popups
  for (let i = 0; i < 3; i++) {
    await closePopups(page);
    await delay(30);
  }
  
  // Handle scrollable modal (SCROLL FIRST, then radio)
  await handleScrollableModal(page);
  await delay(150);
  
  // Close popups
  await closePopups(page);
  
  // Handle drag-drop
  await handleDragDrop(page);
  await delay(100);
  
  // Page scroll
  await handleScroll(page);
  
  // Click floating buttons
  await clickFloatingButtons(page);
  await delay(50);
  
  // Click reveal buttons  
  await clickRevealButtons(page);
  await delay(100);
  
  // Hover
  await handleHover(page);
  await delay(50);
  
  // Close popups
  await closePopups(page);
  
  // Find code
  let code = await extractCode(page);
  
  if (code) {
    const stepCodes = usedCodes.get(step) || new Set();
    if (stepCodes.has(code)) return null;
  }
  
  return code;
}

async function run() {
  console.log('╔════════════════════════════════════════════╗');
  console.log('║  Browser Challenge Agent v11               ║');
  console.log('║  Better modal + drag-drop support          ║');
  console.log('╚════════════════════════════════════════════╝\n');
  
  metrics.startTime = Date.now();
  
  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox']
  });
  
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  
  try {
    await page.goto(CHALLENGE_URL, { waitUntil: 'domcontentloaded' });
    await delay(500);
    
    await page.click('button:has-text("START")');
    console.log('Started!\n');
    await delay(2000);
    
    let lastStep = 0;
    let stuckCount = 0;
    
    for (let attempt = 0; attempt < 700; attempt++) {
      if (Date.now() - metrics.startTime > MAX_TIME_MS) {
        console.log('\n⏰ Time limit!');
        break;
      }
      
      if (await isComplete(page)) {
        console.log('\n🎉 COMPLETE!');
        metrics.success = true;
        break;
      }
      
      const step = await getCurrentStep(page);
      if (!step) { await delay(100); continue; }
      
      if (step > lastStep) {
        console.log(`\n=== Step ${step}/${TOTAL_STEPS} ===`);
        lastStep = step;
        metrics.stepsCompleted = step;
        stuckCount = 0;
        usedCodes.set(step, new Set());
      }
      
      const code = await solveStep(page, step);
      
      if (code) {
        const stepCodes = usedCodes.get(step) || new Set();
        stepCodes.add(code);
        usedCodes.set(step, stepCodes);
        
        console.log(`  Code: ${code}`);
        await enterCode(page, code);
        console.log('  ✓ Submitted');
        await delay(400);
      } else {
        stuckCount++;
        if (stuckCount === 35) {
          await page.screenshot({ path: `stuck-step${step}.png` });
          console.log(`  [Stuck on step ${step}]`);
        }
        if (stuckCount > 50) {
          await page.evaluate(() => {
            document.querySelectorAll('button:not([disabled])').forEach(btn => {
              try { btn.click(); } catch(e) {}
            });
          });
          stuckCount = 0;
        }
      }
      
      await delay(70);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    metrics.errors.push(error.message);
  } finally {
    metrics.endTime = Date.now();
    metrics.totalTimeMs = metrics.endTime - metrics.startTime;
    
    await page.screenshot({ path: 'final.png' }).catch(() => {});
    await browser.close();
  }
  
  console.log('\n=== RESULTS ===');
  console.log(`Status: ${metrics.success ? 'SUCCESS' : 'INCOMPLETE'}`);
  console.log(`Steps: ${metrics.stepsCompleted}/${TOTAL_STEPS}`);
  console.log(`Time: ${(metrics.totalTimeMs / 1000).toFixed(1)}s`);
  
  fs.writeFileSync('metrics.json', JSON.stringify(metrics, null, 2));
}

run().catch(console.error);
