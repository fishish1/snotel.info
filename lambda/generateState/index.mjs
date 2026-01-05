import axios from "axios";
import chroma from "chroma-js";
import GeoJSON from "geojson";
import xmlParser from "xml2json";
import soapRequest from "easy-soap-request";
import AWS from "aws-sdk";
import fs from "fs";

const states = ["CO", "WA", "UT", "CA", "AK", "WY", "MT", "OR", "AZ", "NM", "NV", "ID"];

let final_data = [];
let states_data = [states.length];

const url = "https://wcc.sc.egov.usda.gov/awdbWebService/services?getStations";
const HourlyUrl = "https://wcc.sc.egov.usda.gov/awdbWebService/services?";
const MetaUrl =
  "https://wcc.sc.egov.usda.gov/awdbWebService/services?getStationMetadataMultiple";
const HistoricalUrl =
  "https://wcc.sc.egov.usda.gov/awdbWebService/services?getAveragesData";
const sampleHeaders = {
  "user-agent": "sampleTest",
  "Content-Type": "text/xml;charset=UTF-8"
};

let stations;
let i;
let input;
let Element = "SNWD";

const s3 = new AWS.S3();
const bucketName = "snotel.info";
const getStationsKey = "getstations.xml";

export async function handler(event, context) {
  var state_data;
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

      var now = new Date();
      var Today5AM = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        now.getHours(),
        0,
        0,
        0
      );
      var SixDaysAgo = new Date(Today5AM - 6 * 24 * 60 * 60 * 1000);
      var FiveDaysAgo = new Date(Today5AM - 5 * 24 * 60 * 60 * 1000);
      var TwoDayAgo = new Date(Today5AM - 2 * 24 * 60 * 60 * 1000);
      var OneDayAgo = new Date(Today5AM - 1 * 24 * 60 * 60 * 1000);
      var OneDayAhead = new Date(Today5AM.getTime() + 2 * 24 * 60 * 60 * 1000);
      var dates = [
        OneDayAhead,
        Today5AM,
        OneDayAgo,
        TwoDayAgo,
        FiveDaysAgo,
        SixDaysAgo,
      ];
      console.log(dates);

      const haswindresult = await hasWind(state);
      const hasWindSet = new Set(haswindresult);

      console.log(haswindresult);

      input =
        '<?xml version="1.0" encoding="UTF-8"?> ' +
        '<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" xmlns:q0="http://www.wcc.nrcs.usda.gov/ns/awdbWebService" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"> ' +
        "  <SOAP-ENV:Body> " +
        "   <q0:getStations> " +
        "      <stateCds>" +
        state +
        "</stateCds> " +
        "      <networkCds>SNTL</networkCds> " +
        "      <logicalAnd>true</logicalAnd> " +
        "   </q0:getStations>" +
        " </SOAP-ENV:Body>" +
        "</SOAP-ENV:Envelope>";

      const result = await getStations(input);
      var states_stations = JSON.parse(xmlParser.toJson(result));
      states_stations =
        states_stations["soap:Envelope"]["soap:Body"][
        "ns2:getStationsResponse"
        ]["return"];

      // Prepare XML requests
      var Today_XML = getHourlyXML2(dates[2], dates[0], states_stations, "SNWD");
      var Yesterday_XML = getHourlyXML2(dates[3], dates[2], states_stations, "SNWD");
      var FiveDaysAgo_XML = getHourlyXML2(dates[5], dates[4], states_stations, "SNWD");
      var Current_SWE_XML = getHourlyXML2(dates[2], dates[0], states_stations, "WTEQ");
      var Historical_SWE_XML = getHistoricalXML(dates[2], dates[0], states_stations, "WTEQ");
      var Meta_XML = getMetaXML(states_stations);

      // Execute all requests concurrently
      const [
        meta,
        TodayXML,
        YesterdayXML,
        FiveDaysAgoXML,
        CurrentSWEXML,
        HistoricalSWEXML
      ] = await Promise.all([
        getMeta(Meta_XML),
        getHourly(Today_XML),
        getHourly(Yesterday_XML),
        getHourly(FiveDaysAgo_XML),
        getHourly(Current_SWE_XML),
        getHistorical(Historical_SWE_XML)
      ]);

      // Process Responses
      var state_meta = JSON.parse(xmlParser.toJson(meta));
      state_meta = state_meta["soap:Envelope"]["soap:Body"]["ns2:getStationMetadataMultipleResponse"]["return"];

      var Today_Data = JSON.parse(xmlParser.toJson(TodayXML));
      Today_Data = Today_Data["soap:Envelope"]["soap:Body"]["ns2:getHourlyDataResponse"]["return"];

      var Yesterday_Data = JSON.parse(xmlParser.toJson(YesterdayXML));
      Yesterday_Data = Yesterday_Data["soap:Envelope"]["soap:Body"]["ns2:getHourlyDataResponse"]["return"];

      var FiveDaysAgo_Data = JSON.parse(xmlParser.toJson(FiveDaysAgoXML));
      FiveDaysAgo_Data = FiveDaysAgo_Data["soap:Envelope"]["soap:Body"]["ns2:getHourlyDataResponse"]["return"];

      var CurrentSWE_Data = JSON.parse(xmlParser.toJson(CurrentSWEXML));
      CurrentSWE_Data = CurrentSWE_Data["soap:Envelope"]["soap:Body"]["ns2:getHourlyDataResponse"]["return"];

      var HistoricalSWE_Data = JSON.parse(xmlParser.toJson(HistoricalSWEXML));
      HistoricalSWE_Data = HistoricalSWE_Data["soap:Envelope"]["soap:Body"]["ns2:getAveragesDataResponse"]["return"];

      var cc;
      var current_bases = [];

      current_bases = get_best_data_from_object(Today_Data);
      final_data = [];

      var Today_Object = get_best_data_from_object(Today_Data);
      var Yesterday_Object = get_best_data_from_object(Yesterday_Data);
      var FiveDaysAgo_Object = get_best_data_from_object(FiveDaysAgo_Data);
      var CurrentSWE_Object = get_best_data_from_object(CurrentSWE_Data);
      var HistoricalSWE_Object =
        get_best_hist_data_from_object(HistoricalSWE_Data);

      for (cc = 0; cc < state_meta.length; cc++) {
        final_data[cc] = {};
        //new row for each object in old data
        final_data[cc]["stationTriplet"] =
          state_meta[cc]["stationTriplet"];
        final_data[cc]["name"] = state_meta[cc]["name"];
        final_data[cc]["latitude"] = state_meta[cc]["latitude"];
        final_data[cc]["longitude"] = state_meta[cc]["longitude"];
        final_data[cc]["Avg"] = parseInt(CurrentSWE_Object[cc] / HistoricalSWE_Object[cc] * 100);

        // Optimize wind lookup using Set (created outside loop ideally, but array is small enough here)
        // Better: Create Set outside loop.
        if (hasWindSet.has(state_meta[cc]["stationTriplet"])) {
          final_data[cc]["Wind"] = "Yes"
        } else final_data[cc]["Wind"] = "No"

        if (Today_Object[cc] > 0) {
          final_data[cc]["Today"] = Today_Object[cc];
        } else if (Today_Object[cc] > -10) {
          final_data[cc]["Today"] = 0;
        }

        if (Yesterday_Object[cc] > 0) {
          final_data[cc]["Yesterday"] = Yesterday_Object[cc];
        } else if (Yesterday_Object[cc] > -10) {
          final_data[cc]["Yesterday"] = 0;
        }

        if (FiveDaysAgo_Object[cc] > 0) {
          final_data[cc]["FiveDaysAgo"] = FiveDaysAgo_Object[cc];
        } else if (FiveDaysAgo_Object[cc] > -10) {
          final_data[cc]["FiveDaysAgo"] = 0;
        }

        if (
          final_data[cc]["Today"] == -999 ||
          final_data[cc]["Today"] == null
        ) {
          final_data[cc]["Today"] = final_data[cc]["Yesterday"];
        }
        if (
          final_data[cc]["Today"] == -999 ||
          final_data[cc]["Today"] == null
        ) {
          final_data[cc]["Today"] = final_data[cc]["FiveDaysAgo"];
        }

        if (
          final_data[cc]["Yesterday"] == -999 ||
          final_data[cc]["Yesterday"] == null
        ) {
          final_data[cc]["Yesterday"] = final_data[cc]["Today"];
        }
        if (
          final_data[cc]["Yesterday"] == -999 ||
          final_data[cc]["Yesterday"] == null
        ) {
          final_data[cc]["Yesterday"] =
            final_data[cc]["FiveDaysAgo"];
        }

        if (
          final_data[cc]["FiveDaysAgo"] == -999 ||
          final_data[cc]["FiveDaysAgo"] == null
        ) {
          final_data[cc]["FiveDaysAgo"] =
            final_data[cc]["Yesterday"];
        }
        if (
          final_data[cc]["FiveDaysAgo"] == -999 ||
          final_data[cc]["FiveDaysAgo"] == null
        ) {
          final_data[cc]["FiveDaysAgo"] = final_data[cc]["Today"];
        }

        if (
          final_data[cc]["Today"] == -999 ||
          final_data[cc]["Today"] == null
        ) {
          final_data[cc]["Today"] = 0;
        }
        if (
          final_data[cc]["Yesterday"] == -999 ||
          final_data[cc]["Yesterday"] == null
        ) {
          final_data[cc]["Yesterday"] = 0;
        }
        if (
          final_data[cc]["FiveDaysAgo"] == -999 ||
          final_data[cc]["FiveDaysAgo"] == null
        ) {
          final_data[cc]["FiveDaysAgo"] = 0;
        }

        final_data[cc]["OneDayChange"] =
          final_data[cc]["Today"] - final_data[cc]["Yesterday"];
        final_data[cc]["FiveDayChange"] =
          final_data[cc]["Today"] - final_data[cc]["FiveDaysAgo"];
        final_data[cc]["TodayColor"] = rgbToHex(
          fb(final_data[cc]["Today"])
        );
        final_data[cc]["OneDayColor"] = rgbToHex(
          f1(final_data[cc]["OneDayChange"])
        );
        final_data[cc]["FiveDayColor"] = rgbToHex(
          f5(final_data[cc]["FiveDayChange"])
        );

        final_data[cc]["DoubleCheck"] =
          FiveDaysAgo_Data[cc]["stationTriplet"];
        final_data[cc]["elevation"] = parseInt(
          state_meta[cc]["elevation"]
        );
        final_data[cc]["elevationColor"] = rgbToHex(
          fe(state_meta[cc]["elevation"])
        );
        final_data[cc]["avgColor"] = rgbToHex(fh(final_data[cc]["Avg"]));
        if (
          final_data[cc]["Avg"] < 0 ||
          final_data[cc]["Avg"] == null ||
          HistoricalSWE_Object[cc] == null
        ) {
          final_data[cc]["avgColor"] = "000000";
        }
      }
      state_data = JSON.stringify(
        GeoJSON.parse(final_data, {
          Point: ["latitude", "longitude"],
        })
      );

      console.log(JSON.stringify(state_data));

      if (process.env.LOCAL_WRITE === "1") {
        // Write to local file instead of S3
        try {
          const currentDir = process.cwd();
          const fullPath = `${currentDir}/${filename}`;
          console.log(`Attempting to write file to: ${fullPath}`);
          console.log(`Current working directory: ${currentDir}`);
          console.log(`LOCAL_WRITE env var: ${process.env.LOCAL_WRITE}`);

          fs.writeFileSync(filename, state_data, { encoding: "utf8" });

          // Verify the file was written
          if (fs.existsSync(filename)) {
            const stats = fs.statSync(filename);
            console.log(
              `${state} JSON saved locally as ${filename} (${stats.size} bytes)`
            );
          } else {
            console.error(`File ${filename} was not created successfully`);
          }
        } catch (err) {
          console.error("Failed to write local file:", err);
          console.error("Error details:", {
            code: err.code,
            path: err.path,
            message: err.message,
          });
        }
      } else if (process.env.DRY_RUN !== "true") {
        console.log(`Attempting to write ${filename} to S3 bucket ${bucketName}.`);
        try {
          await s3
            .putObject({
              Bucket: bucketName,
              Key: filename,
              Body: state_data,
              ContentType: "application/json",
            })
            .promise();
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

async function hasWind(Selected_State) {
  var wind_stations;

  input =
    '<?xml version="1.0" encoding="UTF-8"?> ' +
    '<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" xmlns:q0="http://www.wcc.nrcs.usda.gov/ns/awdbWebService" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"> ' +
    "  <SOAP-ENV:Body> " +
    "   <q0:getStations> " +
    "      <networkCds>SNTL</networkCds> " +
    "      <stateCds>" +
    Selected_State +
    "</stateCds> " +
    "        <elementCds>WSPDV</elementCds>" +
    "      <logicalAnd>true</logicalAnd> " +
    "   </q0:getStations>" +
    " </SOAP-ENV:Body>" +
    "</SOAP-ENV:Envelope>";

  //console.log(OneDayAgo.getMonth());
  var result = await getStations(input)
  wind_stations = JSON.parse(xmlParser.toJson(result));
  console.log(wind_stations);
  wind_stations =
    wind_stations["soap:Envelope"]["soap:Body"][
    "ns2:getStationsResponse"
    ]["return"];
  return (wind_stations);


}

async function getStations(XML_String) {
  console.log(XML_String)
  var XML_Instance = await XML_String;
  const { response } = await soapRequest({
    url: url,
    headers: sampleHeaders,
    xml: XML_Instance
  });
  const { headers, body, statusCode } = response;
  return body;
}

async function getHourly(XML_String) {
  var XML_Instance = await XML_String;
  const { response } = await soapRequest({
    url: HourlyUrl,
    headers: {
      ...sampleHeaders,
    },
    xml: XML_Instance
  });
  const { headers, body, statusCode } = response;
  return body;
}

async function getMeta(XML_String) {
  var XML_Instance = await XML_String;
  const { response } = await soapRequest({
    url: MetaUrl,
    headers: {
      ...sampleHeaders,
    },
    xml: XML_Instance
  });
  const { headers, body, statusCode } = response;
  return body;
}

async function getHistorical(XML_String) {
  var XML_Instance = await XML_String;
  const { response } = await soapRequest({
    url: HistoricalUrl,
    headers: {
      ...sampleHeaders,
    },
    xml: XML_Instance
  });
  const { headers, body, statusCode } = response;
  return body;
}

function getHourlyXML2(StartTime, EndTime, Stations, Element) {
  //EndTime = EndTime + new Date(1*24*60*60*1000);
  var StartString =
    StartTime.getFullYear() +
    "-" +
    (StartTime.getMonth() > 8
      ? StartTime.getMonth() + 1
      : "0" + (StartTime.getMonth() + 1)) +
    "-" +
    StartTime.getDate();
  var EndString =
    EndTime.getFullYear() +
    "-" +
    (EndTime.getMonth() > 8
      ? EndTime.getMonth() + 1
      : "0" + (EndTime.getMonth() + 1)) +
    "-" +
    (EndTime.getDate() > 9 ? EndTime.getDate() : "0" + EndTime.getDate());
  var input2;
  input2 =
    '<?xml version="1.0" encoding="UTF-8"?> ' +
    '<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" xmlns:q0="http://www.wcc.nrcs.usda.gov/ns/awdbWebService" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"> ' +
    "  <SOAP-ENV:Body> " +
    "       <q0:getHourlyData> ";

  var j;
  try {
    for (j = 0; j < Stations.length; j++) {
      input2 = input2 + "<stationTriplets>" + Stations[j] + "</stationTriplets>";
    }
  } catch (err) {
    //}
    console.log("No Object From Stations", err.message);
  }

  input2 =
    input2 +
    "<elementCd>" +
    Element +
    "</elementCd> " +
    "      <ordinal>1</ordinal> " +
    "   <beginDate>" +
    StartString +
    "</beginDate> " +
    "    <endDate>" +
    EndString +
    "</endDate> " +
    "   </q0:getHourlyData>" +
    " </SOAP-ENV:Body>" +
    "</SOAP-ENV:Envelope>";
  //console.log(input2);
  return input2;
}
function getHistoricalXML(StartTime, EndTime, Stations, Element) {
  //////  <?xml version="1.0" encoding="UTF-8"?>
  //////<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" xmlns:q0="http://www.wcc.nrcs.usda.gov/ns/awdbWebService" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  //////  <SOAP-ENV:Body>
  //////    <q0:getAveragesData>
  //////      <stationTriplets>1033:CO:SNTL</stationTriplets>
  //////      <elementCd>SNWD</elementCd>
  //////      <duration>DAILY</duration>
  //////      <getFlags>true</getFlags>
  //////      <beginMonth>1</beginMonth>
  //////      <beginDay>15</beginDay>
  //////      <endMonth>2</endMonth>
  //////      <endDay>28</endDay>
  //////    </q0:getAveragesData>
  //////  </SOAP-ENV:Body>
  //////</SOAP-ENV:Envelope>

  //EndTime = EndTime + new Date(1*24*60*60*1000);
  var StartMonth =
    StartTime.getMonth() > 8
      ? StartTime.getMonth() + 1
      : "0" + (StartTime.getMonth() + 1);
  var StartDay =
    StartTime.getDate() > 9 ? StartTime.getDate() : "0" + StartTime.getDate();
  var EndMonth =
    EndTime.getMonth() > 8
      ? EndTime.getMonth() + 1
      : "0" + (EndTime.getMonth() + 1);
  var EndDay =
    EndTime.getDate() > 9 ? EndTime.getDate() : "0" + EndTime.getDate();
  var input2;
  input2 =
    '<?xml version="1.0" encoding="UTF-8"?> ' +
    '<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" xmlns:q0="http://www.wcc.nrcs.usda.gov/ns/awdbWebService" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"> ' +
    "  <SOAP-ENV:Body> " +
    "       <q0:getAveragesData> ";

  var j;
  try {
    for (j = 0; j < Stations.length; j++) {
      input2 =
        input2 + "<stationTriplets>" + Stations[j] + "</stationTriplets>";
    }
  } catch (err) {

    console.log("No Object From Stations", err.message);
  }

  input2 =
    input2 +
    "<elementCd>" +
    Element +
    "</elementCd> " +
    "<duration>DAILY</duration>" +
    "<getFlags>true</getFlags>" +
    "<beginMonth>" +
    StartMonth +
    "</beginMonth>" +
    "<beginDay>" +
    StartDay +
    "</beginDay>" +
    "<endMonth>" +
    EndMonth +
    "</endMonth>" +
    "<endDay>" +
    EndDay +
    "</endDay>" +
    "</q0:getAveragesData>" +
    "</SOAP-ENV:Body>" +
    "</SOAP-ENV:Envelope>";
  // console.log(input2);
  return input2;
}
function getMetaXML(Stations) {
  var input2;
  console.log("Stations Received:", Stations);
  /*
  <?xml version="1.0" encoding="UTF-8"?>
<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" xmlns:q0="http://www.wcc.nrcs.usda.gov/ns/awdbWebService" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <SOAP-ENV:Body>
    <q0:getStationMetadata>
      <stationTriplet>1269:UT:SNTL</stationTriplet>
    </q0:getStationMetadata>
  </SOAP-ENV:Body>
</SOAP-ENV:Envelope>
  */
  input2 =
    '<?xml version="1.0" encoding="UTF-8"?> ' +
    '<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" xmlns:q0="http://www.wcc.nrcs.usda.gov/ns/awdbWebService" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    "  <SOAP-ENV:Body> " +
    "       <q0:getStationMetadataMultiple> ";

  var j;
  try {
    for (j = 0; j < Stations.length; j++) {
      input2 =
        input2 + "<stationTriplets>" + Stations[j] + "</stationTriplets>";
    }
  } catch (err) {
    console.log("No Object From Stations", err.message);
  }

  input2 =
    input2 +
    "   </q0:getStationMetadataMultiple>" +
    " </SOAP-ENV:Body>" +
    "</SOAP-ENV:Envelope>";

  return input2;
}

function get_best_data_from_object(Object) {
  var ccc = 0;
  var Return_Object = [];
  for (ccc = 0; ccc < Object.length; ccc++) {
    Return_Object[ccc] = -999;
    if (ccc in Object) {
      if (["values"] in Object[ccc]) {
        if (["value"] in Object[ccc]["values"]) {
          //console.log(Object[ccc]["values"]["value"]);
          Return_Object[ccc] = parseInt(Object[ccc]["values"]["value"]);
        } else {
          //if multiple values
          var ii;
          //console.log(Object[cc]["values"].length);
          var Found_Good_Data = false;

          for (ii = Object[ccc]["values"].length; ii > 0; ii--) {
            if (Found_Good_Data == false) {
              if (typeof Object[ccc]["values"][ii - 1] !== "undefined") {
                if (Object[ccc]["values"][ii - 1]["flag"] == "V") {
                  Return_Object[ccc] = parseInt(
                    Object[ccc]["values"][ii - 1]["value"]
                  );
                  Found_Good_Data = true;
                } else if (Return_Object[ccc] == -999) {
                  console.log("Replaced");
                  Return_Object[ccc] = parseInt(
                    Object[ccc]["values"][ii - 1]["value"]
                  );
                }
              } else {
                console.log("No Flag", Object[ccc]["values"][ii - 1]);
              }
            } else {
              //console.log("Kept Best Value")
            }
          }
        }
      }
    }
  }

  //console.log(Return_Object);
  return Return_Object;
}

function get_best_hist_data_from_object(Object) {
  var ccc = 0;
  var Return_Object = [];
  for (ccc = 0; ccc < Object.length; ccc++) {
    if (ccc in Object) {
      if (["values"] in Object[ccc]) {

        //if multiple values
        var ii;
        //console.log(Object[cc]["values"].length);
        var total = 0;
        // if (Object[ccc]["flags"][0] == "U") {
        for (ii = Object[ccc]["values"].length; ii > 0; ii--) {


          total = total + parseInt(
            Object[ccc]["values"][ii - 1]
          );
          //  }

        }

        Return_Object.push(total / Object[ccc]["values"].length)

      } else {
        Return_Object.push(null)
      }
    }
  }

  //console.log(Return_Object);
  return Return_Object;
}
function componentToHex(c) {
  //var hex = c.toString(16);
  // console.log(hex);
  return ("0" + Number(c).toString(16)).slice(-2).toUpperCase();

  //return hex.length == 1 ? "0" + hex : hex;
}

function rgbToHex(o) {
  var r, g, b, a;
  o = o["_rgb"];
  r = o[0];
  g = o[1];
  b = o[2];
  //console.log(r)
  return (
    componentToHex(parseInt(r)) +
    componentToHex(parseInt(g)) +
    componentToHex(parseInt(b))
  );
}