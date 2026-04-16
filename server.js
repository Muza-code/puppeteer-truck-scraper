const express = require('express');
const { chromium } = require('playwright');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.post('/scrape', async (req, res) => {
  const { site } = req.body || {};

  if (site !== 'mobile.de') {
    return res.status(400).json({ success: false, error: 'Пока только mobile.de' });
  }

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36'
    });

    const page = await context.newPage();

    const url = 'https://suchen.mobile.de/lkw/sattelzugmaschine.html?minYear=2021&scopeId=C&sortOption.sortBy=searchNetGrossPrice&sortOption.sortOrder=ASCENDING';

    console.log('Открываю mobile.de...');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Долгое ожидание + несколько скроллов
    await page.waitForTimeout(10000);

    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, 1500));
      await page.waitForTimeout(4000);
    }

    // Ждём появления хотя бы одного объявления
    await page.waitForSelector('article, [data-testid="offer-list-item"], div[class*="offer"]', { timeout: 15000 }).catch(() => {});

    const listings = await page.evaluate(() => {
      const results = [];
      const cards = document.querySelectorAll('article, [data-testid="offer-list-item"], div[class*="offer"], div[class*="result"]');

      cards.forEach((card, i) => {
        const text = card.innerText || '';
        if (text.length < 60) return;

        const priceMatch = text.match(/(\d{1,3}(?:\.\d{3})*)\s*€?/);
        const price = priceMatch ? priceMatch[0] + ' €' : 'Цена не указана';

        let url = '';
        const link = card.querySelector('a[href*="/details/"]') || card.querySelector('a');
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

    res.json({
      success: true,
      site: 'mobile.de',
      count: listings.length,
      listings: listings,
      debug: {
        message: listings.length > 0 ? `Найдено ${listings.length} объявлений` : "Объявления не найдены даже после скролла"
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

app.listen(PORT, () => console.log(`🚀 Playwright сервис запущен на порту ${PORT}`));