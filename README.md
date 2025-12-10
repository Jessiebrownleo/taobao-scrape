# Taobao Product Scraper

A Puppeteer-based web scraper for extracting product information from Taobao.

## ⚠️ Disclaimer

This tool is for **educational purposes only**. Web scraping may violate Taobao's Terms of Service. Use responsibly and at your own risk.

## Features

- 🤖 **Anti-Detection Measures**: Configured to bypass basic bot detection
- 📜 **Infinite Scroll**: Automatically scrolls the "Guess You Like" feed until the end
- 💾 **Cookie Persistence**: Saves your login session to skip login on future runs
- 🏠 **Homepage Feed**: Scrapes recommendations directly from the main page
- �️ **Comprehensive Data**: Extracts title, price, image, link from recommendation cards

## Installation

```bash
npm install
```

## Usage

### 1. First Run (Login)

For the first time, you need to log in manually to generate a session cookie.

```bash
npm run login
```
1. A browser window will open.
2. Log in to your Taobao account manually.
3. The script will detect the login, save `cookies.json`, and exit.

### 2. Scraping

Once you have logged in once, you can run the scraper anytime:

```bash
npm start
```

This will:
1. Open Taobao Homepage.
2. Load your saved cookies (skipping login).
3. Scroll down infinitely to load the "Guess You Like" feed.
4. Save all discovered products to `taobao_products.json`.

### Configuration

Edit the `CONFIG` object in `taobao-scraper.js`:

```javascript
const CONFIG = {
  headless: false,           // Set to true to run without UI
  maxProducts: 10000,        // Maximum products to scrape
  scrollDelay: 2000,         // Delay between scrolls (ms)
  outputFile: 'taobao_products.json'
};
```

## Output Format

The scraper saves results to `taobao_products.json`:

```json
{
  "totalProducts": 50,
  "scrapedAt": "2025-12-10T01:38:32.000Z",
  "products": [
    {
      "title": "Product Name",
      "price": "¥999",
      "image": "https://...",
      "link": "https://...",
      "shop": "Shop Name",
      "sales": "1000+ sold",
      "extractedAt": "2025-12-10T01:38:32.000Z"
    }
  ]
}
```

## How It Works

1. **Stealth Setup**: Configures Puppeteer to avoid detection
2. **Navigation**: Opens Taobao homepage
3. **Search**: Enters search query and submits
4. **Scroll**: Scrolls page to trigger lazy-loading
5. **Extract**: Parses product data from DOM
6. **Save**: Exports to JSON file

## Troubleshooting

### CAPTCHA Challenges

If you encounter CAPTCHAs:
- Set `headless: false` to solve manually
- Reduce scraping frequency
- Use residential proxies (not included)

### No Products Found

- Check if Taobao's HTML structure has changed
- Verify search query is in Chinese
- Increase timeout values

### Connection Timeout

- Check your internet connection
- Increase `timeout` values in the code
- Try again during off-peak hours

## Legal Considerations

- ✅ Check Taobao's `robots.txt` and Terms of Service
- ✅ Respect rate limits and server resources
- ✅ Do not use scraped data for commercial purposes without permission
- ✅ Consider using official APIs when available

## Advanced Usage

### Using Proxies

```javascript
const browser = await puppeteer.launch({
  args: [
    '--proxy-server=http://your-proxy:port',
    ...stealthConfig.args
  ]
});
```

### Custom Selectors

If Taobao updates their HTML structure, update the selectors in `extractProducts()`:

```javascript
const titleElement = item.querySelector('.new-title-selector');
```

## Dependencies

- **puppeteer**: ^21.6.1 - Headless Chrome automation

## License

MIT

---

**Remember**: Always scrape responsibly and ethically! 🌟
