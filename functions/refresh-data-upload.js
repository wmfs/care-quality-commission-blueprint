const xslx = require('xlsx')

const modelPropertyMap = [
  ['uprn', 'Location UPRN ID'],
  ['locationId', 'Location ID'],
  ['locationName', 'Location Name'],
  ['careHome', 'Care home?'],
  ['locationType', 'Location Type/Sector'],
  ['locationPrimaryInspectionCategory', 'Location Primary Inspection Category'],
  ['locationStreetAddress', 'Location Street Address'],
  ['locationAddressLine2', 'Location Address Line 2'],
  ['locationCity', 'Location City'],
  ['locationPostalCode', 'Location Postal Code'],
  ['locationLocalAuthority', 'Location Local Authority'],
  ['locationRegion', 'Location Region'],
  // [ 'locationCcgCode', '' ],
  // [ 'locationCcg', '' ],
  // [ 'service', '' ],
  // [ 'keyQuestion', '' ],
  ['latestRating', 'Location Latest Overall Rating'],
  ['publicationDate', 'Publication Date'],
  // [ 'reportType', '' ],
  // [ 'url', '' ],
  ['providerId', 'Provider ID'],
  ['providerName', 'Provider Name'],
  ['brandId', 'Brand ID'],
  ['brandName', 'Brand Name'],
  ['careHomesBeds', 'Care homes beds'],
  ['locationLatitude', 'Location Latitude'],
  ['locationLongitude', 'Location Longitude']
]

const SHEET_NAME = 'HSCA_Active_Locations'

function processFile ({ serverFilename, clientFilename }) {
  const importLog = {
    serverFilename,
    clientFilename,
    rows: [],
    totalRows: 0
  }

  const uploaded = xslxToJson(serverFilename)
  const sheet = locateSheet(uploaded)

  extractRows(sheet, importLog)
  addUploadStatus(importLog)

  return importLog
} // processFile

function addUploadStatus (log) {
  const { totalRows } = log

  log.uploadGood = ''
  log.uploadWarning = ''
  log.uploadError = ''

  if (totalRows === 0) {
    log.uploadError = '0 rows to be uploaded.'
  } else {
    log.uploadGood = `${totalRows} rows to be uploaded.`
  }
} // addUploadStatus

function extractRows (sheet, importLog) {
  const headerRow = sheet.rows[0]

  const rows = sheet.rows // .filter(row => row.length >= 119)
  rows.shift()

  for (const sourceRow of rows) {
    const row = {}

    for (const [idx, header] of headerRow.entries()) {
      const propMap = modelPropertyMap.find(p => p[1] === header)
      if (propMap) {
        const prop = propMap[0]
        row[prop] = sourceRow[idx]
      }
    }

    importLog.totalRows++
    importLog.rows.push(row)
  }
} // extractRows

function xslxToJson (filepath) {
  const spreadsheet = xslx.readFile(filepath)
  return Object.entries(spreadsheet.Sheets).map(([name, sheet]) => {
    return {
      name,
      rows: xslx.utils.sheet_to_json(sheet, { header: 1, raw: true })
    }
  })
} // xslxToJson

function locateSheet (workbook) {
  const sheet = workbook.filter(sheet => sheet.name === SHEET_NAME)

  if (!sheet.length) {
    throw new Error(`Sheet "${SHEET_NAME}" is missing from the file`)
  }

  return sheet[0]
} // locateSheet

module.exports = function () {
  return async function refreshDataUpload (event) {
    const {
      serverFilename,
      clientFilename
    } = event.body.upload

    try {
      return processFile({ serverFilename, clientFilename })
    } catch (err) {
      return {
        uploadGood: '',
        uploadWarning: '',
        uploadError: `Could not process file upload: ${err.message}`
      }
    }
  }
}
