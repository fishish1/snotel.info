import xmlParser from "xml2json";
import soapRequest from "easy-soap-request";

const HourlyUrl = "https://wcc.sc.egov.usda.gov/awdbWebService/services?";
const sampleHeaders = {
  "user-agent": "sampleTest",
  "Content-Type": "text/xml;charset=UTF-8",
  soapAction: "",
};

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

    const EndTime = new Date();
    const StartTime = new Date();
    StartTime.setDate(EndTime.getDate() - 7);
    EndTime.setDate(EndTime.getDate() + 1);

    console.log(`Fetching data for site: ${site}, element: ${element}`);
    const input = getHourlyXML2(StartTime, EndTime, site, element);

    const todayXML = await getHourly(input);
    let todayData = JSON.parse(xmlParser.toJson(todayXML));
    todayData =
      todayData["soap:Envelope"]["soap:Body"]["ns2:getHourlyDataResponse"]?.[
        "return"
      ]?.values;

    const corsHost = event.stageVariables?.cors_host || "*";

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Origin": event.stageVariables?.corshost,
        "Access-Control-Allow-Methods": "OPTIONS,POST,GET",
      },
      body: JSON.stringify(todayData || {}),
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

function getHourlyXML2(StartTime, EndTime, Stations, Element) {
  //EndTime = EndTime + new Date(1*24*60*60*1000);
  console.log("Element", Element);

  const StartString =
    StartTime.getFullYear() +
    "-" +
    (StartTime.getMonth() > 8
      ? StartTime.getMonth() + 1
      : "0" + (StartTime.getMonth() + 1)) +
    "-" +
    StartTime.getDate();
  const EndString =
    EndTime.getFullYear() +
    "-" +
    (EndTime.getMonth() > 8
      ? EndTime.getMonth() + 1
      : "0" + (EndTime.getMonth() + 1)) +
    "-" +
    (EndTime.getDate() > 9 ? EndTime.getDate() : "0" + EndTime.getDate());
  let input2;
  input2 =
    '<?xml version="1.0" encoding="UTF-8"?> ' +
    '<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" xmlns:q0="http://www.wcc.nrcs.usda.gov/ns/awdbWebService" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"> ' +
    "  <SOAP-ENV:Body> " +
    "       <q0:getHourlyData> ";

  try {
    //for (j = 0; j < Stations.length; j++) {
    input2 = input2 + "<stationTriplets>" + Stations + "</stationTriplets>";
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
  console.log(input2);
  return input2;
}

async function getHourly(XML_String) {
  const XML_Instance = await XML_String;
  //  console.log(XML_Instance);
  const { response } = await soapRequest({
    url: HourlyUrl,
    headers: sampleHeaders,
    xml: XML_Instance,
  });
  const { body } = response;
  return body;
}
