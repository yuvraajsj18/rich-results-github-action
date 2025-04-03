const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

const urlToTest = process.argv[2];

if (!urlToTest) {
  console.error("Please provide a URL to test as a command-line argument.");
  process.exit(1);
}

console.log(`[INFO] Starting test for URL: ${urlToTest}`);

(async () => {
  try {
    console.log("[INFO] Launching browser...");
    const browser = await puppeteer.launch({
      headless: false,
      defaultViewport: { width: 1366, height: 768 },
    });
    const page = await browser.newPage();
    console.log("[INFO] Browser launched successfully");

    // Navigate to the Rich Results Test page
    console.log("[INFO] Navigating to Rich Results Test page...");
    await page.goto("https://search.google.com/test/rich-results", {
      waitUntil: "networkidle0",
      timeout: 30000,
    });
    console.log("[INFO] Page loaded successfully");

    // Input the URL using the correct selector
    console.log("[INFO] Attempting to input URL...");
    await page.type('input[aria-label="Enter a URL to test"]', urlToTest);
    console.log("[INFO] URL input successful");

    console.log("[INFO] Starting test process...");

    // Click the test button using the specific selector identified
    console.log("[INFO] Looking for specific 'Test URL' button container...");
    const testButtonSelector = "span.RveJvd.snByac"; // Target the parent span

    try {
      // Add a small delay before clicking
      await new Promise((resolve) => setTimeout(resolve, 500));
      console.log(
        `[DEBUG] Attempting to click selector: ${testButtonSelector}`
      );
      await page.click(testButtonSelector);
      console.log(
        "[INFO] Test button clicked via specific selector, waiting for response..."
      );
    } catch (clickError) {
      console.error(
        `[ERROR] Could not click button with selector: ${testButtonSelector}`,
        clickError
      );
      console.error(
        "[ERROR] The identified specific selector failed. Please double-check the element on the page."
      );
      // Take screenshot before throwing
      await page.screenshot({
        path: path.join(__dirname, "click-failure-state.png"),
      });
      throw new Error(
        `Failed to click the specific Test URL button element (${testButtonSelector}).`
      );
    }

    // Wait for the test to start - look for loading indicators or changes in the page
    console.log("[INFO] Waiting for test to start...");
    await page
      .waitForFunction(
        () => {
          // Check for loading indicators or changes in the page
          const loadingIndicators = document.querySelectorAll(
            '.loading, .spinner, [role="progressbar"]'
          );
          const pageText = document.body.innerText;

          // If we see loading indicators or the page text has changed from the initial state
          return (
            loadingIndicators.length > 0 ||
            !pageText.includes("Does your page support rich results?") ||
            pageText.includes("Testing") ||
            pageText.includes("Analyzing")
          );
        },
        { timeout: 10000, polling: 500 }
      )
      .catch(() => {
        console.log(
          "[WARN] No clear loading indicator found, continuing anyway..."
        );
      });

    // Wait for the test results page to load (shows View Tested Page or an error)
    console.log(
      "[INFO] Waiting for test results page to load (this may take a minute or two)..."
    );
    let loadError = null;
    try {
      await page.waitForFunction(
        () => {
          const text = document.body.innerText;
          // Wait for common indicators that the results page has loaded
          return (
            text.includes("View tested page") ||
            text.includes("URL is not available to Google") ||
            text.includes("Error") || // Generic error text
            text.includes("Failed to test") || // Another failure text
            text.includes(
              "Application error: a client-side exception has occurred"
            ) // Check for the target error text directly too
          );
        },
        { timeout: 180000, polling: 2000 } // 3 minutes timeout
      );
      console.log("[INFO] Test results page loaded (or error displayed).");
    } catch (timeoutError) {
      loadError = timeoutError; // Store error to handle after potential screenshot
      console.error(
        "[FATAL ERROR] Timeout: Test did not complete loading results within 3 minutes."
      );
      try {
        await page.screenshot({
          path: path.join(__dirname, "timeout-state.png"),
        });
      } catch (e) {
        console.error("Failed to save timeout screenshot", e);
      }
      // Exit immediately on timeout
      if (
        typeof browser !== "undefined" &&
        browser &&
        typeof browser.close === "function"
      ) {
        try {
          await browser.close();
        } catch (e) {}
      }
      process.exit(1);
    }

    // --- Perform the Check based on Page Content ---
    let finalCheckResult = "PASS"; // Default to PASS
    let pageContent = "";
    const targetErrorMessage =
      "Application error: a client-side exception has occurred (see the browser console for more information).";

    try {
      console.log("[INFO] Getting page content for check...");
      pageContent = await page.content();

      console.log(
        "[INFO] Checking content for specific Application Error string..."
      );
      if (pageContent.includes(targetErrorMessage)) {
        finalCheckResult = "FAIL";
        console.log(
          "[WARN] Check Result: FAIL (Found Application Error string in page content)"
        );
      } else {
        console.log(
          "[INFO] Check Result: PASS (Application Error string not found in page content)"
        );
      }
    } catch (contentError) {
      console.error(
        `[ERROR] Failed to get page content after page load: ${contentError.message}`
      );
      // If we can't get content, we can't confirm the error string is absent.
      // Stick with PASS default as per requirement, but log this clearly.
      console.log(
        "[WARN] Check Result: PASS (Could not get page content to verify, defaulting to PASS)"
      );
      pageContent = `Error getting content: ${contentError.message}`; // Save error for context
    }

    // --- Save Results ---
    console.log(`[FINAL RESULT] Application Error Check: ${finalCheckResult}`);

    // Setup output directory
    console.log("[INFO] Setting up output directory...");
    const outputDir = path.join(__dirname, "output");
    if (!fs.existsSync(outputDir)) {
      try {
        fs.mkdirSync(outputDir);
        console.log(`[INFO] Created output directory: ${outputDir}`);
      } catch (e) {
        console.error(
          `[ERROR] Failed to create output directory: ${e.message}`
        );
        if (
          typeof browser !== "undefined" &&
          browser &&
          typeof browser.close === "function"
        ) {
          try {
            await browser.close();
          } catch (e) {}
        }
        process.exit(1);
      }
    }

    // Save the final result
    try {
      fs.writeFileSync(
        path.join(outputDir, "final_result.txt"),
        finalCheckResult
      );
    } catch (e) {
      console.error(`[ERROR] Failed to write final result file: ${e.message}`);
    }
    // Save the page content for context/debugging
    try {
      const contentPath = path.join(outputDir, "page_content.html");
      fs.writeFileSync(contentPath, pageContent);
      console.log(`[INFO] Page content saved to ${contentPath}`);
    } catch (e) {
      console.error(`[ERROR] Failed to write page content file: ${e.message}`);
    }

    // --- Attempt to gather supporting evidence (Screenshot, Logs) ---
    // Run this regardless of PASS/FAIL, as long as the page load didn't timeout.
    console.log(
      "[INFO] Attempting to gather screenshot and console logs (best effort)..."
    );

    // Define selectors
    const viewTestedPageSelector =
      'div[role="button"] ::-p-text("View tested page")';
    const screenshotTabSelector = 'div.ThdJC.kaAt2.xagcJf.dyhUwd[role="tab"]';
    const moreInfoTabSelector = 'div.ThdJC.kaAt2.xagcJf.S5PKsc[role="tab"]';
    const consoleErrorsSelector =
      'div[role="button"] ::-p-text("JavaScript console messages")';
    const screenshotImgSelector = 'img[alt="Screenshot"]';
    const consoleLogSelector = "div.iv2Qhc.io655b pre";

    // Helper function for clicking with error handling
    async function safeClick(
      selector,
      elementName,
      postClickWaitTime = 1000,
      waitForSelectorTimeout = 5000
    ) {
      console.log(
        `[INFO] Attempting to click '${elementName}' (${selector})...`
      );
      try {
        if (!selector.includes("::-p-text")) {
          // Use the specific timeout for waiting for the selector
          console.log(
            `[DEBUG] Waiting for selector '${selector}' with timeout ${waitForSelectorTimeout}ms`
          );
          await page.waitForSelector(selector, {
            visible: true,
            timeout: waitForSelectorTimeout,
          });
        } else {
          await new Promise((resolve) => setTimeout(resolve, 500)); // Short wait for text selectors
        }
        await page.click(selector);
        // Use the specific post-click wait time
        await new Promise((resolve) => setTimeout(resolve, postClickWaitTime));
        console.log(`[INFO] Successfully clicked '${elementName}'.`);
        return true;
      } catch (e) {
        console.error(`[ERROR] Failed to click '${elementName}': ${e.message}`);
        const failureScreenshotPath = path.join(
          outputDir,
          `${elementName.toLowerCase().replace(/\s+/g, "-")}-click-failure.png`
        );
        try {
          await page.screenshot({ path: failureScreenshotPath });
          console.log(
            `[INFO] Failure screenshot saved to ${failureScreenshotPath}`
          );
        } catch (screenshotError) {
          console.error(
            `[ERROR] Failed to save failure screenshot for ${elementName}: ${screenshotError.message}`
          );
        }
        return false;
      }
    }

    // Click View Tested Page
    if (await safeClick(viewTestedPageSelector, "View Tested Page", 2000)) {
      // Only proceed if View Tested Page was clicked

      // Click Screenshot Tab and Save Screenshot
      if (await safeClick(screenshotTabSelector, "Screenshot Tab")) {
        console.log("[INFO] Saving screenshot from Screenshot tab...");
        try {
          const screenshotElement = await page.$(screenshotImgSelector);
          const screenshotPath = path.join(outputDir, "screenshot.png");
          if (screenshotElement) {
            await screenshotElement.screenshot({ path: screenshotPath });
            console.log(
              `[INFO] Screenshot saved successfully to ${screenshotPath}`
            );
          } else {
            console.log(
              `[WARN] Screenshot element ('${screenshotImgSelector}') not found. Saving fallback screenshot of tab.`
            );
            await page.screenshot({ path: screenshotPath }); // Save fallback with the main name
            console.log(
              `[INFO] Fallback screenshot saved successfully to ${screenshotPath}`
            );
          }
        } catch (e) {
          console.error(
            `[ERROR] Failed to save screenshot image: ${e.message}`
          );
          try {
            await page.screenshot({
              path: path.join(outputDir, "screenshot-save-failure.png"),
            });
          } catch (se) {
            console.error(
              "Failed to save even fallback screenshot error screenshot."
            );
          }
        }
      } else {
        console.log("[WARN] Screenshot Tab click failed, screenshot skipped.");
      }

      // Click More Info Tab and gather logs
      let errorLogResult = "Skipped (More Info tab click failed)"; // Default
      if (await safeClick(moreInfoTabSelector, "More Info Tab")) {
        // Click JavaScript Console Errors Button (using the updated text selector)
        if (
          await safeClick(
            consoleErrorsSelector,
            "JavaScript Console Messages Button"
          )
        ) {
          console.log("[INFO] Saving console logs...");
          try {
            errorLogResult = await page.evaluate((selector) => {
              const errorContainer = document.querySelector(selector);
              return errorContainer
                ? errorContainer.textContent ||
                    "Console log container found but empty."
                : `No console errors found or container ('${selector}') not found.`;
            }, consoleLogSelector);
            console.log("[INFO] Console logs obtained successfully");
          } catch (e) {
            console.error(
              `[ERROR] Failed to extract console logs via evaluate: ${e.message}`
            );
            errorLogResult = "Failed to extract console logs (evaluate error).";
          }
        } else {
          errorLogResult = "Skipped (Console Messages button click failed)";
        }
      }
      // Save logs result regardless of inner clicks failing
      try {
        fs.writeFileSync(path.join(outputDir, "errors.txt"), errorLogResult);
        console.log(`[INFO] Console logs result saved.`);
      } catch (e) {
        console.error(
          `[ERROR] Failed to write console logs result file: ${e.message}`
        );
      }
    } else {
      console.log(
        "[WARN] View Tested Page click failed, skipping dependent screenshot and logs."
      );
      try {
        fs.writeFileSync(
          path.join(outputDir, "errors.txt"),
          "Skipped (View Tested Page click failed)"
        );
      } catch (e) {
        console.error("Failed to write skipped error log:", e);
      }
      try {
        const fallbackScreenshotPath = path.join(outputDir, "screenshot.png");
        console.log(
          `[INFO] Taking fallback screenshot to ${fallbackScreenshotPath} because View Tested Page failed...`
        );
        await page.screenshot({ path: fallbackScreenshotPath });
        console.log(`[INFO] Fallback screenshot saved.`);
      } catch (e) {
        console.error(
          `[ERROR] Failed to take fallback screenshot: ${e.message}`
        );
      }
    }

    // --- Browser Closing and Exit Code ---
    console.log("[INFO] Closing browser...");
    if (
      typeof browser !== "undefined" &&
      browser &&
      typeof browser.close === "function"
    ) {
      try {
        await browser.close();
      } catch (e) {}
    }
    process.exit(0);
  } catch (e) {
    console.error(`[ERROR] Test execution failed: ${e.message}`);
    process.exit(1);
  }
})();
