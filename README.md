# vodafone_api
Code for getting data out of the vodafone API.

### New Development Setup
```bash
# Clone the repository
git clone git@github.com:SystemOneId/vodafone_api
cd vodafone_api

# Install dependencies
npm install

# Run it
node run.js > out.csv
```
### Configuration
At top of run.js are constants that define:
* whether to pull the device list from a static file
* whether to pull device data from a static file (in which case all devices have the same data)
* whether to fake device location data (in which case all devices have the same location data)

I suggest faking as much as possible while testing. The API calls to Unwired Labs are limited to 5000/month (on their free tier).

### Output
Output is XML response from server, and goes to stdout. Status messages on stderr.

### Options
-V, --version    output the version number
-n, --num <n>    Max number of devices to grab
-s, --start <n>  Starting number
-l --list        Only get the SIM list XML
-h, --help       output usage information
