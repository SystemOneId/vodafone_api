const program = require('commander');
const fs = require('fs');
const request = require('request-promise-native');
const path = require('path')
const parseString = require('xml2js').parseString;
const {promisify} = require('util');
const _ = require('lodash');

const certFile = path.resolve(__dirname, 'ssl/vodafone.crt')
    , keyFile = path.resolve(__dirname, 'ssl/vodafone.key')
 

const FAKESIMLIST = true
const FAKESIMDATA = true
const FAKESIMLOCATION = true


// returns a promise resolving to the contents of the canned sim response file
function readSIMFromFile( deviceId ) {
  let xml = fs.readFileSync("./staticdata/onesim.xml","utf8");
  return xml;
}

// fetches the info on a SIM from Vodafone
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
     
    // request.get(options, function (error, response, body) {
    request.get(options)
    .then( ( response ) => {
      resolve(response.body);
    });
  });
}

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

  return new Promise( function(resolve, reject) {
    parseString(detailsXML, function(err, result) {

      if (err) {
        console.warn(err);
      }
      var response = result['SOAP-ENV:Envelope']['SOAP-ENV:Body'][0]['getDeviceDetailsResponse'][0].return[0];
      var infoItems = response.deviceInformationList[0].deviceInformationItem;

      // console.dir(infoItems);
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

// getDeviceDetails(204043253111386);
// getDeviceDetails(program.id);


// 
//  DEVICE LOCATION
// 

function getDeviceLocation(cellId) {

  if (FAKESIMLOCATION) {
    return {lat:123, lon:456};
  } else {
    return receiveDeviceLocation(cellId);
  }
}

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


// pull the SIM list from Vodafone - NOTE - ONLY PULLS 1000 AT A TIME
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

// returns a Promise that resolves to a list of SIM ID
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
// MAIN
// 


async function main() {


  let theList = await getSIMList(program.list);
  if (program.list) {
    return;
  }


  let max = Math.min(program.max || theList.length);
  let start = program.start || 0;
  console.warn("starting at "+start);

  const OFFSET = program.offset || 0;
  start = start + OFFSET;
  max = max + OFFSET;

  let active = 0;
  let found = 0;

  // if I use _.each here, things execute out of order.
  for (let i=start; i<max; i=i+1 ) {
    console.warn(`${i} of ${max}`)
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

  // _.each(theList, function(d) {
  //   console.log(`${d.imsi},${d.customerServiceProfile},${d.sessionLastCellId},${d.lat},${d.lon}`)
  // })
  return;
}

program
  .version('0.1.0')
  .option('-m, --max <n>', 'Max number to grab', parseInt)
  .option('-s, --start <n>', 'Starting number', parseInt)
  .option('-o --offset <n>', 'Offset', parseInt)
  .option('-l --list','Only get the SIM list XML')
  .description('run')
  .parse(process.argv);


  // .option('-i, --id [id]', 'Add the specified number of results', parseInt)

main();

