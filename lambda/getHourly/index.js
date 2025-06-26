export const handler = async (event, context, callback) => {

var EndTime = new Date();
var StartTime = new Date();
if (request.params.Element) {
  Element = request.params.Element;
}
StartTime.setDate(EndTime.getDate() - 7);
EndTime.setDate(EndTime.getDate() + 1);

console.log(request.params.site);
input = getHourlyXML2(StartTime, EndTime, request.params.site, Element);

getHourly(input).then(TodayXML => {
  var Today_Data = JSON.parse(xmlParser.toJson(TodayXML));
  Today_Data =
    Today_Data["soap:Envelope"]["soap:Body"]["ns2:getHourlyDataResponse"][
      "return"
    ]["values"];

    console.log(event.stageVariables.cors_host);
    
    // TODO implement
    var response2 = {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Origin": event.stageVariables.cors_host,
        "Access-Control-Allow-Methods": "OPTIONS,POST"
    },
    body: JSON.stringify(Today_Data)
  }
  
  callback(null, response2);

});
    };


    function getHourlyXML2(StartTime, EndTime, Stations, Element) {
        //EndTime = EndTime + new Date(1*24*60*60*1000);
        console.log("Element", Element);
        
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
        var XML_Instance = await XML_String;
        //  console.log(XML_Instance);
        const { response } = await soapRequest({
          url: HourlyUrl,
          headers: sampleHeaders,
          xml: XML_Instance
        });
        const { headers, body, statusCode } = response;
        return body;
      }
    