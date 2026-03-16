import chroma from "chroma-js";
import GeoJSON from "geojson";
import AWS from "aws-sdk";
import fs from "fs";

const s3 = new AWS.S3();
const bucketName = "snotel.info";

const states = ["CO", "WA", "UT", "CA", "AK", "WY", "MT", "OR", "AZ", "NM", "NV", "ID"];

// Standard Chrome User-Agent prevents NRCS AWS WAF from blocking our lambda requests
const headers = {
  "Accept": "application/json",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36"
};

export async function handler(event, context) {
  var f1 = chroma.scale(["red", "#cccccc", "white"]).domain([-6, -1, 6]);
  var f5 = chroma.scale(["red", "#cccccc", "white"]).domain([-10, -1, 10]);
  var fb = chroma.scale(["red", "#cccccc", "white"]).domain([0, 50, 100]);
  var fe = chroma.scale(["green", "white"]).domain([5000, 11000]);
  var fh = chroma.scale(["red", "#cccccc", "white"]).domain([0, 100, 150]);

  const stateArg = event && event.state ? event.state : null;
  const statesToProcess = stateArg ? [stateArg] : states;

  for (const state of statesToProcess) {
    console.log(`Processing state: ${state}`);
    try {
      const filename = "assets/" + state + ".json";

      // --- DATE MATH ---
      // NRCS REST API uses yyyy-MM-dd HH:mm or relative dates. We'll format absolute dates.
      const now = new Date();

      // Calculate 5 AM today
      const Today5AM = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 5, 0, 0);

      const formatApiDate = (dateObj) => {
        const yyyy = dateObj.getFullYear();
        const MM = String(dateObj.getMonth() + 1).padStart(2, '0');
        const dd = String(dateObj.getDate()).padStart(2, '0');
        return `${yyyy}-${MM}-${dd} 05:00`;
      };

      const formatApiDateNoTime = (dateObj) => {
        const yyyy = dateObj.getFullYear();
        const MM = String(dateObj.getMonth() + 1).padStart(2, '0');
        const dd = String(dateObj.getDate()).padStart(2, '0');
        return `${yyyy}-${MM}-${dd}`;
      };

      const dateStrings = {
        today: formatApiDate(Today5AM),
        yesterday: formatApiDate(new Date(Today5AM.getTime() - 1 * 24 * 60 * 60 * 1000)),
        twoDaysAgo: formatApiDate(new Date(Today5AM.getTime() - 2 * 24 * 60 * 60 * 1000)),
        fiveDaysAgo: formatApiDate(new Date(Today5AM.getTime() - 5 * 24 * 60 * 60 * 1000)),
        sixDaysAgo: formatApiDate(new Date(Today5AM.getTime() - 6 * 24 * 60 * 60 * 1000)),
        oneDayAhead: formatApiDate(new Date(Today5AM.getTime() + 1 * 24 * 60 * 60 * 1000)),

        // Averages require YYYY-MM-DD
        todayNoTime: formatApiDateNoTime(Today5AM),
        yesterdayNoTime: formatApiDateNoTime(new Date(Today5AM.getTime() - 1 * 24 * 60 * 60 * 1000))
      };


      // --- 1. FETCH STATIONS & METADATA ---
      // The new REST API returns metadata (lat, lng, elevation) directly in the station list!
      console.log(`Fetching stations for ${state}...`);
      const stationsRes = await fetch(`https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1/stations?stateCds=${state}&networkCds=SNTL&elements=SNWD`, { headers });
      if (!stationsRes.ok) throw new Error(`Stations API failed: ${stationsRes.status}`);
      const allStationsData = await stationsRes.json();

      // Filter to only stations whose triplet state+network matches (e.g. "1005:CO:SNTL" -> state "CO", network "SNTL")
      // This matches the SOAP behavior which only returned active SNTL stations for this state.
      const stationsData = allStationsData.filter(s => {
        const parts = s.stationTriplet.split(':');
        return parts[1] === state && parts[2] === 'SNTL';
      });
      console.log(`Found ${stationsData.length} ${state} SNTL stations with SNWD (from ${allStationsData.length} total returned).`);

      // Build a comma-delimited string of all stations for the data request
      const stationTripletsArr = stationsData.map(s => s.stationTriplet);
      const stationTripletsString = stationTripletsArr.join(",");


      // --- 2. COMPILE WIND STATIONS ---
      console.log(`Fetching wind stations for ${state}...`);
      const windRes = await fetch(`https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1/stations?stateCds=${state}&networkCds=SNTL&elements=WSPDV`, { headers });
      let hasWindSet = new Set();
      if (windRes.ok) {
        const windData = await windRes.json();
        hasWindSet = new Set(windData.map(s => s.stationTriplet));
      } else {
        console.warn(`Wind API failed with: ${windRes.status}`);
      }


      // --- 3. FETCH HOURLY & HISTORICAL DATA ---
      // The USDA REST API silently drops data when you request thousands of stations in one URL.
      // Solution: split into chunks of 100, fire ALL chunks in parallel, then merge results.
      const chunkSize = 100;
      let jsonToday = [], jsonYesterday = [], jsonFive = [], jsonSWE = [], jsonHistorical = [];

      const fetchChunk = async (chunk) => {
        const chunkString = chunk.join(",");
        const urls = [
          `https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1/data?stationTriplets=${chunkString}&elements=SNWD&duration=HOURLY&beginDate=${dateStrings.yesterday}&endDate=${dateStrings.oneDayAhead}`,
          `https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1/data?stationTriplets=${chunkString}&elements=SNWD&duration=HOURLY&beginDate=${dateStrings.twoDaysAgo}&endDate=${dateStrings.yesterday}`,
          `https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1/data?stationTriplets=${chunkString}&elements=SNWD&duration=HOURLY&beginDate=${dateStrings.sixDaysAgo}&endDate=${dateStrings.fiveDaysAgo}`,
          `https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1/data?stationTriplets=${chunkString}&elements=WTEQ&duration=DAILY&beginDate=${dateStrings.yesterdayNoTime}&endDate=${dateStrings.todayNoTime}`,
          `https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1/data?stationTriplets=${chunkString}&elements=WTEQ&duration=DAILY&beginDate=${dateStrings.yesterdayNoTime}&endDate=${dateStrings.yesterdayNoTime}&centralTendencyType=AVERAGE`
        ];
        const responses = await Promise.all(urls.map(u => fetch(u, { headers })));
        return Promise.all(responses.map(r => r.ok ? r.json() : []));
      };

      // Build all chunk arrays
      const chunks = [];
      for (let i = 0; i < stationTripletsArr.length; i += chunkSize) {
        chunks.push(stationTripletsArr.slice(i, i + chunkSize));
      }
      console.log(`Fetching API data for ${stationTripletsArr.length} stations in ${chunks.length} parallel chunks...`);

      // Fire ALL chunks at once
      const chunkResults = await Promise.all(chunks.map(fetchChunk));

      // Merge results
      for (const [tData, yData, fData, sData, hData] of chunkResults) {
        jsonToday = jsonToday.concat(tData);
        jsonYesterday = jsonYesterday.concat(yData);
        jsonFive = jsonFive.concat(fData);
        jsonSWE = jsonSWE.concat(sData);
        jsonHistorical = jsonHistorical.concat(hData);
      }


      // Helper to extract the latest/best value from the REST JSON format
      const extractBestValue = (apiResponseList, targetTriplet) => {
        const stationRecord = apiResponseList.find(r => r.stationTriplet === targetTriplet);
        if (!stationRecord || !stationRecord.data || stationRecord.data.length === 0) return -999;

        const valuesArr = stationRecord.data[0].values;
        if (!valuesArr || valuesArr.length === 0) return -999;

        // Loop backwards to find the most recent valid number
        for (let i = valuesArr.length - 1; i >= 0; i--) {
          const v = valuesArr[i];
          if (v.value !== null && v.value !== undefined) {
            return parseInt(v.value);
          }
        }
        return -999;
      };

      // Helper for historical SWE parsing. The average data is stored under timingCentralTendencies or a single value.
      // For standard 'AVERAGE' REST call, looking at a single day, the average is just in 'values'
      const extractHistoricalAvgSWE = (apiResponseList, targetTriplet) => {
        const stationRecord = apiResponseList.find(r => r.stationTriplet === targetTriplet);
        if (!stationRecord || !stationRecord.data || stationRecord.data.length === 0) return null;

        const valuesArr = stationRecord.data[0].values;
        if (!valuesArr || valuesArr.length === 0) return null;

        let total = 0;
        let count = 0;
        for (let i = 0; i < valuesArr.length; i++) {
          if (valuesArr[i].value !== null) {
            total += parseFloat(valuesArr[i].value);
            count++;
          }
        }
        return count > 0 ? (total / count) : null;
      };

      let final_data = [];

      // --- 4. BUILD FINAL GEOJSON PROPERTIES ---
      for (let i = 0; i < stationsData.length; i++) {
        const meta = stationsData[i];
        const triplet = meta.stationTriplet;

        let row = {
          stationTriplet: triplet,
          name: meta.name,
          latitude: meta.latitude,
          longitude: meta.longitude,
          elevation: parseInt(meta.elevation),
          Wind: hasWindSet.has(triplet) ? "Yes" : "No"
        };

        // Extract values
        let tVal = extractBestValue(jsonToday, triplet);
        let yVal = extractBestValue(jsonYesterday, triplet);
        let fVal = extractBestValue(jsonFive, triplet);
        let currentSwe = extractBestValue(jsonSWE, triplet);
        let histSwe = extractHistoricalAvgSWE(jsonHistorical, triplet);


        // Normalize Data using legacy boundary rules
        row.Today = (tVal > 0) ? tVal : (tVal > -10 ? 0 : -999);
        row.Yesterday = (yVal > 0) ? yVal : (yVal > -10 ? 0 : -999);
        row.FiveDaysAgo = (fVal > 0) ? fVal : (fVal > -10 ? 0 : -999);

        // Cascading Fallbacks
        if (row.Today === -999) row.Today = row.Yesterday;
        if (row.Today === -999) row.Today = row.FiveDaysAgo;
        if (row.Yesterday === -999) row.Yesterday = row.Today;
        if (row.Yesterday === -999) row.Yesterday = row.FiveDaysAgo;
        if (row.FiveDaysAgo === -999) row.FiveDaysAgo = row.Yesterday;
        if (row.FiveDaysAgo === -999) row.FiveDaysAgo = row.Today;

        // Zero-Out Final
        if (row.Today === -999) row.Today = 0;
        if (row.Yesterday === -999) row.Yesterday = 0;
        if (row.FiveDaysAgo === -999) row.FiveDaysAgo = 0;

        // Color and Math
        row.OneDayChange = row.Today - row.Yesterday;
        row.FiveDayChange = row.Today - row.FiveDaysAgo;

        row.TodayColor = rgbToHex(fb(row.Today));
        row.OneDayColor = rgbToHex(f1(row.OneDayChange));
        row.FiveDayColor = rgbToHex(f5(row.FiveDayChange));
        row.elevationColor = rgbToHex(fe(row.elevation));

        // Average SWE Math
        if (currentSwe !== -999 && histSwe !== null && histSwe > 0) {
          row.Avg = parseInt((currentSwe / histSwe) * 100);
          row.avgColor = rgbToHex(fh(row.Avg));
        } else {
          row.Avg = null;
          row.avgColor = "000000";
        }

        row.DoubleCheck = triplet; // Legacy field match
        final_data.push(row);
      }

      const state_data = JSON.stringify(
        GeoJSON.parse(final_data, {
          Point: ["latitude", "longitude"],
        })
      );

      // console.log(JSON.stringify(state_data));

      // --- 5. WRITE ARTIFACT ---
      if (process.env.LOCAL_WRITE === "1") {
        try {
          const currentDir = process.cwd();
          const fullPath = `${currentDir}/${filename}`;
          fs.writeFileSync(filename, state_data, { encoding: "utf8" });
          if (fs.existsSync(filename)) {
            console.log(`${state} JSON saved locally as ${filename} (${fs.statSync(filename).size} bytes)`);
          } else {
            console.error(`File ${filename} was not created successfully`);
          }
        } catch (err) {
          console.error("Failed to write local file:", err);
        }
      } else if (process.env.DRY_RUN !== "true") {
        console.log(`Attempting to write ${filename} to S3 bucket ${bucketName}.`);
        try {
          await s3.putObject({
            Bucket: bucketName,
            Key: filename,
            Body: state_data,
            ContentType: "application/json",
          }).promise();
          console.log(`${state} JSON saved to S3 successfully.`);
        } catch (s3Error) {
          console.error(`Failed to write ${filename} to S3:`, s3Error);
        }
      } else {
        console.log("DRY_RUN is set. Skipping S3 upload.");
      }

    } catch (err) {
      console.error(`Error processing state ${state}:`, err);
    }
  }
}

function componentToHex(c) {
  return ("0" + Number(c).toString(16)).slice(-2).toUpperCase();
}

function rgbToHex(o) {
  var r, g, b;
  o = o["_rgb"];
  r = o[0];
  g = o[1];
  b = o[2];
  return (
    componentToHex(parseInt(r)) +
    componentToHex(parseInt(g)) +
    componentToHex(parseInt(b))
  );
}