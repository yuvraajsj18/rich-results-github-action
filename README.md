# Rich Results Test GitHub Action

This action runs a given URL through the Google Rich Results Test using Puppeteer, checks for specific errors, and provides outputs including a pass/fail result, a screenshot, and console logs.

## Inputs

- `url` ( **Required** ): The URL to test.
- `output-directory` ( Optional, default: `rich-results-output` ): The directory relative to the workspace root where output files (screenshot, logs, html) will be saved.

## Outputs

- `check-result`: The result of the check ('PASS' or 'FAIL').
- `screenshot-path`: Relative path to the saved screenshot file (e.g., `rich-results-output/screenshot.png`).
- `logs-path`: Relative path to the saved console logs file (e.g., `rich-results-output/errors.txt`).
- `html-path`: Relative path to the saved page HTML file (e.g., `rich-results-output/page_content.html`).

## Example Usage

```yaml
name: Check Rich Results

on: [push]

jobs:
  rich_results_test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Run Rich Results Test
        id: test # Give the step an id to access outputs
        uses: your-username/rich-results-github-action@v1 # Replace with your repo and version tag
        with:
          url: "https://your-website.com/page-to-test"
          output-directory: "results" # Optional: change output folder

      - name: Print Results
        run: |
          echo "Check Result: ${{ steps.test.outputs.check-result }}"
          echo "Screenshot saved to: ${{ steps.test.outputs.screenshot-path }}"
          echo "Logs saved to: ${{ steps.test.outputs.logs-path }}"
          echo "HTML saved to: ${{ steps.test.outputs.html-path }}"

      - name: Upload Artifacts (Optional)
        if: always() # Run even if the test step fails
        uses: actions/upload-artifact@v4
        with:
          name: rich-results-artifacts
          path: |
            ${{ steps.test.outputs.screenshot-path }}
            ${{ steps.test.outputs.logs-path }}
            ${{ steps.test.outputs.html-path }}
          # You might need to adjust the path logic if outputs aren't set (e.g., on timeout/failure)
          # or upload the whole directory: path: ${{ inputs.output-directory || 'rich-results-output' }}
```

**Important:** Remember to replace `your-username/rich-results-github-action@v1` in the example with your actual GitHub username/organization and the repository name once you publish it. You'll also need to create a version tag (like `v1`) for others to reference.
