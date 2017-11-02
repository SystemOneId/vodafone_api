//
// Contains the code that actually makes the request to vf
//

const fs = require('fs');
const path = require('path')
const request = require('request-promise-native');
const _ = require('lodash');


const certFile = path.resolve(__dirname, 'auth/vodafone.crt')
    , keyFile = path.resolve(__dirname, 'auth/vodafone.key')


function callVodafoneAPI(command, optionsbody) {
  return new Promise( function(resolve, reject) {
    // console.log(`Fetching SIM details from Vodafone: ${deviceId}`)
    var options = {
      url: `https://m2mprdapi.vodafone.com:11851/GDSPWebServices/${_.upperFirst(command)}Service`,
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
    ${optionsbody}
  </soap:Body>    
</soap:Envelope>`
     
    request.get(options)
    .then( ( response ) => {
      resolve(response.body);
    });
  });
}

module.exports.callVodafoneAPI = callVodafoneAPI;
