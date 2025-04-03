const core = require("@actions/core"); // Import @actions/core
// Use puppeteer-extra
const puppeteer = require("puppeteer-extra");
// Add stealth plugin and use defaults (all tricks to hide headless mode)
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());

const fs = require("fs");
const path = require("path");

// Get inputs using @actions/core
const urlToTest = core.getInput("url", { required: true });
const outputDirName = core.getInput("output-directory"); // Relative path from workspace root

// Resolve the output directory path relative to the workspace
const outputDir = path.resolve(outputDirName);

core.info(`[INFO] Starting test for URL: ${urlToTest}`);
core.info(`[INFO] Output directory: ${outputDir}`);

(async () => {
  let browser = null; // Define browser outside try block for finally
  try {
    core.info("[INFO] Launching browser...");
    // Launch headless with args for CI environment
    browser = await puppeteer.launch({
      headless: "new", // Keep headless for the Action
      args: ["--no-sandbox", "--disable-setuid-sandbox"], // Necessary for Actions runner
      defaultViewport: { width: 1366, height: 768 },
    });
    const page = await browser.newPage();
    core.info("[INFO] Browser launched successfully");

    // Navigate to the BASE Rich Results Test page
    core.info("[INFO] Navigating to base Rich Results Test page...");
    await page.goto("https://search.google.com/test/rich-results", {
      // <-- Use base URL
      waitUntil: "networkidle0",
      timeout: 60000, // Keep generous timeout for initial load
    });
    core.info("[INFO] Base test page loaded.");

    // --- Attempt to detect and dismiss intermittent modal --- New Block ---
    core.info(
      "[INFO] Checking for 'Something went wrong' modal and attempting to dismiss (7s timeout)..."
    );
    const modalTextSelector = "span.uW2Fw-k2Wrsb-fmcmS"; // Specific modal text span from user
    const dismissButtonSelector = 'button ::-p-text("Dismiss")'; // Text selector for button
    const dismissButtonSelectorAlt = 'span[jsname="V67aGc"]'; // Specific span for button from user

    try {
      // Wait briefly for the *modal text itself* to appear
      await page.waitForSelector(modalTextSelector, {
        visible: true,
        timeout: 7000,
      });
      core.warning(
        "[WARN] 'Something went wrong' modal detected via text. Attempting to dismiss..."
      );

      // Now try to click the dismiss button (prioritize the specific span selector)
      try {
        await page.click(dismissButtonSelectorAlt); // Try span selector first
        core.info(
          "[INFO] Clicked 'Dismiss' button (using span[jsname='V67aGc'] selector)."
        );
      } catch (errAlt) {
        core.warning(
          `[WARN] Failed to click Dismiss button via span selector: ${errAlt.message}. Trying text selector...`
        );
        try {
          await page.click(dismissButtonSelector); // Fallback to text selector
          core.info("[INFO] Clicked 'Dismiss' button (using text selector).");
        } catch (errText) {
          // Log error if both clicks fail, but continue anyway, maybe it disappears
          core.error(
            `[ERROR] Failed to click Dismiss button using both selectors: ${errText.message}`
          );
        }
      }
      // Add a short pause after dismissal attempt to allow UI to settle
      await new Promise((resolve) => setTimeout(resolve, 1000));
      core.info("[INFO] Proceeding after modal dismissal attempt.");
    } catch (error) {
      // This block executes if the modal text doesn't appear within the 7-second timeout
      core.info(
        "[INFO] 'Something went wrong' modal not detected within timeout (this is normal)."
      );
    }
    // --- End of modal handling block ---

    // --- Re-introduce URL Input Step ---
    core.info("[INFO] Attempting to input URL...");
    // Wait for the input field to be ready before typing
    await page.waitForSelector('input[aria-label="Enter a URL to test"]', {
      visible: true,
      timeout: 10000,
    });
    await page.type('input[aria-label="Enter a URL to test"]', urlToTest);
    core.info("[INFO] URL input successful");
    // --- End of URL Input Step ---

    // --- Re-introduce Button Click Step ---
    core.info("[INFO] Starting test process by clicking button...");
    const testButtonSelector = "span.RveJvd.snByac"; // Target the parent span containing the button

    try {
      // Wait for the button to be clickable
      await page.waitForSelector(testButtonSelector, {
        visible: true,
        timeout: 10000,
      });
      // Add a small delay before clicking
      await new Promise((resolve) => setTimeout(resolve, 500));
      core.info(`[DEBUG] Attempting to click selector: ${testButtonSelector}`);
      await page.click(testButtonSelector);
      core.info(
        "[INFO] Test button clicked via specific selector, waiting for response..."
      );
    } catch (clickError) {
      core.error(
        `[ERROR] Could not click button with selector: ${testButtonSelector} - ${clickError}`
      );
      core.error(
        "[ERROR] The identified specific selector failed. Please double-check the element on the page."
      );
      // Try to take screenshot before failing
      try {
        // Ensure output dir exists for failure screenshot
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }
        const failureScreenshotPath = path.join(
          outputDir,
          "click-failure-state.png"
        );
        await page.screenshot({ path: failureScreenshotPath });
        core.warning(
          `Failure state screenshot saved to ${failureScreenshotPath}`
        );
      } catch (ssError) {
        core.error(`Failed to save failure state screenshot: ${ssError}`);
      }
      // Set failure and exit function
      core.setFailed(
        `Failed to click the specific Test URL button element (${testButtonSelector}).`
      );
      return; // Exit the async function
    }
    // --- End of Button Click Step ---

    // Wait for the FINAL test results page state (shows View Tested Page or an error)
    // This wait is still needed after clicking the button
    core.info(
      "[INFO] Waiting for final test results page state (this may take a minute or two)..."
    );
    const timeoutScreenshotPathAbs = path.join(outputDir, "timeout-state.png");
    const timeoutScreenshotPathRel = path.join(
      outputDirName,
      "timeout-state.png"
    );

    try {
      await page.waitForFunction(
        () => {
          const text = document.body.innerText || ""; // Ensure text is a string
          // Wait for common indicators that the results page has loaded or failed clearly
          const hasViewTestedPage = text.includes("View tested page");
          const hasUrlNotAvailable = text.includes(
            "URL is not available to Google"
          );
          const hasKnownError = text.includes(
            "Application error: a client-side exception has occurred"
          );
          const hasFailedToTest = text.includes("Failed to test");
          const hasGenericError = text.includes("Error"); // Keep this check

          return (
            hasViewTestedPage ||
            hasUrlNotAvailable ||
            hasKnownError ||
            hasFailedToTest ||
            hasGenericError
          );
        },
        { timeout: 300000, polling: 2000 } // 5 minutes timeout
      );
      core.info(
        "[INFO] Final test results page state reached (or error displayed)."
      );
    } catch (timeoutError) {
      core.error(
        "[FATAL ERROR] Timeout: Did not reach final results state within 5 minutes." // Updated error message
      );
      try {
        // Ensure output dir exists for timeout screenshot
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }
        await page.screenshot({ path: timeoutScreenshotPathAbs });
        core.warning(
          `Timeout state screenshot saved to ${timeoutScreenshotPathAbs}`
        );
        core.setOutput("screenshot-path", timeoutScreenshotPathRel); // Set output even on timeout
      } catch (e) {
        core.error(`[ERROR] Failed to save timeout screenshot: ${e}`);
      }
      // Set failure and exit function
      core.setFailed(
        "Timeout: Did not reach final results state within 5 minutes." // Updated error message
      );
      return; // Exit the async function
    }

    // --- Create output directory ---
    core.info("[INFO] Ensuring output directory exists...");
    if (!fs.existsSync(outputDir)) {
      try {
        fs.mkdirSync(outputDir, { recursive: true }); // Use recursive true
        core.info(`[INFO] Created output directory: ${outputDir}`);
      } catch (e) {
        core.error(`[ERROR] Failed to create output directory: ${e.message}`);
        // Set failure and exit function
        core.setFailed(`Failed to create output directory: ${e.message}`);
        return; // Exit the async function
      }
    } else {
      core.info(`[INFO] Output directory already exists: ${outputDir}`);
    }

    // --- Perform the Check based on Page Content ---
    let finalCheckResult = "PASS"; // Default to PASS
    let pageContent = "";
    const targetErrorMessage =
      "Application error: a client-side exception has occurred (see the browser console for more information).";

    // Define output file paths (absolute for writing, relative for setting outputs)
    const resultFilePathAbs = path.join(outputDir, "final_result.txt");
    const contentFilePathAbs = path.join(outputDir, "page_content.html");
    const contentFilePathRel = path.join(outputDirName, "page_content.html");

    try {
      core.info("[INFO] Getting page content for check...");
      pageContent = await page.content();

      core.info(
        "[INFO] Checking content for specific Application Error string..."
      );
      if (pageContent.includes(targetErrorMessage)) {
        finalCheckResult = "FAIL";
        core.warning(
          // Use warning for FAIL result
          "[WARN] Check Result: FAIL (Found Application Error string in page content)"
        );
      } else {
        core.info(
          "[INFO] Check Result: PASS (Application Error string not found in page content)"
        );
      }
    } catch (contentError) {
      core.error(
        `[ERROR] Failed to get page content after page load: ${contentError.message}`
      );
      // If we can't get content, we can't confirm the error string is absent.
      // Stick with PASS default as per requirement, but log this clearly.
      core.warning(
        "[WARN] Check Result: PASS (Could not get page content to verify, defaulting to PASS)"
      );
      pageContent = `Error getting content: ${contentError.message}`; // Save error for context
    }

    // --- Save Results ---
    core.info(`[FINAL RESULT] Application Error Check: ${finalCheckResult}`);
    // Set the check-result output
    core.setOutput("check-result", finalCheckResult);

    // Save the final result text file
    try {
      fs.writeFileSync(resultFilePathAbs, finalCheckResult);
      core.info(`Final result saved to ${resultFilePathAbs}`);
    } catch (e) {
      core.error(`[ERROR] Failed to write final result file: ${e.message}`);
      // Continue, but maybe warn or set a specific output? For now, just log.
    }
    // Save the page content for context/debugging
    try {
      fs.writeFileSync(contentFilePathAbs, pageContent);
      core.info(`[INFO] Page content saved to ${contentFilePathAbs}`);
      // Set the html-path output
      core.setOutput("html-path", contentFilePathRel);
    } catch (e) {
      core.error(`[ERROR] Failed to write page content file: ${e.message}`);
    }

    // --- Attempt to gather supporting evidence (Screenshot, Logs) ---
    core.info(
      "[INFO] Attempting to gather screenshot and console logs (best effort)..."
    );

    // Define selectors (keep existing ones)
    const viewTestedPageSelector =
      'div[role="button"] ::-p-text("View tested page")';
    const screenshotTabSelector = 'div.ThdJC.kaAt2.xagcJf.dyhUwd[role="tab"]';
    const moreInfoTabSelector = 'div.ThdJC.kaAt2.xagcJf.S5PKsc[role="tab"]';
    const consoleErrorsSelector =
      'div[role="button"] ::-p-text("JavaScript console messages")';
    const screenshotImgSelector = 'img[alt="Screenshot"]';
    const consoleLogSelector = "div.myH6rc";

    // Define file paths (absolute for writing, relative for setting outputs)
    const screenshotPathAbs = path.join(outputDir, "screenshot.png");
    const screenshotPathRel = path.join(outputDirName, "screenshot.png");
    const logsPathAbs = path.join(outputDir, "errors.txt");
    const logsPathRel = path.join(outputDirName, "errors.txt");
    const fallbackScreenshotPathAbs = path.join(
      outputDir,
      "fallback-screenshot.png"
    );
    const fallbackScreenshotPathRel = path.join(
      outputDirName,
      "fallback-screenshot.png"
    ); // Separate name for fallback

    // Helper function for clicking with error handling
    async function safeClick(
      selector,
      elementName,
      postClickWaitTime = 1000,
      waitForSelectorTimeout = 5000
    ) {
      core.info(`[INFO] Attempting to click '${elementName}' (${selector})...`);
      try {
        if (!selector.includes("::-p-text")) {
          // Use the specific timeout for waiting for the selector
          core.info(
            `[DEBUG] Waiting for selector '${selector}' with timeout ${waitForSelectorTimeout}ms`
          );
          await page.waitForSelector(selector, {
            visible: true,
            timeout: waitForSelectorTimeout,
          });
        } else {
          // Text selectors might need a slight delay to settle
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
        await page.click(selector);
        // Use the specific post-click wait time
        await new Promise((resolve) => setTimeout(resolve, postClickWaitTime));
        core.info(`[INFO] Successfully clicked '${elementName}'.`);
        return true;
      } catch (e) {
        core.error(`[ERROR] Failed to click '${elementName}': ${e.message}`);
        const failureScreenshotPath = path.join(
          outputDir,
          `${elementName.toLowerCase().replace(/\s+/g, "-")}-click-failure.png`
        );
        try {
          await page.screenshot({ path: failureScreenshotPath });
          core.warning(
            // Use warning for non-critical failure screenshot
            `[INFO] Failure screenshot saved to ${failureScreenshotPath}`
          );
        } catch (screenshotError) {
          core.error(
            `[ERROR] Failed to save failure screenshot for ${elementName}: ${screenshotError.message}`
          );
        }
        return false;
      }
    }

    // Click View Tested Page
    if (
      await safeClick(viewTestedPageSelector, "View Tested Page", 2000, 10000)
    ) {
      // Increase wait for this button
      // Only proceed if View Tested Page was clicked

      // Click Screenshot Tab and Save Screenshot
      if (await safeClick(screenshotTabSelector, "Screenshot Tab")) {
        core.info("[INFO] Saving screenshot from Screenshot tab...");
        try {
          // Wait for the image element itself to be present
          await page.waitForSelector(screenshotImgSelector, {
            visible: true,
            timeout: 10000,
          });
          const screenshotElement = await page.$(screenshotImgSelector);
          if (screenshotElement) {
            await screenshotElement.screenshot({ path: screenshotPathAbs });
            core.info(
              `[INFO] Screenshot saved successfully to ${screenshotPathAbs}`
            );
            core.setOutput("screenshot-path", screenshotPathRel); // Set output on success
          } else {
            core.warning(
              // Use warning
              `[WARN] Screenshot element ('${screenshotImgSelector}') not found after clicking tab. Saving fallback screenshot of tab.`
            );
            await page.screenshot({ path: screenshotPathAbs }); // Save fallback with the main name
            core.info(
              `[INFO] Fallback screenshot saved successfully to ${screenshotPathAbs}`
            );
            core.setOutput("screenshot-path", screenshotPathRel); // Set output for fallback too
          }
        } catch (e) {
          core.error(`[ERROR] Failed to save screenshot image: ${e.message}`);
          // Try a final fallback screenshot
          try {
            const errorScreenshotPath = path.join(
              outputDir,
              "screenshot-save-failure.png"
            );
            await page.screenshot({ path: errorScreenshotPath });
            core.warning(
              `Saved error state screenshot to ${errorScreenshotPath}`
            );
          } catch (se) {
            core.error(
              "[ERROR] Failed to save even the error state screenshot."
            );
          }
        }
      } else {
        core.warning("[WARN] Screenshot Tab click failed, screenshot skipped."); // Use warning
      }

      // Click More Info Tab and gather logs
      let errorLogResult = "Skipped (More Info tab click failed)"; // Default
      if (await safeClick(moreInfoTabSelector, "More Info Tab")) {
        // Click JavaScript Console Errors Button
        if (
          await safeClick(
            consoleErrorsSelector,
            "JavaScript Console Messages Button",
            1000, // Shorter wait after click
            15000 // Increase wait for button itself
          )
        ) {
          core.info("[INFO] Saving console logs...");
          try {
            // Wait for the console log container to appear after clicking the button
            core.info(
              `[DEBUG] Waiting for console log container: ${consoleLogSelector}`
            );
            // Wait longer for the log container to potentially populate
            await page.waitForSelector(consoleLogSelector, {
              timeout: 30000,
            });
            core.info("[DEBUG] Console log container found in DOM.");

            // If selector found, extract content
            errorLogResult = await page.evaluate((selector) => {
              const errorContainer = document.querySelector(selector);
              return errorContainer
                ? errorContainer.textContent ||
                    "Console log container found but empty."
                : "Console log container selector found but querySelector failed inside evaluate.";
            }, consoleLogSelector);
            core.info("[INFO] Console logs obtained successfully");
          } catch (e) {
            if (e.name === "TimeoutError") {
              core.info(
                // Use info, as no logs is not necessarily an error
                `[INFO] Console log container ('${consoleLogSelector}') not found in DOM within timeout. Assuming no messages.`
              );
              errorLogResult =
                "No console log container found (likely no messages).";
            } else {
              core.error(
                // Log other errors more seriously
                `[ERROR] Failed to extract console logs: ${e.message}`
              );
              errorLogResult = `Failed to extract console logs: ${e.message}`;
            }
          }
        } else {
          core.warning(
            "[WARN] JavaScript Console Messages button click failed, logs skipped."
          ); // Use warning
          errorLogResult = "Skipped (Console Messages button click failed)";
        }
      } else {
        core.warning("[WARN] More Info Tab click failed, logs skipped."); // Use warning
      }
      // Save logs result regardless of inner clicks failing
      try {
        fs.writeFileSync(logsPathAbs, errorLogResult);
        core.info(`[INFO] Console logs result saved to ${logsPathAbs}`);
        core.setOutput("logs-path", logsPathRel); // Set output
      } catch (e) {
        core.error(
          `[ERROR] Failed to write console logs result file: ${e.message}`
        );
      }
    } else {
      core.warning(
        // Use warning
        "[WARN] View Tested Page click failed, skipping dependent screenshot and logs."
      );
      // Attempt to save a fallback screenshot and logs even if "View Tested Page" fails
      try {
        fs.writeFileSync(
          logsPathAbs,
          "Skipped (View Tested Page click failed)"
        );
        core.setOutput("logs-path", logsPathRel); // Set output even for skipped
      } catch (e) {
        core.error("[ERROR] Failed to write skipped error log:", e);
      }
      try {
        core.info(
          `[INFO] Taking fallback screenshot to ${fallbackScreenshotPathAbs} because View Tested Page failed...`
        );
        await page.screenshot({ path: fallbackScreenshotPathAbs });
        core.info(`[INFO] Fallback screenshot saved.`);
        core.setOutput("screenshot-path", fallbackScreenshotPathRel); // Set output for fallback
      } catch (e) {
        core.error(`[ERROR] Failed to take fallback screenshot: ${e.message}`);
      }
    }
  } catch (e) {
    // Catch any top-level errors not handled elsewhere
    core.setFailed(`[ERROR] Main execution failed: ${e.message}`);
    // Ensure stack trace is logged if available
    if (e.stack) {
      core.error(e.stack);
    }
  } finally {
    // --- Browser Closing ---
    if (browser) {
      core.info("[INFO] Closing browser...");
      try {
        await browser.close();
        core.info("[INFO] Browser closed successfully.");
      } catch (closeError) {
        core.warning(`[WARN] Error closing browser: ${closeError.message}`); // Warn instead of fail on close error
      }
    } else {
      core.info("[INFO] No browser instance to close.");
    }
  }
})(); // End async function execution
