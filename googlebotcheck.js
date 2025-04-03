const fetch = require("node-fetch");

const url = process.argv[2];
const userAgent =
  "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const errorString = "Application error: a client-side exception has occurred";

if (!url) {
  console.error("Error: Please provide a URL as a command-line argument.");
  process.exit(1);
}

async function checkUrl(targetUrl) {
  let response;
  let status_code;
  let error_flag = false;
  let fetch_error = null;

  try {
    response = await fetch(targetUrl, {
      method: "GET", // Use GET to check body content
      headers: {
        "User-Agent": userAgent,
      },
      // Optional: Add a timeout if needed
      // timeout: 15000 // e.g., 15 seconds
    });

    status_code = response.status;
    const body = await response.text();

    if (body.includes(errorString)) {
      error_flag = true;
    }
  } catch (err) {
    console.error(`Fetch Error: ${err.message}`);
    status_code = "N/A"; // Or handle specific error types
    error_flag = true; // Consider fetch errors as an error state
    fetch_error = err.message;
  } finally {
    // Output results as JSON for easier parsing if needed later
    console.log(
      JSON.stringify({
        url: targetUrl,
        status_code: status_code,
        error: error_flag,
        fetch_error: fetch_error, // Include fetch error details if any
      })
    );
  }
}

checkUrl(url);
