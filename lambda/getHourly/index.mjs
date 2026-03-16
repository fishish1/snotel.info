export const handler = async (event) => {
  try {
    const site = event.pathParameters?.stationTriplet;
    const element = event.pathParameters?.element || "SNWD";

    if (!site) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Site parameter is missing in path." }),
      };
    }

    console.log(`Fetching data for site: ${site}, element: ${element}`);

    // Compute explicit dates for a 7-day lookback (the REST API doesn't support relative dates like -7)
    const endDate = new Date();
    const beginDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fmt = d => d.toISOString().slice(0, 10); // YYYY-MM-DD

    // NRCS REST API URL for Hourly Data (last 7 days to present)
    const restUrl = `https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1/data?stationTriplets=${site}&elements=${element}&duration=HOURLY&beginDate=${fmt(beginDate)}&endDate=${fmt(endDate)}`;

    const response = await fetch(restUrl, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36"
      }
    });

    if (!response.ok) {
      console.error(`NRCS API error: ${response.status} ${response.statusText}`);
      throw new Error(`NRCS API returned status ${response.status}`);
    }

    const json = await response.json();
    let formattedValues = [];

    // The legacy app.js frontend expects: [{ dateTime: 'YYYY-MM-DD HH:mm', value: 43 }, ...]
    // The new REST API returns: [{ stationTriplet: '...', data: [{ values: [{ date: '...', value: 43 }] }] }]
    if (json && json.length > 0 && json[0].data && json[0].data.length > 0) {
      const rawValues = json[0].data[0].values || [];
      formattedValues = rawValues.map(v => ({
        dateTime: v.date.replace(" ", " "), // Normalize if necessary
        value: v.value
      }));
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Origin": event.stageVariables?.corshost || "*",
        "Access-Control-Allow-Methods": "OPTIONS,POST,GET",
      },
      body: JSON.stringify(formattedValues),
    };

  } catch (error) {
    console.error("Error in handler:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "An internal server error occurred.",
        error: error.message,
      }),
    };
  }
};
