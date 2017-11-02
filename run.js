const program = require('commander');
const fs = require('fs');
const request = require('request-promise-native');
const path = require('path')
const parseString = require('xml2js').parseString;
const {promisify} = require('util');
const _ = require('lodash');

const certFile = path.resolve(__dirname, 'auth/vodafone.crt')
    , keyFile = path.resolve(__dirname, 'auth/vodafone.key')
 

const FAKESIMLIST = true;
const FAKESIMDATA = true;
const FAKESIMLOCATION = true;


//
// FUNCTIONS FOR GETTING DATA ON A SPECIFIC SIM
///

// returns the contents of the canned sim response file
function readSIMFromFile( deviceId ) {
  let xml = fs.readFileSync("./staticdata/onesim.xml","utf8");
  return xml;
}

// returns a Promise that resolves to the info on a SIM from Vodafone server
function retreiveSIMdetails(deviceId) {
  return new Promise( function(resolve, reject) {
    // console.log(`Fetching SIM details from Vodafone: ${deviceId}`)
    var options = {
      url: 'https://m2mprdapi.vodafone.com:11851/GDSPWebServices/GetDeviceDetailsService',
      agentOptions: {
        cert: fs.readFileSync(certFile),
        key: fs.readFileSync(keyFile),
      // Or use `pfx` property replacing `cert` and `key` when using private key, certificate and CA certs in PFX or PKCS12 format:
      // pfx: fs.readFileSync(pfxFilePath),
          passphrase: 'Vodafone1!',
          securityOptions: 'SSL_OP_NO_SSLv3'
      },
      resolveWithFullResponse: true,
    };

    options.body = `<?xml version="1.0" encoding="utf-8"?>
    <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
      <soap:Header>
        <gdspHeader xmlns="http://ws.gdsp.vodafone.com/">
          <gdspCredentials xmlns="">
            <password>XylophoneIsFun!</password>
            <userId>aarontest</userId>
          </gdspCredentials>
        </gdspHeader></soap:Header>
      <soap:Body>
        <getDeviceDetails xmlns="http://ws.gdsp.vodafone.com/">
          <deviceId xmlns="">${deviceId}</deviceId>
        </getDeviceDetails>
      </soap:Body>
    </soap:Envelope>
    `
     
    request.get(options)
    .then( ( response ) => {
      resolve(response.body);
    });
  });
}

// decides whether or not to fetch fake data
async function getDeviceDetails(deviceId) {
  let detailsXML = null;
  if (FAKESIMDATA) {
    detailsXML = readSIMFromFile();
  } else {
    detailsXML = await retreiveSIMdetails(deviceId);
  }
  details = await parseDeviceDetails(detailsXML);
  return details;
}

// returns a Promise to parse the XML from the device details, and resolve with the sessionLastCellId value
function parseDeviceDetails(detailsXML) {

  // played with promisifying the XML parser but gave up quick.
  return new Promise( function(resolve, reject) {
    parseString(detailsXML, function(err, result) {

      if (err) {
        console.warn(err);
      }
      var response = result['SOAP-ENV:Envelope']['SOAP-ENV:Body'][0]['getDeviceDetailsResponse'][0].return[0];
      var infoItems = response.deviceInformationList[0].deviceInformationItem;

      // spin through the items in the sim data and just return the last cell ID
      _.forEach(infoItems, (value) => {
        if (value.itemValue) {
          if (value.itemName == 'sessionLastCellId') {
            resolve({sessionLastCellId: value.itemValue[0]});
          }
        }
      });
      resolve({sessionLastCellId: null});
    });
  });
}

// 
// FUNCTIONS TO LOCATE DEVICE LOCATION
//
// Uses the Unwired Labs database
// 

// decide whether to use real location data, or fake it
// returns either data or a Promise
function getDeviceLocation(cellId) {
  if (FAKESIMLOCATION) {
    return {lat:123, lon:456};
  } else {
    return receiveDeviceLocation(cellId);
  }
}

// fetch a device location using the cellID format returned by Vodafone, which comprises
// the mcc, mnc, lac, and cid. Really!
function receiveDeviceLocation(cellId) {
  return new Promise( function(resolve, reject) {

    cellData = cellId.split("-")

    if (cellData.length < 4) resolve({lat:"undefined",lon:"undefined"});

    var options = {
      url: 'https://us1.unwiredlabs.com/v2/process.php',
    };

    options.body = `{
      "token": "934b808c82a90c",
      "radio": "gsm",
      "mcc": ${cellData[0]},
      "mnc": ${cellData[1]},
      "cells": [{
          "lac": ${cellData[2]},
          "cid": ${cellData[3]}
      }],
      "address": 1
    }`

    request.get(options)
      .then( ( response ) => {
        var place = JSON.parse(response);
        if(place.status=="ok") {
          resolve({lat:place.lat, lon:place.lon});
        } else {
          resolve({lat:"undefined",lon:"undefined"});
        }
      });
 });
}


// 
// FETCHING THE LIST OF SIMS
// 

// returns XML for a list containing a single SIM
function readSingleSIMListFromFile() {
  console.warn("Reading Single SIM from File...");
  let xml = fs.readFileSync("./staticdata/singlesimlist.xml","utf8");
  return(xml);
}

// returns the contents of the canned simlist file
function readSIMListFromFile() {
  console.warn("Reading SIM List from File...");
  let xml = fs.readFileSync("./staticdata/simlist.xml","utf8");
  return(xml);
}

// Pull the SIM list from Vodafone - NOTE - ONLY PULLS 1000 AT A TIME, MAX
// so if you want more, you'll have to call this more than once. One field
// of the return structure tell you how many matches there are total. For
// now I'm combining calls manually by merging XML files.
function retrieveSIMList() {
  return new Promise( function(resolve, reject) {

    console.warn("Grabbing SIM List from Vodafone...");

    var options = {
      url: 'https://m2mprdapi.vodafone.com:11851/GDSPWebServices/GetFilteredDeviceListv4Service',
      agentOptions: {
        cert: fs.readFileSync(certFile),
        key: fs.readFileSync(keyFile),
          passphrase: 'Vodafone1!',
          securityOptions: 'SSL_OP_NO_SSLv3'
      },
      resolveWithFullResponse: true,
    };

    options.body = `<?xml version="1.0" encoding="utf-8"?>
    <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
      <soap:Header>
        <gdspHeader xmlns="http://ws.gdsp.vodafone.com/">
          <gdspCredentials xmlns="">
            <password>XylophoneIsFun!</password>
            <userId>aarontest</userId>
          </gdspCredentials>
        </gdspHeader></soap:Header>
      <soap:Body>
        <getFilteredDeviceListv4 xmlns="http://ws.gdsp.vodafone.com/">
          <pageSize xmlns="">2000</pageSize>
          <pageNumber xmlns="">2</pageNumber>
        </getFilteredDeviceListv4>
      </soap:Body>
    </soap:Envelope>
    `
     
    // request.get(options, function (error, response, body) {
    request.get(options)
    .then( ( response ) => {
      body = response.body;
      resolve(body);
    });
  });

}

// returns a promise resolving to a list of sims parsed from the XML sim list
function parseSIMList( simlist ) {
  return new Promise( function(resolve, reject) {

    console.warn("Parsing list...");

    parseString(simlist, function(err, result) {
      var list = result['SOAP-ENV:Envelope']['SOAP-ENV:Body'][0]['getFilteredDeviceListv4Response'][0].return[0].deviceList[0].device;
      allSIMs = [];
      _.forEach(list, (value) => {
        allSIMs.push({imsi: value.imsi[0], customerServiceProfile: value.customerServiceProfile[0], state: value.state[0]})
      });

      resolve(allSIMs);
    });
  });
}

// returns a Promise that resolves to a list of SIM IDs
async function getSIMList(listOnly) {
  let theListResponse = null;
  
  if (FAKESIMLIST) {
    // theListResponse = readSingleSIMListFromFile();
    theListResponse = readSIMListFromFile();
  } else {
    theListResponse = await retrieveSIMList();
  }

  if (listOnly) {
    console.log(theListResponse);
    return;
  } else {
    let parsedList = await parseSIMList(theListResponse);
    return parsedList;
  }

} 


//
// RERPORTS
//

// returns a Promise that resolves to the list of reports
function getReportList() {
  return new Promise( function(resolve, reject) {
    // console.log(`Fetching SIM details from Vodafone: ${deviceId}`)
    var options = {
      url: 'https://m2mprdapi.vodafone.com:11851/GDSPWebServices/GetReportListService',
      agentOptions: {
        cert: fs.readFileSync(certFile),
        key: fs.readFileSync(keyFile),
      // Or use `pfx` property replacing `cert` and `key` when using private key, certificate and CA certs in PFX or PKCS12 format:
      // pfx: fs.readFileSync(pfxFilePath),
          passphrase: 'Vodafone1!',
          securityOptions: 'SSL_OP_NO_SSLv3'
      },
      resolveWithFullResponse: true,
    };

    options.body = `<?xml version="1.0" encoding="utf-8"?>
    <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
      <soap:Header>
        <gdspHeader xmlns="http://ws.gdsp.vodafone.com/">
          <gdspCredentials xmlns="">
            <password>XylophoneIsFun!</password>
            <userId>aarontest</userId>
          </gdspCredentials>
        </gdspHeader></soap:Header>
      <soap:Body>
        <getReportList xmlns="http://ws.gdsp.vodafone.com/">
        </getReportList>
      </soap:Body>
    </soap:Envelope>
    `
            // <parameter xmlns="http://www.w3.org/2001/XMLSchema/" name="PERIOD_START" value="2017-10-30T00:00:00+00:00"/>
            // <parameter xmlns="http://www.w3.org/2001/XMLSchema/" name="PERIOD_END" value="2017-10-31T00:00:00+00:00"/>


            // <parameter xmlns="http://ws.gdsp.vodafone.com/">
            //   <name xmlns="http://www.w3.org/2001/XMLSchema/">PERIOD_START</name>
            //   <value xmlns="http://www.w3.org/2001/XMLSchema/">2017-10-30T00:00:00+00:00</value>
            // </parameter>
            // <parameter xmlns="http://ws.gdsp.vodafone.com/">
            //   <name xmlns="http://www.w3.org/2001/XMLSchema/">PERIOD_END</name>
            //   <value xmlns="http://www.w3.org/2001/XMLSchema/">2017-10-31T00:00:00+00:00</value>
            // </parameter>
     
    request.get(options)
    .then( ( response ) => {
      resolve(response.body);
    });
  });
}

// returns a Promise that resolves to the list of reports
function getReportDetails(reportName) {
  return new Promise( function(resolve, reject) {
    // console.log(`Fetching SIM details from Vodafone: ${deviceId}`)
    var options = {
      url: 'https://m2mprdapi.vodafone.com:11851/GDSPWebServices/GetReportDetailsService',
      agentOptions: {
        cert: fs.readFileSync(certFile),
        key: fs.readFileSync(keyFile),
      // Or use `pfx` property replacing `cert` and `key` when using private key, certificate and CA certs in PFX or PKCS12 format:
      // pfx: fs.readFileSync(pfxFilePath),
          passphrase: 'Vodafone1!',
          securityOptions: 'SSL_OP_NO_SSLv3'
      },
      resolveWithFullResponse: true,
    };

    options.body = `<?xml version="1.0" encoding="utf-8"?>
    <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
      <soap:Header>
        <gdspHeader xmlns="http://ws.gdsp.vodafone.com/">
          <gdspCredentials xmlns="">
            <password>XylophoneIsFun!</password>
            <userId>aarontest</userId>
          </gdspCredentials>
        </gdspHeader></soap:Header>
      <soap:Body>
        <getReportDetails xmlns="http://ws.gdsp.vodafone.com/">
            <reportName xmlns="">${reportName}</reportName>
        </getReportDetails>
      </soap:Body>
    </soap:Envelope>
    `
            // <parameter xmlns="http://www.w3.org/2001/XMLSchema/" name="PERIOD_START" value="2017-10-30T00:00:00+00:00"/>
            // <parameter xmlns="http://www.w3.org/2001/XMLSchema/" name="PERIOD_END" value="2017-10-31T00:00:00+00:00"/>


            // <parameter xmlns="http://ws.gdsp.vodafone.com/">
            //   <name xmlns="http://www.w3.org/2001/XMLSchema/">PERIOD_START</name>
            //   <value xmlns="http://www.w3.org/2001/XMLSchema/">2017-10-30T00:00:00+00:00</value>
            // </parameter>
            // <parameter xmlns="http://ws.gdsp.vodafone.com/">
            //   <name xmlns="http://www.w3.org/2001/XMLSchema/">PERIOD_END</name>
            //   <value xmlns="http://www.w3.org/2001/XMLSchema/">2017-10-31T00:00:00+00:00</value>
            // </parameter>
     
    request.get(options)
    .then( ( response ) => {
      resolve(response.body);
    });
  });
}


function getReport() {
  return new Promise( function(resolve, reject) {
    // console.log(`Fetching SIM details from Vodafone: ${deviceId}`)
    var options = {
      url: 'https://m2mprdapi.vodafone.com:11851/GDSPWebServices/GetReportService',
      agentOptions: {
        cert: fs.readFileSync(certFile),
        key: fs.readFileSync(keyFile),
      // Or use `pfx` property replacing `cert` and `key` when using private key, certificate and CA certs in PFX or PKCS12 format:
      // pfx: fs.readFileSync(pfxFilePath),
          passphrase: 'Vodafone1!',
          securityOptions: 'SSL_OP_NO_SSLv3'
      },
      resolveWithFullResponse: true,
    };

    options.body = `<?xml version="1.0" encoding="utf-8"?>
    <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
      <soap:Header>
        <gdspHeader xmlns="http://ws.gdsp.vodafone.com/">
          <gdspCredentials xmlns="">
            <password>XylophoneIsFun!</password>
            <userId>aarontest</userId>
          </gdspCredentials>
        </gdspHeader></soap:Header>
      <soap:Body>
        <getReport xmlns="http://ws.gdsp.vodafone.com/">
          <reportName xmlns="">usageByImsi</reportName>
          <reportFormat xmlns="http://www.w3.org/2001/XMLSchema">CSV</reportFormat>
          <reportParameters xmlns="http://ws.gdsp.vodafone.com/">
            <parameter xmlns="http://ws.gdsp.vodafone.com/">
              <name xmlns="http://www.w3.org/2001/XMLSchema/">PERIOD_START</name>
              <value xmlns="http://www.w3.org/2001/XMLSchema/">2017-10-30T00:00:00+00:00</value>
            </parameter>
            <parameter xmlns="http://ws.gdsp.vodafone.com/">
              <name xmlns="http://www.w3.org/2001/XMLSchema/">PERIOD_END</name>
              <value xmlns="http://www.w3.org/2001/XMLSchema/">2017-10-31T00:00:00+00:00</value>
            </parameter>
          </reportParameters>
        </getReport>
      </soap:Body>
    </soap:Envelope>
    `


          // <reportParameters xmlns="">
          //   <parameter xmlns="">
          //     <name xmlns="">PERIOD_START</name>
          //     <value xmlns="">2017-10-30T00:00:00+00:00</value>
          //   </parameter>
          //   <parameter xmlns="">
          //     <name xmlns="">PERIOD_END</name>
          //     <value xmlns="">2017-10-31T00:00:00+00:00</value>
          //   </parameter>
          // </reportParameters>
          
            // <parameter Name="PERIOD_START" Value="2017-10-30T00:00:00+00:00"/>
            // <parameter Name="PERIOD_END" Value="2017-10-31T00:00:00+00:00"/>

          // <reportParameters xmlns="http://ws.gdsp.vodafone.com/">
          //   <parameter xmlns="http://ws.gdsp.vodafone.com/">
          //     <name xmlns="http://www.w3.org/2001/XMLSchema/">PERIOD_START</name>
          //     <value xmlns="http://www.w3.org/2001/XMLSchema/">2017-10-30T00:00:00+00:00</value>
          //   </parameter>
          //   <parameter xmlns="http://ws.gdsp.vodafone.com/">
          //     <name xmlns="http://www.w3.org/2001/XMLSchema/">PERIOD_END</name>
          //     <value xmlns="http://www.w3.org/2001/XMLSchema/">2017-10-31T00:00:00+00:00</value>
          //   </parameter>
          // </reportParameters>



            // <parameter xmlns="http://www.w3.org/2001/XMLSchema/" name="PERIOD_START" value="2017-10-30T00:00:00+00:00"/>
            // <parameter xmlns="http://www.w3.org/2001/XMLSchema/" name="PERIOD_END" value="2017-10-31T00:00:00+00:00"/>


            // <parameter xmlns="http://ws.gdsp.vodafone.com/">
            //   <name xmlns="http://www.w3.org/2001/XMLSchema/">PERIOD_START</name>
            //   <value xmlns="http://www.w3.org/2001/XMLSchema/">2017-10-30T00:00:00+00:00</value>
            // </parameter>
            // <parameter xmlns="http://ws.gdsp.vodafone.com/">
            //   <name xmlns="http://www.w3.org/2001/XMLSchema/">PERIOD_END</name>
            //   <value xmlns="http://www.w3.org/2001/XMLSchema/">2017-10-31T00:00:00+00:00</value>
            // </parameter>
     
    request.get(options)
    .then( ( response ) => {
      resolve(response.body);
    });
  });
}

// 
// MAIN
// 


async function main() {

  // let theReports = await getReportDetails('cspDetailsByCustomer');
  let theReports = await getReport();
  console.log(theReports);
  return;

  // get the list of devices we're working with
  let theList = await getSIMList(program.list);

  // all we want is the list, we're done.
  if (program.list) {
    return;
  }

  // figure out how many & which devices to get
  let start = program.start || 0;
  let num = program.num || theList.length;
  let end = Math.min(start+num, theList.length-start);

  console.warn("starting at "+start);

  let active = 0;
  let found = 0;

  // if we use _.each here, things execute out of order due to the wonders of async programming.
  for (let i=start; i<end; i=i+1 ) {
    console.warn(`${i} -> ${end}`)
    let s = theList[i];
    if (s.state == 'A') {
      active = active + 1;
      let dd = await getDeviceDetails(s.imsi);
      s.sessionLastCellId = dd.sessionLastCellId;
      if (dd.sessionLastCellId) {
        let loc = await getDeviceLocation(s.sessionLastCellId)
        s.lat = loc.lat;
        s.lon = loc.lon;
        found = found + 1;
      }
    } else {
      s.lat = s.lon = "inactive";
    }
    console.log(`${s.imsi},${s.state},${s.customerServiceProfile},${s.sessionLastCellId},${s.lat},${s.lon}`)
  }

  console.warn(`${active} active, ${found} found`);

  return;
}

program
  .version('0.1.0')
  .option('-n, --num <n>', 'Max number to grab', parseInt)
  .option('-s, --start <n>', 'Starting number', parseInt)
  .option('-l --list','Only get the SIM list XML')
  .description('run')
  .parse(process.argv);

main();

