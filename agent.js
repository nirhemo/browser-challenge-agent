/**
 * Browser Challenge Agent v24
 * Debug modal structure, find radio buttons
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
    const skip = ['SUBMIT', 'SELECT', 'OPTION', 'BUTTON', 'SCROLL', 'COOKIE', 'PLEASE', 'ACCEPT', 'REVEAL', 'WRONG', 'HIDDEN', 'SECTIO', 'CHOOSE'];
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

// DEBUG: Log modal structure and find radio buttons
async function handleScrollableModal(page) {
  // Check if modal exists and debug its structure
  const modalInfo = await page.evaluate(() => {
    const modal = document.querySelector('.fixed, [role="dialog"]');
    if (!modal) return { hasModal: false };
    
    const radios = document.querySelectorAll('input[type="radio"]');
    const scrollables = [];
    
    document.querySelectorAll('*').forEach(el => {
      const style = window.getComputedStyle(el);
      if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && 
          el.scrollHeight > el.clientHeight) {
        scrollables.push({
          tag: el.tagName,
          className: el.className,
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight
        });
      }
    });
    
    return {
      hasModal: true,
      radioCount: radios.length,
      scrollables: scrollables.slice(0, 3),
      radioLabels: Array.from(radios).map(r => {
        const p = r.closest('div') || r.closest('label');
        return p ? p.textContent.substring(0, 40) : 'no label';
      })
    };
  });
  
  if (!modalInfo.hasModal) return false;
  
  // Log debug info
  if (modalInfo.radioCount > 0) {
    console.log(`  [Modal: ${modalInfo.radioCount} radios found]`);
    console.log(`  [Labels: ${modalInfo.radioLabels.join(' | ')}]`);
  } else {
    console.log(`  [Modal: 0 radios, scrollables: ${JSON.stringify(modalInfo.scrollables)}]`);
  }
  
  // If NO radios, this is a scroll-only modal - scroll to bottom and click button
  if (modalInfo.radioCount === 0 && modalInfo.scrollables.length > 0) {
    // Scroll to very bottom
    await page.evaluate(() => {
      document.querySelectorAll('*').forEach(el => {
        const style = window.getComputedStyle(el);
        if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && 
            el.scrollHeight > el.clientHeight) {
          el.scrollTop = el.scrollHeight;
        }
      });
    });
    await delay(200);
    
    // Click submit button if enabled
    await page.evaluate(() => {
      document.querySelectorAll('button').forEach(btn => {
        const text = btn.textContent || '';
        if (text.includes('Submit') && !btn.disabled) {
          btn.click();
        }
      });
    });
    return false; // Let code extraction happen
  }
  
  // Scroll through modal MORE aggressively - 10 positions
  for (let i = 0; i <= 10; i++) {
    await page.evaluate((pct) => {
      document.querySelectorAll('*').forEach(el => {
        const style = window.getComputedStyle(el);
        if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && 
            el.scrollHeight > el.clientHeight) {
          el.scrollTop = el.scrollHeight * pct / 10;
        }
      });
    }, i);
    await delay(60);
    
    // Check for radio buttons at each scroll position
    const radioClicked = await page.evaluate(() => {
      const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
      if (radios.length === 0) return false;
      
      const negatives = ['incorrect', 'wrong', 'not this', 'don\'t'];
      const positives = ['correct', 'select this', 'choose me', 'this one', 'right'];
      
      // Score each radio
      let best = null;
      let bestScore = -100;
      
      for (const radio of radios) {
        const parent = radio.closest('div') || radio.closest('label') || radio.parentElement;
        const text = parent ? parent.textContent.toLowerCase() : '';
        
        let score = 0;
        for (const neg of negatives) if (text.includes(neg)) score -= 20;
        for (const pos of positives) if (text.includes(pos)) score += 10;
        
        if (score > bestScore) {
          bestScore = score;
          best = radio;
        }
      }
      
      // If no positive found, pick first non-negative
      if (bestScore <= 0) {
        for (const radio of radios) {
          const parent = radio.closest('div') || radio.closest('label') || radio.parentElement;
          const text = parent ? parent.textContent.toLowerCase() : '';
          if (!negatives.some(n => text.includes(n))) {
            best = radio;
            break;
          }
        }
      }
      
      if (best) {
        best.scrollIntoView({ behavior: 'instant', block: 'center' });
        best.click();
        return true;
      }
      return false;
    });
    
    if (radioClicked) {
      await delay(100);
      // Click submit
      await page.evaluate(() => {
        document.querySelectorAll('button').forEach(btn => {
          const text = btn.textContent || '';
          if (text.includes('Submit')) {
            if (!btn.disabled) btn.click();
          }
        });
      });
      return true;
    }
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
    // Hover on elements with "hover" in class
    document.querySelectorAll('[class*="hover"]').forEach(el => {
      el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });
    
    // Also hover on elements that mention hovering in text
    document.querySelectorAll('*').forEach(el => {
      const text = (el.textContent || '').toLowerCase();
      if (text.includes('hover here') || text.includes('hover to reveal') || text.includes('hover over')) {
        el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      }
    });
  });
}

// Also use Playwright hover for better interaction
async function handleHoverPlaywright(page) {
  try {
    // Find hover target by text
    const hoverTarget = page.locator('text=Hover here').first();
    if (await hoverTarget.count() > 0) {
      await hoverTarget.hover();
      console.log('  [Hovered on reveal box]');
    }
  } catch (e) {}
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
  
  await handleScrollableModal(page);
  await delay(150);
  
  await closePopups(page);
  
  await handleDragDrop(page);
  await delay(100);
  
  await handleScroll(page);
  
  await clickFloatingButtons(page);
  await delay(50);
  
  await clickRevealButtons(page);
  await delay(100);
  
  await handleHover(page);
  await delay(100);
  
  await handleHoverPlaywright(page);
  await delay(200);
  
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
  console.log('║  Browser Challenge Agent v26               ║');
  console.log('║  Handle hover challenges                   ║');
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
        if (stuckCount === 70) {
          await page.screenshot({ path: `stuck-step${step}.png` });
          console.log(`  [Stuck on step ${step}]`);
        }
      }
      
      await delay(30);
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
