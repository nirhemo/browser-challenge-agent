/**
 * Debug version - captures step 5 details
 */
const { chromium } = require('playwright');
const fs = require('fs');

const CHALLENGE_URL = 'https://serene-frangipane-7fd25b.netlify.app/';

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  console.log('Debug Agent - Investigating Step 5\n');
  
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
    
    // Quickly solve steps 1-4
    for (let targetStep = 1; targetStep <= 4; targetStep++) {
      console.log(`Solving step ${targetStep}...`);
      
      // Close popups
      for (let i = 0; i < 5; i++) {
        await page.evaluate(() => {
          document.querySelectorAll('button').forEach(btn => {
            const text = (btn.textContent || '').toLowerCase().trim();
            if (['dismiss', 'close', 'accept', 'decline'].includes(text)) {
              try { btn.click(); } catch(e) {}
            }
          });
        });
        await delay(50);
      }
      
      // Click reveal/code buttons
      await page.evaluate(() => {
        document.querySelectorAll('button').forEach(btn => {
          const text = (btn.textContent || '').toLowerCase();
          if (text.includes('reveal') || text.includes('code')) {
            try { btn.click(); } catch(e) {}
          }
        });
      });
      await delay(100);
      
      // Handle radio
      await page.evaluate(() => {
        document.querySelectorAll('input[type="radio"]').forEach(radio => {
          const parent = radio.closest('div');
          const text = parent ? parent.textContent.toLowerCase() : '';
          if (text.includes('correct')) radio.click();
        });
        document.querySelectorAll('button').forEach(btn => {
          const text = btn.textContent || '';
          if (text.includes('Submit') && text.includes('Continue') && !btn.disabled) {
            btn.click();
          }
        });
      });
      await delay(100);
      
      // Find code
      const code = await page.evaluate(() => {
        const text = document.body.innerText;
        const patterns = [/\b[A-Z]{6}\b/g, /\b\d{6}\b/g, /\b[A-Z0-9]{6}\b/g];
        const skip = ['SUBMIT', 'SELECT', 'OPTION', 'BUTTON', 'SCROLL', 'COOKIE', 'PLEASE', 'ACCEPT'];
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
      
      if (code) {
        console.log(`  Code: ${code}`);
        const input = await page.$('input[placeholder*="code"]');
        if (input) await input.fill(code);
        await delay(100);
        await page.evaluate(() => {
          document.querySelectorAll('button').forEach(btn => {
            if (btn.textContent.includes('Submit') && !btn.disabled) btn.click();
          });
        });
        await delay(500);
      }
    }
    
    console.log('\n=== NOW ON STEP 5 ===');
    await delay(1000);
    
    // Take screenshot
    await page.screenshot({ path: 'step5-screenshot.png', fullPage: true });
    console.log('Screenshot saved: step5-screenshot.png');
    
    // Dump page info
    const pageInfo = await page.evaluate(() => {
      return {
        url: window.location.href,
        title: document.title,
        bodyText: document.body.innerText.substring(0, 5000),
        buttons: Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).slice(0, 20),
        inputs: Array.from(document.querySelectorAll('input')).map(i => ({type: i.type, placeholder: i.placeholder})),
        hasCode: /[A-Z0-9]{6}/.test(document.body.innerText)
      };
    });
    
    console.log('\nURL:', pageInfo.url);
    console.log('Has 6-char code:', pageInfo.hasCode);
    console.log('\nButtons:', pageInfo.buttons.join(' | '));
    console.log('\nInputs:', JSON.stringify(pageInfo.inputs));
    console.log('\n--- PAGE TEXT (first 2000 chars) ---');
    console.log(pageInfo.bodyText.substring(0, 2000));
    
    // Wait for manual inspection
    console.log('\n\nBrowser will stay open for 30 seconds...');
    await delay(30000);
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
}

run().catch(console.error);
