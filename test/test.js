/* eslint-env mocha */

'use strict'

const chai = require('chai')
const expect = chai.expect
const path = require('path')
const tymly = require('@wmfs/tymly')
const process = require('process')
const sqlScriptRunner = require('./fixtures/sql-script-runner.js')
const refreshDataUpload = require('../functions/refresh-data-upload')()
const refreshDataImport = require('../functions/refresh-data-import')()

describe('CQC tests', function () {
  this.timeout(process.env.TIMEOUT || 5000)

  const STATE_MACHINE_NAME = 'cqc_refreshFromCsvFile_1_0'

  let bootedServices, tymlyService, statebox, client, cqcModel

  before(function () {
    if (process.env.PG_CONNECTION_STRING && !/^postgres:\/\/[^:]+:[^@]+@(?:localhost|127\.0\.0\.1).*$/.test(process.env.PG_CONNECTION_STRING)) {
      console.log(`Skipping tests due to unsafe PG_CONNECTION_STRING value (${process.env.PG_CONNECTION_STRING})`)
      this.skip()
    }
  })

  it('startup tymly', async () => {
    const tymlyServices = await tymly.boot(
      {
        pluginPaths: [
          require.resolve('@wmfs/tymly-test-helpers/plugins/mock-solr-plugin'),
          require.resolve('@wmfs/tymly-test-helpers/plugins/mock-rest-client-plugin'),
          require.resolve('@wmfs/tymly-test-helpers/plugins/mock-os-places-plugin'),
          require.resolve('@wmfs/tymly-test-helpers/plugins/allow-everything-rbac-plugin'),
          require.resolve('@wmfs/tymly-cardscript-plugin'),
          require.resolve('@wmfs/tymly-pg-plugin')
        ],
        blueprintPaths: [
          path.resolve(__dirname, './../')
        ],
        config: {}
      }
    )

    bootedServices = tymlyServices
    tymlyService = tymlyServices.tymly
    statebox = tymlyServices.statebox
    client = tymlyServices.storage.client
    cqcModel = tymlyServices.storage.models.cqc_cqc
  })

  it('execute importingCsvFiles', async () => {
    const executionDescription = await statebox.startExecution(
      {
        sourceDir: path.resolve(__dirname, './fixtures/input')
      },
      STATE_MACHINE_NAME,
      {
        sendResponse: 'COMPLETE'
      }
    )

    expect(executionDescription.status).to.eql('SUCCEEDED')
    expect(executionDescription.currentStateName).to.equal('ImportingCsvFiles')
  })

  it('verify data in table', async () => {
    const res = await cqcModel.find({})
    expect(res.length).to.eql(5)
  })

  it('import spreadsheet', async () => {
    const TOTAL_ROWS = 13

    const event = {
      body: {
        upload: {
          serverFilename: path.join(__dirname, 'fixtures', 'example.ods'),
          clientFilename: path.join(__dirname, 'fixtures', 'example.ods')
        }
      },
      importDirectory: path.join(__dirname, 'fixtures', 'output')
    }

    const res = await refreshDataUpload(event)
    console.log(res)
    expect(res.totalRows).to.eql(TOTAL_ROWS)

    await refreshDataImport(res, { bootedServices }, {})

    const rows = await cqcModel.find({})
    expect(rows.length).to.eql(TOTAL_ROWS)
  })

  after('clean up the tables', async () => {
    await sqlScriptRunner('./db-scripts/cleanup.sql', client)
  })

  after('shutdown Tymly', async () => {
    await tymlyService.shutdown()
  })
})
