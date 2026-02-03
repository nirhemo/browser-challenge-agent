/**
 * Browser Challenge Agent v18
 * Handle both modal radio + main page navigation button
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

async function extractCode(page) {
  return await page.evaluate(() => {
    const dataCodeEl = document.querySelector('[data-challenge-code]');
    if (dataCodeEl) {
      const code = dataCodeEl.getAttribute('data-challenge-code');
      if (code && code.length === 6) return code;
    }
    
    for (const el of document.querySelectorAll('*')) {
      for (const attr of el.attributes) {
        if (attr.name.startsWith('data-') && /^[A-Z0-9]{6}$/.test(attr.value)) {
          return attr.value;
        }
      }
    }
    
    const text = document.body.innerText;
    const patterns = [/\b[A-Z]{6}\b/g, /\b\d{6}\b/g, /\b[A-Z0-9]{6}\b/g];
    const skip = ['SUBMIT', 'SELECT', 'OPTION', 'BUTTON', 'SCROLL', 'COOKIE', 'PLEASE', 'ACCEPT', 'REVEAL', 'WRONG', 'HIDDEN', 'SECTIO'];
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

// Handle modal with radio buttons
async function handleScrollableModal(page) {
  // Check if modal exists
  const hasModal = await page.evaluate(() => {
    return !!document.querySelector('.fixed, [role="dialog"]');
  });
  
  if (!hasModal) return false;
  
  // Scroll within modal
  await page.evaluate(() => {
    document.querySelectorAll('*').forEach(el => {
      const style = window.getComputedStyle(el);
      if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && 
          el.scrollHeight > el.clientHeight) {
        el.scrollTop = el.scrollHeight;
      }
    });
  });
  
  await delay(150);
  
  // Click correct radio
  const clicked = await page.evaluate(() => {
    const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
    
    for (const radio of radios) {
      const parent = radio.closest('div') || radio.closest('label');
      const text = parent ? parent.textContent.toLowerCase() : '';
      
      if (text.includes('correct') && !text.includes('incorrect')) {
        radio.scrollIntoView({ behavior: 'instant', block: 'center' });
        radio.click();
        return true;
      }
    }
    return false;
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
  
  return clicked;
}

// NEW: Find and click navigation button on main page
async function findNavigationButton(page) {
  // Scroll through page looking for navigation buttons
  for (let scrollPos = 0; scrollPos <= 10; scrollPos++) {
    await page.evaluate((pos) => {
      window.scrollTo(0, document.body.scrollHeight * pos / 10);
    }, scrollPos);
    await delay(100);
    
    // Look for navigation-style buttons or links
    const clicked = await page.evaluate(() => {
      const navTexts = ['continue', 'next', 'proceed', 'go', 'navigate', 'click here', 'button'];
      
      // Check buttons
      for (const btn of document.querySelectorAll('button, a, [role="button"]')) {
        const text = (btn.textContent || '').toLowerCase();
        const isNav = navTexts.some(t => text.includes(t));
        const isNotSubmit = !text.includes('submit');
        
        if (isNav && isNotSubmit && btn.offsetParent !== null) {
          try { 
            btn.scrollIntoView({ behavior: 'instant', block: 'center' });
            btn.click(); 
            return true;
          } catch(e) {}
        }
      }
      
      // Also check for any prominent button that might be hidden
      for (const btn of document.querySelectorAll('button')) {
        const text = (btn.textContent || '').trim();
        const rect = btn.getBoundingClientRect();
        // Look for buttons with reasonable size, not standard form buttons
        if (text.length > 0 && text.length < 30 && rect.width > 50 && rect.height > 20) {
          const notForm = !text.toLowerCase().includes('submit');
          if (notForm && btn.offsetParent !== null) {
            try { 
              btn.click(); 
              return true;
            } catch(e) {}
          }
        }
      }
      
      return false;
    });
    
    if (clicked) return true;
  }
  
  return false;
}

async function handleDragDrop(page) {
  try {
    const pieces = await page.$$('[draggable="true"], [class*="piece"]');
    const slots = await page.$$('[class*="slot"], [class*="drop"]');
    for (let i = 0; i < Math.min(pieces.length, slots.length); i++) {
      await pieces[i].dragTo(slots[i]);
      await delay(100);
    }
  } catch (e) {}
}

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

async function handleHover(page) {
  await page.evaluate(() => {
    document.querySelectorAll('[class*="hover"]').forEach(el => {
      el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    });
  });
}

async function handleScroll(page) {
  await page.evaluate(() => window.scrollTo(0, 600));
  await delay(50);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
}

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
  for (let i = 0; i < 3; i++) {
    await closePopups(page);
    await delay(30);
  }
  
  // Try modal first
  await handleScrollableModal(page);
  await delay(150);
  
  // Then try navigation button
  await findNavigationButton(page);
  await delay(100);
  
  await closePopups(page);
  
  await handleDragDrop(page);
  await delay(100);
  
  await handleScroll(page);
  
  await clickFloatingButtons(page);
  await delay(50);
  
  await clickRevealButtons(page);
  await delay(100);
  
  await handleHover(page);
  await delay(50);
  
  await closePopups(page);
  
  let code = await extractCode(page);
  
  if (code) {
    const stepCodes = usedCodes.get(step) || new Set();
    if (stepCodes.has(code)) return null;
  }
  
  return code;
}

async function run() {
  console.log('╔════════════════════════════════════════════╗');
  console.log('║  Browser Challenge Agent v18               ║');
  console.log('║  Modal radio + Navigation button           ║');
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
    
    for (let attempt = 0; attempt < 900; attempt++) {
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
        await delay(300);
      } else {
        stuckCount++;
        if (stuckCount === 55) {
          await page.screenshot({ path: `stuck-step${step}.png` });
          console.log(`  [Stuck on step ${step}]`);
        }
        if (stuckCount > 75) {
          stuckCount = 0;
        }
      }
      
      await delay(40);
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
