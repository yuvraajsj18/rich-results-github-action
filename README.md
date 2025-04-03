# Rich Results Checker

This script uses Puppeteer to automate testing a URL on the Google Rich Results Test page ([https://search.google.com/test/rich-results](https://search.google.com/test/rich-results)).

It checks the rendered HTML for a specific client-side error, saves a screenshot of the tested page, and extracts JavaScript console errors.

## Installation

1. Clone the repository (if applicable).
2. Install dependencies:
   ```bash
   npm install
   ```

## Usage

Run the script with the URL you want to test as a command-line argument:

```bash
node index.js <your_url_here>
```

Example:

```bash
node index.js https://www.google.com
```

## Output

- The script will print either "Check Passed" or "Check Failed" to the console based on whether the specific error message is found in the HTML source.
- A screenshot of the rendered page will be saved to `output/screenshot.png`.
- Any JavaScript console errors will be saved to `output/errors.txt`.

These output files will be overwritten on each run.
