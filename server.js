const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.post('/scrape', async (req, res) => {
  const { site } = req.body || {};

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process'
    ]
  });

  try {
    const page = await browser.newPage();

    // Лучшие анти-детект настройки
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8'
    });

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    });

    const url = 'https://suchen.mobile.de/lkw/sattelzugmaschine.html?minYear=2021&scopeId=C';

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Долгая задержка + скролл, чтобы обойти lazy loading и проверки
    await page.waitForTimeout(8000);

    await page.evaluate(() => window.scrollBy(0, 800));
    await page.waitForTimeout(3000);

    const listings = await page.evaluate(() => {
      const results = [];
      const elements = document.querySelectorAll('article, [data-testid="offer-list-item"], .offer-item, div[class*="offer"]');

      elements.forEach((el, i) => {
        const text = el.innerText || '';
        if (text.length < 40) return;

        const priceMatch = text.match(/(\d{1,3}(?:\.\d{3})*)\s*€?/);
        const price = priceMatch ? priceMatch[0] + ' €' : 'Цена не указана';

        let url = '';
        const link = el.querySelector('a');
        if (link && link.href.includes('mobile.de')) url = link.href;

        if (url) {
          results.push({
            listing_id: url.split('/').pop().replace(/\D/g, '') || 'id' + i,
            source: 'mobile.de',
            title: text.split('\n')[0].trim().substring(0, 120),
            price: price,
            url: url
          });
        }
      });
      return results.slice(0, 15);
    });

    const screenshot = await page.screenshot({ encoding: 'base64' });

    res.json({
      success: true,
      site: 'mobile.de',
      count: listings.length,
      listings,
      debug: {
        screenshot_length: screenshot.length,
        message: listings.length > 0 ? "Успех!" : "Всё ещё пусто"
      }
    });

  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  } finally {
    await browser.close();
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => console.log('Server running'));