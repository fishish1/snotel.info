import axios from "axios";
import chroma from "chroma-js";
import GeoJSON from "geojson";
import xmlParser from "xml2json";
import soapRequest from "easy-soap-request";
import AWS from "aws-sdk";

const states = ["CO","WA", "UT", "CA", "AK", "WY", "MT", "OR", "AZ", "NM", "NV", "ID"];

let final_data = [];
let states_data = [states.length];

const url = "https://wcc.sc.egov.usda.gov/awdbWebService/services?getStations";
const HourlyUrl = "https://wcc.sc.egov.usda.gov/awdbWebService/services?";
const MetaUrl = "https://wcc.sc.egov.usda.gov/awdbWebService/services?getStationMetadataMultiple";
const HistoricalUrl = "https://wcc.sc.egov.usda.gov/awdbWebService/services?getAveragesData";
const sampleHeaders = {
  "user-agent": "sampleTest",
  "Content-Type": "text/xml;charset=UTF-8",
  soapAction: ""
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
    try {
const filename = state + ".json";
      
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
      var dates = [OneDayAhead, Today5AM, OneDayAgo, TwoDayAgo, FiveDaysAgo, SixDaysAgo];
      console.log(dates);

      const haswindresult = await hasWind(state);
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

      var Today_XML = getHourlyXML2(dates[2],dates[0], states_stations,"SNWD");
      var Yesterday_XML = getHourlyXML2(dates[3],dates[2], states_stations,"SNWD");
      var FiveDaysAgo_XML = getHourlyXML2(dates[5],dates[4], states_stations,"SNWD");

      var Current_SWE_XML = getHourlyXML2(
        dates[2],
        dates[0],
        states_stations,
        "WTEQ"
      );
      var Historical_SWE_XML = getHistoricalXML(
        dates[2],
        dates[0],
        states_stations,
        "WTEQ"
      );

      var Meta_XML = getMetaXML(states_stations);

      const meta = await getMeta(Meta_XML);
      var state_meta = JSON.parse(xmlParser.toJson(meta));
      state_meta =
        state_meta["soap:Envelope"]["soap:Body"][
          "ns2:getStationMetadataMultipleResponse"
        ]["return"];

      const TodayXML = await getHourly(Today_XML);
      var Today_Data = JSON.parse(xmlParser.toJson(TodayXML));
      Today_Data =
        Today_Data["soap:Envelope"]["soap:Body"][
          "ns2:getHourlyDataResponse"
        ]["return"];

      const YesterdayXML = await getHourly(Yesterday_XML);
      var Yesterday_Data = JSON.parse(xmlParser.toJson(YesterdayXML));
      Yesterday_Data =
        Yesterday_Data["soap:Envelope"]["soap:Body"][
          "ns2:getHourlyDataResponse"
        ]["return"];

      const FiveDaysAgoXML = await getHourly(FiveDaysAgo_XML);
      var FiveDaysAgo_Data = JSON.parse(
        xmlParser.toJson(FiveDaysAgoXML)
      );
      FiveDaysAgo_Data =
        FiveDaysAgo_Data["soap:Envelope"]["soap:Body"][
          "ns2:getHourlyDataResponse"
        ]["return"];

      const CurrentSWEXML = await getHourly(Current_SWE_XML);
      var CurrentSWE_Data = JSON.parse(
        xmlParser.toJson(CurrentSWEXML)
      );
      CurrentSWE_Data =
        CurrentSWE_Data["soap:Envelope"]["soap:Body"][
          "ns2:getHourlyDataResponse"
        ]["return"];

      const HistoricalSWEXML = await getHistorical(Historical_SWE_XML);
      var HistoricalSWE_Data = JSON.parse(
        xmlParser.toJson(HistoricalSWEXML)
      );
      HistoricalSWE_Data =
        HistoricalSWE_Data["soap:Envelope"]["soap:Body"][
          "ns2:getAveragesDataResponse"
        ]["return"];

      var cc;
      var current_bases = [];

      current_bases = get_best_data_from_object(Today_Data);
      final_data = [];

      var Today_Object = get_best_data_from_object(Today_Data);
      var Yesterday_Object = get_best_data_from_object(
        Yesterday_Data
      );
      var FiveDaysAgo_Object = get_best_data_from_object(
        FiveDaysAgo_Data
      );
      var CurrentSWE_Object = get_best_data_from_object(
        CurrentSWE_Data
      );
      var HistoricalSWE_Object = get_best_hist_data_from_object(
        HistoricalSWE_Data
      );

      for (cc = 0; cc < state_meta.length; cc++) {
        final_data[cc] = {};
        final_data[cc]["stationTriplet"] =
          state_meta[cc]["stationTriplet"];
        final_data[cc]["name"] = state_meta[cc]["name"];
        final_data[cc]["latitude"] = state_meta[cc]["latitude"];
        final_data[cc]["longitude"] = state_meta[cc]["longitude"];
        final_data[cc]["Avg"] = parseInt(CurrentSWE_Object[cc]/HistoricalSWE_Object[cc]*100);
        if(haswindresult.includes(state_meta[cc]["stationTriplet"])==true){
            final_data[cc]["Wind"] = "Yes"
        } else final_data[cc]["Wind"] = "No";

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
        final_data[cc]["avgColor"] = rgbToHex(
          fh(final_data[cc]["Avg"])
        );
        if (
          final_data[cc]["Avg"] < 0 || 
          final_data[cc]["Avg"] == null ||
          HistoricalSWE_Object[cc] == null) {
          final_data[cc]["avgColor"] = '000000';
        }
      }

      state_data = JSON.stringify(GeoJSON.parse(final_data, {
        Point: ["latitude", "longitude"]
      }));

      console.log(JSON.stringify(state_data));
      
      if (process.env.DRY_RUN !== 'true') {
        await s3.putObject({
          Bucket: bucketName,
          Key: filename,
          Body: state_data,
          ContentType: "application/json"
        }).promise();
        console.log(state, "JSON saved to S3");
      } else {
        console.log("DRY_RUN is set. Skipping S3 upload.");
      }    } catch (err) {
      console.error(`Error processing state ${state}:`, err);
    }
  }
}
