const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.post('/scrape', async (req, res) => {
  const { site } = req.body;
  if (site !== 'mobile.de') {
    return res.status(400).json({ success: false, error: 'Пока поддерживается только mobile.de' });
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36');

    const url = 'https://suchen.mobile.de/lkw/sattelzugmaschine.html?minYear=2021&scopeId=C';
    console.log('Открываю:', url);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 40000 });

    // Делаем скриншот для диагностики
    const screenshot = await page.screenshot({ encoding: 'base64' });

    // Пытаемся собрать объявления максимально грубо
    const listings = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('article, div[class*="offer"], div[class*="result"], div[class*="listing"], [data-testid]'));
      
      return items.slice(0, 10).map((item, index) => {
        const text = item.innerText || '';
        const lines = text.split('\n').filter(l => l.trim().length > 3);
        
        let title = lines[0] || 'Без названия';
        let price = 'Цена не указана';
        const priceMatch = text.match(/(\d{1,3}(?:\s?\d{3})*(?:,\d+)?)\s*€?/);
        if (priceMatch) price = priceMatch[0] + ' €';

        let url = '';
        const link = item.querySelector('a[href*="mobile.de"]');
        if (link) url = link.href;

        return {
          listing_id: 'diag_' + Date.now() + '_' + index,
          source: 'mobile.de',
          title: title.substring(0, 120),
          price: price,
          url: url || ''
        };
      }).filter(item => item.url);
    });

    res.json({
      success: true,
      site: 'mobile.de',
      count: listings.length,
      listings: listings,
      debug: {
        message: "Скриншот сделан. Если count = 0, значит объявления не найдены на странице.",
        screenshot_base64_length: screenshot.length
      }
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  } finally {
    await browser.close();
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => console.log(`Server running on ${PORT}`));