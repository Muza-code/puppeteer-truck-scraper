const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.post('/scrape', async (req, res) => {
  const { site } = req.body || {};

  if (site !== 'mobile.de') {
    return res.status(400).json({ success: false, error: 'Пока поддерживается только mobile.de' });
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled'
      ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36');

    const url = 'https://suchen.mobile.de/lkw/sattelzugmaschine.html?minYear=2021&scopeId=C';

    console.log('Открываю страницу...');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Задержки вместо waitForTimeout
    await new Promise(r => setTimeout(r, 7000));
    await page.evaluate(() => window.scrollBy(0, 1000));
    await new Promise(r => setTimeout(r, 4000));

    const listings = await page.evaluate(() => {
      const results = [];
      const elements = document.querySelectorAll('article, [data-testid="offer-list-item"], div[class*="offer"], div[class*="result"]');

      elements.forEach((el, i) => {
        const text = el.innerText || '';
        if (text.length < 50) return;

        const priceMatch = text.match(/(\d{1,3}(?:\.\d{3})*)\s*€?/);
        const price = priceMatch ? priceMatch[0] + ' €' : 'Цена не указана';

        let url = '';
        const link = el.querySelector('a[href*="/details/"]') || el.querySelector('a');
        if (link && link.href.includes('mobile.de')) url = link.href;

        if (url) {
          results.push({
            listing_id: url.split('/').pop().replace(/\D/g, '') || String(Date.now() + i),
            source: 'mobile.de',
            title: text.split('\n')[0].trim().substring(0, 150),
            price: price,
            url: url
          });
        }
      });
      return results.slice(0, 20);
    });

    const screenshot = await page.screenshot({ encoding: 'base64' });

    res.json({
      success: true,
      site: 'mobile.de',
      count: listings.length,
      listings: listings,
      debug: {
        screenshot_length: screenshot.length,
        message: listings.length > 0 ? "Объявления найдены!" : "Объявления не найдены"
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    if (browser) await browser.close();
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => console.log(`🚀 Puppeteer сервис запущен на порту ${PORT}`));